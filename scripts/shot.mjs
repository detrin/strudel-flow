#!/usr/bin/env node
// Screenshot Strudelton with a song open, for checking how something
// looks without touching the app you have open:
//
//   pnpm shot <song file> [--tidy] [--play SECONDS] [--hide-console]
//             [--fit] [--size 1440x900] [--out shots/name.png]
//             [--code PATH]
//
// --code saves the console's code once the canvas settles: the song with
// fresh `// @layout` comments (how the demo patches get theirs).
// It starts its own dev server and browser, opens the song (as typed into
// the code console), and saves a PNG; the path is printed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tidy: { type: 'boolean' },
    play: { type: 'string' },
    'hide-console': { type: 'boolean' },
    fit: { type: 'boolean' },
    size: { type: 'string', default: '1440x900' },
    out: { type: 'string' },
    code: { type: 'string' },
  },
});
const [file] = positionals;
if (!file) {
  console.error(
    'Usage: pnpm shot <song file> [--tidy] [--play SECONDS] [--hide-console] [--fit] [--size WxH] [--out PATH]',
  );
  process.exit(1);
}
const code = readFileSync(resolve(file), 'utf8');
const [width, height] = values.size.split('x').map(Number);
const out = resolve(
  values.out ?? `shots/${basename(file).replace(/\.[^.]*$/, '')}.png`,
);

const server = await createServer({
  server: { port: 0, strictPort: false },
  logLevel: 'error',
});
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${url}?bridge=off`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?bridge=off`);
  await page.locator('.react-flow__node').first().waitFor();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(code);
  await page.waitForTimeout(1500);
  if (values.tidy)
    await page.getByRole('button', { name: /Tidy all lines/ }).click();
  if (values.play) {
    await page.getByRole('button', { name: /^Play \(/ }).click();
    await page.waitForTimeout(Number(values.play) * 1000);
  }
  if (values['hide-console'])
    await page.getByRole('button', { name: 'Hide code console' }).click();
  if (values.fit) await page.getByRole('button', { name: 'Fit patch' }).click();
  await page.waitForTimeout(500);
  if (values.code) {
    const written = await page.evaluate(() => {
      const content = document.querySelector('.cm-content');
      const view = content?.cmView?.view ?? content?.cmTile?.view;
      return view?.state.doc.toString();
    });
    if (!written) throw new Error('Could not read the code console');
    writeFileSync(resolve(values.code), written);
    console.log(resolve(values.code));
  }
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(out);
} finally {
  await browser.close();
  await server.close();
}
