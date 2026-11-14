import { defineNode, knob } from '../define-node';
export default defineNode({
  id: 'time-node',
  title: 'Time',
  category: 'Audio Effects',
  icon: 'Clock',
  order: 1,
  parameters: {
    direction: {
      control: 'select',
      label: 'Direction',
      default: 'forward',
      options: [
        { value: 'forward', label: 'Forward' },
        { value: 'reverse', label: 'rev' },
        { value: 'pingpong', label: 'palindrome' },
      ],
    },
    rate: knob('fast', 1, [0.125, 8, 0.125], { unit: '×' }),
    lateOffset: knob('late', 0, [0, 1, 0.01]),
  },
  methods: ['fast', 'rev', 'palindrome', 'late'],
  ordered: true,
  parse: (calls) => {
    const values = { rate: 1, direction: 'forward', lateOffset: 0 };
    for (const { name, args } of calls) {
      const [arg] = args;
      if (name === 'fast' && typeof arg === 'number') values.rate = arg;
      else if (name === 'late' && typeof arg === 'number')
        values.lateOffset = arg;
      else if (name === 'rev' && !args.length) values.direction = 'reverse';
      else if (name === 'palindrome' && !args.length)
        values.direction = 'pingpong';
      else return null;
    }
    return values;
  },
  generate: ({ rate, direction, lateOffset }) => {
    const calls = [];
    if (rate !== 1) calls.push(`fast(${rate})`);
    if (direction === 'reverse') calls.push('rev()');
    if (direction === 'pingpong') calls.push('palindrome()');
    if (lateOffset !== 0) calls.push(`late(${lateOffset})`);
    // At its defaults the node still shows up in the code.
    return calls.join('.') || 'fast(1)';
  },
});
