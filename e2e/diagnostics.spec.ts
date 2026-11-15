import { expect, test } from '@playwright/test';
import { editor, openFresh, typeCode } from './helpers';

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
