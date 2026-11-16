import type { Edge } from '@xyflow/react';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitLine } from '@/lib/program/emit';
import { groupsOf, TIDY_ORDER } from '@/lib/program/groups';
import { GAP, layout } from '@/lib/program/reconcile';
import type { Line } from '@/lib/program/types';
import { sameSound } from '@/lib/same-sound';

/** A line's code without its label and layout comment. */
const expressionOf = (line: Line) =>
  emitLine({ ...line, muted: false, soloed: false })
    .split('\n')
    .filter((text) => !text.trimStart().startsWith('//'))
    .join('\n')
    .replace(/^[\w$]+:\s*/, '');

/**
 * Auto-arrange: lays lines out as tracks: header (Arrange) first, then the
 * source, the order-dependent chain, and the order-independent effects in
 * one stack; a line that merges parts (`stack(…)`) as lanes into one
 * column. A line is only reordered when it provably sounds the same;
 * otherwise its order stays and its row is just laid out again.
 *
 * `only`: the lines holding these nodes, each arranged where it is.
 * Without it, every line, then all of them lined up flush left, top to
 * bottom in code order. `reorder: false` only lays rows out again.
 * Returns how many lines kept their order.
 */
export function tidyLines(only?: string | string[], reorder = true) {
  const state = useAppStore.getState();
  const lines = programOf(state).lines;
  const wanted = only === undefined ? null : new Set([only].flat());
  let edges: Edge[] = state.edges;
  let kept = 0;
  const relayout = new Set<string>();

  for (const line of lines) {
    const members = flatten(line.sink).reverse();
    const ids = members.map((node) => node.id!);
    if (wanted && !ids.some((id) => wanted.has(id))) continue;
    ids.forEach((id) => relayout.add(id));
    // Only simple chains (one input each) can be reordered.
    if (!reorder || members.some((node) => node.inputs.length > 1)) continue;
    const groups = groupsOf(members);
    const order = TIDY_ORDER.flatMap((group) =>
      ids.filter((_, i) => groups[i] === group),
    );
    if (order.join() === ids.join()) continue;

    const inLine = new Set(ids);
    const candidate = [
      ...edges.filter(
        (edge) => !(inLine.has(edge.source) && inLine.has(edge.target)),
      ),
      ...order.slice(1).map((id, i) => ({
        id: `${order[i]}-${id}`,
        source: order[i],
        target: id,
        type: 'default',
      })),
    ];
    const reordered = programOf({ ...state, edges: candidate }).lines.find(
      (other) => flatten(other.sink).some((node) => node.id === ids[0]),
    );
    if (reordered && sameSound(expressionOf(line), expressionOf(reordered)))
      edges = candidate;
    else kept++;
  }

  const nodes = state.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
  }));
  layout(
    { nodes, edges },
    programOf({ ...state, nodes, edges }).lines,
    new Set(),
    nodes,
    relayout,
  );
  if (!wanted) alignLeft(programOf({ ...state, nodes, edges }).lines, nodes);
  useAppStore
    .getState()
    .dispatch({ type: 'setGraph', nodes, edges, reason: 'arrange' });
  return kept;
}

/**
 * Lines up every line flush left, in code order from the top one down,
 * a gap apart. Mutates positions.
 */
function alignLeft(
  lines: Line[],
  nodes: {
    id: string;
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
  }[],
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rows = lines
    .map((line) =>
      flatten(line.sink).flatMap((member) => {
        const node = member.id ? byId.get(member.id) : undefined;
        return node ? [node] : [];
      }),
    )
    .filter((row) => row.length);
  if (!rows.length) return;
  const all = rows.flat();
  const left = Math.min(...all.map((node) => node.position.x));
  let top = Math.min(...all.map((node) => node.position.y));
  for (const row of rows) {
    const x = Math.min(...row.map((node) => node.position.x));
    const y = Math.min(...row.map((node) => node.position.y));
    const bottom = Math.max(
      ...row.map((node) => node.position.y + (node.measured?.height ?? 220)),
    );
    for (const node of row) {
      node.position.x += left - x;
      node.position.y += top - y;
    }
    top += bottom - y + GAP;
  }
}
