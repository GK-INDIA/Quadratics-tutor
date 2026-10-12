import type { Evaluation } from '@tutor/shared';
import { buildTutor } from './app';
import { type Config, loadConfig } from './config';
import type { ChatRequest, ChatResult, LLM } from './providers/llm';
import { openDb } from './store/db';

/** What a scripted model returns for one call: reply text, or an error to throw. */
export type Reply = string | Error;

export interface ScriptedLLM extends LLM {
  calls: ChatRequest[];
}

/**
 * An LLM whose replies are decided by the test. `evaluate` and `generate`
 * receive the request and how many times that purpose has been called.
 */
export function scriptedLLM(script: {
  evaluate?: (req: ChatRequest, n: number) => Reply | Evaluation;
  generate?: (req: ChatRequest, n: number) => Reply;
  other?: (req: ChatRequest, n: number) => Reply;
}): ScriptedLLM {
  const calls: ChatRequest[] = [];
  const counts: Record<string, number> = {};
  const reply = (req: ChatRequest): ChatResult => {
    calls.push(req);
    const n = (counts[req.purpose] = (counts[req.purpose] ?? 0) + 1) - 1;
    const handler = req.purpose === 'evaluate' ? script.evaluate : req.purpose === 'generate' ? script.generate : script.other;
    if (!handler) throw new Error(`scriptedLLM has no handler for "${req.purpose}"`);
    const out = handler(req, n);
    if (out instanceof Error) throw out;
    return { text: typeof out === 'string' ? out : JSON.stringify(out), model: 'scripted', tokensIn: 10, tokensOut: 10, costUsd: 0 };
  };
  return {
    calls,
    async complete(req) {
      return reply(req);
    },
    async stream(req, onText) {
      const result = reply(req);
      onText(result.text);
      return result;
    },
  };
}

/** Shorthand for building the evaluator's reply. */
export function evaluation(patch: Partial<Omit<Evaluation, 'answer'>> & { answer?: Partial<Evaluation['answer']> } = {}): Evaluation {
  return {
    intent: 'answer',
    showedReasoning: false,
    reasoningSound: null,
    misconception: null,
    confidence: 0.95,
    ...patch,
    answer: { boolean: null, numbers: null, coefficients: null, choice: null, ...patch.answer },
  };
}

/** A tutor on an in-memory database with no network access. */
export function testTutor(llm: LLM, config: Partial<Config> = {}) {
  process.env.LOG_SILENT = 'true';
  return buildTutor(loadConfig({ openRouterKey: 'test', faultInject: '', dailySpendCapUsd: 1000, ...config }), {
    db: openDb(':memory:'),
    llm,
    tts: { speak: async () => 'QUJD' },
    stt: { transcribe: async () => ({ text: '' }) },
  });
}
