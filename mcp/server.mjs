#!/usr/bin/env node
// MCP server that lets Claude Code read and edit the patch open in
// Strudelton. Claude Code talks to it over stdio; it reaches the app
// through the bridge hub the dev server runs at /__bridge (mcp/hub.mjs), so
// any number of Claude sessions and tabs can come and go.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import WebSocket from 'ws';
import { z } from 'zod';
import { libraryRoot } from './library-files.mjs';

// The stable app (`pnpm stable`, :5174) first, then the dev server (:5173);
// STRUDELTON_URL names one.
const APP_URLS = process.env.STRUDELTON_URL
  ? [process.env.STRUDELTON_URL]
  : ['http://localhost:5174', 'http://localhost:5173'];
const hubUrl = (app) =>
  `${app.replace(/^http/, 'ws').replace(/\/$/, '')}/__bridge?role=agent`;
const TIMEOUT_MS = 10_000;
const CONNECT_MS = 1500;
const NOT_RUNNING =
  `Strudelton is not running at ${APP_URLS.join(' or ')}. ` +
  'Run `pnpm stable` (or `pnpm dev`) in the strudelton repo, or set STRUDELTON_URL, then open the app.';

let hub;
let nextId = 1;
const pending = new Map();

/** Connects to the hub at `app` (again, after it went away). */
function connect(app) {
  if (hub && hub.readyState <= WebSocket.OPEN) return;
  const socket = new WebSocket(hubUrl(app));
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
      waiting.reject(new Error('The connection to Strudelton closed.'));
    }
  });
}

async function openHub() {
  if (hub?.readyState === WebSocket.OPEN) return hub;
  for (const app of APP_URLS) {
    hub?.terminate();
    hub = undefined;
    connect(app);
    const deadline = Date.now() + CONNECT_MS;
    while (hub?.readyState === WebSocket.CONNECTING && Date.now() < deadline)
      await new Promise((done) => setTimeout(done, 50));
    if (hub?.readyState === WebSocket.OPEN) return hub;
  }
  throw new Error(NOT_RUNNING);
}

/** Sends one command to the newest open tab and waits for its answer. */
async function call(method, params = {}) {
  const socket = await openHub();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Strudelton did not answer "${method}" in time.`));
    }, TIMEOUT_MS);
    pending.set(id, {
      resolve: (value) => (clearTimeout(timer), resolve(value)),
      reject: (error) => (clearTimeout(timer), reject(error)),
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const server = new McpServer(
  { name: 'strudelton', version: '1.2.0' },
  {
    instructions: [
      'Strudelton is a live music editor: Strudel (strudel.cc) code and a',
      'node canvas that are two views of one patch. Changes apply to the open',
      'app immediately and are heard if it is playing.',
      'A patch is `setcpm(bpm/beatsPerCycle)` plus lines `label: expression`;',
      '`_label:` mutes a line, `Slabel:` solos it. Each line becomes a chain of nodes.',
      'Start with get_patch. To open a song file use open_file (the file is',
      'read here, never pasted). Prefer set_code for musical changes (it keeps',
      'surviving nodes where they are); use set_node for tweaking one value',
      'and set_enabled to switch a node off (its call is commented out).',
      'The Library holds saved lines (presets: list_presets, insert_preset,',
      'preview_preset, save_preset) and every sound (list_sounds).',
      'Notes and frames on the canvas are `// @note x,y "text"` and',
      '`// @frame x,y,w,h "text"` comments (add_annotation adds one).',
    ].join(' '),
  },
);

/**
 * Embedded samples (`data:` URIs, often 100k+ characters) are cut from
 * replies, so a song's audio never fills the conversation.
 */
