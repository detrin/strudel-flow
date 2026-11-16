import { expect, test, type Page } from './fixtures';
import { nodeOfType, openFresh, typeCode } from './helpers';

const code = (page: Page) => page.locator('.cm-content');
const openLibrary = async (page: Page) => {
  await page
    .getByRole('button', {
      name: 'Library: samples, presets, takes and chords',
    })
    .click();
  return page.getByRole('dialog');
};

test('export has its own icon; the folder opens the Library', async ({
  page,
}) => {
  await openFresh(page);
  await page.getByRole('button', { name: /^Export, share/ }).click();
  await expect(page.getByRole('heading', { name: 'Your patch' })).toBeVisible();
  await page.keyboard.press('Escape');
  const library = await openLibrary(page);
  await expect(library.getByRole('tab', { name: 'Samples' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(library.getByRole('tab', { name: 'Presets' })).toBeVisible();
});

test.setTimeout(90000);

test('samples: search by name and tag, filter by kind, tag, add as a line', async ({
  page,
}) => {
  await openFresh(page);
  const library = await openLibrary(page);
  const list = library.getByRole('list', { name: 'Sounds' });
  // The packs load in the background.
  await expect(library.getByText(/of \d{3,} sounds/)).toBeVisible({
    timeout: 30000,
  });

  // Dirt-Samples (casio) is the biggest pack and loads last.
  await library.getByLabel('Search sounds').fill('casio');
  await expect(list.locator('[data-sound="casio"]')).toBeVisible({
    timeout: 60000,
  });
  await library.getByLabel('Search sounds').fill('808 kick');
  await expect(list.locator('[data-sound="rolandtr808_bd"]')).toBeVisible();
  for (const name of await list
    .locator('li')
    .evaluateAll((items) => items.map((i) => i.getAttribute('data-sound'))))
    expect(name?.toLowerCase()).toContain('808');

  await library.getByLabel('Search sounds').fill('bass');
  await library
    .getByRole('group', { name: 'Kind of sound' })
    .getByRole('button', { name: 'Instruments' })
    .click();
  await expect(list.locator('[data-sound="gm_slap_bass_1"]')).toBeVisible();
  await expect(list.locator('[data-sound="bassdrum1"]')).toHaveCount(0);

  // Your own tag, then filter by it.
  await library
    .getByRole('group', { name: 'Kind of sound' })
    .getByRole('button', { name: 'All' })
    .click();
  await library.getByLabel('Search sounds').fill('casio');
  await library.getByRole('button', { name: 'Tag casio', exact: true }).click();
  await library.getByLabel('Your tags for casio').fill('techno');
  await library.getByLabel('Your tags for casio').press('Enter');
  await library.getByLabel('Search sounds').fill('');
  await library
    .getByRole('group', { name: 'Filter by tag' })
    .getByRole('button', { name: /^techno/ })
    .click();
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list.locator('[data-sound="casio"]')).toBeVisible();

  // Listening works without errors; adding writes a new line.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await library
    .getByRole('button', { name: 'Play casio', exact: true })
    .click();
  // The button shows it plays, then offers to play again.
  const casio = library.locator('[data-sound="casio"] button').first();
  await expect(casio).toHaveAttribute('data-preview', 'playing');
  await expect(casio).toHaveAccessibleName('casio playing');
  await expect(casio).toHaveAccessibleName('Play casio', { timeout: 10000 });
  await library
    .getByRole('button', { name: 'Add casio as a new line', exact: true })
    .click();
  await expect(library.getByRole('status').first()).toContainText(
    'Added line casio',
  );
  await expect(code(page)).toContainText('casio: s("casio")');
  expect(errors).toEqual([]);

  // Tags are kept across visits.
  await page.reload();
  const again = await openLibrary(page);
  await again.getByLabel('Search sounds').fill('techno');
  await expect(again.locator('[data-sound="casio"]')).toBeVisible({
    timeout: 30000,
  });
});

test('presets: save a line with a name and tags, find it, insert it into another song', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(
    page,
    `setcpm(124/4)
const cut = slider(900, 200, 4000)
kick: s("bd*4")
bass: note("c2 eb2 g1 bb1").s("sawtooth").lpf(cut)`,
  );
  // From the bass line's node menu.
  const voice = nodeOfType(page, 'synth-select-node').first();
  await voice.getByRole('button', { name: 'Module options' }).first().click();
  await page.getByRole('menuitem', { name: 'Save line as preset' }).click();
  const library = page.getByRole('dialog');
  const form = library.getByRole('form', { name: 'Save a line as a preset' });
  await expect(form.getByLabel('Line to save')).toHaveValue('bass');
  await expect(
    form.getByText('const cut = slider(900, 200, 4000)'),
  ).toBeVisible();
  await form.getByRole('button', { name: '+ bass' }).click();
  await form.getByLabel('Preset tags').fill('acid, techno');
  await form.getByLabel('Preset tags').press('Enter');
  await form.getByLabel('Preset name').fill('Acid bass');
  await form.getByRole('button', { name: 'Save preset' }).click();
  await expect(library.getByRole('status')).toContainText(
    'Saved preset “Acid bass”',
  );
  await expect(library.locator('[data-preset="Acid bass"]')).toContainText(
    'acid',
  );

  // A second preset, then filter by tag.
  await library
    .getByRole('button', { name: 'Save a line as a preset' })
    .click();
  await library.getByLabel('Line to save').selectOption('kick');
  await library.getByRole('button', { name: 'Save preset' }).click();
  await library
    .getByRole('group', { name: 'Filter by tag' })
    .getByRole('button', { name: /^bass/ })
    .click();
  await expect(
    library.getByRole('list', { name: 'Presets' }).locator('li'),
  ).toHaveCount(1);

  // Into a new song: the line and the slider it needs.
  await page.keyboard.press('Escape');
  await typeCode(page, 'setcpm(120/4)\nhat: s("hh*8")');
  const reopened = await openLibrary(page);
  await reopened.getByRole('tab', { name: 'Presets' }).click();
  await reopened.getByLabel('Search presets').fill('acid');
  await reopened.getByRole('button', { name: 'Insert Acid bass' }).click();
  await expect(code(page)).toContainText('const cut = slider(900, 200, 4000)');
  await expect(code(page)).toContainText('bass: note("c2 eb2 g1 bb1")');
  await expect(code(page)).toContainText('hat: s("hh*8")');
});

test('a sound plays on the first click', async ({ page }) => {
  await openFresh(page);
  const library = await openLibrary(page);
  for (const name of ['gm_flute', 'rolandtr909_cp']) {
    await library.getByLabel('Search sounds').fill(name);
    await library.locator(`[data-sound="${name}"]`).waitFor({ timeout: 60000 });
    // The loudest sample on the master output from now on.
    await page.evaluate(async () => {
      // The app's own module (a variable, so TypeScript leaves it be).
      const path = '/src/lib/meters.ts';
      const { masterAnalyser } = (await import(/* @vite-ignore */ path)) as {
        masterAnalyser: () => AnalyserNode | undefined;
      };
      const analyser = masterAnalyser()!;
      const data = new Float32Array(analyser.fftSize);
      const w = window as unknown as { peak: number; measuring?: boolean };
      w.peak = 0;
      if (w.measuring) return;
      w.measuring = true;
      const loop = () => {
        analyser.getFloatTimeDomainData(data);
        for (const v of data) w.peak = Math.max(w.peak, Math.abs(v));
        requestAnimationFrame(loop);
      };
      loop();
    });
    await library
      .getByRole('button', { name: `Play ${name}`, exact: true })
      .click();
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { peak: number }).peak),
        {
          message: `${name} is heard`,
          // Downloads compete with the other tests' browsers.
          timeout: 15000,
        },
      )
      .toBeGreaterThan(0.05);
  }
});

