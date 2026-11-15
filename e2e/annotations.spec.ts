import { expect, test } from '@playwright/test';
import { editor, openFresh, settle, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('notes and frames sit on the canvas and live in the code', async ({
  page,
}) => {
  await typeCode(page, 'kick: s("bd*4")');
  await page.getByRole('button', { name: 'Add a note' }).click();
  const note = page.getByRole('textbox', { name: 'Note' });
  await note.fill('drop at bar 17');
  await note.blur();
  await expect(editor(page)).toContainText(
    /\/\/ @note -?\d+,-?\d+ "drop at bar 17"/,
  );

  await page.getByRole('button', { name: 'Add a frame' }).click();
  await expect(editor(page)).toContainText(
    /\/\/ @frame -?\d+,-?\d+,1200,700 "Frame"/,
  );
  const name = page.getByRole('textbox', { name: 'Frame name' });
  await name.fill('drums');
  await name.press('Enter');
  await expect(editor(page)).toContainText('"drums"');

  // Code typed in brings its notes and frames.
  await typeCode(
    page,
    '// @frame 0,0,900,500 "drop"\n// @note 40,600 "louder"\nkick: s("bd*4")',
  );
  await settle(page);
  await expect(page.getByRole('textbox', { name: 'Frame name' })).toHaveValue(
    'drop',
  );
  await expect(page.getByRole('textbox', { name: 'Note' })).toHaveValue(
    'louder',
  );
  // Dragging a note writes its new place.
  await page.getByRole('button', { name: 'Fit patch' }).click();
  await settle(page);
  const box = (await page.locator('[data-annotation="note"]').boundingBox())!;
  await page.mouse.move(box.x + box.width - 4, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 100, box.y + 103, { steps: 5 });
  await page.mouse.up();
  await expect(editor(page)).not.toContainText('@note 40,600');
  await expect(editor(page)).toContainText('"louder"');
});
