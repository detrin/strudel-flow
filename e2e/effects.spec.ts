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
