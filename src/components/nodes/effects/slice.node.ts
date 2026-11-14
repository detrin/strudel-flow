import { defineNode, knob } from '../define-node';

/**
 * Cuts a sample to the tempo: `loopAt(2)` stretches it over 2 cycles,
 * `chop(16)` cuts each event into 16 grains.
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
    chop: knob('chop', 1, [1, 64, 1]),
  },
  ordered: true,
});
