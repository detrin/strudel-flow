import { expect, test } from '@playwright/test';
import { editor, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('the address stays clean, and a reload keeps the patch', async ({
  page,
}) => {
  await typeCode(page, 'kick: s("bd*4").gain(0.7)');
  await page.waitForTimeout(500);
  expect(page.url()).not.toContain('patch=');
  await page.reload();
  await expect(editor(page)).toContainText('kick: s("bd*4")');
  expect(page.url()).not.toContain('patch=');
});

test('a share link opens its patch, then the address is plain', async ({
  page,
  context,
}) => {
  await typeCode(page, 'hat: s("hh*8").gain(0.4)');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Export, share/ }).click();
  const link = await page
    .getByRole('textbox', { name: 'Shareable patch link' })
    .inputValue();
  expect(link).toContain('#patch=');
  const elsewhere = await context.newPage();
  await elsewhere.goto(link);
  await expect(editor(elsewhere)).toContainText('hat: s("hh*8")');
  await expect.poll(() => elsewhere.url()).not.toContain('patch=');
});
