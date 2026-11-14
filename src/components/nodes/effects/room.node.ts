import { defineNode } from '../define-node';

const format = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);

/** Reverb. Implicit values are Strudel's reverb defaults. */
export default defineNode({
  id: 'room-node',
  title: 'Space',
  category: 'Audio Effects',
  icon: 'CheckCheck',
  order: 12,
  parameters: {
    room: {
      control: 'knob',
      label: 'room',
      default: 0.3,
      implicit: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    roomsize: {
      control: 'knob',
      label: 'rsize',
      method: 'rsize',
      default: 2,
      min: 0,
      max: 10,
      step: 0.1,
    },
    roomfade: {
      control: 'knob',
      label: 'rfade',
      method: 'rfade',
      default: 0.1,
      min: 0,
      max: 10,
      step: 0.1,
    },
    roomlp: {
      control: 'knob',
      label: 'rlp',
      method: 'rlp',
      default: 15000,
      min: 0,
      max: 20000,
      step: 100,
      format,
    },
    roomdim: {
      control: 'knob',
      label: 'rdim',
      method: 'rdim',
      default: 1000,
      min: 0,
      max: 20000,
      step: 100,
      format,
    },
  },
});
