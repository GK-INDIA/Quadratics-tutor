import { describe, expect, it } from 'vitest';
import { extractNumbers, heuristicEvaluate } from '../apps/api/src/tutor/heuristic';

describe('offline answer reading', () => {
  it('reads spoken numbers with signs', () => {
    expect(extractNumbers('minus three and 2')).toEqual(['-3', '2']);
    expect(extractNumbers('x is negative five, or 3/2.')).toEqual(['-5', '3/2']);
  });

  it('reads yes and no, including negated "it is"', () => {
    const spec = { type: 'boolean' as const, value: true };
    expect(heuristicEvaluate('yes it is', spec).answer.boolean).toBe(true);
    expect(heuristicEvaluate('no it is not', spec).answer.boolean).toBe(false);
    expect(heuristicEvaluate("it isn't", spec).answer.boolean).toBe(false);
  });

  it('claims nothing when the words are ambiguous', () => {
    expect(heuristicEvaluate('yes, no, maybe', { type: 'boolean', value: true }).confidence).toBe(0);
    expect(heuristicEvaluate('x squared minus four equals zero so two', { type: 'numbers', values: ['2'] }).confidence).toBe(0);
    expect(heuristicEvaluate('equal or no real', { type: 'choice', value: 'equal', options: ['equal', 'no_real'] }).confidence).toBe(0);
  });

  it('recognises requests that are not answers', () => {
    expect(heuristicEvaluate('can you repeat that', null).intent).toBe('repeat');
    expect(heuristicEvaluate("I don't know", null).intent).toBe('dont_know');
    expect(heuristicEvaluate('just tell me the answer', null).intent).toBe('give_answer');
    expect(heuristicEvaluate('why are we doing this again', null).intent).toBe('why');
  });
});
