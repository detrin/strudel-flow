# Strudelton

A visual editor for Strudel where the code console and the node canvas are
two views of one program. Fork of xyflow/strudel-flow (`origin` is the fork,
`upstream` xyflow). For now, work happens on `main` (no feature branches).

## Run and check

- **Where the person plays: `pnpm stable`**, `main` built in its own git
  worktree (`../strudelton-stable`) and served on :5174 with the bridge,
  Library and /local/. It changes only when re-run, so edits in progress
  never reach the tab they play in. Re-run it after pushing to `main`.
- **Where you work: your own worktree** (`git worktree add
../strudelton-<name> main`, its own `pnpm dev --port <n>`), never the
  checkout another session or the stable app uses. Merge to `main` when
  checked. The MCP tools reach :5174 first, then :5173
  (`STRUDELTON_URL` picks one).
- **Errors from every tab go to `~/.strudelton/logs/<date>.jsonl`** (JSON
  lines: `where`, `message`, `stack`, `page`); read them before asking the
  person what broke.

- `pnpm dev`: the app at http://localhost:5173, plus the bridge hub at
  `/__bridge` (see Claude Code below). Vite restarts itself on config or
  `.env.local` changes.
- `pnpm check`: format, lint (0 warnings), typecheck, knip, unit tests. The
  pre-commit hook runs it. Lint forbids non-component exports from `.tsx`
  files (react-refresh): put helpers in `.ts` modules.
- `pnpm e2e`: Playwright (its own dev server on :5199). Specs import
  `test`/`expect` from `e2e/fixtures.ts`, which fails a test on any page
  error or `[strudelton]` report (opt out: `test.use({ allowErrors: true })`).
  Specs use
  `openFresh` (bridge off, empty storage) and `typeCode`, which waits for the
  canvas to settle; use `settle(page)` after anything that adds nodes before
  clicking or dragging on the canvas. Run a suite twice before trusting it.
- `pnpm shot <song> [--tidy] [--play S] [--hide-console] [--fit]`: screenshot
  in `shots/` (gitignored). Use it instead of throwaway specs. `--code PATH`
  saves the console's code with fresh `@layout` comments (strip the old
  ones first to lay a demo out anew).
- `pnpm survey <folder>`: share of nodes that are raw code (Code/Method) over
  a folder of songs, and which methods remain. `../tidalcycles/dj_dave` is
  the reference corpus; re-run it when adding or changing nodes.

## Claude Code (MCP)

`mcp/server.mjs` (from `.mcp.json`) connects to the dev server's hub
(`mcp/hub.mjs`, served by `mcp/dev-server.mjs`); tabs connect to the same
hub from the page's origin. Commands go to the newest open tab; a request
outlives a reload. Tools: `get_patch` (compact by default), `set_code`,
`open_file` (reads the song server-side: use it for songs with embedded
samples instead of pasting them), `new_patch`, `tidy`, `select_node`,
`set_node`, `set_enabled`, `set_muted`, `set_solo`, `set_tempo`,
`set_launch`, `play`, `stop`, `record_start`, `record_stop` (the tab sends
the WAV as base64; the server writes it, default
`~/.strudelton/recordings/`), `add_annotation`, `list_sounds`,
`list_presets`, `insert_preset`, `preview_preset`, `save_preset`,
`delete_preset`, `set_theme`, `list_node_types`, `get_diagnostics`.
App-side handlers: `src/lib/bridge/commands.ts` (may be async). A new
feature with an app action gets a tool here too.

`STRUDELTON_LOCAL` in `.env.local` serves a folder read-only at `/local/`
(here `../tidalcycles`), e.g. for samples.

## The song model

`state.song` (`src/lib/song.ts`) is the model: nodes (id, type, position,
data), wires in order, tempo, prelude, no view state. `state.nodes` and
`state.edges` are the canvas's view of it (selection, measured sizes,
dragging). Anything about the music (code sync, playback, autosave, undo,
the live view, the mixer) follows `song`, which keeps its identity until
the song really changes. `dispatch` updates both in one step.

## Code in, saved songs

- Code in (typed, inserted, opened, from Claude) goes through
  `mergeCode` (`lib/program/merge.ts`): parse, keep every node that still
  writes the same code (sources matched in code order), lay out the rest.
  Typed text is kept as typed; the `// @layout` comments it lacks are
  written when the console is left (other code gets them at once).
- Saved songs are versioned (`lib/save-format.ts`): JSON has `version`,
  `.strudel` files start with `// @strudelton 2`. Changing what a saved
  song means needs a new version and an upgrade in `upgradeState`, with a
  test that opens the old format.

## Changing the song: commands

