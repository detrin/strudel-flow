import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { setCode, startCodeSync } from '@/store/code-sync';
import { arm, controlChange, learn, receive, scale, useMidi } from './midi';

describe('MIDI mapping', () => {
  it('reads control changes and nothing else', () => {
    expect(controlChange([0xb3, 21, 64])).toEqual({
      channel: 3,
      cc: 21,
      value: 64,
    });
    expect(controlChange([0x90, 60, 100])).toBeNull();
  });

  it('scales 0–127 onto a knob and snaps to its step', () => {
    const range = { min: 20, max: 20000, step: 1 };
    expect(scale(0, range)).toBe(20);
    expect(scale(127, range)).toBe(20000);
    expect(scale(64, { min: 0, max: 1, step: 0.01 })).toBe(0.5);
  });

  it('links one control to one knob', () => {
    const a = { nodeId: 'a', param: 'gain' };
    const b = { nodeId: 'b', param: 'lpf' };
    let mappings = learn([], a, { channel: 0, cc: 1, value: 0 });
    mappings = learn(mappings, b, { channel: 0, cc: 1, value: 0 });
    expect(mappings).toEqual([{ ...b, channel: 0, cc: 1 }]);
  });
});

describe('MIDI learn in the app', () => {
  let stop: () => void;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => {
      fn();
      return 1;
    });
    useAppStore.setState({ nodes: [], edges: [], prelude: '' });
    stop = startCodeSync();
    useMidi.setState({ learning: true, armed: null, mappings: [] });
  });
  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it('a learned control moves its knob and writes the code', () => {
    setCode('bass: note("c2").s("saw").lpf(800)');
    const lpf = useAppStore
      .getState()
      .nodes.find((node) => node.type === 'lpf-node')!;
    arm({ nodeId: lpf.id, param: 'cutoff' });
    receive({ channel: 0, cc: 74, value: 10 });
    expect(useMidi.getState().mappings).toMatchObject([
      { cc: 74, param: 'cutoff', line: 'bass', type: 'lpf-node' },
    ]);
    useMidi.setState({ learning: false });
    receive({ channel: 0, cc: 74, value: 127 });
    expect(useAppStore.getState().code).toMatch(/\.lpf\(\d+\)/);
    expect(useAppStore.getState().code).not.toContain('.lpf(800)');
  });
});
