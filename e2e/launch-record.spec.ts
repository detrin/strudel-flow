import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openFresh, typeCode } from './helpers';

test.beforeEach(async ({ page }) => openFresh(page));

test('with launch on 1 bar, an edit waits for the next bar', async ({
  page,
}) => {
  await typeCode(page, 'setcpm(30)\nkick: s("bd*4")');
  const launch = page.getByRole('combobox', { name: 'When edits play' });
  await launch.selectOption('1');
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await page.waitForTimeout(800);
  await typeCode(page, 'setcpm(30)\nkick: s("bd*8")');
  // At 30 cycles a minute a bar is 2 s: the edit waits, then lands.
  await expect(launch).toHaveAttribute('data-pending', /\d+/);
  await expect(launch).not.toHaveAttribute('data-pending', /\d+/, {
    timeout: 6000,
  });
});

test('recording what plays saves a WAV file', async ({ page }) => {
  await typeCode(page, 'kick: s("sine*4").note("c3")');
  await page.getByRole('button', { name: /^Play \(/ }).click();
  await page.getByRole('button', { name: 'Record to WAV' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop recording and save WAV' }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Stop recording and save WAV' })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.wav$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  // Over a second of 48 or 44.1 kHz stereo.
  expect(bytes.length).toBeGreaterThan(44 + 44100 * 4);
  // And it holds sound, not silence.
  const samples = new Int16Array(
    bytes.buffer,
    bytes.byteOffset + 44,
    (bytes.length - 44) / 2,
  );
  expect(
    samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0),
  ).toBeGreaterThan(1000);
});
