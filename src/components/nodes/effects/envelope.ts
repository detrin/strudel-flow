import { knob, parseParameters, type Parameters } from '../define-node';
import type { Call } from '@/lib/program/syntax';

export type Adsr = [
  attack: number,
  decay: number,
  sustain: number,
  release: number,
];
type Value = number | string;
type Partial4 = [Value?, Value?, Value?, Value?];

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
  // Patterns (`decay("<0.1 0.4>")`) play as written; only numbers clamp.
  const clamp = (value: Value | undefined, f: (n: number) => number) =>
    typeof value === 'string' ? value : f(value ?? 0);
  return [
    clamp(attack, (n) => Math.max(n, 0.001)),
    clamp(decay, (n) => Math.max(n, 0.001)),
    clamp(held, (n) => Math.min(n, 1)),
    clamp(release, (n) => Math.max(n, 0.01)),
  ] as Adsr;
}

export const ADSR_KEYS = ['attack', 'decay', 'sustain', 'release'] as const;

/** attack/decay/sustain/release knobs written as `${prefix}attack(...)` etc. */
export const adsrParameters = (
  prefix: string,
  defaults: Adsr,
  when?: (values: Record<string, string | number>) => boolean,
) => ({
  attack: knob('att', defaults[0], [0, 2, 0.01], {
    method: `${prefix}attack`,
    when,
  }),
  decay: knob('dec', defaults[1], [0, 2, 0.01], {
    method: `${prefix}decay`,
    when,
  }),
  sustain: knob('sus', defaults[2], [0, 1, 0.01], {
    method: `${prefix}sustain`,
    when,
  }),
  release: knob('rel', defaults[3], [0, 2, 0.01], {
    method: `${prefix}release`,
    when,
  }),
});

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
