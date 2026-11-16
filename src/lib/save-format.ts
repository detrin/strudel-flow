/**
 * Saved songs carry the version of the format they were saved in, and
 * older ones are upgraded explicitly when opened, so a change to what a
 * saved song means never silently changes how an old one sounds.
 *
 * - JSON (the autosave, share links, exported .json): `version`.
 *   1 (no `version`): lines ordered by where their last node sat, a
 *     stack's parts by height. 2: by the order of `nodes` and `edges`.
 * - .strudel files: a first line `// @strudelton 2`. The code itself says
 *   its order, so its versions differ in nothing yet.
 *
 * Pure: imports nothing from the app.
 */

export const FORMAT_VERSION = 2;

type Position = { x: number; y: number };
type SavedNode = { id: string; position: Position };
type SavedEdge = { id: string; source: string; target: string };
type Saved = { version?: number; nodes: SavedNode[]; edges: SavedEdge[] };

/** Thrown for a song saved by a newer Strudelton. */
export class NewerFormatError extends Error {
  constructor(version: number) {
    super(
      `This song was saved by a newer Strudelton (format ${version}); update the app to open it.`,
    );
  }
}

const byPlace = (a: Position, b: Position) => a.y - b.y || a.x - b.x;

/**
 * Version 1 → 2: puts `nodes` and `edges` in the order version 1 played
 * them, which version 2 reads from the arrays: lines by where their last
 * node (the one nothing follows) sat, top to bottom; a node's inputs (a
 * stack's parts) top to bottom.
 */
function fromVersion1<T extends Saved>(state: T): T {
  const place = new Map(state.nodes.map((node) => [node.id, node.position]));
  const next = new Map<string, string>();
  for (const edge of state.edges)
    if (!next.has(edge.source)) next.set(edge.source, edge.target);
  const sinkOf = (id: string) => {
    const seen = new Set<string>();
    while (next.has(id) && !seen.has(id)) {
      seen.add(id);
      id = next.get(id)!;
    }
    return id;
  };
  const nodes = state.nodes
    .map((node, index) => ({ node, index, sink: place.get(sinkOf(node.id))! }))
    .sort((a, b) => byPlace(a.sink, b.sink) || a.index - b.index)
    .map(({ node }) => node);
  // Wires into the same node: by where their sources sat.
  const groups = new Map<string, SavedEdge[]>();
  for (const edge of state.edges) {
    const group = groups.get(edge.target) ?? [];
    group.push(edge);
    groups.set(edge.target, group);
  }
  const edges = [...groups.values()].flatMap((group) =>
    [...group].sort((a, b) =>
      byPlace(place.get(a.source)!, place.get(b.source)!),
    ),
  );
  return { ...state, nodes, edges, version: 2 };
}

/** A saved JSON state in the current format (throws if it's newer). */
export function upgradeState<T extends Saved>(state: T): T {
  const version = state.version ?? 1;
  if (version > FORMAT_VERSION) throw new NewerFormatError(version);
  return version < 2 ? fromVersion1(state) : state;
}

const MARK = /^\/\/ @strudelton (\d+)[ \t]*\r?\n/;

/** A song's code as a .strudel file. */
export const strudelFile = (code: string) =>
  `// @strudelton ${FORMAT_VERSION}\n${code}`;

/** A .strudel file's code, without its version line (throws if newer). */
export function readStrudelFile(text: string): string {
  const mark = MARK.exec(text);
  if (!mark) return text;
  const version = Number(mark[1]);
  if (version > FORMAT_VERSION) throw new NewerFormatError(version);
  return text.slice(mark[0].length);
}
