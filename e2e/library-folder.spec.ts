import { expect, test, type Page } from './fixtures';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { typeCode } from './helpers';
import { detectPitch } from '../src/lib/takes/tune';

/** Mono 16-bit PCM WAV. */
function wavOf(samples: Float32Array, rate: number) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) =>
    bytes.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, v)) * 0x7fff),
      44 + i * 2,
    ),
  );
  return bytes;
}
/** 16-bit PCM WAV → its first channel and rate. */
function readWav(file: string) {
  const bytes = readFileSync(file);
  const rate = bytes.readUInt32LE(24);
  const channels = bytes.readUInt16LE(22);
  const frames = (bytes.length - 44) / 2 / channels;
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++)
    samples[i] = bytes.readInt16LE(44 + i * 2 * channels) / 0x8000;
  return { samples, rate };
}
/** The median pitch of a WAV, in Hz. */
function pitchOf(file: string) {
  const { samples, rate } = readWav(file);
  const f0s = detectPitch(samples, rate)
    .map((frame) => frame.f0)
    .filter((f) => f > 0)
    .sort((a, b) => a - b);
  return f0s[Math.floor(f0s.length / 2)] ?? 0;
}
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

// The microphone for this file: 0.3 s of silence, then a voice-like tone
// at 300 Hz (between D4 and D#4), which Chromium plays in a loop.
const MIC = join(tmpdir(), 'strudelton-e2e-mic', 'tone-300.wav');
{
  const rate = 48000;
  const tone = new Float32Array(Math.round(rate * 2));
  for (let i = Math.round(rate * 0.3); i < rate * 1.7; i++) {
    const phase = (2 * Math.PI * 300 * i) / rate;
    let v = 0;
    for (let h = 1; h <= 10; h++) v += Math.sin(h * phase) / h;
    tone[i] = 0.25 * v;
  }
  mkdirSync(join(MIC, '..'), { recursive: true });
  writeFileSync(MIC, wavOf(tone, rate));
}
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${MIC}`,
    ],
  },
});

// The test server's Library folder (playwright.config.ts), never ~/.strudelton.
const HOME = process.env.STRUDELTON_HOME!;
const presetFiles = () =>
  existsSync(join(HOME, 'presets'))
    ? readdirSync(join(HOME, 'presets')).sort()
    : [];

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ request }) => {
  const { folder } = (await (await request.get('/__library')).json()) as {
    folder: string;
  };
  // Refuse to run against a real Library.
  expect(folder).toContain('strudelton-e2e-library');
  rmSync(HOME, { recursive: true, force: true });
});

const openLibrary = async (page: Page) => {
  await page.goto('/?bridge=off');
  await page
    .getByRole('button', { name: 'Library: samples, presets and takes' })
    .click();
  const library = page.getByRole('dialog');
  await library.getByRole('tab', { name: 'Presets' }).click();
  return library;
};

test("the browser's presets move into an empty folder", async ({ page }) => {
  await page.goto('/?bridge=off&library=browser');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'strudelton:library',
      JSON.stringify({
        presets: [
          {
            id: 'p1',
            name: 'Acid bass',
            label: 'bass',
            body: 'note("c2").s("sawtooth")',
            needs: [],
            tags: ['bass'],
            createdAt: 2,
          },
          {
            id: 'p2',
            name: 'Big beat',
            label: 'drums',
            body: 's("bd*4")',
            needs: [],
            tags: ['drums'],
            createdAt: 1,
          },
        ],
        soundTags: { casio: ['techno'] },
      }),
    );
  });
  const library = await openLibrary(page);
  await expect(library.locator('[data-storage="folder"]')).toContainText(
    'strudelton-e2e-library/presets',
  );
  await expect.poll(presetFiles).toEqual(['acid-bass.json', 'big-beat.json']);
  expect(
    JSON.parse(readFileSync(join(HOME, 'sound-tags.json'), 'utf8')),
  ).toEqual({ casio: ['techno'] });
});

test('saving, renaming and deleting presets changes their files; other browsers see them', async ({
  page,
  browser,
}) => {
  await page.goto('/?bridge=off');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?bridge=off');
  await typeCode(page, 'setcpm(124/4)\nbass: note("c2 eb2").s("sawtooth")');
  const library = await openLibrary(page);
  await library
    .getByRole('button', { name: 'Save a line as a preset' })
    .click();
  await library.getByLabel('Preset name').fill('Acid bass');
  await library.getByRole('button', { name: 'Save preset' }).click();
  await expect.poll(presetFiles).toEqual(['acid-bass.json']);
  const saved = JSON.parse(
    readFileSync(join(HOME, 'presets', 'acid-bass.json'), 'utf8'),
  );
  expect(saved).toMatchObject({ name: 'Acid bass', label: 'bass' });
  // The line as the app writes it.
  expect(saved.body).toMatch(/^note\("c2 eb2"\)\s*\.sound\("sawtooth"\)$/);

  // Another browser, with nothing stored, gets it from the folder.
  const other = await browser.newPage();
  const elsewhere = await openLibrary(other);
  await expect(elsewhere.locator('[data-preset="Acid bass"]')).toBeVisible();
  await other.close();

  await library.getByRole('button', { name: 'Edit Acid bass' }).click();
  await library.getByLabel('Preset name').last().fill('Night bass');
  await expect.poll(presetFiles).toEqual(['night-bass.json']);

  await library.getByRole('button', { name: 'Delete Night bass' }).click();
  await library
    .getByRole('button', { name: 'Really delete Night bass' })
    .click();
  await expect.poll(presetFiles).toEqual([]);
});

const takeFiles = () =>
  existsSync(join(HOME, 'takes'))
    ? readdirSync(join(HOME, 'takes')).sort()
    : [];

test('a take is recorded, tuned, kept beside its raw recording, retuned and deleted', async ({
  page,
}) => {
  await page.goto('/?bridge=off');
  await page
    .getByRole('button', { name: 'Library: samples, presets and takes' })
    .click();
  const library = page.getByRole('dialog');
  await library.getByRole('tab', { name: 'Takes' }).click();
  await library.getByLabel('Play the song while recording').uncheck();
  await library.getByRole('button', { name: 'Record' }).click();
  await expect(library.getByRole('button', { name: /^Stop/ })).toBeVisible();
  await page.waitForTimeout(2500);
  await library.getByRole('button', { name: /^Stop/ }).click();

  const form = library.getByRole('form', { name: 'New take' });
  await form.getByLabel('Take name').fill('Vox Test');
  await expect(form).toContainText('s("vox_test")');
  await form.getByLabel('Key').selectOption('D');
  await form.getByLabel('Scale').selectOption('major');
  await form.getByLabel('Tune').fill('100');
  await expect(form).toContainText('100 %');
  await form.getByRole('button', { name: 'Save take' }).click();
  await expect(library.getByRole('status')).toContainText(
    'Saved take “vox_test”',
  );

  await expect
    .poll(takeFiles)
    .toEqual(['vox_test.json', 'vox_test.raw.wav', 'vox_test.wav']);
  const details = JSON.parse(
    readFileSync(join(HOME, 'takes', 'vox_test.json'), 'utf8'),
  );
  expect(details).toMatchObject({ key: 'D', scale: 'major', amount: 1 });
  // The leading silence is trimmed (the fake mic loops, so ~2 s or more).
  expect(details.seconds).toBeGreaterThan(1);
  // Raw stays at 300 Hz; tuned sits on D4.
  expect(
    Math.abs(cents(pitchOf(join(HOME, 'takes', 'vox_test.raw.wav')), 300)),
  ).toBeLessThan(10);
  expect(
    Math.abs(cents(pitchOf(join(HOME, 'takes', 'vox_test.wav')), 293.66)),
  ).toBeLessThan(10);
  await expect(library.getByRole('list', { name: 'Takes' })).toContainText(
    'D major · 100 %',
  );

  // It is a sound: the Samples tab finds it.
  await library.getByRole('tab', { name: 'Samples' }).click();
  await library.getByRole('searchbox').fill('vox_test');
  await expect(library.getByText('vox_test').first()).toBeVisible();
  await library.getByRole('tab', { name: 'Takes' }).click();

  // Tuned again from the raw recording, to 0 %: back at 300 Hz.
  await library.getByRole('button', { name: 'Tune vox_test again' }).click();
  await form.getByLabel('Tune').fill('0');
  await form.getByRole('button', { name: 'Save take' }).click();
  await expect(library.getByRole('status')).toContainText(
    'Saved take “vox_test”',
  );
  await expect
    .poll(
      () =>
        JSON.parse(readFileSync(join(HOME, 'takes', 'vox_test.json'), 'utf8'))
          .amount,
    )
    .toBe(0);
  expect(
    Math.abs(cents(pitchOf(join(HOME, 'takes', 'vox_test.wav')), 300)),
  ).toBeLessThan(10);

  // After a reload the take is still there (from the folder), and goes.
  await page.reload();
  await page
    .getByRole('button', { name: 'Library: samples, presets and takes' })
    .click();
  await library.getByRole('tab', { name: 'Takes' }).click();
  await expect(library.getByRole('list', { name: 'Takes' })).toContainText(
    'vox_test',
  );
  await library.getByRole('button', { name: 'Delete vox_test' }).click();
  await library.getByRole('button', { name: 'Really delete vox_test' }).click();
  await expect.poll(takeFiles).toEqual([]);
});
