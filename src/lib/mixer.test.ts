import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { setCode, startCodeSync } from '@/store/code-sync';
import { programOf } from '@/lib/program';
import { isAudible, playingLines } from '@/lib/program/emit';
import { addLevel, clearSolo, setSoloed, stripsOf } from './mixer';

const state = () => useAppStore.getState();
const nodeOf = (type: string, index = 0) =>
  state().nodes.filter((node) => node.type === type)[index];
let stop: () => void;

beforeEach(() => {
  useAppStore.setState({ nodes: [], edges: [], prelude: '' });
  stop = startCodeSync();
  setCode('kick: s("bd*4").gain(1)\nhats: s("hh*8")\n_bass: note("c2")');
});
afterEach(() => stop());

describe('solo', () => {
  it("writes Strudel's S prefix and plays only soloed lines", () => {
    setSoloed(nodeOf('level-node').id, true);
    expect(state().code).toContain('Skick: s("bd*4")');
    expect(state().code).toContain('hats: s("hh*8")');
    expect(playingLines(programOf(state())).map((l) => l.label)).toEqual([
      'kick',
    ]);
  });

  it('replaces other solos unless added to them', () => {
    setSoloed(nodeOf('sound-node', 0).id, true);
    setSoloed(nodeOf('sound-node', 1).id, true);
    expect(state().code).toContain('kick: s("bd*4")');
    expect(state().code).toContain('Shats:');
    setSoloed(nodeOf('sound-node', 0).id, true, true);
    expect(state().code).toContain('Skick:');
    expect(state().code).toContain('Shats:');
    clearSolo();
    expect(state().code).not.toMatch(/^S/m);
  });

  it('reads S labels from code, and a soloed muted line plays nothing', () => {
    setCode('Skick: s("bd")\nS$: s("hh")\n_Sbass: note("c2")\nS: s("x")');
    const lines = programOf(state()).lines;
    expect(lines.map((l) => [l.label, l.soloed, l.muted])).toEqual([
      ['kick', true, false],
      ['$', true, false],
      ['bass', true, true],
      ['S', false, false],
    ]);
    expect(playingLines(programOf(state())).map((l) => l.label)).toEqual([
      'kick',
      '$',
    ]);
    setCode('_Skick: s("bd")');
    expect(isAudible(programOf(state()))).toBe(false);
  });
});

describe('mixer strips', () => {
  it("shows each line's gain and adds a Level where there is none", () => {
    const strips = () => stripsOf(programOf(state()).lines);
    expect(
      strips().map(({ label, gain, levelId }) => [label, gain, !!levelId]),
    ).toEqual([
      ['kick', 1, true],
      ['hats', 0.8, false],
      ['bass', 0.8, false],
    ]);
    addLevel(strips()[1].nodeId);
    expect(state().code).toContain('hats: s("hh*8")\n  .gain(0.8)');
    expect(strips()[1].levelId).toBeTruthy();
    setCode('$: s("bd").gain("<0.5 1>")');
    expect(strips()[0].gain).toBe('"<0.5 1>"');
    setCode('$: s("bd").gain(sine.range(0.2, 1))');
    expect(strips()[0].gain).toBe('gain(sine.range(0.2, 1))');
  });
});
