import { defineNode, knob } from '../define-node';
import { LevelVisual } from '../visuals/level-visual';

export default defineNode({
  id: 'level-node',
  title: 'Level',
  category: 'Audio Effects',
  icon: 'Volume2',
  order: 3,
  parameters: {
    gain: knob('gain', 0.8, [0, 2, 0.01], { unit: '×' }),
    pan: knob('pan', 0.5, [0, 1, 0.01]),
    postgain: knob('postgain', 1, [0, 2, 0.01], { unit: '×' }),
  },
  visual: LevelVisual,
});