Every change to the song's nodes, wires, tempo or prelude is a command
(`src/lib/commands.ts`): `useAppStore.getState().dispatch(command)`, or a
store action that dispatches. `apply` is pure, validates (no duplicate
ids, wires to missing nodes, self-wires or loops) and is unit-tested; the
last commands are logged (`get_diagnostics`, `__strudelton.commands()`).
Never `setState` nodes, edges, cpm, bpc or prelude directly; add a command
instead. In development, a song left inconsistent shows as a problem.

## How the code becomes nodes

`src/lib/program/`: `parse.ts` (code → Program of lines; each line a chain of
nodes), `emit.ts` (Program → code), `compile.ts` (canvas → Program, following
wires), `reconcile.ts` (keeps ids and positions; lays out new rows),
`groups.ts` (which nodes are order-free), `syntax.ts` (calls, aliases such as
`s`/`sound`, `o`/`orbit`). `src/store/code-sync.ts` keeps console and canvas
in step; `// @layout x,y …` comments above a line hold its node positions.

Nodes live in `src/components/nodes/**/*.node.ts(x)` via `defineNode`:
parameters (knob, text, select), `generate` (code it writes), `parse` (calls
it reads back), `methods`, `ordered`, `parseSource` for instruments. The
parser claims runs of calls for the node that reads and writes them back
faithfully; anything else becomes a Method (effects) or Code (sources) node.
Knobs may hold a pattern or expression instead of a number (its code, e.g.
`"<400 800>"`, `slider(…)`); `isPatternValue` tells them apart. Text
parameters hold a string, or code after `=` like a spreadsheet
(`=pick(beats, b)` writes `pick(beats, b)`; `textCode`/`textValue`).

Other pieces: `lib/live.ts` (what sounds now: code highlight, glowing
nodes), `lib/punchcards.ts` + `lib/punchcard-draw.ts`, `lib/tidy.ts` and
`lib/same-sound.ts` (reorder only when Strudel plays identical events),
`lib/node-location.ts` (canvas node → its code), `lib/mixer.ts` (solo as
Strudel's `Slabel:`, mixer strips), `lib/launch.ts` (edits wait for the next
bar: old and new patterns spliced at the boundary), `lib/recorder.ts`
(master → WAV), `lib/midi.ts` (MIDI learn, mappings in localStorage),
`lib/annotations.ts` (notes and frames: `// @note`/`// @frame` comments in
the prelude, drawn as canvas nodes outside the graph), `shared/piano-roll.tsx`
(Pad and Notes), `strudel-scope.ts` (strudel.cc's `slider`, inline visuals).

## Library (folder icon)

Samples: every sound in Strudel's `soundMap`, with kinds and tags guessed
from names (`src/lib/library/sound-tags.ts`; Strudel has no genre data) plus
the person's own tags. Presets: saved lines with name and tags
(`src/lib/library/presets.ts`), carrying the top-level `const`s they use.
With the dev server both live in `~/.strudelton` (`presets/<name>.json`,
`sound-tags.json`; `STRUDELTON_HOME` overrides), served at `/__library` by
`mcp/library-files.mjs`; the browser keeps a copy and is the fallback
without a dev server (or with `?library=browser`, which e2e uses; the e2e
server's folder is a temp dir). Presets export and import as JSON. Export/share of the whole patch is the share icon.

## Conventions

- Order is explicit, never read from positions: lines come in the order
  of their nodes in the store's `nodes`, a stack's parts in the order of
  their wires in `edges` (reconcile builds both in code order; things
  made on the canvas go last). Moving a node never reorders the code;
  Auto-arrange lays the canvas out in code order.
- The canvas follows the code: a row reads left to right in code order;
  consecutive order-free nodes stack in one column. Never reorder code unless
  it provably sounds the same (Tidy checks by playing both versions).
- A change to how code is read or written keeps every song sounding the
  same: the round-trip tests (`parse.test.ts`, `community-patches.test.ts`)
  compare Strudel's events, not text.
- New nodes need a unit test (parse ↔ generate) and, for UI, an e2e spec.
  The Undertow demo (`patches/undertow.strudel`) must use every node type;
  regenerate its `@layout` comments in a browser (`pnpm shot` flow) rather
  than by hand.
- Node definitions and their visuals must not import the store, directly
  or through `live.ts`: the store imports every definition, and the cycle
  crashes hot reloads into a blank page. Use `@/lib/lines` (line regions,
  `lineLabelOf`), which imports nothing; `meters.ts` gets the play state as
  an argument for the same reason.
- For now, always commit finished work and push it to `main`
  (`git push origin main`); no feature branches or pull requests.
- Prose in docs and UI: short, plain.
