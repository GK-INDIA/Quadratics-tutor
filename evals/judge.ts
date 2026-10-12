import type { Concept, Decision, Item, Segment } from '@tutor/shared';
import { z } from 'zod';
import type { Trace } from '../apps/api/src/observability/trace';
import { type LlmDeps, completeJson, fill } from '../apps/api/src/tutor/calls';

const Verdicts = z.object({
  results: z.array(z.object({ criterion: z.number(), pass: z.boolean(), why: z.string() })),
});

export interface JudgeInput {
  concept: Concept;
  item: Item | null;
  transcript: string;
  decision: Decision;
  segments: Segment[];
  criteria: string[];
}

/**
 * Grades the qualities code cannot check (is the re-teach really different, is
 * the feedback about this student's mistake). Uses a different, pinned model
 * from the tutor so the tutor is not marking its own work.
 */
export async function judge(deps: LlmDeps, trace: Trace, input: JudgeInput): Promise<{ criterion: string; pass: boolean; why: string }[]> {
  const verdicts = await completeJson(
    deps,
    trace,
    {
      purpose: 'judge',
      model: deps.config.models.judge,
      system: deps.prompts.get('judge-system'),
      user: fill(deps.prompts.get('judge-user'), {
        topic: input.concept.title,
        question: input.item?.say ?? '(none)',
        correct_answer: input.item?.expected ?? '(none)',
        transcript: input.transcript,
        action: input.decision.action,
        reason: input.decision.reason,
        reply: input.segments.map((s, i) => `${i + 1}. "${s.say}" ${s.board.length ? JSON.stringify(s.board) : ''}`).join('\n'),
        criteria: input.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'),
      }),
      maxTokens: 500,
      temperature: 0,
      timeoutMs: 30_000,
    },
    Verdicts,
  );
  return input.criteria.map((criterion, i) => {
    const v = verdicts.results.find((r) => r.criterion === i + 1);
    return { criterion, pass: v?.pass ?? false, why: v?.why ?? 'judge returned no verdict for this criterion' };
  });
}
