/**
 * Merge-on-type: code (typed, inserted, opened) folded into the current
 * song, in one tested step. The code is parsed; every node that still
 * writes the same code keeps its id, values and place (sources matched in
 * code order, so two parts with the same code keep their own nodes); the
 * rest are new and laid out. Nothing here touches the store.
 */
import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { programOf } from '.';
import { knownSources, parseProgram } from './parse';
import { reconcile } from './reconcile';
import type { Program, ProgramNode } from './types';

type Current = {
  nodes: AppNode[];
  edges: Edge[];
  cpm: string;
  bpc: string;
  prelude: string;
};

/** The ids of a song's nodes in the order its code mentions them. */
function codeOrder(current: Current) {
  const order: string[] = [];
  const visit = (node: ProgramNode) => {
    // `stack(a, b).fx()`: a's chain, then b's, then the merge.
    node.inputs.forEach(visit);
    if (node.id) order.push(node.id);
  };
  for (const line of programOf(current).lines) visit(line.sink);
  return order;
}

export type Merged =
  | { ok: false; error: string }
  | {
      ok: true;
      program: Program & { tempoName?: string };
      nodes: AppNode[];
      edges: Edge[];
      /** New nodes the code gave no place: lay them out once measured. */
      autoPlaced: Set<string>;
      /** Nodes that did not exist before. */
      created: string[];
    };

export function mergeCode(
  code: string,
  current: Current,
  createId?: () => string,
): Merged {
  const rank = new Map(codeOrder(current).map((id, index) => [id, index]));
  const known = [...current.nodes].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
  const result = parseProgram(code, knownSources(known));
  if (!result.ok) return { ok: false, error: result.error };
  const { program } = result;
  const graph = reconcile(program, current, createId);
  const before = new Set(current.nodes.map((node) => node.id));
  return {
    ok: true,
    program: {
      ...program,
      cpm: program.cpm ?? current.cpm,
      bpc: program.bpc ?? current.bpc,
    },
    nodes: graph.nodes,
    edges: graph.edges,
    autoPlaced: graph.autoPlaced,
    created: graph.nodes
      .filter((node) => !before.has(node.id))
      .map((node) => node.id),
  };
}
