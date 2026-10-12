import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatRequest, LLM } from './llm';
import { ProviderError, sleep } from './resilience';
import type { STT, TTS } from './speech';

/**
 * Fault injection for tests, evals and the demo's debug drawer.
 *
 * Spec: comma-separated `name:probability`, e.g. "llm_timeout:0.3,tts_down:1".
 * A purpose can be targeted with `name@purpose`, e.g. "llm_garbage@evaluate:1".
 */
export type FaultName = 'llm_timeout' | 'llm_garbage' | 'llm_down' | 'stt_down' | 'tts_down';
const NAMES: FaultName[] = ['llm_timeout', 'llm_garbage', 'llm_down', 'stt_down', 'tts_down'];

export interface Fault {
  name: FaultName;
  purpose: string | null;
  probability: number;
}

export function parseFaults(spec: string | undefined | null): Fault[] {
  if (!spec) return [];
  const faults: Fault[] = [];
  for (const part of spec.split(',')) {
    const [target, prob] = part.trim().split(':');
    const [name, purpose] = (target ?? '').split('@');
    if (!NAMES.includes(name as FaultName)) continue;
    const probability = prob === undefined ? 1 : Number(prob);
    if (Number.isFinite(probability) && probability > 0) {
      faults.push({ name: name as FaultName, purpose: purpose ?? null, probability: Math.min(probability, 1) });
    }
  }
  return faults;
}

/** Faults for the current request. Falls back to the process-wide FAULT_INJECT setting. */
const scope = new AsyncLocalStorage<Fault[]>();
let processFaults: Fault[] = [];

export const setProcessFaults = (spec: string) => void (processFaults = parseFaults(spec));
export const withFaults = <T>(faults: Fault[], fn: () => T): T => scope.run(faults, fn);

function fires(name: FaultName, purpose?: string): boolean {
  const active = scope.getStore() ?? processFaults;
  return active.some((f) => f.name === name && (f.purpose === null || f.purpose === purpose) && Math.random() < f.probability);
}

async function beforeLlm(req: ChatRequest): Promise<string | null> {
  if (fires('llm_down', req.purpose)) throw new ProviderError('http', 'Injected fault: provider returned 503');
  if (fires('llm_timeout', req.purpose)) {
    await sleep(Math.min(req.timeoutMs, 400)); // long enough to be visible in timings, short enough for tests
    throw new ProviderError('timeout', 'Injected fault: timeout');
  }
  return fires('llm_garbage', req.purpose) ? 'Sure! Here is the thing you asked for: {"intent": "ans' : null;
}

export function faultyLLM(inner: LLM): LLM {
  return {
    async complete(req) {
      const garbage = await beforeLlm(req);
      if (garbage !== null) return { text: garbage, model: req.model, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      return inner.complete(req);
    },
    async stream(req, onText) {
      const garbage = await beforeLlm(req);
      if (garbage !== null) {
        onText(garbage);
        return { text: garbage, model: req.model, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      }
      return inner.stream(req, onText);
    },
  };
}

export function faultySTT(inner: STT): STT {
  return {
    async transcribe(audio, format) {
      if (fires('stt_down')) throw new ProviderError('http', 'Injected fault: speech-to-text is down');
      return inner.transcribe(audio, format);
    },
  };
}

export function faultyTTS(inner: TTS): TTS {
  return {
    async speak(text) {
      if (fires('tts_down')) throw new ProviderError('http', 'Injected fault: text-to-speech is down');
      return inner.speak(text);
    },
  };
}
