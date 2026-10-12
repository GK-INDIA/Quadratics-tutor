import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const env = (key: string, fallback: string) => process.env[key]?.trim() || fallback;
const list = (key: string, fallback: string) =>
  env(key, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export interface Config {
  openRouterKey: string;
  passcode: string;
  dailySpendCapUsd: number;
  models: { evaluator: string; generator: string; fallbacks: string[]; judge: string; stt: string; tts: string };
  ttsVoice: string;
  dbPath: string;
  port: number;
  allowFaultInjection: boolean;
  faultInject: string;
  promptDir: string;
  timeouts: { sttMs: number; evaluateMs: number; firstTokenMs: number; generateMs: number; ttsMs: number };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    openRouterKey: env('OPENROUTER_API_KEY', ''),
    passcode: env('APP_PASSCODE', ''),
    dailySpendCapUsd: Number(env('DAILY_SPEND_CAP_USD', '5')),
    models: {
      evaluator: env('MODEL_EVALUATOR', 'google/gemini-2.5-flash'),
      generator: env('MODEL_GENERATOR', 'google/gemini-2.5-flash'),
      fallbacks: list('MODEL_FALLBACKS', 'openai/gpt-4.1-mini'),
      judge: env('MODEL_JUDGE', 'openai/gpt-4.1'),
      stt: env('MODEL_STT', 'openai/whisper-large-v3-turbo'),
      tts: env('MODEL_TTS', 'google/gemini-3.8-flash-tts'),
    },
    ttsVoice: env('TTS_VOICE', 'Kore'),
    dbPath: path.resolve(REPO_ROOT, env('DB_PATH', './data/tutor.db')),
    port: Number(env('PORT', '8787')),
    allowFaultInjection: env('ALLOW_FAULT_INJECTION', 'false') === 'true',
    faultInject: env('FAULT_INJECT', ''),
    promptDir: path.resolve(REPO_ROOT, env('PROMPT_DIR', './prompts/v1')),
    timeouts: { sttMs: Number(env('STT_TIMEOUT_MS', '10000')), evaluateMs: 6000, firstTokenMs: 4000, generateMs: 15000, ttsMs: Number(env('TTS_TIMEOUT_MS', '15000')) },
    ...overrides,
  };
}

export interface Prompts {
  /** e.g. "v1:3fa9c21b". Stored on every session and turn so a regression can be traced to a prompt change. */
  version: string;
  get(name: string): string;
}

export function loadPrompts(dir: string): Prompts {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const contents = new Map(files.map((f) => [f.replace(/\.md$/, ''), readFileSync(path.join(dir, f), 'utf8')]));
  const hash = createHash('sha256');
  // Judge and simulator prompts are test tooling; changing them does not change the tutor.
  for (const [name, text] of contents) if (!/^(judge|simulator)-/.test(name)) hash.update(name).update(text);
  return {
    version: `${path.basename(dir)}:${hash.digest('hex').slice(0, 8)}`,
    get(name) {
      const text = contents.get(name);
      if (text === undefined) throw new Error(`Missing prompt "${name}" in ${dir}`);
      return text;
    },
  };
}
