import { expect, test } from './fixtures';
import { nodeOfType, openFresh, trackErrors, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

const play = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Play \(/ }).click();

test('the code outlines the steps that are playing', async ({ page }) => {
  const errors = trackErrors(page);
  await typeCode(page, 'kick: s("bd sd hh cp")');
  await play(page);
  const live = page.locator('.cm-live-hap').first();
  await expect(live).toBeVisible();
  expect(['bd', 'sd', 'hh', 'cp']).toContain(await live.textContent());
  // It moves on with the music.
  const seen = new Set<string>();
  for (let i = 0; i < 20 && seen.size < 3; i++) {
    seen.add((await live.textContent()) ?? '');
    await page.waitForTimeout(150);
  }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  errors.expectNone();
});

test('nodes of a sounding line light up', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4").gain(0.8)');
  await play(page);
  await expect(
    page.locator('.react-flow__node > div[data-sounding]'),
  ).toHaveCount(2);
});

test('the pad has a moving playhead and lights the note it plays', async ({
  page,
}) => {
  await play(page);
  const pad = nodeOfType(page, 'pad-node');
  const playhead = pad.locator('[data-playhead]');
  await expect(playhead).toBeVisible();
  const left = async () => (await playhead.boundingBox())!.x;
  const first = await left();
  await page.waitForTimeout(300);
  expect(await left()).not.toBe(first);
  await expect(pad.locator('[data-note][data-sounding]').first()).toBeVisible();
});

test('two-finger scrolling pans the canvas, like Miro', async ({ page }) => {
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  await page.mouse.move(900, 700);
  await page.mouse.wheel(120, 80);
  await expect(viewport).not.toHaveAttribute('style', before!);
  const style = (await viewport.getAttribute('style'))!;
  // Panned, not zoomed.
  expect(style.match(/scale\(([\d.]+)\)/)?.[1]).toBe(
    before!.match(/scale\(([\d.]+)\)/)?.[1],
  );
});
