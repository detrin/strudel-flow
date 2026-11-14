import { defineNode } from '../define-node';

export default defineNode({
  id: 'lpf-node',
  title: 'Filter',
  category: 'Audio Effects',
  icon: 'Filter',
  order: 10,
  parameters: {
    cutoff: {
      control: 'knob',
      label: 'lpf',
      method: 'lpf',
      default: 1000,
      min: 100,
      max: 5000,
      step: 50,
      format: (value) =>
        value >= 1000 ? `${(value / 1000).toFixed(2)}k` : `${value} Hz`,
    },
    resonance: {
      control: 'knob',
      label: 'lpq',
      method: 'lpq',
      default: 1,
      min: 0.1,
      max: 10,
      step: 0.1,
      format: (value) => value.toFixed(1),
    },
  },
  // Patches saved before the fork stored both values as `lpf: "1000 1"`.
  read: (data) => {
    if (typeof data.lpf !== 'string' || data.cutoff !== undefined) return data;
    const [cutoff, resonance] = data.lpf.split(' ').map(Number);
    return { ...data, cutoff, resonance };
  },
});
