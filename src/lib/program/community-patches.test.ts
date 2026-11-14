import { describe, expect, it } from 'vitest';
import { transpiler } from '@strudel/web';
import type { AppNode } from '@/components/nodes/types';
import { communityPatches } from '@/lib/community-patches';
import { compileGraph } from './compile';
import { emitProgram, isAudible } from './emit';

describe('community patches', () => {
  it.each(communityPatches.map((patch) => [patch.name, patch.state] as const))(
    '%s compiles to valid, audible Strudel',
    (_name, state) => {
      const program = compileGraph(state.nodes as AppNode[], state.edges, {
        cpm: state.cpm,
        bpc: state.bpc ?? '4',
        prelude: state.prelude ?? '',
      });
      const code = emitProgram(program);
      expect(isAudible(program)).toBe(true);
      expect(() => transpiler(code, { emitWidgets: false })).not.toThrow();
    },
  );
});
