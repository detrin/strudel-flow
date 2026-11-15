import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { ANONYMOUS, type Line, type Program, type ProgramNode } from './types';

const byPosition = (a: AppNode, b: AppNode) =>
  a.position.y - b.position.y || a.position.x - b.position.x;

/** Graph → Program. Follows wires; lines are ordered top to bottom. */
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
      .map((edge) => byId.get(edge.source)!)
      .sort(byPosition);
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
    .sort(byPosition)
    .flatMap((sink) => {
      const tree = build(sink, new Set());
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
