import { CONCEPTS } from '@tutor/curriculum';
import {
  type DecideOutput,
  EMPTY_ANSWER,
  type Evaluation,
  type Grade,
  type TutorState,
  decide,
  openConcept,
  pickStrategy,
} from '@tutor/shared';
import { describe, expect, it } from 'vitest';

const concept = CONCEPTS[0]!;
const nextConcept = CONCEPTS[1] ?? null;

const said = (patch: Partial<Evaluation> = {}): Evaluation => ({
  intent: 'answer',
  answer: { ...EMPTY_ANSWER, boolean: true },
  showedReasoning: true,
  reasoningSound: true,
  misconception: null,
  confidence: 0.95,
  ...patch,
});

const step = (state: TutorState, evaluation: Evaluation, grade: Grade | null): DecideOutput =>
  decide({ concept, nextConcept, state, evaluation, grade });

/** Plays a list of [evaluation, grade] turns from the start of the concept. */
function play(turns: [Evaluation, Grade | null][]): DecideOutput[] {
  let state = openConcept(concept).state;
  return turns.map(([evaluation, grade]) => {
    const out = step(state, evaluation, grade);
    state = out.state;
    return out;
  });
}

describe('moving on', () => {
  it('needs two correct checks, and asks a different question for the second', () => {
    const [first, second] = play([[said(), 'correct'], [said(), 'correct']]);
    expect(first!.decision.action).toBe('next_check');
    expect(first!.decision.itemId).not.toBe(concept.items[0]!.id);
    expect(first!.conceptClosed).toBeNull();
    expect(second!.conceptClosed).toBe('mastered');
    expect(second!.decision.reasonCode).toBe('mastery_reached');
  });

  it('probes a bare correct answer before granting mastery', () => {
    const bare = said({ showedReasoning: false, reasoningSound: null });
    const [, second, third] = play([[said(), 'correct'], [bare, 'correct'], [said(), null]]);
    expect(second!.decision.action).toBe('probe');
    expect(second!.conceptClosed).toBeNull();
    expect(third!.conceptClosed).toBe('mastered');
  });

  it('re-teaches when the probe shows the answer was not understood', () => {
    const bare = said({ showedReasoning: false, reasoningSound: null });
    const [, , third] = play([[said(), 'correct'], [bare, 'correct'], [said({ reasoningSound: false }), null]]);
    expect(third!.decision.action).toBe('reteach');
    expect(third!.decision.reasonCode).toBe('answer_not_supported');
  });

  it('does not accept a right answer reached by a wrong method', () => {
    const [out] = play([[said({ reasoningSound: false }), 'correct']]);
    expect(out!.decision.action).toBe('reteach');
    expect(out!.decision.reasonCode).toBe('right_answer_wrong_method');
  });
});

describe('re-teaching', () => {
  it('uses a different strategy and a different question each time, then scaffolds, then parks the concept', () => {
    const outs = play([[said(), 'wrong'], [said(), 'wrong'], [said(), 'wrong']]);
    expect(outs.map((o) => o.decision.action)).toEqual(['reteach', 'scaffold', nextConcept ? 'needs_review' : 'finish']);

    const strategies = [concept.strategies[0]!.id, outs[0]!.decision.strategyId, outs[1]!.decision.strategyId];
    expect(new Set(strategies).size).toBe(3);
    const items = [concept.items[0]!.id, outs[0]!.decision.itemId, outs[1]!.decision.itemId];
    expect(new Set(items).size).toBe(3);
    expect(outs[2]!.conceptClosed).toBe('needs_review');
  });

  it('picks the strategy mapped to the misconception when it has not been used', () => {
    const [id, m] = Object.entries(concept.misconceptions).find(([, v]) => v.strategy && v.strategy !== concept.strategies[0]!.id)!;
    const [out] = play([[said({ misconception: id }), 'wrong']]);
    expect(out!.decision.strategyId).toBe(m.strategy);
    expect(out!.decision.evidence.misconception).toBe(id);
    expect(out!.decision.reason).toContain(m.label);
  });

  it('never repeats a strategy while an unused one remains', () => {
    const used = [concept.strategies[0]!.id];
    const mappedToUsed = Object.entries(concept.misconceptions).find(([, v]) => v.strategy === used[0])?.[0] ?? null;
    expect(pickStrategy(concept, used, mappedToUsed).id).not.toBe(used[0]);
  });

  it('resets the run of correct answers after a miss', () => {
    const outs = play([[said(), 'correct'], [said(), 'wrong'], [said(), 'correct']]);
    expect(outs[2]!.decision.action).toBe('next_check');
    expect(outs[2]!.conceptClosed).toBeNull();
  });

  it('treats one of two roots as a miss, with its own reason', () => {
    const [out] = play([[said(), 'partial']]);
    expect(out!.decision.action).toBe('reteach');
    expect(out!.decision.reasonCode).toBe('partially_correct');
  });

  it('returns to a full question after a scaffold question is answered', () => {
    const outs = play([[said(), 'wrong'], [said(), 'wrong'], [said(), 'correct']]);
    expect(outs[2]!.decision.reasonCode).toBe('scaffold_passed');
    expect(concept.items.some((i) => i.id === outs[2]!.decision.itemId)).toBe(true);
  });
});

