import type { Edge, XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { AppNode } from '@/components/nodes/types';
import { nodeDefinitions } from '@/components/nodes/registry';
import { compileGraph, flatten } from './compile';
import type { ParsedProgram } from './parse';
import { ANONYMOUS, type Line, type ProgramNode } from './types';

type Graph = { nodes: AppNode[]; edges: Edge[] };
type Size = { width: number; height: number };

export const GAP = 60;
const DEFAULT_SIZE: Size = { width: 300, height: 220 };

/** Upstream first, the order nodes appear in a line of code. */
const ordered = (line: Line) => flatten(line.sink).reverse();

/** Pairs each new line with the old line it most likely edits. */
function pairLines(lines: Line[], oldLines: Line[]) {
  const claimed = new Set<Line>();
  const claim = (line: Line | undefined) => {
    if (line) claimed.add(line);
    return line;
  };
  const free = (line: Line) => !claimed.has(line);
  const oldLineOf = new Map(
    oldLines.flatMap((line) => ordered(line).map((node) => [node.id, line])),
  );
  const pairs = new Map<Line, Line | undefined>();
  // A shared node is the strongest evidence, then a label, then order.
  for (const line of lines) {
    const ids = ordered(line).flatMap((node) => (node.id ? [node.id] : []));
    const old = ids.map((id) => oldLineOf.get(id)).find((l) => l && free(l));
    if (old) pairs.set(line, claim(old));
  }
  for (const line of lines.filter((line) => !pairs.has(line))) {
    const old =
      line.label === ANONYMOUS
        ? oldLines.find((old) => free(old) && old.label === ANONYMOUS)
        : oldLines.find((old) => free(old) && old.label === line.label);
    pairs.set(line, claim(old));
  }
  return pairs;
}

/** Gives every new node an id, reusing old ids where the node survived. */
function matchIds(lines: Line[], oldLines: Line[], oldIds: Set<string>) {
  const used = new Set<string>();
  for (const line of lines)
    for (const node of ordered(line))
      if (node.id && oldIds.has(node.id) && !used.has(node.id))
        used.add(node.id);
      else delete node.id;
  for (const [line, old] of pairLines(lines, oldLines)) {
    if (!old) continue;
    const candidates = ordered(old);
    for (const node of ordered(line)) {
      if (node.id) continue;
      const match = candidates.find(
        (candidate) => candidate.type === node.type && !used.has(candidate.id!),
      );
      if (match) used.add((node.id = match.id!));
    }
  }
}

function nodeData(node: ProgramNode, previous: AppNode | undefined) {
  const definition = nodeDefinitions[node.type];
  const parameterDefaults = Object.fromEntries(
    Object.keys(definition?.parameters ?? {}).map((key) => [
      key,
      definition.defaults[key],
    ]),
  );
  return {
    ...(previous?.data ?? {
      ...definition?.defaults,
      title: definition?.title,
      icon: definition?.icon,
    }),
    // Parameters the code no longer mentions go back to their defaults.
    ...parameterDefaults,
    ...node.data,
  };
}

/**
 * Program + current graph → new graph. Surviving nodes keep their id and
 * position; new nodes are placed next to their neighbours; old nodes that
 * were not part of any line (scratch nodes) are left untouched.
 */
export function reconcile(
  program: ParsedProgram,
  old: Graph,
  createId: () => string = nanoid,
): Graph & { autoPlaced: Set<string> } {
  const oldById = new Map(old.nodes.map((node) => [node.id, node]));
  const oldLines = compileGraph(old.nodes, old.edges, {
    cpm: '',
    bpc: '',
    prelude: '',
  }).lines;
  const inLine = new Set(
    oldLines.flatMap((line) => ordered(line).map((node) => node.id!)),
  );
  matchIds(program.lines, oldLines, new Set(inLine));

  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  /** New nodes the code gives no position for. */
  const autoPlaced = new Set<string>();
  for (const line of program.lines) {
    for (const node of ordered(line)) {
      if (!node.id) {
        node.id = createId();
        if (!node.position) autoPlaced.add(node.id);
      }
      const previous = oldById.get(node.id);
      nodes.push({
        ...previous,
        // A position written in the code wins over where the node was.
        position: node.position ?? previous?.position ?? { x: 0, y: 0 },
        id: node.id,
        type: node.type,
        data: nodeData(node, previous),
      });
      for (const input of node.inputs)
        edges.push({
          id: `${input.id}-${node.id}`,
          source: input.id!,
          target: node.id,
          type: 'default',
        });
    }
  }

  const scratch = old.nodes.filter((node) => !inLine.has(node.id));
  const scratchIds = new Set(scratch.map((node) => node.id));
  const graph = {
    nodes: [...nodes, ...scratch],
    edges: [
      ...edges,
      ...old.edges.filter(
        (edge) => scratchIds.has(edge.source) && scratchIds.has(edge.target),
      ),
    ],
  };
  layout(graph, program.lines, autoPlaced, old.nodes);
  return { ...graph, autoPlaced };
}

/** Places the `created` nodes next to their neighbours. Mutates positions. */
export function layout(
  { nodes, edges }: Graph,
  lines: Line[],
  created: Set<string>,
  reference: AppNode[] = nodes,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const size = (node: AppNode): Size => {
    const sample =
      node.measured?.width !== undefined
        ? node
        : reference.find(
            (other) => other.type === node.type && other.measured?.width,
          );
    return {
      width: sample?.measured?.width ?? DEFAULT_SIZE.width,
      height: sample?.measured?.height ?? DEFAULT_SIZE.height,
    };
  };
  const placed = new Set(
    nodes.filter((node) => !created.has(node.id)).map((node) => node.id),
  );
  const move = (node: AppNode, position: XYPosition) => {
    node.position = position;
    placed.add(node.id);
  };
  const downstream = (id: string): AppNode[] =>
    edges
      .filter((edge) => edge.source === id)
      .flatMap((edge) => [byId.get(edge.target)!, ...downstream(edge.target)]);
  const bottom = (members: AppNode[]) =>
    Math.max(
      ...members
        .filter((node) => placed.has(node.id))
        .map((node) => node.position.y + size(node).height),
    );

  const lineNodes = lines.map((line) =>
    ordered(line).map((node) => byId.get(node.id!)!),
  );
  lineNodes.forEach((members, index) => {
    for (const node of members) {
      if (placed.has(node.id)) continue;
      const input = edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => byId.get(edge.source)!)
        .find((other) => placed.has(other.id));
      const consumer = downstream(node.id).find((other) =>
        placed.has(other.id),
      );
      if (input) {
        // Right of its input; whatever sits there moves right to make room.
        const x = input.position.x + size(input).width + GAP;
        move(node, { x, y: input.position.y });
        const room = x + size(node).width + GAP;
        const after = downstream(node.id).filter((other) =>
          placed.has(other.id),
        );
        const shift = Math.max(0, ...after.map((o) => room - o.position.x));
        for (const other of after) other.position.x += shift;
      } else if (consumer) {
        move(node, {
          x: consumer.position.x - size(node).width - GAP,
          y: consumer.position.y,
        });
      } else {
        // First node of a new row: below the previous line, pushing the
        // lines after it down.
        const above = lineNodes.slice(0, index).flat();
        const x = Math.min(
          0,
          ...nodes.filter((n) => placed.has(n.id)).map((n) => n.position.x),
        );
        const y = above.some((n) => placed.has(n.id))
          ? bottom(above) + GAP
          : Math.min(
              0,
              ...nodes.filter((n) => placed.has(n.id)).map((n) => n.position.y),
            );
        const height = Math.max(...members.map((n) => size(n).height));
        for (const other of nodes)
          if (placed.has(other.id) && other.position.y >= y)
            other.position.y += height + GAP;
        move(node, { x, y });
      }
    }
  });
}
