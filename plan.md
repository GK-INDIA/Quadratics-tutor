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
- No accounts, payments, multi-teacher dashboard, or production-scale infra. The public link is protected by one shared passcode, because it spends our OpenRouter key.
- No perfect math handwriting recognition.

## 3. Stack

- Frontend: React + Vite + TypeScript + Tailwind + KaTeX.
- Backend: Node + TypeScript + Fastify + Zod.
- DB: SQLite via better-sqlite3. Easy to inspect, enough for prototype. Migrations run on start; no seed step, because the curriculum is code, not rows.
- LLM: OpenRouter via `fetch`. Gemini 2.5 Flash for evaluator and generator, with GPT-4.1 mini as the OpenRouter fallback model.
- STT: OpenRouter, Whisper Large V3 Turbo. The browser's `SpeechRecognition` is the fallback.
- TTS: OpenRouter, Gemini 3.8 Flash TTS. The browser's `speechSynthesis` is the fallback.
- Evals: Vitest + custom runner. One command: `pnpm eval`.
- Simulations: TypeScript script using OpenRouter to role-play students.
- Hosting: one Docker image on Render's free plan.

## 4. Architecture

The LLM does not own progress. The backend owns a deterministic teaching state machine, and the maths is graded by code.

Per turn:
1. Student speaks (tap to start, tap to stop).
2. STT converts to text. Typing is always available.
3. `POST /api/turn` sends session ID + a turn ID + transcript.
4. Backend loads session state and concept progress.
5. Evaluator LLM reads what was said: intent, the extracted answer, whether reasoning was shown, a misconception tag, and how confident it is that it heard correctly.
6. Grader (code) marks the extracted answer correct / partial / wrong / ungradable.
7. Decision engine (code) chooses: teach / next_check / probe / move_on / reteach / scaffold / needs_review / hint / confirm / repeat / explain_why / redirect / reprompt / finish.
8. Generator LLM writes the feedback or re-teach as one JSON line per sentence, each with its own whiteboard operations. Guards check every line before it is spoken.
9. TTS turns each sentence into audio, in parallel, played in order.
10. Backend commits the turn, attempt, decision, board events and progress in one transaction.
11. The response is streamed as events: the decision first, then each sentence with its audio and board operations, then progress.

Why this shape:
- Deterministic progress is testable.
- LLM handles language and reading what was said, not state and not marking.
- Check questions come from the item bank, so the question always matches what the grader expects.
- Whiteboard commands are replayable.
- Evals can assert on structured decisions.

## 5. Commands

```bash
pnpm install
cp .env.example .env     # add OPENROUTER_API_KEY
pnpm dev                 # starts api + web
pnpm test                # unit tests, no key needed
pnpm eval                # regression eval suite, 13 scenarios x 3 runs
pnpm eval:mutation       # the suite must fail against deliberately worse prompts
pnpm simulate            # LLM-played students; add --persona=struggling for one
pnpm eval --offline      # fallback-path scenarios only, no key needed
```

## 6. Milestones

### Day 1 — Skeleton + one concept end-to-end

- [x] Create private repo and invite required emails. *(repo created; invites still to send)*
- [x] Scaffold pnpm workspace: web, api, shared, curriculum.
- [x] Add SQLite schema and migration.
- [x] Implement `POST /api/session` and `POST /api/turn`.
- [x] Build browser STT/TTS wrapper.
- [x] Build whiteboard component with `write`, `equation`, `highlight`, `clear`.
- [x] Implement one concept: Standard form.
- [x] End-to-end: student speaks, LLM evaluates, decision made, tutor speaks, whiteboard updates.

### Day 2 — All six concepts + progress tracking

- [x] Add curriculum files for:
  - Standard form and recognising a quadratic.
  - What a root is; checking a root by substitution.
  - Solving by factorisation.
  - Quadratic formula.
  - Discriminant and nature of roots.
  - Word problems.
- [x] For each concept define objectives, teaching strategies, checks, expected answers, misconceptions, reteach variants.
- [x] Implement progress view: concept status, attempts, correct attempts, explanations used.
- [x] Decision engine rules for move_on / reteach / scaffold.
- [x] Return `decision.reason` in every response.
- [x] Add progress rail in UI.

### Day 3 — Evals, failure handling, simulations

