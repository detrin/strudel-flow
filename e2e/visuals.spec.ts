import { expect, test, type Locator } from './fixtures';
import { nodeOfType, openFresh, typeCode } from './helpers';

const SONG = `setcpm(120/4)
lead: note("c3 e3 g3 c4").sound("sawtooth")
  .lpf("<400 3000>").lpq(8)
  .attack(0.01).decay(0.2).sustain(0.4).release(0.3)
  .gain(0.8)
  .delay(0.5).delaytime(0.125).delayfeedback(0.5)
  .room(0.5)
  .hpf(sine.range(100, 800).slow(2))
  ._spectrum()`;

/** How many pixels of a canvas are drawn on. */
const inked = (canvas: Locator) =>
  canvas.evaluate((el: HTMLCanvasElement) => {
    const { data } = el
      .getContext('2d')!
      .getImageData(0, 0, el.width, el.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  });
const picture = (canvas: Locator) =>
  canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL());

test('nodes show what they do, live while playing', async ({ page }) => {
  await openFresh(page);
  await typeCode(page, SONG);
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await page.waitForTimeout(2500);
  for (const kind of [
    'filter',
    'envelope',
    'level',
    'delay',
    'room',
    'modulate',
    'analyzer',
  ]) {
    const canvas = page.locator(`canvas[data-visual="${kind}"]`).first();
    await expect(canvas, kind).toBeVisible();
    expect(await inked(canvas), `${kind} draws`).toBeGreaterThan(50);
    // Live: the picture changes from moment to moment.
    const before = await picture(canvas);
    await expect
      .poll(() => picture(canvas), { message: `${kind} moves` })
      .not.toBe(before);
  }
});

test('the Analyzer shows the master mix as loudness over time', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(page, 'kick: s("bd*4")._spectrum()');
  const analyzer = nodeOfType(page, 'analyzer-node');
  await analyzer.getByLabel('Analyzer view').selectOption('loudness');
  await analyzer.getByLabel('Analyzer source').selectOption('master');
  await page.getByRole('button', { name: /^Play \(/ }).click();
  const canvas = analyzer.locator('canvas');
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Loudness over time of the master mix',
  );
  await expect
    .poll(() => inked(canvas), { timeout: 8000 })
    .toBeGreaterThan(500);
});

test('each part of a stack is measured on its own', async ({ page }) => {
  await openFresh(page);
  // A low sine and a high sine, as two parts of one line.
  await typeCode(
    page,
    `setcpm(120/4)
both: stack(
  note("c2*4").s("sine").hpf(30),
  note("c7*4").s("sine").hpf(1000)
).gain(0.8)`,
  );
  await page.getByRole('button', { name: /^Play \(/ }).click();

  /** Where each source's energy is, in Hz (the loudest bin). */
  const peaks = () =>
    page.evaluate(async () => {
      const path = '/src/lib/meters.ts';
      const { lineAnalyser } = (await import(/* @vite-ignore */ path)) as {
        lineAnalyser: (key: string) => AnalyserNode | undefined;
      };
      const peakOf = (key: string) => {
        const analyser = lineAnalyser(key);
        if (!analyser) return null;
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        let best = 0;
        for (let i = 1; i < data.length; i++)
          if (data[i] > data[best]) best = i;
        if (data[best] < -90) return null;
        return Math.round(
          (best * analyser.context.sampleRate) / 2 / data.length,
        );
      };
      return {
        low: peakOf('both#0'),
        high: peakOf('both#1'),
        line: peakOf('both'),
      };
    });

  await expect
    .poll(
      async () => {
        const { low, high, line } = await peaks();
        return Boolean(low && high && line);
      },
      { timeout: 15000 },
    )
    .toBe(true);
  const { low, high } = await peaks();
  // c2 is 65 Hz, c7 is 2093 Hz: each part hears only itself.
  expect(low!).toBeLessThan(200);
  expect(high!).toBeGreaterThan(1500);
});
