import { defineNode, knob } from '../define-node';
import { RoomVisual } from '../visuals/room-visual';

const format = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

/** Reverb. Implicit values are Strudel's reverb defaults. */
export default defineNode({
  id: 'room-node',
  title: 'Space',
  category: 'Audio Effects',
  icon: 'CheckCheck',
  order: 12,
  visual: RoomVisual,
  parameters: {
    room: knob('room', 0.3, [0, 1, 0.01], { implicit: 0 }),
    roomsize: knob('rsize', 2, [0, 10, 0.1], { method: 'rsize' }),
    roomfade: knob('rfade', 0.1, [0, 10, 0.1], { method: 'rfade' }),
    roomlp: knob('rlp', 15000, [0, 20000, 100], { method: 'rlp', format }),
    roomdim: knob('rdim', 1000, [0, 20000, 100], { method: 'rdim', format }),
  },
});
