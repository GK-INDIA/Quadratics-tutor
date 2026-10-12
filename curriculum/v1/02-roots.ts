import type { ConceptInput } from '../index';

const concept: ConceptInput = {
  id: 'roots',
  order: 2,
  title: 'What a root is, and checking one by substitution',
  objectives: [
    'Explain a root as a value of x that makes the equation true',
    'Check a candidate root by substituting it, including negative values',
    'Reject a value when the left side does not come to exactly zero',
  ],
  misconceptions: {
    negative_squared: { label: 'treating a negative number squared as negative', strategy: 'brackets' },
    arithmetic_slip: { label: 'an arithmetic slip while substituting', strategy: 'brackets' },
    nonzero_accepted: { label: 'accepting a value even though the left side does not come to zero', strategy: 'non_example' },
    root_is_coefficient: { label: 'mixing up a root with one of the coefficients', strategy: 'non_example' },
  },
  strategies: [
    {
      id: 'definition_check',
      label: 'definition with a worked check',
      script: [
        {
          say: 'A root of a quadratic equation is a value of x that makes the equation true. Put it in, and the left side comes to zero.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Roots: values of x that make it true' },
            { op: 'equation', id: 'e', latex: 'x^2 - 5x + 6 = 0' },
          ],
        },
        {
          say: 'Let us test x equals two. Two squared is four. Five times two is ten. Four minus ten plus six is zero.',
          board: [{ op: 'equation', id: 'sub', latex: '(2)^2 - 5(2) + 6 = 4 - 10 + 6 = \\hl{zero}{0}' }],
        },
        {
          say: 'It came to zero, so two is a root. A quadratic can have up to two roots. Here the other one is three.',
          board: [
            { op: 'highlight', target: 'sub', part: 'zero' },
            { op: 'equation', id: 'roots', latex: 'x = 2 \\text{ or } x = 3' },
          ],
        },
      ],
    },
    {
      id: 'brackets',
      label: 'substituting with brackets',
      script: [
        {
          say: 'Most slips happen with negative numbers. So always put the value in brackets when you substitute.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Substitute inside brackets' },
            { op: 'equation', id: 'e', latex: 'x^2 + x - 2 = 0' },
          ],
        },
        {
          say: 'Test x equals minus two. Minus two, in brackets, squared is plus four, because a negative times a negative is positive.',
          board: [
            { op: 'equation', id: 's1', latex: '\\hl{sq}{(-2)^2} + (-2) - 2' },
            { op: 'highlight', target: 's1', part: 'sq' },
          ],
        },
        {
          say: 'So we have four, minus two, minus two. That is zero, so minus two is a root.',
          board: [{ op: 'equation', id: 's2', latex: '= 4 - 2 - 2 = 0' }],
        },
      ],
    },
    {
      id: 'non_example',
      label: 'a value that is not a root',
      script: [
        {
          say: 'It helps to see a value that fails. A root must make the left side exactly zero.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Exactly zero, or it is not a root' },
            { op: 'equation', id: 'e', latex: 'x^2 - 5x + 6 = 0' },
          ],
        },
        {
          say: 'Try x equals one. One squared is one. Five times one is five. One minus five plus six is two.',
          board: [{ op: 'equation', id: 's1', latex: '(1)^2 - 5(1) + 6 = \\hl{two}{2} \\neq 0' }],
        },
        {
          say: 'Two is not zero, so one is not a root. The numbers in the equation, like minus five and six, are coefficients, not roots.',
          board: [{ op: 'highlight', target: 's1', part: 'two' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'r_check_yes',
      say: 'Is x equals three a root of x squared minus x minus six equals zero? Show me the substitution.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 - x - 6 = 0, \\quad x = 3\\,?' }],
      answer: { type: 'boolean', value: true },
      expected: 'yes, because nine minus three minus six is zero',
      hints: [
        'Replace every x with three. What is three squared?',
        'You get nine, minus three, minus six. What does that come to?',
      ],
    },
    {
      id: 'r_check_no',
      say: 'Is x equals two a root of x squared minus three x plus one equals zero?',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 - 3x + 1 = 0, \\quad x = 2\\,?' }],
      answer: { type: 'boolean', value: false },
      expected: 'no, because four minus six plus one is minus one, not zero',
      hints: [
        'Put two in place of x and work out each term.',
        'You get four, minus six, plus one. Is that zero?',
      ],
    },
    {
      id: 'r_negative',
      say: 'Is x equals minus three a root of x squared plus two x minus three equals zero?',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 + 2x - 3 = 0, \\quad x = -3\\,?' }],
      answer: { type: 'boolean', value: true },
      expected: 'yes, because nine minus six minus three is zero',
      hints: [
        'Put minus three in brackets. What is minus three, all squared?',
        'You get nine, plus two times minus three, minus three. Work that out.',
      ],
    },
    {
      id: 'r_value',
      say: 'Substitute x equals minus one into two x squared plus x minus three. What number do you get?',
      board: [{ op: 'equation', id: 'q', latex: '2x^2 + x - 3, \\quad x = -1' }],
      answer: { type: 'numbers', values: ['-2'] },
      expected: 'minus two, so minus one is not a root',
      hints: [
        'Minus one squared is plus one. So what is two x squared?',
        'You get two, minus one, minus three.',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's slow down and do the substitution in three small steps.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Three steps' },
            { op: 'write', id: 'g1', text: '1. Write the value in brackets wherever x appears' },
            { op: 'write', id: 'g2', text: '2. Work out each term on its own' },
            { op: 'write', id: 'g3', text: '3. Add them up. Zero means it is a root' },
          ],
        },
        {
          say: 'Write the value in brackets wherever x appears. Work out each term on its own. Then add them up.',
          board: [{ op: 'highlight', target: 'g1' }],
        },
      ],
    },
    items: [
      {
        id: 'r_scaffold_square',
        say: 'What is minus two, all squared?',
        board: [{ op: 'equation', id: 'q', latex: '(-2)^2 = \\; ?' }],
        answer: { type: 'numbers', values: ['4'] },
        expected: 'four',
        hints: ['Squaring means multiplying the number by itself. What is minus two times minus two?'],
      },
      {
        id: 'r_scaffold_sub',
        say: 'Put x equals one into x squared minus one. What do you get?',
        board: [{ op: 'equation', id: 'q', latex: 'x^2 - 1, \\quad x = 1' }],
        answer: { type: 'numbers', values: ['0'] },
        expected: 'zero',
        hints: ['One squared is one. Then take away one.'],
      },
    ],
  },
};

export default concept;
