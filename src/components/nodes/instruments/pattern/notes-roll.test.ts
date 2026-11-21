import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import { loopBars, midiName, readNotes, writeNotes } from './notes-roll';

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

  it('finds how many bars a pattern takes to loop', () => {
    expect(loopBars('c3 e3 g3 b3', 1)).toBe(1);
    expect(loopBars('<c3 e3>', 1)).toBe(2);
    expect(loopBars('<c3 e3 g3 b3>*2', 1)).toBe(2);
    const bars = Array.from({ length: 32 }, (_, i) => `[c3 e${2 + (i % 5)}]`);
    expect(loopBars(`<${bars.join(' ')}>`, 1)).toBe(32);
    expect(loopBars(`<${bars.join(' ')}>`, 2)).toBe(16);
    // No loop within the longest clip: the first bar, as before.
    expect(loopBars('<e4 d#4 b3 e3 d#3 b2>', 32)).toBe(1);
    expect(loopBars('bd sd', 1)).toBe(1);
  });

  it('takes a long phrase with a few notes that change each pass as its length', () => {
    const bars = Array.from(
      { length: 16 },
      (_, i) =>
        `[c3 d3 e${2 + (i % 5)} f3 g3 a3 b3 ${i ? 'c4' : '<c4 d4 e4>'}]`,
    );
    expect(loopBars(`<${bars.join(' ')}>`, 1)).toBe(16);
  });

  it('reads and writes a 32-bar clip', () => {
    const bars = Array.from({ length: 32 }, (_, i) => `[c3 e${2 + (i % 5)}]`);
    const read = readNotes(`<${bars.join(' ')}>`, 1, 32)!;
    expect(read.notes).toHaveLength(64);
    const code = writeNotes(read.notes, read.division, 32);
    expect(haps(`note("${code}")`, 32)).toEqual(
      haps(`note("<${bars.join(' ')}>")`, 32),
    );
  });
});
