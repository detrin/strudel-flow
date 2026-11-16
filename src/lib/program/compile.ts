import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { ANONYMOUS, type Line, type Program, type ProgramNode } from './types';

/**
 * Graph → Program. Follows wires. Order is explicit, never read from where
 * nodes sit: lines in the order of their nodes in `nodes` (code order, as
 * reconcile builds it; a line made on the canvas goes last), a node's
 * inputs (the parts of a `stack`) in the order of their wires in `edges`.
 * Moving a node never reorders the code.
 */
export function compileGraph(
  nodes: AppNode[],
  edges: Edge[],
  tempo: Pick<Program, 'cpm' | 'bpc' | 'prelude' | 'tempoName'>,
): Program {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const valid = edges.filter(
    (edge) =>
      edge.source !== edge.target &&
      byId.has(edge.source) &&
      byId.has(edge.target),
  );
  const inputsOf = (id: string) =>
    valid
      .filter((edge) => edge.target === id)
      .map((edge) => byId.get(edge.source)!);
  const rank = new Map(nodes.map((node, index) => [node.id, index]));
  const hasOutput = new Set(valid.map((edge) => edge.source));

  const build = (node: AppNode, path: Set<string>): ProgramNode => {
    const next = new Set(path).add(node.id);
    return {
      id: node.id,
      type: node.type,
      data: node.data,
      position: node.position,
      // A wire that closes a cycle is ignored.
      inputs: inputsOf(node.id)
        .filter((input) => !next.has(input.id))
        .map((input) => build(input, next)),
    };
  };

  const lines: Line[] = nodes
    .filter((node) => !hasOutput.has(node.id))
    .map((sink) => build(sink, new Set()))
    // A line comes where its first node is in `nodes`.
    .map((tree) => ({
      tree,
      first: Math.min(...flatten(tree).map((node) => rank.get(node.id!)!)),
    }))
    .sort((a, b) => a.first - b.first)
    .flatMap(({ tree }) => {
      const all = flatten(tree);
      const sources = all.filter((node) => {
        const definition = nodeDefinitions[node.type];
        return definition && isSource(definition);
      });
      if (sources.length === 0) return [];
      const label = all.find((node) => typeof node.data.label === 'string')
        ?.data.label as string | undefined;
      return [
        {
          label: label || ANONYMOUS,
          muted: sources.every((node) => node.data.state === 'paused'),
          soloed: sources.every((node) => node.data.solo === true),
          sink: tree,
        },
      ];
    });

  return { ...tempo, lines };
}

/** The node and everything upstream of it, sink first. */
export function flatten(node: ProgramNode): ProgramNode[] {
  return [node, ...node.inputs.flatMap(flatten)];
}
