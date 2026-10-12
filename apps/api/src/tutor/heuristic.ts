import { type AnswerSpec, EMPTY_ANSWER, type Evaluation, type ExtractedAnswer } from '@tutor/shared';

/**
 * Rule-based reading of a student's reply, used when the evaluator model is
 * unavailable. It only claims an answer when the words are unambiguous;
 * anything else comes back with zero confidence so the policy asks again
 * instead of grading a guess.
 */

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

/** "minus three and 2" -> ["-3", "2"]. Skips the exponent in "x squared"/"x2". */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  const tokens = text
    .toLowerCase()
    .replace(/−/g, '-')
    .replace(/[,;]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let negative = false;
  for (const raw of tokens) {
    const token = raw.replace(/[.?!]+$/, '');
    if (token === 'minus' || token === 'negative') {
      negative = true;
      continue;
    }
    let value: string | null = null;
    if (token in WORDS) value = String(WORDS[token]);
    else if (/^-?\d+(\.\d+)?(\/\d+)?$/.test(token)) value = token;
    if (value !== null) {
      out.push(negative && !value.startsWith('-') ? `-${value}` : value);
    }
    negative = false;
  }
  return out;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

export function heuristicEvaluate(transcript: string, spec: AnswerSpec | null): Evaluation {
  const text = transcript.toLowerCase().trim();
  const blank = (intent: Evaluation['intent'], confidence: number): Evaluation => ({
    intent,
    answer: EMPTY_ANSWER,
    showedReasoning: false,
    reasoningSound: null,
    misconception: null,
    confidence,
  });

  if (has(text, /\b(repeat|say (that|it) again|once more|come again|pardon)\b/)) return blank('repeat', 0.9);
  if (has(text, /\bwhy (are|did|do|have) (we|you)\b/)) return blank('why', 0.9);
  if (has(text, /\b(tell|give) me the answer\b|\bjust tell me\b/)) return blank('give_answer', 0.9);
  if (has(text, /\b(i )?(don'?t|do not) know\b|\bno idea\b|\bnot sure\b|\bi give up\b/)) return blank('dont_know', 0.9);
  if (!spec) return blank('answer', 0);

  let answer: ExtractedAnswer = EMPTY_ANSWER;
  switch (spec.type) {
    case 'boolean': {
      const no = has(text, /\b(no|nope|not|isn'?t|false)\b/);
      // "it is" only counts as yes when nothing negates it ("no, it is not").
      const yes = has(text, /\b(yes|yeah|yep|correct|true)\b/) || (!no && has(text, /\bit is\b/));
      if (yes !== no) answer = { ...EMPTY_ANSWER, boolean: yes };
      break;
    }
    case 'numbers': {
      const numbers = extractNumbers(text);
      if (numbers.length > 0 && numbers.length <= 2) answer = { ...EMPTY_ANSWER, numbers };
      break;
    }
    case 'coefficients': {
      const numbers = extractNumbers(text);
      if (numbers.length === 3) answer = { ...EMPTY_ANSWER, coefficients: numbers as [string, string, string] };
      break;
    }
    case 'choice': {
      const hits = spec.options.filter((o) => text.includes(o.replace(/_/g, ' ')));
      if (hits.length === 1) answer = { ...EMPTY_ANSWER, choice: hits[0]! };
      break;
    }
  }

  const found = answer !== EMPTY_ANSWER;
  return {
    intent: 'answer',
    answer,
    // Reasoning cannot be judged without the model. Marking it as shown skips the
    // "how did you get that?" probe, which could not be assessed offline anyway.
    showedReasoning: true,
    reasoningSound: null,
    misconception: null,
    confidence: found ? 0.9 : 0,
  };
}
