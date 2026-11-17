import { describe, expect, it } from 'vitest';
import { softClipCurve } from './soft-clip';

describe('softClipCurve', () => {
  const curve = softClipCurve(4097);
  /** The curve's output for an input in [-1, 1] (as a WaveShaper reads it). */
  const at = (x: number) =>
    curve[Math.round(((x + 1) / 2) * (curve.length - 1))]!;

  it('passes everything below the knee unchanged', () => {
    for (const x of [-0.89, -0.5, 0, 0.3, 0.5, 0.89])
      expect(at(x)).toBeCloseTo(x, 3);
  });

  it('never reaches full scale, however loud', () => {
    expect(at(1)).toBeLessThan(0.99);
    expect(at(-1)).toBeGreaterThan(-0.99);
    for (let i = 1; i < curve.length; i++)
      expect(curve[i]!).toBeGreaterThanOrEqual(curve[i - 1]!);
  });
});
