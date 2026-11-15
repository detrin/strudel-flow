import { describe, expect, it } from 'vitest';
import { envelopeAt, envelopedCutoff, hzAt, logPosition, wave } from './math';

describe('visual maths', () => {
  it('maps frequencies on a log axis', () => {
    expect(logPosition(20)).toBe(0);
    expect(logPosition(20000)).toBeCloseTo(1);
    expect(hzAt(logPosition(1000))).toBeCloseTo(1000);
  });

  it('follows a note through its envelope', () => {
    const adsr: [number, number, number, number] = [0.1, 0.2, 0.5, 0.4];
    expect(envelopeAt(0.05, 1, adsr)).toMatchObject({
      segment: 'attack',
      level: 0.5,
    });
    expect(envelopeAt(0.2, 1, adsr)).toMatchObject({
      segment: 'decay',
      level: 0.75,
    });
    expect(envelopeAt(0.6, 1, adsr)).toMatchObject({
      segment: 'hold',
      level: 0.5,
    });
    expect(envelopeAt(1.2, 1, adsr)?.segment).toBe('release');
    expect(envelopeAt(1.2, 1, adsr)?.level).toBeCloseTo(0.25);
    expect(envelopeAt(1.5, 1, adsr)).toBeNull();
    // Cut short in its attack: the release starts from where it got to.
    expect(envelopeAt(0.05, 0.05, adsr)?.level).toBeCloseTo(0.5);
  });

  it('moves the cutoff with the filter envelope', () => {
    const adsr: [number, number, number, number] = [0, 0.5, 0, 0.1];
    expect(envelopedCutoff(500, 0, adsr, 0, 1)).toBe(500);
    // At the top of the envelope: 2^3 times the cutoff.
    expect(envelopedCutoff(500, 3, adsr, 0, 1)).toBeCloseTo(4000);
    // Decayed to sustain 0: back to the cutoff.
    expect(envelopedCutoff(500, 3, adsr, 0.6, 1)).toBeCloseTo(500);
  });

  it('draws Strudel signals', () => {
    expect(wave('saw', 0.25)).toBe(0.25);
    expect(wave('sine', 0.25)).toBeCloseTo(1);
    expect(wave('square', 0.75)).toBe(1);
  });
});
