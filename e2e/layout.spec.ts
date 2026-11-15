import { expect, test, type Locator } from './fixtures';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

/** A node's canvas position, from React Flow's transform. */
const position = async (node: Locator) => {
  const transform = await node.evaluate((el) => el.style.transform);
  const [x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/
    .exec(transform)!
    .slice(1)
    .map(Number);
  return { x, y };
};

test('node positions live in the code and survive a save', async ({
  page,
  browser,
}) => {
  await openFresh(page);
  await typeCode(page, '// @layout 0,0 400,40\nkick: s("bd*4").gain(1)');
  const level = nodeOfType(page, 'level-node');
  expect(await position(level)).toEqual({ x: 400, y: 40 });

  // Dragging a node rewrites its line's layout comment. Wait for the
  // canvas to finish fitting the new nodes into view before grabbing one.
  const header = level.locator('header');
  await expect
    .poll(async () => {
      const before = JSON.stringify(await header.boundingBox());
      await page.waitForTimeout(100);
      return before === JSON.stringify(await header.boundingBox());
    })
    .toBe(true);
  const box = (await header.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 110, { steps: 8 });
  await page.mouse.up();
  const moved = await position(level);
  expect(moved.x).toBeGreaterThan(400);
  await expect(editor(page)).toContainText(
    `// @layout 0,0 ${Math.round(moved.x)},${Math.round(moved.y)}`,
  );

  // Save .strudel, open it in a fresh browser: same nodes, same places.
  await page.getByRole('button', { name: /^Export, share/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save \.strudel/ }).click();
  const file = await (await download).path();

  const fresh = await browser.newPage();
  await openFresh(fresh);
  await fresh.getByRole('button', { name: /^Export, share/ }).click();
  await fresh.locator('input[type=file]').setInputFiles(file);
  const reopened = nodeOfType(fresh, 'level-node');
  await expect(reopened).toHaveCount(1);
  // The code keeps whole pixels.
  expect(await position(reopened)).toEqual({
    x: Math.round(moved.x),
    y: Math.round(moved.y),
  });
  await expect(editor(fresh)).toContainText('kick: s("bd*4")');
});
