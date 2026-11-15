import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { startCodeSync } from '@/store/code-sync';
import { useLaunch } from '@/lib/launch';
import { useLibrary } from '@/store/library-store';
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

  it('disables a node by commenting out its call', () => {
    run('set_code', { code: 'kick: s("bd").lpf(800)' });
    const patch = run('get_patch') as {
      lines: { nodes: { id: string; type: string }[] }[];
    };
    const filter = patch.lines[0].nodes.find((n) => n.type === 'lpf-node')!;
    run('set_enabled', { id: filter.id, enabled: false });
    expect(useAppStore.getState().code).toMatch(/\/\/ \.lpf\(800\)|\/\* \.lpf/);
    run('set_enabled', { id: filter.id, enabled: true });
    expect(useAppStore.getState().code).toContain('.lpf(800)');
    expect(useAppStore.getState().code).not.toMatch(/\/[/*] ?\.lpf/);
  });

  it('sets launch quantization to a known bar count', () => {
    run('set_launch', { bars: 4 });
    expect(useLaunch.getState().quantize).toBe(4);
    expect(() => run('set_launch', { bars: 3 })).toThrow(/one of 0, 1, 4/);
    run('set_launch', { bars: 0 });
  });

  it('adds notes and frames as comments', () => {
    run('set_code', { code: 'kick: s("bd")' });
    run('add_annotation', { kind: 'note', text: 'drop at 17', x: 10, y: 20 });
    run('add_annotation', { kind: 'frame', text: 'drums' });
    const { prelude } = useAppStore.getState();
    expect(prelude).toContain('// @note 10,20 "drop at 17"');
    expect(prelude).toMatch(/\/\/ @frame 0,-200,1200,700 "drums"/);
    const patch = run('get_patch') as { annotations: { text: string }[] };
    expect(patch.annotations.map((a) => a.text)).toEqual([
      'drop at 17',
      'drums',
    ]);
  });

  it('saves a line as a preset, lists it and inserts it again', () => {
    useLibrary.setState({ presets: [] });
    run('set_code', { code: 'const n = "c2 e2"\nbass: note(n).s("sawtooth")' });
    const saved = run('save_preset', { line: 'bass', name: 'Acid' }) as {
      id: string;
      needs: string[];
    };
    expect(saved.needs).toEqual(['const n = "c2 e2"']);
    const listed = run('list_presets', { query: 'acid' }) as {
      presets: { id: string }[];
    };
    expect(listed.presets.map((p) => p.id)).toEqual([saved.id]);
    const inserted = run('insert_preset', { preset: 'acid' }) as {
      label: string;
    };
    expect(inserted.label).toBe('bass2');
    expect(useAppStore.getState().code).toContain('bass2: note(n)');
    run('preview_preset', { preset: saved.id });
    expect(useAppStore.getState().preview?.id).toBe(saved.id);
    run('preview_preset', { stop: true });
    expect(useAppStore.getState().preview).toBeNull();
    run('delete_preset', { preset: saved.id });
    expect(() => run('insert_preset', { preset: 'Acid' })).toThrow(/No preset/);
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
