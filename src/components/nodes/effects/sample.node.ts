import { defineNode, knob } from '../define-node';

const off = (value: number) => (value <= 0 ? 'off' : String(value));

/**
 * How a sample plays: speed (negative plays backwards), the part of it
 * (begin/end), how long (clip), pitch glide (accelerate) and a cut group
 * whose samples stop each other.
 */
export default defineNode({
  id: 'sample-node',
  title: 'Sample',
  category: 'Audio Effects',
  icon: 'Disc3',
  order: 9,
  parameters: {
    speed: knob('speed', 1, [-4, 4, 0.01]),
    begin: knob('begin', 0, [0, 1, 0.01]),
    end: knob('end', 1, [0, 1, 0.01]),
    // Unset, a sample plays to its end; clip(1) stops it with its event.
    clip: knob('clip', 1, [0, 4, 0.05], { implicit: 0, format: off }),
    accelerate: knob('glide', 0, [-4, 4, 0.01], { method: 'accelerate' }),
    // cut(0) is a group too, so "off" is below the range Strudel uses.
    cut: knob('cut', -1, [-1, 16, 1], {
      format: (value) => (value < 0 ? 'off' : String(value)),
    }),
  },
});
