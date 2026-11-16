import { describe, expect, it } from 'vitest';
import { createPlaybackQueue } from './engine';

/** A fake Strudel: records what it was given; `fail` makes code fail. */
function fake(fail = (code: string) => code.includes('bad')) {
  const played: string[] = [];
  const errors: string[] = [];
  let hushed = 0;
  let release: (() => void) | undefined;
  let slow = false;
  const queue = createPlaybackQueue({
    evaluate: async (code) => {
      if (slow) await new Promise<void>((done) => (release = done));
      if (fail(code)) throw new Error(`cannot play ${code}`);
      played.push(code);
    },
    hush: () => void hushed++,
    onError: (error) => errors.push(String((error as Error).message)),
  });
  return {
    queue,
    played,
    errors,
    hushes: () => hushed,
    slowly: () => (slow = true),
    finish: () => release?.(),
  };
}
const settle = () => new Promise((done) => setTimeout(done, 0));

describe('the play queue', () => {
  it('plays the newest code, skipping what was replaced while busy', async () => {
    const strudel = fake();
    strudel.slowly();
    strudel.queue.setPattern('one');
    strudel.queue.setPattern('two');
    strudel.queue.setPattern('three');
    strudel.finish();
    await settle();
    strudel.finish();
    await settle();
    expect(strudel.played).toEqual(['one', 'three']);
  });

  it('keeps playing the last good code when new code fails', async () => {
    const strudel = fake();
    strudel.queue.setPattern('good');
    await settle();
    strudel.queue.setPattern('bad');
    await settle();
    expect(strudel.played).toEqual(['good']);
    // Only a failure with nothing playing is reported and silences.
    expect(strudel.errors).toEqual([]);
  });

  it('reports a failure when nothing good was playing', async () => {
    const strudel = fake();
    strudel.queue.setPattern('bad');
    await settle();
    expect(strudel.errors).toEqual(['cannot play bad']);
    expect(strudel.hushes()).toBeGreaterThan(0);
  });

  it('stops at once, and plays again after', async () => {
    const strudel = fake();
    strudel.queue.setPattern('a');
    await settle();
    strudel.queue.setPattern(null);
    expect(strudel.hushes()).toBe(1);
    strudel.queue.setPattern('a');
    await settle();
    expect(strudel.played).toEqual(['a', 'a']);
  });
});
