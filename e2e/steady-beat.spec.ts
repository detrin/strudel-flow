import { expect, test } from './fixtures';
import { openFresh, typeCode } from './helpers';

/**
 * A busy page must not cost a beat: Strudel drops events whose time has
 * passed when its scheduler wakes late, so a main thread stalled for a
 * quarter second (a heavy canvas redraw, many effects starting at once)
 * lost kicks in a techno song. Plays a click every beat, stalls the page
 * now and then, records the master and counts the clicks.
 */
const SONG = `setcpm(120/4)
k: note("c5*4").s("square").decay(0.03).sustain(0).gain(0.5)`;

test('every beat sounds while the page is busy', async ({ page }) => {
  test.setTimeout(60_000);
  await openFresh(page);
  await typeCode(page, SONG);
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const path = '/src/lib/recorder.ts';
    const { startRecording, stopRecording } = (await import(
      /* @vite-ignore */ path
    )) as {
      startRecording: () => Promise<void>;
      stopRecording: () => Blob | null;
    };
    await startRecording();
    const stall = (ms: number) => {
      const end = performance.now() + ms;
      while (performance.now() < end);
    };
    // Six seconds (12 beats at 120 bpm), the page frozen for 280 ms every 0.9 s.
    for (let i = 0; i < 6; i++) {
      await new Promise((done) => setTimeout(done, 620));
      stall(280);
    }
    await new Promise((done) => setTimeout(done, 400));
    const blob = stopRecording();
    if (!blob) return { beats: 0, missing: -1 };
    const view = new DataView(await blob.arrayBuffer());
    const rate = view.getUint32(24, true);
    const channels = view.getUint16(22, true);
    const samples = (view.byteLength - 44) / 2 / channels;
    const at = (i: number) =>
      view.getInt16(44 + i * 2 * channels, true) / 32768;
    // Loudness per 10 ms, then the clicks: rises from silence.
    const step = Math.round(rate / 100);
    const level: number[] = [];
    for (let i = 0; i + step < samples; i += step) {
      let sum = 0;
      for (let j = i; j < i + step; j++) sum += at(j) ** 2;
      level.push(Math.sqrt(sum / step));
    }
    const onsets: number[] = [];
    for (let i = 1; i < level.length; i++)
      if (level[i]! > 0.05 && level[i - 1]! <= 0.05) onsets.push(i * 0.01);
    // Gaps between clicks: a beat is 0.5 s; a missing one leaves 1 s.
    const gaps = onsets.slice(1).map((t, i) => t - onsets[i]!);
    return {
      beats: onsets.length,
      missing: gaps.filter((g) => g > 0.75).length,
    };
  });
  expect(result.beats).toBeGreaterThan(9);
  expect(result.missing).toBe(0);
});
