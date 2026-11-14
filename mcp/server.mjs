#!/usr/bin/env node
// MCP server that lets Claude Code read and edit the patch open in
// Strudel Flow. Claude Code talks to it over stdio; the app connects to it
// over a localhost WebSocket (see src/lib/bridge).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const PORT = Number(process.env.STRUDEL_FLOW_PORT ?? 4321);
const TIMEOUT_MS = 10_000;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const NOT_CONNECTED =
  'Strudel Flow is not open. Run `pnpm dev` in the strudel-flow repo and open ' +
  'http://localhost:5173 (or any build with ?bridge); it connects by itself.';

/** The app's socket; the most recently opened tab wins. */
let app;
let listenError;
let nextId = 1;
const pending = new Map();

const sockets = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  // Only pages served from this machine may drive the bridge.
  verifyClient: ({ origin }) => !origin || LOCAL_ORIGIN.test(origin),
});
sockets.on('error', (error) => {
  listenError = error;
  console.error(`strudel-flow MCP: cannot listen on ${PORT}: ${error.message}`);
});
sockets.on('connection', (socket) => {
  app = socket;
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
  socket.on('close', () => {
    if (app === socket) app = undefined;
  });
});

/** Sends one command to the app and waits for its answer. */
function call(method, params = {}) {
  if (listenError)
    return Promise.reject(
      new Error(
        `The bridge could not use port ${PORT} (${listenError.message}). ` +
          'Another Strudel Flow MCP server is probably running; set STRUDEL_FLOW_PORT.',
      ),
    );
  if (!app || app.readyState !== app.OPEN)
    return Promise.reject(new Error(NOT_CONNECTED));
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
    app.send(JSON.stringify({ id, method, params }));
  });
}

const server = new McpServer(
  { name: 'strudel-flow', version: '1.0.0' },
  {
    instructions: [
      'Strudel Flow is a live music editor: Strudel (strudel.cc) code and a',
      'node canvas that are two views of one patch. Changes apply to the open',
      'app immediately and are heard if it is playing.',
      'A patch is `setcpm(bpm/beatsPerCycle)` plus lines `label: expression`;',
      '`_label:` mutes a line. Each line becomes a chain of nodes.',
      'Start with get_patch. Prefer set_code for musical changes (it keeps',
      'surviving nodes where they are); use set_node for tweaking one value.',
    ].join(' '),
  },
);

/** Registers a tool that forwards to an app command. */
function tool(
  name,
  description,
  shape,
  method = name,
  params = (input) => input,
) {
  server.registerTool(
    name,
    { description, inputSchema: shape },
    async (input) => {
      try {
        const result = await call(method, params(input));
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
  'Read the open patch: its Strudel code, tempo, whether it plays, and each line as a chain of nodes with ids, types and values.',
  {},
);
tool(
  'set_code',
  'Replace the whole patch with Strudel code. The canvas rebuilds from it; nodes that survive keep their id and place. Fails with the parse error if the code is invalid (the patch is then unchanged).',
  { code: z.string().describe('The full Strudel program.') },
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
tool('play', 'Start playback.', {}, 'set_playing', () => ({ playing: true }));
tool('stop', 'Stop playback.', {}, 'set_playing', () => ({ playing: false }));
tool('set_theme', 'Switch the strudel.cc theme of the app.', {
  name: z.string().describe('e.g. "strudelTheme", "bluescreen".'),
});
tool(
  'list_node_types',
  'List node types with the Strudel methods they write and their parameters (ranges, options).',
  {},
);

await server.connect(new StdioServerTransport());
