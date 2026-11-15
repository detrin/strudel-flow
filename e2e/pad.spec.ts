import { expect, test, type Page } from './fixtures';
import { editor, nodeOfType, openFresh, trackErrors } from './helpers';

/** The default patch's Pad, cleared, with a helper to point at cells. */
async function emptyPad(page: Page) {
  await openFresh(page);
  const pad = nodeOfType(page, 'pad-node');
  await pad.getByRole('button', { name: 'Clear' }).click();
  await pad.getByLabel('Grid').selectOption('16');
  const roll = pad.getByRole('grid');
  // Three octaves, so the degrees used below are all on screen.
  await pad.getByLabel('Highest octave').selectOption('1');
  const box = (await roll.boundingBox())!;
  const low = Number(await roll.getAttribute('data-low'));
  const high = Number(await roll.getAttribute('data-high'));
  const cell = box.width / 16;
  const row = box.height / (high - low + 1);
  /** Page coordinates of a cell (column, scale degree), `at` 0..1 across. */
  const point = (col: number, pitch: number, at = 0.5) => ({
    x: box.x + (col + at) * cell,
    y: box.y + (high - pitch + 0.5) * row,
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

test('the octaves shown can be chosen, lowest never above highest', async ({
  page,
}) => {
  await openFresh(page);
  const pad = nodeOfType(page, 'pad-node');
  const roll = pad.getByRole('grid');
  await expect(roll).toHaveAttribute('data-low', '0');
  await expect(roll).toHaveAttribute('data-high', '7');
  await pad.getByLabel('Lowest octave').selectOption('-1');
  await expect(roll).toHaveAttribute('data-low', '-7');
  await pad.getByLabel('Highest octave').selectOption('2');
  await expect(roll).toHaveAttribute('data-high', '21');
  // The lowest octave cannot go above the highest, nor the other way round.
  const lowest = await pad
    .getByLabel('Lowest octave')
    .locator('option')
    .allTextContents();
  expect(lowest).toEqual(['-3', '-2', '-1', '0', '+1', '+2']);
  await pad.getByLabel('Lowest octave').selectOption('2');
  const highest = await pad
    .getByLabel('Highest octave')
    .locator('option')
    .allTextContents();
  expect(highest).toEqual(['+2', '+3']);
});
