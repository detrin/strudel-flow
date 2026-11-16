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
  it('reads extended and altered chords', () => {
    const tones = (numeral: string, key = 'C') => chordOf(numeral, key).tones;
    expect(chordOf('V9', 'C')).toMatchObject({ name: 'G9' });
    expect(tones('V9')).toEqual([0, 4, 7, 10, 14]);
    expect(chordOf('ii9', 'C').name).toBe('Dm9');
    expect(chordOf('Imaj9', 'C').name).toBe('Cmaj9');
    expect(chordOf('ii11', 'C').name).toBe('Dm11');
    expect(chordOf('V13', 'C').name).toBe('G13');
    expect(chordOf('Iaug', 'C')).toMatchObject({
      name: 'Caug',
      tones: [0, 4, 8],
    });
    expect(chordOf('#idim7', 'C')).toMatchObject({
      name: 'C#dim7',
      tones: [0, 3, 6, 9],
    });
    expect(chordOf('iim7b5', 'C')).toMatchObject({
      name: 'Dm7b5',
      tones: [0, 3, 6, 10],
    });
    expect(chordOf('V7sus4', 'C').name).toBe('G7sus4');
    expect(chordOf('I69', 'C').name).toBe('C6/9');
    expect(chordOf('IVmaj7#11', 'C').name).toBe('Fmaj7#11');
    expect(chordOf('V7b9', 'C').name).toBe('G7b9');
    expect(chordOf('III7', 'C').name).toBe('E7');
    expect(chordOf('bII7', 'C').name).toBe('Db7');
  });
  it('reads slash chords: the bass on another degree', () => {
    expect(chordOf('II/I', 'D')).toMatchObject({ name: 'E/D', bass: 2 });
    expect(chordOf('V/VII', 'D')).toMatchObject({ name: 'A/C#', bass: 1 });
    expect(chordOf('i/bVII', 'D')).toMatchObject({ name: 'Dm/C', bass: 0 });
    // Without a slash the bass is the root.
    expect(chordOf('IV', 'D').bass).toBe(7);
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
  it('slower gives each chord two bars', () => {
    expect(applyTechniques([['I'], ['V']], ['slower'])).toEqual([
      ['I'],
      ['I'],
      ['V'],
      ['V'],
    ]);
  });
  it('suspend leans each plain chord on its 4th first', () => {
    expect(applyTechniques([['I'], ['vi'], ['V7']], ['suspend'])).toEqual([
      ['Isus4', 'I'],
      ['visus4', 'vi'],
      ['V7'],
    ]);
  });
  it('lush makes plain chords 9ths', () => {
    expect(applyTechniques([['I'], ['vi'], ['V'], ['IV']], ['lush'])).toEqual([
      ['Imaj9'],
      ['vi9'],
      ['V9'],
      ['IVmaj9'],
    ]);
  });
  it('deceptive sends V to vi instead of home', () => {
    expect(
      applyTechniques([['IV'], ['V'], ['I'], ['I']], ['deceptive']),
    ).toEqual([['IV'], ['V'], ['vi'], ['I']]);
    // Around the loop: the V at the end goes to the first bar.
    expect(applyTechniques([['I'], ['IV'], ['V']], ['deceptive'])[0]).toEqual([
      'vi',
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
  it('slash chords put their bass in the roots', () => {
    expect(realize([['I'], ['II/I'], ['IV/I']], 'D', []).bass).toBe(
      '<38 38 38>',
    );
    expect(realize([['I'], ['II/I']], 'D', []).names).toBe('D – E/D');
  });
  it('pedal keeps the tonic in the bass; key up moves everything', () => {
    expect(realize(yours, 'D', ['pedal']).bass).toBe('<38 38 38 38>');
    const up = realize(yours, 'D', ['key-up']);
    expect(up.key).toBe('E');
    expect(up.names).toBe('E – F# – A – C');
  });
});
