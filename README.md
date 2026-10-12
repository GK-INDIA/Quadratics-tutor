# Quadratics Tutor

An AI tutor that teaches quadratic equations (NCERT Class 10) by voice, with a whiteboard. It explains a concept, asks a check question, and then decides whether to move on or re-teach a different way, and it can say why.

- Design write-up: [DESIGN.md](DESIGN.md)
- Plan: [plan.md](plan.md)

## Run it

Needs Node 22+ and pnpm.

```bash
pnpm install
cp .env.example .env        # add OPENROUTER_API_KEY
pnpm dev                    # API on :8787, web on :5173
```

Without an API key it still runs, in offline mode: explanations come from the authored scripts, answers are read by simple rules, and the browser's own voice is used. That is the same path the tutor falls back to when the provider is down.

## One-command checks

| Command | What it does | Needs a key |
|---|---|---|
| `pnpm test` | Unit tests: grader, policy, curriculum, orchestrator, failure paths | no |
| `pnpm eval` | Regression suite: 13 scenarios × 3 runs against the real models, compared with `evals/baseline.json` | yes |
| `pnpm eval --offline` | The scenarios that exercise the fallback paths only | no |
| `pnpm eval:mutation` | Runs the suite against deliberately worse prompts and fails if any of them pass | yes |
| `pnpm simulate` | LLM-played student personas with hidden knowledge states; reports false-advance rate and invariant violations | yes |
| `pnpm simulate --offline` | Scripted students against the offline tutor | no |

`pnpm eval --update-baseline` records the current pass rates. Commit `evals/baseline.json` together with the change that justified it.

## How a turn works

```
speech → STT → evaluator LLM → grader (code) → policy (code) → generator LLM → guards → TTS
                what was said    is it right     what next, why   say it          safe to speak?
```

- **The model never decides progress.** It reports what the student said; [the grader](packages/shared/src/grader.ts) checks the maths and [the policy](packages/shared/src/policy.ts) decides what happens next and records the reason.
- **Check questions are never generated.** They come from the [curriculum](curriculum/v1), so each one matches the answer the grader expects.
- **Every decision is explainable.** Ask the tutor "why are we doing this again?" or look at the "Why the tutor did that" panel.

## Layout

```
apps/web            React + Vite + Tailwind + KaTeX: whiteboard, microphone, progress rail, why panel, debug drawer
apps/api            Fastify
  src/tutor         orchestrator, evaluate, generate, guards, offline heuristic
  src/providers     OpenRouter LLM / STT / TTS, timeouts, retry, circuit breaker, fault injection
  src/store         SQLite schema and repository
packages/shared     Zod schemas, grader, teaching policy (pure, no I/O)
curriculum/v1       the six subconcepts: strategies, check questions, hints, misconceptions
prompts/v1          evaluator, generator, judge, simulator
evals               scenarios, runner, judge, baseline, mutation test
simulations         personas and runner
tests               unit tests
```

## Trying the failure handling

Open "Under the hood" in the app and tick a fault (LLM times out, LLM returns garbage, speech services down). It applies to your requests only. The lesson should carry on, and the panel shows which stage fell back.

The same faults can be set for the whole process with `FAULT_INJECT=llm_timeout:0.3,tts_down:1`.

## Deploy

One Docker image; the API serves the built web app. It is deployed on Render's free plan from [render.yaml](render.yaml):

1. In Render, choose **New > Blueprint** and pick this repository.
2. Enter `OPENROUTER_API_KEY` and `APP_PASSCODE` when prompted.
3. Point a free uptime monitor at `/api/health` every 10 minutes, so the service does not sleep.

Two limits of the free plan: the service sleeps after 15 minutes without traffic (the monitor avoids this), and there is no persistent disk, so the SQLite file, and with it student progress and session replays, is lost whenever the instance restarts or redeploys. On any host with a volume, set `DB_PATH` to a path on it.

`APP_PASSCODE` protects the public link, and `DAILY_SPEND_CAP_USD` switches the tutor to offline mode once the day's spend reaches the cap.

Session replays and metrics are at `/#admin`.
