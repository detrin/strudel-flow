import { defineNode } from '../define-node';
import {
  adsrCalls,
  adsrParameters,
  parseEnvelope,
  type Adsr,
} from './envelope';
import { EnvelopeVisual } from '../visuals/envelope-visual';

/** Strudel's amplitude envelope when none of it is set. */
const UNSET: Adsr = [0.001, 0.001, 1, 0.01];
const parameters = adsrParameters('', [0.1, 0.1, 0.7, 0.2]);

/** Always writes all four values, so the code says exactly what plays. */
export default defineNode({
  id: 'adsr-node',
  title: 'Envelope',
  category: 'Audio Effects',
  icon: 'Activity',
  order: 13,
  parameters,
  visual: EnvelopeVisual,
  parse: (calls) => parseEnvelope(parameters, calls, UNSET),
  generate: (values) => adsrCalls('', values).join('.'),
});
