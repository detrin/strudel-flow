import { expect, test } from '@playwright/test';
import { openFresh } from './helpers';

const background = (page: import('@playwright/test').Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);

test('the default strudel theme paints the app and the editor', async ({
  page,
}) => {
  await openFresh(page);
  expect(await background(page, 'body')).toBe('rgb(34, 34, 34)');
  expect(await background(page, '.cm-editor')).toBe('rgb(34, 34, 34)');
});

test('choosing Blue Screen recolours everything and is remembered', async ({
  page,
}) => {
  await openFresh(page);
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('button', { name: /Blue Screen$/ }).click();
  expect(await background(page, 'body')).toBe('rgb(5, 29, 181)');
  expect(await background(page, '.cm-editor')).toBe('rgb(5, 29, 181)');
  await page.reload();
  expect(await background(page, 'body')).toBe('rgb(5, 29, 181)');
});
