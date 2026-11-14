import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { setCode, startCodeSync } from '@/store/code-sync';
import { applyNodeCode } from './node-code';

const state = () => useAppStore.getState();
const nodeOf = (type: string) => state().nodes.find((n) => n.type === type)!;
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
  setCode('kick: s("bd*4").lpf(800)');
});
afterEach(() => stop());

describe('editing a node as code', () => {
  it('changes the node it models', () => {
    expect(applyNodeCode(nodeOf('lpf-node').id, 'lpf(1200)')).toBeNull();
    expect(nodeOf('lpf-node').data.cutoff).toBe('1200');
    expect(state().code).toContain('.lpf(1200)');
  });

  it('becomes another node when the code says so', () => {
    expect(applyNodeCode(nodeOf('lpf-node').id, 'room(0.5)')).toBeNull();
    expect(state().nodes.map((n) => n.type)).toEqual([
      'sound-node',
      'room-node',
    ]);
  });

  it('rewrites an instrument, keeping its line', () => {
    expect(applyNodeCode(nodeOf('sound-node').id, 's("hh*8")')).toBeNull();
    expect(state().code).toMatch(/kick: s\("hh\*8"\)\s*\.lpf\(800\)/);
  });

  it('keeps everything when the code is invalid', () => {
    const before = state().code;
    expect(applyNodeCode(nodeOf('lpf-node').id, 'lpf(')).toBeTruthy();
    expect(state().code).toBe(before);
  });
});
