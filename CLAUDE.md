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
- `pnpm check`: format, lint (0 warnings), typecheck, strict core, import
  cycles, knip, unit tests. The pre-commit hook runs it; CI
  (`.github/workflows/ci.yml`) runs it plus `pnpm e2e` on every push, and
  2000 fuzz cases nightly. Check CI after pushing:
  `gh run list -R detrin/strudelton` (`gh` defaults to the upstream repo,
  so always pass `-R`). Lint forbids non-component exports from `.tsx`
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

## How to make a change

1. Start from `main` in your own worktree (see Run and check). Read the
   section below for the area you touch.
2. Bug from the person: read `~/.strudelton/logs/` and
   `get_diagnostics` (recent commands, problems) first; reproduce it with
   the MCP tools or a test before fixing.
3. Write the failing test first where you can: a unit test next to the
   module, a corpus or fuzz case for code ↔ nodes, an e2e spec for UI.
   A fuzz failure prints its seed: `FUZZ_SEED=… pnpm test fuzz`.
4. Edit the song only through commands; parse/emit changes must keep
   `corpus.test.ts` and the fuzz tests green (they compare what plays).
5. `pnpm check`, then `pnpm e2e` (twice for flaky-looking specs), then
   look at it: `pnpm shot <song>` or the MCP tools on your dev server.
6. Commit, `git push origin main`, check CI, re-run `pnpm stable` so the
   person's tab gets it. Update this file when a rule or map changes.

Adding a node: a `*.node.ts` with `defineNode` (parameters, `generate`,
`parse`, `methods`), a parse ↔ generate unit test, a place in
`src/data/radial-menu.ts` (else it lands under "More"), use it in
`patches/undertow.strudel`, and re-run `pnpm survey ../tidalcycles/dj_dave`.

## Claude Code (MCP)

`mcp/server.mjs` (from `.mcp.json`) connects to the dev server's hub
(`mcp/hub.mjs`, served by `mcp/dev-server.mjs`); tabs connect to the same
hub from the page's origin. Commands go to the newest open tab; a request
outlives a reload. Tools: `get_patch` (compact by default), `set_code`,
`open_file` (reads the song server-side: use it for songs with embedded
samples instead of pasting them), `new_patch`, `auto_arrange` (old name `tidy`), `select_node`,
`set_node`, `set_enabled`, `set_muted`, `set_solo`, `set_tempo`,
`set_launch`, `play`, `stop`, `record_start`, `record_stop` (the tab sends
the WAV as base64; the server writes it, default
`~/.strudelton/recordings/`), `add_annotation`, `list_sounds`,
`list_presets`, `insert_preset`, `preview_preset`, `save_preset`,
`delete_preset`, `list_takes`, `tune_take`, `import_take` (a sound file
becomes a take), `set_theme`, `list_node_types`, `get_diagnostics`.
App-side handlers: `src/lib/bridge/commands.ts` (may be async). A new
feature with an app action gets a tool here too.

To find out what a sound in a song is and remake it (a YouTube link, "that
glitchy sound at 0:18"), use the `match-sound` skill
(`.claude/skills/match-sound/`): it measures the original and recordings
of the remake with `sound_match.py`.

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

Takes (the Takes tab): sounds recorded from the mic (`lib/takes/mic.ts`),
tuned by an amount toward a key and scale (`lib/takes/tune.ts`: YIN pitch,
a held note, TD-PSOLA with marks aligned by cross-correlation; pure and
unit-tested), kept as `takes/<name>.wav` (tuned), `<name>.raw.wav` (as
recorded, so a take is retuned from it) and `<name>.json` in the Library
folder (`/__library/takes`), and registered as Strudel sounds on start:
`s("name")`. They need the dev server (no browser fallback). The e2e test
records through Chromium's fake mic (`e2e/library-folder.spec.ts`).

## Playback and Strudel

- `lib/engine.ts`: the playback engine, one per tab (Strudel started once,
  live view and meters attached, a queue that plays the newest code and
  keeps the last good one). `use-workflow-runner` only decides what plays.
- `lib/strudel-internals.ts`: the only place that touches Strudel's
  undocumented internals (master gain, analysers, sound map, resetting
  the output). Its test pins @strudel/web 1.3.0: upgrading starts there.

## Tests that find bugs

- `lib/program/corpus.test.ts`: every demo patch, DJ_Dave song and
  Library preset (whichever exist here) round-trips: fixed point, nodes
  kept, layout kept, same events. Run it after any change to parsing,
  writing or layout.
- `lib/fuzz.test.ts`: random songs and random edit sequences (seeded:
  `FUZZ_SEED=… pnpm test fuzz`; `FUZZ_RUNS` for more). CI runs 2000 a
  night.
- `e2e/sound.spec.ts` measures what plays; `e2e/bug-bash.spec.ts` is a
  long real session. Both run in CI.

## Guard rails

`pnpm check` also runs `pnpm strict` (the core in `lib/program`,
commands, song, save format and engine is checked with
`noUncheckedIndexedAccess`; use `must(value, 'what')` from `lib/must.ts`
for what can't be missing) and `pnpm cycles` (no import cycles in src/;
the canvas's components map is `components/nodes/node-types.ts`, apart
from the registry, so the store never imports components). Each node
draws inside an error boundary: one failing node shows its error, the
rest goes on.

## Known limits and gotchas

- A Voice or Drums node with no sound picked writes no code, so it is not
  saved (it vanishes on reload).
- An LFO (Modulate) right after a node that sets the same control reads
  back as that node's pattern value: same sound, one node fewer. Kept so
  saved songs don't change; the fuzz test avoids it.
- A switched-off stack part is written `part.hush()`; switched-off calls
  are comments (`// .delay(…)`, `/* .gain(…) */`) that parse reads back as
  disabled nodes.
- Strudel lets notes already started ring on after `evaluate`; cutting
  sound (preview change, stop) goes through `lib/cut-sound.ts`.
- Hot reloads re-run modules: anything that must exist once per tab
  (Strudel, the engine) lives on `globalThis`.
- `.mcp.json` runs `mcp/server.mjs` from the checkout Claude Code opens:
  without `pnpm install` there it fails to connect. No pnpm on the
  machine (Node 25+ has no corepack): `npm install -g pnpm@10`.
- The Bash tool's safety check may refuse heredocs with `$`-templates;
  write the edit script to a file first.
- After a reload a tab plays nothing until it gets a click (the browser's
  autoplay rule): `play` then evaluates nothing and `record_stop` says
  "Nothing was recorded". Open the app in Playwright and click "Play
  code"; commands go to that newest tab.
- Notes ring about 20 ms past their written end (release, room); `gm_*`
  voices can be silent the first time they play (soundfont loading).

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
