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
  // The stages the code sets: they stay written (see adsrCalls).
  const set = ADSR_KEYS.filter((key) => values[key] !== undefined);
  const adsr = effectiveAdsr(
    ADSR_KEYS.map((key) => values[key]) as Partial4,
    unset,
  );
  // Stages the code leaves out show what Strudel fills in; stages it sets
  // keep their written value (`.attack(0)` stays 0, though it plays as
  // Strudel's minimum), so reading the code back never changes it.
  ADSR_KEYS.forEach((key, index) => {
    if (!set.includes(key)) values[key] = adsr[index];
  });
  return { ...values, stages: set.join(' ') } as Record<
    string,
    number | string
  >;
}

/**
 * The envelope calls to write: the stages the code set (`stages`, kept
 * from reading it, so no call it had is dropped), plus any stage whose
 * value differs from what Strudel fills in (`unset` when none is set).
 * A node made on the canvas has no `stages`: the fewest calls that play
 * its values. Writing every stage would override stages set earlier in
 * the line (`.decay(0.25)…attack(0.05)` must not gain `.decay(0.001)`).
 */
export function adsrCalls(
  prefix: string,
  values: Record<string, unknown>,
  unset: Adsr,
) {
  // What plays: compared that way, `.attack(0)` and Strudel's 0.001 are
  // one value.
  const wanted = effectiveAdsr(
    ADSR_KEYS.map((key) => values[key] as Value) as Partial4,
    unset,
  ).map(String);
  const resolved = (stages: number[]) =>
    effectiveAdsr(
      ADSR_KEYS.map((key, i) =>
        stages.includes(i) ? (values[key] as Value) : undefined,
      ) as Partial4,
      unset,
    ).map(String);
  const kept =
    typeof values.stages === 'string'
      ? ADSR_KEYS.flatMap((key, i) =>
          values.stages === '' ||
          !String(values.stages).split(' ').includes(key)
            ? []
            : [i],
        )
      : null;
  let stages: number[];
  if (kept) {
    // Add stages that differ until Strudel resolves to the values.
    stages = [...kept];
    for (let round = 0; round < 4; round++) {
      const now = resolved(stages);
      const missing = [0, 1, 2, 3].filter(
        (i) => !stages.includes(i) && now[i] !== wanted[i],
      );
      if (!missing.length) break;
      stages = [...stages, missing[0]].sort();
    }
  } else {
    const subsets = Array.from({ length: 16 }, (_, mask) =>
      [0, 1, 2, 3].filter((i) => mask & (1 << i)),
    ).sort((a, b) => a.length - b.length);
    stages = subsets.find((subset) =>
      resolved(subset).every((value, i) => value === wanted[i]),
    ) ?? [0, 1, 2, 3];
  }
  return stages.map((i) => `${prefix}${ADSR_KEYS[i]}(${values[ADSR_KEYS[i]]})`);
}
