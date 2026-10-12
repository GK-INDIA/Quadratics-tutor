import type {
  Action,
  Concept,
  ConceptStatus,
  Decision,
  Evaluation,
  ExtractedAnswer,
  Grade,
  Item,
  Strategy,
  TutorState,
} from './schemas';

/**
 * The teaching policy. Pure functions, no I/O, no LLM.
 *
 * The LLM tells us what the student said (Evaluation); the grader tells us
 * whether it is right (Grade). Everything about what happens next is decided
 * here, and every decision carries the evidence it was made on.
 */

export const POLICY_VERSION = 'policy-v1';

/** Correct checks in a row needed to call a concept mastered. */
export const MASTERY_CORRECT = 2;
/** Below this, the tutor confirms what it heard instead of grading it. */
export const LOW_CONFIDENCE = 0.6;
/** Failed attempts before a concept is parked as needs_review. */
export const MAX_WRONG = 3;

export interface DecideInput {
  concept: Concept;
  /** The concept that follows this one for this student, or null if this is the last. */
  nextConcept: Concept | null;
  state: TutorState;
  evaluation: Evaluation;
  /** Grade of evaluation.answer against the current item. Null when there is no item to grade (probe phase). */
  grade: Grade | null;
}

export interface DecideOutput {
  decision: Decision;
  state: TutorState;
  /** True when this turn counts as an attempt at the current item. */
  attempted: boolean;
  /** Set when the turn closes the current concept. */
  conceptClosed: Extract<ConceptStatus, 'mastered' | 'needs_review'> | null;
}

export function findItem(concept: Concept, itemId: string | null): Item | null {
  if (!itemId) return null;
  return [...concept.items, ...concept.scaffold.items].find((i) => i.id === itemId) ?? null;
}

export function findStrategy(concept: Concept, strategyId: string | null): Strategy | null {
  if (!strategyId) return null;
  if (concept.scaffold.strategy.id === strategyId) return concept.scaffold.strategy;
  return concept.strategies.find((s) => s.id === strategyId) ?? null;
}

/** Prefer the strategy mapped to the misconception; never one already used while an unused one exists. */
export function pickStrategy(concept: Concept, used: string[], misconception: string | null): Strategy {
  const unused = concept.strategies.filter((s) => !used.includes(s.id));
  const preferredId = misconception ? concept.misconceptions[misconception]?.strategy : undefined;
  const preferred = unused.find((s) => s.id === preferredId);
  // All used can only happen on a revisit in a later session; cycle rather than fail.
  return preferred ?? unused[0] ?? concept.strategies[used.length % concept.strategies.length]!;
}

function pickItem(pool: Item[], used: string[]): Item {
  return pool.find((i) => !used.includes(i.id)) ?? pool[used.length % pool.length]!;
}

function initialState(concept: Concept, boardIds: string[]): TutorState {
  const strategy = concept.strategies[0]!;
  const item = concept.items[0]!;
  return {
    conceptId: concept.id,
    phase: 'check',
    itemId: item.id,
    usedItemIds: [item.id],
    strategiesUsed: [strategy.id],
    correct: 0,
    wrong: 0,
    hints: 0,
    confirms: 0,
    probed: false,
    scaffolding: false,
    pending: null,
    boardIds,
  };
}

/** First turn of a concept: teach with the first strategy, then ask the first check. */
export function openConcept(concept: Concept, boardIds: string[] = []): { decision: Decision; state: TutorState } {
  const state = initialState(concept, boardIds);
  return {
    state,
    decision: {
      action: 'teach',
      reasonCode: 'concept_start',
      reason: `We're starting "${concept.title}". I explain the idea first, then ask a question to check it has landed.`,
      counterfactual: null,
      conceptId: concept.id,
      nextConceptId: null,
      strategyId: state.strategiesUsed[0]!,
      itemId: state.itemId,
      evidence: { gradedItemId: null, expected: null, grade: null, misconception: null, correct: 0, wrong: 0 },
      policyVersion: POLICY_VERSION,
    },
  };
}

