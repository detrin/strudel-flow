import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { typeCode } from './helpers';

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
    .getByRole('button', { name: 'Library: samples and presets' })
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
