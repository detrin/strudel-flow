import { defineNode } from '../define-node';

export default defineNode({
  id: 'phaser-node',
  title: 'Phaser',
  category: 'Audio Effects',
  icon: 'Waves',
  order: 11,
  parameters: {
    phaser: {
      control: 'knob',
      label: 'phaser',
      default: 1,
      min: 0.1,
      max: 10,
      step: 0.1,
    },
    phaserdepth: {
      control: 'knob',
      label: 'phaserdepth',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
  },
});
