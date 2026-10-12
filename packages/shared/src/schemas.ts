import { z } from 'zod';

// ---------- Whiteboard ----------

/**
 * The board is a flow layout: blocks appear in the order they are written.
 * Writing to an existing id replaces that block in place.
 * Equations may mark sub-expressions with \hl{part}{...}; a highlight op can
 * then target the whole block or just that part.
 */
export const BoardOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('clear') }),
  z.object({ op: z.literal('write'), id: z.string().min(1), text: z.string().min(1) }),
  z.object({ op: z.literal('equation'), id: z.string().min(1), latex: z.string().min(1) }),
  z.object({ op: z.literal('highlight'), target: z.string().min(1), part: z.string().optional() }),
]);
export type BoardOp = z.infer<typeof BoardOp>;

/** One spoken sentence or two, plus the board changes that go with it. */
export const Segment = z.object({
  say: z.string().min(1),
  board: z.array(BoardOp).default([]),
});
export type Segment = z.infer<typeof Segment>;

// ---------- Answers ----------

/** What the evaluator model extracts from the student's words. Flat and nullable so any provider's JSON mode can produce it. */
export const ExtractedAnswer = z.object({
  boolean: z.boolean().nullable(),
  numbers: z.array(z.string()).nullable(),
  coefficients: z.tuple([z.string(), z.string(), z.string()]).nullable(),
  choice: z.string().nullable(),
});
export type ExtractedAnswer = z.infer<typeof ExtractedAnswer>;

export const EMPTY_ANSWER: ExtractedAnswer = { boolean: null, numbers: null, coefficients: null, choice: null };

export const AnswerSpec = z.discriminatedUnion('type', [
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  /** A set of numbers (roots). Order and duplicates do not matter. */
  z.object({ type: z.literal('numbers'), values: z.array(z.string()).min(1) }),
  /** ax^2 + bx + c = 0; any non-zero multiple is accepted. */
  z.object({ type: z.literal('coefficients'), a: z.string(), b: z.string(), c: z.string() }),
  z.object({ type: z.literal('choice'), value: z.string(), options: z.array(z.string()).min(2) }),
]);
export type AnswerSpec = z.infer<typeof AnswerSpec>;

export const Grade = z.enum(['correct', 'partial', 'wrong', 'ungradable']);
export type Grade = z.infer<typeof Grade>;

// ---------- Evaluation (LLM output) ----------

export const Intent = z.enum(['answer', 'dont_know', 'give_answer', 'repeat', 'why', 'skip', 'off_topic']);
export type Intent = z.infer<typeof Intent>;

export const Evaluation = z.object({
  intent: Intent,
  answer: ExtractedAnswer,
  /** Did the student explain how they got there, not just state a result? */
  showedReasoning: z.boolean(),
  /** Only meaningful when showedReasoning is true. */
  reasoningSound: z.boolean().nullable(),
  /** One of the current concept's misconception ids, or null. */
  misconception: z.string().nullable(),
  /** How sure the evaluator is that it understood what the student said (not whether the student is right). */
  confidence: z.number().min(0).max(1),
});
export type Evaluation = z.infer<typeof Evaluation>;

// ---------- Curriculum ----------

export const Item = z.object({
  id: z.string(),
  /** Spoken form of the question. Written by hand so it always matches the answer spec. */
  say: z.string(),
  board: z.array(BoardOp).default([]),
  answer: AnswerSpec,
  /** The correct answer in words, used in spoken feedback and decision reasons. */
  expected: z.string(),
  hints: z.array(z.string()).min(1),
});
export type Item = z.infer<typeof Item>;

export const Strategy = z.object({
  id: z.string(),
  label: z.string(),
  /** Reference explanation. Given to the generator to adapt, and spoken as-is when the LLM is unavailable. */
  script: z.array(Segment).min(1),
});
export type Strategy = z.infer<typeof Strategy>;

export const Misconception = z.object({
  label: z.string(),
  /** Strategy that addresses this misconception best, if one does. */
  strategy: z.string().optional(),
});
export type Misconception = z.infer<typeof Misconception>;

