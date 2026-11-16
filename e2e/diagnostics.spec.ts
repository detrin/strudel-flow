import { expect, test } from './fixtures';
import { editor, openFresh, typeCode } from './helpers';

// These tests break things on purpose.
test.use({ allowErrors: true });

test('a failing store listener is logged and the code still follows the canvas', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(page, 'setcpm(120/4)\nkick: s("bd*4").gain(0.8)');
  // A listener that always throws, subscribed before any change.
  await page.evaluate(async () => {
    const path = '/src/store/app-store.ts';
    const { useAppStore } = (await import(/* @vite-ignore */ path)) as {
      useAppStore: { subscribe: (listener: () => void) => () => void };
    };
    useAppStore.subscribe(() => {
      throw new Error('test: a broken listener');
    });
  });
  // Change the canvas: the code still follows.
  await page.evaluate(async () => {
    const path = '/src/store/app-store.ts';
    const { useAppStore } = (await import(/* @vite-ignore */ path)) as {
      useAppStore: {
        getState: () => { nodes: { id: string; type: string; data: object }[] };
        setState: (s: object) => void;
      };
    };
    useAppStore.setState({
      nodes: useAppStore
        .getState()
        .nodes.map((node) =>
          node.type === 'level-node'
            ? { ...node, data: { ...node.data, gain: 0.5 } }
            : node,
        ),
    });
  });
  await expect(editor(page)).toContainText('.gain(0.5)');
  const log = await page.evaluate(() =>
    (
      window as unknown as { __strudelton: { diagnosticsText: () => string } }
    ).__strudelton.diagnosticsText(),
  );
  expect(log).toContain('[app store listener] test: a broken listener');
});

test('a playback error has details to read and copy', async ({ page }) => {
  await openFresh(page);
  await typeCode(page, 'setcpm(120/4)\nkick: s("bd*4").fast(nonsense)');
  await page.getByRole('button', { name: 'Play (Space)' }).click();
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Couldn’t play this patch' });
  await expect(alert).toBeVisible({ timeout: 10000 });
  await alert.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(alert.getByLabel('Recent errors')).toContainText('[playback]');
  await expect(
    alert.getByRole('button', { name: 'Copy details' }),
  ).toBeVisible();
});

test('errors in the tab are written to the log on disk', async ({ page }) => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  await openFresh(page);
  const marker = `log check ${Date.now()}`;
  await page.evaluate(async (message) => {
    const path = '/src/lib/diagnostics.ts';
    const { report } = (await import(/* @vite-ignore */ path)) as {
      report: (where: string, error: unknown) => void;
    };
    report('test', new Error(message));
  }, marker);
  const file = join(
    process.env.STRUDELTON_HOME!,
    'logs',
    `${new Date().toISOString().slice(0, 10)}.jsonl`,
  );
  await expect
    .poll(() => existsSync(file) && readFileSync(file, 'utf8').includes(marker))
    .toBe(true);
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((row) => row.includes(marker))!;
  expect(JSON.parse(line)).toMatchObject({
    where: 'test',
    message: marker,
    page: expect.stringContaining('localhost'),
  });
});

test('a node that fails to draw shows an error; the rest goes on', async ({
  page,
}) => {
  await openFresh(page);
  await typeCode(
    page,
    'setcpm(120/4)\npad: n("0 2 4").scale("C:major")\nkick: s("bd*4").gain(0.8)',
  );
  await expect(page.locator('.react-flow__node-pad-node')).toHaveCount(1);
  // Break the pad's data the way a bad save might.
  await page.evaluate(async () => {
    const path = '/src/store/app-store.ts';
    const { useAppStore } = (await import(/* @vite-ignore */ path)) as {
      useAppStore: {
        getState: () => {
          nodes: { id: string; type: string }[];
          dispatch: (command: unknown) => boolean;
        };
      };
    };
    const pad = useAppStore
      .getState()
      .nodes.find((node) => node.type === 'pad-node')!;
    useAppStore.getState().dispatch({
      type: 'setData',
      updates: { [pad.id]: { notes: 'not notes', pattern: undefined } },
    });
  });
  const failed = page.locator('.react-flow__node-pad-node');
  await expect(failed.getByRole('alert')).toContainText('could not be drawn');
  // The other nodes still work: the kick's gain still writes code.
  const level = page.locator('.react-flow__node-level-node');
  await level.getByRole('slider', { name: 'gain', exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(editor(page)).toContainText('.gain(0.81)');
  await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible();
});
