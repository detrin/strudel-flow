import { describe, expect, it } from 'vitest';
import { mapRanges, regionsOf } from './live';

describe('live highlighting', () => {
  it('finds labelled lines, numbering anonymous ones', () => {
    const code =
      'setcpm(1)\nkick: s("bd")\n  .gain(1)\n$: s("hh")\n$: s("sd")\n';
    expect(regionsOf(code).map((r) => r.label)).toEqual(['kick', '$0', '$1']);
  });

  it('moves a range into the same string of the edited text', () => {
    const evaluated = 'setcpm(120/4)\n\nkick: s("bd sd")\n  .gain(1)\n';
    const typed =
      '// my song\nsetcpm(120/4)\nkick: s("bd sd").gain(1) // "bd"\n';
    const sd = evaluated.indexOf('sd');
    expect(mapRanges(evaluated, typed, [{ start: sd, end: sd + 2 }])).toEqual([
      { start: typed.indexOf('sd'), end: typed.indexOf('sd') + 2 },
    ]);
  });

  it('tells apart the same string on different lines', () => {
    const evaluated = 'a: s("bd")\nb: s("bd")\n';
    const typed = 'b: s("bd")\n\na: s("bd")\n';
    const second = evaluated.lastIndexOf('bd');
    expect(
      mapRanges(evaluated, typed, [{ start: second, end: second + 2 }]),
    ).toEqual([{ start: typed.indexOf('bd'), end: typed.indexOf('bd') + 2 }]);
  });

  it('drops ranges whose string is gone', () => {
    expect(
      mapRanges('a: s("bd")', 'a: s("hh")', [{ start: 6, end: 8 }]),
    ).toEqual([]);
  });
});
