# Strudel Flow (fork)

A visual editor for [Strudel](https://strudel.cc) patterns where **code and
nodes are two views of the same program**. Type Strudel code in the console on
the left and the canvas on the right builds and wires the nodes; turn a knob,
wire a node or mute a line and the code is rewritten. Forked from
[xyflow/strudel-flow](https://github.com/xyflow/strudel-flow).

- **Code console** (optional, Ctrl+B): CodeMirror with strudel.cc's
  highlighting and keys (Ctrl+Enter play, Ctrl+. stop). Invalid code keeps
  the last valid canvas and says why.
- **Two-way sync**: each `label: expression` line is a row of nodes. New nodes
  are placed next to their neighbours; edited nodes keep their place. Code
  the nodes don't model is never lost — it becomes a Code or Method node.
- **Every node a song needs**: drum-machine banks, filters with Strudel's
  filter envelope, high-pass, delay, reverb, LFOs (Modulate), and Arrange
  for song structure (which bars a line plays).
- **strudel.cc's themes** (all 41, Strudel and Blue Screen included) for the
  editor and the whole UI, and strudel.cc's sample library.
- **The code is a complete save**: a `// @layout x,y …` comment above each
  line keeps where its nodes sit (upstream first). Dragging a node updates
  just that comment; **Patches → Save .strudel** saves the file, **Open**
  restores code and canvas exactly. A layout that no longer fits its line
  is ignored and rewritten.
- Knobs show exactly what plays: values the code leaves out are Strudel's own
  defaults (pinned by tests against Strudel's source).

Open **Patches → Community patches → Undertow** for a 64-bar acid techno
track that uses every node.

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # format, lint, typecheck, dead code (knip), unit tests
pnpm e2e          # Playwright end-to-end tests (local only)
```

Commits run `pnpm check`'s gates in a pre-commit hook; CI runs them (plus a
build) on every push to `main`. End-to-end tests run locally only.

How it works, and the plan this fork follows: [docs/PLAN.md](docs/PLAN.md).

```
code ─parse→ Program ─reconcile + layout→ canvas
code ←emit── Program ←compile (follows wires)── canvas
```

## Claude Code (MCP)

Claude Code can read and change the open patch while you work — "make the
hats swing", "drop the bass for 8 bars" — and you hear it immediately.

1. `pnpm dev` and open http://localhost:5173. In development the app connects
   to the bridge by itself (any build: add `?bridge`); the bottom-right badge
   shows it.
2. In this repo Claude Code picks up the server from `.mcp.json`. From any
   other project:

   ```sh
   claude mcp add strudel-flow -- node /path/to/strudel-flow/mcp/server.mjs
   ```

Tools: `get_patch`, `set_code`, `set_node`, `set_muted`, `set_tempo`,
`play`, `stop`, `set_theme`, `list_node_types`. The bridge listens on
`127.0.0.1:4331` (`STRUDEL_FLOW_PORT` to change; `?bridge=PORT` in the app)
and only accepts pages served from this machine.

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
