# Strudel Flow (fork) — plan

Goal: one patch, two equal views. A **code console** on the left and the **node
canvas** on the right describe the same program. Typing code builds nodes;
wiring nodes writes code. Every Strudel feature our songs need exists as a
node, and the whole thing looks like strudel.cc (its themes, its highlighting).

Working rules: features land on `main` one at a time, each usable end to end
and covered by tests. After every 5 features we stop and simplify.

## Architecture

```
            ┌────────────── Program (pure data) ──────────────┐
 code text ─┤ parse   tempo · prelude · lines[ tree of nodes ] ├─ emit ─▶ code text
            └───────────────▲─────────────────────┬───────────┘
                     compile│                     │reconcile + layout
                            │                     ▼
                     graph (nodes + edges + positions) ◀──── canvas UI
```

`src/lib/program/` holds the four pure functions; nothing in it touches React,
the store or audio, so all of it is unit tested.

| Module         | In → out                        | Notes                                                  |
| -------------- | ------------------------------- | ------------------------------------------------------ |
| `compile.ts`   | graph → Program                 | follows wires; line order = top-to-bottom on canvas    |
| `emit.ts`      | Program → code                  | `setcpm`, prelude, one `label: expr` line per sink     |
| `parse.ts`     | code → Program                  | acorn; unknown code never lost (Code / Method nodes)   |
| `reconcile.ts` | Program + old graph → new graph | keeps ids/positions of matching nodes, lays out others |

**Semantics.** Each sink (a node with no outgoing wire that has a sound source
upstream) is one line. A node's expression is `node.generate(input)` where
`input` is its single upstream expression, or `stack(a, b, …)` when several
wires fan in. Muting a line writes `_label:` — Strudel's own mute syntax.
Code that is not a line (`samples(...)`, `const x = …`) is the **prelude**:
kept verbatim, shown in the console, not drawn as nodes.

**Node ↔ code contract.** Each node definition declares the Strudel methods it
owns. Parameter-only nodes (Filter, Level, Delay, …) need no code at all:
`defineNode` derives `generate` and `parse` from the parameter list. Anything
the parser doesn't recognise becomes a **Code** node (sources) or a **Method**
node (raw `.foo(…)` calls), so parsing is total and round-trips are lossless.

**Layout.** Matched nodes keep their position. A new node goes to the right of
its upstream neighbour (or left of its downstream one); a new line starts a
new row under everything else. Overlaps are pushed right.

**Themes.** strudel.cc's CodeMirror themes are vendored (AGPL, same licence)
in `src/themes/strudel/`. Each theme's colour settings are also mapped onto the
UI's design tokens, so the whole app follows the selected theme.

## Features

| #   | Feature                                                          | Tests                          |
| --- | ---------------------------------------------------------------- | ------------------------------ |
| F0  | Tooling: Vitest, Playwright, pre-commit hooks, CI on `main`      | smoke                          |
| F1  | Program model + wire-order compiler + emitter                    | unit                           |
| F2  | Code parser with per-node codecs, Code/Method fallback nodes     | unit, round-trip, Strudel eval |
| F3  | Reconcile + inferred layout                                      | unit                           |
| F4  | Code console (CodeMirror, Strudel highlighting), two-way sync    | integration, e2e               |
| F5  | strudel.cc themes for editor and UI (default + bluescreen + all) | unit, e2e                      |
| —   | **Simplification review #1**                                     |                                |
| F6  | Sample library like strudel.cc (drum machines) + Bank node       | unit, e2e                      |
| F7  | Filter envelope + High-pass node                                 | unit                           |
| F8  | Delay node                                                       | unit                           |
| F9  | Arrange node (`mask`, sections over bars)                        | unit                           |
| F10 | Modulate node (LFO: sine/saw/tri/square/perlin → any parameter)  | unit                           |
| —   | **Simplification review #2**                                     |                                |
| F11 | Full-song demo patch + whole-app e2e journey                     | e2e                            |

## Quality gates

- **pre-commit**: prettier (staged), eslint `--max-warnings 0`, `tsc`, unit +
  integration tests.
- **CI** (every push to `main`, every PR): install with frozen lockfile,
  format check, lint, typecheck, unit + integration tests, build.
- **E2E** (Playwright) runs locally only: `pnpm e2e`.
