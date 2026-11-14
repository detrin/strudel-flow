import { describe, expect, it } from 'vitest';
import { tagPunchcards } from './punchcards';

describe('tagPunchcards', () => {
  it('passes each punchcard call its line label', () => {
    const code = [
      'CHOP: s("bd")',
      '  .gain(1)',
      '  ._punchcard()',
      '_bass: note("a2")._pianoroll({ fold: 1 })',
      'all(x => x._punchcard())',
    ].join('\n');
    expect(tagPunchcards(code).split('\n')).toEqual([
      'CHOP: s("bd")',
      '  .gain(1)',
      "  ._punchcard({label:'CHOP'},)",
      `_bass: note("a2")._pianoroll({label:'bass'},{ fold: 1 })`,
      // Outside a labelled line there is nothing to draw it under.
      'all(x => x._punchcard())',
    ]);
  });
});
