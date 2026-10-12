import type { FastifyInstance } from 'fastify';
import type { Repo } from '../store/repo';

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

/** Numbers behind the admin page. Simulated sessions are reported separately so they never flatter real usage. */
export function computeMetrics(repo: Repo, simulated: boolean) {
  const sim = simulated ? 1 : 0;
  const turns = repo.db
    .prepare(
      `SELECT t.concept_id, t.decision_json, t.degraded, t.timings_json, t.client_first_audio_ms, t.cost_usd
       FROM turns t JOIN sessions s ON s.id = t.session_id
       WHERE s.is_simulated = ? AND t.id != 'start' ORDER BY t.created_at DESC LIMIT 2000`,
    )
    .all(sim) as any[];

  const byConcept: Record<string, { attempts: number; reteaches: number }> = {};
  let degraded = 0;
  const serverMs: number[] = [];
  const clientMs: number[] = [];
  const actions: Record<string, number> = {};
  for (const t of turns) {
    const decision = JSON.parse(t.decision_json);
    actions[decision.action] = (actions[decision.action] ?? 0) + 1;
    const c = (byConcept[t.concept_id] ??= { attempts: 0, reteaches: 0 });
    if (decision.evidence?.grade) c.attempts += 1;
    if (['reteach', 'scaffold', 'needs_review'].includes(decision.action)) c.reteaches += 1;
    if (JSON.parse(t.degraded).length > 0) degraded += 1;
    const timings = JSON.parse(t.timings_json);
    if (typeof timings.first_emit_ms === 'number') serverMs.push(timings.first_emit_ms);
    if (typeof t.client_first_audio_ms === 'number') clientMs.push(t.client_first_audio_ms);
  }

  const statuses = repo.db
    .prepare(
      `SELECT p.concept_id, p.status, COUNT(*) AS n FROM concept_progress p
       WHERE p.student_id IN (SELECT student_id FROM sessions WHERE is_simulated = ?)
       GROUP BY p.concept_id, p.status`,
    )
    .all(sim) as { concept_id: string; status: string; n: number }[];

  return {
    turns: turns.length,
    degradedRate: turns.length ? degraded / turns.length : 0,
    firstResponseMs: { p50: percentile(serverMs, 50), p95: percentile(serverMs, 95) },
    clientFirstAudioMs: { p50: percentile(clientMs, 50), p95: percentile(clientMs, 95), samples: clientMs.length },
    actions,
    reteachRateByConcept: Object.fromEntries(
      Object.entries(byConcept).map(([id, c]) => [id, c.attempts ? c.reteaches / c.attempts : 0]),
    ),
    statusByConcept: statuses,
    spendTodayUsd: repo.spendToday(),
  };
}

export function registerAdminRoutes(app: FastifyInstance, repo: Repo) {
  app.get('/api/admin/metrics', async () => ({ real: computeMetrics(repo, false), simulated: computeMetrics(repo, true) }));

  app.get('/api/admin/sessions', async () =>
    repo.db
      .prepare(
        `SELECT s.id, s.started_at AS startedAt, s.status, s.is_simulated AS isSimulated, s.prompt_version AS promptVersion,
                st.name AS student, (SELECT COUNT(*) FROM turns t WHERE t.session_id = s.id) AS turns
         FROM sessions s JOIN students st ON st.id = s.student_id ORDER BY s.started_at DESC LIMIT 100`,
      )
      .all(),
  );

  /** Full replay of a session: what was heard, what was decided and why, what was said and drawn. */
  app.get('/api/admin/sessions/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    return { session: repo.getSession(id), turns: repo.listTurns(id) };
  });
}
