import type { ConceptInput } from '../index';

const concept: ConceptInput = {
  id: 'word_problems',
  order: 6,
  title: 'Word problems',
  objectives: [
    'Name the unknown and translate a situation into a quadratic equation',
    'Bring the equation to standard form and solve it',
    'Reject a solution that makes no sense in the situation, and answer what was asked',
  ],
  misconceptions: {
    wrong_setup: { label: 'turning the words into the wrong equation', strategy: 'phrase_by_phrase' },
    not_standard_form: {
      label: 'trying to solve before bringing everything to one side',
      strategy: 'phrase_by_phrase',
    },
    keeps_negative: {
      label: 'keeping a negative answer for something that cannot be negative, like a length or an age',
      strategy: 'check_the_story',
    },
    answers_wrong_quantity: {
      label: 'stopping at x without answering what the question asked for',
      strategy: 'check_the_story',
    },
  },
  strategies: [
    {
      id: 'four_steps',
      label: 'four steps with a worked example',
      script: [
        {
          say: 'Word problems take four steps. Name the unknown. Write the equation. Solve it. Then check the answers against the story.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Name it, write it, solve it, check it' },
            { op: 'write', id: 'p', text: 'The product of two consecutive positive integers is 306.' },
          ],
        },
        {
          say: 'The product of two consecutive positive integers is three hundred and six. Call the smaller one x. Then the next one is x plus one.',
          board: [{ op: 'equation', id: 's1', latex: 'x(x + 1) = 306' }],
        },
        {
          say: 'Expand and bring everything to one side. x squared plus x minus three hundred and six equals zero. That factorises as x minus seventeen, times x plus eighteen.',
          board: [
            { op: 'equation', id: 's2', latex: 'x^2 + x - 306 = 0' },
            { op: 'equation', id: 's3', latex: '(x - 17)(x + 18) = 0' },
          ],
        },
        {
          say: 'So x is seventeen or minus eighteen. The story says positive integers, so we reject minus eighteen. The numbers are seventeen and eighteen.',
          board: [
            { op: 'equation', id: 's4', latex: 'x = 17 \\quad \\hl{rej}{(x = -18 \\text{ rejected})}' },
            { op: 'highlight', target: 's4', part: 'rej' },
          ],
        },
      ],
    },
    {
      id: 'phrase_by_phrase',
      label: 'translating phrase by phrase',
      script: [
        {
          say: 'The hard part is turning words into algebra. So go one phrase at a time.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'One phrase at a time' },
            { op: 'write', id: 'p', text: 'A rectangle is 3 m longer than it is wide. Its area is 40 m².' },
          ],
        },
        {
          say: 'Call the width x. Three metres longer than the width means the length is x plus three.',
          board: [{ op: 'equation', id: 's1', latex: '\\text{width} = x, \\quad \\text{length} = \\hl{len}{x + 3}' }],
        },
        {
          say: 'Area is length times width. So x, times x plus three, equals forty.',
          board: [
            { op: 'highlight', target: 's1', part: 'len' },
            { op: 'equation', id: 's2', latex: 'x(x + 3) = 40' },
          ],
        },
        {
          say: 'Before solving, expand and move the forty across. You get x squared plus three x minus forty equals zero. Now it is in standard form and ready to solve.',
          board: [{ op: 'equation', id: 's3', latex: 'x^2 + 3x - 40 = 0' }],
        },
      ],
    },
    {
      id: 'check_the_story',
      label: 'checking answers against the story',
      script: [
        {
          say: 'Solving the equation is not the end. The equation can give two answers when the story allows only one.',
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Does the answer fit the story?' },
            { op: 'equation', id: 's1', latex: 'x^2 + 3x - 40 = 0 \\;\\Rightarrow\\; x = 5 \\text{ or } \\hl{neg}{x = -8}' },
          ],
        },
        {
          say: 'Here x is the width of a rectangle. A width cannot be minus eight metres, so that answer is rejected. The width is five.',
          board: [{ op: 'highlight', target: 's1', part: 'neg' }],
        },
        {
          say: 'Then answer what was actually asked. If the question wants the length, and the length is x plus three, the answer is eight metres, not five.',
          board: [{ op: 'equation', id: 's2', latex: '\\text{width} = 5 \\text{ m}, \\quad \\text{length} = 5 + 3 = 8 \\text{ m}' }],
        },
      ],
    },
  ],
  items: [
    {
      id: 'w_setup',
      say: 'The sum of a number and its square is forty two. Call the number x. What quadratic equation do you get in standard form? Tell me a, b and c.',
      board: [{ op: 'write', id: 'q', text: 'A number plus its square is 42. Equation in standard form?' }],
      answer: { type: 'coefficients', a: '1', b: '1', c: '-42' },
      expected: 'x squared plus x minus forty two equals zero, so a is one, b is one, and c is minus forty two',
      hints: [
        'The number is x and its square is x squared. Write "their sum is forty two" as an equation.',
        'You get x squared plus x equals forty two. Now move the forty two to the left side.',
      ],
    },
    {
      id: 'w_rectangle',
      say: 'A rectangle is two metres longer than it is wide, and its area is forty eight square metres. What is its width? Tell me how you set it up.',
      board: [{ op: 'write', id: 'q', text: 'Length = width + 2 m. Area = 48 m². Width?' }],
      answer: { type: 'numbers', values: ['6'] },
      expected: 'six metres. The equation x squared plus two x minus forty eight equals zero gives six or minus eight, and a width cannot be negative',
      hints: [
        'Call the width x. What is the length in terms of x? Then use area equals length times width.',
        'You get x squared plus two x minus forty eight equals zero, which factorises as x plus eight, times x minus six. Which answer can be a width?',
      ],
    },
    {
      id: 'w_consecutive',
      say: 'The product of two consecutive positive integers is seventy two. What is the smaller integer?',
      board: [{ op: 'write', id: 'q', text: 'Two consecutive positive integers multiply to 72. Smaller one?' }],
      answer: { type: 'numbers', values: ['8'] },
      expected: 'eight. The equation x squared plus x minus seventy two equals zero gives eight or minus nine, and the integers are positive',
      hints: [
        'Call the smaller integer x. What is the next integer? Multiply them and set the product equal to seventy two.',
        'You get x squared plus x minus seventy two equals zero, which factorises as x plus nine, times x minus eight.',
      ],
    },
    {
      id: 'w_ages',
      say: 'Rohan is four years older than his sister. The product of their ages is ninety six. How old is his sister?',
      board: [{ op: 'write', id: 'q', text: "Rohan = sister + 4 years. Ages multiply to 96. Sister's age?" }],
      answer: { type: 'numbers', values: ['8'] },
      expected: 'eight years. The equation x squared plus four x minus ninety six equals zero gives eight or minus twelve, and an age cannot be negative',
      hints: [
        "Call the sister's age x. Then Rohan is x plus four. Multiply the two ages.",
        'You get x squared plus four x minus ninety six equals zero, which factorises as x plus twelve, times x minus eight.',
      ],
    },
  ],
  scaffold: {
    strategy: {
      id: 'guided_steps',
      label: 'one small step at a time',
      script: [
        {
          say: "Let's take a word problem one small step at a time, and I will do the setting up with you.",
          board: [
            { op: 'clear' },
            { op: 'write', id: 'title', text: 'Four steps' },
            { op: 'write', id: 'g1', text: '1. Name the unknown: call it x' },
            { op: 'write', id: 'g2', text: '2. Write each quantity using x' },
            { op: 'write', id: 'g3', text: '3. Make the equation, bring it to zero, solve' },
            { op: 'write', id: 'g4', text: '4. Keep only the answer that fits the story' },
          ],
        },
        {
          say: 'The last step is the one people forget. Keep only the answer that fits the story.',
          board: [{ op: 'highlight', target: 'g4' }],
        },
      ],
    },
    items: [
      {
        id: 'w_scaffold_choose',
        say: 'Suppose the width of a garden works out as x equals three or x equals minus eight. Which value is the width?',
        board: [{ op: 'equation', id: 'q', latex: 'x = 3 \\text{ or } x = -8, \\quad \\text{width} = \\; ?' }],
        answer: { type: 'numbers', values: ['3'] },
        expected: 'three, because a width cannot be negative',
        hints: ['Can the width of a garden be a negative number?'],
      },
      {
        id: 'w_scaffold_c',
        say: 'Take x, times x plus five, equals twenty four. When you expand it and bring everything to one side, what is c?',
        board: [{ op: 'equation', id: 'q', latex: 'x(x + 5) = 24 \\;\\Rightarrow\\; x^2 + 5x + c = 0, \\quad c = \\; ?' }],
        answer: { type: 'numbers', values: ['-24'] },
        expected: 'minus twenty four',
        hints: ['Expanding gives x squared plus five x equals twenty four. What happens to twenty four when it crosses to the left?'],
      },
    ],
  },
};

export default concept;
