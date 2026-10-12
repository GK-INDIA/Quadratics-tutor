import type { z } from 'zod';
import type { Config, Prompts } from '../config';
import type { Trace } from '../observability/trace';
import type { ChatRequest, ChatResult, LLM } from '../providers/llm';
import { type CircuitBreaker, ProviderError, retryOnce } from '../providers/resilience';

export interface LlmDeps {
  llm: LLM;
  breaker: CircuitBreaker;
  config: Config;
  prompts: Prompts;
  /** Throws ProviderError('budget') once the daily spend cap is reached. */
  checkBudget: () => void;
}

/** Strips a ```json fence if the model added one despite being told not to. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(trimmed);
}

/**
 * A JSON completion that is validated before anyone trusts it. An unparseable
 * or off-schema reply counts as a failure like any other: one retry, with the
 * validation error fed back, then the caller's fallback.
 */
export async function completeJson<T>(
  deps: LlmDeps,
  trace: Trace,
  req: ChatRequest,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  deps.checkBudget();
  let complaint = '';
  return deps.breaker.run(() =>
    retryOnce(async () => {
      const attempt: ChatRequest = complaint
        ? { ...req, user: `${req.user}\n\nYour previous reply was rejected: ${complaint}\nReply with valid JSON only.` }
        : req;
      const startedAt = Date.now();
      let result: ChatResult | null = null;
      try {
        result = await deps.llm.complete(attempt);
        let json: unknown;
        try {
          json = parseJsonLoose(result.text);
        } catch {
          throw new ProviderError('garbage', 'reply was not JSON');
        }
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new ProviderError('garbage', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        }
        trace.recordCall(req.purpose, { model: req.model, user: attempt.user }, startedAt, result, null);
        return parsed.data;
      } catch (err) {
        complaint = (err as Error).message;
        trace.recordCall(req.purpose, { model: req.model, user: attempt.user }, startedAt, result, err);
        throw err;
      }
    }),
  );
}

/** Fills {{name}} placeholders. Unknown placeholders are a bug in the prompt file, so they throw. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Prompt placeholder {{${key}}} has no value`);
    return values[key]!;
  });
}

/** Short label for the degraded list, e.g. "evaluator:timeout". */
export function failureLabel(stage: string, err: unknown): string {
  return `${stage}:${err instanceof ProviderError ? err.kind : 'error'}`;
}
