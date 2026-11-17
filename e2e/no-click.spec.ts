import { expect, test, type Page } from './fixtures';
import { editor, openFresh, settle } from './helpers';

/**
 * Played before any mouse click (Ctrl+Enter, or Claude through the
 * bridge), effects that run as audio worklets (distort, crush) still
 * sound: Strudel only loads them on the first mousedown.
 */
const SONG = `setcpm(120/4)
a: note("c3*4").s("sine").distort(0.5).gain(0.6)`;

const masterPeak = (page: Page, ms = 400) =>
  page.evaluate(async (ms) => {
    const path = '/src/lib/meters.ts';
    const { analyserOf } = (await import(/* @vite-ignore */ path)) as {
      analyserOf: (key: string) => AnalyserNode | undefined;
    };
    let loudest = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const analyser = analyserOf('master');
      if (analyser) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (const v of data) loudest = Math.max(loudest, Math.abs(v));
      }
      await new Promise((done) => requestAnimationFrame(done));
    }
    return loudest;
  }, ms);

test('a distorted line sounds when played without a click', async ({
  page,
}) => {
  await openFresh(page);
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(SONG);
  await settle(page);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect
    .poll(() => masterPeak(page), { timeout: 8000 })
    .toBeGreaterThan(0.05);
});
