import type { Edge } from '@xyflow/react';
import { createNodeByType, type AppNode } from '@/components/nodes/registry';

/** Terse graph builder for tests: `node('lpf-node', 'f', { cutoff: '800' })`. */
export function node(
  type: string,
  id: string,
  data: Record<string, unknown> = {},
  position = { x: 0, y: 0 },
): AppNode {
  const created = createNodeByType({ type, id, position });
  return { ...created, data: { ...created.data, ...data } };
}

export const wire = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
});

/** Wires a list of node ids into one chain. */
export const chainOf = (...ids: string[]) =>
  ids.slice(1).map((id, index) => wire(ids[index], id));
