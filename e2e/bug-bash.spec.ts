import { expect, test, type Page } from './fixtures';
import {
  addFromPlus,
  editor,
  nodeOfType,
  nodes,
  openFresh,
  typeCode,
} from './helpers';

/**
 * A long session on a real song, the way a person works: play, edit in
 * code and on the canvas, switch parts of a stack off, save and insert a
 * preset, auto-arrange, undo and redo, reload, export and import. After
 * every step the song must be consistent: no errors (the fixture fails on
 * any), the code parses, and the canvas and the code agree after a reload.
 */

/** The app's own view of itself: code, its error, node count. */
const state = (page: Page) =>
  page.evaluate(async () => {
    const path = '/src/store/app-store.ts';
    const { useAppStore } = (await import(/* @vite-ignore */ path)) as {
      useAppStore: {
        getState: () => {
          code: string;
          codeError: string | null;
          nodes: unknown[];
          isPlaying: boolean;
        };
      };
    };
    const { code, codeError, nodes, isPlaying } = useAppStore.getState();
    return { code, codeError, nodes: nodes.length, isPlaying };
  });

async function consistent(page: Page, step: string) {
  const now = await state(page);
  expect(now.codeError, `${step}: the code parses`).toBeNull();
  await expect(page.getByRole('alert'), `${step}: no error shown`).toHaveCount(
    0,
  );
  return now;
}

const DRUMS = `setcpm(130/4)
DRUMS: stack(
  s("bd*4").bank("RolandTR909").gain(0.9),
  s("[~ hh]*4").bank("RolandTR909").hpf(6000).gain(0.4),
  s("~ cp").bank("RolandTR909").room(0.2)
)._punchcard()
bass: note("<c2 eb2 g1 bb1>*8").s("sawtooth").lpf(600).decay(0.2).gain(0.5)`;

test('bug bash: a long session stays consistent', async ({ page }) => {
  test.setTimeout(120_000);
  await openFresh(page);
  await typeCode(page, DRUMS);
  await consistent(page, 'open');

  // Play.
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await expect.poll(async () => (await state(page)).isPlaying).toBe(true);
  await consistent(page, 'play');

  // Switch the hats part off from its first node, then back on.
  const hats = nodeOfType(page, 'sound-node').filter({
    has: page.locator('input[value="[~ hh]*4"]'),
  });
  await hats.getByRole('button', { name: 'Disable Sound' }).click();
  await expect(editor(page)).toContainText('.gain(0.4).hush()');
  await consistent(page, 'part off');
  await hats.getByRole('button', { name: 'Enable Sound' }).click();
  await expect(editor(page)).not.toContainText('.hush()');

  // A knob on the canvas, then an edit in the code.
  const filter = nodeOfType(page, 'lpf-node');
  await filter.getByRole('slider', { name: 'lpf' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(editor(page)).not.toContainText('.lpf(600)');
  await consistent(page, 'knob');
  const typed = (await state(page)).code.replace('gain(0.5)', 'gain(0.45)');
  await typeCode(page, typed);
  await expect(editor(page)).toContainText('.gain(0.45)');
  await consistent(page, 'code edit');

  // Add a node from the +, then undo and redo it.
  const count = await nodes(page).count();
  await addFromPlus(page, 'delay');
  await expect(nodes(page)).toHaveCount(count + 1);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 500 } });
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(nodes(page)).toHaveCount(count);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(nodes(page)).toHaveCount(count + 1);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(nodes(page)).toHaveCount(count);
  await consistent(page, 'undo/redo');

  // Save the bass as a preset and insert it back as a new line.
  const bassVoice = nodeOfType(page, 'synth-select-node').first();
  await bassVoice
    .getByRole('button', { name: 'Module options' })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Save line as preset' }).click();
  const library = page.getByRole('dialog');
  await library.getByLabel('Preset name').fill('Bash bass');
  await library.getByRole('button', { name: 'Save preset' }).click();
  await library.getByRole('button', { name: 'Insert Bash bass' }).click();
  await page.keyboard.press('Escape');
  await expect(editor(page)).toContainText('bass2:');
  await consistent(page, 'preset');

  // Auto-arrange everything (nothing selected).
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 500 } });
  await page.getByRole('button', { name: /Auto-arrange all tracks/ }).click();
  const arranged = await consistent(page, 'arrange');

  // Reload: the same code and the same nodes come back.
  await page.reload();
  await expect(nodes(page).first()).toBeVisible();
  await expect.poll(async () => (await state(page)).nodes).toBe(arranged.nodes);
  expect((await state(page)).code).toBe(arranged.code);
  await consistent(page, 'reload');

  // Export as .strudel and open it in place of the song.
  await page.getByRole('button', { name: /^Export, share/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save \.strudel/ }).click();
  const file = await (await download).path();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).nodes).toBe(arranged.nodes);
  expect((await state(page)).code).toBe(arranged.code);
  await consistent(page, 'export and import');
});
