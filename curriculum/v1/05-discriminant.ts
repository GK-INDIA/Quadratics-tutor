import type { ConceptInput } from '../index';

const NATURE = ['two_distinct', 'equal', 'no_real'];

const concept: ConceptInput = {
  id: 'discriminant',
  order: 5,
  title: 'The discriminant and the nature of roots',
  objectives: [
    'Compute the discriminant D = b² − 4ac',
    'Say whether the roots are two distinct real roots, two equal real roots, or not real',
    'Explain each case from the square root in the quadratic formula',
  ],
  misconceptions: {
    zero_means_no_roots: {
      label: 'thinking a discriminant of zero means there are no roots',
      strategy: 'three_examples',
    },
    negative_means_negative_roots: {
      label: 'thinking a negative discriminant means the roots are negative numbers',
      strategy: 'under_the_root',
    },
    sign_slip: { label: 'a sign slip while working out b squared minus four a c', strategy: 'three_examples' },
    positive_means_positive_roots: {
      label: 'thinking a positive discriminant means the roots are positive numbers',
      strategy: 'under_the_root',
    },
  },
  strategies: [
    {
      id: 'three_cases',
      label: 'the three cases',
      script: [
        {
          say: 'The part under the square root in the formula, b squared minus four a c, is called the discriminant. We write it as capital D.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'The discriminant' },
            { op: 'equation', id: 'd', latex: 'D = b^2 - 4ac' },
          ],
        },
        {
          say: 'D tells you about the roots before you solve anything. If D is positive, there are two different real roots.',
          board: [{ op: 'equation', id: 'c1', latex: 'D > 0 \\;\\Rightarrow\\; \\text{two distinct real roots}' }],
        },
        {
          say: 'If D is exactly zero, the two roots are equal, so you see one value twice. If D is negative, there are no real roots.',
          board: [
            { op: 'equation', id: 'c2', latex: 'D = 0 \\;\\Rightarrow\\; \\text{two equal real roots}' },
            { op: 'equation', id: 'c3', latex: 'D < 0 \\;\\Rightarrow\\; \\text{no real roots}' },
          ],
        },
      ],
    },
    {
      id: 'under_the_root',
      label: 'why, from the square root in the formula',
      script: [
        {
          say: 'Here is why the three cases happen. The formula has plus or minus the square root of D.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'It all comes from the square root' },
            { op: 'equation', id: 'f', latex: 'x = \\dfrac{-b \\pm \\hl{root}{\\sqrt{D}}}{2a}' },
            { op: 'highlight', target: 'f', part: 'root' },
          ],
        },
        {
          say: 'If D is positive, its square root is a real number, and plus and minus give two different answers. If D is zero, plus zero and minus zero are the same answer.',
          board: [
            { op: 'equation', id: 'c1', latex: 'D > 0: \\; \\pm\\sqrt{D} \\text{ gives two values}' },
            { op: 'equation', id: 'c2', latex: 'D = 0: \\; \\pm 0 \\text{ gives one value, twice}' },
          ],
        },
        {
          say: 'If D is negative, you need the square root of a negative number, and no real number is that. So there are no real roots. The sign of D says nothing about the sign of the roots.',
          board: [{ op: 'equation', id: 'c3', latex: 'D < 0: \\; \\sqrt{D} \\text{ is not a real number}' }],
        },
      ],
    },
    {
      id: 'three_examples',
      label: 'one example of each kind',
      script: [
        {
          say: 'Let us work out D for one equation of each kind. First, x squared minus five x plus six. D is twenty five minus twenty four, which is one. Positive, so two different roots: two and three.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'One of each kind' },
            { op: 'equation', id: 'e1', latex: 'x^2 - 5x + 6 = 0: \\quad D = 25 - 24 = \\hl{d}{1}' },
          ],
        },
        {
          say: 'Second, x squared minus four x plus four. D is sixteen minus sixteen, which is zero. This is x minus two, all squared, so the root two appears twice. There is still a root.',
          board: [
            { op: 'equation', id: 'e2', latex: 'x^2 - 4x + 4 = 0: \\quad D = 16 - 16 = \\hl{d}{0}' },
            { op: 'highlight', target: 'e2', part: 'd' },
          ],
        },
        {
          say: 'Third, x squared plus x plus one. D is one minus four, which is minus three. Negative, so no real number solves it.',
          board: [{ op: 'equation', id: 'e3', latex: 'x^2 + x + 1 = 0: \\quad D = 1 - 4 = \\hl{d}{-3}' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'd_nature_zero',
      say: 'An equation has a discriminant of zero. What can you say about its roots, and why?',
      board: [{ op: 'equation', id: 'q', latex: 'D = 0 \\;\\Rightarrow\\; ?' }],
      answer: { type: 'choice', value: 'equal', options: NATURE },
      expected: 'two equal real roots, because plus or minus zero gives the same value twice',
      hints: [
        'Think about the formula. What is the square root of zero?',
        'Minus b plus zero and minus b minus zero are the same number. So how many different roots are there?',
      ],
    },
    {
      id: 'd_compute',
      say: 'Find the discriminant of two x squared minus four x plus three equals zero. What number do you get?',
      board: [{ op: 'equation', id: 'q', latex: '2x^2 - 4x + 3 = 0, \\quad D = \\; ?' }],
      answer: { type: 'numbers', values: ['-8'] },
      expected: 'minus eight, because sixteen minus twenty four is minus eight',
      hints: [
        'a is two, b is minus four, c is three. Start with b squared.',
        'b squared is sixteen. Four a c is four times two times three. Subtract it from sixteen.',
      ],
    },
    {
      id: 'd_nature_negative',
      say: 'For x squared plus two x plus five equals zero, are there two distinct real roots, two equal real roots, or no real roots? Tell me the discriminant too.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 + 2x + 5 = 0' }],
      answer: { type: 'choice', value: 'no_real', options: NATURE },
      expected: 'no real roots, because the discriminant is four minus twenty, which is minus sixteen',
      hints: [
        'Work out b squared minus four a c with a equal to one, b equal to two and c equal to five.',
        'You get four minus twenty, which is minus sixteen. What does a negative discriminant tell you?',
      ],
    },
    {
      id: 'd_nature_positive',
      say: 'For three x squared minus five x minus two equals zero, what is the nature of the roots?',
      board: [{ op: 'equation', id: 'q', latex: '3x^2 - 5x - 2 = 0' }],
      answer: { type: 'choice', value: 'two_distinct', options: NATURE },
      expected: 'two distinct real roots, because the discriminant is twenty five plus twenty four, which is forty nine',
      hints: [
        'Find the discriminant first. Watch the sign of c.',
        'Twenty five minus four times three times minus two is twenty five plus twenty four. Is that positive, zero or negative?',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's do it in two small steps. First get the number. Then read what its sign means.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Two steps' },
            { op: 'write', id: 'g1', text: '1. Work out D = b² − 4ac' },
            { op: 'write', id: 'g2', text: '2. Positive: two roots. Zero: equal roots. Negative: no real roots' },
          ],
        },
        {
          say: 'Positive means two different roots. Zero means two equal roots. Negative means no real roots.',
          board: [{ op: 'highlight', target: 'g2' }],
        },
      ],
    },
    items: [
      {
        id: 'd_scaffold_compute',
        say: 'If a is one, b is four and c is four, what is b squared minus four a c?',
        board: [{ op: 'equation', id: 'q', latex: 'a = 1, \\; b = 4, \\; c = 4, \\quad b^2 - 4ac = \\; ?' }],
        answer: { type: 'numbers', values: ['0'] },
        expected: 'zero, because sixteen minus sixteen is zero',
        hints: ['b squared is sixteen. Four times one times four is also sixteen.'],
      },
      {
        id: 'd_scaffold_sign',
        say: 'A discriminant works out to twenty five. Is that positive, zero or negative?',
        board: [{ op: 'equation', id: 'q', latex: 'D = 25' }],
        answer: { type: 'choice', value: 'positive', options: ['positive', 'zero', 'negative'] },
        expected: 'positive, so there are two distinct real roots',
        hints: ['Is twenty five bigger than zero, equal to zero, or smaller than zero?'],
      },
    ],
  },
};

export default concept;
