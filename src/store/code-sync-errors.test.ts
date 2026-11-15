import { afterEach, describe, expect, it, vi } from 'vitest';

// The code writer, made to fail on demand.
const failing = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/program/emit', async (original) => {
  const actual = await original<typeof import('@/lib/program/emit')>();
  return {
    ...actual,
    emitProgram: (...args: Parameters<typeof actual.emitProgram>) => {
      if (failing.on) throw new Error('test: emit failed');
      return actual.emitProgram(...args);
    },
  };
});

import { useAppStore } from './app-store';
import { setCode, startCodeSync } from './code-sync';
import { currentProblems } from '@/lib/diagnostics';

afterEach(() => {
  failing.on = false;
  vi.restoreAllMocks();
});

describe('when writing the code fails', () => {
  it('says so, keeps working, and recovers on the next change', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stop = startCodeSync();
    setCode('setcpm(120/4)\nkick: s("bd*4").gain(0.8)');
    const level = () =>
      useAppStore.getState().nodes.find((n) => n.type === 'level-node')!;
    const setGain = (gain: number) =>
      useAppStore.getState().updateNodeData(level().id, { gain });

    failing.on = true;
    expect(() => setGain(0.5)).not.toThrow();
    expect(currentProblems()).toEqual([
      "The code isn't following the canvas: test: emit failed",
    ]);

    failing.on = false;
    setGain(0.4);
    expect(currentProblems()).toEqual([]);
    expect(useAppStore.getState().code).toContain('.gain(0.4)');
    stop();
  });
});
