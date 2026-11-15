import { expect, test, type Page } from './fixtures';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

/** Page coordinates of a cell in the Notes roll (column, MIDI pitch). */
async function cells(page: Page) {
  const roll = nodeOfType(page, 'notes-node').getByRole('grid');
  const box = (await roll.boundingBox())!;
  const low = Number(await roll.getAttribute('data-low'));
  const high = Number(await roll.getAttribute('data-high'));
  const cols = Number(
    await nodeOfType(page, 'notes-node').getByLabel('Grid').inputValue(),
  );
  return (col: number, pitch: number) => ({
    x: box.x + ((col + 0.5) * box.width) / cols,
    y: box.y + ((high - pitch + 0.5) * box.height) / (high - low + 1),
  });
}

test('a fast arpeggio shows as notes on every semitone', async ({ page }) => {
  await typeCode(page, 'ARP: note("<e4 d#4 b3 e3 d#3 b2>".fast(32))');
  const notes = nodeOfType(page, 'notes-node');
  await expect(notes.locator('[data-note]')).toHaveCount(32);
  await expect(notes.getByLabel('Grid')).toHaveValue('32');
  // Rows from octave 2 to 4: every semitone, named.
  await expect(notes.getByText('d#4', { exact: true })).toBeVisible();
  await expect(notes.getByText('c#3', { exact: true })).toBeVisible();
});

test('drawing notes writes them as code, chords included', async ({ page }) => {
  await typeCode(page, 'lead: note("~")');
  await page.waitForTimeout(600);
  const at = await cells(page);
  // C3 and E3 in the same column: a chord.
  for (const pitch of [48, 52]) {
    const { x, y } = at(0, pitch);
    await page.mouse.click(x, y);
  }
  await expect(editor(page)).toContainText('lead: note("[c3,e3] ~@15")');
  // F#3 (a black key) later on.
  const { x, y } = at(8, 54);
  await page.mouse.click(x, y);
  await expect(editor(page)).toContainText('note("[c3,e3] ~@7 f#3 ~@7")');
});
