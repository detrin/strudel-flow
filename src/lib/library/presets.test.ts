import { describe, expect, it } from 'vitest';
import {
  declarationsOf,
  freeLabel,
  insertLine,
  presetFromLine,
  suggestTags,
  withoutArrangement,
} from './presets';

const SONG = `setcpm(124/4)
const cutoff = slider(800, 200, 4000)
const pump = "1 0.5"
const unused = 3
// @layout 0,0 326,0
kick: s("bd*4")
  .gain(pump)
// @layout 0,200
bass: note("c2 eb2 g1 bb1")
  .s("sawtooth")
  .lpf(cutoff)
  .gain(pump)
_hat: s("hh*8")
`;

describe('presets', () => {
  it('reads declarations', () => {
    expect(declarationsOf(SONG).map((d) => d.name)).toEqual([
      'cutoff',
      'pump',
      'unused',
    ]);
  });
  it('saves a line with what it uses, without layout comments', () => {
    const bass = presetFromLine(SONG, 'bass')!;
    expect(bass.body).toBe(
      'note("c2 eb2 g1 bb1")\n  .s("sawtooth")\n  .lpf(cutoff)\n  .gain(pump)',
    );
    expect(bass.needs).toEqual([
      'const cutoff = slider(800, 200, 4000)',
      'const pump = "1 0.5"',
    ]);
    expect(presetFromLine(SONG, 'kick')!.body).toBe('s("bd*4")\n  .gain(pump)');
    expect(presetFromLine(SONG, 'hat')!.body).toBe('s("hh*8")');
    expect(presetFromLine(SONG, 'nope')).toBeNull();
  });
  it("leaves the next line's comments behind", () => {
    const song =
      'a: s("bd")\n  .gain(0.5) // loud\n\n// the hats:\n// closed\nb: s("hh")';
    expect(presetFromLine(song, 'a')!.body).toBe(
      's("bd")\n  .gain(0.5) // loud',
    );
  });
  it('inserts with a free label and only missing declarations', () => {
    const bass = presetFromLine(SONG, 'bass')!;
    const into = insertLine(SONG, bass);
    expect(into.label).toBe('bass2');
    expect(into.code.endsWith(`bass2: ${bass.body}\n`)).toBe(true);
    expect(into.code.match(/const cutoff/g)).toHaveLength(1);
    const fresh = insertLine('setcpm(30)', bass);
    expect(fresh.code).toBe(
      `setcpm(30)\nconst cutoff = slider(800, 200, 4000)\nconst pump = "1 0.5"\n\nbass: ${bass.body}\n`,
    );
    // Declarations join the song's others, before its first line; a pack
    // already loaded (with another comment) isn't loaded twice.
    const song = 'samples(\'github:x/y\') // drums\n\nkick: s("bd")\n';
    const added = insertLine(song, {
      label: 'hat',
      body: 's("hh")',
      needs: ["samples('github:x/y') // hats", 'const g = 0.5'],
    });
    expect(added.code).toBe(
      'samples(\'github:x/y\') // drums\nconst g = 0.5\n\nkick: s("bd")\n\nhat: s("hh")\n',
    );
    expect(freeLabel(SONG, 'Acid bass!')).toBe('Acid_bass');
  });
  it('suggests tags from the label and the sounds', () => {
    const tagsOf = (name: string) => (name === 'bd' ? ['drums', 'kick'] : []);
    expect(suggestTags('bass', 'note("c2").s("sawtooth")', tagsOf)).toEqual([
      'bass',
    ]);
    expect(suggestTags('beat', 's("bd*4, hh*8")', tagsOf)).toEqual([
      'drums',
      'kick',
    ]);
    expect(suggestTags('vox', 's("whatUneed")', tagsOf)).toEqual(['vocals']);
    // A sequence in brackets isn't chords; stacked notes are.
    expect(
      suggestTags('riff', 'note("[e3 d#3] c#3").s("supersaw")', tagsOf),
    ).toEqual([]);
    expect(
      suggestTags('keys', 'note("<[c3,e3,g3] [a2,c3,e3]>")', tagsOf),
    ).toEqual(['chords']);
    expect(suggestTags('keys', 'chord("<Am7 Dm9>").voicing()', tagsOf)).toEqual(
      ['chords'],
    );
  });
});