- [x] Write 8–12 deep eval scenarios. *(13, each says which regression it catches)*
- [x] Implement `pnpm eval` runner with structured assertions.
- [x] Add failure evals: timeout, invalid JSON, provider down.
- [x] Implement retry, JSON repair, circuit breaker, offline fallback.
- [x] Add LLM student simulations: nine personas, with a hidden knowledge state so false-advance rate can be measured.
- [x] Generate session reports: reteach rate, turns per concept, mastery rate, false-advance rate.
- [x] Mutation check: confirm the eval suite fails on sabotaged prompts.

### Day 4 — DESIGN.md, deploy, polish

- [x] Write DESIGN.md.
- [ ] Deploy API + web to a public link (Render free plan).
- [x] Add README with setup and test instructions.
- [ ] Record a short demo script.
- [ ] Final eval run on deployed model config.
- [ ] Re-measure latency on the deployed instance and update DESIGN.md.
- [ ] Verify repo is private, and invite the two reviewers.

## 7. API contract

### `POST /api/session`

```json
{ "name": "Aarav", "studentId": "stu_...", "voice": "server" }
```

`studentId` is optional and is how progress carries over to a later session. `voice` is `server` (audio comes back with each sentence) or `browser` (the client speaks the text itself).

Response:

```json
{
  "sessionId": "ses_...",
  "studentId": "stu_...",
  "studentName": "Aarav",
  "events": [ /* same event types as a turn, below */ ]
}
```

### `POST /api/turn`

```json
{
  "sessionId": "ses_...",
  "turnId": "client-generated uuid",
  "transcript": "x equals 2 is a root because 4 minus 4 equals 0",
  "sttConfidence": 0.9,
  "voice": "server"
}
```

The response is a stream of newline-delimited JSON events, so the first sentence can be spoken while the rest is still being written. Sending the same `turnId` again replays the stored result instead of running the turn twice.

```json
{ "type": "decision",
  "evaluation": { "intent": "answer", "answer": { "boolean": true, "numbers": null, "coefficients": null, "choice": null },
                  "showedReasoning": true, "reasoningSound": true, "misconception": null, "confidence": 0.92 },
  "grade": "correct",
  "decision": {
    "action": "next_check",
    "reasonCode": "first_check_correct",
    "reason": "That's correct: yes, because it rearranges to x squared minus four x minus five equals zero. One right answer could be luck, so I'm asking a second question of a different kind before we move on.",
    "counterfactual": "If that had been wrong, I'd have explained the idea a different way.",
    "nextConceptId": null, "strategyId": null, "itemId": "sf_cancels_no",
    "evidence": { "gradedItemId": "sf_rearrange_yes", "grade": "correct", "correct": 1, "wrong": 0 },
    "policyVersion": "policy-v1" } }

{ "type": "segment", "index": 0,
  "segment": { "say": "That's right. Here is one more.",
               "board": [ { "op": "highlight", "target": "q" } ] },
  "audio": "<base64>" }

{ "type": "done", "progress": [ ... ], "degraded": [], "timings": { "evaluate_ms": 1300, ... } }
```

Whiteboard operations are `clear`, `write {id, text}`, `equation {id, latex}` and `highlight {target, part?}`. There are no coordinates: blocks flow top to bottom in the order written. A part of an equation is marked in its LaTeX as `\hl{name}{...}` and highlighted by name, so a term that appears twice is not ambiguous.

## 8. Curriculum model

Each concept is a TypeScript file in `curriculum/v1/`, validated by a Zod schema at startup, so a malformed file stops the server instead of failing a student's turn.

```ts
{
  id: "discriminant",
  order: 5,
  title: "The discriminant and the nature of roots",
  objectives: [...],
  misconceptions: {
    negative_means_negative_roots: {
      label: "thinking a negative discriminant means the roots are negative numbers",
      strategy: "under_the_root"      // the explanation that addresses it best
    }
  },
  strategies: [                       // first = initial teach, the rest = re-teach variants
    { id: "three_cases", label: "the three cases", script: [ { say, board: [...] } ] }
  ],
  items: [                            // check questions, never generated by the model
    {
      id: "d_nature_negative",
      say: "For x squared plus two x plus five equals zero, ...",
      board: [...],
      answer: { type: "choice", value: "no_real", options: ["two_distinct", "equal", "no_real"] },
      expected: "no real roots, because the discriminant is minus sixteen",
      hints: ["...", "..."]
    }
  ],
  scaffold: { strategy: {...}, items: [...] }   // simpler, broken-down checks after two misses
}
```

