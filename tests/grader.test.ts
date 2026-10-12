import { EMPTY_ANSWER, grade, parseNumber } from '@tutor/shared';
import { describe, expect, it } from 'vitest';

const numbers = (...values: string[]) => ({ ...EMPTY_ANSWER, numbers: values });

describe('parseNumber', () => {
  it('reads integers, decimals, fractions and unicode minus', () => {
    expect(parseNumber('3')).toBe(3);
    expect(parseNumber(' -1.5 ')).toBe(-1.5);
    expect(parseNumber('3/2')).toBe(1.5);
    expect(parseNumber('−2')).toBe(-2);
  });
  it('rejects anything that is not a number', () => {
    expect(parseNumber('x')).toBeNull();
    expect(parseNumber('1/0')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('grade: roots', () => {
  const spec = { type: 'numbers' as const, values: ['2', '3'] };
  it('accepts roots in any order', () => expect(grade(spec, numbers('3', '2'))).toBe('correct'));
  it('accepts a repeated root said twice', () => {
    expect(grade({ type: 'numbers', values: ['3'] }, numbers('3', '3'))).toBe('correct');
  });
  it('accepts a fraction given as a decimal', () => {
    expect(grade({ type: 'numbers', values: ['3/2', '-1'] }, numbers('-1', '1.5'))).toBe('correct');
  });
  it('accepts an irrational root to two decimal places', () => {
    expect(grade({ type: 'numbers', values: ['2.618', '0.382'] }, numbers('2.62', '0.38'))).toBe('correct');
  });
  it('marks one of two roots as partial, not wrong', () => expect(grade(spec, numbers('2'))).toBe('partial'));
  it('marks a sign error as wrong', () => expect(grade(spec, numbers('-2', '-3'))).toBe('wrong'));
  it('marks one right and one wrong root as wrong', () => expect(grade(spec, numbers('2', '5'))).toBe('wrong'));
  it('does not grade a list with more values than the question has answers', () => {
    expect(grade(spec, numbers('2', '-2', '3', '-3'))).toBe('ungradable');
    expect(grade(spec, numbers('2', '3', '5'))).toBe('ungradable');
  });
  it('still grades both roots given for a one-answer word problem as wrong, not unclear', () => {
    expect(grade({ type: 'numbers', values: ['6'] }, numbers('6', '-8'))).toBe('wrong');
  });
  it('cannot grade a missing or unparseable answer', () => {
    expect(grade(spec, EMPTY_ANSWER)).toBe('ungradable');
    expect(grade(spec, numbers('two-ish'))).toBe('ungradable');
  });
});

describe('grade: other answer types', () => {
  it('grades yes/no', () => {
    expect(grade({ type: 'boolean', value: false }, { ...EMPTY_ANSWER, boolean: false })).toBe('correct');
    expect(grade({ type: 'boolean', value: false }, { ...EMPTY_ANSWER, boolean: true })).toBe('wrong');
    expect(grade({ type: 'boolean', value: false }, numbers('1'))).toBe('ungradable');
  });
  it('accepts any non-zero multiple of the coefficients', () => {
    const spec = { type: 'coefficients' as const, a: '1', b: '-2', c: '1' };
    expect(grade(spec, { ...EMPTY_ANSWER, coefficients: ['2', '-4', '2'] })).toBe('correct');
    expect(grade(spec, { ...EMPTY_ANSWER, coefficients: ['-1', '2', '-1'] })).toBe('correct');
    expect(grade(spec, { ...EMPTY_ANSWER, coefficients: ['1', '2', '1'] })).toBe('wrong');
    expect(grade(spec, { ...EMPTY_ANSWER, coefficients: ['0', '-2', '1'] })).toBe('wrong');
  });
  it('grades a choice and refuses options that were never offered', () => {
    const spec = { type: 'choice' as const, value: 'equal', options: ['two_distinct', 'equal', 'no_real'] };
    expect(grade(spec, { ...EMPTY_ANSWER, choice: 'equal' })).toBe('correct');
    expect(grade(spec, { ...EMPTY_ANSWER, choice: 'no_real' })).toBe('wrong');
    expect(grade(spec, { ...EMPTY_ANSWER, choice: 'imaginary' })).toBe('ungradable');
  });
});
