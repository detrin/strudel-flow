import { defineNode } from '../define-node';
import { DRUM_MACHINES } from '@/data/samples';

/** Picks the drum machine that plays drum names like bd, sd, hh. */
export default defineNode({
  id: 'bank-node',
  title: 'Bank',
  category: 'Synths',
  icon: 'Drum',
  order: 10,
  parameters: {
    bank: {
      control: 'select',
      label: 'Drum machine',
      default: 'RolandTR909',
      options: DRUM_MACHINES.map((name) => ({ value: name, label: name })),
    },
  },
});
