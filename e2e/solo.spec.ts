import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test("a line's header mutes and solos it, as Strudel writes them", async ({
  page,
}) => {
  await typeCode(
    page,
    ['kick: s("bd*4").mask("<1 1 0 1>")', 'hats: s("hh*8").mask("<1 0>")'].join(
      '\n',
    ),
  );
  const kick = nodeOfType(page, 'arrange-node').first();
  await kick.getByRole('button', { name: 'Solo kick' }).click();
  await expect(editor(page)).toContainText('Skick: s("bd*4")');
  await expect(kick.getByRole('button', { name: 'Solo kick' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Another solo replaces it; Cmd/Ctrl-click adds to it.
  const hats = nodeOfType(page, 'arrange-node').nth(1);
  await hats.getByRole('button', { name: 'Solo hats' }).click();
  await expect(editor(page)).toContainText('kick: s("bd*4")');
  await expect(editor(page)).toContainText('Shats: s("hh*8")');
  await kick
    .getByRole('button', { name: 'Solo kick' })
    .click({ modifiers: ['ControlOrMeta'] });
  await expect(editor(page)).toContainText('Skick:');
  await expect(editor(page)).toContainText('Shats:');
  await hats.getByRole('button', { name: 'Mute hats' }).click();
  await expect(editor(page)).toContainText('_Shats: s("hh*8")');
  // Typed code reads back: the header follows.
  await typeCode(page, 'Skick: s("bd*4").mask("<1 0>")');
  await expect(
    nodeOfType(page, 'arrange-node').getByRole('button', { name: 'Solo kick' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
