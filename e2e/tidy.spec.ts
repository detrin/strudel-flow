import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('Tidy orders the code, stacks order-free effects, Arrange last', async ({
  page,
}) => {
  await typeCode(
    page,
    'kick: s("bd sd").lpf(800).fast(2).gain(0.5).mask("<1 0>")',
  );
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Auto-arrange all tracks/ }).click();
  await expect(editor(page)).toContainText(
    's("bd sd")  .fast(2)  .lpf(800)  .gain(0.5)  .mask("<1 0>")',
  );
  const box = async (type: string) =>
    (await nodeOfType(page, type).boundingBox())!;
  const header = await box('arrange-node');
  const source = await box('sound-node');
  const filter = await box('lpf-node');
  const level = await box('level-node');
  // In code order; the filter and level share one column.
  expect(header.x).toBeGreaterThan(level.x);
  expect(source.x).toBeLessThan(filter.x);
  expect(Math.round(level.x)).toBe(Math.round(filter.x));
  expect(level.y).toBeGreaterThan(filter.y);
  // The header is named after its line.
  await expect(nodeOfType(page, 'arrange-node')).toContainText('kick');
});

/** A node's canvas position, from React Flow's transform. */
const at = async (node: import('@playwright/test').Locator) => {
  const transform = await node.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  const [x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/
    .exec(transform)!
    .slice(1)
    .map(Number);
  return { x, y };
};
/** The Sound node playing `pattern`. */
const sound = (page: import('@playwright/test').Page, pattern: string) =>
  nodeOfType(page, 'sound-node').filter({
    has: page.locator(`input[value="${pattern}"]`),
  });
/** The Level node with `gain` (its gain shows on its knob). */
const levels = (page: import('@playwright/test').Page) =>
  nodeOfType(page, 'level-node');

test('Auto-arrange lines every track up flush left, in code order', async ({
  page,
}) => {
  await typeCode(
    page,
    [
      // Scattered: far apart, the lower one shifted right.
      '// @layout 0,0 300,0',
      'kick: s("bd*4").gain(0.8)',
      '// @layout 900,1400 1300,1500',
      'hat: s("hh*8").gain(0.4)',
    ].join('\n'),
  );
  await page.getByRole('button', { name: /Auto-arrange all tracks/ }).click();
  const kick = await at(sound(page, 'bd*4'));
  const hat = await at(sound(page, 'hh*8'));
  // Flush left, kick first, the gap between them closed.
  expect(hat.x).toBe(kick.x);
  expect(hat.y).toBeGreaterThan(kick.y);
  expect(hat.y - kick.y).toBeLessThan(600);
  await expect(editor(page)).toContainText(`// @layout ${kick.x},${hat.y} `);
});

test('with nodes selected, Auto-arrange only arranges their tracks', async ({
  page,
}) => {
  await typeCode(
    page,
    [
      '// @layout 0,0 900,400',
      'kick: s("bd*4").gain(0.8)',
      '// @layout 40,700 1400,1100',
      'hat: s("hh*8").gain(0.4)',
    ].join('\n'),
  );
  const offset = async (pattern: string) => {
    const source = await at(sound(page, pattern));
    const all = await Promise.all((await levels(page).all()).map(at));
    // The Level nearest below-right of this source belongs to its line.
    const own = all.find((p) => p.y >= source.y - 1 && p.y <= source.y + 500)!;
    return { x: own.x - source.x, y: own.y - source.y };
  };
  const hatBefore = await offset('hh*8');
  await sound(page, 'bd*4').locator('header').click();
  await page
    .getByRole('button', { name: /Auto-arrange the selected tracks/ })
    .click();
  // The kick's Level is back in its row; the hat line keeps its shape.
  expect((await offset('bd*4')).y).toBe(0);
  expect(await offset('hh*8')).toEqual(hatBefore);
});
