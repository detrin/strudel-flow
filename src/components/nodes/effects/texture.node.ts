import { defineNode, knob } from '../define-node';

export default defineNode({
  id: 'texture-node',
  title: 'Texture',
  category: 'Audio Effects',
  icon: 'Zap',
  order: 2,
  parameters: {
    distort: knob('distort', 0, [0, 3, 0.01]),
    crush: knob('crush', 16, [1, 16, 1]),
    fm: knob('fm', 0, [0, 10, 0.1]),
  },
});
