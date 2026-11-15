import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editor, nodeOfType, nodes, openFresh } from './helpers';

// One hub serves every tab, and agents reach the newest: one test at a time.
test.describe.configure({ mode: 'serial' });

/** Claude Code's side: the MCP server over stdio, as .mcp.json starts it. */
async function claude(appUrl: string) {
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: 'node',
      args: ['mcp/server.mjs'],
      env: { ...process.env, STRUDELTON_URL: appUrl } as Record<string, string>,
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    return { error: result.isError, text: result.content[0].text };
  };
  return { client, call };
}

test('Claude Code edits the open patch over MCP', async ({ page, baseURL }) => {
  const { client, call } = await claude(baseURL!);
  try {
    // Before a tab is open, tools say how to open it.
    expect((await call('get_patch')).text).toMatch(/not open/);

    await openFresh(page);
    await page.goto('/');
    await expect(page.getByText('Agent connected')).toBeVisible();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['get_patch', 'set_code', 'set_node', 'play']),
    );

    // Code from Claude becomes nodes and code in the app.
    const set = await call('set_code', {
      code: 'setcpm(128/4)\nkick: s("bd*4").bank("RolandTR909")\nbass: note("c2*8").s("sawtooth").lpf(600)',
    });
    expect(set.error).toBeFalsy();
    await expect(nodes(page)).toHaveCount(5);
    await expect(editor(page)).toContainText('bass: note("c2*8")');

    // Claude reads the patch, tweaks one node, mutes a line.
    const patch = JSON.parse((await call('get_patch')).text);
    const filter = patch.lines[1].nodes.find(
      (node: { type: string }) => node.type === 'lpf-node',
    );
    await call('set_node', { id: filter.id, values: { cutoff: 1200 } });
    await expect(editor(page)).toContainText('.lpf(1200)');
    await expect(
      nodeOfType(page, 'lpf-node').getByRole('slider', { name: 'lpf' }),
    ).toHaveAttribute('aria-valuenow', '1200');
    await call('set_muted', { line: 'kick', muted: true });
    await expect(editor(page)).toContainText('_kick:');

    // Mistakes come back as explanations, and the patch survives them.
    const bad = await call('set_code', { code: 'kick: s("bd"' });
    expect(bad.error).toBe(true);
    expect(bad.text).toMatch(/did not parse/);
    await expect(nodes(page)).toHaveCount(5);

    await call('play');
    await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
    await call('stop');
    await expect(page.getByRole('button', { name: /^Play \(/ })).toBeVisible();

    // A song file opens from disk, named by its header.
    const file = join(tmpdir(), `flow-${Date.now()}.strudel`);
    writeFileSync(
      file,
      '// @name Disk song\n// @author me\nsetcpm(90/4)\nhat: s("hh*8").gain(0.4)\n',
    );
    const opened = JSON.parse((await call('open_file', { path: file })).text);
    expect(opened.lines.map((line: { label: string }) => line.label)).toEqual([
      'hat',
    ]);
    await expect(editor(page)).toContainText('hat: s("hh*8")');

    // Claude points at a node: it is selected and its code highlighted.
    const level = opened.lines[0].nodes[1];
    await call('select_node', { id: level.id });
    await expect(page.locator('.cm-node-focus')).toHaveText('gain(0.4)');
    expect((await call('tidy')).error).toBeFalsy();

    // get_patch is compact unless asked for everything.
    await call('new_patch', { code: 'p: n("0 2").scale("C:major")' });
    const compact = JSON.parse((await call('get_patch')).text);
    expect(compact.lines[0].nodes[0].type).toBe('notes-node');
  } finally {
    await client.close();
  }
});

test('a second Claude session and a reopened tab still reach the app', async ({
  page,
  baseURL,
}) => {
  const first = await claude(baseURL!);
  const second = await claude(baseURL!);
  try {
    await openFresh(page);
    await page.goto('/');
    await expect(page.getByText('Agent connected')).toBeVisible();
    await page.reload();
    for (const session of [first, second]) {
      const result = await session.call('set_code', { code: 'k: s("bd*4")' });
      expect(result.error).toBeFalsy();
    }
    await expect(editor(page)).toContainText('k: s("bd*4")');
  } finally {
    await first.client.close();
    await second.client.close();
  }
});