describe('turns that must not change progress', () => {
  const start = openConcept(concept).state;
  const unchanged = (out: DecideOutput) => {
    expect(out.attempted).toBe(false);
    expect(out.conceptClosed).toBeNull();
    expect(out.state).toMatchObject({ itemId: start.itemId, correct: 0, wrong: 0, strategiesUsed: start.strategiesUsed });
  };

  it.each(['off_topic', 'skip', 'repeat', 'why'] as const)('%s', (intent) => {
    unchanged(step(start, said({ intent, answer: EMPTY_ANSWER }), null));
  });

  it('confirms a low-confidence answer instead of grading it, even if it would be wrong', () => {
    const out = step(start, said({ confidence: 0.4 }), 'wrong');
    expect(out.decision.action).toBe('confirm');
    expect(out.state.pending).toEqual({ ...EMPTY_ANSWER, boolean: true });
    unchanged(out);
  });

  it('asks again when no answer could be extracted', () => {
    const out = step(start, said({ answer: EMPTY_ANSWER }), 'ungradable');
    expect(out.decision.action).toBe('reprompt');
    unchanged(out);
  });

  it('stops asking after two unclear replies and gives a hint', () => {
    const outs = play([
      [said({ answer: EMPTY_ANSWER }), 'ungradable'],
      [said({ answer: EMPTY_ANSWER }), 'ungradable'],
      [said({ answer: EMPTY_ANSWER }), 'ungradable'],
    ]);
    expect(outs.map((o) => o.decision.action)).toEqual(['reprompt', 'reprompt', 'hint']);
  });
});

describe('hints', () => {
  it('gives hints instead of the answer, and counts a miss only when the hints run out', () => {
    const ask = said({ intent: 'give_answer', answer: EMPTY_ANSWER });
    const turns = concept.items[0]!.hints.map(() => [ask, null] as [Evaluation, Grade | null]);
    const outs = play([...turns, [ask, null]]);
    expect(outs.slice(0, -1).every((o) => o.decision.action === 'hint' && !o.attempted)).toBe(true);
    expect(outs.at(-1)!.decision.action).toBe('reteach');
    expect(outs.at(-1)!.decision.reasonCode).toBe('no_answer_after_hints');
  });
});

describe('explanations', () => {
  it('every decision carries a reason, and outcome decisions carry the evidence and a counterfactual', () => {
    const outs = play([[said(), 'correct'], [said(), 'wrong'], [said(), 'wrong'], [said(), 'wrong']]);
    for (const { decision } of outs) {
      expect(decision.reason.length).toBeGreaterThan(20);
      expect(decision.counterfactual).toBeTruthy();
      expect(decision.evidence.gradedItemId).toBeTruthy();
      expect(decision.policyVersion).toBeTruthy();
    }
    expect(outs[1]!.decision.reason).toContain(concept.items[1]!.expected);
  });
});
