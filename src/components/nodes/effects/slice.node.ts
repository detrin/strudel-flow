import {
  defineNode,
  knob,
  knobValue,
  textCode,
  textValue,
} from '../define-node';

/**
 * Cuts a sample to the tempo: `loopAt(2)` stretches it over 2 cycles,
 * `fit()` fits it to its event, `chop(16)` and `striate(4)` cut it into
 * grains, `slice(8, "0 3 2 1")` plays 8 slices in a new order, and
 * `scrub("0 0.5")` jumps to a position. Patterns are mini-notation or
 * code after `=`.
 */
export default defineNode({
  id: 'slice-node',
  title: 'Slice',
  category: 'Audio Effects',
  icon: 'Scissors',
  order: 10,
  parameters: {
    loopAt: knob('loop', 1, [0.25, 16, 0.25], {
      implicit: 0,
      format: (value) => (value <= 0 ? 'off' : `${value} cyc`),
    }),
    fit: {
      control: 'select',
      label: 'fit',
      default: 'off',
      options: [
        { value: 'off', label: 'off' },
        { value: 'on', label: 'fit()' },
      ],
    },
    chop: knob('chop', 1, [1, 64, 1]),
    striate: knob('striate', 1, [1, 64, 1]),
    slices: knob('slices', 0, [0, 64, 1], {
      format: (value) => (value === 0 ? 'off' : `${value}`),
    }),
    order: {
      control: 'text',
      label: 'slice order',
      default: '0 1 2 3',
      when: (values) => values.slices !== 0,
    },
    scrub: { control: 'text', label: 'scrub', default: '' },
  },
  methods: ['loopAt', 'fit', 'chop', 'striate', 'slice', 'scrub'],
  ordered: true,
  parse: (calls) => {
    const values: Record<string, string | number> = {};
    for (const { name, args } of calls) {
      const [arg] = args;
      if (name === 'fit' && !args.length) values.fit = 'on';
      else if (name === 'slice' && args.length === 2) {
        values.slices = knobValue(arg);
        values.order = textValue(args[1]);
      } else if (name === 'scrub' && args.length === 1)
        values.scrub = textValue(arg);
      else if (
        ['loopAt', 'chop', 'striate'].includes(name) &&
        args.length === 1
      )
        values[name] = knobValue(arg);
      else return null;
    }
    // Code without slice() keeps its order box empty.
    if (values.slices === undefined) values.order = '0 1 2 3';
    return values;
  },
  generate: ({ loopAt, fit, chop, striate, slices, order, scrub }) => {
    const calls = [];
    if (loopAt !== 0) calls.push(`loopAt(${loopAt})`);
    if (fit === 'on') calls.push('fit()');
    if (chop !== 1) calls.push(`chop(${chop})`);
    if (striate !== 1) calls.push(`striate(${striate})`);
    if (slices !== 0) calls.push(`slice(${slices}, ${textCode(order)})`);
    if (scrub !== '') calls.push(`scrub(${textCode(scrub)})`);
    return calls.join('.') || 'chop(1)';
  },
});
