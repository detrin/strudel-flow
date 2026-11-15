import type { Edge } from '@xyflow/react';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitLine } from '@/lib/program/emit';
import { groupsOf, TIDY_ORDER } from '@/lib/program/groups';
import { layout } from '@/lib/program/reconcile';
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
 * Tidies lines as tracks: header (Arrange) first, then the source, the
 * order-dependent chain, and the order-independent effects in one stack.
 * A line is only reordered when it provably sounds the same; otherwise its
 * order stays and its row is just laid out again. `only` limits it to the
 * line holding that node; `reorder: false` only lays rows out again.
 * Returns how many lines kept their order.
 */
export function tidyLines(only?: string, reorder = true) {
  const state = useAppStore.getState();
  const lines = programOf(state).lines;
  let edges: Edge[] = state.edges;
  let kept = 0;
  const relayout = new Set<string>();

  for (const line of lines) {
    const members = flatten(line.sink).reverse();
    const ids = members.map((node) => node.id!);
    if (only && !ids.includes(only)) continue;
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
  useAppStore.setState({ nodes, edges });
  return kept;
}
