import type { Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/registry';

/** Space between a node and the one added next to it. */
export const NODE_GAP = 80;
/** Width of a node that has not been measured yet. */
const DEFAULT_WIDTH = 256;
/** Where a dropped node is held: near its header's left edge. */
export const DROP_OFFSET = { x: 40, y: 24 };

export function nodeWidth(node: AppNode | undefined, nodes: AppNode[] = []) {
  return (
    node?.measured?.width ??
    nodes.find((other) => other.type === node?.type && other.measured?.width)
      ?.measured?.width ??
    DEFAULT_WIDTH
  );
}

/** A node dropped at `point` (flow coordinates), grabbed near its header. */
export function dropPosition(point: XYPosition): XYPosition {
  return { x: point.x - DROP_OFFSET.x, y: point.y - DROP_OFFSET.y };
}

/**
 * Adds `newNode` right after `fromId` in its chain, like Miro's "+" handle:
 * placed to its right, wired from it, and taking over its outgoing wires.
 * Nodes further down the chain move right when they would overlap.
 */
export function insertNodeAfter(
  graph: { nodes: AppNode[]; edges: Edge[] },
  fromId: string,
  newNode: AppNode,
): { nodes: AppNode[]; edges: Edge[] } {
  const from = graph.nodes.find((node) => node.id === fromId);
  if (!from) return { nodes: [...graph.nodes, newNode], edges: graph.edges };

  const placed: AppNode = {
    ...newNode,
    position: {
      x: from.position.x + nodeWidth(from, graph.nodes) + NODE_GAP,
      y: from.position.y,
    },
  };
  const right = placed.position.x + nodeWidth(placed, graph.nodes) + NODE_GAP;

  const rewired = graph.edges.map((edge) =>
    edge.source === fromId
      ? {
          ...edge,
          id: `${placed.id}-${edge.target}`,
          source: placed.id,
          sourceHandle: null,
        }
      : edge,
  );
  const edges: Edge[] = [
    ...rewired,
    {
      id: `${fromId}-${placed.id}`,
      source: fromId,
      target: placed.id,
      type: 'default',
    },
  ];

  const downstream = reachableFrom(placed.id, rewired);
  const nearest = Math.min(
    ...graph.nodes
      .filter((node) => downstream.has(node.id))
      .map((node) => node.position.x),
  );
  const shift = Number.isFinite(nearest) ? Math.max(0, right - nearest) : 0;
  const nodes = graph.nodes.map((node) =>
    shift && downstream.has(node.id)
      ? { ...node, position: { ...node.position, x: node.position.x + shift } }
      : node,
  );
  return { nodes: [...nodes, placed], edges };
}

function reachableFrom(id: string, edges: Edge[]) {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.pop()!;
    for (const edge of edges) {
      if (edge.source === current && !seen.has(edge.target)) {
        seen.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  seen.delete(id);
  return seen;
}
