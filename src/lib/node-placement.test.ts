import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { createNodeByType, type AppNode } from '@/components/nodes/registry';
import { insertNodeAfter, NODE_GAP } from './node-placement';

const node = (id: string, type: string, x: number): AppNode => ({
  ...createNodeByType({ id, type, position: { x, y: 100 } }),
  measured: { width: 200, height: 150 },
});
const wire = (source: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
});

describe('insertNodeAfter', () => {
  it('places the new node to the right, wired from the node', () => {
    const graph = { nodes: [node('a', 'custom-node', 0)], edges: [] };
    const result = insertNodeAfter(graph, 'a', node('b', 'lpf-node', 0));
    expect(result.nodes.find((n) => n.id === 'b')?.position).toEqual({
      x: 200 + NODE_GAP,
      y: 100,
    });
    expect(result.edges).toEqual([
      expect.objectContaining({ source: 'a', target: 'b' }),
    ]);
  });

  it('splices into a chain and moves later nodes out of the way', () => {
    const graph = {
      nodes: [
        node('a', 'custom-node', 0),
        node('c', 'delay-node', 280),
        node('d', 'room-node', 560),
      ],
      edges: [wire('a', 'c'), wire('c', 'd')],
    };
    const result = insertNodeAfter(graph, 'a', node('b', 'lpf-node', 0));
    const links = result.edges.map((e) => `${e.source}>${e.target}`).sort();
    expect(links).toEqual(['a>b', 'b>c', 'c>d']);
    const x = (id: string) => result.nodes.find((n) => n.id === id)!.position.x;
    expect(x('b')).toBe(280);
    expect(x('c')).toBe(560);
    expect(x('d')).toBe(840);
  });

  it('leaves later nodes alone when there is room', () => {
    const graph = {
      nodes: [node('a', 'custom-node', 0), node('c', 'delay-node', 2000)],
      edges: [wire('a', 'c')],
    };
    const result = insertNodeAfter(graph, 'a', node('b', 'lpf-node', 0));
    expect(result.nodes.find((n) => n.id === 'c')!.position.x).toBe(2000);
  });
});
