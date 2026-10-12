# AI Tutor: Quadratic Equations — Take-Home Plan

## 1. Goal

Build a web AI tutor that teaches NCERT Class 10 quadratic equations through voice and a whiteboard. The tutor must teach each of six subconcepts, check understanding, then either move on or re-teach differently and check again. Every decision must be explainable.

Deliverables:
- Private GitHub repo with access for akshay@cmpntech.com and nishchal@cmpntech.com.
- Public web link we can test.
- `DESIGN.md` covering data model, iterability, observability, latency, metrics, and what is ugly.
- Working prototype, eval suite, and plan.md.

## 2. Non-goals

- No realtime live voice model APIs. Use an STT -> LLM -> TTS pipeline.
- No full whiteboard editor. Only write text/equations and highlight terms.
- No auth, payments, multi-teacher dashboard, or production-scale infra.
- No perfect math handwriting recognition.

## 3. Stack

- Frontend: React + Vite + TypeScript + Tailwind + KaTeX.
- Backend: Node + TypeScript + Express/Fastify + Zod.
- DB: SQLite via better-sqlite3. Easy to inspect, enough for prototype.
- LLM: OpenRouter via `fetch`.
- STT: Browser `SpeechRecognition` / `webkitSpeechRecognition`.
- TTS: Browser `speechSynthesis`.
- Evals: Vitest + custom runner. One command: `pnpm eval`.
- Simulations: TypeScript script using OpenRouter to role-play students.

## 4. Architecture

The LLM does not own progress. The backend owns a deterministic teaching state machine.

Per turn:
1. Student speaks.
2. Browser STT converts to text.
3. `POST /turn` sends session ID + transcript.
4. Backend loads session and concept progress.
5. Evaluator LLM classifies answer: correct / partial / wrong + misconception.
6. Decision engine chooses: move_on / reteach / scaffold / needs_review.
7. Generator LLM produces tutor speech + whiteboard commands.
8. Backend persists turn, evaluation, decision, whiteboard events.
9. Response returns speech, whiteboard commands, and decision rationale.
10. Browser speaks and renders whiteboard.

Why this shape:
- Deterministic progress is testable.
- LLM handles language and classification, not state.
- Whiteboard commands are replayable.
- Evals can assert on structured decisions.

## 5. Commands

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev                 # starts api + web
pnpm eval                # regression eval suite
pnpm simulate --persona=confused --concept=discriminant
```

## 6. Milestones

### Day 1 — Skeleton + one concept end-to-end

- [ ] Create private repo and invite required emails.
- [ ] Scaffold pnpm workspace: web, api, shared, curriculum.
- [ ] Add SQLite schema and migration.
- [ ] Implement `POST /session` and `POST /turn`.
- [ ] Build browser STT/TTS wrapper.
- [ ] Build whiteboard component with `write`, `equation`, `highlight`, `clear`.
- [ ] Implement one concept: Standard form.
- [ ] End-to-end: student speaks, LLM evaluates, decision made, tutor speaks, whiteboard updates.

### Day 2 — All six concepts + progress tracking

- [ ] Add curriculum files for:
  - Standard form and recognising a quadratic.
  - What a root is; checking a root by substitution.
  - Solving by factorisation.
  - Quadratic formula.
  - Discriminant and nature of roots.
  - Word problems.
- [ ] For each concept define objectives, teaching strategies, checks, expected answers, misconceptions, reteach variants.
- [ ] Implement progress view: concept status, attempts, mastery score.
- [ ] Decision engine rules for move_on / reteach / scaffold.
- [ ] Return `decision.reason` in every response.
- [ ] Add progress rail in UI.

### Day 3 — Evals, failure handling, simulations

- [ ] Write 8–12 deep eval scenarios.
- [ ] Implement `pnpm eval` runner with structured assertions.
- [ ] Add failure evals: timeout, invalid JSON, provider down.
- [ ] Implement retry, JSON repair, circuit breaker, offline fallback.
- [ ] Add LLM student simulations: confused, overconfident, guesser, silent, advanced.
- [ ] Generate session reports: reteach rate, turns per concept, mastery rate.

### Day 4 — DESIGN.md, deploy, polish

- [ ] Write DESIGN.md.
- [ ] Deploy API + web to a public link.
- [ ] Add README with setup and test instructions.
- [ ] Record a short demo script.
- [ ] Final eval run on deployed model config.
- [ ] Make repo private and verify access.

## 7. API contract

### `POST /session`

```json
{ "studentName": "Aarav" }
```

Response:

```json
{
  "sessionId": "s_123",
  "currentConcept": "standard_form",
  "tutorSpeech": "Today we will learn to recognise quadratic equations.",
  "whiteboard": [
    { "op": "clear" },
    { "op": "write", "id": "title", "text": "Standard form", "x": 40, "y": 40 },
    { "op": "equation", "id": "eq1", "latex": "ax^2 + bx + c = 0", "x": 40, "y": 100 }
  ]
}
```

### `POST /turn`

```json
{
  "sessionId": "s_123",
  "transcript": "x equals 2 is a root because 4 minus 4 equals 0"
}
```

Response:

```json
{
  "tutorSpeech": "Correct. You substituted x = 2 and got zero, so it is a root.",
  "whiteboard": [
    { "op": "highlight", "target": "eq1", "term": "x = 2", "color": "yellow" },
    { "op": "write", "id": "step1", "text": "Substitute x = 2", "x": 40, "y": 180 }
  ],
  "evaluation": {
    "correct": true,
    "confidence": 0.92,
    "misconception": null
  },
  "decision": {
    "action": "move_on",
    "nextConcept": "factorisation",
    "reason": "Student correctly checked a root by substitution. Move to solving."
  }
}
```

## 8. Curriculum model

Each concept file exports:

```ts
{
  id: "discriminant",
  order: 5,
  title: "Discriminant and nature of roots",
  objectives: [...],
  teachingStrategies: ["definition", "number line", "example", "comparison"],
  checks: [
    {
      id: "d_positive",
      question: "If D = 9, how many real roots?",
      expected: "two distinct real roots",
      misconceptions: ["one root", "no real roots"]
    }
  ],
  reteachVariants: {
    visual: "...",
    algebraic: "...",
    example: "..."
  }
}
```

## 9. Decision engine

Rules are simple and explainable:

- If correct and attempts <= 2: `move_on`.
- If partial or wrong: `reteach` with a different strategy than last time.
- If wrong after 2 attempts: `scaffold` with simpler check.
- If wrong after 3 attempts: `needs_review`, move on but mark concept weak.
- If LLM fails: fallback to scripted reteach or ask student to repeat.

Every decision includes a reason. Example:
> "You added the terms instead of substituting x = 2. I am re-teaching substitution with a simpler example."

## 10. Evals

Eval scenario format:

```yaml
- id: discriminant-wrong
  concept: discriminant
  studentTurns:
    - "D=0 means no real roots."
  expected:
    evaluation.correct: false
    decision.action: reteach
    reteachStrategy: "visual number line"
    whiteboard.contains: "D = b^2 - 4ac"
