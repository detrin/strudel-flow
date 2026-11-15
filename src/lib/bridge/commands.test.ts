import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { startCodeSync } from '@/store/code-sync';
import { bridgeUrl, handle } from './connect';

const run = (method: string, params: Record<string, unknown> = {}) =>
  handle({ id: 1, method, params }) as Record<string, unknown>;
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

describe('bridge commands', () => {
  it('set_code builds the patch and get_patch describes it as lines', () => {
    run('set_code', { code: 'kick: s("bd*4").lpf(800)\nhat: s("hh*8")' });
    const patch = run('get_patch') as {
      lines: { label: string; nodes: { type: string; values: object }[] }[];
    };
    expect(patch.lines.map((line) => line.label)).toEqual(['kick', 'hat']);
    expect(patch.lines[0].nodes.map((node) => node.type)).toEqual([
      'sound-node',
      'lpf-node',
    ]);
    expect(patch.lines[0].nodes[1].values).toMatchObject({ cutoff: 800 });
  });

  it('set_code refuses invalid code and leaves the patch alone', () => {
    run('set_code', { code: 'kick: s("bd")' });
    expect(() => run('set_code', { code: 'kick: s("bd"' })).toThrow(
      /did not parse/,
    );
    expect(useAppStore.getState().nodes).toHaveLength(1);
  });

  it('set_node changes values and explains unknown ones', () => {
    run('set_code', { code: 'kick: s("bd").lpf(800)' });
    const filter = useAppStore
      .getState()
      .nodes.find((node) => node.type === 'lpf-node')!;
    run('set_node', { id: filter.id, values: { cutoff: 1200 } });
    expect(useAppStore.getState().code).toContain('.lpf(1200)');
    expect(() =>
      run('set_node', { id: filter.id, values: { wobble: 1 } }),
    ).toThrow(/Filter has no wobble\. It has: cutoff/);
  });

  it('mutes lines, sets tempo and plays', () => {
    run('set_code', { code: 'kick: s("bd")' });
    run('set_muted', { line: 'kick', muted: true });
    expect(useAppStore.getState().code).toContain('_kick:');
    expect(() => run('set_muted', { line: 'nope' })).toThrow(/Lines: kick/);
    run('set_tempo', { bpm: 140 });
    expect(useAppStore.getState().code).toContain('setcpm(140/4)');
    expect(() => run('set_tempo', { bpm: -1 })).toThrow(/positive/);
    run('set_playing', { playing: true });
    expect(useAppStore.getState().isPlaying).toBe(true);
  });

  it('lists node types with their methods', () => {
    const types = handle({ id: 1, method: 'list_node_types' }) as {
      type: string;
      methods: string[];
    }[];
    expect(types.find((t) => t.type === 'delay-node')?.methods).toContain(
      'delaytime',
    );
  });

  it('rejects unknown methods', () => {
    expect(() => run('format_disk')).toThrow(/Unknown method/);
  });
});

describe('bridgeUrl', () => {
  it('reaches the hub on the page origin, on in development', () => {
    expect(bridgeUrl('http://x:5173/', true)).toBe(
      'ws://x:5173/__bridge?role=app',
    );
    expect(bridgeUrl('http://x/', false)).toBeNull();
    expect(bridgeUrl('https://x/?bridge', false)).toBe(
      'wss://x/__bridge?role=app',
    );
    expect(bridgeUrl('http://x/?bridge=off', true)).toBeNull();
  });
});
