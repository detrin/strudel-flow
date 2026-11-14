import { defineNode } from '../define-node';

/** Echo. `delay` is the wet amount; time is in cycles. */
export default defineNode({
  id: 'delay-node',
  title: 'Delay',
  category: 'Audio Effects',
  icon: 'Repeat',
  order: 12,
  parameters: {
    delay: {
      control: 'knob',
      label: 'delay',
      default: 0.5,
      implicit: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    delaytime: {
      control: 'knob',
      label: 'time',
      default: 0.25,
      min: 0,
      max: 2,
      step: 0.01,
    },
    delayfeedback: {
      control: 'knob',
      label: 'feedback',
      default: 0.5,
      min: 0,
      max: 0.98,
      step: 0.01,
    },
  },
});
