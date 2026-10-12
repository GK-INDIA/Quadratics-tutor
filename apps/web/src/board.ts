import type { BoardOp } from '@tutor/shared';

export interface Block {
  id: string;
  kind: 'text' | 'equation';
  content: string;
}

export interface Highlight {
  target: string;
  part?: string;
}

export interface BoardState {
  blocks: Block[];
  highlights: Highlight[];
}

export const EMPTY_BOARD: BoardState = { blocks: [], highlights: [] };

/**
 * Applies one segment's ops. Blocks flow top to bottom in the order written;
 * writing to an existing id replaces it in place. A segment that highlights
 * anything replaces the previous highlights, so only what the tutor is
 * talking about right now is lit.
 */
export function applyOps(board: BoardState, ops: BoardOp[]): BoardState {
  let blocks = board.blocks;
  let highlights = ops.some((op) => op.op === 'highlight') ? [] : board.highlights;
  for (const op of ops) {
    if (op.op === 'clear') {
      blocks = [];
      highlights = [];
    } else if (op.op === 'highlight') {
      highlights = [...highlights, { target: op.target, part: op.part }];
    } else {
      const block: Block =
        op.op === 'write' ? { id: op.id, kind: 'text', content: op.text } : { id: op.id, kind: 'equation', content: op.latex };
      blocks = blocks.some((b) => b.id === op.id) ? blocks.map((b) => (b.id === op.id ? block : b)) : [...blocks, block];
      highlights = highlights.filter((h) => h.target !== op.id);
    }
  }
  return { blocks, highlights };
}
