import { expect, test } from './fixtures';
import {
  editor,
  nodeOfType,
  openFresh,
  trackErrors,
  typeCode,
} from './helpers';

test('drum machines from strudel.cc load and play', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await typeCode(page, 'kick: s("bd*4").bank("RolandTR909")');
  await expect(nodeOfType(page, 'bank-node')).toHaveCount(1);
  await expect(nodeOfType(page, 'bank-node').getByRole('combobox')).toHaveValue(
    'RolandTR909',
  );

  const sample = page.waitForResponse(
    (response) => /RolandTR909.*bd/i.test(response.url()) && response.ok(),
    { timeout: 20_000 },
  );
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await sample;
  await expect(page.getByRole('alert')).toHaveCount(0);
  errors.expectNone();
});

test('changing the bank on the canvas rewrites the code', async ({ page }) => {
  await openFresh(page);
  await typeCode(page, 'kick: s("bd*4").bank("RolandTR909")');
  await nodeOfType(page, 'bank-node')
    .getByRole('combobox')
    .selectOption('RolandTR808');
  await expect(editor(page)).toContainText('.bank("RolandTR808")');
});
