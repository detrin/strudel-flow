import { expect, test, type Locator } from '@playwright/test';
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
