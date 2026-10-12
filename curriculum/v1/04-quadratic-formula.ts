import type { ConceptInput } from '../index';

const FORMULA = 'x = \\dfrac{\\hl{mb}{-b} \\pm \\sqrt{\\hl{d}{b^2 - 4ac}}}{\\hl{den}{2a}}';

const concept: ConceptInput = {
  id: 'quadratic_formula',
  order: 4,
  title: 'The quadratic formula',
  objectives: [
    'State the quadratic formula',
    'Identify a, b and c with their signs and substitute them correctly',
    'Use both the plus and the minus to get both roots',
  ],
  misconceptions: {
    sign_of_b: { label: 'starting the formula with b instead of minus b', strategy: 'signs_first' },
    sign_under_root: {
      label: 'a sign slip in b squared minus four a c, usually when c is negative',
      strategy: 'signs_first',
    },
    partial_denominator: {
      label: 'dividing only the square root by two a instead of the whole top line',
      strategy: 'formula_shape',
    },
    one_root_only: { label: 'using only the plus sign and missing the second root', strategy: 'formula_shape' },
  },
  strategies: [
    {
      id: 'state_and_apply',
      label: 'the formula with a worked example',
      script: [
        {
          say: 'When factorising is hard, the quadratic formula always works. x equals minus b, plus or minus the square root of b squared minus four a c, all divided by two a.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'The quadratic formula' },
            { op: 'equation', id: 'f', latex: FORMULA },
          ],
        },
        {
          say: 'Take two x squared minus seven x plus three equals zero. Here a is two, b is minus seven, and c is three.',
          board: [
            { op: 'equation', id: 'e', latex: '2x^2 - 7x + 3 = 0' },
            { op: 'equation', id: 'abc', latex: 'a = 2, \\quad b = -7, \\quad c = 3' },
          ],
        },
        {
          say: 'First the part under the root. b squared is forty nine. Four a c is twenty four. Forty nine minus twenty four is twenty five, and its square root is five.',
          board: [
            { op: 'highlight', target: 'f', part: 'd' },
            { op: 'equation', id: 's1', latex: 'b^2 - 4ac = 49 - 24 = 25' },
          ],
        },
        {
          say: 'Minus b is plus seven, and two a is four. So x is seven plus or minus five, over four. That gives three, or one half.',
          board: [{ op: 'equation', id: 's2', latex: 'x = \\dfrac{7 \\pm 5}{4} = 3 \\text{ or } \\dfrac{1}{2}' }],
        },
      ],
    },
    {
      id: 'signs_first',
      label: 'writing a, b and c with their signs first',
      script: [
        {
          say: 'Most mistakes with the formula are sign mistakes. So write a, b and c down with their signs before you touch the formula.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Signs first' },
            { op: 'equation', id: 'e', latex: 'x^2 - 4x - 5 = 0' },
            { op: 'equation', id: 'abc', latex: 'a = 1, \\quad b = \\hl{b}{-4}, \\quad c = \\hl{c}{-5}' },
          ],
        },
        {
          say: 'Minus b means the opposite of b. Here b is minus four, so minus b is plus four.',
          board: [
            { op: 'highlight', target: 'abc', part: 'b' },
            { op: 'equation', id: 's1', latex: '-b = -(-4) = 4' },
          ],
        },
        {
          say: 'Under the root we have sixteen, minus four times one times minus five. Minus times minus is plus, so that is sixteen plus twenty, which is thirty six.',
          board: [
            { op: 'highlight', target: 'abc', part: 'c' },
            { op: 'equation', id: 's2', latex: 'b^2 - 4ac = 16 - 4(1)(-5) = 16 + 20 = 36' },
          ],
        },
        {
          say: 'So x is four plus or minus six, over two. That is five, or minus one.',
          board: [{ op: 'equation', id: 's3', latex: 'x = \\dfrac{4 \\pm 6}{2} = 5 \\text{ or } -1' }],
        },
      ],
    },
    {
      id: 'formula_shape',
      label: 'the shape of the formula',
      script: [
        {
          say: 'Look at the shape of the formula. It is one single fraction. Everything on top is divided by two a, not just the square root.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'One fraction, two answers' },
            { op: 'equation', id: 'f', latex: FORMULA },
            { op: 'highlight', target: 'f', part: 'den' },
          ],
        },
        {
          say: 'And plus or minus means two answers. Work it out once with plus, and once with minus.',
          board: [
            {
              op: 'equation',
              id: 'two',
              latex: 'x = \\dfrac{-b + \\sqrt{D}}{2a} \\quad \\text{and} \\quad x = \\dfrac{-b - \\sqrt{D}}{2a}',
            },
          ],
        },
        {
          say: 'For x squared plus three x plus two equals zero, the part under the root is nine minus eight, which is one.',
          board: [
            { op: 'equation', id: 'e', latex: 'x^2 + 3x + 2 = 0' },
            { op: 'equation', id: 's1', latex: 'b^2 - 4ac = 9 - 8 = 1' },
          ],
        },
        {
          say: 'With plus: minus three plus one, over two, is minus one. With minus: minus three minus one, over two, is minus two.',
          board: [{ op: 'equation', id: 's2', latex: 'x = \\dfrac{-3 \\pm 1}{2} = -1 \\text{ or } -2' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'qf_basic',
      say: 'Use the quadratic formula to solve x squared minus five x plus four equals zero. Tell me the roots and how you got them.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 - 5x + 4 = 0' }],
      answer: { type: 'numbers', values: ['4', '1'] },
      expected: 'x equals four or x equals one, since the formula gives five plus or minus three, over two',
      hints: [
        'Write down a, b and c first. Then work out b squared minus four a c.',
        'That comes to twenty five minus sixteen, which is nine. So x is five plus or minus three, over two.',
      ],
    },
    {
      id: 'qf_negative_c',
      say: 'Solve two x squared plus x minus six equals zero with the formula. Be careful with the signs.',
      board: [{ op: 'equation', id: 'q', latex: '2x^2 + x - 6 = 0' }],
      answer: { type: 'numbers', values: ['3/2', '-2'] },
      expected: 'x equals three over two or x equals minus two, since the formula gives minus one plus or minus seven, over four',
      hints: [
        'Here a is two, b is one and c is minus six. What is minus four times a times c?',
        'Under the root you get one plus forty eight, which is forty nine. So x is minus one plus or minus seven, over four.',
      ],
    },
    {
      id: 'qf_under_root',
      say: 'For three x squared minus two x minus one equals zero, what is b squared minus four a c?',
      board: [{ op: 'equation', id: 'q', latex: '3x^2 - 2x - 1 = 0, \\quad b^2 - 4ac = \\; ?' }],
      answer: { type: 'numbers', values: ['16'] },
      expected: 'sixteen, because four plus twelve is sixteen',
      hints: [
        'a is three, b is minus two, c is minus one. Start with b squared.',
        'b squared is four. Four a c is four times three times minus one, which is minus twelve. Now subtract it.',
      ],
    },
    {
      id: 'qf_minus_b',
      say: 'Solve x squared plus six x plus five equals zero using the formula.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 + 6x + 5 = 0' }],
      answer: { type: 'numbers', values: ['-1', '-5'] },
      expected: 'x equals minus one or x equals minus five, since the formula gives minus six plus or minus four, over two',
      hints: [
        'b is plus six, so what is minus b?',
        'Under the root: thirty six minus twenty is sixteen. So x is minus six plus or minus four, over two.',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's break the formula into four small jobs and do them one at a time.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Four small jobs' },
            { op: 'write', id: 'g1', text: '1. Write a, b, c with their signs' },
            { op: 'write', id: 'g2', text: '2. Work out b² − 4ac' },
            { op: 'write', id: 'g3', text: '3. Take its square root' },
            { op: 'write', id: 'g4', text: '4. (−b ± that root) ÷ 2a' },
          ],
        },
        {
          say: 'Do the first job carefully and the rest follows. Write a, b and c with their signs.',
          board: [{ op: 'highlight', target: 'g1' }],
        },
      ],
    },
    items: [
      {
        id: 'qf_scaffold_minus_b',
        say: 'In x squared minus four x minus five equals zero, what is the value of minus b?',
        board: [{ op: 'equation', id: 'q', latex: 'x^2 - 4x - 5 = 0, \\quad -b = \\; ?' }],
        answer: { type: 'numbers', values: ['4'] },
        expected: 'four',
        hints: ['b is minus four. Minus b is the opposite of that.'],
      },
      {
        id: 'qf_scaffold_finish',
        say: 'Suppose the formula gives x equals five plus or minus three, over two. What are the two values of x?',
        board: [{ op: 'equation', id: 'q', latex: 'x = \\dfrac{5 \\pm 3}{2}' }],
        answer: { type: 'numbers', values: ['4', '1'] },
        expected: 'four and one',
        hints: ['Do five plus three, then divide by two. Then do five minus three, and divide by two.'],
      },
    ],
  },
};

export default concept;