/**
 * A turn the tutor could not act on (nothing heard, or the tutor itself failed).
 * Progress is untouched and the same question stays open.
 */
export function holdTurn(concept: Concept, state: TutorState, reasonCode: string, reason: string): DecideOutput {
  return {
    decision: {
      action: 'reprompt',
      reasonCode,
      reason,
      counterfactual: null,
      conceptId: concept.id,
      nextConceptId: null,
      strategyId: null,
      itemId: state.itemId,
      evidence: { gradedItemId: null, expected: null, grade: null, misconception: null, correct: state.correct, wrong: state.wrong },
      policyVersion: POLICY_VERSION,
    },
    state,
    attempted: false,
    conceptClosed: null,
  };
}

export function hasAnswer(a: ExtractedAnswer): boolean {
  return a.boolean !== null || a.choice !== null || a.coefficients !== null || (a.numbers?.length ?? 0) > 0;
}

export function decide(input: DecideInput): DecideOutput {
  const { concept, nextConcept, state, evaluation, grade } = input;
  const item = findItem(concept, state.itemId);
  const misconception =
    evaluation.misconception && concept.misconceptions[evaluation.misconception] ? evaluation.misconception : null;

  const base = (action: Action, reasonCode: string, reason: string, counterfactual: string | null, s: TutorState) => ({
    action,
    reasonCode,
    reason,
    counterfactual,
    conceptId: concept.id,
    nextConceptId: null,
    strategyId: null,
    itemId: s.itemId,
    evidence: {
      gradedItemId: null,
      expected: null,
      grade: null,
      misconception: null,
      correct: s.correct,
      wrong: s.wrong,
    },
    policyVersion: POLICY_VERSION,
  }) satisfies Decision;

  /** Turns that change nothing about progress: the same question is still open afterwards. */
  const hold = (action: Action, reasonCode: string, reason: string, patch: Partial<TutorState> = {}): DecideOutput => {
    const s = { ...state, ...patch };
    return { decision: base(action, reasonCode, reason, null, s), state: s, attempted: false, conceptClosed: null };
  };

  if (state.phase === 'done') {
    return hold('finish', 'all_concepts_done', 'We have been through all six topics, so there is nothing left to check today.');
  }

  switch (evaluation.intent) {
    case 'repeat':
      return hold('repeat', 'asked_to_repeat', 'You asked me to say it again, so I repeated it. Nothing about your progress changed.');
    case 'why':
      return hold('explain_why', 'asked_why', 'You asked why I made my last decision, so I explained it.');
    case 'off_topic':
      return hold(
        'redirect',
        'off_topic',
        `That wasn't about "${concept.title}", so I brought us back to the question. Nothing about your progress changed.`,
      );
    case 'skip':
      return hold(
        'redirect',
        'skip_requested',
        `You asked to skip ahead. I only move on once the check questions are answered, so getting them right is the quickest way through "${concept.title}".`,
      );
    case 'dont_know':
    case 'give_answer':
      if (state.phase === 'probe') return fail('answer_not_supported');
      if (item && state.hints < item.hints.length) {
        const why =
          evaluation.intent === 'give_answer'
            ? 'You asked for the answer. Working it out is what makes it stick, so I gave a hint instead.'
            : "You said you weren't sure, so I gave a hint rather than the answer.";
        return hold('hint', evaluation.intent === 'give_answer' ? 'answer_requested' : 'student_unsure', why, {
          hints: state.hints + 1,
        });
      }
      return fail('no_answer_after_hints');
    case 'answer':
      break;
  }

  if (state.phase === 'probe') {
    if (evaluation.showedReasoning && evaluation.reasoningSound === true) return succeed();
    return fail('answer_not_supported');
  }

  // Not sure what was said: confirm once, then ask again, then fall back to a hint. Never grade a guess at the transcript.
  const unclear = grade === 'ungradable' || grade === null || evaluation.confidence < LOW_CONFIDENCE;
  if (unclear) {
    if (state.confirms >= 2) {
      if (item && state.hints < item.hints.length) {
        return hold('hint', 'still_unclear', "I couldn't make out an answer twice, so I gave a hint and asked again.", {
          hints: state.hints + 1,
          confirms: 0,
          pending: null,
        });
      }
      return fail('no_answer_after_hints');
    }
    if (grade !== 'ungradable' && grade !== null && hasAnswer(evaluation.answer)) {
      return hold('confirm', 'low_confidence', "I wasn't sure I heard your answer correctly, so I checked before marking it.", {
        confirms: state.confirms + 1,
        pending: evaluation.answer,
      });
    }
    return hold('reprompt', 'unclear_answer', "I couldn't find an answer to the question in what I heard, so I asked again.", {
      confirms: state.confirms + 1,
      pending: null,
    });
  }

  if (grade === 'correct') {
    if (evaluation.showedReasoning && evaluation.reasoningSound === false) return fail('right_answer_wrong_method');
    const wouldMaster = state.correct + 1 >= MASTERY_CORRECT;
    if (wouldMaster && !evaluation.showedReasoning && !state.probed) {
      const s: TutorState = { ...state, phase: 'probe', probed: true, confirms: 0, pending: null };
      const d = base(
        'probe',
        'correct_without_reasoning',
        "Your answer is right, but you didn't say how you got it. I'm asking for your reasoning so I know it wasn't a lucky guess.",
        "If you'd explained your steps, we'd have moved straight on.",
        s,
      );
      return {
        decision: { ...d, itemId: null, evidence: { ...d.evidence, gradedItemId: item?.id ?? null, expected: item?.expected ?? null, grade } },
        state: s,
        attempted: true,
        conceptClosed: null,
      };
    }
    return succeed();
  }

  return fail(grade === 'partial' ? 'partially_correct' : 'wrong_answer');

  // ---- outcomes ----

  function succeed(): DecideOutput {
    const correct = state.correct + 1;
    const evidence = {
      gradedItemId: item?.id ?? null,
      expected: item?.expected ?? null,
      grade: 'correct' as Grade,
      misconception: null,
      correct,
      wrong: state.wrong,
    };

    if (correct >= MASTERY_CORRECT) {
      return close('mastered', 'mastery_reached', evidence);
    }

    const next = pickItem(concept.items, state.usedItemIds);
    const s: TutorState = {
      ...state,
      phase: 'check',
      itemId: next.id,
      usedItemIds: [...state.usedItemIds, next.id],
      correct,
      hints: 0,
      confirms: 0,
      pending: null,
      scaffolding: false,
    };
    const d = base(
      'next_check',
      state.scaffolding ? 'scaffold_passed' : 'first_check_correct',
      state.scaffolding
        ? 'You got the simpler question right, so I am going back to a full question to see if it holds.'
        : `That's correct (${item?.expected ?? 'right answer'}). One right answer could be luck, so I'm asking a second question of a different kind before we move on.`,
      "If that had been wrong, I'd have explained the idea a different way.",
      s,
    );
    return { decision: { ...d, evidence }, state: s, attempted: true, conceptClosed: null };
  }

  function fail(reasonCode: string): DecideOutput {
    const wrong = state.wrong + 1;
    const evidence = {
      gradedItemId: item?.id ?? null,
      expected: item?.expected ?? null,
      grade: (grade === 'partial' ? 'partial' : grade === 'correct' ? 'correct' : 'wrong') as Grade,
      misconception,
      correct: 0,
      wrong,
    };
    const what = describeFailure(reasonCode, item, misconception ? concept.misconceptions[misconception]!.label : null);

    if (wrong >= MAX_WRONG) return close('needs_review', 'max_attempts', evidence, what);

    if (wrong === MAX_WRONG - 1) {
      const strategy = concept.scaffold.strategy;
      const next = pickItem(concept.scaffold.items, state.usedItemIds);
      const s = after(strategy, next, wrong, true);
      const d = base(
        'scaffold',
        reasonCode,
        `${what} That's the second miss on "${concept.title}", so I'm breaking it into smaller steps and asking a simpler question.`,
        "If you'd got it right, we'd have carried on with the normal check questions.",
        s,
      );
      return { decision: { ...d, strategyId: strategy.id, evidence }, state: s, attempted: true, conceptClosed: null };
    }

    const strategy = pickStrategy(concept, state.strategiesUsed, misconception);
    const next = pickItem(concept.items, state.usedItemIds);
    const s = after(strategy, next, wrong, false);
    const d = base(
      'reteach',
      reasonCode,
      `${what} So I'm explaining "${concept.title}" a different way (${strategy.label}) and then checking with a new question.`,
      state.correct + 1 >= MASTERY_CORRECT
        ? "If you'd got it right, we'd have moved to the next topic."
        : "If you'd got it right, I'd have asked one more check question and then moved on.",
      s,
    );
    return { decision: { ...d, strategyId: strategy.id, evidence }, state: s, attempted: true, conceptClosed: null };
  }

  function after(strategy: Strategy, next: Item, wrong: number, scaffolding: boolean): TutorState {
    return {
      ...state,
      phase: 'check',
      itemId: next.id,
      usedItemIds: [...state.usedItemIds, next.id],
      strategiesUsed: [...state.strategiesUsed, strategy.id],
      correct: 0, // mastery means correct checks in a row after the last re-teach
      wrong,
      hints: 0,
      confirms: 0,
      pending: null,
      scaffolding,
    };
  }

  function close(
    status: 'mastered' | 'needs_review',
    reasonCode: string,
    evidence: Decision['evidence'],
    what = '',
  ): DecideOutput {
    const opened = nextConcept ? openConcept(nextConcept, state.boardIds) : null;
    const s: TutorState = opened?.state ?? { ...state, phase: 'done', itemId: null, pending: null };
    const onward = nextConcept ? `moving to "${nextConcept.title}"` : 'wrapping up, since that was the last topic';
    const reason =
      status === 'mastered'
        ? `You answered ${MASTERY_CORRECT} check questions in a row correctly on "${concept.title}", so I'm treating it as understood and ${onward}.`
        : `${what} That's ${MAX_WRONG} misses on "${concept.title}" even after ${state.strategiesUsed.length} different explanations. Rather than keep you stuck, I've marked it to revisit next session and I'm ${onward}.`;
    const counterfactual =
      status === 'mastered'
        ? "If you'd slipped on that last question, I'd have re-taught it another way first."
        : "If you'd got that one right, we'd have stayed on this topic for one more check.";
    return {
      decision: {
        action: nextConcept ? (status === 'mastered' ? 'move_on' : 'needs_review') : 'finish',
        reasonCode,
        reason,
        counterfactual,
        conceptId: concept.id,
        nextConceptId: nextConcept?.id ?? null,
        strategyId: opened?.decision.strategyId ?? null,
        itemId: opened?.decision.itemId ?? null,
        evidence,
        policyVersion: POLICY_VERSION,
      },
      state: s,
      attempted: true,
      conceptClosed: status,
    };
  }
}

function describeFailure(reasonCode: string, item: Item | null, misconceptionLabel: string | null): string {
  const expected = item ? ` The answer is ${item.expected}.` : '';
  const looksLike = misconceptionLabel ? ` It looks like ${misconceptionLabel}.` : '';
  switch (reasonCode) {
    case 'partially_correct':
      return `Your answer was only partly right.${expected}${looksLike}`;
    case 'answer_not_supported':
      return "Your answer was right, but the explanation didn't show how to get it, so I can't tell yet whether the idea has landed.";
    case 'right_answer_wrong_method':
      return `You reached the right answer, but the method you described wouldn't work in general.${looksLike}`;
    case 'no_answer_after_hints':
      return `You weren't able to answer even with hints.${expected}`;
    default:
      return `Your last answer wasn't right.${expected}${looksLike}`;
  }
}
