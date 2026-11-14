import { expect, test } from '@playwright/test';

test('app loads the default patch and starts playing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await page.getByRole('button', { name: /play/i }).first().click();
  await expect(
    page.getByRole('button', { name: /pause/i }).first(),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});
