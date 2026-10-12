# Design

A voice-and-whiteboard tutor for NCERT Class 10 quadratic equations. One idea shapes everything below:

**Code owns the pedagogy; the model owns the language.** The LLM tells us what the student said and phrases what the tutor says back. Whether an answer is right is decided by a grader in code, and what happens next (move on, re-teach, scaffold, park) is decided by a deterministic policy that records its reason. A turn runs like this:

```
speech → STT → evaluator LLM (what did they say?) → grader (is it right?) → policy (what next, and why?)
       → generator LLM (say it, adapted to this student) → guards → TTS → speech + whiteboard
```

Check questions are never generated. They come from an item bank, so the question asked always matches the answer the grader expects.

## Data model

SQLite, eight tables ([apps/api/src/store/db.ts](apps/api/src/store/db.ts)). The important ones:

```sql
students(id, name, created_at)

sessions(id, student_id, started_at, ended_at, status,
         state_json,                     -- the policy's state: open question, strategies used, counters
         prompt_version, curriculum_version, policy_version, model_config,   -- pinned at start
         is_simulated)

concept_progress(student_id, concept_id,   -- PK; keyed by student, not session
                 status,                   -- not_started | in_progress | mastered | needs_review
                 attempts, correct_attempts, strategies_used, last_misconception, next_review_at)

turns(session_id, id,                      -- PK; id is chosen by the client
      turn_index, concept_id, transcript, stt_confidence,
      evaluation_json, grade, decision_json, segments_json,
      models_used, degraded, timings_json, tokens_in, tokens_out, cost_usd,
      client_first_audio_ms, created_at)

attempts(turn_id, student_id, concept_id, item_id, raw, extracted_json, grade, grader)
misconceptions(turn_id, student_id, concept_id, type, evidence)
whiteboard_events(session_id, turn_id, seq, action_json)
llm_calls(turn_id, purpose, model, request_json, response_text, error, latency_ms, cost_usd)
```

Choices:

- **`turns` is append-only and is the source of truth.** Each row holds what was heard, what the evaluator extracted, the grade, the decision with its evidence, and what was said and drawn. `concept_progress` is a projection of it. If the mastery rule changes, progress can be recomputed from history instead of being guessed.
- **Progress is keyed by student, not session.** Session 3 starts at the first concept that is not `mastered`; a concept left as `needs_review` comes first.
- **The decision is stored as data, not prose.** `decision_json` has the action, a reason code, the evidence (item, expected answer, grade, misconception, counters), a plain-language reason and a counterfactual, all produced by code. When the student asks "why are we doing this again?", the tutor reads this record aloud. The UI's "Why" panel and the evals read the same record.
- **One transaction per turn.** Turn, attempt, misconception, board events, LLM calls, progress and session state commit together at the end of the turn. A turn that fails half-way changes nothing.
- **The turn id comes from the client.** Re-sending a turn (double tap, retry after a dropped connection) replays the stored result instead of running it twice.
- **`whiteboard_events` is separate** so the board can be redrawn after a refresh, or replayed, without the model.
- **`attempts` and `misconceptions` are separate** because they are the two things worth querying across students: which items are missed, which misconceptions recur, and which re-teach strategy fixes them.

## Iterability

Four things change independently, and each has a version stored on every session: prompts (`v1:<hash of the prompt files>`), curriculum (`curriculum-v1`), policy (`policy-v1`) and the model list.

**What happens to a student halfway through session 3?**

- **Prompt or model change.** These affect wording and how answers are read, not where the student is. The student's position lives in `state_json` and `concept_progress`, which contain no prompt text. The next turn uses the new prompt; nothing needs migrating. Their turns are tagged with the version that produced them, so a quality change can be attributed.
- **Policy change** (for example, three correct checks instead of two). `state_json` is validated against the policy's schema when loaded. A compatible change applies from the next turn. An incompatible one bumps `policy_version`; sessions on the old version finish the current concept under the old rules and switch at the concept boundary, which is the only point where the state is trivially small (no open question, no counters).
- **Curriculum change.** Concept and item ids are stable keys. Adding items or strategies is safe mid-session. Renaming, splitting or removing a concept ships with a migration map (`old_id → new_ids`) applied to `concept_progress`; a student in the middle of a split concept restarts that concept, with their history intact. Splitting marks the new concepts `needs_review`, never `mastered`: we do not claim mastery of something we did not check.

