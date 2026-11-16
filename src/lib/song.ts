/**
 * The song: the model the app is built around. Nodes (id, type, place,
 * values), wires (in order), tempo and the prelude, nothing about how the
 * canvas shows them (selection, measured sizes, dragging). The code, the
 * sound, the autosave and undo all follow the song; the canvas is a view
 * of it plus that view state. A song object only changes when something
 * in it does, so following it means following the music, not the mouse.
 */
import type { Edge, XYPosition } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';

export type SongNode = {
  id: string;
  type: AppNode['type'];
  position: XYPosition;
  data: AppNode['data'];
};
export type SongEdge = Pick<
  Edge,
  'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle'
>;
export type Song = {
  nodes: SongNode[];
  edges: SongEdge[];
  cpm: string;
  bpc: string;
  prelude: string;
};

const sameNode = (a: SongNode, b: AppNode) =>
  a.id === b.id &&
  a.type === b.type &&
  a.data === b.data &&
  a.position.x === b.position.x &&
  a.position.y === b.position.y;
const sameEdge = (a: SongEdge, b: Edge) =>
  a.id === b.id &&
  a.source === b.source &&
  a.target === b.target &&
  (a.sourceHandle ?? null) === (b.sourceHandle ?? null) &&
  (a.targetHandle ?? null) === (b.targetHandle ?? null);

/**
 * The song in some canvas state, reusing `previous` (and its nodes and
 * wires) wherever nothing changed: the same object when nothing did.
 */
export function songOf(
  state: {
    nodes: AppNode[];
    edges: Edge[];
    cpm: string;
    bpc: string;
    prelude: string;
  },
  previous?: Song,
): Song {
  const oldNodes = new Map(previous?.nodes.map((node) => [node.id, node]));
  const oldEdges = new Map(previous?.edges.map((edge) => [edge.id, edge]));
  let changed =
    !previous ||
    previous.nodes.length !== state.nodes.length ||
    previous.edges.length !== state.edges.length ||
    previous.cpm !== state.cpm ||
    previous.bpc !== state.bpc ||
    previous.prelude !== state.prelude;
  const nodes = state.nodes.map((node, index) => {
    const old = oldNodes.get(node.id);
    if (old && sameNode(old, node)) {
      if (previous!.nodes[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: node.data,
    };
  });
  const edges = state.edges.map((edge, index) => {
    const old = oldEdges.get(edge.id);
    if (old && sameEdge(old, edge)) {
      if (previous!.edges[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    };
  });
  if (!changed) return previous!;
  return {
    nodes,
    edges,
    cpm: state.cpm,
    bpc: state.bpc,
    prelude: state.prelude,
  };
}
