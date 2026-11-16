/**
 * Tuning a recorded take: its pitch is read every 10 ms (YIN) and pulled
 * toward the nearest note of a key and scale by an amount, from 0 (as
 * recorded) to 1 (a hard snap, the hyperpop sound). The shift is TD-PSOLA:
 * grains two periods long, taken at the take's own pitch marks and laid
 * at the new period, so a voice keeps its formants (no chipmunk) and the
 * take keeps its length. Parts without a pitch (breaths, clicks, noise)
 * come out as they went in.
 */

export type TuneOptions = {
  /** 0 = as recorded, 1 = snapped to the scale. */
  amount: number;
  /** "C" … "B", sharps or flats ("F#", "Bb"). */
  key: string;
  /** One of the app's scales ("major", "minor:pentatonic", …). */
  scale: string;
};

/** A pitch reading: time in seconds, f0 in Hz (0 where there is none). */
export type PitchFrame = { time: number; f0: number };

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'major:pentatonic': [0, 2, 4, 7, 9],
  'minor:pentatonic': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  'harmonic:minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic:minor': [0, 2, 3, 5, 7, 9, 11],
};

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

export function scaleIntervals(scale: string): number[] {
  const intervals = SCALES[scale];
  if (!intervals) throw new Error(`Unknown scale "${scale}".`);
  return intervals;
}

function keyIndex(key: string) {
  const name = key.charAt(0).toUpperCase() + key.slice(1);
  const index = KEYS.indexOf(FLATS[name] ?? name);
  if (index < 0) throw new Error(`Unknown key "${key}".`);
  return index;
}

/** The scale note (MIDI) nearest a pitch (MIDI, fractional). */
export function nearestScaleNote(midi: number, key: string, scale: string) {
  const root = keyIndex(key);
  const inScale = new Set(scaleIntervals(scale));
  let best = Math.round(midi);
  let distance = Infinity;
  for (let note = Math.floor(midi) - 2; note <= Math.ceil(midi) + 2; note++) {
    if (!inScale.has((((note - root) % 12) + 12) % 12)) continue;
    const d = Math.abs(note - midi);
    if (d < distance) {
      distance = d;
      best = note;
    }
  }
  return best;
}

const HOP = 0.01;
const F_MIN = 60;
const F_MAX = 1000;
/** YIN: the first dip under this is the period. */
const THRESHOLD = 0.12;
/** …and a frame is pitched only if its best dip is this clear. */
const VOICED = 0.2;
/** Leave the held note only 30 cents past the midpoint to the next one. */
const HOLD = 0.6;

/** The take's pitch every 10 ms. */
export function detectPitch(samples: Float32Array, rate: number): PitchFrame[] {
  // Pitch lives under 1 kHz: half the rate is plenty and four times faster.
  const factor = rate > 32000 ? 2 : 1;
  const r = rate / factor;
  const y = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < y.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k] ?? 0;
    y[i] = sum / factor;
  }
  const width = Math.round(r * 0.02);
  const tauMin = Math.max(2, Math.floor(r / F_MAX));
  const tauMax = Math.ceil(r / F_MIN);
  const hop = Math.round(r * HOP);
  const span = width + tauMax;
  const starts: number[] = [];
  for (let s = 0; s + span <= y.length; s += hop) starts.push(s);

  const energy = starts.map((s) => {
    let sum = 0;
    for (let j = 0; j < width; j++) sum += (y[s + j] ?? 0) ** 2;
    return Math.sqrt(sum / width);
  });
  const loudest = Math.max(0, ...energy);
  const diff = new Float32Array(tauMax + 1);
  const frames: PitchFrame[] = starts.map((s, index) => {
    const time = (s + width / 2) / r;
    if ((energy[index] ?? 0) < Math.max(1e-3, loudest * 0.03))
      return { time, f0: 0 };
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < width; j++) {
        const d = (y[s + j] ?? 0) - (y[s + j + tau] ?? 0);
        sum += d * d;
      }
      diff[tau] = sum;
    }
    // Cumulative mean normalized difference.
    let running = 0;
    const norm = new Float32Array(tauMax + 1);
    norm[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau] ?? 0;
      norm[tau] = running > 0 ? ((diff[tau] ?? 0) * tau) / running : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++)
      if ((norm[t] ?? 1) < THRESHOLD) {
        while (t + 1 <= tauMax && (norm[t + 1] ?? 1) < (norm[t] ?? 1)) t++;
        tau = t;
        break;
      }
    if (tau < 0) {
      let best = 1;
      for (let t = tauMin; t <= tauMax; t++)
        if ((norm[t] ?? 1) < best) {
          best = norm[t] ?? 1;
          tau = t;
        }
    }
    if (tau < 0 || (norm[tau] ?? 1) > VOICED) return { time, f0: 0 };
    // Parabola through the dip and its neighbours.
    const a = norm[tau - 1] ?? norm[tau] ?? 0;
    const b = norm[tau] ?? 0;
    const c = norm[tau + 1] ?? b;
    const bend = a - 2 * b + c;
    const exact = bend > 0 ? tau + (a - c) / (2 * bend) : tau;
    return { time, f0: r / exact };
  });
  return clean(frames);
}

