import type { ConceptInput } from '../index';

const concept: ConceptInput = {
  id: 'standard_form',
  order: 1,
  title: 'Standard form and recognising a quadratic',
  objectives: [
    'State the standard form ax² + bx + c = 0 with a ≠ 0',
    'Decide whether an equation is quadratic after simplifying it',
    'Read off a, b and c, including their signs',
  ],
  misconceptions: {
    judges_before_simplifying: {
      label: 'deciding from how the equation looks before expanding and simplifying it',
      strategy: 'rearrange_first',
    },
    a_can_be_zero: { label: 'allowing a to be zero', strategy: 'highest_power' },
    needs_all_three_terms: {
      label: 'thinking a quadratic must have an x term and a constant term',
      strategy: 'highest_power',
    },
    drops_sign: { label: 'dropping the minus sign when reading off b or c', strategy: 'rearrange_first' },
  },
  strategies: [
    {
      id: 'definition_example',
      label: 'definition with an example',
      script: [
        {
          say: 'A quadratic equation is any equation you can write as a x squared, plus b x, plus c, equals zero.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Standard form' },
            { op: 'equation', id: 'std', latex: '\\hl{a}{a}x^2 + \\hl{b}{b}x + \\hl{c}{c} = 0' },
          ],
        },
        {
          say: 'There is one rule. The number in front of x squared, which we call a, must not be zero. If it were, the x squared term would disappear.',
          board: [
            { op: 'equation', id: 'rule', latex: 'a \\neq 0' },
            { op: 'highlight', target: 'std', part: 'a' },
          ],
        },
        {
          say: 'For example, two x squared minus five x plus three equals zero is a quadratic. Here a is two, b is minus five, and c is three.',
          board: [{ op: 'equation', id: 'ex', latex: '\\hl{a}{2}x^2 \\hl{b}{-5}x \\hl{c}{+3} = 0' }],
        },
      ],
    },
    {
      id: 'rearrange_first',
      label: 'simplify first, then decide',
      script: [
        {
          say: "You can't always tell just by looking. Expand the brackets and bring everything to one side first.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Simplify first, then decide' },
            { op: 'equation', id: 's1', latex: '(x-2)^2 + 1 = 2x - 3' },
          ],
        },
        {
          say: 'Expanding the left side gives x squared minus four x plus five. Then move two x minus three across to the left.',
          board: [
            { op: 'equation', id: 's2', latex: 'x^2 - 4x + 5 = 2x - 3' },
            { op: 'equation', id: 's3', latex: '\\hl{sq}{x^2} - 6x + 8 = 0' },
          ],
        },
        {
          say: 'The x squared term is still there after simplifying, so this one is a quadratic. If it had cancelled out, it would not be.',
          board: [{ op: 'highlight', target: 's3', part: 'sq' }],
        },
      ],
    },
    {
      id: 'highest_power',
      label: 'looking at the highest power of x',
      script: [
        {
          say: 'Here is another way to see it. Once an equation is simplified, look only at the highest power of x.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'What is the highest power of x?' },
          ],
        },
        {
          say: 'If the highest power is one, it is linear. If it is exactly two, it is quadratic. If it is three, it is cubic.',
          board: [
            { op: 'equation', id: 'p1', latex: '3x + 1 = 0 \\quad \\text{linear}' },
            { op: 'equation', id: 'p2', latex: '\\hl{sq}{x^2} + 1 = 0 \\quad \\text{quadratic}' },
            { op: 'equation', id: 'p3', latex: 'x^3 - x = 0 \\quad \\text{cubic}' },
          ],
        },
        {
          say: 'So x squared plus one equals zero is a quadratic even with no x term. Its b is simply zero. Only a is never allowed to be zero.',
          board: [{ op: 'highlight', target: 'p2', part: 'sq' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'sf_rearrange_yes',
      say: 'Is x squared minus four x equals five a quadratic equation? Tell me yes or no, and why.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 - 4x = 5' }],
      answer: { type: 'boolean', value: true },
      expected: 'yes, because it rearranges to x squared minus four x minus five equals zero',
      hints: [
        'Try bringing the five over to the left side. What is the highest power of x then?',
        'It becomes x squared minus four x minus five equals zero. Is there an x squared term with a non-zero number in front?',
      ],
    },
    {
      id: 'sf_cancels_no',
      say: 'Here is a trickier one. Is x times x plus one, plus eight, equal to x plus two times x minus two, a quadratic equation?',
      board: [{ op: 'equation', id: 'q', latex: 'x(x+1) + 8 = (x+2)(x-2)' }],
      answer: { type: 'boolean', value: false },
      expected: 'no, because after expanding, the x squared terms cancel and it becomes x plus twelve equals zero, which is linear',
      hints: [
        'Expand both sides before you decide. What do you get on the left, and on the right?',
        'The left is x squared plus x plus eight. The right is x squared minus four. What happens to x squared when you bring everything to one side?',
      ],
    },
    {
      id: 'sf_read_abc',
      say: 'Write three x squared equals five x minus two in standard form. What are a, b and c?',
      board: [{ op: 'equation', id: 'q', latex: '3x^2 = 5x - 2' }],
      answer: { type: 'coefficients', a: '3', b: '-5', c: '2' },
      expected: 'a is three, b is minus five, and c is two',
      hints: [
        'Move everything to the left so the right side is zero. Watch the signs as terms cross over.',
        'You get three x squared minus five x plus two equals zero. Now read off the three numbers with their signs.',
      ],
    },
    {
      id: 'sf_expand_yes',
      say: 'Is x plus one, all squared, equal to two times x minus three, a quadratic equation?',
      board: [{ op: 'equation', id: 'q', latex: '(x+1)^2 = 2(x-3)' }],
      answer: { type: 'boolean', value: true },
      expected: 'yes, because it simplifies to x squared plus seven equals zero',
      hints: [
        'Expand x plus one all squared, and expand the right side too.',
        'You get x squared plus two x plus one on the left, and two x minus six on the right. Bring it all to one side.',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's slow down and take it one small step at a time.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Three steps' },
            { op: 'write', id: 'g1', text: '1. Bring everything to one side' },
            { op: 'write', id: 'g2', text: '2. Find the highest power of x' },
            { op: 'write', id: 'g3', text: '3. If it is 2, the equation is quadratic' },
          ],
        },
        {
          say: 'First bring everything to one side. Then find the highest power of x. If that power is two, the equation is quadratic.',
          board: [{ op: 'highlight', target: 'g2' }],
        },
      ],
    },
    items: [
      {
        id: 'sf_scaffold_power',
        say: 'Look at x squared minus four equals zero. What is the highest power of x in it?',
        board: [{ op: 'equation', id: 'q', latex: 'x^2 - 4 = 0' }],
        answer: { type: 'numbers', values: ['2'] },
        expected: 'two',
        hints: ['Look at the little number written above x.'],
      },
      {
        id: 'sf_scaffold_a',
        say: 'In three x squared plus two x minus one equals zero, what is the value of a?',
        board: [{ op: 'equation', id: 'q', latex: '3x^2 + 2x - 1 = 0' }],
        answer: { type: 'numbers', values: ['3'] },
        expected: 'three',
        hints: ['a is the number multiplying x squared.'],
      },
    ],
  },
};

export default concept;
