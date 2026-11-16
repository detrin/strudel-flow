import { expect, test } from './fixtures';
import { editor, openFresh } from './helpers';

test('chord progressions: change them, filter by feeling, preview, use', async ({
  page,
}) => {
  await openFresh(page);
  await page
    .getByRole('button', {
      name: 'Library: samples, presets, takes and chords',
    })
    .click();
  const library = page.getByRole('dialog');
  await library.getByRole('tab', { name: 'Chords' }).click();
  await library.getByLabel('Key').selectOption('D');

  const lift = library.locator('[data-progression="lydian-lift"]');
  await expect(lift.locator('[data-chords]')).toHaveText('D – E – G – Bb');

  // A technique changes every progression shown.
  const mario = library.getByRole('button', { name: 'Mario ending' });
  await mario.click();
  await expect(mario).toHaveAttribute('aria-pressed', 'true');
  await expect(lift.locator('[data-chords]')).toHaveText('D – E – G – Bb C');
  await mario.click();
  await library.getByRole('button', { name: 'Key up' }).click();
  await expect(lift.locator('[data-chords]')).toHaveText('E – F# – A – C');
  await library.getByRole('button', { name: 'Key up' }).click();

  // Feelings filter the catalog.
  await library
    .getByLabel('Feelings')
    .getByRole('button', { name: 'triumphant' })
    .click();
  await expect(library.locator('[data-progression="mario"]')).toBeVisible();
  await expect(lift).toHaveCount(0);

  // Preview plays it alone; again stops it.
  await library.getByRole('button', { name: 'Preview Mario cadence' }).click();
  await expect(
    library.getByRole('button', { name: 'Stop Mario cadence' }),
  ).toBeVisible();
  await library.getByRole('button', { name: 'Stop Mario cadence' }).click();
  await expect(
    library.getByRole('button', { name: 'Preview Mario cadence' }),
  ).toBeVisible();

  // Use adds its chords and roots to the song.
  await library.getByRole('button', { name: 'Use Mario cadence' }).click();
  await expect(library.getByRole('status')).toContainText('Added lines');
  await expect(editor(page)).toContainText('chords: note("<');
  await expect(editor(page)).toContainText('roots: note("<38 46 36 38>")');
});
