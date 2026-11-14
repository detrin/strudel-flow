import { defineNode, knob } from '../../define-node';
import { readPattern, writePattern } from './pattern';

/** Notes in mini-notation: `note("<e4 d#4 b3>")`, or scale degrees `n("0 2 4")`. */
export default defineNode({
  id: 'notes-node',
  title: 'Notes',
  category: 'Instruments',
  icon: 'Music2',
  order: 5,
  parameters: {
    pattern: { control: 'text', label: 'notes', default: 'c3 e3 g3 b3' },
    fn: {
      control: 'select',
      label: 'as',
      default: 'note',
      options: [
        { value: 'note', label: 'note names' },
        { value: 'n', label: 'scale degrees (n)' },
      ],
    },
    fast: knob('speed', 1, [0.25, 64, 0.25]),
  },
  methods: [],
  parse: () => null,
  parseSource: (call) => readPattern(call, ['note', 'n']),
  generate: (values) => writePattern(values),
});
