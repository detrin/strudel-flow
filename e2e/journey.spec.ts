import { expect, test, type Page } from '@playwright/test';
import {
  addFromPlus,
  editor,
  nodeOfType,
  nodes,
  openFresh,
  trackErrors,
} from './helpers';

async function openUndertow(page: Page) {
  await page.getByRole('button', { name: /^Export, share/ }).click();
  await page.getByText('Community patches').click();
  await page.getByRole('button', { name: /Load Undertow/ }).click();
  await page.keyboard.press('Escape');
  await expect(nodes(page)).toHaveCount(61);
}
/** The Sound node playing the mini-notation `pattern`. */
const soundNode = (page: Page, pattern: string) =>
  nodeOfType(page, 'sound-node').filter({
    has: page.locator(`input[value="${pattern}"]`),
  });

test('a whole song: open, play, mix, rewire, undo, share', async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await openUndertow(page);
  await expect(editor(page)).toContainText('kick: n("0*4")');
  await expect(page.getByLabel('Tempo in beats per minute')).toHaveValue('132');

  // Play: the 909 kit loads and nothing fails.
  const kit = page.waitForResponse(
    (response) => /RolandTR909/.test(response.url()) && response.ok(),
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await kit;
  await page.waitForTimeout(1000);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Mix: switch the hats line off from its source node.
  await soundNode(page, '[~ hh]*4')
    .getByRole('button', { name: 'Disable Sound' })
    .click();
  await expect(editor(page)).toContainText('// hats: s("[~ hh]*4")');

  // Rewire: a new Level node wired after the kick's last node joins its line.
  const before = await nodeOfType(page, 'level-node').count();
  await addFromPlus(page, 'level');
  await expect(nodeOfType(page, 'level-node')).toHaveCount(before + 1);
  const added = nodeOfType(page, 'level-node').last();
  const kickArrange = nodeOfType(page, 'arrange-node').first();
  await added.getByRole('slider', { name: 'gain', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  // The whole song in view, so both ends of the new wire are on screen.
  await page.getByRole('button', { name: 'Fit patch' }).click();
  await page.waitForTimeout(400);
  await kickArrange
    .locator('.react-flow__handle.source')
    .dragTo(added.locator('.react-flow__handle.target'));
  await expect(editor(page)).toContainText(
    // CodeMirror's text joins lines without newlines.
    '.mask("<1!32 0!8 1!24>")  .gain(0.79)',
  );

  // Undo: delete the stab's Delay node, then bring it back.
  const delays = nodeOfType(page, 'delay-node');
  const delayCount = await delays.count();
  await delays.last().locator('header').click();
  await page.keyboard.press('Backspace');
  await expect(delays).toHaveCount(delayCount - 1);
  await expect(editor(page)).not.toContainText('.delayfeedback(0.6)');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 500 } });
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(delays).toHaveCount(delayCount);
  await expect(editor(page)).toContainText('.delayfeedback(0.6)');

  // Share: the link opens the same song somewhere else.
  await page.getByRole('button', { name: /^Export, share/ }).click();
  const link = await page
    .getByRole('textbox', { name: 'Shareable patch link' })
    .inputValue();
  const code = (await editor(page).textContent()) ?? '';
  const elsewhere = await context.newPage();
  await elsewhere.goto(link);
  await expect(nodes(elsewhere)).toHaveCount(62);
  await expect(editor(elsewhere)).toHaveText(code);
  errors.expectNone();
});
