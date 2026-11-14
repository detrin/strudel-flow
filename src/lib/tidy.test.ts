import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { setCode, startCodeSync } from '@/store/code-sync';
import { tidyLines } from './tidy';

const state = () => useAppStore.getState();
let stop: () => void;

beforeEach(() => {
  useAppStore.setState({
    nodes: [],
    edges: [],
    cpm: '120',
    bpc: '4',
    prelude: '',
  });
  stop = startCodeSync();
});
afterEach(() => stop());

describe('tidying lines', () => {
  it('gathers order-free effects after the chain, Arrange last', () => {
    setCode('kick: s("bd sd").lpf(800).fast(2).gain(0.5).mask("<1 0>")');
    expect(tidyLines()).toBe(0);
    expect(state().code).toMatch(
      /kick: s\("bd sd"\)\s*\.fast\(2\)\s*\.lpf\(800\)\s*\.gain\(0\.5\)\s*\.mask\("<1 0>"\)/,
    );
    const at = (type: string) =>
      state().nodes.find((node) => node.type === type)!.position;
    // Header first, then source, chain, and the stack.
    expect(at('arrange-node').x).toBeLessThan(at('sound-node').x);
    expect(at('level-node').x).toBe(at('lpf-node').x);
    expect(at('level-node').y).toBeGreaterThan(at('lpf-node').y);
  });

  it('keeps the order when moving a node would change the sound', () => {
    // The chance doubles some gains; a gain after it would undo that.
    const code = 'hat: s("hh*8").gain(0.5).sometimes(x => x.gain(2))';
    setCode(code);
    expect(tidyLines()).toBe(1);
    expect(state().code).toContain('.gain(0.5)');
    expect(state().code.indexOf('.gain(0.5)')).toBeLessThan(
      state().code.indexOf('sometimes'),
    );
  });
});
