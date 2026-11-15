import { expect, test } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => {
  // A pretend controller: tests send it control changes.
  await page.addInitScript(() => {
    const input: { onmidimessage: ((e: { data: Uint8Array }) => void) | null } =
      { onmidimessage: null };
    const scope = window as unknown as {
      sendCc: (cc: number, value: number) => void;
    };
    scope.sendCc = (cc, value) =>
      input.onmidimessage?.({ data: new Uint8Array([0xb0, cc, value]) });
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: async () => ({
        inputs: new Map([['pretend', input]]),
        onstatechange: null,
      }),
    });
  });
  await openFresh(page);
});

const sendCc = (page: import('@playwright/test').Page, cc: number, v: number) =>
  page.evaluate(
    ([cc, v]) =>
      (window as unknown as { sendCc: (a: number, b: number) => void }).sendCc(
        cc,
        v,
      ),
    [cc, v],
  );

test('MIDI learn links a hardware knob to a node knob', async ({ page }) => {
  await typeCode(page, 'bass: note("c2*4").s("sawtooth").lpf(800)');
  await page.getByRole('button', { name: 'MIDI learn', exact: true }).click();
  const filter = nodeOfType(page, 'lpf-node');
  await filter.getByRole('button', { name: 'MIDI learn lpf' }).click();
  await sendCc(page, 74, 0);
  await expect(filter.locator('[data-midi="cc74"]')).toBeVisible();
  await page.getByRole('button', { name: 'MIDI learn', exact: true }).click();

  await sendCc(page, 74, 127);
  await expect(editor(page)).not.toContainText('.lpf(800)');
  await expect(filter.getByRole('slider', { name: 'lpf' })).not.toHaveAttribute(
    'aria-valuenow',
    '800',
  );
  // The link survives a reload.
  await page.reload();
  await expect(
    nodeOfType(page, 'lpf-node').locator('[data-midi="cc74"]'),
  ).toBeVisible();
});
