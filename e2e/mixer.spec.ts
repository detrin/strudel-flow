import { expect, test } from '@playwright/test';
import { editor, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('the mixer shows every line with level, mute and solo', async ({
  page,
}) => {
  await typeCode(
    page,
    ['kick: s("bd*4").gain(1)', 'hats: s("hh*8")', 'bass: note("c2")'].join(
      '\n',
    ),
  );
  await page.getByRole('button', { name: 'Mixer' }).click();
  const mixer = page.getByRole('region', { name: 'Mixer' });
  await expect(mixer.locator('[data-strip]')).toHaveCount(3);

  const kick = mixer.getByRole('slider', { name: 'kick gain' });
  await kick.focus();
  await page.keyboard.press('ArrowDown');
  await expect(editor(page)).toContainText('.gain(0.99)');

  await mixer.getByRole('button', { name: 'Add a Level to hats' }).click();
  await expect(editor(page)).toContainText('.gain(0.8)');
  await expect(mixer.getByRole('slider', { name: 'hats gain' })).toBeVisible();

  await mixer.getByRole('button', { name: 'Solo bass' }).click();
  await expect(editor(page)).toContainText('Sbass: note("c2")');
  await mixer.getByRole('button', { name: 'Mute kick' }).click();
  await expect(editor(page)).toContainText('_kick: s("bd*4")');

  await mixer.getByRole('button', { name: 'Close mixer' }).click();
  await expect(mixer).toHaveCount(0);
});
