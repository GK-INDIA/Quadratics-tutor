import { describe, expect, it } from 'vitest';
import { guardSegment } from '../apps/api/src/tutor/guards';

const board = ['eq2'];

describe('guardSegment', () => {
  it('lights the whole line when the part that was asked for was never marked', () => {
    const out = guardSegment({ say: 'Look at this term.', board: [{ op: 'highlight', target: 'eq2', part: 'x^2' }] }, board);
    expect(out.segment?.board).toEqual([{ op: 'highlight', target: 'eq2' }]);
    expect(out.problems).toEqual([]);
  });

  it('keeps a highlight of a part that was marked in this segment', () => {
    const out = guardSegment(
      {
        say: 'Look at this term.',
        board: [
          { op: 'equation', id: 'e3', latex: '\\hl{sq}{x^2} - 4x - 5 = 0' },
          { op: 'highlight', target: 'e3', part: 'sq' },
        ],
      },
      board,
    );
    expect(out.segment?.board).toHaveLength(2);
    expect(out.problems).toEqual([]);
  });

  it('still drops a highlight of something that is not on the board at all', () => {
    const out = guardSegment({ say: 'Look here.', board: [{ op: 'highlight', target: 'nope' }] }, board);
    expect(out.segment?.board).toEqual([]);
    expect(out.problems).toHaveLength(1);
  });

  it('rejects speech with symbols or LaTeX, and speech that runs too long', () => {
    expect(guardSegment({ say: 'So x^2 - 5x is zero', board: [] }, board).segment).toBeNull();
    expect(guardSegment({ say: Array(60).fill('word').join(' '), board: [] }, board).segment).toBeNull();
  });
});
