import { defineNode, knob } from '../define-node';

/**
 * A pitch sweep on each note, like a kick's drop: `penv(12)` starts 12
 * semitones off, `pdecay(0.1)` glides back, `pcurve(1)` bends the glide
 * exponentially. Strudel turns the envelope on when any of them is set.
 */
const auto = (value: number) => (value === 0 ? 'auto' : `${value} s`);

export default defineNode({
  id: 'pitch-envelope-node',
  title: 'Pitch Env',
  category: 'Audio Effects',
  icon: 'TrendingDown',
  order: 7,
  parameters: {
    // Strudel sweeps 1 semitone when only the times are set.
    penv: knob('semitones', 12, [-48, 48, 1], { implicit: 1 }),
    // 0 leaves the time to Strudel, which picks it from the others.
    pattack: knob('attack', 0, [0, 1, 0.001], { format: auto }),
    pdecay: knob('decay', 0, [0, 2, 0.001], { format: auto }),
    prelease: knob('release', 0, [0, 2, 0.001], { format: auto }),
    pcurve: knob('curve', 0, [0, 1, 1], {
      format: (value) =>
        value === 1 ? 'exp' : value === 0 ? 'lin' : `${value}`,
    }),
  },
});
