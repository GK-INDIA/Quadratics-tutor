import { type AnswerSpec, type Concept, Evaluation, type ExtractedAnswer, type Item, OTHER_CHOICE, type TutorState } from '@tutor/shared';
import type { Trace } from '../observability/trace';
import { type LlmDeps, completeJson, fill } from './calls';

export const PROBE_QUESTION = "That's right. Tell me how you worked it out.";

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** Mirrors the Evaluation Zod schema; strict mode needs every property listed as required. */
const EVALUATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'answer', 'showedReasoning', 'reasoningSound', 'misconception', 'confidence'],
  properties: {
    intent: { type: 'string', enum: ['answer', 'dont_know', 'give_answer', 'repeat', 'why', 'skip', 'off_topic'] },
    answer: {
      type: 'object',
      additionalProperties: false,
      required: ['boolean', 'numbers', 'coefficients', 'choice'],
      properties: {
        boolean: nullable({ type: 'boolean' }),
        numbers: nullable({ type: 'array', items: { type: 'string' } }),
        coefficients: nullable({ type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }),
        choice: nullable({ type: 'string' }),
      },
    },
    showedReasoning: { type: 'boolean' },
    reasoningSound: nullable({ type: 'boolean' }),
    misconception: nullable({ type: 'string' }),
    confidence: { type: 'number' },
  },
};

function describeSpec(spec: AnswerSpec | null): string {
  if (!spec) return 'none (the tutor asked the student to explain their reasoning)';
  switch (spec.type) {
    case 'boolean':
      return 'yes/no -> answer.boolean';
    case 'numbers':
      return 'one or more numbers -> answer.numbers, each as a string like "3", "-2", "3/2" or "1.5"';
    case 'coefficients':
      return 'the coefficients a, b, c -> answer.coefficients as three strings, signs included';
    case 'choice':
      return `one of these options -> answer.choice, copied exactly: ${spec.options.join(', ')}. If the student clearly gave an answer that is none of these, use "${OTHER_CHOICE}"`;
  }
}

export function describeAnswer(answer: ExtractedAnswer): string {
  const num = (n: string) => n.replace(/^-/, 'minus ');
  if (answer.boolean !== null) return answer.boolean ? 'yes' : 'no';
  if (answer.coefficients) {
    const [a, b, c] = answer.coefficients;
    return `a is ${num(a)}, b is ${num(b)}, and c is ${num(c)}`;
  }
  if (answer.numbers?.length) return answer.numbers.map(num).join(' and ');
  if (answer.choice) return answer.choice.replace(/_/g, ' ');
  return 'nothing I could use';
}

export interface EvaluateInput {
  concept: Concept;
  item: Item | null;
  state: TutorState;
  transcript: string;
}

/** Asks the evaluator model what the student said. It never decides whether the student is right; the grader does. */
export async function evaluateWithLlm(deps: LlmDeps, trace: Trace, input: EvaluateInput): Promise<Evaluation> {
  const { concept, item, state, transcript } = input;
  const probing = state.phase === 'probe';
  const spec = probing ? null : (item?.answer ?? null);

  const user = fill(deps.prompts.get('evaluator-user'), {
    topic: concept.title,
    question: probing ? `${item?.say ?? ''} (answered correctly) Then: ${PROBE_QUESTION}` : (item?.say ?? '(no question open)'),
    answer_type: describeSpec(spec),
    correct_answer: item?.expected ?? 'n/a',
    misconceptions:
      Object.entries(concept.misconceptions)
        .map(([id, m]) => `- ${id}: ${m.label}`)
        .join('\n') || '(none)',
    pending: state.pending ? describeAnswer(state.pending) : 'none',
    transcript,
  });

  const evaluation = await completeJson(
    deps,
    trace,
    {
      purpose: 'evaluate',
      model: deps.config.models.evaluator,
      fallbacks: deps.config.models.fallbacks,
      system: deps.prompts.get('evaluator-system'),
      user,
      jsonSchema: { name: 'evaluation', schema: EVALUATION_JSON_SCHEMA },
      maxTokens: 300,
      temperature: 0,
      timeoutMs: deps.config.timeouts.evaluateMs,
    },
    Evaluation,
  );
  return sanitise(evaluation, concept, spec);
}

/** Drops anything the model was not entitled to say, rather than trusting it. */
export function sanitise(evaluation: Evaluation, concept: Concept, spec: AnswerSpec | null): Evaluation {
  const answer = { ...evaluation.answer };
  const allowed = spec?.type === 'choice' ? [...spec.options, OTHER_CHOICE] : [];
  if (answer.choice !== null && !allowed.includes(answer.choice)) answer.choice = null;
  return {
    ...evaluation,
    answer,
    misconception: evaluation.misconception && concept.misconceptions[evaluation.misconception] ? evaluation.misconception : null,
    reasoningSound: evaluation.showedReasoning ? evaluation.reasoningSound : null,
  };
}
