import { describe, expect, it } from 'vitest';
import { hasTags, matches, tagCounts } from './filter';

describe('library filters', () => {
  it('matches every word in name or tags', () => {
    expect(matches('808 kick', 'RolandTR808_bd', ['drums', 'kick'])).toBe(true);
    expect(matches('808 snare', 'RolandTR808_bd', ['drums', 'kick'])).toBe(
      false,
    );
    expect(matches('', 'anything', [])).toBe(true);
    expect(matches('BASS', 'jvbass', [])).toBe(true);
  });
  it('filters by tags and counts them', () => {
    expect(hasTags(['bass', 'techno'], ['bass'])).toBe(true);
    expect(hasTags(['bass'], ['bass', 'techno'])).toBe(false);
    expect(
      tagCounts([
        { tags: ['bass', 'techno'] },
        { tags: ['bass'] },
        { tags: [] },
      ]),
    ).toEqual([
      { tag: 'bass', count: 2 },
      { tag: 'techno', count: 1 },
    ]);
  });
});