```

Scenarios to include:
- Correct standard form recognition.
- Wrong standard form: says `a = 0` is allowed.
- Root check correct.
- Root check wrong: adds instead of substitutes.
- Factorisation reteach after partial answer.
- Quadratic formula correct substitution.
- Discriminant wrong: D = 0 means no roots.
- Word problem: student ignores negative root.
- LLM timeout fallback.
- Invalid JSON repair fallback.

`pnpm eval` starts the API in test mode, replays turns, and asserts structured fields. It should fail CI if pass rate drops.

## 11. Failure handling

- Timeout: 8s timeout, 2 retries with backoff.
- Invalid JSON: one repair prompt, then fallback.
- Provider down: circuit breaker, route to alternate OpenRouter model.
- All LLM down: offline scripted mode for current concept.
- STT failure: show text input fallback.
- TTS failure: show tutor text on whiteboard.

Log every failure with session ID, turn ID, model, prompt version, error type.

## 12. Observability

Per turn log:
- session_id, turn_id, concept, phase.
- STT confidence.
- LLM model, prompt_version, latency_ms, tokens, cost.
- Evaluation JSON.
- Decision JSON and reason.
- Whiteboard command count.
- Error type if any.

Alert on:
- p95 latency > 5s.
- LLM error rate > 5%.
- JSON parse failure > 2%.
- Eval pass rate drop > 10%.
- Reteach rate > 70%.

## 13. Latency

Voice loop budget:
- STT: ~0.3s.
- Network: ~0.1s.
- LLM evaluate + generate: ~1.5–3s.
- TTS: ~0.2s.

Perceived latency fixes:
- Immediately show "Got it, let me think..." on whiteboard.
- Render whiteboard before speech finishes.
- Use fast model for evaluation, stronger model only for reteach.
- Cache common explanations.
- Sentence-level TTS streaming.

## 14. Metrics

North star: mastery rate per concept after <= 2 attempts.

First metric to watch: average attempts per concept / reteach rate.

Also track:
- Session completion rate.
- Time per concept.
- Cost per session.
- p95 latency.
- Student retry rate.

## 15. DESIGN.md outline

- Data model: append-only turns, progress table, version pinning.
- Iterability: pin prompt/curriculum/model per session; switch at concept boundaries; rollback by active version.
- Observability: per-turn logs, alerts, eval regression.
- Latency: where time goes and what to do.
- Metrics: numbers and first metric.
- What's ugly: crude whiteboard, no handwriting, SQLite, no auth, limited misconceptions.

## 16. Risks

- LLM returns inconsistent JSON. Mitigate with Zod schemas and repair.
- Voice APIs differ by browser. Mitigate with text input fallback.
- Too many concepts too shallow. Mitigate by making each concept's checks meaningful.
- Evals too brittle. Mitigate by asserting decision fields, not exact speech.

## 17. Acceptance criteria

- All six subconcepts teachable.
- Student can speak and hear tutor.
- Whiteboard writes and highlights.
- Verify-and-reteach loop works.
- Decision reason returned every turn.
- `pnpm eval` runs with one command.
- LLM timeout/down handled.
- DESIGN.md complete.
- Private repo shared with required emails.
- Public web link works.
