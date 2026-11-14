import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import {
  generatePattern,
  placeNote,
  rescaleNotes,
  type PadData,
  type PadNote,
} from './pad';

const clip = (notes: PadNote[], extra: PadData = {}): PadData => ({
  notes,
  division: 16,
  selectedKey: 'C',
  octave: 3,
  selectedScaleType: 'major',
  ...extra,
});
const n = (pitch: number, start: number, length = 1) => ({
  pitch,
  start,
  length,
});
/** `begin-end note` of each event in the first cycle(s), in time order. */
const events = (code: string, cycles = 1) =>
  haps(code, cycles)
    .map(
      ({ begin, end, value }) =>
        `${begin}-${end} ${(value as { note: string }).note}`,
    )
    .sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));

describe('pad piano roll', () => {
  it('plays notes in one column together, not one after the other', () => {
    const code = generatePattern(clip([n(0, 0, 4), n(2, 0, 4)]));
    expect(code).toBe('n("[0,2] ~@3").scale("C3:major")');
    expect(events(code)).toEqual(['0-0.25 C3', '0-0.25 E3']);
  });

  it('keeps each note its own start and length', () => {
    const code = generatePattern(clip([n(0, 0, 3), n(4, 3, 1), n(2, 8, 8)]));
    expect(code).toBe('n("0@3 4 ~@4 2@8").scale("C3:major")');
    expect(events(code)).toEqual(['0-0.1875 C3', '0.1875-0.25 G3', '0.5-1 E3']);
  });

  it('stacks overlapping notes as separate voices', () => {
    const code = generatePattern(clip([n(0, 0, 8), n(4, 2, 2), n(7, 4, 8)]));
    expect(code).toBe('n("[0@4 ~@4, ~ 4 7@4 ~@2]").scale("C3:major")');
    expect(events(code)).toEqual(['0-0.5 C3', '0.125-0.25 G3', '0.25-0.75 C4']);
  });

  it('spans several cycles', () => {
    const code = generatePattern(
      clip([n(0, 0, 16), n(1, 16, 16)], { bars: 2 }),
    );
    expect(code).toBe('n("[0 1]/2").scale("C3:major")');
    expect(events(code, 2)).toEqual(['0-1 C3', '1-2 D3']);
  });

  it('is silent with no notes', () => {
    expect(generatePattern(clip([]))).toBe('');
  });

  it('reads an old step grid as chords', () => {
    const grid = [
      [true, false, true],
      [false, true, false],
    ];
    expect(generatePattern({ grid, steps: 2, mode: 'arp' })).toBe(
      'n("[0,2] 1").scale("C:major")',
    );
  });
});

describe('editing notes', () => {
  it('shortens an earlier note of the same pitch and drops later ones', () => {
    const notes = [n(0, 0, 8), n(0, 6, 2), n(1, 0, 8)];
    expect(placeNote(notes, n(0, 4, 4))).toEqual([
      n(0, 0, 4),
      n(1, 0, 8),
      n(0, 4, 4),
    ]);
  });

  it('moves notes to a coarser grid', () => {
    expect(rescaleNotes([n(0, 2, 4), n(1, 3, 1)], 16, 8)).toEqual([
      n(0, 1, 2),
      n(1, 2, 1),
    ]);
  });
});
