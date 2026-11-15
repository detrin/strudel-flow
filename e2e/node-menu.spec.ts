import { expect, test } from './fixtures';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => {
  await openFresh(page);
  await typeCode(page, 'kick: s("bd*4").lpf(800)');
  // Let the canvas finish fitting the new nodes into view.
  await page.waitForTimeout(600);
});

test('the node menu zooms with the node', async ({ page }) => {
  const node = nodeOfType(page, 'lpf-node');
  const menuWidth = async () => {
    await node.getByRole('button', { name: 'Module options' }).click();
    const width = (await node.getByRole('menu').boundingBox())!.width;
    await page.keyboard.press('Escape');
    return width;
  };
  const before = await menuWidth();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.waitForTimeout(500);
  expect(await menuWidth()).toBeLessThan(before * 0.9);
});

test('editing a node code changes the node', async ({ page }) => {
  const node = nodeOfType(page, 'lpf-node');
  await node.getByRole('button', { name: 'Module options' }).click();
  await node.getByRole('menuitem', { name: 'Edit code' }).click();
  const code = node.locator('textarea');
  await expect(code).toHaveValue('lpf(800)');
  await code.fill('lpf(1200)');
  await code.press('Enter');
  await expect(editor(page)).toContainText('.lpf(1200)');
  await expect(node.getByText('1.20k')).toBeVisible();
});

test('code for another effect turns the node into it', async ({ page }) => {
  const node = nodeOfType(page, 'lpf-node');
  await node.getByRole('button', { name: 'Module options' }).click();
  await node.getByRole('menuitem', { name: 'Edit code' }).click();
  await node.locator('textarea').fill('room(0.5)');
  await node.locator('textarea').press('Enter');
  await expect(nodeOfType(page, 'room-node')).toHaveCount(1);
  await expect(nodeOfType(page, 'lpf-node')).toHaveCount(0);
});
