#!/usr/bin/env node
// MCP server that lets Claude Code read and edit the patch open in
// Strudel Flow. Claude Code talks to it over stdio; it reaches the app
// through the bridge hub the dev server runs at /__bridge (mcp/hub.mjs), so
// any number of Claude sessions and tabs can come and go.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';
import { z } from 'zod';

const APP_URL = process.env.STRUDEL_FLOW_URL ?? 'http://localhost:5173';
const HUB_URL = `${APP_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/__bridge?role=agent`;
const TIMEOUT_MS = 10_000;
const CONNECT_MS = 1500;
const NOT_RUNNING =
  `Strudel Flow's dev server is not running at ${APP_URL}. ` +
  'Run `pnpm dev` in the strudel-flow repo (or set STRUDEL_FLOW_URL), then open the app.';

let hub;
let nextId = 1;
const pending = new Map();

/** Connects to the hub (again, after it went away). */
function connect() {
  if (hub && hub.readyState <= WebSocket.OPEN) return;
  const socket = new WebSocket(HUB_URL);
  hub = socket;
  socket.on('message', (data) => {
    let reply;
    try {
      reply = JSON.parse(String(data));
    } catch {
      return;
    }
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('error' in reply) waiting.reject(new Error(reply.error));
    else waiting.resolve(reply.result);
  });
  socket.on('error', () => {});
  socket.on('close', () => {
    if (hub === socket) hub = undefined;
    for (const [id, waiting] of pending) {
      pending.delete(id);
      waiting.reject(new Error('The connection to Strudel Flow closed.'));
    }
  });
}

async function openHub() {
  connect();
  const deadline = Date.now() + CONNECT_MS;
  while (hub?.readyState === WebSocket.CONNECTING && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 50));
  if (hub?.readyState !== WebSocket.OPEN) throw new Error(NOT_RUNNING);
  return hub;
}

/** Sends one command to the newest open tab and waits for its answer. */
async function call(method, params = {}) {
  const socket = await openHub();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Strudel Flow did not answer "${method}" in time.`));
    }, TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => (clearTimeout(timer), resolve(value)),
      reject: (error) => (clearTimeout(timer), reject(error)),
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const server = new McpServer(
  { name: 'strudel-flow', version: '1.1.0' },
  {
    instructions: [
      'Strudel Flow is a live music editor: Strudel (strudel.cc) code and a',
      'node canvas that are two views of one patch. Changes apply to the open',
      'app immediately and are heard if it is playing.',
      'A patch is `setcpm(bpm/beatsPerCycle)` plus lines `label: expression`;',
      '`_label:` mutes a line. Each line becomes a chain of nodes.',
      'Start with get_patch. To open a song file use open_file (the file is',
      'read here, never pasted). Prefer set_code for musical changes (it keeps',
      'surviving nodes where they are); use set_node for tweaking one value.',
    ].join(' '),
  },
);

/** Registers a tool that forwards to an app command. */
function tool(name, description, shape, run = (input) => call(name, input)) {
  server.registerTool(
    name,
    { description, inputSchema: shape },
    async (input) => {
      try {
        const result = await run(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: error.message }],
        };
      }
    },
  );
}

tool(
  'get_patch',
  'Read the open patch: its code, tempo, whether it plays, and each line as a chain of nodes with ids, types and values. Compact by default (big values such as pad grids are summarised); detail "full" gives everything.',
  { detail: z.enum(['compact', 'full']).optional() },
);
tool(
  'set_code',
  'Replace the whole patch with Strudel code. The canvas rebuilds from it; nodes that survive keep their id and place. Fails with the parse error if the code is invalid (the patch is then unchanged).',
  { code: z.string().describe('The full Strudel program.') },
);
tool(
  'open_file',
  'Open a song file (.strudel, .strudel.js, .js) as a new patch: read from disk here, so big files (embedded samples) never pass through the conversation. Name and author come from `// @name` / `// @author` comments.',
  {
    path: z
      .string()
      .describe('Absolute, or relative to the strudel-flow repo.'),
    play: z.boolean().optional().describe('Start playing once open.'),
  },
  async ({ path, play }) => {
    const code = await readFile(resolve(path), 'utf8');
    const result = await call('open_code', { code, name: path });
    if (play) await call('set_playing', { playing: true });
    return result;
  },
);
tool(
  'new_patch',
  'Start a new, empty patch (optionally from code). The open patch is replaced.',
  { code: z.string().optional() },
  ({ code }) => call('open_code', { code: code ?? 'setcpm(120/4)\n' }),
);
tool(
  'tidy',
  'Tidy the canvas: each line in code order with order-free effects stacked. A line is only reordered when it provably sounds the same. Optionally only the line of one node.',
  { node: z.string().optional().describe('A node id: tidy only its line.') },
);
tool(
  'select_node',
  'Select a node and bring it into view; the code console shows its code. Use it to point the user at something.',
  { id: z.string() },
);
tool(
  'set_node',
  "Change values of one node, e.g. a Filter's cutoff. Ids and value names come from get_patch.",
  {
    id: z.string(),
    values: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .describe('Value name to new value, e.g. { "cutoff": 800 }.'),
  },
);
tool('set_muted', 'Mute or unmute a line by its label.', {
  line: z.string().describe('The line label, e.g. "kick" ("$" for unnamed).'),
  muted: z.boolean(),
});
tool('set_tempo', 'Set the tempo.', {
  bpm: z.number().positive().optional(),
  beatsPerCycle: z.number().int().positive().optional(),
});
tool('play', 'Start playback.', {}, () =>
  call('set_playing', { playing: true }),
);
tool('stop', 'Stop playback.', {}, () =>
  call('set_playing', { playing: false }),
);
tool('set_theme', 'Switch the strudel.cc theme of the app.', {
  name: z.string().describe('e.g. "strudelTheme", "bluescreen".'),
});
tool(
  'list_node_types',
  'List node types with the Strudel methods they write and their parameters (ranges, options).',
  {},
);

connect();
await server.connect(new StdioServerTransport());
