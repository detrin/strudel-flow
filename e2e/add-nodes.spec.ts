import { expect, test, type Page } from '@playwright/test';
import {
  editor,
  nodeOfType,
  nodes,
  openFresh,
  trackErrors,
  typeCode,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await openFresh(page);
  await typeCode(page, 'kick: s("bd*4").room(0.3)');
  await expect(nodes(page)).toHaveCount(2);
});

/** A spot of empty canvas: low on the pane, clear of nodes and the hint. */
const empty = async (page: Page) => {
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  return { x: box.width / 2, y: box.height - 110 };
};

const pickFromMenu = async (page: Page, category: string, title: string) => {
  await page.getByRole('menuitem', { name: category }).focus();
  await page.getByRole('menuitem', { name: `Add ${title}` }).focus();
  await page.keyboard.press('Enter');
};

test('the "+" on a node splices the next node into its line', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const custom = nodeOfType(page, 'sound-node');
  await custom.hover();
  await page
    .getByRole('button', { name: /Add a node after/ })
    .first()
    .click();
  await pickFromMenu(page, 'Effects', 'Filter');
  await expect(nodes(page)).toHaveCount(3);
  await expect(editor(page)).toContainText(
    /s\("bd\*4"\)\s*\.lpf\(\d+\)\s*\.room\(0\.3\)/,
  );
  // The new node sits to the right of the one it follows.
  const from = (await custom.boundingBox())!;
  const added = (await nodeOfType(page, 'lpf-node').boundingBox())!;
  expect(added.x).toBeGreaterThan(from.x + from.width);
  errors.expectNone();
});

test('Tab on a selected node opens the same menu', async ({ page }) => {
  await nodeOfType(page, 'room-node').locator('h3').click();
  await page.keyboard.press('Tab');
  await pickFromMenu(page, 'Effects', 'Delay');
  await expect(nodes(page)).toHaveCount(3);
  await expect(editor(page)).toContainText(/\.room\(0\.3\)\s*\.delay\(/);
});

test('click a node in the left toolbar, then click the canvas', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Instruments' }).click();
  await page.getByRole('menuitem', { name: 'Place Beats' }).click();
  await expect(page.getByRole('status')).toContainText('Click the canvas');
  await page
    .locator('.react-flow__pane')
    .click({ position: await empty(page) });
  await expect(nodes(page)).toHaveCount(3);
  await expect(nodeOfType(page, 'beat-machine-node')).toHaveCount(1);
  await expect(page.getByText('Click the canvas to place')).toBeHidden();
});

test('Escape cancels placing', async ({ page }) => {
  await page.getByRole('button', { name: 'Effects' }).click();
  await page.getByRole('menuitem', { name: 'Place Delay' }).click();
  await page.keyboard.press('Escape');
  await page
    .locator('.react-flow__pane')
    .click({ position: await empty(page) });
  await expect(nodes(page)).toHaveCount(2);
});

test('drag a node from the left toolbar onto the canvas', async ({ page }) => {
  await page.getByRole('button', { name: 'Instruments' }).click();
  await page
    .getByRole('menuitem', { name: 'Place Chords' })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 500, y: 600 },
    });
  await expect(nodeOfType(page, 'chord-node')).toHaveCount(1);
});

test('double-clicking empty canvas opens the add menu', async ({ page }) => {
  await page
    .locator('.react-flow__pane')
    .dblclick({ position: await empty(page) });
  await pickFromMenu(page, 'Instruments', 'Code');
  await expect(nodes(page)).toHaveCount(3);
});
