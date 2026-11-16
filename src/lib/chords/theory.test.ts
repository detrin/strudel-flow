import { describe, expect, it } from 'vitest';
import {
  applyTechniques,
  chordOf,
  realize,
  transposeKey,
  type Bars,
} from './theory';

const yours: Bars = [['I'], ['II'], ['IV'], ['bVI']];

describe('chordOf', () => {
  it('reads numerals in a key, spelled from the key', () => {
    expect(chordOf('I', 'D').name).toBe('D');
    expect(chordOf('II', 'D').name).toBe('E');
    expect(chordOf('ii', 'D').name).toBe('Em');
    expect(chordOf('bVI', 'D').name).toBe('Bb');
    expect(chordOf('bVII', 'D').name).toBe('C');
    expect(chordOf('III', 'D').name).toBe('F#');
    expect(chordOf('iv', 'D').name).toBe('Gm');
    expect(chordOf('vii', 'C').name).toBe('Bm');
    expect(chordOf('viidim', 'C').name).toBe('Bdim');
    expect(chordOf('I', 'F#').name).toBe('F#');
    expect(chordOf('bVI', 'C').name).toBe('Ab');
  });
  it('reads colours', () => {
    expect(chordOf('Imaj7', 'D')).toMatchObject({
      name: 'Dmaj7',
      tones: [0, 4, 7, 11],
    });
    expect(chordOf('V7', 'D')).toMatchObject({
      name: 'A7',
      tones: [0, 4, 7, 10],
    });
    expect(chordOf('ii7', 'D')).toMatchObject({
      name: 'Em7',
      tones: [0, 3, 7, 10],
    });
    expect(chordOf('IVadd9', 'D').name).toBe('Gadd9');
    expect(chordOf('IIsus4', 'D')).toMatchObject({
      name: 'Esus4',
      tones: [0, 5, 7],
    });
    expect(chordOf('vi6', 'D').name).toBe('Bm6');
  });
  it('refuses what is not a numeral', () => {
    expect(() => chordOf('X', 'D')).toThrow(/numeral/);
    expect(() => chordOf('I', 'H')).toThrow(/key/);
  });
});

describe('techniques', () => {
  it('resolve ends the loop on V, Mario on bVI bVII', () => {
    expect(applyTechniques(yours, ['resolve']).at(-1)).toEqual(['bVI', 'V']);
    expect(applyTechniques(yours, ['mario']).at(-1)).toEqual(['bVI', 'bVII']);
    // A loop already ending on V or I is left alone.
    expect(applyTechniques([['I'], ['V']], ['resolve'])).toEqual([
      ['I'],
      ['V'],
    ]);
  });
  it('borrow iv follows IV with its minor', () => {
    expect(applyTechniques(yours, ['borrow-iv'])[2]).toEqual(['IV', 'iv']);
  });
  it('faster plays the loop twice in the same bars', () => {
    expect(applyTechniques(yours, ['faster'])).toEqual([
      ['I', 'II'],
      ['IV', 'bVI'],
      ['I', 'II'],
      ['IV', 'bVI'],
    ]);
  });
  it('colour adds a 9th to major chords and a 7th to minor ones', () => {
    expect(applyTechniques([['I'], ['vi'], ['V7']], ['colour'])).toEqual([
      ['Iadd9'],
      ['vi7'],
      ['V7'],
    ]);
  });
  it('key up moves a whole step', () => {
    expect(transposeKey('D', 2)).toBe('E');
    expect(transposeKey('A#', 2)).toBe('C');
  });
});

describe('realize', () => {
  it('names the chords and writes notes and roots as mini-notation', () => {
    const out = realize(yours, 'D', []);
    expect(out.names).toBe('D – E – G – Bb');
    expect(out.key).toBe('D');
    expect(out.bass).toBe('<38 40 43 46>');
    expect(out.chords).toMatch(/^<\[\d+(,\d+)+\]( \[\d+(,\d+)+\]){3}>$/);
  });
  it('voices each chord with its own notes, moving little', () => {
    const { voicings } = realize(yours, 'D', []);
    const pcs = (notes: number[]) =>
      [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);
    expect(pcs(voicings[0]![0]!)).toEqual([2, 6, 9]); // D F# A
    expect(pcs(voicings[3]![0]!)).toEqual([2, 5, 10]); // Bb D F
    for (let i = 1; i < voicings.length; i++) {
      const a = voicings[i - 1]![0]!;
      const b = voicings[i]![0]!;
      const moved = a.reduce((sum, n, k) => sum + Math.abs(n - (b[k] ?? n)), 0);
      expect(moved).toBeLessThanOrEqual(7);
    }
    for (const bar of voicings)
      for (const chord of bar)
        for (const note of chord) {
          expect(note).toBeGreaterThanOrEqual(55);
          expect(note).toBeLessThanOrEqual(79);
        }
  });
  it('two chords in a bar are written as one step of two', () => {
    const out = realize(yours, 'D', ['mario']);
    expect(out.names).toBe('D – E – G – Bb C');
    expect(out.bass).toBe('<38 40 43 [46 36]>');
  });
  it('pedal keeps the tonic in the bass; key up moves everything', () => {
    expect(realize(yours, 'D', ['pedal']).bass).toBe('<38 38 38 38>');
    const up = realize(yours, 'D', ['key-up']);
    expect(up.key).toBe('E');
    expect(up.names).toBe('E – F# – A – C');
  });
});