**Rolling out.** A change to `prompts/`, `curriculum/`, the policy or the model list must pass `pnpm eval` against the committed baseline and `pnpm eval:mutation` in CI. Then it goes to a slice of students chosen by a hash of `student_id`, so a student always sees the same variant, and the two arms are compared on the metrics below. **Rolling back** is pointing the config back at the previous prompt directory or model list; because position is stored independently of prompts, students in flight are unaffected.

What is built: version stamping on sessions and turns, prompts as hashed files, schema-validated state, the eval gate. What is not: the percentage rollout and per-session prompt pinning across a deploy (see "What's ugly").

## Observability

**Per turn**, one structured JSON log line and one `turns` row with the same content: session, turn and student ids; concept and phase; evaluator intent and confidence; STT confidence; grade; action and reason code; misconception; models actually used (which shows when a fallback model answered); prompt, policy and curriculum versions; which stages fell back (`degraded`, e.g. `evaluator:timeout`, `generator:garbage`, `tts:http`); timings per stage; tokens and cost; number of segments and board operations. Raw LLM requests and responses go to `llm_calls`. The browser reports back the one latency the student actually feels: end of their speech to the first tutor audio.

**Alerts**, with starting thresholds to tune on real traffic:

| Signal | Threshold | Why |
|---|---|---|
| p95 end-of-speech → first audio | > 5 s | The conversation stops feeling like one |
| Turns with any fallback | > 5% | Provider trouble, before it becomes an outage |
| Evaluator or generator schema failures | > 2% | A model update changed output shape |
| Re-teach rate on any concept | > 70% | The first explanation of that concept is not working |
| `reprompt` + `confirm` share of turns | > 15% | STT or the evaluator is not understanding students |
| Nightly eval pass rate | any scenario below baseline | The tutor got worse |
| Daily spend | > 80% of cap | The cap switches the tutor to offline mode at 100% |

**Finding out the tutor got worse before a student says so:**

1. **Nightly `pnpm eval` against the live configuration.** Prompts did not change, so a failure means the provider's model did.
2. **Invariants checked on every simulated turn** (never move on with fewer than two correct checks, never repeat a strategy, an off-topic reply never changes progress). These hold whatever the model says, so a violation is a bug, not noise.
3. **False-advance rate from simulations.** Simulated students have a hidden knowledge state; the rate at which the tutor declares mastery for one who does not understand is the most direct measure of a lenient tutor.
4. **The same thing in production, delayed:** a concept marked `mastered` whose first check fails at the next session's review.
5. **Drift in the decision mix.** A sudden rise in `move_on` with no change in students is a lenient evaluator; a rise in `reteach` is a strict one. Both show up in the `actions` breakdown on the admin page within a day.

The admin page (`/#admin`) shows the headline numbers, real and simulated sessions separately, and a turn-by-turn replay of any session with the reason for each decision.

## Latency

Where the time goes in one turn, in order. These are estimates from provider documentation and the design, **to be replaced with measured p50/p95 from the deployed app** (the debug drawer and admin page show them):

| Stage | Estimate | Notes |
|---|---|---|
| Endpointing | 0 | Tap to stop; no silence detection to wait for |
| Audio conversion + upload | 100–300 ms | Resampled to 16 kHz mono in the browser |
| STT | 300–800 ms | |
| Evaluator LLM | 300–700 ms | Small JSON reply, fast model, temperature 0 |
| Grader + policy | < 1 ms | Code |
| Generator, first sentence | 400–900 ms | Streamed |
| TTS, first sentence | 300–700 ms | |

What is done about it:

