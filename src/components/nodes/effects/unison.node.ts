import { defineNode, knob } from '../define-node';

/**
 * Stacked, detuned voices (Strudel's supersaw): how many, how far apart in
 * pitch, and how wide in stereo. Defaults are supersaw's own.
 */
export default defineNode({
  id: 'unison-node',
  title: 'Unison',
  category: 'Audio Effects',
  icon: 'AudioWaveform',
  order: 18,
  parameters: {
    unison: knob('voices', 5, [1, 16, 1]),
    detune: knob('detune', 0.18, [0, 2, 0.01]),
    spread: knob('spread', 0.6, [0, 1, 0.01]),
  },
});
