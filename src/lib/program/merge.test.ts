import { describe, expect, it } from 'vitest';
import { programOf } from '.';
import { emitProgram } from './emit';
import { mergeCode } from './merge';

let next = 0;
const createId = () => `m${++next}`;
type Song = Parameters<typeof mergeCode>[1];
const empty: Song = { nodes: [], edges: [], cpm: '120', bpc: '4', prelude: '' };
function open(code: string, current: Song = empty) {
  const merged = mergeCode(code, current, createId);
  if (!merged.ok) throw new Error(merged.error);
  return {
    merged,
    song: {
      nodes: merged.nodes,
      edges: merged.edges,
      cpm: merged.program.cpm,
      bpc: merged.program.bpc,
      prelude: merged.program.prelude,
    },
  };
}

describe('mergeCode', () => {
  it('keeps every node that still writes the same code', () => {
    const { song } = open('kick: s("bd").gain(0.5)\nhat: s("hh")');
    const { merged } = open('kick: s("bd").gain(0.7)\nhat: s("hh")', song);
    expect(merged.nodes.map((n) => n.id)).toEqual(song.nodes.map((n) => n.id));
    expect(merged.created).toEqual([]);
  });

  it('lists what is new and where the code gave no place', () => {
    const { song } = open('kick: s("bd")');
    const { merged } = open('kick: s("bd")\nhat: s("hh").gain(0.4)', song);
    expect(merged.created).toHaveLength(2);
    expect([...merged.autoPlaced].sort()).toEqual([...merged.created].sort());
  });

  it('matches parts with the same code in code order, wherever they sit', () => {
    const code =
      'bass: stack(line.add(note(12)).s("saw"), line.s("square"), line.s("sine"))';
    const { song } = open(`const line = note("c2")\n${code}`);
    const sources = song.nodes.filter((n) => n.type === 'custom-node');
    // Move them around and shuffle the array: matching follows the code.
    const shuffled = {
      ...song,
      nodes: [...song.nodes]
        .reverse()
        .map((n, i) => ({ ...n, position: { x: 0, y: 1000 - i * 100 } })),
    };
    const { merged } = open(`const line = note("c2")\n${code}`, shuffled);
    const again = merged.nodes.filter((n) => n.type === 'custom-node');
    expect(new Set(again.map((n) => n.id))).toEqual(
      new Set(sources.map((n) => n.id)),
    );
    expect(emitProgram(programOf({ ...shuffled, ...merged }))).toContain(
      'stack(line.add(note(12)).sound("saw"), line.sound("square")',
    );
  });

  it('reports code that does not parse, and changes nothing', () => {
    const merged = mergeCode('kick: s("bd"', empty);
    expect(merged.ok).toBe(false);
  });

  it("takes tempo from the code, else keeps the song's", () => {
    expect(open('setcpm(90/4)\nkick: s("bd")').merged.program).toMatchObject({
      cpm: '90',
      bpc: '4',
    });
    expect(
      open('kick: s("bd")', { ...empty, cpm: '133', bpc: '3' }).merged.program,
    ).toMatchObject({ cpm: '133', bpc: '3' });
  });
});
