import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeByType } from '@/components/nodes/registry';
import { useAppStore } from './app-store';
import { setCode, startCodeSync, upgradePatch } from './code-sync';

const state = () => useAppStore.getState();
const types = () => state().nodes.map((node) => node.type);
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

describe('code ↔ canvas sync', () => {
  it('typing code builds the graph and keeps the text as typed', () => {
    const code = '$: s("bd*4")   .gain( 0.5 )';
    setCode(code, { typing: true });
    expect(types()).toEqual(['sound-node', 'level-node']);
    expect(state().edges).toHaveLength(1);
    expect(state().code).toBe(code);
  });

  it('editing a node rewrites the code', () => {
    setCode('$: s("bd*4").gain(0.5)');
    const level = state().nodes[1];
    state().updateNodeData(level.id, { gain: '0.8' });
    expect(state().code).toContain('.gain(0.8)');
  });

  it('adding a node in the UI adds its code', () => {
    useAppStore.setState({
      nodes: [
        createNodeByType({
          type: 'custom-node',
          data: { customPattern: 'note("c e g")', state: 'running' },
        }),
      ],
    });
    expect(state().code).toContain('$: note("c e g")');
  });

  it('measuring nodes does not overwrite what the user typed', () => {
    const code = '$: s("bd")  // my kick';
    setCode(code, { typing: true });
    useAppStore.setState({
      nodes: state().nodes.map((node) => ({
        ...node,
        measured: { width: 280, height: 200 },
      })),
    });
    expect(state().code).toBe(code);
  });

  it('code from Insert, a file or Claude gets its layout comments at once', () => {
    setCode('kick: s("bd").gain(1)');
    expect(state().code).toMatch(
      /^\/\/ @layout [\d,]+ [\d,]+\nkick: s\("bd"\)\.gain\(1\)$/,
    );
  });

  it('moving a node only updates its layout comment', () => {
    const typed = '// my kick\nkick:  s("bd")   .gain(1)  // loud';
    setCode(typed);
    const [, level] = state().nodes;
    useAppStore.setState({
      nodes: state().nodes.map((node) =>
        node.id === level.id ? { ...node, position: { x: 900, y: 0 } } : node,
      ),
    });
    expect(state().code.split('\n')).toEqual([
      '// my kick',
      expect.stringMatching(/^\/\/ @layout \d+,\d+ 900,0$/),
      'kick:  s("bd")   .gain(1)  // loud',
    ]);
  });

  it('dragging a line above another reorders the code', () => {
    setCode('$: s("bd")\n$: s("hh")');
    const [kick, hat] = state().nodes;
    useAppStore.setState({
      nodes: [
        { ...kick, position: { x: 0, y: 500 } },
        { ...hat, position: { x: 0, y: 0 } },
      ],
    });
    expect(state().code).toMatch(/hh[\s\S]*bd/);
  });

  it('muting a node mutes its whole line and only that line', () => {
    setCode('kick: s("bd").gain(0.5)\nhat: s("hh")');
    const level = state().nodes.find((node) => node.type === 'level-node')!;
    state().setMuted(level.id, true);
    expect(state().code).toContain('_kick: s("bd")');
    expect(state().code).toContain('\nhat: s("hh")');
  });

  it('invalid code keeps the graph and reports the error', () => {
    setCode('$: s("bd")');
    setCode('$: s("bd"');
    expect(types()).toEqual(['sound-node']);
    expect(state().codeError).toBeTruthy();
    expect(state().code).toBe('$: s("bd"');
  });

  it('reads tempo and asks the canvas to show new nodes', () => {
    const before = state().fitRequest;
    setCode('setcpm(132/4)\n$: s("bd")');
    expect(state()).toMatchObject({ cpm: '132', bpc: '4' });
    expect(state().fitRequest).toBe(before + 1);
  });

  it('reads a tempo written with a constant, and keeps it in step', () => {
    setCode('const BPM = 81\nsetcpm(BPM/4)\n$: s("bd")');
    expect(state()).toMatchObject({ cpm: '81', bpc: '4' });
    // Changing the tempo on the toolbar rewrites the constant too.
    state().setCpm('90');
    expect(state().code).toContain('const BPM = 90\nsetcpm(BPM/4)');
    // And typing a new constant moves the toolbar.
    setCode(state().code.replace('const BPM = 90', 'const BPM = 140'));
    expect(state().cpm).toBe('140');
  });

  it('upgrades a saved patch to nodes that model it better', () => {
    // As saved before Sound nodes existed: s("bd") in a Code node.
    useAppStore.setState({
      nodes: [
        createNodeByType({
          id: 'old',
          type: 'custom-node',
          position: { x: 40, y: 80 },
          data: { customPattern: 's("bd*4")', state: 'running' },
        }),
      ],
      edges: [],
    });
    upgradePatch();
    expect(types()).toEqual(['sound-node']);
    expect(state().nodes[0].position).toEqual({ x: 40, y: 80 });
    expect(state().code).toContain('$: s("bd*4")');
  });
});
