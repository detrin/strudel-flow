import { expect, type Page } from '@playwright/test';

export const editor = (page: Page) => page.locator('.cm-content');
export const nodes = (page: Page) => page.locator('.react-flow__node');
export const nodeOfType = (page: Page, type: string) =>
  page.locator(`.react-flow__node-${type}`);

/** Replaces the console's code, the way a user pastes a program. */
export async function typeCode(page: Page, code: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(code);
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
  await page.goto('/?bridge=off');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?bridge=off');
  await expect(nodes(page).first()).toBeVisible();
}
