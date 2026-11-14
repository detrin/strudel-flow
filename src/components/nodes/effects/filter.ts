import { defineNode } from '../define-node';
import {
  ADSR_KEYS,
  adsrCalls,
  adsrParameters,
  knobParameter,
  parseEnvelope,
  type Adsr,
} from './envelope';

/** Strudel's filter envelope when only the depth is set. */
const UNSET: Adsr = [0.005, 0.14, 0, 0.1];
const hz = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(2)}k` : `${value} Hz`;

/**
 * A low- or high-pass filter with Strudel's filter envelope. The envelope is
 * off at depth 0; when on, all of it is written out, so the code says
 * exactly what plays.
 */
export function defineFilter(options: {
  id: string;
  title: string;
  prefix: 'lp' | 'hp';
  cutoff: number;
  order: number;
  read?: (data: Record<string, unknown>) => Record<string, unknown>;
}) {
  const { prefix } = options;
  const parameters = {
    cutoff: {
      ...knobParameter(
        `${prefix}f`,
        `${prefix}f`,
        options.cutoff,
        12000,
        10,
        20,
      ),
      format: hz,
    },
    resonance: {
      ...knobParameter(`${prefix}q`, `${prefix}q`, 1, 30, 0.1),
      format: (value: number) => value.toFixed(1),
    },
    env: knobParameter('env', `${prefix}env`, 0, 8, 0.1, -8),
    // The envelope's shape only matters while it has depth.
    ...adsrParameters(prefix, UNSET, (values) => Number(values.env) !== 0),
  };
  return defineNode({
    ...options,
    category: 'Audio Effects',
    icon: 'Filter',
    parameters,
    parse: (calls) => {
      const values = parseEnvelope(parameters, calls, UNSET);
      if (!values) return null;
      const envelope = calls.some((call) =>
        [`${prefix}env`, ...ADSR_KEYS.map((key) => `${prefix}${key}`)].includes(
          call.name,
        ),
      );
      // Strudel's depth is 1 when only the shape is given.
      if (envelope) values.env ??= 1;
      return values;
    },
    generate: (values) => {
      const calls = [`${prefix}f(${values.cutoff})`];
      if (values.resonance !== 1) calls.push(`${prefix}q(${values.resonance})`);
      if (values.env !== 0)
        calls.push(`${prefix}env(${values.env})`, ...adsrCalls(prefix, values));
      return calls.join('.');
    },
  });
}
