import { describe, expect, it } from 'vitest';
import { transpiler } from '@strudel/web';
import type { AppNode } from '@/components/nodes/types';
import { nodeDefinitions } from '@/components/nodes/registry';
import { communityPatches } from '@/lib/community-patches';
import { programOf } from '.';
import { emitProgram, isAudible } from './emit';
import { knownSources, parseProgram } from './parse';
import { reconcile } from './reconcile';

/** What the app does when a patch is opened: the graph it ends up with. */
function open(patch: (typeof communityPatches)[number]) {
  if (patch.state)
    return {
      nodes: patch.state.nodes as AppNode[],
      edges: patch.state.edges,
      cpm: patch.state.cpm,
      bpc: patch.state.bpc ?? '4',
      prelude: patch.state.prelude ?? '',
    };
  const result = parseProgram(patch.code);
  if (!result.ok) throw new Error(result.error);
  const { program } = result;
  return {
    ...reconcile(program, { nodes: [], edges: [] }),
    cpm: program.cpm ?? '120',
    bpc: program.bpc ?? '4',
    prelude: program.prelude,
  };
}

describe('community patches', () => {
  it.each(communityPatches.map((patch) => [patch.name, patch] as const))(
    '%s opens, plays and writes valid Strudel',
    (_name, patch) => {
      const graph = open(patch);
      const program = programOf(graph);
      const code = emitProgram(program);
      expect(isAudible(program)).toBe(true);
      expect(() => transpiler(code, { emitWidgets: false })).not.toThrow();
      // Typing the canvas's own code back in changes nothing.
      const again = parseProgram(code, knownSources(graph.nodes));
      if (!again.ok) throw new Error(again.error);
      const rebuilt = reconcile(again.program, graph);
      expect(emitProgram(programOf({ ...graph, ...rebuilt }))).toBe(code);
    },
  );

  it('Undertow uses every node and arranges every line over 64 bars', () => {
    const undertow = communityPatches.find((patch) =>
      patch.name.startsWith('Undertow'),
    )!;
    const { nodes } = open(undertow);
    const used = new Set(nodes.map((node) => node.type));
    const unused = Object.keys(nodeDefinitions).filter(
      (type) =>
        !used.has(type) &&
        // Visual instruments are matched from their own code, not written;
        // Code is only the fallback for code no node models.
        ![
          'pad-node',
          'chord-node',
          'beat-machine-node',
          'mix-node',
          'custom-node',
          'method-node',
        ].includes(type),
    );
    expect(unused).toEqual([]);
    const arrangements = nodes.filter((node) => node.type === 'arrange-node');
    expect(arrangements).toHaveLength(9);
    for (const node of arrangements)
      expect(String(node.data.bars)).toHaveLength(64);
  });
});
