import { expect, test } from './fixtures';
import { openFresh, typeCode } from './helpers';

/** The loudest sample a line's own analyser saw over `ms`. */
const lineLevel = (
  page: import('@playwright/test').Page,
  label: string,
  ms: number,
) =>
  page.evaluate(
    async ({ label, ms }) => {
      const path = '/src/lib/meters.ts';
      const { lineAnalyser } = (await import(/* @vite-ignore */ path)) as {
        lineAnalyser: (label: string) => AnalyserNode | undefined;
      };
      let peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        const analyser = lineAnalyser(label);
        if (analyser) {
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          for (const v of data) peak = Math.max(peak, Math.abs(v));
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return peak;
    },
    { label, ms },
  );

test('a song whose first bar is silent still runs, and an unmuted line is heard', async ({
  page,
}) => {
  await openFresh(page);
  // Nothing sounds in bar 1: the kick is muted, the hats start in bar 2.
  const song = `setcpm(240/4)
_kick: s("bd*4").gain(0.9)
hat: s("hh*8").gain(0.6).mask("<0 1>")`;
  await typeCode(page, song);
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  await expect
    .poll(() => lineLevel(page, 'hat', 1500), { timeout: 8000 })
    .toBeGreaterThan(0.02);
  await typeCode(page, song.replace('_kick:', 'kick:'));
  await expect
    .poll(() => lineLevel(page, 'kick', 1500), { timeout: 8000 })
    .toBeGreaterThan(0.05);
});