## 9. Decision engine

Rules are simple and explainable, and live in `packages/shared/src/policy.ts` with no I/O:

- A concept is mastered after 2 correct checks, the second a different question from the first.
- A correct answer given with no reasoning is probed ("how did you get that?") before it counts.
- If wrong or partial: `reteach` with a strategy not used before, choosing the one mapped to the misconception first, and ask a new question.
- Second miss: `scaffold` with a smaller, guided check. Passing it returns to a full question.
- Third miss: `needs_review`. Move on, mark the concept weak, and revisit it at the start of the next session, opening with an explanation and a question the student has not had.
- Correct answers reset after a miss, so mastery means correct checks in a row after the last re-teach.
- "I don't know" and "just tell me the answer" get hints, not answers; a miss is counted only when the hints run out.
- If the evaluator was not confident it heard correctly, confirm or ask again. A transcript the tutor was not sure of is never graded.
- Off-topic, skip requests and instructions hidden in an answer change nothing about progress.
- If the LLM fails: read plain answers by rule, grade in code, teach from the authored script, and ask for a simple answer if even that fails. Mastery reached this way is recorded as `needs_review`, because reasoning could not be checked.

Every decision carries a plain-language reason, the evidence, and what would have happened otherwise. All of it is produced by code, not the model. Example:
> "That's the second miss on 'Solving by factorisation', so I'm breaking it into smaller steps and asking a simpler question. If you'd got it right, we'd have carried on with the normal check questions."

## 10. Evals

Eval scenario format (`evals/scenarios/*.yaml`):

```yaml
id: negative-discriminant-misconception
catches: >-
  Losing the specific correction for the most common discriminant error ...
concept: discriminant
given:                         # starting state
  itemId: d_nature_negative
turns:
  - student: The discriminant is minus sixteen, so it has two negative roots.
    expect:
      grade: wrong
      action: reteach
      misconception: [negative_means_negative_roots]
      strategy_in: [under_the_root]
      ends_with_question: true
      judge:                   # only for what code cannot check
        - The tutor explicitly corrects the idea that a negative discriminant means negative roots.
```

Assertions are on structure: decision, reason code, grade, misconception, "a strategy not used before", "a question not asked before", progress unchanged, fallbacks used. Exact wording is never asserted. An LLM judge (a different model from the tutor) is used only for qualities such as "addresses this student's mistake".

Scenarios:
- Correct, explained answer advances.
- Re-teach targets the student's actual misconception.
- A second miss gets a new approach, then scaffold.
- A lucky guess is probed, and a bluff is re-taught.
- Negative discriminant read as negative roots.
- "Why are we doing this again?" cites the real evidence.
- Instructions hidden in an answer, and skip requests, change nothing.
- A garbled or unsettled answer is not marked wrong.
- "Just tell me the answer" gets hints; the third "I don't know" re-teaches.
- Quadratic formula: a sign slip under the root is named and corrected.
- Word problem: both roots given, negative one not rejected.
- An equivalent answer form is accepted.
- LLM timeout and garbage fall back safely.

`pnpm eval` runs each scenario three times against the real models and compares with `evals/baseline.json`. `pnpm eval:mutation` runs the suite against deliberately sabotaged prompts (always agree, obey instructions, one stock reply, symbols in speech) and fails if any of them pass. Both run in CI on changes to prompts, curriculum or the policy.

## 11. Failure handling

- Timeouts per stage: STT 10s, evaluator 6s, generator first token 4s, TTS 15s per sentence. One retry with jitter, not two: every retry is more silence.
- Invalid JSON or off-schema: one repair retry that feeds the validation error back, then fall back.
- Provider down: circuit breaker, and OpenRouter routes to the fallback model.
- All LLM down: rules read plain answers, code grades, and the authored script teaches.
- Spend cap reached: same offline mode.
- STT failure: the browser's recogniser, then the text box.
- TTS failure: the browser's voice, and the text is always on screen.
- A failed turn commits nothing: progress and state are exactly as before, and the tutor says so.
- A model line with a JSON typo keeps its sentence and loses only its board changes; one bad line never ends the reply.
- Generated speech is rejected if it contains symbols, markup or runs long. Board operations that point at nothing are dropped, and equations that do not render are dropped, rather than the sentence.
- Faults can be injected per request from the debug drawer, or for the whole process with `FAULT_INJECT`.

