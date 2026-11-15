import { expect, test, type Page } from '@playwright/test';
import { editor, nodeOfType, openFresh, typeCode } from './helpers';

test.setTimeout(120000);

/** Strudel's loaded sound names, once the sample packs are in. */
async function soundNames(page: Page) {
  await page.waitForFunction(
    async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => name.includes('@strudel_web.js'));
      if (!url) return false;
      const { soundMap } = (await import(/* @vite-ignore */ url)) as {
        soundMap: { get: () => Record<string, unknown> };
      };
      return 'casio' in soundMap.get();
    },
    null,
    { timeout: 60000, polling: 500 },
  );
}

/** A song with just a Beats node (placed from the toolbar), on `bank`. */
async function beatsOn(page: Page, bank?: string) {
  await typeCode(page, 'setcpm(240/4)');
  await page.getByRole('button', { name: 'Instruments' }).click();
  await page.getByRole('menuitem', { name: 'Place Beats' }).click();
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  await page
    .locator('.react-flow__pane')
    .click({ position: { x: box.width / 2, y: box.height - 110 } });
  const beats = nodeOfType(page, 'beat-machine-node');
  await expect(beats).toHaveCount(1);
  // A new Beats node writes nothing until a step is on.
  for (const step of [1, 3, 5, 7])
    await beats
      .getByRole('button', { name: `Track 1, step ${step}`, exact: true })
      .click();
  await expect(editor(page)).toContainText('sound("bd")');
  if (bank) {
    const code = await editor(page).innerText();
    await typeCode(page, `${code.trimEnd()}\n  .bank("${bank}")`);
    await expect(nodeOfType(page, 'bank-node')).toHaveCount(1);
  }
  await expect(beats).toHaveCount(1);
  return beats;
}

/** The loudest sample a line's analyser saw over `ms`. */
const lineLevel = (page: Page, label: string, ms: number) =>
  page.evaluate(
    async ({ label, ms }) => {
      const path = '/src/lib/meters.ts';
      const { lineAnalyser } = (await import(/* @vite-ignore */ path)) as {
        lineAnalyser: (label: string) => AnalyserNode | undefined;
      };
      let peak = 0;
      const end = performance.now() + ms;
      while (performance.now() < end) {
        const analyser = lineAnalyser(label);
        if (analyser) {
          const data = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(data);
          for (const v of data) peak = Math.max(peak, Math.abs(v));
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return peak;
    },
    { label, ms },
  );

test('every drum sound offered with the 909 plays; ones it lacks are marked', async ({
  page,
}) => {
  await openFresh(page);
  await soundNames(page);
  const beats = await beatsOn(page, 'RolandTR909');
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  await beats.getByRole('combobox', { name: 'Track 1 instrument' }).click();
  const options = page.getByRole('option');
  // The 909 has no cowbell: offered, greyed out, and says why.
  await expect(options.filter({ hasText: /^cb/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(options.filter({ hasText: /^cb/ })).toContainText(
    'not in RolandTR909',
  );
  const playable = (
    await options.evaluateAll((items) =>
      items
        .filter((item) => item.getAttribute('aria-disabled') !== 'true')
        .map((item) => item.textContent!.split(' ')[0]),
    )
  ).filter((name) => /^[a-z]+$/.test(name));
  await page.keyboard.press('Escape');
  expect(playable).toEqual([
    'bd',
    'sd',
    'rim',
    'cp',
    'hh',
    'oh',
    'lt',
    'mt',
    'ht',
    'cr',
    'rd',
  ]);
  const silent: string[] = [];
  for (const name of playable) {
    await beats.getByRole('combobox', { name: 'Track 1 instrument' }).click();
    await page.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click();
    await expect(editor(page)).toContainText(`sound("${name}")`);
    if ((await lineLevel(page, '$0', 1500)) < 0.01) silent.push(name);
  }
  expect(silent).toEqual([]);
});

test('every drum name in the list is a sound Strudel has', async ({ page }) => {
  await openFresh(page);
  await soundNames(page);
  const beats = await beatsOn(page);
  await beats.getByRole('combobox', { name: 'Track 1 instrument' }).click();
  // Without a bank only the machine-only names (shaker, tambourine) are marked.
  const marked = await page
    .getByRole('option')
    .evaluateAll((items) =>
      items
        .filter((item) => item.getAttribute('aria-disabled') === 'true')
        .map((item) => item.textContent!.split(' ')[0]),
    );
  expect(marked).toEqual(['sh', 'tb']);
});