const shorten = (text) =>
  text.replace(
    /data:([\w/+.-]+);base64,[A-Za-z0-9+/=\\n]{200,}/g,
    (uri, type) => `data:${type};base64,… (${uri.length} characters)`,
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
          content: [
            { type: 'text', text: shorten(JSON.stringify(result, null, 2)) },
          ],
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
    path: z.string().describe('Absolute, or relative to the strudelton repo.'),
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
const arrangeShape = {
  node: z
    .string()
    .optional()
    .describe('A node id: arrange only its line, in place.'),
};
tool(
  'auto_arrange',
  "Auto-arrange the canvas (the app's Auto-arrange button): every line laid out as a track (order-free effects stacked; a stack(...) as lanes merging into one column), then all lines aligned left, top to bottom in code order. A line is only reordered when it provably sounds the same. With node: only that node's line, where it is.",
  arrangeShape,
  (input) => call('tidy', input),
);
// The old name, kept so existing prompts and scripts still work.
tool('tidy', 'Same as auto_arrange (its old name).', arrangeShape);
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
tool(
  'set_solo',
  'Solo or un-solo a line by its label: while any line is soloed, only soloed lines play (Strudel writes it as an S before the label). A solo replaces other solos unless `add` is true.',
  {
    line: z.string().describe('The line label, e.g. "kick" ("$" for unnamed).'),
    soloed: z.boolean(),
    add: z.boolean().optional(),
  },
);
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

tool(
  'get_diagnostics',
  "Why something isn't working in the open app: current problems (e.g. the code not following the canvas), the playback and code errors, what Strudel last played, and the recent error log with where each happened and its stack, plus the dev server's hot updates (files swapped into the tab).",
  {
    limit: z
      .number()
      .optional()
      .describe('How many recent log entries (default 30).'),
  },
);

tool(
  'set_enabled',
  "Switch a node on or off, like its power button: a disabled node's call is commented out in the code; disabling a line's first node silences the line.",
  { id: z.string(), enabled: z.boolean() },
);
tool(
  'set_launch',
  'Launch quantization: while playing, edits wait for the next bar (1), the next 4 bars (4), or play at once (0).',
  { bars: z.union([z.literal(0), z.literal(1), z.literal(4)]) },
);
tool(
  'record_start',
  'Start recording the master output to WAV (call play too, or it records silence until something plays).',
  {},
);
tool(
  'record_stop',
  'Stop recording and save the WAV on disk here. Returns the file path.',
  {
    path: z
      .string()
      .optional()
      .describe(
        'Where to save (absolute, or relative to the strudelton repo). Default: recordings/ in the Library folder (~/.strudelton).',
      ),
  },
  async ({ path }) => {
    const { name, bytes, base64 } = await call('record_stop');
    const file = resolve(path ?? join(libraryRoot(), 'recordings', name));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(base64, 'base64'));
    return { file, bytes };
  },
);
tool(
  'add_annotation',
  'Add a sticky note or a frame (a labelled area, e.g. "drums") to the canvas. Positions are canvas coordinates, like node positions; it is saved as a comment in the code.',
  {
    kind: z.enum(['note', 'frame']),
    text: z.string(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional().describe('Frames only.'),
    height: z.number().optional().describe('Frames only.'),
  },
);
tool(
  'list_sounds',
  'Search every sound Strudel knows (samples, drum machines, instruments, synths) by name and tags (guessed from names, plus the user\'s own). Use it to pick a sound for s("…").',
  {
    query: z.string().optional().describe('Words that must all match.'),
    kind: z.enum(['drum machine', 'sample', 'instrument', 'synth']).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().optional().describe('Default 50.'),
  },
);
tool(
  'list_presets',
  'List the user\'s presets: saved lines (a bass line, a beat) with names and tags. Long code is shortened unless detail is "full".',
  {
    query: z.string().optional(),
    tags: z.array(z.string()).optional(),
    detail: z.enum(['compact', 'full']).optional(),
  },
);
tool(
  'insert_preset',
  'Add a preset as a new line at the end of the song, with the declarations it needs. The label is made unique.',
  {
    preset: z.string().describe('Its id, or its name.'),
    label: z.string().optional(),
  },
);
tool(
  'preview_preset',
  'Play a preset on its own instead of the song (at its own tempo if tagged "N bpm"); stop: true ends the preview.',
  {
    preset: z.string().optional().describe('Its id, or its name.'),
    stop: z.boolean().optional(),
  },
);
tool(
  'save_preset',
  'Save a line of the song as a preset in the Library. Its Arrange masks are dropped unless keepArrangement; tags are suggested when not given.',
  {
    line: z.string().describe('The line label.'),
    name: z.string().optional(),
    tags: z.array(z.string()).optional(),
    keepArrangement: z.boolean().optional(),
  },
);
tool('delete_preset', 'Delete a preset from the Library.', {
  preset: z.string().describe('Its id, or its name.'),
});

// Connect early, so the first tool call doesn't wait for it.
void openHub().catch(() => {});
await server.connect(new StdioServerTransport());
