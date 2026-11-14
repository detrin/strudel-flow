import { defineNode, knob } from '../define-node';

/** The phaser only runs once `.phaser(rate)` is written. */
export default defineNode({
  id: 'phaser-node',
  title: 'Phaser',
  category: 'Audio Effects',
  icon: 'Waves',
  order: 11,
  parameters: {
    phaser: knob('phaser', 1, [0, 10, 0.1], { implicit: 0 }),
    phaserdepth: knob('phaserdepth', 0.75, [0, 1, 0.01]),
  },
});
