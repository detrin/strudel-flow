import { defineNode, knob } from '../define-node';

/**
 * Pitch: `scale("C:minor")` turns numbers into notes of a scale,
 * `transpose(12)` shifts by semitones (also a chord: `"[0, 7]"`).
 */
export default defineNode({
  id: 'pitch-node',
  title: 'Pitch',
  category: 'Audio Effects',
  icon: 'ArrowUpDown',
  order: 7,
  parameters: {
    scale: {
      control: 'text',
      label: 'scale',
      default: 'C:major',
      implicit: '',
    },
    transpose: knob('semitones', 0, [-24, 24, 1]),
  },
  // A scale must come before a transpose to read degrees as notes.
  ordered: true,
});
