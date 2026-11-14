import { expect, test } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { editor, nodeOfType, nodes, openFresh } from './helpers';

/** Claude Code's side: the MCP server over stdio, as .mcp.json starts it. */
async function claude(port: number) {
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: 'node',
      args: ['mcp/server.mjs'],
      env: { ...process.env, STRUDEL_FLOW_PORT: String(port) } as Record<
        string,
        string
      >,
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

test('Claude Code edits the open patch over MCP', async ({ page }, info) => {
  const port = 4400 + info.workerIndex;
  const { client, call } = await claude(port);
  try {
    // Before the app is open, tools say how to open it.
    expect((await call('get_patch')).text).toMatch(/Run `pnpm dev`/);

    await openFresh(page);
    await page.goto(`/?bridge=${port}`);
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
  } finally {
    await client.close();
  }
});
