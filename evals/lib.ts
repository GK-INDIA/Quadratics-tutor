import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { getConcept } from '@tutor/curriculum';
import { type Decision, type Segment, type TurnEvent, TutorState, findItem, openConcept } from '@tutor/shared';
import YAML from 'yaml';
import { z } from 'zod';
import { buildTutor } from '../apps/api/src/app';
import { type Config, REPO_ROOT, loadConfig } from '../apps/api/src/config';
import { Trace } from '../apps/api/src/observability/trace';
import { parseFaults, withFaults } from '../apps/api/src/providers/faults';
import { createOpenRouterLLM } from '../apps/api/src/providers/llm';
import { CircuitBreaker } from '../apps/api/src/providers/resilience';
import { openDb } from '../apps/api/src/store/db';
import { judge } from './judge';

const Expect = z
  .object({
    intent: z.string(),
    grade: z.string().nullable(),
    /** The decision must be one of these. */
    action: z.union([z.string(), z.array(z.string())]),
    reason_code: z.union([z.string(), z.array(z.string())]),
    /** The evaluator's misconception tag must be one of these. */
    misconception: z.array(z.string()),
    /** Re-teach strategy differs from every strategy used before this turn. */
    strategy_is_new: z.boolean(),
    strategy_in: z.array(z.string()),
    /** The next question differs from every question asked before this turn. */
    item_is_new: z.boolean(),
    /** correct/wrong counters, open question and concept status are exactly as before the turn. */
    progress_unchanged: z.boolean(),
    concept_status: z.string(),
    /** Stages allowed to have fallen back. [] means the turn must be clean. */
    degraded: z.array(z.string()),
    degraded_includes: z.array(z.string()),
    /** Case-insensitive regexes over everything the tutor said. */
    says: z.array(z.string()),
    says_not: z.array(z.string()),
    /** The tutor highlighted something on the board. */
    highlights: z.boolean(),
    /** The last thing said is the check question the decision points at. */
    ends_with_question: z.boolean(),
    /** Plain-language criteria for the LLM judge. */
    judge: z.array(z.string()),
  })
  .partial()
  .strict();

export const Scenario = z
  .object({
    id: z.string(),
    /** The regression this scenario exists to catch. Required: a scenario nobody can justify gets deleted. */
    catches: z.string().min(20),
    concept: z.string(),
    /** Overrides applied to the state right after the concept is opened. */
    given: TutorState.partial().optional(),
    /** Runs without a model (rules and scripts only). */
    offline_ok: z.boolean().default(false),
    turns: z.array(z.object({ student: z.string(), faults: z.string().optional(), expect: Expect })).min(1),
  })
  .strict();
export type Scenario = z.infer<typeof Scenario>;

export function loadScenarios(dir = path.join(REPO_ROOT, 'evals/scenarios')): Scenario[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => Scenario.parse(YAML.parse(readFileSync(path.join(dir, f), 'utf8'))));
}

export interface Check {
  turn: number;
  name: string;
  pass: boolean;
  detail: string;
}

export interface RunResult {
  scenario: string;
  pass: boolean;
  checks: Check[];
  costUsd: number;
}

const oneOf = (want: string | string[], got: string | null) => (Array.isArray(want) ? want : [want]).includes(got ?? 'null');