describe('presets carry sample packs and functions', () => {
  const SONG2 = `samples('github:tidalcycles/dirt-samples') // tech
samples({
  vox: ['data:audio/mpeg;base64,AAAA'],
})
setCps(140/60/4)
register('mux', (src, pat) => pat.set(src))
const loopAx = register('loopAx',
  (n, pat) => pat.loopAt(n))
drums: s("tech:5*4").mux("x")
chop: s("vox").loopAx(2)
lead: note("c4 e4").sound("supersaw")
plain: note("c4").lpf(500)
`;
  it('saves the packs (when it plays sounds) and the functions it calls', () => {
    expect(presetFromLine(SONG2, 'drums')!.needs).toEqual([
      "samples('github:tidalcycles/dirt-samples') // tech",
      "register('mux', (src, pat) => pat.set(src))",
    ]);
    // Embedded sounds only go with the line that plays them.
    expect(presetFromLine(SONG2, 'chop')!.needs).toContain(
      "samples({\n  vox: ['data:audio/mpeg;base64,AAAA'],\n})",
    );
    expect(presetFromLine(SONG2, 'chop')!.needs).toContain(
      "const loopAx = register('loopAx',\n  (n, pat) => pat.loopAt(n))",
    );
    expect(presetFromLine(SONG2, 'lead')!.needs).toHaveLength(1);
    expect(presetFromLine(SONG2, 'plain')!.needs).toEqual([]);
  });
  it('adds only the packs and functions the song lacks', () => {
    const drums = presetFromLine(SONG2, 'drums')!;
    const into = insertLine(
      "samples('github:tidalcycles/dirt-samples') // tech\nsetcpm(30)",
      drums,
    );
    expect(into.code.match(/github:tidalcycles/g)).toHaveLength(1);
    expect(into.code).toContain("register('mux'");
    expect(into.code).not.toContain('vox: [');
    expect(
      insertLine(SONG2, drums).code.match(/register\('mux'/g),
    ).toHaveLength(1);
  });
});

describe('a line without its arrangement', () => {
  it("drops the line's own masks, not masks inside it", () => {
    expect(
      withoutArrangement(
        's("bd*4")\n  .gain(0.9)\n  .mask("<0!16 1!8>")\n  ._punchcard()',
      ),
    ).toBe('s("bd*4")\n  .gain(0.9)\n  ._punchcard()');
    expect(
      withoutArrangement(
        'stack(\n  kick,\n  fill.mask("<0!7 1>")\n).mask("<1 0>")',
      ),
    ).toBe('stack(\n  kick,\n  fill.mask("<0!7 1>")\n)');
    expect(withoutArrangement('s("hh*8").mask(sometimes(")"))')).toBe(
      's("hh*8")',
    );
    expect(withoutArrangement('note("c3")')).toBe('note("c3")');
  });
});

describe('declarations used through a spread', () => {
  it('carries a const used as ...NAME, not one read as a property', () => {
    const song = `const HARM = [1, 0.5]
const MEL = "60 62"
const obj = { harm: 1 }
vox: stack(...HARM.map((g, i) => note(MEL).gain(g)))
other: note(obj.HARM)`;
    const vox = presetFromLine(song, 'vox')!;
    expect(vox.needs).toEqual(['const HARM = [1, 0.5]', 'const MEL = "60 62"']);
    const other = presetFromLine(song, 'other')!;
    expect(other.needs).toEqual(['const obj = { harm: 1 }']);
  });
});
