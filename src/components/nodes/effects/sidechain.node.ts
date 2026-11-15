import { defineNode, knob } from '../define-node';

/**
 * Sidechain: each hit of this line ducks the lines on another orbit
 * (`duck(2)`), down by `duckdepth` and back up over `duckattack` seconds.
 * The ducked line needs `.orbit(2)`. The orbit is code (`=2`) or a
 * pattern (`2:3` ducks two orbits). Defaults are Strudel's own.
 */
export default defineNode({
  id: 'sidechain-node',
  title: 'Sidechain',
  category: 'Audio Effects',
  icon: 'ChevronsDown',
  order: 9,
  parameters: {
    duck: {
      control: 'text',
      label: 'ducks orbit',
      default: '=2',
      implicit: '',
    },
    duckdepth: knob('depth', 1, [0, 1, 0.01]),
    duckattack: knob('release', 0.1, [0.002, 1, 0.001], { unit: ' s' }),
    duckonset: knob('onset', 0, [0, 0.1, 0.001], { unit: ' s' }),
  },
});
