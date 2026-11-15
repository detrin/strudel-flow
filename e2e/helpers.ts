import { expect, type Page } from '@playwright/test';

export const editor = (page: Page) => page.locator('.cm-content');
export const nodes = (page: Page) => page.locator('.react-flow__node');
export const nodeOfType = (page: Page, type: string) =>
  page.locator(`.react-flow__node-${type}`);

/**
 * Waits until the canvas stops moving: new nodes make it fit them into view
 * (an animation), and clicking or dragging during it misses its target.
 */
export async function settle(page: Page) {
  // Typed code reaches the canvas after the console's 250 ms pause.
  await page.waitForTimeout(300);
  const viewport = page.locator('.react-flow__viewport');
  let last = '';
  await expect
    .poll(
      async () => {
        const now = (await viewport.getAttribute('style')) ?? '';
        const still = now === last;
        last = now;
        return still;
      },
      { intervals: [150], timeout: 5000 },
    )
    .toBe(true);
}

/** Replaces the console's code, the way a user pastes a program. */
export async function typeCode(page: Page, code: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(code);
  await settle(page);
}

/** Fails the test on uncaught page errors. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return {
    expectNone: () => expect(errors).toEqual([]),
  };
}

/** A fresh app that never connects to a real Claude Code session. */
export async function openFresh(page: Page) {
  // The Library in this browser: tests run in parallel and must not share
  // the folder (e2e/library-folder.spec.ts tests the folder).
  await page.goto('/?bridge=off&library=browser');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?bridge=off&library=browser');
  await expect(nodes(page).first()).toBeVisible();
}

/**
 * A spot of empty canvas (relative to the pane): low on it, clear of
 * nodes, wires and panels; searched for when the canvas is full.
 */
export async function emptySpot(page: Page) {
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  const found = await page.evaluate((pane) => {
    for (let y = pane.height - 110; y > 80; y -= 37)
      for (let x = pane.width / 2; x > 60; x -= 53) {
        const hit = document.elementFromPoint(pane.x + x, pane.y + y);
        if (hit?.classList.contains('react-flow__pane')) return { x, y };
      }
    return null;
  }, box);
  return found ?? { x: box.width / 2, y: box.height - 110 };
}

/** The toolbar's +: search every node, pick the first match, place it. */
export async function addFromPlus(page: Page, search: string) {
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search add').fill(search);
  await page.keyboard.press('Enter');
  await page
    .locator('.react-flow__pane')
    .click({ position: await emptySpot(page) });
}
