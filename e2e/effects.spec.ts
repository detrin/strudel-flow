import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('a filter envelope appears when it gets depth, and is written out', async ({
  page,
}) => {
  await typeCode(page, 'hat: s("hh*8").hpf(3000)');
  const highPass = nodeOfType(page, 'hpf-node');
  await expect(highPass.getByRole('slider')).toHaveCount(3);
  await highPass.getByRole('slider', { name: 'env' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(highPass.getByRole('slider')).toHaveCount(7);
  await expect(editor(page)).toContainText(
    '.hpf(3000).hpenv(0.1).hpattack(0.005).hpdecay(0.14).hpsustain(0).hprelease(0.1)',
  );
});

test('delay code becomes a Delay node and its knobs write code', async ({
  page,
}) => {
  await typeCode(
    page,
    'stab: note("c4 eb4").s("square").delay(0.4).dt(0.375).dfb(0.7)',
  );
  const delay = nodeOfType(page, 'delay-node');
  await expect(delay.getByRole('slider', { name: 'time' })).toHaveAttribute(
    'aria-valuenow',
    '0.375',
  );
  await delay.getByRole('slider', { name: 'feedback' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(editor(page)).toContainText(
    '.delay(0.4).delaytime(0.375).delayfeedback(0.69)',
  );
});

test('arranging bars on the canvas writes the mask', async ({ page }) => {
  await typeCode(page, 'acid: note("c2*8").s("sawtooth").mask("<1!4 0!4>")');
  const arrange = nodeOfType(page, 'arrange-node');
  await expect(arrange.getByRole('button', { pressed: true })).toHaveCount(4);
  await arrange.getByRole('button', { name: 'Bar 5' }).click();
  await expect(editor(page)).toContainText('.mask("<1!5 0!3>")');
  await arrange.getByRole('button', { name: 'More bars' }).click();
  await expect(editor(page)).toContainText('.mask("<1!5 0!4>")');
});

test('an LFO becomes a Modulate node you can reshape', async ({ page }) => {
  await typeCode(
    page,
    'acid: note("c2*8").s("sawtooth").lpf(sine.range(300, 3000).slow(8))',
  );
  const modulate = nodeOfType(page, 'modulate-node');
  await modulate.getByRole('combobox', { name: 'wave' }).selectOption('perlin');
  await modulate.getByRole('textbox', { name: 'to', exact: true }).fill('5000');
  await expect(editor(page)).toContainText(
    '.lpf(perlin.range(300, 5000).slow(8))',
  );
});
