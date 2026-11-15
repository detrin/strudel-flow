import { defineNode, knob } from '../define-node';

/**
 * Dirt: `shape(0.8)` waveshaping, `distort(0.5)`, `crush(4)` (bit depth)
 * and `coarse(8)` (sample-rate reduction). Values Strudel leaves off
 * (shape 0, distort 0, crush and coarse unset) show as off.
 */
const off =
  (when: number, unit = '') =>
  (value: number) =>
    value === when ? 'off' : `${value}${unit}`;

export default defineNode({
  id: 'distortion-node',
  title: 'Distortion',
  category: 'Audio Effects',
  icon: 'Flame',
  order: 2,
  parameters: {
    shape: knob('shape', 0.5, [0, 1, 0.01], { implicit: 0 }),
    distort: knob('distort', 0, [0, 3, 0.01]),
    crush: knob('crush', 16, [1, 16, 1], { format: off(16, ' bit') }),
    coarse: knob('coarse', 1, [1, 32, 1], { format: off(1) }),
  },
});
