import { defineNode, knob } from '../define-node';

/**
 * Frequency modulation: `fm(4)` how much, `fmh(2)` the modulator's pitch
 * as a ratio, `fmdecay(0.1)` how fast the modulation fades.
 */
export default defineNode({
  id: 'texture-node',
  title: 'FM',
  category: 'Audio Effects',
  icon: 'Zap',
  order: 2,
  parameters: {
    fm: knob('fm', 0, [0, 10, 0.1]),
    fmh: knob('ratio', 1, [0.125, 16, 0.125]),
    fmdecay: knob('decay', 0, [0, 2, 0.01], {
      format: (value) => (value === 0 ? 'off' : `${value} s`),
    }),
  },
});
