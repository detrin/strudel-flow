import { describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  NewerFormatError,
  readStrudelFile,
  strudelFile,
  upgradeState,
} from './save-format';
import { stateFromJson } from './project-state';
import { programOf } from './program';
import { emitProgram } from './program/emit';
import type { AppNode } from '@/components/nodes/types';

const at = (x: number, y: number) => ({ x, y });
const source = (id: string, pattern: string, y: number) => ({
  id,
  type: 'custom-node',
  position: at(0, y),
  data: { customPattern: pattern },
});

describe('save format', () => {
  it('opens a version 1 song in the order version 1 played it', () => {
    // Version 1 ordered lines by height: hats (y 0) above kick (y 300),
    // whatever the array said; and a stack's parts by height too.
    const v1: {
      version?: number;
      cpm: string;
      nodes: ReturnType<typeof source>[];
      edges: { id: string; source: string; target: string }[];
    } = {
      cpm: '120',
      nodes: [
        source('k', 's("bd")', 300),
        source('b', 's("cp")', 900),
        source('a', 's("hh")', 0),
        {
          id: 'g',
          type: 'level-node',
          position: at(400, 600),
          data: { customPattern: '' },
        },
        source('c', 's("rim")', 500),
      ],
      edges: [
        { id: 'b-g', source: 'b', target: 'g' },
        { id: 'c-g', source: 'c', target: 'g' },
      ],
    };
    const opened = upgradeState(v1);
    expect(opened.version).toBe(2);
    const code = emitProgram(
      programOf({
        nodes: opened.nodes as AppNode[],
        edges: opened.edges,
        cpm: '120',
        bpc: '4',
        prelude: '',
      }),
    );
    const lines = code.split('\n').filter((row) => row.startsWith('$'));
    expect(lines).toEqual([
      '$: s("hh")',
      '$: s("bd")',
      '$: stack(s("rim"), s("cp"))',
    ]);
  });

  it('leaves a current song as it is, and refuses a newer one', () => {
    const v2 = { version: 2, cpm: '120', nodes: [], edges: [] };
    expect(upgradeState(v2)).toBe(v2);
    expect(() =>
      upgradeState({ version: FORMAT_VERSION + 1, nodes: [], edges: [] }),
    ).toThrow(NewerFormatError);
    expect(() =>
      stateFromJson(
        JSON.stringify({ version: 99, cpm: '120', nodes: [], edges: [] }),
      ),
    ).toThrow(/newer Strudelton/);
  });

  it('marks .strudel files with their version, and reads it back', () => {
    const code = 'setcpm(120/4)\nkick: s("bd")\n';
    expect(strudelFile(code)).toBe(`// @strudelton 2\n${code}`);
    expect(readStrudelFile(strudelFile(code))).toBe(code);
    expect(readStrudelFile(code)).toBe(code);
    expect(() => readStrudelFile(`// @strudelton 9\n${code}`)).toThrow(
      NewerFormatError,
    );
  });
});
