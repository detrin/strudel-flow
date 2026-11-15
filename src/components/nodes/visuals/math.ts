/** Shared maths for the node visuals: frequency axes, envelopes, filters. */

export const LOW_HZ = 20;
export const HIGH_HZ = 20000;
/** 0..1 across a log frequency axis from 20 Hz to 20 kHz. */
export const logPosition = (hz: number) =>
  Math.log(Math.max(hz, LOW_HZ) / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ);
export const hzAt = (position: number) =>
  LOW_HZ * (HIGH_HZ / LOW_HZ) ** position;

/** A finite number, or `fallback` (patterns and missing values). */
export const num = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const hz = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : `${Math.round(value)}`;

export type Adsr = [
  attack: number,
  decay: number,
  sustain: number,
  release: number,
];
export type Segment = 'attack' | 'decay' | 'hold' | 'release';

/**
 * Where a note is in its envelope `elapsed` seconds after it started, held
 * for `duration` seconds: the segment, how far through it (0..1) and the
 * level (0..1). Null once the release has ended.
 */
export function envelopeAt(
  elapsed: number,
  duration: number,
  [attack, decay, sustain, release]: Adsr,
): { segment: Segment; progress: number; level: number } | null {
  const levelAt = (t: number) =>
    t < attack
      ? t / Math.max(attack, 1e-6)
      : t < attack + decay
        ? 1 - (1 - sustain) * ((t - attack) / Math.max(decay, 1e-6))
        : sustain;
  if (elapsed < 0) return null;
  if (elapsed < duration) {
    if (elapsed < attack)
      return {
        segment: 'attack',
        progress: elapsed / attack,
        level: levelAt(elapsed),
      };
    if (elapsed < attack + decay)
      return {
        segment: 'decay',
        progress: (elapsed - attack) / decay,
        level: levelAt(elapsed),
      };
    const hold = Math.max(duration - attack - decay, 1e-6);
    return {
      segment: 'hold',
      progress: (elapsed - attack - decay) / hold,
      level: sustain,
    };
  }
  const after = elapsed - duration;
  if (after > release) return null;
  const from = levelAt(duration);
  const progress = after / Math.max(release, 1e-6);
  return { segment: 'release', progress, level: from * (1 - progress) };
}

/**
 * A filter's cutoff at a moment of a note, with Strudel's filter envelope:
 * exponential from `cutoff` to `cutoff * 2^env` (anchor 0).
 */
export function envelopedCutoff(
  cutoff: number,
  env: number,
  adsr: Adsr,
  elapsed: number,
  duration: number,
) {
  if (!env) return cutoff;
  const level = envelopeAt(elapsed, duration, adsr)?.level ?? 0;
  const low = Math.min(cutoff, cutoff * 2 ** env);
  const high = Math.max(cutoff, cutoff * 2 ** env);
  const amount = env > 0 ? level : 1 - level;
  return Math.min(HIGH_HZ, low * (high / low) ** amount);
}

let biquad: BiquadFilterNode | null | undefined;
/**
 * The browser's own response of a low- or high-pass filter, in dB, at each
 * frequency; null where Web Audio is missing (tests).
 */
export function filterResponse(
  type: 'lowpass' | 'highpass',
  cutoff: number,
  q: number,
  frequencies: Float32Array,
) {
  if (biquad === undefined) {
    try {
      biquad = new OfflineAudioContext(1, 128, 44100).createBiquadFilter();
    } catch {
      biquad = null;
    }
  }
  if (!biquad) return null;
  biquad.type = type;
  biquad.frequency.value = Math.min(Math.max(cutoff, 10), 22000);
  biquad.Q.value = q;
  const magnitude = new Float32Array(frequencies.length);
  const phase = new Float32Array(frequencies.length);
  biquad.getFrequencyResponse(
    frequencies as Float32Array<ArrayBuffer>,
    magnitude,
    phase,
  );
  return magnitude.map((m) => 20 * Math.log10(Math.max(m, 1e-6)));
}

/** One cycle (0..1) of a Strudel signal, as 0..1. */
export function wave(name: string, phase: number) {
  const p = ((phase % 1) + 1) % 1;
  switch (name) {
    case 'sine':
      return 0.5 + 0.5 * Math.sin(2 * Math.PI * p);
    case 'cosine':
      return 0.5 + 0.5 * Math.cos(2 * Math.PI * p);
    case 'saw':
      return p;
    case 'isaw':
      return 1 - p;
    case 'tri':
      return p < 0.5 ? 2 * p : 2 - 2 * p;
    case 'square':
      return p < 0.5 ? 0 : 1;
    default: {
      // perlin / rand: a smooth or stepped wobble, for the picture.
      const x = Math.sin(
        p * 43.758 + (name === 'rand' ? Math.floor(p * 16) * 12.9 : 0),
      );
      return 0.5 + 0.45 * Math.sin(x * 7.1 + p * 9);
    }
  }
}
