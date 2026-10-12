import type { ConceptInput } from '../index';

const concept: ConceptInput = {
  id: 'factorisation',
  order: 3,
  title: 'Solving by factorisation',
  objectives: [
    'Split the middle term using two numbers with the right product and sum',
    'Use the zero-product rule to read off both roots',
    'Bring the equation to "equals zero" before factorising, and never divide by x',
  ],
  misconceptions: {
    factor_signs: { label: 'choosing the two numbers with the wrong signs when splitting the middle term', strategy: 'sum_product' },
    root_sign_flip: { label: 'reading the roots off the brackets with the wrong sign', strategy: 'zero_product' },
    not_equal_zero: { label: 'factorising before making one side zero', strategy: 'zero_product' },
    lost_root: { label: 'dividing by x and losing the root x equals zero', strategy: 'zero_product' },
  },
  strategies: [
    {
      id: 'split_middle_term',
      label: 'splitting the middle term',
      script: [
        {
          say: 'To solve by factorising, find two numbers that multiply to give c and add to give b. Here they must multiply to six and add to minus five.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Factorising: split the middle term' },
            { op: 'equation', id: 'e', latex: 'x^2 \\hl{b}{- 5x} \\hl{c}{+ 6} = 0' },
          ],
        },
        {
          say: 'Minus two and minus three work. So split minus five x into minus two x and minus three x.',
          board: [
            { op: 'highlight', target: 'e', part: 'b' },
            { op: 'equation', id: 's1', latex: 'x^2 - 2x - 3x + 6 = 0' },
          ],
        },
        {
          say: 'Group in pairs and take out the common factors. You get x minus two, times x minus three, equals zero.',
          board: [{ op: 'equation', id: 's2', latex: '(x - 2)(x - 3) = 0' }],
        },
        {
          say: 'If a product is zero, one of its factors is zero. So x is two, or x is three.',
          board: [{ op: 'equation', id: 's3', latex: 'x = 2 \\text{ or } x = 3' }],
        },
      ],
    },
    {
      id: 'sum_product',
      label: 'listing the pairs by product and sum',
      script: [
        {
          say: 'Let us be systematic about the signs. First write down the product and the sum you need.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Product and sum' },
            { op: 'equation', id: 'e', latex: 'x^2 + x - 6 = 0' },
            { op: 'equation', id: 'ps', latex: '\\text{product} = \\hl{p}{-6}, \\quad \\text{sum} = +1' },
          ],
        },
        {
          say: 'The product is negative, so the two numbers have opposite signs. List the pairs that multiply to minus six.',
          board: [
            { op: 'highlight', target: 'ps', part: 'p' },
            { op: 'equation', id: 'pairs', latex: '(-1, 6) \\quad (1, -6) \\quad \\hl{ok}{(-2, 3)} \\quad (2, -3)' },
          ],
        },
        {
          say: 'Only minus two and three add up to plus one. So the factors are x minus two and x plus three.',
          board: [
            { op: 'highlight', target: 'pairs', part: 'ok' },
            { op: 'equation', id: 's2', latex: '(x - 2)(x + 3) = 0' },
          ],
        },
        {
          say: 'Each bracket gives a root with the opposite sign. x minus two gives two. x plus three gives minus three.',
          board: [{ op: 'equation', id: 's3', latex: 'x = 2 \\text{ or } x = -3' }],
        },
      ],
    },
    {
      id: 'zero_product',
      label: 'why one side must be zero',
      script: [
        {
          say: 'Factorising only works because of one fact. If two things multiply to give zero, at least one of them is zero.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'The zero-product rule' },
            { op: 'equation', id: 'rule', latex: 'A \\times B = 0 \\;\\Rightarrow\\; A = 0 \\text{ or } B = 0' },
          ],
        },
        {
          say: 'That is why one side must be zero before you start. Take x squared equals three x. Move the three x over first.',
          board: [
            { op: 'equation', id: 'e', latex: 'x^2 = 3x' },
            { op: 'equation', id: 's1', latex: 'x^2 - 3x = 0' },
          ],
        },
        {
          say: 'Now take out x. You get x, times x minus three, equals zero. So x is zero, or x is three.',
          board: [
            { op: 'equation', id: 's2', latex: '\\hl{x}{x}(x - 3) = 0' },
            { op: 'equation', id: 's3', latex: 'x = 0 \\text{ or } x = 3' },
          ],
        },
        {
          say: 'Never divide both sides by x. You would throw away the root zero.',
          board: [{ op: 'highlight', target: 's2', part: 'x' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'f_basic',
      say: 'Solve x squared minus seven x plus ten equals zero by factorising. What are the roots, and which two numbers did you use?',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 - 7x + 10 = 0' }],
      answer: { type: 'numbers', values: ['2', '5'] },
      expected: 'x equals two or x equals five, from the factors x minus two and x minus five',
      hints: [
        'You need two numbers that multiply to ten and add to minus seven.',
        'Minus two and minus five do it. What are the brackets, and what does each one give for x?',
      ],
    },
    {
      id: 'f_signs',
      say: 'Solve x squared plus two x minus fifteen equals zero. What are the two roots?',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 + 2x - 15 = 0' }],
      answer: { type: 'numbers', values: ['-5', '3'] },
      expected: 'x equals three or x equals minus five, from the factors x plus five and x minus three',
      hints: [
        'The product is minus fifteen, so the two numbers have opposite signs. They must add to plus two.',
        'Five and minus three work. The brackets are x plus five and x minus three. What does each give?',
      ],
    },
    {
      id: 'f_no_constant',
      say: 'Solve x squared equals four x. Give me every root.',
      board: [{ op: 'equation', id: 'q', latex: 'x^2 = 4x' }],
      answer: { type: 'numbers', values: ['0', '4'] },
      expected: 'x equals zero or x equals four',
      hints: [
        'First make one side zero. Do not divide by x.',
        'You get x squared minus four x equals zero. Take out the common factor x.',
      ],
    },
    {
      id: 'f_leading',
      say: 'Solve two x squared minus five x plus three equals zero by factorising.',
      board: [{ op: 'equation', id: 'q', latex: '2x^2 - 5x + 3 = 0' }],
      answer: { type: 'numbers', values: ['3/2', '1'] },
      expected: 'x equals one or x equals three over two',
      hints: [
        'Here the two numbers must multiply to a times c, which is six, and add to minus five.',
        'Use minus two and minus three. Two x squared minus two x minus three x plus three. Now group in pairs.',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's take factorising one small step at a time.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Four steps' },
            { op: 'write', id: 'g1', text: '1. Make one side zero' },
            { op: 'write', id: 'g2', text: '2. Find two numbers: product c, sum b' },
            { op: 'write', id: 'g3', text: '3. Write the two brackets' },
            { op: 'write', id: 'g4', text: '4. Set each bracket to zero' },
          ],
        },
        {
          say: 'The step that matters most is the second one. Find two numbers with the right product and the right sum.',
          board: [{ op: 'highlight', target: 'g2' }],
        },
      ],
    },
    items: [
      {
        id: 'f_scaffold_pair',
        say: 'Which two numbers multiply to give six and add to give five?',
        board: [{ op: 'equation', id: 'q', latex: '? \\times ? = 6, \\quad ? + ? = 5' }],
        answer: { type: 'numbers', values: ['2', '3'] },
        expected: 'two and three',
        hints: ['Try the pairs that multiply to six: one and six, or two and three. Which pair adds to five?'],
      },
      {
        id: 'f_scaffold_brackets',
        say: 'If x minus four, times x plus one, equals zero, what are the two values of x?',
        board: [{ op: 'equation', id: 'q', latex: '(x - 4)(x + 1) = 0' }],
        answer: { type: 'numbers', values: ['4', '-1'] },
        expected: 'four and minus one',
        hints: ['Set each bracket equal to zero. What makes x minus four zero? What makes x plus one zero?'],
      },
    ],
  },
};

export default concept;
