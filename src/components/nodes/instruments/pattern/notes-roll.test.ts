import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import { midiName, readNotes, writeNotes } from './notes-roll';

describe('Notes piano roll', () => {
  it('names semitones', () => {
    expect([60, 61, 63, 47].map(midiName)).toEqual(['c4', 'c#4', 'd#4', 'b2']);
  });

  it('reads a fast arpeggio onto a fine grid', () => {
    const read = readNotes('<e4 d#4 b3 e3 d#3 b2>', 32, 1)!;
    expect(read.division).toBe(32);
    expect(read.notes).toHaveLength(32);
    expect(read.notes.slice(0, 3)).toEqual([
      { pitch: 64, start: 0, length: 1 },
      { pitch: 63, start: 1, length: 1 },
      { pitch: 59, start: 2, length: 1 },
    ]);
  });

  it('reads chords and lengths, and writes them back the same', () => {
    const read = readNotes('[c3,e3] g3@2 ~', 1, 1)!;
    expect(read.division).toBe(4);
    const code = writeNotes(read.notes, read.division, 1);
    expect(code).toBe('[c3,e3] g3@2 ~');
    expect(haps(`note("${code}")`, 1)).toEqual(
      haps('note("[c3,e3] g3@2 ~")', 1),
    );
  });

  it('is not a roll when the pattern is not notes', () => {
    expect(readNotes('bd sd', 1, 1)).toBeNull();
    expect(readNotes('<<', 1, 1)).toBeNull();
  });
});
