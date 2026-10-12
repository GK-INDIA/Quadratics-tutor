/**
 * Regression eval suite.  pnpm eval [--runs=3] [--only=id] [--offline] [--update-baseline]
 *
 * Runs every scenario against the real evaluator and generator, several times,
 * and compares pass rates with evals/baseline.json. Exits non-zero if a
 * scenario fails outright or does worse than the baseline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, loadPrompts } from '../apps/api/src/config';
import { type RunResult, type Scenario, evalConfig, loadScenarios, pool, runScenario } from './lib';

/** A scenario passes if it passes in at least this share of runs; one flaky run in three is tolerated, two are not. */
export const PASS_THRESHOLD = 2 / 3;
const BASELINE = path.join(REPO_ROOT, 'evals/baseline.json');

export interface ScenarioSummary {
  id: string;
  passRate: number;
  runs: RunResult[];
}

export async function runSuite(scenarios: Scenario[], runs: number, config = evalConfig()): Promise<ScenarioSummary[]> {
  const useJudge = Boolean(config.openRouterKey);
  return pool(scenarios, 4, async (scenario) => {
    const results: RunResult[] = [];
    for (let i = 0; i < runs; i++) results.push(await runScenario(scenario, config, useJudge));
    return { id: scenario.id, passRate: results.filter((r) => r.pass).length / runs, runs: results };
  });
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : (hit.split('=')[1] ?? 'true');
}

async function main() {
  const config = evalConfig();
  const offline = arg('offline') === 'true';
  if (!config.openRouterKey && !offline) {
    console.error('OPENROUTER_API_KEY is not set. Add it to .env, or run `pnpm eval --offline` to check the fallback paths only.');
    process.exit(2);
  }
  const only = arg('only');
  const runs = Number(arg('runs') ?? (offline ? 1 : 3));
  const scenarios = loadScenarios().filter((s) => (!only || s.id === only) && (!offline || s.offline_ok));
  const prompts = loadPrompts(config.promptDir);

  console.log(`Evaluating ${scenarios.length} scenarios x ${runs} runs`);
  console.log(`  prompts ${prompts.version} | evaluator ${config.models.evaluator} | generator ${config.models.generator} | judge ${config.models.judge}\n`);

  const started = Date.now();
  const summaries = await runSuite(scenarios, runs, offline ? evalConfig({ openRouterKey: '' }) : config);
  const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).passRates ?? {} : {};

  let failed = 0;
  for (const s of summaries) {
    const base = baseline[s.id];
    const belowThreshold = s.passRate < PASS_THRESHOLD;
    const regressed = !offline && base !== undefined && s.passRate < base;
    const mark = belowThreshold ? 'FAIL' : regressed ? 'WORSE' : 'ok';
    if (belowThreshold || regressed) failed += 1;
    console.log(`${mark.padEnd(5)} ${s.id.padEnd(38)} ${Math.round(s.passRate * runs)}/${runs}${base !== undefined ? `  (baseline ${Math.round(base * 100)}%)` : ''}`);
    // Show each distinct failing check once, with what was actually observed.
    const seen = new Set<string>();
    for (const run of s.runs) {
      for (const c of run.checks.filter((x) => !x.pass)) {
        const key = `${c.turn}:${c.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`        turn ${c.turn + 1}  ${c.name}\n          -> ${c.detail}`);
      }
    }
  }

  const cost = summaries.reduce((sum, s) => sum + s.runs.reduce((a, r) => a + r.costUsd, 0), 0);
  const report = {
    at: new Date().toISOString(),
    promptVersion: prompts.version,
    models: config.models,
    runs,
    offline,
    passRates: Object.fromEntries(summaries.map((s) => [s.id, s.passRate])),
    costUsd: cost,
    details: summaries,
  };
  const outDir = path.join(REPO_ROOT, 'evals/results');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${report.at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log(`\n${summaries.length - failed}/${summaries.length} scenarios passed in ${Math.round((Date.now() - started) / 1000)}s, $${cost.toFixed(4)}`);
  console.log(`Full results: ${path.relative(REPO_ROOT, outFile)}`);

  if (arg('update-baseline') === 'true' && !offline) {
    const { details: _details, ...summary } = report;
    writeFileSync(BASELINE, `${JSON.stringify(summary, null, 2)}\n`);
    console.log('Baseline updated. Commit evals/baseline.json with the change that justified it.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv[1]?.endsWith('runner.ts')) void main();
