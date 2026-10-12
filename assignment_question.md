# AI Tutor — Take-Home Assignment

## Deliverables

- A **private GitHub repo** with access for `akshay@cmpntech.com` and `nishchal@cmpntech.com` (make sure that you don't make the repo public)
- A **web link** which we can use and test
- **`DESIGN.md`** in the repo (see Part 2)

We'll provide an OpenRouter key. Use it for the LLM and for TTS/STT; browser speech APIs or any other provider are also fine. We care about the loop, not audio quality.

> **Note:** Use an STT → LLM → TTS pipeline, and not realtime live APIs of models.

### For inspiration

- Use this Android app: [com.cmpntech.tutor](https://play.google.com/store/apps/details?id=com.cmpntech.tutor&hl=en_IN)
- Use it from this number: `9530232046`

---

## Part 1: What to build

An AI tutor that teaches **quadratic equations (NCERT Class 10)** to a student through **voice** and a **whiteboard**.

### Interface

- **Voice:** the student speaks, the tutor speaks back.
- **Whiteboard:** the tutor can write text and equations on it, and can highlight a specific term or step when referring to it. Nothing fancier is needed.

### Curriculum

The curriculum has six subconcepts:

1. Standard form and recognising a quadratic
2. What a root is; checking a root by substitution
3. Solving by factorisation
4. The quadratic formula
5. Discriminant and nature of roots
6. Word problems

Build all six, each with the verify-and-reteach loop below. The structure should make it obvious how a student's progress through them is tracked.

### Teaching loop

The tutor teaches a concept, then checks whether the student actually understood it, then decides: move on, or re-teach differently and check again. The tutor should be able to say **why** it made that decision.

### Regression eval suite

A fixed set of tutor scenarios, each with expected tutor behaviour, runnable with **one command**. It should catch a prompt or model change that makes the tutor worse. We'd rather see a few well-chosen scenarios than many shallow ones.

### Handling failure

The LLM provider will time out, return garbage, or go down. How do you handle it?

### Simulations

You can simulate different types of users with an LLM and generate simulated sessions.

---

## Part 2: What to write (`DESIGN.md`)

One section each, half a page to a page, concrete over general:

- **Data model** — how you store the student's history and progress. Show the schema and explain the choices.
- **Iterability** — if we change the prompt, the model, or the curriculum structure, what happens to a student who is halfway through session 3? How would you roll a change out and roll it back?
- **Observability** — what you log per turn. What you'd alert on. How you'd find out the tutor got worse before a student tells you.
- **Latency** — where the time goes in the voice loop, and what you'd do about what the user perceives.
- **Metrics** — how you'd know this product is working. Which numbers, and which one you'd look at first.
- **What's ugly** — what you'd fix with another two days.

---

## What you'll be judged on

- Working prototype
- `plan.md` (how well you have hand-written `plan.md`)
- Code quality and how it's organised
- Evals
- How thoughtful the whole thing is