export const Concept = z
  .object({
    id: z.string(),
    order: z.number().int(),
    title: z.string(),
    objectives: z.array(z.string()).min(1),
    misconceptions: z.record(Misconception),
    /** First strategy is the initial teach; the rest are re-teach variants. */
    strategies: z.array(Strategy).min(3),
    items: z.array(Item).min(3),
    /** Simpler, broken-down checks used after two failed attempts. */
    scaffold: z.object({ strategy: Strategy, items: z.array(Item).min(1) }),
  })
  .superRefine((c, ctx) => {
    for (const [id, m] of Object.entries(c.misconceptions)) {
      if (m.strategy && !c.strategies.some((s) => s.id === m.strategy)) {
        ctx.addIssue({ code: 'custom', message: `misconception ${id} points at unknown strategy ${m.strategy}` });
      }
    }
    const ids = [...c.items, ...c.scaffold.items].map((i) => i.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: `duplicate item ids in ${c.id}` });
  });
export type Concept = z.infer<typeof Concept>;

// ---------- Decisions and state ----------

export const Action = z.enum([
  'teach', // open a concept: explain, then ask the first check
  'next_check', // correct, but mastery needs one more correct check
  'probe', // correct without reasoning: ask how they got it
  'move_on', // concept mastered
  'reteach', // wrong or partial: explain differently, new check
  'scaffold', // two failures: simpler, guided check
  'needs_review', // three failures: mark weak, move on, revisit next session
  'hint', // "I don't know" / "just tell me"
  'confirm', // not sure what the student said
  'repeat',
  'explain_why',
  'redirect', // off-topic, injection, skip request
  'reprompt', // nothing usable heard, or the tutor failed this turn
  'finish',
]);
export type Action = z.infer<typeof Action>;

export const Decision = z.object({
  action: Action,
  reasonCode: z.string(),
  /** Plain-language reason, built by code from the evidence. This is what the tutor says when asked "why?". */
  reason: z.string(),
  /** What would have happened had the student answered differently. */
  counterfactual: z.string().nullable(),
  conceptId: z.string(),
  nextConceptId: z.string().nullable(),
  strategyId: z.string().nullable(),
  /** The check question the tutor asks at the end of this turn, if any. */
  itemId: z.string().nullable(),
  evidence: z.object({
    gradedItemId: z.string().nullable(),
    expected: z.string().nullable(),
    grade: Grade.nullable(),
    misconception: z.string().nullable(),
    correct: z.number(),
    wrong: z.number(),
  }),
  policyVersion: z.string(),
});
export type Decision = z.infer<typeof Decision>;

export const ConceptStatus = z.enum(['not_started', 'in_progress', 'mastered', 'needs_review']);
export type ConceptStatus = z.infer<typeof ConceptStatus>;

export const ConceptProgress = z.object({
  conceptId: z.string(),
  status: ConceptStatus,
  attempts: z.number(),
  correctAttempts: z.number(),
  strategiesUsed: z.array(z.string()),
  lastMisconception: z.string().nullable(),
});
export type ConceptProgress = z.infer<typeof ConceptProgress>;

/** Everything the policy needs to continue a session. Persisted as JSON after every turn. */
export const TutorState = z.object({
  conceptId: z.string(),
  phase: z.enum(['check', 'probe', 'done']),
  itemId: z.string().nullable(),
  usedItemIds: z.array(z.string()),
  strategiesUsed: z.array(z.string()),
  correct: z.number(),
  wrong: z.number(),
  hints: z.number(),
  confirms: z.number(),
  probed: z.boolean(),
  scaffolding: z.boolean(),
  /** Answer the tutor asked the student to confirm. */
  pending: ExtractedAnswer.nullable(),
  /** Ids currently on the board, so highlight targets can be validated. */
  boardIds: z.array(z.string()),
});
export type TutorState = z.infer<typeof TutorState>;

// ---------- Wire format: POST /api/turn streams one JSON event per line ----------

export type TurnEvent =
  | { type: 'decision'; evaluation: Evaluation | null; grade: Grade | null; decision: Decision }
  | { type: 'segment'; index: number; segment: Segment; audio?: string }
  | { type: 'done'; progress: ConceptProgress[]; degraded: string[]; timings: Record<string, number> }
  | { type: 'error'; message: string };
