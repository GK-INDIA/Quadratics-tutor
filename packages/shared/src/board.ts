import type { BoardOp, Segment } from './schemas';

/** DOM id of a marked sub-expression inside an equation block. */
export const partId = (blockId: string, part: string) => `${blockId}--${part}`;

/** Rewrites our \hl{part}{expr} marker into KaTeX's \htmlId so the part can be highlighted later. */
export function toKatex(latex: string, blockId: string): string {
  return latex.replace(/\\hl\{([A-Za-z0-9_-]+)\}/g, (_, part: string) => `\\htmlId{${partId(blockId, part)}}`);
}

/** Part names marked in an equation. */
export function partsOf(latex: string): string[] {
  return [...latex.matchAll(/\\hl\{([A-Za-z0-9_-]+)\}/g)].map((m) => m[1]!);
}

/**
 * Applies ops to the set of ids on the board. Returns the new ids, or an error
 * naming the first op that refers to something that is not there.
 */
export function applyToIds(ids: string[], ops: BoardOp[]): { ids: string[]; error: string | null } {
  let current = [...ids];
  for (const op of ops) {
    if (op.op === 'clear') current = [];
    else if (op.op === 'write') current = [...current.filter((i) => i !== op.id), op.id];
    else if (op.op === 'equation') {
      const parts = partsOf(op.latex).map((p) => partId(op.id, p));
      current = [...current.filter((i) => i !== op.id && !i.startsWith(`${op.id}--`)), op.id, ...parts];
    } else {
      const target = op.part ? partId(op.target, op.part) : op.target;
      if (!current.includes(target)) return { ids: current, error: `highlight targets "${target}", which is not on the board` };
    }
  }
  return { ids: current, error: null };
}

export function boardIdsAfter(ids: string[], segments: Segment[]): string[] {
  return segments.reduce((acc, s) => applyToIds(acc, s.board).ids, ids);
}
