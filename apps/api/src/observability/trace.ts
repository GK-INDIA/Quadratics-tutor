import type { ChatResult } from '../providers/llm';
import type { LlmCall } from '../store/repo';

/** Collects everything worth knowing about one turn, then becomes one log line and one `turns` row. */
export class Trace {
  readonly startedAt = Date.now();
  readonly timings: Record<string, number> = {};
  readonly llmCalls: LlmCall[] = [];
  readonly modelsUsed = new Set<string>();
  /** Stages that fell back, e.g. "evaluator:timeout", "generator:garbage", "tts". Empty on a clean turn. */
  readonly degraded: string[] = [];
  tokensIn = 0;
  tokensOut = 0;
  costUsd = 0;

  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  /** Records the time since the turn started, once, under `name`. */
  mark(name: string): void {
    this.timings[name] ??= this.elapsed();
  }

  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.timings[name] = (this.timings[name] ?? 0) + (Date.now() - start);
    }
  }

  degrade(stage: string): void {
    if (!this.degraded.includes(stage)) this.degraded.push(stage);
  }

  recordCall(purpose: string, request: unknown, startedAt: number, result: ChatResult | null, error: unknown): void {
    if (result) {
      this.modelsUsed.add(result.model);
      this.tokensIn += result.tokensIn;
      this.tokensOut += result.tokensOut;
      this.costUsd += result.costUsd;
    }
    this.llmCalls.push({
      purpose,
      model: result?.model ?? null,
      request,
      response: result?.text ?? null,
      error: error ? String((error as Error).message ?? error) : null,
      latencyMs: Date.now() - startedAt,
      costUsd: result?.costUsd ?? 0,
    });
  }
}

/** One JSON object per line on stdout; any log shipper can pick it up. */
export function logEvent(event: string, fields: Record<string, unknown>): void {
  if (process.env.LOG_SILENT === 'true') return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
