import { expect, test } from './fixtures';
import { editor, openFresh, trackErrors, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

/** What strudel.cc songs (DJ_Dave's "Await") use beyond plain patterns. */
const SONG = `const BPM = 81
setcpm(BPM/4)
const vol = slider(0.35, 0, 1)

CHOP: s("hh*8").lpf(slider(8000, 400, 10000))
  .o(2).room(0.2)
  ._punchcard()

BASS: note("a2 e2").sound("gm_pad_halo").o(2)

all(x => x.postgain(vol))
`;

test('a strudel.cc song plays: sliders, .o, soundfonts, punchcards', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const missing: string[] = [];
  page.on('console', (message) => {
    if (/not found/.test(message.text())) missing.push(message.text());
  });
  await typeCode(page, SONG);
  // setcpm(BPM/4) with const BPM = 81 is 81 BPM.
  await expect(page.getByLabel('Tempo in beats per minute')).toHaveValue('81');
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await expect(page.locator('canvas[data-punchcard="CHOP"]')).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(missing).toEqual([]);
  errors.expectNone();
});

test('the toolbar tempo and a tempo constant stay in step', async ({
  page,
}) => {
  await typeCode(page, 'const BPM = 81\nsetcpm(BPM/4)\nkick: s("bd*4")');
  const tempo = page.getByLabel('Tempo in beats per minute');
  await expect(tempo).toHaveValue('81');
  await tempo.fill('100');
  await expect(editor(page)).toContainText('const BPM = 100');
  await expect(editor(page)).toContainText('setcpm(BPM/4)');
});

test('code folds like in VS Code', async ({ page }) => {
  await typeCode(page, 'kick: s("bd*4")\n  .gain(0.8)\n  .room(0.2)\n');
  await expect(editor(page)).toContainText('.room(0.2)');
  await page.locator('.cm-foldGutter [title="Fold line"]').first().click();
  await expect(editor(page)).not.toContainText('.room(0.2)');
  await expect(page.locator('.cm-foldPlaceholder')).toBeVisible();
  await page.locator('.cm-foldPlaceholder').click();
  await expect(editor(page)).toContainText('.room(0.2)');
});
