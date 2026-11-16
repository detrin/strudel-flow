import { describe, expect, it } from 'vitest';
import { chainOf, node, wire } from '@/test/graph';
import { programOf } from '@/lib/program';
import { emitProgram } from '@/lib/program/emit';
import { nodeDefinitions } from '@/components/nodes/registry';
import {
  apply,
  CommandError,
  commandLog,
  logCommand,
  problemsOf,
  valueProblem,
  type Command,
  type Song,
} from './commands';

const song = (nodes: Song['nodes'], edges: Song['edges'] = []): Song => ({
  nodes,
  edges,
  cpm: '120',
  bpc: '4',
  prelude: '',
});
/** Applies commands one after another, as the store does. */
const run = (start: Song, ...commands: Command[]) =>
  commands.reduce(
    (current, command) => ({
      ...current,
      ...apply(current, command),
    }),
    start,
  );
const code = (s: Song) => emitProgram(programOf(s));

const kick = node('custom-node', 'k', { customPattern: 's("bd")' });
const hat = node('custom-node', 'h', { customPattern: 's("hh")' });
const gain = node('level-node', 'g', { gain: '0.5' });
const base = song([kick, gain, hat], chainOf('k', 'g'));

describe('commands', () => {
  it('adds nodes, selecting only the new ones when asked', () => {
    const extra = node('lpf-node', 'f');
    const next = run(song([{ ...kick, selected: true }]), {
      type: 'add',
      nodes: [extra],
      edges: [wire('k', 'f')],
      select: true,
    });
    expect(next.nodes.map((n) => [n.id, Boolean(n.selected)])).toEqual([
      ['k', false],
      ['f', true],
    ]);
    expect(code(next)).toContain('.lpf(');
  });

  it('refuses a node id that exists, or a wire to nothing', () => {
    expect(() => apply(base, { type: 'add', nodes: [kick] })).toThrow(
      CommandError,
    );
    expect(() =>
      apply(base, { type: 'add', nodes: [], edges: [wire('k', 'nope')] }),
    ).toThrow(CommandError);
  });

  it('re-routes a wire through a new node in one change', () => {
    const level = node('level-node', 'x');
    const next = run(base, {
      type: 'add',
      nodes: [level],
      edges: [wire('k', 'x'), wire('x', 'g')],
      removeEdges: ['k-g'],
    });
    expect(next.edges.map((e) => e.id)).toEqual(['k-x', 'x-g']);
  });

  it('removes nodes with their wires', () => {
    const next = run(base, { type: 'remove', ids: ['g'] });
    expect(next.nodes.map((n) => n.id)).toEqual(['k', 'h']);
    expect(next.edges).toEqual([]);
  });

  it('merges data, deleting keys set to undefined', () => {
    const next = run(base, {
      type: 'setData',
      updates: { g: { gain: '0.9', disabled: true } },
    });
    expect(code(next)).toContain('// .gain(0.9)');
    const back = run(next, {
      type: 'setData',
      updates: { g: { disabled: undefined } },
    });
    expect('disabled' in back.nodes[1].data).toBe(false);
  });

  it('mutes and solos whole lines', () => {
    const muted = run(base, { type: 'setMuted', id: 'g', muted: true });
    expect(code(muted)).toMatch(/_\$: s\("bd"\)/);
    expect(code(muted)).toMatch(/\n\$: s\("hh"\)/);
    const soloed = run(base, { type: 'setSolo', id: 'h', soloed: true });
    expect(code(soloed)).toMatch(/S\$: s\("hh"\)/);
    // A solo on its own replaces the others; add keeps them.
    const both = run(soloed, {
      type: 'setSolo',
      id: 'k',
      soloed: true,
      add: true,
    });
    expect(code(both).match(/S\$:/g)).toHaveLength(2);
    const one = run(both, { type: 'setSolo', id: 'k', soloed: true });
    expect(code(one).match(/S\$:/g)).toHaveLength(1);
    expect(code(run(one, { type: 'clearSolo' }))).not.toContain('S$');
  });

  it('connects, but never a node to itself or into a loop', () => {
    const next = run(base, {
      type: 'connect',
      connection: {
        source: 'h',
        target: 'g',
        sourceHandle: null,
        targetHandle: null,
      },
    });
    expect(code(next)).toContain('stack(s("bd"), s("hh"))');
    expect(() =>
      apply(base, {
        type: 'connect',
        connection: {
          source: 'g',
          target: 'g',
          sourceHandle: null,
          targetHandle: null,
        },
      }),
    ).toThrow(CommandError);
    expect(() =>
      apply(base, {
        type: 'connect',
        connection: {
          source: 'g',
          target: 'k',
          sourceHandle: null,
          targetHandle: null,
        },
      }),
    ).toThrow(/loop/);
  });

  it('selects exactly the given nodes', () => {
    const next = run(base, { type: 'select', ids: ['h'] });
    expect(next.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([
      'h',
    ]);
  });

  it('replaces the graph only with a consistent one', () => {
    expect(() =>
      apply(base, {
        type: 'setGraph',
        nodes: [kick, kick],
        edges: [],
        reason: 'test',
      }),
    ).toThrow(/two nodes/);
    const next = run(base, {
      type: 'setGraph',
      nodes: [hat],
      edges: [],
      cpm: '90',
      prelude: 'const a = 1',
      reason: 'test',
    });
    expect(next).toMatchObject({ cpm: '90', bpc: '4', prelude: 'const a = 1' });
  });

  it('sets the tempo and the prelude', () => {
    expect(run(base, { type: 'setTempo', bpc: '3' })).toMatchObject({
      cpm: '120',
      bpc: '3',
    });
    expect(
      run(base, { type: 'setPrelude', prelude: '// @note x' }).prelude,
    ).toBe('// @note x');
  });

  it('finds what is inconsistent', () => {
    expect(problemsOf(base)).toEqual([]);
    expect(
      problemsOf({ nodes: [kick], edges: [wire('k', 'k'), wire('k', 'z')] }),
    ).toEqual(['wire k-z to a missing node', 'node k feeds itself'].reverse());
  });

  it('logs changes, not drags', () => {
    const before = commandLog().length;
    logCommand({
      type: 'nodeChanges',
      changes: [{ type: 'position', id: 'k', position: { x: 1, y: 1 } }],
    });
    logCommand({ type: 'remove', ids: ['g'] });
    const log = commandLog();
    expect(log.length).toBe(before + 1);
    expect(log.at(-1)!.command).toContain('"remove"');
  });
});

describe('values entering the song', () => {
  it("accepts every node's own defaults", () => {
    for (const [type, definition] of Object.entries(nodeDefinitions))
      for (const [key, value] of Object.entries(definition.defaults))
        expect(valueProblem(type, key, value), `${type}.${key}`).toBeNull();
  });

  it('accepts numbers and code in knobs, refuses anything else', () => {
    expect(valueProblem('level-node', 'gain', '0.5')).toBeNull();
    expect(valueProblem('level-node', 'gain', 0.5)).toBeNull();
    expect(valueProblem('level-node', 'gain', '"<0.4 0.8>"')).toBeNull();
    expect(valueProblem('level-node', 'gain', 'sine.range(0, 1)')).toBeNull();
    expect(valueProblem('level-node', 'gain', '')).not.toBeNull();
    expect(valueProblem('level-node', 'gain', NaN)).not.toBeNull();
    expect(valueProblem('level-node', 'gain', true)).not.toBeNull();
  });

  it('refuses a select value that is not an option', () => {
    const [type, key] = Object.entries(nodeDefinitions).flatMap(([t, d]) =>
      Object.entries(d.parameters)
        .filter(([, p]) => p.control === 'select')
        .map(([k]) => [t, k] as const),
    )[0];
    expect(valueProblem(type, key, 'not-an-option')).not.toBeNull();
    expect(() =>
      apply(song([node(type, 'x')]), {
        type: 'setData',
        updates: { x: { [key]: 'not-an-option' } },
      }),
    ).toThrow(CommandError);
  });

  it("leaves a node's own fields (not parameters) alone", () => {
    expect(valueProblem('pad-node', 'notes', [{ pitch: 0 }])).toBeNull();
    expect(valueProblem('level-node', 'state', 'paused')).toBeNull();
  });
});
