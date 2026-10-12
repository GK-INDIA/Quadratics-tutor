import { type BoardOp, Segment, applyToIds, partId, toKatex } from '@tutor/shared';
import katex from 'katex';

export const MAX_WORDS_PER_SEGMENT = 45;

/** Characters that mean LaTeX or markup leaked into text meant for the voice. */
const UNSPEAKABLE = /[\\^_{}$<>|*#`]/;

export function latexError(latex: string, blockId: string): string | null {
  try {
    katex.renderToString(toKatex(latex, blockId), { throwOnError: true, trust: true, strict: false });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export interface Guarded {
  segment: Segment | null;
  boardIds: string[];
  /** Why the segment was rejected or what was removed from it. */
  problems: string[];
}

/**
 * Checks one generated segment before it reaches the student.
 *
 * Speech problems reject the segment: we will not read garbage aloud.
 * Board problems only drop the offending ops: a correct sentence without its
 * highlight is still worth saying.
 */
export function guardSegment(raw: unknown, boardIds: string[]): Guarded {
  const parsed = Segment.safeParse(raw);
  if (!parsed.success) return { segment: null, boardIds, problems: ['not a segment'] };

  const say = parsed.data.say.trim();
  if (UNSPEAKABLE.test(say)) return { segment: null, boardIds, problems: ['speech contains symbols or markup'] };
  if (say.split(/\s+/).length > MAX_WORDS_PER_SEGMENT) return { segment: null, boardIds, problems: ['speech too long'] };

  const problems: string[] = [];
  const kept: BoardOp[] = [];
  let ids = boardIds;
  for (const op of parsed.data.board) {
    if (op.op === 'equation') {
      const error = latexError(op.latex, op.id);
      if (error) {
        problems.push(`dropped equation ${op.id}: ${error}`);
        continue;
      }
    }
    // A highlight of a part that was never marked still points at something real: light the whole line.
    if (op.op === 'highlight' && op.part && ids.includes(op.target) && !ids.includes(partId(op.target, op.part))) {
      kept.push({ op: 'highlight', target: op.target });
      continue;
    }
    const applied = applyToIds(ids, [op]);
    if (applied.error) {
      problems.push(`dropped op: ${applied.error}`);
      continue;
    }
    ids = applied.ids;
    kept.push(op);
  }
  return { segment: { say, board: kept }, boardIds: ids, problems };
}