/** Drops pitched runs shorter than 30 ms and smooths octave slips. */
function clean(frames: PitchFrame[]) {
  const out = frames.map((frame) => ({ ...frame }));
  let i = 0;
  while (i < out.length) {
    if (!out[i]?.f0) {
      i++;
      continue;
    }
    let end = i;
    while (end < out.length && out[end]?.f0) end++;
    if (end - i < 3) for (let k = i; k < end; k++) out[k]!.f0 = 0;
    i = end;
  }
  return out.map((frame, index) => {
    if (!frame.f0) return frame;
    const around = out
      .slice(Math.max(0, index - 2), index + 3)
      .map((f) => f.f0)
      .filter((f) => f > 0)
      .sort((a, b) => a - b);
    const median = around[Math.floor(around.length / 2)] ?? frame.f0;
    // An octave away from its neighbours is a slip, not a note.
    const ratio = frame.f0 / median;
    return ratio > 1.8 || ratio < 0.55 ? { ...frame, f0: median } : frame;
  });
}

/** The take tuned by `options.amount` toward the key and scale. */
export function tuneTake(
  samples: Float32Array,
  rate: number,
  options: TuneOptions,
): Float32Array {
  const amount = Math.max(0, Math.min(1, options.amount));
  scaleIntervals(options.scale);
  keyIndex(options.key);
  if (amount === 0 || samples.length === 0) return samples.slice();
  const frames = detectPitch(samples, rate);
  if (!frames.some((frame) => frame.f0 > 0)) return samples.slice();
  const first = frames[0]?.time ?? 0;
  const indexAt = (position: number) =>
    Math.max(
      0,
      Math.min(frames.length - 1, Math.round((position / rate - first) / HOP)),
    );
  const frameAt = (position: number) => frames[indexAt(position)]!;
  // The note each frame is pulled to. A sung note wobbles (vibrato) and a
  // spoken one glides: the note held stays until another is clearly
  // nearer, as Auto-Tune does, instead of flipping at every midpoint.
  let held: number | undefined;
  const ratios = frames.map(({ f0 }) => {
    if (!f0) {
      held = undefined;
      return 1;
    }
    const midi = 69 + 12 * Math.log2(f0 / 440);
    let target = nearestScaleNote(midi, options.key, options.scale);
    if (
      held !== undefined &&
      target !== held &&
      Math.abs(midi - held) < Math.abs(midi - target) + HOLD
    )
      target = held;
    held = target;
    return 2 ** ((amount * (target - midi)) / 12);
  });

  // Analysis marks: one per period where pitched, every 5 ms elsewhere.
  // Each pitched mark goes where the wave best matches the cycle at the
  // previous mark (a voice has several peaks per cycle, so "the highest
  // sample" jumps between them): the grains then line up cycle to cycle.
  const unvoiced = Math.round(rate * 0.005);
  const likeness = (a: number, b: number, half: number) => {
    let sum = 0;
    for (let n = -half; n <= half; n++)
      sum += (samples[a + n] ?? 0) * (samples[b + n] ?? 0);
    return sum;
  };
  const marks: { at: number; period: number; ratio: number }[] = [];
  let at = 0;
  let previous: number | undefined;
  while (at < samples.length) {
    const { f0 } = frameAt(at);
    const period = f0 ? Math.round(rate / f0) : unvoiced;
    if (f0) {
      let best = at;
      if (previous === undefined) {
        // A run starts on its first cycle's highest peak.
        let high = -Infinity;
        for (let i = at; i < Math.min(samples.length, at + period); i++)
          if ((samples[i] ?? 0) > high) {
            high = samples[i] ?? 0;
            best = i;
          }
      } else {
        const reach = Math.round(period * 0.15);
        const half = Math.round(period / 2);
        let high = -Infinity;
        for (let i = at - reach; i <= at + reach; i++) {
          if (i <= previous || i >= samples.length) continue;
          const v = likeness(previous, i, half);
          if (v > high) {
            high = v;
            best = i;
          }
        }
      }
      at = best;
    }
    if (at >= samples.length) break;
    marks.push({ at, period, ratio: ratios[indexAt(at)] ?? 1 });
    previous = f0 ? at : undefined;
    at += period;
  }

  // Synthesis: grains from the nearest mark, laid one new period apart.
  // Not normalized by the windows' sum (which would cross-fade the source
  // back in and keep its pitch); each grain is scaled by 1/ratio instead,
  // for the level. Where nothing moves (ratio 1), Hann windows half a
  // window apart add up to exactly 1: the sound comes out unchanged.
  const out = new Float32Array(samples.length);
  const weight = new Float32Array(samples.length);
  let time = marks[0]?.at ?? 0;
  let nearest = 0;
  while (time < samples.length) {
    while (
      nearest + 1 < marks.length &&
      Math.abs((marks[nearest + 1]?.at ?? 0) - time) <=
        Math.abs((marks[nearest]?.at ?? 0) - time)
    )
      nearest++;
    const mark = marks[nearest];
    if (!mark) break;
    const half = mark.period;
    const centre = Math.round(time);
    for (let n = -half; n <= half; n++) {
      const to = centre + n;
      const from = mark.at + n;
      if (to < 0 || to >= samples.length || from < 0 || from >= samples.length)
        continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * n) / half));
      out[to] = (out[to] ?? 0) + (w / mark.ratio) * (samples[from] ?? 0);
      weight[to] = (weight[to] ?? 0) + w;
    }
    time += mark.period / mark.ratio;
  }
  // The edges no grain covers fully (before the first mark): as recorded.
  for (let i = 0; i < out.length; i++)
    if ((weight[i] ?? 0) < 0.5) out[i] = samples[i] ?? 0;
  return out;
}

/** The take from its first sound on (10 ms before it). */
export function trimSilence(samples: Float32Array, rate: number) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak < 1e-4) return samples;
  const level = peak * 0.05;
  const onset = samples.findIndex((v) => Math.abs(v) > level);
  const start = Math.max(0, onset - Math.round(rate * 0.01));
  return start > 0 ? samples.slice(start) : samples;
}
