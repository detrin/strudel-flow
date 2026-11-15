import { test as base, expect, type Page } from '@playwright/test';

/**
 * Playwright's test, failing any test whose pages hit an error: an uncaught
 * exception, or anything the app reports (`[strudelton] …` in the console:
 * code sync, playback, listeners, crashes). A test that provokes errors on
 * purpose opts out with `test.use({ allowErrors: true })`.
 */
export const test = base.extend<{ allowErrors: boolean; noErrors: void }>({
  allowErrors: [false, { option: true }],
  noErrors: [
    async ({ context, allowErrors }, use) => {
      const errors: string[] = [];
      const watch = (page: Page) => {
        page.on('pageerror', (error) =>
          errors.push(`uncaught: ${error.message}`),
        );
        page.on('console', (message) => {
          if (
            message.type() === 'error' &&
            message.text().startsWith('[strudelton]')
          )
            errors.push(message.text());
        });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use();
      if (!allowErrors) expect(errors, 'errors in the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
export type { Locator, Page } from '@playwright/test';
