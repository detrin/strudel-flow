import { defineNode, knob } from '../define-node';

/**
 * Which orbit (effect bus) the line plays on. Lines on the same orbit share
 * its reverb and delay; Strudel's default is orbit 1.
 */
export default defineNode({
  id: 'output-node',
  title: 'Output',
  category: 'Audio Effects',
  icon: 'Route',
  order: 30,
  parameters: {
    orbit: knob('orbit', 1, [0, 11, 1]),
  },
});
