import { defineNode, knob, knobValue } from '../define-node';

/**
 * Speed and direction: `fast(2)`, `slow(4)` (each also a pattern, like
 * `"<1 2>"`), `rev()` or `palindrome()`, and `late(0.01)` to nudge.
 */
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
    slow: knob('slow', 1, [0.125, 32, 0.125], { unit: '×' }),
    lateOffset: knob('late', 0, [0, 1, 0.01]),
  },
  methods: ['fast', 'slow', 'rev', 'palindrome', 'late'],
  ordered: true,
  parse: (calls) => {
    const values: Record<string, string | number> = {};
    for (const { name, args } of calls) {
      const [arg] = args;
      if (args.length === 1 && name === 'fast') values.rate = knobValue(arg);
      else if (args.length === 1 && name === 'slow')
        values.slow = knobValue(arg);
      else if (args.length === 1 && name === 'late')
        values.lateOffset = knobValue(arg);
      else if (name === 'rev' && !args.length) values.direction = 'reverse';
      else if (name === 'palindrome' && !args.length)
        values.direction = 'pingpong';
      else return null;
    }
    return values;
  },
  generate: ({ rate, slow, direction, lateOffset }) => {
    const calls = [];
    if (rate !== 1) calls.push(`fast(${rate})`);
    if (slow !== 1) calls.push(`slow(${slow})`);
    if (direction === 'reverse') calls.push('rev()');
    if (direction === 'pingpong') calls.push('palindrome()');
    if (lateOffset !== 0) calls.push(`late(${lateOffset})`);
    // At its defaults the node still shows up in the code.
    return calls.join('.') || 'fast(1)';
  },
});
