export type FailureKind = 'timeout' | 'http' | 'network' | 'garbage' | 'circuit_open' | 'budget' | 'no_key';

export class ProviderError extends Error {
  constructor(
    public readonly kind: FailureKind,
    message: string,
    /** False for failures a second attempt cannot fix (bad key, open circuit, spend cap). */
    public readonly retryable = true,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One retry, with jitter. A voice turn cannot afford more: every extra attempt
 * is seconds of silence, and the scripted fallback is better than a long wait.
 */
export async function retryOnce<T>(fn: (attempt: number) => Promise<T>, jitterMs = 250): Promise<T> {
  try {
    return await fn(0);
  } catch (err) {
    if (err instanceof ProviderError && !err.retryable) throw err;
    await sleep(100 + Math.random() * jitterMs);
    return fn(1);
  }
}

/**
 * Stops calling a provider that keeps failing, so each turn does not pay a
 * full timeout to rediscover the outage. After `coolDownMs` one trial call is
 * let through; success closes the circuit, failure reopens it.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    public readonly name: string,
    private readonly threshold = 3,
    private readonly coolDownMs = 30_000,
    private readonly clock: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' | 'half_open' {
    if (this.openedAt === null) return 'closed';
    return this.clock() - this.openedAt >= this.coolDownMs ? 'half_open' : 'open';
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') throw new ProviderError('circuit_open', `${this.name} circuit is open`, false);
    try {
      const result = await fn();
      this.failures = 0;
      this.openedAt = null;
      return result;
    } catch (err) {
      // Budget and missing-key errors say nothing about the provider's health.
      const countable = !(err instanceof ProviderError) || !['budget', 'no_key', 'circuit_open'].includes(err.kind);
      if (countable) {
        this.failures += 1;
        if (this.failures >= this.threshold || this.openedAt !== null) this.openedAt = this.clock();
      }
      throw err;
    }
  }
}

/** fetch with a hard deadline, mapping every failure to a ProviderError. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new ProviderError('timeout', `No response within ${timeoutMs} ms`);
    throw new ProviderError('network', (err as Error).message);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
    throw new ProviderError('http', `HTTP ${res.status}: ${body.slice(0, 300)}`, retryable);
  }
  return res;
}