test('tags combine: only tags of the current results, counted in them', async ({
  page,
}) => {
  await openFresh(page);
  const library = await openLibrary(page);
  await library.getByLabel('Search sounds').fill('casio');
  await library.locator('[data-sound="casio"]').waitFor({ timeout: 60000 });
  await library.getByLabel('Search sounds').fill('');
  const tags = library.getByRole('group', { name: 'Filter by tag' });
  const shown = async () =>
    (await tags.getByRole('button').allInnerTexts())
      .map((text) => /^(.+?)\s*(\d+)$/.exec(text.replace(/\n/g, ' ')))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ tag: m[1], count: Number(m[2]) }));
  const total = async () =>
    Number(
      /^(\d+) of/.exec(
        await library.getByText(/ of \d+ sounds/).innerText(),
      )![1],
    );

  await tags.getByRole('button', { name: /^fx/ }).click();
  const fxCount = await total();
  const afterFx = await shown();
  // Every tag offered still has sounds, and no more than the results.
  for (const { tag, count } of afterFx) {
    expect(count, tag).toBeGreaterThan(0);
    expect(count, tag).toBeLessThanOrEqual(fxCount);
  }
  expect(afterFx.find((t) => t.tag === 'fx')?.count).toBe(fxCount);
  // Picking another narrows the results; the counts follow.
  const other = afterFx.find((t) => t.tag !== 'fx')!;
  await tags.getByRole('button', { name: new RegExp(`^${other.tag}`) }).click();
  expect(await total()).toBe(other.count);
  expect(await total()).toBeGreaterThan(0);
});

