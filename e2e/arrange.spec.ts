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
