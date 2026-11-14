import { defineNode, knob } from '../../define-node';
import { readPattern, writePattern } from './pattern';

/** Samples or synths in mini-notation: `s("bd*4 [~ sd]")`. */
export default defineNode({
  id: 'sound-node',
  title: 'Sound',
  category: 'Instruments',
  icon: 'AudioLines',
  order: 6,
  parameters: {
    pattern: { control: 'text', label: 'sounds', default: 'bd*4 [~ sd]' },
    fn: {
      control: 'select',
      label: 'as',
      default: 's',
      options: [
        { value: 's', label: 's' },
        { value: 'sound', label: 'sound' },
      ],
    },
    fast: knob('speed', 1, [0.25, 64, 0.25]),
  },
  methods: [],
  parse: () => null,
  parseSource: (call) => readPattern(call, ['s', 'sound']),
  generate: (values) => writePattern(values),
});
