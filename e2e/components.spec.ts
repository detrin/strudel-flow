import { expect, test } from '@playwright/test';
import { editor, nodeOfType, nodes, openFresh, typeCode } from './helpers';

const ARP = `ARP: note("<e4 d#4 b3 e3 d#3 b2>".fast(32)).sound("[square, supersaw]")
  .sometimes(x => x.trans("<12>"))
  .detune(1).unison(10)
  .o(2).room(1).decay(0.15)
  .lpf("<400!4 800!4 7758!32 900!8 7758!12 600!4>")
  .postgain(0.5)
  ._punchcard()`;

test.beforeEach(async ({ page }) => openFresh(page));

test('a fast arpeggio is all components, no raw code', async ({ page }) => {
  await typeCode(page, ARP);
  for (const type of [
    'notes-node',
    'chance-node',
    'unison-node',
    'output-node',
    'room-node',
    'adsr-node',
    'lpf-node',
    'level-node',
    'punchcard-node',
  ])
    await expect(nodeOfType(page, type)).toHaveCount(1);
  await expect(nodeOfType(page, 'custom-node')).toHaveCount(0);
  await expect(nodeOfType(page, 'method-node')).toHaveCount(0);
  // The filter's cutoff is a pattern, shown as code on the knob.
  await expect(
    nodeOfType(page, 'lpf-node').getByRole('button', { name: /lpf: pattern/ }),
  ).toBeVisible();
});

test('a knob takes a typed pattern, and goes back to a number', async ({
  page,
}) => {
  await typeCode(page, 'kick: s("bd*4").lpf(800)');
  // Let the canvas finish fitting the new nodes into view.
  await page.waitForTimeout(600);
  const filter = nodeOfType(page, 'lpf-node');
  await filter.getByRole('button', { name: '800 Hz' }).click();
  const field = filter.getByLabel('lpf value or pattern');
  await field.fill('<400 1200>');
  await field.press('Enter');
  await expect(editor(page)).toContainText('.lpf("<400 1200>")');
  await filter.getByRole('button', { name: 'lpf: back to a number' }).click();
  await expect(editor(page)).toContainText('.lpf(');
  await expect(editor(page)).not.toContainText('<400 1200>');
  await expect(nodes(page)).toHaveCount(2);
});

test('the punchcard node draws its line while playing', async ({ page }) => {
  await typeCode(page, 'kick: s("bd sd hh cp")._punchcard()');
  await page.getByRole('button', { name: /^Play \(/ }).click();
  const canvas = nodeOfType(page, 'punchcard-node').locator('canvas');
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) => {
        const { data } = el
          .getContext('2d')!
          .getImageData(0, 0, el.width, el.height);
        return data.some((value, i) => i % 4 === 3 && value > 0);
      }),
    )
    .toBe(true);
});
