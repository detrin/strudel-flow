import { expect, test, type Page } from './fixtures';
import { openFresh, typeCode } from './helpers';

/**
 * The master limiter: a song louder than full scale comes out at full
 * scale (no clipping), and a quiet one comes out as it went in.
 */
const LOUD = `setcpm(120/4)
a: note("c3").s("sawtooth").sustain(1).gain(2.5)
b: note("g3").s("sawtooth").sustain(1).gain(2.5)`;
const QUIET = `setcpm(120/4)
a: note("c3").s("sine").sustain(1).gain(0.25)`;

/** The loudest sample the master plays over the next `ms`. */
const masterPeak = (page: Page, ms = 1500) =>
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

const play = async (page: Page, code: string, sounds = 0.05) => {
  await openFresh(page);
  await typeCode(page, code);
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await expect
    .poll(() => masterPeak(page, 300), { timeout: 8000 })
    .toBeGreaterThan(sounds);
};

test('a song louder than full scale does not clip', async ({ page }) => {
  await play(page, LOUD);
  // Unlimited, two saws at gain 2.5 peak well above 1.
  const peak = await masterPeak(page);
  expect(peak).toBeLessThanOrEqual(1.0);
  expect(peak).toBeGreaterThan(0.7);
});

test('a quiet song passes through unchanged', async ({ page }) => {
  await play(page, QUIET, 0.02);
  const peak = await masterPeak(page);
  // Measured without the limiter: 0.075.
  expect(peak).toBeGreaterThan(0.07);
  expect(peak).toBeLessThan(0.08);
});
