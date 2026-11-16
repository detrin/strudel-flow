import { expect, test, type Page } from './fixtures';
import { nodeOfType, openFresh, typeCode } from './helpers';

/**
 * What you hear, measured: each line's own analyser (and the master's),
 * while core actions run. Two sine lines far apart in pitch, short notes
 * and releases, so a line stops sounding soon after it is silenced.
 */
const SONG = `setcpm(120/4)
low: note("c2*8").s("sine").release(0.02).gain(0.6).mask("<1 1>")
high: note("c6*8").s("sine").release(0.02).gain(0.6).mask("<1 1>")`;

/** The loudest sample a source plays over the next `ms`. */
const peak = (page: Page, source: string, ms = 600) =>
  page.evaluate(
    async ({ source, ms }) => {
      const path = '/src/lib/meters.ts';
      const { analyserOf } = (await import(/* @vite-ignore */ path)) as {
        analyserOf: (key: string) => AnalyserNode | undefined;
      };
      let loudest = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        const analyser = analyserOf(source);
        if (analyser) {
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          for (const v of data) loudest = Math.max(loudest, Math.abs(v));
        }
        await new Promise((done) => requestAnimationFrame(done));
      }
      return loudest;
    },
    { source, ms },
  );
const SOUNDS = 0.02;
const SILENT = 0.003;
const sounds = (page: Page, source: string) =>
  expect
    .poll(() => peak(page, source, 400), {
      message: `${source} sounds`,
      timeout: 8000,
    })
    .toBeGreaterThan(SOUNDS);
const silent = (page: Page, source: string) =>
  expect
    .poll(() => peak(page, source, 400), {
      message: `${source} is silent`,
      timeout: 8000,
    })
    .toBeLessThan(SILENT);

const header = (page: Page, line: string) =>
  nodeOfType(page, 'arrange-node').filter({ hasText: line });

test.beforeEach(async ({ page }) => {
  await openFresh(page);
  await typeCode(page, SONG);
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await sounds(page, 'low');
  await sounds(page, 'high');
});

test('stop silences everything', async ({ page }) => {
  await page.getByRole('button', { name: /^Pause \(/ }).click();
  await silent(page, 'master');
});

test('a muted line comes back every time it is unmuted', async ({ page }) => {
  test.setTimeout(90_000);
  for (let round = 0; round < 5; round++) {
    await header(page, 'low').getByRole('button', { name: 'Mute low' }).click();
    await silent(page, 'low');
    await sounds(page, 'high');
    // A muted line is covered; its header keeps its name and the way back.
    await expect(header(page, 'low')).toBeVisible();
    await header(page, 'low')
      .getByRole('button', { name: /^Unmute/ })
      .click();
    await sounds(page, 'low');
  }
});

test('solo plays only the soloed line, and unsolo brings the rest back', async ({
  page,
}) => {
  const solo = header(page, 'high').getByRole('button', { name: 'Solo high' });
  await solo.click();
  await silent(page, 'low');
  await sounds(page, 'high');
  await solo.click();
  await sounds(page, 'low');
  await sounds(page, 'high');
});
