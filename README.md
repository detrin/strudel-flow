<img src="public/logo.svg" alt="" width="96" align="right" />

# Strudelton

A visual editor for [Strudel](https://strudel.cc) live coding where **code and
nodes are two views of the same song**. Type Strudel code in the console on
the left and the canvas on the right builds and wires the nodes; turn a knob,
wire a node or mute a line and the code is rewritten. Started as a fork of
[xyflow/strudel-flow](https://github.com/xyflow/strudel-flow) (Strudel Flow by
the creators of React Flow).

- **Code console** (optional, Ctrl+B): CodeMirror with strudel.cc's
  highlighting and keys (Ctrl+Enter play, Ctrl+. stop). Invalid code keeps
  the last valid canvas and says why.
- **Two-way sync**: each `label: expression` line is a row of nodes. New nodes
  are placed next to their neighbours; edited nodes keep their place. Code
  the nodes don't model is never lost — it becomes a Code or Method node.
- **Every node a song needs**: drum-machine banks, filters with Strudel's
  filter envelope, high-pass, delay, reverb, LFOs (Modulate), piano-roll
  Pad and Notes, and Arrange for song structure (which bars a line plays,
  with a playhead showing where the song is).
- **See what plays**: the playing notes light up in the code and the canvas.
  While a song plays, every line is measured: Filter draws the line's
  spectrum under the filter's exact response, Envelope runs a dot per note
  along its shape, Level shows a meter and the last 8 bars, Delay, Space and
  Modulate animate too, and the Analyzer node (`._spectrum()`) shows a
  spectrogram or loudness over time, for the line or the master mix.
- **Miro-style canvas**: drag empty space to select (Shift or ⌘/Ctrl + click
  adds a node) and move the selection together; two-finger swipe or the
  middle mouse button pans, pinch zooms. **Auto-arrange** lays every track
  out and aligns them left, or only the selected tracks; a `stack(…)` is
  drawn as lanes merging into one column.
- **Disable any node** with its power button: its call is commented out in
  the code; disabling a line's first node silences the line.
- **Library** (folder icon): every Strudel sound, searchable by name and
  tags, with a preview; and presets, saved lines (a bass line, a beat, a
  vocal chop) with names and tags, to listen to on their own and insert into
  any song. See [Library](#library).
- **strudel.cc's themes** (all 41, Strudel and Blue Screen included) for the
  editor and the whole UI, and strudel.cc's sample library.
- **The code is a complete save**: a `// @layout x,y …` comment above each
  line keeps where its nodes sit (upstream first). Dragging a node updates
  just that comment; **Export (share icon) → Save .strudel** saves the file,
  **Open** restores code and canvas exactly. A layout that no longer fits its line
  is ignored and rewritten.
- Knobs show exactly what plays: values the code leaves out are Strudel's own
  defaults (pinned by tests against Strudel's source).

Open **Export → Community patches → Undertow** for a 64-bar acid techno
track that uses every node.

## Install

Needs Node 20.19 or newer and pnpm 10 (`package.json` pins the version).
Node 25 and later no longer ship corepack, so install pnpm with npm:

```sh
npm install -g pnpm@10
pnpm install      # also needed for the Claude Code tools (mcp/server.mjs)
```

## Play

```sh
pnpm stable       # http://localhost:5174: main, built; re-run to update
```

The stable app is `main` built once, so nothing being edited reaches the
tab you play in. Errors from any tab are logged to
`~/.strudelton/logs/<date>.jsonl`.

## Develop

```sh
pnpm dev          # http://localhost:5173
pnpm check        # format, lint, typecheck, strict core, import cycles,
                  # dead code (knip), unit tests (round trips over every
                  # song, fuzzing)
pnpm e2e          # Playwright end-to-end tests (first time:
                  # pnpm exec playwright install chromium)
```

Commits run `pnpm check`'s gates in a pre-commit hook. CI runs them, a
build and the end-to-end tests on every push to `main`, and the fuzz tests
at depth every night (`FUZZ_RUNS=2000`; a failure names its seed, rerun it
with `FUZZ_SEED=…`).

How it works, and the plan it follows: [docs/PLAN.md](docs/PLAN.md).

```
code ─parse→ Program ─reconcile + layout→ canvas
code ←emit── Program ←compile (follows wires)── canvas
```

## Claude Code (MCP)

Claude Code can read and change the open patch while you work — "make the
hats swing", "drop the bass for 8 bars" — and you hear it immediately.

1. `pnpm dev` and open http://localhost:5173. The dev server runs a bridge
   hub at `/__bridge`; every open tab connects to it by itself (`vite
preview` builds too, with `?bridge`; `?bridge=off` opts out). The
   bottom-right badge shows when a Claude session is attached.
2. In this repo Claude Code picks up the server from `.mcp.json`. From any
   other project:

   ```sh
   claude mcp add strudelton -- node /path/to/strudelton/mcp/server.mjs
   ```

   It connects to the hub at `STRUDELTON_URL` (default
   `http://localhost:5173`). Any number of Claude sessions and tabs can be
   open; commands go to the newest tab, and survive it reloading.

Tools: `get_patch` (compact; `detail: "full"` for everything), `set_code`,
`open_file` (a song from disk, read by the server: embedded samples never
pass through the conversation), `new_patch`, `tidy`, `select_node`,
`set_node`, `set_enabled` (a node's power button), `set_muted`, `set_solo`,
`set_tempo`, `set_launch` (edits wait 0, 1 or 4 bars), `play`, `stop`,
`record_start`/`record_stop` (a WAV saved on disk, by default in
`~/.strudelton/recordings`), `add_annotation` (notes and frames),
`list_sounds`, `list_presets`, `insert_preset`, `preview_preset`,
`save_preset`, `delete_preset`, `set_theme`, `list_node_types`,
`get_diagnostics`. The hub only accepts pages served from this machine.

## Library

**Samples**: every sound Strudel has loaded. Search by name or tag (every
word must match: "808 kick"), filter by kind (drum machines, samples,
instruments, synths) and by tags, which combine. Tags come from the names
(drum abbreviations, General MIDI instruments, drum machine banks; Strudel
has no genre data) plus your own. ▶ plays a sound, + adds it as a new line.

**Presets**: save a line from a node's menu (Save line as preset) or the
Presets tab, with a name and tags. A preset carries what the line uses: its
`const`s, registered functions and the song's sample packs; the line's own
arrangement is left out unless you keep it. ▶ plays a preset on its own (at
its own tempo when tagged, e.g. "136 bpm"), then the song comes back;
Insert adds it as a new line with a free name.

With the dev server, the Library lives in **`~/.strudelton`**, one file per
preset, so it survives clearing the browser and can go in git:

```
~/.strudelton/
  presets/acid-bass.json   one file per preset, named after it
  sound-tags.json          your tags on samples
```

`STRUDELTON_HOME` moves it. Without a dev server (a deployed site), the
Library is kept in the browser; presets export and import as JSON either way.

## Local files

Set `STRUDELTON_LOCAL` (e.g. in `.env.local`) to a folder, and the dev
server serves it read-only at `/local/…`, with CORS, so songs can load their
samples from disk: `samples({ vox: ['/local/songs/vox.mp3'] })`.

## Tools for development

- `pnpm shot <song> [--tidy] [--play SECONDS] [--hide-console] [--fit]
[--size WxH] [--out PATH]`: a screenshot of the app with the song open,
  from its own dev server and browser (default `shots/<song>.png`).
- `pnpm survey <folder> [--json report.json]`: how much of a folder of songs
  the canvas models with real nodes, and the raw code left (Code and Method
  nodes) by method. Run it before and after adding a node.

## Patches

Patches in [`patches/`](patches/README.md) appear in the gallery: graph JSON
exported from the app, or plain Strudel code (`.strudel`).

## Adding a node

Add `your-name.node.ts` under `src/components/nodes/` (`instruments/`,
`sounds/` or `effects/`); it is discovered automatically. A parameter node
needs no code at all — its parameters are its Strudel methods:

```ts
import { defineNode, knob } from '@/components/nodes/define-node';

export default defineNode({
  id: 'shape-node',
  title: 'Shape',
  category: 'Audio Effects',
  icon: 'Waves',
  parameters: {
    // .shape(0.3); `implicit` is Strudel's value when the method is absent.
    shape: knob('shape', 0.3, [0, 1, 0.01], { implicit: 0 }),
  },
});
```

That one declaration gives the node its knobs, writes `.shape(0.3)`, and reads
`.shape(...)` from typed code back into the node. Nodes with richer code
provide `generate` (values → method calls, or a full expression for
instruments) and `parse` (calls → values), and the test suite checks that each
node reads its own code back. See the nodes in `src/components/nodes/` for
custom controls, envelopes and instruments.

## License

AGPL-3.0, like Strudel. `src/themes/strudel/` is vendored from
`@strudel/codemirror`.
