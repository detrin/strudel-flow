import { defineNode, knob } from '../define-node';

/**
 * Where the hits fall and how dense they are: `struct("x ~ x x")` sets the
 * rhythm, `ply(2)` repeats each hit, `degradeBy(0.3)` drops some at random,
 * `segment(16)` samples a continuous pattern into 16 hits. The hits may be
 * code (`=pick(beats, "<0 1>")`).
 */
export default defineNode({
  id: 'rhythm-node',
  title: 'Rhythm',
  category: 'Audio Effects',
  icon: 'Footprints',
  order: 8,
  parameters: {
    struct: { control: 'text', label: 'hits', default: 'x*4', implicit: '' },
    ply: knob('repeat', 1, [1, 16, 1]),
    degradeBy: knob('drop', 0, [0, 1, 0.01]),
    segment: knob('segment', 0, [0, 64, 1], {
      format: (value) => (value === 0 ? 'off' : `${value}`),
    }),
  },
  // Each reshapes the pattern, so their order matters.
  ordered: true,
});