/** Runs one scenario once against a fresh in-memory tutor and returns every check it made. */
export async function runScenario(scenario: Scenario, config: Config, useJudge: boolean): Promise<RunResult> {
  process.env.LOG_SILENT = 'true';
  const built = buildTutor(config, { db: openDb(':memory:') });
  const { tutor, repo, prompts } = built;
  const concept = getConcept(scenario.concept);
  const checks: Check[] = [];
  const judgeTrace = new Trace();
  const judgeDeps = { llm: createOpenRouterLLM(config), breaker: new CircuitBreaker('judge'), config, prompts, checkBudget: () => {} };

  const { sessionId } = await tutor.startSession({ name: 'Eval', voice: 'none', isSimulated: true });
  const opened = openConcept(concept).state;
  repo.db.prepare('UPDATE sessions SET state_json = ? WHERE id = ?').run(JSON.stringify({ ...opened, ...scenario.given }), sessionId);

  for (const [index, turn] of scenario.turns.entries()) {
    const before = repo.getSession(sessionId)!.state;
    const item = findItem(concept, before.itemId);
    const events: TurnEvent[] = [];
    const run = () => tutor.runTurn({ sessionId, turnId: `t${index}`, transcript: turn.student, voice: 'none' }, (e) => events.push(e));
    await (turn.faults ? withFaults(parseFaults(turn.faults), run) : run());

    const decided = events.find((e) => e.type === 'decision') as Extract<TurnEvent, { type: 'decision' }>;
    const done = events.find((e) => e.type === 'done') as Extract<TurnEvent, { type: 'done' }>;
    const segments: Segment[] = events.flatMap((e) => (e.type === 'segment' ? [e.segment] : []));
    const decision: Decision = decided.decision;
    const after = repo.getSession(sessionId)!.state;
    const said = segments.map((s) => s.say).join(' ');
    const e = turn.expect;
    const add = (name: string, pass: boolean, detail: string) => checks.push({ turn: index, name, pass, detail });

    if (e.intent !== undefined) add('intent', decided.evaluation?.intent === e.intent, `got ${decided.evaluation?.intent}`);
    if (e.grade !== undefined) add('grade', decided.grade === e.grade, `got ${decided.grade}`);
    if (e.action !== undefined) add('action', oneOf(e.action, decision.action), `got ${decision.action} (${decision.reasonCode})`);
    if (e.reason_code !== undefined) add('reason_code', oneOf(e.reason_code, decision.reasonCode), `got ${decision.reasonCode}`);
    if (e.misconception !== undefined) add('misconception', e.misconception.includes(decided.evaluation?.misconception ?? 'null'), `got ${decided.evaluation?.misconception}`);
    if (e.strategy_is_new) add('strategy_is_new', !!decision.strategyId && !before.strategiesUsed.includes(decision.strategyId), `got ${decision.strategyId}, used ${before.strategiesUsed}`);
    if (e.strategy_in !== undefined) add('strategy_in', e.strategy_in.includes(decision.strategyId ?? ''), `got ${decision.strategyId}`);
    if (e.item_is_new) add('item_is_new', !!decision.itemId && !before.usedItemIds.includes(decision.itemId), `got ${decision.itemId}`);
    if (e.progress_unchanged) {
      const same = after.itemId === before.itemId && after.correct === before.correct && after.wrong === before.wrong && after.conceptId === before.conceptId;
      add('progress_unchanged', same, `before ${before.itemId}/${before.correct}/${before.wrong}, after ${after.itemId}/${after.correct}/${after.wrong}`);
    }
    if (e.concept_status !== undefined) {
      const status = done.progress.find((p) => p.conceptId === concept.id)?.status;
      add('concept_status', status === e.concept_status, `got ${status}`);
    }
    if (e.degraded !== undefined) add('degraded', done.degraded.every((d) => e.degraded!.some((ok) => d.startsWith(ok))), `got [${done.degraded}]`);
    for (const want of e.degraded_includes ?? []) add(`degraded_includes ${want}`, done.degraded.some((d) => d.startsWith(want)), `got [${done.degraded}]`);
    for (const pattern of e.says ?? []) add(`says /${pattern}/`, new RegExp(pattern, 'i').test(said), said.slice(0, 160));
    for (const pattern of e.says_not ?? []) add(`says_not /${pattern}/`, !new RegExp(pattern, 'i').test(said), said.slice(0, 160));
    if (e.highlights) add('highlights', segments.some((s) => s.board.some((op) => op.op === 'highlight')), `${segments.flatMap((s) => s.board).length} board ops`);
    if (e.ends_with_question) {
      const next = findItem(decision.nextConceptId ? getConcept(decision.nextConceptId) : concept, decision.itemId);
      add('ends_with_question', !!next && (segments.at(-1)?.say ?? '').endsWith(next.say), segments.at(-1)?.say.slice(0, 80) ?? '(nothing said)');
    }
    if (e.judge?.length) {
      if (!useJudge) add('judge', true, 'skipped (no model)');
      else {
        try {
          const verdicts = await judge(judgeDeps, judgeTrace, { concept, item, transcript: turn.student, decision, segments, criteria: e.judge });
          for (const v of verdicts) add(`judge: ${v.criterion}`, v.pass, v.why);
        } catch (err) {
          add('judge', false, `judge failed: ${(err as Error).message}`);
        }
      }
    }
  }

  const costUsd = (repo.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS s FROM turns').get() as { s: number }).s + judgeTrace.costUsd;
  return { scenario: scenario.id, pass: checks.every((c) => c.pass), checks, costUsd };
}

export function evalConfig(overrides: Partial<Config> = {}): Config {
  return loadConfig({ faultInject: '', dailySpendCapUsd: 1000, ...overrides });
}

/** Runs tasks with at most `limit` in flight, preserving order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}
