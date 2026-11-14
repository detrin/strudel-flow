import { defineFilter } from './filter';

export default defineFilter({
  id: 'lpf-node',
  title: 'Filter',
  prefix: 'lp',
  cutoff: 1000,
  order: 10,
  // Patches saved before the fork stored both values as `lpf: "1000 1"`.
  read: (data) => {
    if (typeof data.lpf !== 'string' || data.cutoff !== undefined) return data;
    const [cutoff, resonance] = data.lpf.split(' ');
    return { ...data, cutoff, resonance };
  },
});
