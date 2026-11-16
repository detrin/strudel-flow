import { test, expect, type Page, type Locator } from './fixtures';
import { nodeOfType, openFresh, settle, typeCode } from './helpers';

// Two-finger scrolling pans the canvas everywhere, also over parts of a
// node that would scroll on their own (code boxes, the Arrange grid, the
// piano roll) when they have nothing to scroll: the pan must not stop
// there, and the page itself must never scroll.

const viewportStyle = (page: Page) =>
  page.locator('.react-flow__viewport').getAttribute('style');

async function wheelOver(page: Page, target: Locator, dx: number, dy: number) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(dx, dy);
}

const pageScroll = (page: Page) =>
  page.evaluate(() => ({
    doc: document.scrollingElement?.scrollTop ?? 0,
    left: document.scrollingElement?.scrollLeft ?? 0,
  }));

test.beforeEach(async ({ page }) => {
  await openFresh(page);
  await typeCode(page, 'a: note(81.25).sound("sine").mask("<1!4 0!4>")');
  await settle(page);
});

test('scrolling over a Code node box pans the canvas', async ({ page }) => {
  const box = nodeOfType(page, 'custom-node').locator('textarea');
  const before = await viewportStyle(page);
  await wheelOver(page, box, 0, 120);
  await expect.poll(() => viewportStyle(page)).not.toBe(before);
  expect(await pageScroll(page)).toEqual({ doc: 0, left: 0 });
});

test('scrolling over the Arrange grid pans the canvas', async ({ page }) => {
  const grid = nodeOfType(page, 'arrange-node').locator('.nowheel').first();
  const before = await viewportStyle(page);
  await wheelOver(page, grid, 60, 120);
  await expect.poll(() => viewportStyle(page)).not.toBe(before);
  expect(await pageScroll(page)).toEqual({ doc: 0, left: 0 });
});

test('a box with more text than fits still scrolls itself', async ({
  page,
}) => {
  const box = nodeOfType(page, 'custom-node').locator('textarea').first();
  await box.evaluate((el: HTMLTextAreaElement) => {
    el.style.height = '40px';
    el.value = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
  });
  const before = await viewportStyle(page);
  await wheelOver(page, box, 0, 80);
  await expect
    .poll(() => box.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await viewportStyle(page)).toBe(before);
  // At its end the pan takes over again instead of scrolling the page.
  await box.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await wheelOver(page, box, 0, 80);
  await expect.poll(() => viewportStyle(page)).not.toBe(before);
  expect(await pageScroll(page)).toEqual({ doc: 0, left: 0 });
});
