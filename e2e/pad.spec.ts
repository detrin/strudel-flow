import { expect, test, type Page } from '@playwright/test';
import { editor, nodeOfType, openFresh, trackErrors } from './helpers';

const ROWS = 15;

/** The default patch's Pad, cleared, with a helper to point at cells. */
async function emptyPad(page: Page) {
  await openFresh(page);
  const pad = nodeOfType(page, 'pad-node');
  await pad.getByRole('button', { name: 'Clear' }).click();
  await pad.getByLabel('Grid').selectOption('16');
  const roll = pad.getByRole('grid');
  const box = (await roll.boundingBox())!;
  const cell = box.width / 16;
  const row = box.height / ROWS;
  /** Page coordinates of a cell (column, scale degree), `at` 0..1 across. */
  const point = (col: number, pitch: number, at = 0.5) => ({
    x: box.x + (col + at) * cell,
    y: box.y + (ROWS - 1 - pitch + 0.5) * row,
  });
  const drag = async (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  };
  return { roll, point, drag };
}

const padCode = (page: Page) => editor(page);

test('notes drawn in one column play together', async ({ page }) => {
  const errors = trackErrors(page);
  const { point } = await emptyPad(page);
  for (const pitch of [0, 2, 4]) {
    const { x, y } = point(0, pitch);
    await page.mouse.click(x, y);
  }
  await expect(padCode(page)).toContainText('n("[0,2,4] ~@15")');
  errors.expectNone();
});

test('drag to draw a long note, resize it, move it, click to delete', async ({
  page,
}) => {
  const { point, drag } = await emptyPad(page);
  // Draw: columns 4-7 is a note 4 sixteenths long (written in quarters).
  await drag(point(4, 3), point(7, 3));
  await expect(padCode(page)).toContainText('n("~ 3 ~@2")');
  // Resize: its right edge to the end of column 11.
  await drag(point(7, 3, 0.95), point(11, 3));
  await expect(padCode(page)).toContainText('n("~ 3@2 ~")');
  // Move: grab the middle, two columns left and two degrees up.
  await drag(point(8, 3), point(6, 5));
  await expect(padCode(page)).toContainText('n("~ 5@4 ~@3")');
  // Click (no drag) deletes it.
  const { x, y } = point(5, 5);
  await page.mouse.click(x, y);
  await expect(padCode(page)).not.toContainText('n("');
});

test('a clip can span several bars', async ({ page }) => {
  const pad = nodeOfType(page, 'pad-node');
  const { point } = await emptyPad(page);
  const { x, y } = point(0, 0);
  await page.mouse.click(x, y);
  await pad.getByLabel('Bars').selectOption('2');
  await expect(padCode(page)).toContainText('n("[0 ~@31]/2")');
});
