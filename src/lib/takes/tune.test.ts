import { describe, expect, it } from 'vitest';
import {
  detectPitch,
  nearestScaleNote,
  scaleIntervals,
  trimSilence,
  tuneTake,
} from './tune';

const RATE = 48000;

/** A voice-like tone: ten harmonics falling off, at a frequency over time. */
function tone(freq: (t: number) => number, seconds: number, rate = RATE) {
  const out = new Float32Array(Math.round(seconds * rate));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * freq(i / rate)) / rate;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h;
    out[i] = 0.3 * v;
  }
  return out;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);
/** The middle of a take's pitch track (edges are ramps). */
const voiced = (samples: Float32Array) =>
  detectPitch(samples, RATE)
    .slice(5, -5)
    .map((frame) => frame.f0)
    .filter((f) => f > 0);

const D4 = 293.66;

describe('scales', () => {
  it('knows the app scales', () => {
    expect(scaleIntervals('major')).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleIntervals('minor:pentatonic')).toEqual([0, 3, 5, 7, 10]);
    expect(scaleIntervals('chromatic')).toHaveLength(12);
    expect(() => scaleIntervals('nope')).toThrow(/scale/);
  });
  it('snaps to the nearest note of the key', () => {
    // 300 Hz is MIDI 62.37: D (62) is in D major, D# is not.
    expect(nearestScaleNote(62.37, 'D', 'major')).toBe(62);
    expect(nearestScaleNote(63.4, 'D', 'major')).toBe(64);
    // C natural is not in D major: C#5 (73) or B4 (71).
    expect(nearestScaleNote(72.1, 'D', 'major')).toBe(73);
    expect(nearestScaleNote(72.1, 'C', 'major')).toBe(72);
  });
});

describe('detectPitch', () => {
  it('reads a steady tone within a few cents', () => {
    const f0s = voiced(tone(() => 300, 1));
    expect(f0s.length).toBeGreaterThan(80);
    expect(Math.abs(cents(median(f0s), 300))).toBeLessThan(3);
  });
  it('finds no pitch in noise or silence', () => {
    const noise = new Float32Array(RATE).map(() => Math.random() * 0.4 - 0.2);
    const pitched = detectPitch(noise, RATE).filter((frame) => frame.f0 > 0);
    expect(pitched.length).toBeLessThan(5);
    expect(
      detectPitch(new Float32Array(RATE), RATE).every((frame) => !frame.f0),
    ).toBe(true);
  });
});

describe('tuneTake', () => {
  const take = tone(() => 300, 1.5);

  it('at 0 % returns the take as recorded', () => {
    const out = tuneTake(take, RATE, { amount: 0, key: 'D', scale: 'major' });
    expect(out).toEqual(take);
  });

  it('at 100 % snaps the pitch to the scale and keeps the length', () => {
    const out = tuneTake(take, RATE, { amount: 1, key: 'D', scale: 'major' });
    expect(out.length).toBe(take.length);
    expect(Math.abs(cents(median(voiced(out)), D4))).toBeLessThan(5);
  });

  it('at 50 % moves half way (in cents)', () => {
    const out = tuneTake(take, RATE, {
      amount: 0.5,
      key: 'D',
      scale: 'major',
    });
    const halfway = 300 * 2 ** (cents(D4, 300) / 2 / 1200);
    expect(Math.abs(cents(median(voiced(out)), halfway))).toBeLessThan(5);
  });

  it('turns a glide into steps on the scale', () => {
    const glide = tone((t) => 280 + 50 * t, 1);
    const out = tuneTake(glide, RATE, { amount: 1, key: 'D', scale: 'major' });
    const off = voiced(out).map((f) => {
      const midi = 69 + 12 * Math.log2(f / 440);
      return Math.abs(midi - nearestScaleNote(midi, 'D', 'major')) * 100;
    });
    // Nearly every frame sits on a note (transitions are one or two frames).
    expect(off.filter((c) => c < 20).length / off.length).toBeGreaterThan(0.85);
  });

  it('holds a note through vibrato instead of flipping between two', () => {
    // MIDI 63 ± 0.25 at 5 Hz: vibrato across the line between D4 and E4.
    const wobble = tone(
      (t) => 440 * 2 ** ((63 + 0.25 * Math.sin(2 * Math.PI * 5 * t) - 69) / 12),
      1.5,
    );
    const out = tuneTake(wobble, RATE, { amount: 1, key: 'D', scale: 'major' });
    const notes = voiced(out).map((f) =>
      Math.round(69 + 12 * Math.log2(f / 440)),
    );
    const changes = notes.filter((n, i) => i > 0 && n !== notes[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(2);
  });

  it('keeps sounds without a pitch unchanged', () => {
    const noise = new Float32Array(RATE).map(() => Math.random() * 0.4 - 0.2);
    const out = tuneTake(noise, RATE, { amount: 1, key: 'D', scale: 'major' });
    let worst = 0;
    for (let i = 0; i < noise.length; i++)
      worst = Math.max(worst, Math.abs((out[i] ?? 0) - (noise[i] ?? 0)));
    expect(worst).toBeLessThan(1e-4);
  });

  it('does not get louder', () => {
    const out = tuneTake(take, RATE, { amount: 1, key: 'D', scale: 'major' });
    const rms = (x: Float32Array) =>
      Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);
    expect(20 * Math.log10(rms(out) / rms(take))).toBeLessThan(1);
    expect(20 * Math.log10(rms(out) / rms(take))).toBeGreaterThan(-3);
  });
});

describe('trimSilence', () => {
  it('cuts the silence before the sound, keeping 10 ms', () => {
    const lead = 0.3;
    const signal = new Float32Array(Math.round((lead + 0.5) * RATE));
    signal.set(
      tone(() => 220, 0.5),
      Math.round(lead * RATE),
    );
    const out = trimSilence(signal, RATE);
    const cut = (signal.length - out.length) / RATE;
    expect(cut).toBeGreaterThan(lead - 0.015);
    expect(cut).toBeLessThan(lead);
  });
  it('leaves silence alone', () => {
    expect(trimSilence(new Float32Array(100), RATE)).toHaveLength(100);
  });
});
