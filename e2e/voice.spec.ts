import { expect, test } from './fixtures';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('a voice with layered sounds shows every layer', async ({ page }) => {
  await typeCode(
    page,
    'bass: note("a2").sound("[gm_pad_halo, square, supersaw, sine]")',
  );
  const voice = nodeOfType(page, 'synth-select-node');
  await expect(voice.getByRole('listitem')).toHaveText([
    'gm_pad_halo',
    'square',
    'supersaw',
    'sine',
  ]);
  await expect(
    voice.getByRole('button', { name: 'Square', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(voice.getByLabel('Voice as code')).toHaveValue(
    '[gm_pad_halo, square, supersaw, sine]',
  );
});

test('shift+click layers a waveform, × removes a layer', async ({ page }) => {
  await typeCode(page, 'lead: note("c4").sound("square")');
  await page.waitForTimeout(600);
  const voice = nodeOfType(page, 'synth-select-node');
  await voice
    .getByRole('button', { name: 'Saw' })
    .click({ modifiers: ['Shift'] });
  await expect(editor(page)).toContainText('.sound("[square, sawtooth]")');
  await voice.getByRole('button', { name: 'Remove square' }).click();
  await expect(editor(page)).toContainText('.sound("sawtooth")');
});

test('a patterned voice is shown and edited as code', async ({ page }) => {
  await typeCode(page, 'lead: note("c4").sound("<sine square>")');
  const voice = nodeOfType(page, 'synth-select-node');
  await expect(voice.getByLabel('Voice as code')).toHaveValue('<sine square>');
});
