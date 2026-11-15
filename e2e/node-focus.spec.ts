import { expect, test } from './fixtures';
import { nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('clicking a node shows its code in the console', async ({ page }) => {
  // Many lines, so the filter's line is far down the console.
  const filler = Array.from(
    { length: 30 },
    (_, i) => `l${i}: s("hh").gain(0.${(i % 9) + 1})`,
  ).join('\n');
  await typeCode(page, `${filler}\nkick: s("bd*4")\n  .lpf(800).lpq(4)`);
  await page.waitForTimeout(800);
  await nodeOfType(page, 'lpf-node').locator('header').click();
  const focus = page.locator('.cm-node-focus');
  await expect(focus).toHaveText('lpf(800).lpq(4)');
  await expect(focus).toBeInViewport();
  // Clicking empty canvas clears it.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 500 } });
  await expect(focus).toHaveCount(0);
});
