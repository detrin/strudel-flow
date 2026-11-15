import type { Edge, XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { AppNode } from '@/components/nodes/types';
import { nodeDefinitions } from '@/components/nodes/registry';
import { compileGraph, flatten } from './compile';
import type { ParsedProgram } from './parse';
import { ANONYMOUS, type Line, type ProgramNode } from './types';
import { groupsOf, type Group } from './groups';

type Graph = { nodes: AppNode[]; edges: Edge[] };
type Size = { width: number; height: number };

export const GAP = 60;
/** Space between nodes stacked in one column. */
const STACK_GAP = 24;
/** A stack may always grow this tall before it wraps into a new column. */
const MIN_STACK = 760;
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

/**
 * Positions for one line, in the order of its code: left to right, with
 * each run of order-free nodes (voice, effects, visuals) stacked in one
 * column like a channel strip. The Arrange ends the row, as `.mask` ends
 * the line.
 */
function rowPositions(
  members: AppNode[],
  groups: Group[],
  origin: XYPosition,
  size: (node: AppNode) => Size,
) {
  const positions: XYPosition[] = [];
  let x = origin.x;
  let bottom = origin.y;
  let column: {
    x: number;
    next: number;
    width: number;
    stack: Group | null;
  } | null = null;
  // A stack wraps into another column rather than outgrow the row's source.
  const source = members.find((_, i) => groups[i] === 'source');
  const tallest = Math.max(MIN_STACK, source ? size(source).height : 0);
  members.forEach((node, index) => {
    const { width, height } = size(node);
    // Voices, order-free effects and visuals each stack in a column.
    const stack =
      groups[index] === 'shape' ||
      groups[index] === 'source' ||
      groups[index] === 'header'
        ? null
        : groups[index];
    if (
      stack &&
      column?.stack === stack &&
      column.next + height <= origin.y + tallest
    ) {
      positions[index] = { x: column.x, y: column.next };
      column.next += height + STACK_GAP;
      column.width = Math.max(column.width, width);
    } else {
      if (column) x = column.x + column.width + GAP;
      positions[index] = { x, y: origin.y };
      column = { x, next: origin.y + height + STACK_GAP, width, stack };
    }
    bottom = Math.max(bottom, positions[index].y + height);
  });
  return { positions, bottom };
}

/** True when every node in the line has at most one input. */
const isChain = (members: AppNode[], edges: Edge[]) =>
  members.every(
    (node) => edges.filter((edge) => edge.target === node.id).length <= 1,
  );

/**
 * Places the `created` nodes next to their neighbours; lines that are new,
 * or listed in `relayout`, are laid out whole as tracks. Mutates positions.
 */
export function layout(
  { nodes, edges }: Graph,
  lines: Line[],
  created: Set<string>,
  reference: AppNode[] = nodes,
  relayout: Set<string> = new Set(),
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
    const fresh = members.every((node) => !placed.has(node.id));
    const forced = members.some((node) => relayout.has(node.id));
    if ((fresh || forced) && isChain(members, edges)) {
      const groups = groupsOf(members);
      const others = nodes.filter(
        (node) => placed.has(node.id) && !members.includes(node),
      );
      let origin: XYPosition;
      let oldBottom: number;
      if (fresh) {
        const above = lineNodes.slice(0, index).flat();
        origin = {
          x: Math.min(0, ...others.map((n) => n.position.x)),
          y: above.some((n) => placed.has(n.id))
            ? bottom(above) + GAP
            : Math.min(0, ...others.map((n) => n.position.y)),
        };
        oldBottom = origin.y - GAP;
      } else {
        origin = {
          x: Math.min(...members.map((n) => n.position.x)),
          y: Math.min(...members.map((n) => n.position.y)),
        };
        oldBottom = bottom(members);
      }
      const row = rowPositions(members, groups, origin, size);
      members.forEach((node, i) => move(node, row.positions[i]));
      // Rows below move to keep the gap between lines.
      const shift = row.bottom - oldBottom;
      if (shift)
        for (const other of others)
          if (other.position.y >= origin.y) other.position.y += shift;
      return;
    }
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
