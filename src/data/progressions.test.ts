import { describe, expect, it } from 'vitest';
import { mini, type Pattern } from '@strudel/web';
import { KEY_OPTIONS } from './sounds';
import { PROGRESSIONS, TECHNIQUES } from './progressions';
import { realize } from '@/lib/chords/theory';
import { parseBars, progressionLines, TECHNIQUE_IDS } from '@/lib/chords/use';

/** The values a mini-notation string plays in each cycle. */
const cycles = (code: string, count: number) =>
  Array.from({ length: count }, (_, cycle) =>
    (mini(code) as Pattern)
      .queryArc(cycle, cycle + 1)
      .filter((hap) => hap.whole && hap.whole.begin.valueOf() >= cycle)
      .map((hap) => Number(hap.value)),
  );

describe('the progression catalog', () => {
  it('has unique ids, a feeling, tags and a source for each', () => {
    expect(new Set(PROGRESSIONS.map((p) => p.id)).size).toBe(
      PROGRESSIONS.length,
    );
    for (const p of PROGRESSIONS) {
      expect(p.feeling.length).toBeGreaterThan(3);
      expect(p.tags.length).toBeGreaterThan(0);
      expect(p.source.url).toMatch(/^https:\/\//);
    }
  });

  it('every technique has a label the app and Claude share', () => {
    expect(TECHNIQUES.map((t) => t.id)).toEqual(TECHNIQUE_IDS);
  });

  it('plays in every key with every technique: one chord a step, roots below', () => {
    for (const p of PROGRESSIONS)
      for (const { value: key } of KEY_OPTIONS)
        for (const technique of [undefined, ...TECHNIQUE_IDS]) {
          const out = realize(p.bars, key, technique ? [technique] : []);
          const bars = out.bars.length;
          const notes = cycles(out.chords, bars);
          const roots = cycles(out.bass, bars);
          notes.forEach((cycle, i) => {
            const chordsInBar = out.bars[i]!.length;
            // Each chord's notes sound together, and every note is a chord tone.
            const tones = out.bars[i]!.flatMap((c) =>
              c.tones.map((t) => (c.root + t) % 12),
            );
            for (const n of cycle) expect(tones).toContain(n % 12);
            expect(roots[i]).toHaveLength(chordsInBar);
            for (const r of roots[i]!) {
              expect(r).toBeGreaterThanOrEqual(36);
              expect(r).toBeLessThan(48);
            }
          });
        }
  }, 60_000);

  it('writes lines Strudel can read', () => {
    const lines = progressionLines(realize(PROGRESSIONS[0]!.bars, 'D', []));
    expect(lines.map((l) => l.label)).toEqual(['chords', 'roots']);
    expect(lines[0]!.body).toMatch(/^note\("<.*>"\)\.sound\("supersaw"\)/);
  });

  it('reads numerals typed by Claude', () => {
    expect(parseBars('I II IV bVI+bVII')).toEqual([
      ['I'],
      ['II'],
      ['IV'],
      ['bVI', 'bVII'],
    ]);
    expect(parseBars('I | V | vi | IV')).toHaveLength(4);
    expect(() => parseBars('  ')).toThrow();
  });
});
