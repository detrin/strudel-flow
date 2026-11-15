import { describe, expect, it } from 'vitest';
import { mini } from '@strudel/web';
import type { Pattern } from '@strudel/web';
import { boundaryAfter, prepareLaunch, splice, useLaunch } from './launch';

const pattern = (code: string) => mini(code) as Pattern;
const events = (p: Pattern, from: number, to: number) =>
  p
    .queryArc(from, to)
    .map((hap) => `${Number(hap.whole!.begin.valueOf())}:${hap.value}`);

describe('launch quantization', () => {
  it('waits for the next bar, or the next 4', () => {
    expect(boundaryAfter(2.3, 1)).toBe(3);
    expect(boundaryAfter(3, 1)).toBe(3);
    expect(boundaryAfter(2.3, 4)).toBe(4);
    expect(boundaryAfter(4.01, 4)).toBe(8);
  });

  it('plays the old pattern up to the boundary and the new one from it', () => {
    const spliced = splice(pattern('a b'), pattern('c d'), 2);
    expect(events(spliced, 1, 3)).toEqual(['1:a', '1.5:b', '2:c', '2.5:d']);
  });

  it('splices only while playing with quantization on', () => {
    const scheduler = {
      started: true,
      lastEnd: 1.2,
      cps: 1000,
      pattern: pattern('a'),
      now: () => 1.1,
      setPattern: async (next: Pattern) => {
        scheduler.pattern = next;
      },
    };
    useLaunch.setState({ quantize: 0 });
    expect(prepareLaunch(scheduler)).toBeNull();
    useLaunch.setState({ quantize: 1 });
    const finish = prepareLaunch(scheduler)!;
    scheduler.pattern = pattern('b');
    finish();
    expect(useLaunch.getState().pending).toBe(2);
    expect(events(scheduler.pattern, 1, 3)).toEqual(['1:a', '2:b']);
  });
});
