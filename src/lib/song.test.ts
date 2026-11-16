import { afterEach, describe, expect, it } from 'vitest';
import { node, wire } from '@/test/graph';
import { useAppStore } from '@/store/app-store';
import { setCode } from '@/store/code-sync';
import { songOf } from './song';

const canvas = () => ({
  nodes: [
    node('custom-node', 'k', { customPattern: 's("bd")' }),
    node('level-node', 'g'),
  ],
  edges: [wire('k', 'g')],
  cpm: '120',
  bpc: '4',
  prelude: '',
});

describe('the song', () => {
  it('is the same object while only the view changes', () => {
    const view = canvas();
    const song = songOf(view);
    const selected = {
      ...view,
      nodes: view.nodes.map((n) => ({
        ...n,
        selected: true,
        measured: { width: 300, height: 200 },
        dragging: true,
      })),
      edges: view.edges.map((e) => ({ ...e, selected: true })),
    };
    expect(songOf(selected, song)).toBe(song);
  });

  it('changes when the music or the layout does, reusing the rest', () => {
    const view = canvas();
    const song = songOf(view);
    const moved = songOf(
      {
        ...view,
        nodes: view.nodes.map((n) =>
          n.id === 'g' ? { ...n, position: { x: 400, y: 0 } } : n,
        ),
      },
      song,
    );
    expect(moved).not.toBe(song);
    expect(moved.nodes[0]).toBe(song.nodes[0]);
    expect(moved.nodes[1]).not.toBe(song.nodes[1]);
    expect(moved.edges[0]).toBe(song.edges[0]);
    expect(songOf({ ...view, cpm: '90' }, song).cpm).toBe('90');
    // Reordering lines is a change too.
    const swapped = songOf(
      { ...view, nodes: [view.nodes[1], view.nodes[0]] },
      song,
    );
    expect(swapped).not.toBe(song);
  });

  it('holds no view state', () => {
    const view = canvas();
    const [first] = songOf({
      ...view,
      nodes: view.nodes.map((n) => ({ ...n, selected: true })),
    }).nodes;
    expect(Object.keys(first).sort()).toEqual([
      'data',
      'id',
      'position',
      'type',
    ]);
  });
});

describe('the store keeps the song', () => {
  afterEach(() => useAppStore.setState({ code: '' }));

  it('selecting nodes leaves the song alone; editing a value changes it', () => {
    setCode('kick: s("bd").gain(0.5)');
    const { song, nodes, dispatch } = useAppStore.getState();
    dispatch({ type: 'select', ids: [nodes[0].id] });
    expect(useAppStore.getState().song).toBe(song);
    dispatch({ type: 'setData', updates: { [nodes[1].id]: { gain: '0.7' } } });
    expect(useAppStore.getState().song).not.toBe(song);
    expect(useAppStore.getState().song.nodes[1].data.gain).toBe('0.7');
  });

  it('follows the canvas even when it is set without a command', () => {
    setCode('kick: s("bd")');
    const { nodes } = useAppStore.getState();
    useAppStore.setState({
      nodes: nodes.map((n) => ({ ...n, position: { x: 77, y: 0 } })),
    });
    expect(useAppStore.getState().song.nodes[0].position.x).toBe(77);
  });
});
