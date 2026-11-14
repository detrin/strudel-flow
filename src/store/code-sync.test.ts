import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeByType } from '@/components/nodes/registry';
import { useAppStore } from './app-store';
import { setCode, startCodeSync } from './code-sync';

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
    setCode(code);
    expect(types()).toEqual(['custom-node', 'level-node']);
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
    setCode(code);
    useAppStore.setState({
      nodes: state().nodes.map((node) => ({
        ...node,
        measured: { width: 280, height: 200 },
      })),
    });
    expect(state().code).toBe(code);
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
    expect(types()).toEqual(['custom-node']);
    expect(state().codeError).toBeTruthy();
    expect(state().code).toBe('$: s("bd"');
  });

  it('reads tempo and asks the canvas to show new nodes', () => {
    const before = state().fitRequest;
    setCode('setcpm(132/4)\n$: s("bd")');
    expect(state()).toMatchObject({ cpm: '132', bpc: '4' });
    expect(state().fitRequest).toBe(before + 1);
  });
});
