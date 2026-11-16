import { expect, test } from './fixtures';
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

test('a line without an Arrange has its mute and solo on its first node', async ({
  page,
}) => {
  await typeCode(
    page,
    [
      'kick: s("bd*4").gain(0.8)',
      'hats: s("hh*8")',
      'drums: stack(s("cp"), s("rim")).room(0.2)',
    ].join('\n'),
  );
  // Each line's first node carries its M and S (found by them: the
  // page's order is not the code's).
  const lineHead = (name: string) =>
    nodeOfType(page, 'sound-node').filter({
      has: page.getByRole('button', { name: `Mute ${name}` }),
    });
  const kick = lineHead('kick');
  const hats = lineHead('hats');
  const drums = lineHead('drums');
  await expect(kick.getByRole('textbox', { name: 'sounds' })).toHaveValue(
    'bd*4',
  );
  await expect(hats.getByRole('textbox', { name: 'sounds' })).toHaveValue(
    'hh*8',
  );
  // In a stack, only the first part's instrument.
  await expect(drums).toHaveCount(1);
  await expect(drums.getByRole('textbox', { name: 'sounds' })).toHaveValue(
    'cp',
  );
  await expect(drums.getByRole('button', { name: /^Disable/ })).toHaveAttribute(
    'title',
    /this part of the stack/,
  );
  await expect(kick.getByRole('button', { name: /^Disable/ })).toHaveAttribute(
    'title',
    /whole line/,
  );

  // Solo: the other lines go gray, as muted and switched-off ones do.
  await kick.getByRole('button', { name: 'Solo kick' }).click();
  await expect(editor(page)).toContainText('Skick: s("bd*4")');
  await expect(hats.locator('> div')).toHaveAttribute('data-muted', 'true');
  await expect(kick.locator('> div')).not.toHaveAttribute('data-muted');
  await kick.getByRole('button', { name: 'Solo kick' }).click();
  await expect(hats.locator('> div')).not.toHaveAttribute('data-muted');

  // Mute from the line's first node, and back.
  await hats.getByRole('button', { name: 'Mute hats' }).click();
  await expect(editor(page)).toContainText('_hats: s("hh*8")');
  await expect(hats.locator('> div')).toHaveAttribute('data-muted', 'true');
  await hats.getByRole('button', { name: 'Mute hats' }).click();
  await expect(editor(page)).not.toContainText('_hats');
});
