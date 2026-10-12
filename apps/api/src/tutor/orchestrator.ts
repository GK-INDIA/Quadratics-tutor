import { CONCEPTS, CURRICULUM_VERSION, getConcept } from '@tutor/curriculum';
import {
  type Concept,
  type ConceptProgress,
  type DecideOutput,
  type Decision,
  type Evaluation,
  type Grade,
  type Item,
  POLICY_VERSION,
  type Segment,
  type TurnEvent,
  type TutorState,
  applyToIds,
  decide,
  findItem,
  findStrategy,
  grade as gradeAnswer,
  holdTurn,
  openConcept,
} from '@tutor/shared';
import { Trace, logEvent } from '../observability/trace';
import type { TTS } from '../providers/speech';
import type { Repo, StoredTurn } from '../store/repo';
import { type LlmDeps, failureLabel } from './calls';
import { PROBE_QUESTION, describeAnswer, evaluateWithLlm } from './evaluate';
import { type GenerateMode, generateWithLlm, scriptedFeedback } from './generate';
import { heuristicEvaluate } from './heuristic';

export interface TutorDeps extends LlmDeps {
  repo: Repo;
  tts: TTS;
}

/** server: synthesise audio here. browser: the client speaks the text itself. none: text only (evals, simulations). */
export type Voice = 'server' | 'browser' | 'none';
export type Emit = (event: TurnEvent) => void;

export interface TurnInput {
  sessionId: string;
  /** Chosen by the client. Re-sending the same id replays the stored turn instead of running it twice. */
  turnId: string;
  transcript: string;
  sttConfidence?: number;
  voice: Voice;
}

export class NotFoundError extends Error {}

/** Decisions that say something about the student, as opposed to housekeeping turns. */
const SUBSTANTIVE = new Set(['teach', 'next_check', 'probe', 'move_on', 'reteach', 'scaffold', 'needs_review', 'finish']);
const MAX_TRANSCRIPT_CHARS = 1000;

const conceptIds = () => CONCEPTS.map((c) => c.id);

/** The next concept this student still has to get through, after `afterOrder`. */
function nextOpenConcept(progress: ConceptProgress[], afterOrder: number): Concept | null {
  return CONCEPTS.find((c) => c.order > afterOrder && progress.find((p) => p.conceptId === c.id)?.status !== 'mastered') ?? null;
}

