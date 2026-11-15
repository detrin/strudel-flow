import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('adding a bar past 64 keeps the bars the same size', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4").mask("<1!32 0!32>")');
  const arrange = nodeOfType(page, 'arrange-node');
  const bar = arrange.getByRole('button', { name: 'Bar 1', exact: true });
  const before = (await bar.boundingBox())!;
  await arrange.getByRole('button', { name: 'More bars' }).click();
  await expect(editor(page)).toContainText('.mask("<1!32 0!33>")');
  const after = (await bar.boundingBox())!;
  expect(Math.round(after.width)).toBe(Math.round(before.width));
  expect(Math.round(after.height)).toBe(Math.round(before.height));
  await expect(bar).toHaveText('1');
  // The newest bar is there, reachable by scrolling the grid.
  await expect(arrange.getByRole('button', { name: 'Bar 65' })).toBeAttached();
});

test('while playing, Arrange shows the bar the song is in and whether the line plays', async ({
  page,
}) => {
  // Two bars a second; the kick plays in bar 2 of every 2.
  await typeCode(page, 'setcpm(240/4)\nkick: s("bd*4").mask("<0 1>")');
  const arrange = nodeOfType(page, 'arrange-node');
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  const status = arrange.getByRole('status');
  await expect(status).toHaveText('Bar 1 · silent here, plays from bar 2', {
    timeout: 5000,
  });
  await expect(status).toHaveText('Bar 2 · plays', { timeout: 5000 });
  await expect(arrange.locator('[aria-current="step"]')).toHaveAccessibleName(
    'Bar 2',
  );
  await page.getByRole('button', { name: 'Pause (Space)' }).click();
  await expect(status).toHaveCount(0);
});
