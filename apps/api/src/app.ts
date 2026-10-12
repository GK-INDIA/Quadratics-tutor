import { existsSync } from 'node:fs';
import path from 'node:path';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { type Config, REPO_ROOT, loadPrompts } from './config';
import { logEvent } from './observability/trace';
import { faultyLLM, faultySTT, faultyTTS, parseFaults, setProcessFaults, withFaults } from './providers/faults';
import { type LLM, createOpenRouterLLM } from './providers/llm';
import { CircuitBreaker, ProviderError } from './providers/resilience';
import { type STT, type TTS, cachedTTS, createOpenRouterSTT, createOpenRouterTTS } from './providers/speech';
import { registerAdminRoutes } from './routes/admin';
import { type DB, openDb } from './store/db';
import { createRepo } from './store/repo';
import { NotFoundError, createTutor } from './tutor/orchestrator';

export interface Overrides {
  db?: DB;
  llm?: LLM;
  stt?: STT;
  tts?: TTS;
}

/** Wires providers, storage and the tutor. Tests and evals pass their own LLM or database. */
export function buildTutor(config: Config, overrides: Overrides = {}) {
  setProcessFaults(config.faultInject);
  const db = overrides.db ?? openDb(config.dbPath);
  const repo = createRepo(db);
  const prompts = loadPrompts(config.promptDir);
  const llm = faultyLLM(overrides.llm ?? createOpenRouterLLM(config));
  const stt = faultySTT(overrides.stt ?? createOpenRouterSTT(config));
  const tts = cachedTTS(faultyTTS(overrides.tts ?? createOpenRouterTTS(config)), `${config.models.tts}:${config.ttsVoice}`);

  const checkBudget = () => {
    if (repo.spendToday() >= config.dailySpendCapUsd) {
      throw new ProviderError('budget', `Daily spend cap of $${config.dailySpendCapUsd} reached`, false);
    }
  };
  const tutor = createTutor({ repo, llm, tts, config, prompts, checkBudget, breaker: new CircuitBreaker('llm') });
  return { tutor, repo, stt, prompts, db };
}

const Voice = z.enum(['server', 'browser', 'none']);
const StartBody = z.object({ name: z.string().max(60).default('Student'), studentId: z.string().max(80).optional(), voice: Voice.default('browser') });
const TurnBody = z.object({
  sessionId: z.string().max(80),
  turnId: z.string().min(1).max(80),
  transcript: z.string().max(4000),
  sttConfidence: z.number().min(0).max(1).optional(),
  voice: Voice.default('browser'),
});
const SttBody = z.object({ audio: z.string().min(1), format: z.string().max(10).default('wav') });

export async function buildServer(config: Config, overrides: Overrides = {}): Promise<FastifyInstance> {
  const { tutor, repo, stt } = buildTutor(config, overrides);
  const app = Fastify({ bodyLimit: 6 * 1024 * 1024, trustProxy: true });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  // The link is public and spends someone else's API key, so every API call needs the shared passcode.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/health' || !config.passcode) return;
    if (req.headers['x-passcode'] !== config.passcode) return reply.code(401).send({ error: 'Wrong or missing passcode' });
  });

  /** Per-request fault injection from the debug drawer, if the deployment allows it. */
  const faultsFor = (header: unknown) => (config.allowFaultInjection && typeof header === 'string' ? parseFaults(header) : null);
  const scoped = <T>(header: unknown, fn: () => Promise<T>): Promise<T> => {
    const faults = faultsFor(header);
    return faults ? withFaults(faults, fn) : fn();
  };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) logEvent('error', { message: (err as Error).message, stack: (err as Error).stack });
    return reply.code(status).send({ error: status >= 500 ? 'Something went wrong on our side' : (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async () => ({
    serverVoice: Boolean(config.openRouterKey),
    faultInjection: config.allowFaultInjection,
  }));

  app.post('/api/session', async (req) => {
    const body = StartBody.parse(req.body);
    return scoped(req.headers['x-faults'], () => tutor.startSession(body));
  });

  app.get('/api/session/:id', async (req) => tutor.resume((req.params as { id: string }).id));

  /** Streams one JSON event per line: decision, then segments as they are ready, then done. */
  app.post('/api/turn', async (req, reply) => {
    const body = TurnBody.parse(req.body);
    if (!repo.getSession(body.sessionId)) throw new NotFoundError(`No session ${body.sessionId}`);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    const write = (event: unknown) => {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) reply.raw.write(`${JSON.stringify(event)}\n`);
    };
    try {
      // A student who interrupts closes the connection; the turn still completes and is saved.
      await scoped(req.headers['x-faults'], () => tutor.runTurn(body, write));
    } catch (err) {
      logEvent('error', { where: 'turn', session_id: body.sessionId, turn_id: body.turnId, message: (err as Error).message });
      write({ type: 'error', message: 'I had a problem with that turn. Please try again.' });
    } finally {
      reply.raw.end();
    }
  });

  app.post('/api/stt', async (req, reply) => {
    const body = SttBody.parse(req.body);
    try {
      return await scoped(req.headers['x-faults'], () => stt.transcribe(Buffer.from(body.audio, 'base64'), body.format));
    } catch (err) {
      logEvent('stt_failed', { message: (err as Error).message });
      // The client falls back to the browser's recogniser or the text box.
      return reply.code(503).send({ error: 'Speech recognition is unavailable' });
    }
  });

  app.post('/api/session/:sessionId/turn/:turnId/latency', async (req) => {
    const { sessionId, turnId } = req.params as { sessionId: string; turnId: string };
    const { ms } = z.object({ ms: z.number().min(0).max(120_000) }).parse(req.body);
    repo.recordClientLatency(sessionId, turnId, ms);
    return { ok: true };
  });

  registerAdminRoutes(app, repo);

  const dist = path.join(REPO_ROOT, 'apps/web/dist');
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }
  return app;
}