Every failure is logged with session ID, turn ID, model, prompt version and error type.

## 12. Observability

Per turn log (one JSON line, and the same content in the `turns` table):
- session_id, turn_id, student_id, concept, phase.
- STT confidence, evaluator intent and confidence.
- Grade, action, reason code, misconception.
- Models actually used, prompt / policy / curriculum versions.
- Which stages fell back, and why.
- Per-stage timings, tokens, cost.
- Whiteboard command count.
- Raw LLM requests and responses in `llm_calls`.

Alert on:
- p95 end-of-speech to first audio > 5s.
- LLM error rate > 5%.
- JSON parse failure > 2%.
- Fallback rate > 5%.
- Nightly eval pass rate below baseline.
- Reteach rate > 70% on any concept.
- Daily spend near the cap.

## 13. Latency

Measured locally on 12 Oct 2026 with the shipped models (not yet on the deployed instance):
- STT: ~0.8s for a short clip.
- Evaluator: p50 1.6s, p95 2.9s.
- First generated sentence: ~2.6s after the turn starts.
- TTS (Gemini 3.8 Flash): ~4s per sentence, up to 6s with several in parallel.
- Turn start to first audio, server side: p50 6.1s, p95 10.9s.

This is slower than the original budget. TTS is the largest part, and a faster TTS model is a one-line change.

Perceived latency fixes:
- Show the transcript at once, and "Got it, let me think..." if nothing is said within 1.5s.
- Render the board with each sentence, not at the end.
- Fast model for evaluation; most of what is said is authored and never waits for the generator.
- Cache audio for authored sentences.
- Sentence-level streaming: the generator emits one sentence per line, and TTS starts on each as it completes.
- Tapping the microphone stops the tutor mid-sentence.

## 14. Metrics

North star: mastery rate per concept after <= 2 attempts, always read next to retention: the share of mastered concepts that are still passed at the next session's review. Mastery alone goes up if the tutor gets lenient.

First metric to watch: reteach rate and attempts per concept.

Also track:
- False-advance rate in simulation.
- Session completion rate.
- Time per concept.
- Cost per mastered concept.
- p95 end-of-speech to first audio.
- Share of turns that are `reprompt` or `confirm`.

## 15. DESIGN.md outline

- Data model: append-only turns, progress keyed by student, decision stored as data, version pinning.
- Iterability: pin prompt/curriculum/policy/model per session; switch at concept boundaries; rollback by pointing at the previous version.
- Observability: per-turn logs, alerts, eval regression, simulation invariants.
- Latency: where time goes and what to do.
- Metrics: numbers and first metric.
- What's ugly: prompt pinning not enforced, database lost on restart on the free plan, generated maths not verified, single process, tap-to-talk, limited items.

## 16. Risks

- LLM returns inconsistent JSON. Mitigate with Zod schemas, repair, and guards.
- The LLM marks maths wrongly. Mitigate by grading in code.
- A lenient model passes students who do not understand. Mitigate with probes, the lucky-guess eval, the mutation check and false-advance rate in simulation.
- Voice APIs differ by browser and by provider. Mitigate with a text input fallback and server-side STT.
- Voice loop is slow. Mitigate with sentence streaming now; faster TTS model and streaming STT next.
- Free hosting sleeps and loses its disk. Mitigate with a keep-warm monitor, and say so in DESIGN.md.
- Too many concepts too shallow. Mitigate by making each concept's checks meaningful.
- Evals too brittle. Mitigate by asserting decision fields, not exact speech or exact strategy names.

## 17. Decisions log

- **Deterministic state machine, not an LLM agent.** Testable, and the "why" is a record, not a guess.
- **Code grades the maths.** An arithmetic slip by the model must never become a mastery decision.
- **Check questions are authored.** The question and the grader's answer cannot drift apart.
- **OpenRouter for speech too, browser as fallback.** Browser recognition is Chrome-only and weak on spoken maths.
- **Streaming events, not one JSON.** The first sentence can be spoken while the rest is being written.
- **Flow layout and named highlights, no coordinates.** Models place things badly, and string matching a highlight is ambiguous.
- **SQLite, one process.** Enough for a prototype; the cost is stated in DESIGN.md.
- **Render free plan.** The only free option with a public HTTPS URL; it sleeps and has no disk.

## 18. Acceptance criteria

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
