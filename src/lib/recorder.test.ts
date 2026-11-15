import { describe, expect, it } from 'vitest';
import { encodeWav, join, recordingName } from './recorder';

describe('recorder', () => {
  it('encodes 16-bit stereo PCM WAV', () => {
    const left = new Float32Array([0, 1, -1]);
    const right = new Float32Array([0.5, 2, -0.5]);
    const view = new DataView(encodeWav([left, right], 48000));
    const text = (at: number, n: number) =>
      String.fromCharCode(
        ...Array.from({ length: n }, (_, i) => view.getUint8(at + i)),
      );
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(12);
    // Interleaved, clipped to ±1.
    expect(
      [0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true)),
    ).toEqual([0, 16383, 32767, 32767, -32768, -16384]);
  });

  it('joins blocks and names files after the patch and time', () => {
    expect([
      ...join([new Float32Array([1]), new Float32Array([2, 3])]),
    ]).toEqual([1, 2, 3]);
    expect(
      recordingName('Undertow (flow edition)', new Date(2026, 10, 15, 14, 3)),
    ).toBe('undertow-flow-edition-2026-11-15-1403.wav');
  });
});
