import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('disabling an effect comments out its code', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4").lpf(800).gain(0.5)');
  const filter = nodeOfType(page, 'lpf-node');
  await filter.getByRole('button', { name: 'Disable Filter' }).click();
  await expect(editor(page)).toContainText('// .lpf(800)');
  await expect(editor(page)).toContainText('.gain(0.5)');
  // Still on the canvas, dimmed; enabling brings the code back.
  await expect(filter.locator('> div')).toHaveAttribute(
    'data-disabled',
    'true',
  );
  await filter.getByRole('button', { name: 'Enable Filter' }).click();
  await expect(editor(page)).not.toContainText('// .lpf(800)');
});

test('disabling the first node switches off the whole line', async ({
  page,
}) => {
  await typeCode(page, 'kick: s("bd*4").gain(0.5)\nhat: s("hh*8")');
  const kick = nodeOfType(page, 'sound-node').first();
  await kick.getByRole('button', { name: 'Disable Sound' }).click();
  await expect(editor(page)).toContainText('// kick: s("bd*4")//   .gain(0.5)');
  await expect(editor(page)).toContainText('hat: s("hh*8")');
  // The whole kick line looks off.
  await expect(nodeOfType(page, 'level-node').locator('> div')).toHaveAttribute(
    'data-disabled',
    'true',
  );
  // Typing it back uncommented turns it on again.
  await kick.getByRole('button', { name: 'Enable Sound' }).click();
  await expect(editor(page)).toContainText('kick: s("bd*4")');
  await expect(editor(page)).not.toContainText('// kick');
});
