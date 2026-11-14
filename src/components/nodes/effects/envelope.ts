import {
  parseParameters,
  type Parameter,
  type Parameters,
} from '../define-node';
import type { Call } from '@/lib/program/syntax';

export type Adsr = [
  attack: number,
  decay: number,
  sustain: number,
  release: number,
];
type Partial4 = [number?, number?, number?, number?];

/**
 * Strudel's own rule (superdough `getADSRValues`) for the envelope values
 * a pattern did not set. Nodes use it so their knobs show what you hear.
 */
export function effectiveAdsr(
  [attack, decay, sustain, release]: Partial4,
  unset: Adsr,
): Adsr {
  if ([attack, decay, sustain, release].every((v) => v === undefined))
    return unset;
  const held =
    sustain ??
    ((attack !== undefined && decay === undefined) ||
    (attack === undefined && decay === undefined)
      ? 1
      : 0.001);
  return [
    Math.max(attack ?? 0, 0.001),
    Math.max(decay ?? 0, 0.001),
    Math.min(held, 1),
    Math.max(release ?? 0, 0.01),
  ];
}

const knob = (
  label: string,
  method: string,
  value: number,
  max: number,
  step = 0.01,
  min = 0,
): Extract<Parameter, { control: 'knob' }> => ({
  control: 'knob',
  label,
  method,
  default: value,
  min,
  max,
  step,
});

export const ADSR_KEYS = ['attack', 'decay', 'sustain', 'release'] as const;

/** attack/decay/sustain/release knobs written as `${prefix}attack(...)` etc. */
export const adsrParameters = (
  prefix: string,
  defaults: Adsr,
  when?: (values: Record<string, string | number>) => boolean,
) => ({
  attack: { ...knob('att', `${prefix}attack`, defaults[0], 2), when },
  decay: { ...knob('dec', `${prefix}decay`, defaults[1], 2), when },
  sustain: { ...knob('sus', `${prefix}sustain`, defaults[2], 1), when },
  release: { ...knob('rel', `${prefix}release`, defaults[3], 2), when },
});

export const knobParameter = knob;

/** Parses literal calls, then fills unset envelope values Strudel's way. */
export function parseEnvelope(
  parameters: Parameters,
  calls: Call[],
  unset: Adsr,
) {
  const values = parseParameters(parameters, calls) as Record<
    string,
    number
  > | null;
  if (!values) return null;
  const adsr = effectiveAdsr(
    ADSR_KEYS.map((key) => values[key]) as Partial4,
    unset,
  );
  ADSR_KEYS.forEach((key, index) => (values[key] = adsr[index]));
  return values;
}

export const adsrCalls = (
  prefix: string,
  values: Record<(typeof ADSR_KEYS)[number], number>,
) => ADSR_KEYS.map((key) => `${prefix}${key}(${values[key]})`);
