import { CONCEPTS } from '@tutor/curriculum';
import { EMPTY_ANSWER, type Segment, grade } from '@tutor/shared';
import { describe, expect, it } from 'vitest';
import { guardSegment } from '../apps/api/src/tutor/guards';

/** Runs segments through the same guard that generated speech must pass. */
function check(segments: Segment[], startIds: string[] = []): string[] {
  let ids = startIds;
  for (const segment of segments) {
    const guarded = guardSegment(segment, ids);
    expect(guarded.problems, `"${segment.say}"`).toEqual([]);
    expect(guarded.segment).not.toBeNull();
    ids = guarded.boardIds;
  }
  return ids;
}

describe('curriculum', () => {
  it('covers the six NCERT subconcepts in order', () => {
    expect(CONCEPTS.map((c) => c.id)).toEqual([
      'standard_form',
      'roots',
      'factorisation',
      'quadratic_formula',
      'discriminant',
      'word_problems',
    ]);
  });

  describe.each(CONCEPTS)('$id', (concept) => {
    const strategies = [...concept.strategies, concept.scaffold.strategy];
    const items = [...concept.items, ...concept.scaffold.items];

    it('every script is speakable, renders, and only highlights what it has written', () => {
      for (const strategy of strategies) {
        expect(strategy.script[0]!.board[0], `${strategy.id} must start on a clean board`).toEqual({ op: 'clear' });
        const ids = check(strategy.script);
        // Any question must be askable on top of any explanation.
        for (const item of items) check([{ say: item.say, board: item.board }], ids);
      }
    });

    it('every hint is speakable', () => {
      for (const item of items) check(item.hints.map((say) => ({ say, board: [] })));
    });

    it('questions write to the block "q" so a new question replaces the old one', () => {
      for (const item of items) expect(item.board.some((op) => 'id' in op && op.id === 'q')).toBe(true);
    });

    it('every answer spec is gradable and no question is answered by an empty reply', () => {
      for (const item of items) {
        expect(grade(item.answer, EMPTY_ANSWER)).toBe('ungradable');
        const right =
          item.answer.type === 'boolean'
            ? { ...EMPTY_ANSWER, boolean: item.answer.value }
            : item.answer.type === 'numbers'
              ? { ...EMPTY_ANSWER, numbers: item.answer.values }
              : item.answer.type === 'choice'
                ? { ...EMPTY_ANSWER, choice: item.answer.value }
                : { ...EMPTY_ANSWER, coefficients: [item.answer.a, item.answer.b, item.answer.c] as [string, string, string] };
        expect(grade(item.answer, right), item.id).toBe('correct');
      }
    });

    it('has enough distinct strategies and questions for a full re-teach ladder', () => {
      expect(new Set(strategies.map((s) => s.id)).size).toBeGreaterThanOrEqual(4);
      expect(concept.items.length).toBeGreaterThanOrEqual(4);
      expect(Object.keys(concept.misconceptions).length).toBeGreaterThanOrEqual(3);
    });
  });
});
