import { type AnswerSpec, type ExtractedAnswer, type Grade, OTHER_CHOICE } from './schemas';

// Decimal answers to irrational roots are accepted to two places.
const TOLERANCE = 0.01;

/** Parses "3", "-1.5", "3/2", "−2" (unicode minus), "+4". Returns null for anything else. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/−/g, '-').replace(/\s+/g, '');
  const m = /^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/.exec(s);
  if (!m) return null;
  const num = Number(m[1]);
  const den = m[2] === undefined ? 1 : Number(m[2]);
  if (den === 0) return null;
  return num / den;
}

const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

function dedupe(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) if (!out.some((o) => close(o, v))) out.push(v);
  return out;
}

function parseAll(raw: string[]): number[] | null {
  const parsed = raw.map(parseNumber);
  return parsed.some((p) => p === null) ? null : (parsed as number[]);
}

/**
 * Grades an extracted answer against an item's answer spec.
 * `ungradable` means the answer is missing or of the wrong kind, which the
 * policy treats as "ask again", never as a wrong attempt.
 */
export function grade(spec: AnswerSpec, answer: ExtractedAnswer): Grade {
  switch (spec.type) {
    case 'boolean':
      if (answer.boolean === null) return 'ungradable';
      return answer.boolean === spec.value ? 'correct' : 'wrong';

    case 'choice': {
      if (answer.choice === null) return 'ungradable';
      if (answer.choice === OTHER_CHOICE) return 'wrong'; // e.g. "two negative roots" when asked for the nature of the roots
      if (!spec.options.includes(answer.choice)) return 'ungradable';
      return answer.choice === spec.value ? 'correct' : 'wrong';
    }

    case 'numbers': {
      if (answer.numbers === null || answer.numbers.length === 0) return 'ungradable';
      const given = parseAll(answer.numbers);
      const want = parseAll(spec.values);
      if (given === null || want === null) return 'ungradable';
      const g = dedupe(given);
      const w = dedupe(want);
      const hits = g.filter((x) => w.some((y) => close(x, y))).length;
      if (hits < g.length) return 'wrong'; // at least one value that is not a root
      return hits === w.length ? 'correct' : 'partial'; // e.g. one of two roots
    }

    case 'coefficients': {
      if (answer.coefficients === null) return 'ungradable';
      const given = parseAll(answer.coefficients);
      const want = parseAll([spec.a, spec.b, spec.c]);
      if (given === null || want === null) return 'ungradable';
      const [ga, gb, gc] = given as [number, number, number];
      const [wa, wb, wc] = want as [number, number, number];
      if (ga === 0 || wa === 0) return 'wrong';
      const k = ga / wa; // 2x^2 - 4x + 2 = 0 is the same equation as x^2 - 2x + 1 = 0
      return close(gb, wb * k) && close(gc, wc * k) ? 'correct' : 'wrong';
    }
  }
}