- **The evaluator and generator are separate calls on purpose.** The decision is known after the short evaluator call and is sent to the client immediately.
- **The generator streams one JSON line per sentence.** Each line is validated and sent to TTS as soon as it completes, so the first sentence is being spoken while the rest is still being written. TTS for all sentences runs concurrently and is played in order.
- **Most of what the tutor says is not generated at all.** Opening explanations, check questions, hints, confirmations and "why" answers are authored or built by code. They skip the generator entirely, and their audio is cached by text, so repeated lines cost no TTS time.
- **The board changes when the sentence starts, not when the turn ends.** Each sentence carries its own board operations, so the student sees writing and highlighting in step with the voice.
- **Perceived latency.** The student's transcript appears as soon as it is known. If nothing has been said 1.5 s after they finish, the status line shows "Got it, let me think…". Tapping the microphone stops the tutor mid-sentence.
- **One retry, not several.** Each stage has its own timeout (STT 8 s, evaluator 6 s, generator first token 4 s, TTS 6 s per sentence) and one jittered retry; after that the scripted fallback speaks. A circuit breaker stops a dead provider from costing a full timeout on every turn.

Next steps, in order of expected gain: streaming STT so the evaluator can start before the student finishes; a speculative evaluator call on the interim transcript; streaming audio within a sentence instead of whole-sentence clips.

## Metrics

The product works if students end up understanding quadratics, in fewer turns, and want to come back. In the order I would look at them:

1. **Re-teach rate per concept, with attempts to mastery** — look at this first. It is available from the first session, it is per concept so it points at a specific explanation or question to fix, and it moves quickly when a prompt or curriculum change lands.
2. **Retention at next session** — the share of `mastered` concepts whose review check is passed at the start of the following session. This is the number that keeps the first one honest: a lenient tutor improves "mastery rate" and "attempts to mastery" while destroying retention. Mastery rate is never reported without it.
3. **False-advance rate in simulation** — the same thing, available before real students are exposed to a change.
4. **Session completion and return rate** — did the student finish the concept they started, and did they start another session within a week.
5. **Friction** — share of turns that are `reprompt` or `confirm`, share of turns typed rather than spoken, and p95 end-of-speech → first audio.
6. **Cost per mastered concept** — tokens and audio, to keep model choice honest.

Guardrails that should stay near zero: turns with a fallback, invariant violations, concepts ending in `needs_review`.

## What's ugly

What I would fix with another two days, most important first.

- **Prompt pinning is recorded, not enforced.** A session stores the prompt version it started on, but the server only loads one prompt directory, so a deploy mid-session changes the wording under a student. Progress is safe (it does not depend on prompts), but a clean A/B needs a prompt registry keyed by version and the hash-based rollout described above.
- **One place where the model still affects mastery.** When a correct answer comes without reasoning, the tutor asks "how did you get that?" and the evaluator model judges whether the explanation is sound. A lenient model can pass a bluff here. The lucky-guess scenario and the mutation test exist to catch that, but a rubric per item, checked in code, would be better.
- **Generated maths is constrained, not verified.** The generator is told to use only the maths in its reference script, and the guards check that speech is speakable, LaTeX renders and highlights point at real things. Nothing checks that a re-worded explanation is still mathematically correct. Check questions and grading are unaffected, since neither is generated.
- **Single process.** The per-session lock, circuit breaker and TTS cache are in memory, and SQLite has one writer. Fine for a prototype on one machine; a second instance needs Postgres and a shared lock.
- **Tap-to-talk.** There is no voice-activity detection, so no hands-free turn-taking, and interrupting the tutor needs a tap.
- **Audio is sent as base64 clips per sentence** inside the event stream. Simple, but about a third larger than binary and not streamable within a sentence.
- **The offline fallback only reads plain answers** ("yes", "two and five"). During an outage a student who explains at length is asked to give just the answer. It also cannot check reasoning, so mastery reached during an outage is recorded as `needs_review` and confirmed next session.
- **The judge is not calibrated.** The LLM judge's criteria are written to be literal, and most checks are hard assertions rather than judged, but I have not measured the judge's agreement with a human on a labelled set.
- **Admin pages sit behind the same shared passcode** as the tutor, and there are no real accounts: a student is a random id in the browser's local storage.
- **English only.** The evaluator is told to expect Hinglish and understands it; the tutor always replies in English.
- **Four check questions per concept.** A student revisiting a concept a third time will see a repeat. Parameterised items (same structure, generated numbers, answer computed in code) would fix this without generating questions with the model.
