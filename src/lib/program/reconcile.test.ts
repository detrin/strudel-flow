import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { chainOf, node } from '@/test/graph';
import { compileGraph } from './compile';
import { emitProgram } from './emit';
import { knownSources, parseProgram } from './parse';
import { GAP, reconcile } from './reconcile';

const tempo = { cpm: '120', bpc: '4', prelude: '' };
type Graph = { nodes: AppNode[]; edges: Edge[] };
let next = 0;
const createId = () => `n${++next}`;

/** What happens when the user types `code` into the console. */
function typeCode(code: string, graph: Graph = { nodes: [], edges: [] }) {
  const result = parseProgram(code, knownSources(graph.nodes));
  if (!result.ok) throw new Error(result.error);
  return reconcile(result.program, graph, createId);
}
const codeOf = (graph: Graph) =>
  emitProgram(compileGraph(graph.nodes, graph.edges, tempo));
const find = (graph: Graph, type: string) =>
  graph.nodes.filter((node) => node.type === type);

describe('reconcile', () => {
  it('builds rows from code, left to right in chain order', () => {
    const graph = typeCode(
      '$: s("bd*4").lpf(800).gain(0.5)\n$: s("hh*8").room(0.2)',
    );
    const [kick, hat] = find(graph, 'custom-node');
    const [filter] = find(graph, 'lpf-node');
    const [level] = find(graph, 'level-node');
    expect(filter.position.y).toBe(kick.position.y);
    expect(filter.position.x).toBeGreaterThan(kick.position.x);
    expect(level.position.x).toBeGreaterThan(filter.position.x);
    expect(hat.position.y).toBeGreaterThan(kick.position.y);
    expect(
      graph.edges.map((edge) => [edge.source, edge.target]),
    ).toContainEqual([kick.id, filter.id]);
  });

  it('round-trips: the code it writes rebuilds the same canvas', () => {
    const typed =
      'kick: s("bd*4").lpf(800)\n_hat: stack(s("hh*8"), s("oh")).room(0.2)';
    const graph = typeCode(typed);
    const code = codeOf(graph);
    expect(code).toMatch(/\/\/ @layout \d+,\d+ \d+,\d+\nkick: s\("bd\*4"\)/);
    // A fresh canvas from that code alone: same code, same places.
    const reopened = typeCode(code);
    expect(codeOf(reopened)).toBe(code);
    expect(reopened.nodes.map((n) => n.position)).toEqual(
      graph.nodes.map((n) => n.position),
    );
  });

  it('puts nodes where the layout comment says', () => {
    const graph = typeCode('// @layout 10,20 500,20\nkick: s("bd").gain(1)');
    expect(graph.nodes.map((n) => n.position)).toEqual([
      { x: 10, y: 20 },
      { x: 500, y: 20 },
    ]);
    expect(graph.autoPlaced.size).toBe(0);
  });

  it('ignores a layout that no longer fits the line', () => {
    const before = typeCode('// @layout 10,20 500,20\nkick: s("bd").gain(1)');
    const after = typeCode(
      '// @layout 10,20 500,20\nkick: s("bd").lpf(300).gain(1)',
      before,
    );
    // Survivors keep their place; the new Filter is placed after its input.
    const [filter] = find(after, 'lpf-node');
    expect(find(after, 'custom-node')[0].position).toEqual({ x: 10, y: 20 });
    expect(filter.position.x).toBeGreaterThan(10);
  });

  it('keeps id and position when a source is edited', () => {
    const before = typeCode('$: s("bd*4").lpf(800)');
    before.nodes[0].position = { x: 123, y: 45 };
    const after = typeCode('$: s("bd*8").lpf(900)', before);
    expect(after.nodes.map((n) => [n.id, n.position])).toEqual(
      before.nodes.map((n) => [n.id, n.position]),
    );
    expect(after.nodes[0].data.customPattern).toBe('s("bd*8")');
  });

  it('makes room for an effect inserted mid-chain', () => {
    const before = typeCode('$: s("bd").lpf(800).gain(0.5)');
    const level = find(before, 'level-node')[0];
    const after = typeCode('$: s("bd").lpf(800).room(0.3).gain(0.5)', before);
    const [room] = find(after, 'room-node');
    const [filter] = find(after, 'lpf-node');
    const [movedLevel] = find(after, 'level-node');
    expect(movedLevel.id).toBe(level.id);
    expect(room.position.x).toBeGreaterThan(filter.position.x);
    expect(movedLevel.position.x).toBeGreaterThanOrEqual(
      room.position.x + 300 + GAP,
    );
  });

  it('puts a new line under the line before it, pushing later rows down', () => {
    const before = typeCode('$: s("bd")\n$: s("hh")');
    const [, hatBefore] = find(before, 'custom-node');
    const after = typeCode('$: s("bd")\n$: s("cp")\n$: s("hh")', before);
    const clap = after.nodes.find((n) => n.data.customPattern === 's("cp")')!;
    const hat = after.nodes.find((n) => n.id === hatBefore.id)!;
    expect(clap.position.y).toBeGreaterThan(
      find(after, 'custom-node')[0].position.y,
    );
    expect(hat.position.y).toBeGreaterThan(clap.position.y);
  });

  it('keeps instrument nodes when other code changes', () => {
    const pad = node('pad-node', 'pad', { grid: [[true]] });
    const graph = { nodes: [pad], edges: [] };
    const code = codeOf(graph).replace('setcpm(120/4)', 'setcpm(90/4)');
    const after = typeCode(`${code}\n$: s("bd")`, graph);
    expect(find(after, 'pad-node').map((n) => n.id)).toEqual(['pad']);
  });

  it('leaves scratch nodes alone and removes deleted lines', () => {
    const before = {
      nodes: [
        node('custom-node', 'k', { customPattern: 's("bd")' }),
        node('level-node', 'g'),
        node('lpf-node', 'scratch', {}, { x: 900, y: 900 }),
      ],
      edges: chainOf('k', 'g'),
    };
    const after = typeCode('$: s("hh")', before);
    expect(after.nodes.map((n) => n.id).sort()).toEqual(['k', 'scratch']);
  });

  it('resets parameters the code dropped but keeps UI-only data', () => {
    const before = typeCode('$: s("bd").gain(0.5).pan(0.2)');
    before.nodes[1].data.note = 'ui only';
    const after = typeCode('$: s("bd").gain(0.5)', before);
    expect(after.nodes[1].data).toMatchObject({
      gain: '0.5',
      pan: '0.5',
      note: 'ui only',
    });
  });
});
