import { defineNode, knob } from '../define-node';
import { DelayVisual } from '../visuals/delay-visual';

/** Echo. `delay` is the wet amount; time is in cycles. */
export default defineNode({
  id: 'delay-node',
  title: 'Delay',
  category: 'Audio Effects',
  icon: 'Repeat',
  order: 12,
  visual: DelayVisual,
  parameters: {
    delay: knob('delay', 0.5, [0, 1, 0.01], { implicit: 0 }),
    delaytime: knob('time', 0.25, [0, 2, 0.01], { method: 'delaytime' }),
    delayfeedback: knob('feedback', 0.5, [0, 0.98, 0.01], {
      method: 'delayfeedback',
    }),
  },
});
