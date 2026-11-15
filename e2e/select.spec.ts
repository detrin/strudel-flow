import { expect, test, type Locator, type Page } from './fixtures';
import { editor, nodes, openFresh, settle, typeCode } from './helpers';

const position = async (node: Locator) => {
  const transform = await node.evaluate((el) => el.style.transform);
  const [x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/
    .exec(transform)!
    .slice(1)
    .map(Number);
  return { x, y };
};

/** A left-button drag between two screen points. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  button: 'left' | 'middle' = 'left',
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up({ button });
}

const CODE = [
  '// @layout 0,0 300,0',
  'kick: s("bd*4").gain(1)',
  '// @layout 0,300 300,300',
  'hats: s("hh*8").gain(0.5)',
].join('\n');

test('dragging empty canvas selects like Miro; the selection moves together', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(page, CODE);
  const all = nodes(page);
  await expect(all).toHaveCount(4);

  // A box around everything, from empty space above-left of the nodes.
  const boxes = await Promise.all(
    (await all.all()).map(async (node) => (await node.boundingBox())!),
  );
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  await drag(
    page,
    { x: left - 30, y: top - 30 },
    { x: right + 10, y: bottom + 10 },
  );
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(4);

  // Dragging one selected node moves them all, and every line's layout
  // comment follows.
  const before = await Promise.all((await all.all()).map(position));
  const header = all.first().locator('header');
  const grip = (await header.boundingBox())!;
  await drag(
    page,
    { x: grip.x + 20, y: grip.y + 10 },
    { x: grip.x + 120, y: grip.y + 60 },
  );
  const after = await Promise.all((await all.all()).map(position));
  const dx = after[0].x - before[0].x;
  const dy = after[0].y - before[0].y;
  expect(dx).toBeGreaterThan(50);
  after.forEach((point, index) => {
    expect(point.x - before[index].x).toBeCloseTo(dx, 0);
    expect(point.y - before[index].y).toBeCloseTo(dy, 0);
  });
  await expect(editor(page)).not.toContainText('@layout 0,0 300,0');
  await expect(editor(page)).not.toContainText('@layout 0,300 300,300');

  // A box touching only the hats line selects just its nodes.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 500 } });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  const hats = await Promise.all(
    (await all.all()).slice(2).map(async (node) => (await node.boundingBox())!),
  );
  await drag(
    page,
    { x: hats[0].x - 20, y: hats[0].y + hats[0].height + 20 },
    { x: hats[1].x + 20, y: hats[1].y + 20 },
  );
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);

  // Shift + click adds a node to the selection.
  await all
    .first()
    .locator('header')
    .click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(3);
});

test('the middle mouse button pans', async ({ page }) => {
  await openFresh(page);
  await typeCode(page, CODE);
  const viewport = page.locator('.react-flow__viewport');
  const before = await viewport.getAttribute('style');
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  const start = { x: pane.x + pane.width - 60, y: pane.y + pane.height - 60 };
  await drag(page, start, { x: start.x - 200, y: start.y - 100 }, 'middle');
  await settle(page);
  expect(await viewport.getAttribute('style')).not.toBe(before);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
});
