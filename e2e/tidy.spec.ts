import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('Tidy orders the code, stacks order-free effects, Arrange last', async ({
  page,
}) => {
  await typeCode(
    page,
    'kick: s("bd sd").lpf(800).fast(2).gain(0.5).mask("<1 0>")',
  );
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Tidy all lines/ }).click();
  await expect(editor(page)).toContainText(
    's("bd sd")  .fast(2)  .lpf(800)  .gain(0.5)  .mask("<1 0>")',
  );
  const box = async (type: string) =>
    (await nodeOfType(page, type).boundingBox())!;
  const header = await box('arrange-node');
  const source = await box('sound-node');
  const filter = await box('lpf-node');
  const level = await box('level-node');
  // In code order; the filter and level share one column.
  expect(header.x).toBeGreaterThan(level.x);
  expect(source.x).toBeLessThan(filter.x);
  expect(Math.round(level.x)).toBe(Math.round(filter.x));
  expect(level.y).toBeGreaterThan(filter.y);
  // The header is named after its line.
  await expect(nodeOfType(page, 'arrange-node')).toContainText('kick');
});