export function createTutor(deps: TutorDeps) {
  const { repo } = deps;
  const queues = new Map<string, Promise<unknown>>();

  /** Runs turns of one session strictly one after another (double taps, two tabs). */
  function serial<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const run = (queues.get(sessionId) ?? Promise.resolve()).then(fn, fn);
    const settled = run.catch(() => undefined);
    queues.set(sessionId, settled);
    void settled.then(() => queues.get(sessionId) === settled && queues.delete(sessionId));
    return run;
  }

  /**
   * Sends segments to the client in order. With server voice, synthesis for
   * every segment starts as soon as the segment exists, so audio for sentence
   * two is usually ready before sentence one has finished playing.
   */
  function createSpeaker(emit: Emit, voice: Voice, trace: Trace, startIds: string[]) {
    const segments: Segment[] = [];
    let boardIds = startIds;
    let chain: Promise<void> = Promise.resolve();
    return {
      get boardIds() {
        return boardIds;
      },
      push(segment: Segment) {
        const index = segments.length;
        segments.push(segment);
        boardIds = applyToIds(boardIds, segment.board).ids;
        const audio =
          voice === 'server'
            ? deps.tts.speak(segment.say).catch((err) => {
                trace.degrade(failureLabel('tts', err)); // the client falls back to its own speech synthesis
                logEvent('tts_failed', { message: (err as Error).message, chars: segment.say.length });
                return undefined;
              })
            : Promise.resolve(undefined);
        chain = chain.then(async () => {
          const data = await audio;
          trace.mark('first_emit_ms');
          emit({ type: 'segment', index, segment, ...(data ? { audio: data } : {}) });
        });
      },
      say(text: string) {
        this.push({ say: text, board: [] });
      },
      async finish(): Promise<Segment[]> {
        await chain;
        return segments;
      },
    };
  }

  function lastSubstantiveDecision(sessionId: string): Decision | null {
    const turns = repo.listTurns(sessionId);
    for (let i = turns.length - 1; i >= 0; i--) if (SUBSTANTIVE.has(turns[i]!.decision.action)) return turns[i]!.decision;
    return null;
  }

  function summary(progress: ConceptProgress[]): string {
    const titles = (status: string) =>
      progress.filter((p) => p.status === status).map((p) => getConcept(p.conceptId).title.toLowerCase());
    const mastered = titles('mastered');
    const review = titles('needs_review');
    const parts = [`That is all our topics for today. You have understood ${mastered.length} of ${CONCEPTS.length}.`];
    if (review.length) parts.push(`Next time we will start by going over ${review.join(', and ')}.`);
    else parts.push('Well done.');
    return parts.join(' ');
  }

  /** Says the reaction to the student's answer, from the generator if it is available and from a script if not. */
  async function feedback(
    mode: GenerateMode,
    ctx: { concept: Concept; item: Item | null; out: DecideOutput; transcript: string; evaluation: Evaluation | null },
    speaker: ReturnType<typeof createSpeaker>,
    trace: Trace,
  ): Promise<boolean> {
    const { decision } = ctx.out;
    try {
      await trace.time('generate_ms', () =>
        generateWithLlm(
          deps,
          trace,
          {
            mode,
            concept: ctx.concept,
            decision,
            gradedItem: ctx.item,
            strategy: mode === 'reteach' ? findStrategy(ctx.concept, decision.strategyId) : null,
            transcript: ctx.transcript,
            evaluation: ctx.evaluation,
            boardIds: speaker.boardIds,
          },
          (segment) => speaker.push(segment),
        ),
      );
      return true;
    } catch (err) {
      trace.degrade(failureLabel('generator', err));
      speaker.push(scriptedFeedback(decision, ctx.item));
      return false;
    }
  }

  async function speak(
    ctx: { session: { id: string }; concept: Concept; item: Item | null; state: TutorState; out: DecideOutput; transcript: string; evaluation: Evaluation | null; progress: ConceptProgress[] },
    speaker: ReturnType<typeof createSpeaker>,
    trace: Trace,
  ): Promise<void> {
    const { decision, state: next } = ctx.out;
    const target = decision.nextConceptId ? getConcept(decision.nextConceptId) : ctx.concept;
    const nextItem = findItem(target, decision.itemId);
    // While waiting for the student's reasoning, the open question is "how did you get that?", not the item.
    const ask = (lead = '') =>
      next.phase === 'probe'
        ? speaker.say('So, tell me how you worked out your answer.')
        : nextItem && speaker.push({ say: `${lead}${nextItem.say}`, board: nextItem.board });
    const script = (c: Concept) => findStrategy(c, decision.strategyId)?.script.forEach((s) => speaker.push(s));

    switch (decision.action) {
      case 'teach':
        script(ctx.concept);
        ask();
        break;
      case 'probe':
        speaker.say(PROBE_QUESTION);
        break;
      case 'hint':
        speaker.say(ctx.item?.hints[next.hints - 1] ?? 'Have another look at the question on the board.');
        break;
      case 'confirm':
        speaker.say(`I heard ${next.pending ? describeAnswer(next.pending) : 'something I could not make out'}. Is that what you meant?`);
        break;
      case 'repeat': {
        const last = repo.lastTurn(ctx.session.id);
        if (last) last.segments.forEach((s) => speaker.push(s));
        else ask();
        break;
      }
      case 'explain_why': {
        const last = lastSubstantiveDecision(ctx.session.id);
        speaker.say(last?.reason ?? 'We have only just started, so there is no decision to explain yet.');
        if (last?.counterfactual) speaker.say(last.counterfactual);
        ask('So, back to the question. ');
        break;
      }
      case 'redirect':
        speaker.say(
          decision.reasonCode === 'skip_requested'
            ? 'I cannot skip the check questions, but get them right and we will move quickly.'
            : "Let's keep to quadratic equations for now.",
        );
        ask();
        break;
      case 'reprompt':
        speaker.say(
          decision.reasonCode === 'tutor_unavailable'
            ? 'Sorry, I am having a little trouble just now. Please give me just your answer, as simply as you can.'
            : decision.reasonCode === 'nothing_heard'
              ? 'I did not hear anything. Could you say your answer again?'
              : 'I did not catch an answer there. Could you say it again, as simply as you can?',
        );
        break;
      case 'next_check':
        await feedback('feedback', ctx, speaker, trace);
        ask();
        break;
      case 'reteach':
        if (!(await feedback('reteach', ctx, speaker, trace))) script(ctx.concept);
        ask();
        break;
      case 'scaffold':
        await feedback('feedback', ctx, speaker, trace);
        script(ctx.concept);
        ask();
        break;
      case 'move_on':
      case 'needs_review':
        await feedback('feedback', ctx, speaker, trace);
        script(target);
        ask();
        break;
      case 'finish':
        if (ctx.state.phase !== 'done') await feedback('feedback', ctx, speaker, trace);
        speaker.say(summary(ctx.progress));
        break;
    }
  }

  function applyProgress(progress: ConceptProgress[], concept: Concept, out: DecideOutput, grade: Grade | null, misconception: string | null) {
    const update = (id: string, patch: (p: ConceptProgress) => Partial<ConceptProgress>) => {
      const i = progress.findIndex((p) => p.conceptId === id);
      if (i !== -1) progress[i] = { ...progress[i]!, ...patch(progress[i]!) };
    };
    update(concept.id, (p) => ({
      status: out.conceptClosed ?? (p.status === 'not_started' ? 'in_progress' : p.status),
      attempts: p.attempts + (out.attempted ? 1 : 0),
      correctAttempts: p.correctAttempts + (out.attempted && grade === 'correct' ? 1 : 0),
      strategiesUsed: [...new Set([...p.strategiesUsed, ...(out.conceptClosed ? [] : out.state.strategiesUsed)])],
      lastMisconception: misconception ?? p.lastMisconception,
    }));
    if (out.decision.nextConceptId) {
      update(out.decision.nextConceptId, (p) => ({
        status: p.status === 'not_started' ? 'in_progress' : p.status,
        strategiesUsed: [...new Set([...p.strategiesUsed, ...out.state.strategiesUsed])],
      }));
    }
  }

  function replay(turn: StoredTurn, progress: ConceptProgress[], emit: Emit) {
    emit({ type: 'decision', evaluation: turn.evaluation, grade: turn.grade, decision: turn.decision });
    turn.segments.forEach((segment, index) => emit({ type: 'segment', index, segment }));
    emit({ type: 'done', progress, degraded: turn.degraded, timings: turn.timings });
  }

  return {
    /** Starts a session at the first concept the student has not mastered, and teaches it. */
    async startSession(input: { studentId?: string; name: string; voice: Voice; isSimulated?: boolean }) {
      const student = repo.upsertStudent(input.studentId, input.name.trim().slice(0, 60) || 'Student');
      const progress = repo.getProgress(student.id, conceptIds());
      const concept = nextOpenConcept(progress, 0) ?? CONCEPTS[0]!; // everything mastered: start a fresh pass
      const opened = openConcept(concept, [], progress.find((p) => p.conceptId === concept.id)?.strategiesUsed ?? []);
      const trace = new Trace();
      const events: TurnEvent[] = [];
      const emit: Emit = (e) => events.push(e);

      emit({ type: 'decision', evaluation: null, grade: null, decision: opened.decision });
      const speaker = createSpeaker(emit, input.voice, trace, []);
      speaker.say(`Hello ${student.name}. Today we are working on quadratic equations.`);
      const out: DecideOutput = { ...opened, attempted: false, conceptClosed: null };
      await speak(
        { session: { id: '' }, concept, item: null, state: opened.state, out, transcript: '', evaluation: null, progress },
        speaker,
        trace,
      );
      const segments = await speaker.finish();
      const state = { ...opened.state, boardIds: speaker.boardIds };
      applyProgress(progress, concept, out, null, null);

      const sessionId = repo.createSession({
        studentId: student.id,
        state,
        promptVersion: deps.prompts.version,
        curriculumVersion: CURRICULUM_VERSION,
        policyVersion: POLICY_VERSION,
        modelConfig: deps.config.models,
        isSimulated: input.isSimulated ?? false,
      });
      repo.commitTurn(
        {
          id: 'start', sessionId, studentId: student.id, conceptId: concept.id, transcript: null, sttConfidence: null,
          evaluation: null, grade: null, decision: opened.decision, segments, modelsUsed: [], degraded: trace.degraded,
          timings: trace.timings, tokensIn: 0, tokensOut: 0, costUsd: 0, attempt: null, misconception: null, llmCalls: [],
        },
        state,
        progress,
        false,
      );
      events.push({ type: 'done', progress, degraded: trace.degraded, timings: trace.timings });
      return { sessionId, studentId: student.id, studentName: student.name, events };
    },

    /** State needed to redraw the screen after a refresh. */
    resume(sessionId: string) {
      const session = repo.getSession(sessionId);
      if (!session) throw new NotFoundError(`No session ${sessionId}`);
      const last = repo.lastTurn(sessionId);
      return {
        sessionId,
        studentId: session.studentId,
        status: session.status,
        conceptId: session.state.conceptId,
        board: repo.currentBoard(sessionId),
        progress: repo.getProgress(session.studentId, conceptIds()),
        lastDecision: lastSubstantiveDecision(sessionId),
        lastSaid: last?.segments.map((s) => s.say) ?? [],
      };
    },

    runTurn(input: TurnInput, emit: Emit): Promise<void> {
      return serial(input.sessionId, async () => {
        const session = repo.getSession(input.sessionId);
        if (!session) throw new NotFoundError(`No session ${input.sessionId}`);
        const progress = repo.getProgress(session.studentId, conceptIds());

        const existing = repo.getTurn(input.sessionId, input.turnId);
        if (existing) return replay(existing, progress, emit);

        const trace = new Trace();
        const state = session.state;
        const concept = getConcept(state.conceptId);
        const item = findItem(concept, state.itemId);
        const transcript = input.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

        // 1. What did the student say? (model, or rules if the model is unavailable)
        let evaluation: Evaluation | null = null;
        let grade: Grade | null = null;
        let grader = 'code';
        let out: DecideOutput;

        if (transcript === '' && state.phase !== 'done') {
          out = holdTurn(concept, state, 'nothing_heard', 'I did not hear anything, so I asked again. Nothing about your progress changed.');
        } else {
          try {
            evaluation = await trace.time('evaluate_ms', () => evaluateWithLlm(deps, trace, { concept, item, state, transcript }));
          } catch (err) {
            trace.degrade(failureLabel('evaluator', err));
            // Reasoning cannot be judged by rules, so an explanation given during an outage is asked for again.
            const rough = state.phase === 'probe' ? null : heuristicEvaluate(transcript, item?.answer ?? null);
            evaluation = rough && (rough.intent !== 'answer' || rough.confidence > 0) ? rough : null;
            grader = 'code+heuristic_extraction';
          }

          if (!evaluation) {
            out = holdTurn(
              concept,
              state,
              'tutor_unavailable',
              'I had a technical problem understanding that answer, so I asked for it again rather than guess. Nothing about your progress changed.',
            );
          } else {
            // 2. Is it right? Code decides, not the model.
            if (evaluation.intent === 'answer' && state.phase === 'check' && item) grade = gradeAnswer(item.answer, evaluation.answer);
            // 3. What happens next? The policy decides, and records why.
            const nextConcept = nextOpenConcept(progress, concept.order);
            out = decide({
              concept,
              nextConcept,
              nextPriorStrategies: progress.find((p) => p.conceptId === nextConcept?.id)?.strategiesUsed,
              state,
              evaluation,
              grade,
            });
            // Reasoning cannot be checked without the model. Keep the lesson moving, but do not record
            // mastery on answers alone: the topic is confirmed at the start of the next session instead.
            if (grader !== 'code' && out.conceptClosed === 'mastered') {
              out = {
                ...out,
                conceptClosed: 'needs_review',
                decision: {
                  ...out.decision,
                  reasonCode: 'mastery_unverified',
                  reason: `${out.decision.reason} Because of a technical problem I could not check your reasoning, so I will confirm this topic at the start of next session.`,
                },
              };
            }
          }
        }
        trace.mark('decided_ms');
        emit({ type: 'decision', evaluation, grade, decision: out.decision });

        // 4. Say it.
        applyProgress(progress, concept, out, grade, out.decision.evidence.misconception);
        const speaker = createSpeaker(emit, input.voice, trace, state.boardIds);
        await speak({ session, concept, item, state, out, transcript, evaluation, progress }, speaker, trace);
        const segments = await speaker.finish();
        trace.timings.total_ms = trace.elapsed();

        // 5. Commit. Nothing about the session changed until this point.
        const nextState: TutorState = { ...out.state, boardIds: speaker.boardIds };
        repo.commitTurn(
          {
            id: input.turnId,
            sessionId: session.id,
            studentId: session.studentId,
            conceptId: concept.id,
            transcript,
            sttConfidence: input.sttConfidence ?? null,
            evaluation,
            grade,
            decision: out.decision,
            segments,
            modelsUsed: [...trace.modelsUsed],
            degraded: trace.degraded,
            timings: trace.timings,
            tokensIn: trace.tokensIn,
            tokensOut: trace.tokensOut,
            costUsd: trace.costUsd,
            attempt:
              out.attempted && item && evaluation && grade
                ? { itemId: item.id, extracted: evaluation.answer, grade, grader }
                : null,
            misconception: out.decision.evidence.misconception,
            llmCalls: trace.llmCalls,
          },
          nextState,
          progress,
          nextState.phase === 'done',
        );

        logEvent('turn', {
          session_id: session.id,
          turn_id: input.turnId,
          student_id: session.studentId,
          simulated: session.isSimulated,
          concept: concept.id,
          phase: state.phase,
          intent: evaluation?.intent ?? null,
          eval_confidence: evaluation?.confidence ?? null,
          stt_confidence: input.sttConfidence ?? null,
          grade,
          action: out.decision.action,
          reason_code: out.decision.reasonCode,
          misconception: out.decision.evidence.misconception,
          models: [...trace.modelsUsed],
          prompt_version: session.promptVersion,
          policy_version: session.policyVersion,
          curriculum_version: session.curriculumVersion,
          degraded: trace.degraded,
          timings: trace.timings,
          tokens_in: trace.tokensIn,
          tokens_out: trace.tokensOut,
          cost_usd: trace.costUsd,
          segments: segments.length,
          board_ops: segments.reduce((n, s) => n + s.board.length, 0),
        });
        emit({ type: 'done', progress, degraded: trace.degraded, timings: trace.timings });
      });
    },
  };
}

export type Tutor = ReturnType<typeof createTutor>;
