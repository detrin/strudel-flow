import { expect, test } from '@playwright/test';
import {
  addFromPlus,
  editor,
  nodeOfType,
  nodes,
  openFresh,
  trackErrors,
  typeCode,
} from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('shows the default patch as code', async ({ page }) => {
  await expect(editor(page)).toContainText('setcpm(120/4)');
  await expect(editor(page)).toContainText('.sound("triangle")');
  await expect(editor(page)).toContainText('.lpf(1500)');
});

test('typing code builds wired nodes on the canvas', async ({ page }) => {
  const errors = trackErrors(page);
  await typeCode(
    page,
    'setcpm(132/4)\nkick: s("bd*4").gain(1.1)\nhat: s("hh*8").lpf(6000).room(0.2)',
  );
  await expect(nodes(page)).toHaveCount(5);
  await expect(nodeOfType(page, 'lpf-node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await expect(page.getByLabel('Tempo in beats per minute')).toHaveValue('132');
  // The text stays exactly as typed.
  await expect(editor(page)).toContainText('kick: s("bd*4").gain(1.1)');
  errors.expectNone();
});

test('editing on the canvas rewrites the code', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4").gain(1.1)');
  await expect(nodes(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Disable Sound' }).click();
  await expect(editor(page)).toContainText('// kick: s("bd*4")');
  const tempo = page.getByLabel('Tempo in beats per minute');
  await tempo.fill('90');
  await expect(editor(page)).toContainText('setcpm(90/4)');
});

test('adding a node from the menu adds its code', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4")');
  await expect(nodes(page)).toHaveCount(1);
  await addFromPlus(page, 'code');
  await expect(nodes(page)).toHaveCount(2);
  await expect(editor(page)).toContainText('$: (n("<[0,2,4,6] [5,7,9,11]>")');
});

test('invalid code keeps the canvas and explains why', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4").gain(');
  await expect(page.getByRole('status')).toContainText(
    'The canvas keeps the last valid version',
  );
  await expect(nodes(page)).toHaveCount(3);
});

test('Ctrl+B hides and shows the console, and it stays as left', async ({
  page,
}) => {
  await page.locator('.react-flow__pane').click();
  await page.keyboard.press('ControlOrMeta+B');
  await expect(editor(page)).toBeHidden();
  await page.reload();
  await expect(editor(page)).toBeHidden();
  await page.getByRole('button', { name: /Show code console/ }).click();
  await expect(editor(page)).toBeVisible();
});

test('Ctrl+Enter plays and Ctrl+. stops', async ({ page }) => {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+.');
  await expect(page.getByRole('button', { name: /^Play \(/ })).toBeVisible();
});

test('Ctrl+Enter stops when playing, but applies new code first', async ({
  page,
}) => {
  await typeCode(page, 'kick: s("bd*4")');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  // New code while playing: Ctrl+Enter applies it and keeps playing.
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText('.gain(0.5)');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(nodeOfType(page, 'level-node')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  // Nothing new: Ctrl+Enter stops.
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('button', { name: /^Play \(/ })).toBeVisible();
});

test('the console has its own play and stop button', async ({ page }) => {
  const console = page.getByRole('region', { name: 'Code console' });
  await console.getByRole('button', { name: 'Play code' }).click();
  await expect(console.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await console.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: /^Play \(/ })).toBeVisible();
});
