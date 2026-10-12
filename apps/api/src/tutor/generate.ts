import type { Concept, Decision, Evaluation, Item, Segment, Strategy } from '@tutor/shared';
import type { Trace } from '../observability/trace';
import type { ChatRequest, ChatResult } from '../providers/llm';
import { ProviderError, sleep } from '../providers/resilience';
import { type LlmDeps, fill, parseJsonLoose } from './calls';
import { logEvent } from '../observability/trace';
import { guardSegment } from './guards';

/**
 * feedback: one or two sentences reacting to what the student said.
 * reteach:  the same, followed by the chosen strategy's explanation adapted to
 *           the student's specific mistake.
 * Check questions are never generated; they come from the item bank so they
 * always match the answer the grader expects.
 */
export type GenerateMode = 'feedback' | 'reteach';
// A re-teach has to reach the answer, which takes more lines than the reference script alone.
const MAX_SEGMENTS: Record<GenerateMode, number> = { feedback: 2, reteach: 10 };

export interface GenerateInput {
  mode: GenerateMode;
  concept: Concept;
  decision: Decision;
  /** The question the student just answered. */
  gradedItem: Item | null;
  /** For reteach: the explanation to adapt. */
  strategy: Strategy | null;
  transcript: string;
  evaluation: Evaluation | null;
  boardIds: string[];
}

export interface Generated {
  segments: Segment[];
  boardIds: string[];
}

function buildRequest(deps: LlmDeps, input: GenerateInput): ChatRequest {
  const { concept, decision, gradedItem, strategy, evaluation } = input;
  const misconception = evaluation?.misconception ? concept.misconceptions[evaluation.misconception]?.label : undefined;
  return {
    purpose: 'generate',
    model: deps.config.models.generator,
    fallbacks: deps.config.models.fallbacks,
    system: deps.prompts.get('generator-system'),
    user: fill(deps.prompts.get('generator-user'), {
      mode: input.mode,
      max_segments: String(MAX_SEGMENTS[input.mode]),
      topic: concept.title,
      question: gradedItem?.say ?? '(none)',
      correct_answer: gradedItem?.expected ?? '(none)',
      grade: decision.evidence.grade ?? 'n/a',
      misconception: misconception ?? 'none identified',
      action: decision.action,
      reason: decision.reason,
      strategy: strategy ? `${strategy.label}\n${strategy.script.map((s) => JSON.stringify(s)).join('\n')}` : '(not needed for feedback)',
      board_ids: input.boardIds.join(', ') || '(board is empty)',
      transcript: input.transcript,
    }),
    maxTokens: input.mode === 'reteach' ? 900 : 250,
    temperature: 0.4,
    timeoutMs: deps.config.timeouts.generateMs,
    firstTokenMs: deps.config.timeouts.firstTokenMs,
  };
}

/** Pulls the spoken sentence out of a line that is not valid JSON. Returns null if there is none. */
export function salvageSay(line: string): { say: string; board: [] } | null {
  const match = /"say"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(line);
  if (!match) return null;
  try {
    const say = JSON.parse(match[1]!) as string;
    return say.trim() ? { say, board: [] } : null;
  } catch {
    return null;
  }
}

/**
 * Streams one JSON segment per line from the generator, checking each line as
 * it completes so the first sentence can be spoken while the rest is written.
 *
 * Throws only if nothing usable was produced. Once a segment has been handed
 * to `onSegment` the student may already be hearing it, so later failures end
 * the reply early instead of restarting it.
 */
export async function generateWithLlm(
  deps: LlmDeps,
  trace: Trace,
  input: GenerateInput,
  onSegment: (segment: Segment) => void,
): Promise<Generated> {
  deps.checkBudget();
  const req = buildRequest(deps, input);
  const limit = MAX_SEGMENTS[input.mode];

  const attempt = async (): Promise<Generated> => {
    const segments: Segment[] = [];
    let boardIds = input.boardIds;
    let buffer = '';
    let stopped = false;

    const takeLine = (line: string) => {
      const text = line.trim();
      if (stopped || text === '' || text.startsWith('```')) return;
      if (segments.length >= limit) return void (stopped = true);
      let json: unknown;
      try {
        json = parseJsonLoose(text);
      } catch {
        // One typo in a line of JSON must not end the reply: keep the sentence, lose only its board changes.
        json = salvageSay(text);
        if (json === null) return void trace.degrade('generator:guard');
        logEvent('generator_line_repaired', { chars: text.length });
      }
      const guarded = guardSegment(json, boardIds);
      if (guarded.problems.length > 0) trace.degrade('generator:guard');
      // A rejected sentence is skipped rather than ending the reply: the answer is usually in a later one.
      if (!guarded.segment) return void trace.degrade('generator:guard');
      boardIds = guarded.boardIds;
      segments.push(guarded.segment);
      trace.mark('first_segment_ms');
      onSegment(guarded.segment);
    };

    const startedAt = Date.now();
    let result: ChatResult | null = null;
    try {
      result = await deps.llm.stream(req, (delta) => {
        buffer += delta;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          takeLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      });
      takeLine(buffer);
      if (segments.length === 0) throw new ProviderError('garbage', 'generator produced no usable segment');
      trace.recordCall('generate', { model: req.model, user: req.user }, startedAt, result, null);
      return { segments, boardIds };
    } catch (err) {
      trace.recordCall('generate', { model: req.model, user: req.user }, startedAt, result, err);
      if (segments.length > 0) {
        trace.degrade('generator:cut_short');
        return { segments, boardIds };
      }
      throw err;
    }
  };

  return deps.breaker.run(async () => {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof ProviderError && !err.retryable) throw err;
      await sleep(100 + Math.random() * 250);
      return attempt();
    }
  });
}

/** What the tutor says about the student's answer when the generator is unavailable. */
export function scriptedFeedback(decision: Decision, gradedItem: Item | null): Segment {
  const answer = gradedItem ? ` The answer is ${gradedItem.expected}.` : '';
  const say = (() => {
    switch (decision.action) {
      case 'next_check':
        return "That's right. Here is one more.";
      case 'move_on':
        return "That's right again. You have this one, so let's move on.";
      case 'reteach':
        return decision.reasonCode === 'answer_not_supported' || decision.reasonCode === 'right_answer_wrong_method'
          ? 'Your answer was right, but I want to be sure the method is clear. Let me explain it another way.'
          : `Not quite.${answer} Let me explain it another way.`;
      case 'scaffold':
        return `That's not it yet.${answer} Let's take it in smaller steps.`;
      case 'needs_review':
        return `This one is still tricky, and that is okay.${answer} We will come back to it next time. Let's move on for now.`;
      case 'finish':
        return decision.reasonCode === 'mastery_reached' ? "That's right." : `Not quite.${answer} We will come back to this one next time.`;
      default:
        return 'Okay.';
    }
  })();
  return { say, board: [] };
}