test('a preset plays on its own, stops, and the song comes back', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(
    page,
    'setcpm(120/4)\nkick: s("bd*4")\nhat: s("hh*8").gain(0.4)',
  );
  // Save the hats as a preset.
  const library = await openLibrary(page);
  await library.getByRole('tab', { name: 'Presets' }).click();
  await library
    .getByRole('button', { name: 'Save a line as a preset' })
    .click();
  await library.getByLabel('Line to save').selectOption('hat');
  await library.getByLabel('Preset name').fill('Hats');
  await library.getByRole('button', { name: 'Save preset' }).click();
  await page.keyboard.press('Escape');

  /** The code Strudel was last given. */
  const playing = () =>
    page.evaluate(async () => {
      const path = '/src/lib/live.ts';
      const { evaluatedCode } = (await import(/* @vite-ignore */ path)) as {
        evaluatedCode: () => string;
      };
      return evaluatedCode();
    });

  await page.getByRole('button', { name: 'Play (Space)' }).click();
  await expect.poll(playing).toContain('kick:');

  // The preset plays instead of the song.
  const reopened = await openLibrary(page);
  await reopened.getByRole('tab', { name: 'Presets' }).click();
  await reopened.getByRole('button', { name: 'Play Hats' }).click();
  await expect(
    reopened.getByRole('button', { name: 'Stop Hats' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(playing).toMatch(/^setcpm\(120\/4\)\nhat: s\("hh\*8"\)/);
  expect(await playing()).not.toContain('kick:');

  // Stopping brings the song back.
  await reopened.getByRole('button', { name: 'Stop Hats' }).click();
  await expect(
    reopened.getByRole('button', { name: 'Play Hats' }),
  ).toBeVisible();
  await expect.poll(playing).toContain('kick:');

  // Closing the Library while a preset plays stops it too.
  await reopened.getByRole('button', { name: 'Play Hats' }).click();
  await expect.poll(playing).not.toContain('kick:');
  await page.keyboard.press('Escape');
  await expect.poll(playing).toContain('kick:');
  await expect(
    page.getByRole('button', { name: 'Pause (Space)' }),
  ).toBeVisible();
});

test('switching presets cuts what the last one left sounding', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(
    page,
    [
      'setcpm(120/4)',
      // Every note rings for 8 seconds after it ends.
      'drone: note("c3").s("sawtooth").release(8).gain(0.5)',
      'quiet: s("hh*4").gain(0)',
    ].join('\n'),
  );
  const library = await openLibrary(page);
  await library.getByRole('tab', { name: 'Presets' }).click();
  for (const name of ['drone', 'quiet']) {
    await library
      .getByRole('button', { name: 'Save a line as a preset' })
      .click();
    await library.getByLabel('Line to save').selectOption(name);
    await library.getByLabel('Preset name').fill(name);
    await library.getByRole('button', { name: 'Save preset' }).click();
  }

  // The loudest sample on the master output since the last reset.
  await page.evaluate(async () => {
    const path = '/src/lib/meters.ts';
    const { masterAnalyser } = (await import(/* @vite-ignore */ path)) as {
      masterAnalyser: () => AnalyserNode | undefined;
    };
    const w = window as unknown as { peak: number };
    w.peak = 0;
    const loop = () => {
      // Strudel rebuilds its output on a cut; follow it.
      const analyser = masterAnalyser();
      if (analyser) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (const v of data) w.peak = Math.max(w.peak, Math.abs(v));
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
  const peak = () =>
    page.evaluate(() => (window as unknown as { peak: number }).peak);
  const resetPeak = () =>
    page.evaluate(() => ((window as unknown as { peak: number }).peak = 0));

  await library
    .getByRole('button', { name: 'Play drone', exact: true })
    .click();
  await expect.poll(peak, { timeout: 15000 }).toBeGreaterThan(0.05);
  await page.waitForTimeout(2500);

  await library
    .getByRole('button', { name: 'Play quiet', exact: true })
    .click();
  await page.waitForTimeout(400);
  await resetPeak();
  await page.waitForTimeout(1000);
  expect(await peak()).toBeLessThan(0.005);
});
