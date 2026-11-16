/**
 * Fuzzing: songs and edits nobody wrote by hand. Each case comes from a
 * seed; a failure names its seed, and `FUZZ_SEED=… pnpm test fuzz` runs
 * that one alone. `FUZZ_RUNS` raises the count (default: quick enough for
 * every commit).
 */
import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { createNodeByType, nodeDefinitions } from '@/components/nodes/registry';
import type { AppNode } from '@/components/nodes/types';
import { isSource, type Parameter } from '@/components/nodes/define-node';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitProgram } from '@/lib/program/emit';
import { mergeCode } from '@/lib/program/merge';
import { withoutLayout } from '@/lib/program/layout-comments';
import { parseProgram } from '@/lib/program/parse';
import {
  apply,
  CommandError,
  problemsOf,
  type Command,
  type Song,
} from './commands';

/** A small seeded generator (mulberry32): the same seed, the same case. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (below: number) => Math.floor(next() * below),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}
type Random = ReturnType<typeof random>;

const RUNS = Number(process.env.FUZZ_RUNS ?? 60);
const ONLY = process.env.FUZZ_SEED ? [Number(process.env.FUZZ_SEED)] : null;
const seeds = (base: number) =>
  ONLY ?? Array.from({ length: RUNS }, (_, i) => base + i);

/**
 * Sources whose code a random song can hold: written by the node itself
 * and read back from it. (Pad, Chords and Beats are drawn, not typed; Code
 * holds any code; they have their own tests.)
 */
const SOURCES = ['sound-node', 'notes-node'];
/** Effects: every parameter node except the ones that hold raw code. */
const EFFECTS = Object.values(nodeDefinitions)
  .filter(
    (definition) =>
      !isSource(definition) &&
      ![
        'method-node',
        'mix-node',
        'output-node',
        // Sounds: they write code only once a sound is picked.
        'synth-select-node',
        'drum-sounds-node',
      ].includes(definition.id),
  )
  .map((definition) => definition.id);

/** A random value a parameter accepts. */
function valueFor(parameter: Parameter, r: Random): string | number {
  switch (parameter.control) {
    case 'knob': {
      const steps = Math.round(
        (parameter.max - parameter.min) / parameter.step,
      );
      const value = parameter.min + r.int(steps + 1) * parameter.step;
      return Number(value.toFixed(6));
    }
    case 'select':
      return r.pick(parameter.options).value;
    case 'text':
      return parameter.default;
  }
}

let ids = 0;
/**
 * A node of `type` with random values in range, in a state that writes
 * code (a Voice with no sound yet writes none, so it can't be saved in
 * code at all: not what this checks).
 */
function randomNode(type: string, r: Random): AppNode {
  const definition = nodeDefinitions[type]!;
  for (let attempt = 0; attempt < 8; attempt++) {
    const node = createNodeByType({ type, id: `z${++ids}` });
    const values: Record<string, unknown> = {};
    for (const [key, parameter] of Object.entries(definition.parameters))
      if (r.chance(0.6)) values[key] = valueFor(parameter, r);
    const made = {
      ...node,
      data: { ...node.data, ...definition.encode(values) },
    };
    if (definition.generate(made.data, { id: made.id })) return made;
  }
  // Fall back to a node that always writes code.
  return randomNode(r.pick(['lpf-node', 'level-node']), r);
}

/** A Modulate on a control the node before it writes. */
function lfoAfterOwnControl(before: AppNode, node: AppNode) {
  if (node.type !== 'modulate-node') return false;
  const target = String(node.data.target ?? '');
  const methods = nodeDefinitions[before.type]?.methods ?? [];
  return methods.includes(target);
}

/** A random song: lines of a source and effects, some stacked, some off. */
function randomSong(r: Random): Song {
  const nodes: AppNode[] = [];
  const edges: Edge[] = [];
  const wire = (source: AppNode, target: AppNode) =>
    edges.push({
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
    });
  const chain = (from: AppNode, length: number) => {
    let last = from;
    for (let i = 0; i < length; i++) {
      let effect = randomNode(r.pick(EFFECTS), r);
      // Known: an LFO right after a node that sets the same control reads
      // back as that node's pattern value (same code, one node fewer).
      while (lfoAfterOwnControl(last, effect))
        effect = randomNode(r.pick(EFFECTS), r);
      if (r.chance(0.1)) effect.data = { ...effect.data, disabled: true };
      nodes.push(effect);
      wire(last, effect);
      last = effect;
    }
    return last;
  };
  const lines = 1 + r.int(3);
  for (let line = 0; line < lines; line++) {
    const parts = r.chance(0.25) ? 2 + r.int(2) : 1;
    const ends: AppNode[] = [];
    for (let part = 0; part < parts; part++) {
      const source = randomNode(r.pick(SOURCES), r);
      nodes.push(source);
      ends.push(chain(source, r.int(3)));
    }
    if (parts > 1) {
      const merge = randomNode(r.pick(EFFECTS), r);
      nodes.push(merge);
      for (const end of ends) wire(end, merge);
      chain(merge, r.int(2));
    }
  }
  return { nodes, edges, cpm: '120', bpc: '4', prelude: '' };
}

const codeOf = (song: Song) => emitProgram(programOf(song));
const idsOf = (song: Song) =>
  programOf(song).lines.map((line) =>
    flatten(line.sink)
      .reverse()
      .map((node) => node.id)
      .join(' '),
  );
/**
 * Code to compare edits by: without layout comments (a wire into an
 * instrument reads back as an explicit Mix, one more node), and with a
 * part's `.hush()` after its switched-off calls (`x.hush()/* .a() *\/` and
 * `x/* .a() *\/.hush()` both play nothing; the first only comes from a wire
 * into an instrument).
 */
const canonical = (code: string) =>
  withoutLayout(code).replace(/\.hush\(\)((?:\/\*[^*]*\*\/)+)/g, '$1.hush()');
/** Each line's node types, upstream first. */
const typesOf = (song: Song) =>
  programOf(song).lines.map((line) =>
    flatten(line.sink)
      .reverse()
      .map((node) => node.type.replace(/-node$/, ''))
      .join(' '),
  );
function typeInto(code: string, song: Song): Song {
  const merged = mergeCode(code, song, () => `t${++ids}`);
  if (!merged.ok) throw new Error(`its code does not parse: ${merged.error}`);
  return {
    nodes: merged.nodes,
    edges: merged.edges,
    cpm: merged.program.cpm,
    bpc: merged.program.bpc,
    prelude: merged.program.prelude,
  };
}

describe('fuzz: random songs survive code → song → code', () => {
  it.each(seeds(1000))('seed %i', (seed) => {
    const song = randomSong(random(seed));
    const code = codeOf(song);
    // Read into an empty canvas (a reload): the same code comes out.
    const reopened = typeInto(code, {
      nodes: [],
      edges: [],
      cpm: '120',
      bpc: '4',
      prelude: '',
    });
    const wanted = typesOf(song).join('\n');
    const got = typesOf(reopened).join('\n');
    expect(
      got,
      `seed ${seed}: reading its code back gives other nodes\nWANTED:\n${wanted}\nGOT:\n${got}\n${code}`,
    ).toBe(wanted);
    expect(codeOf(reopened), `seed ${seed}\n${code}`).toBe(code);
    // Typed back into itself: every node is kept.
    const retyped = typeInto(code, song);
    const lost = song.nodes
      .filter((n) => !retyped.nodes.some((m) => m.id === n.id))
      .map((n) => `${n.id}:${n.type} ${JSON.stringify(n.data).slice(0, 200)}`);
    expect(
      lost,
      `seed ${seed}: typing its code back replaces nodes\nBEFORE:\n${typesOf(song).join('\n')}\nAFTER:\n${typesOf(retyped).join('\n')}\nIDS BEFORE:\n${idsOf(song).join('\n')}\nIDS AFTER:\n${idsOf(retyped).join('\n')}\n${code}`,
    ).toEqual([]);
    expect(retyped.nodes.map((n) => n.id).sort()).toEqual(
      song.nodes.map((n) => n.id).sort(),
    );
  });
});

/** A random command on `song` (some will be refused, which is fine). */
function randomCommand(song: Song, r: Random): Command {
  const node = song.nodes.length ? r.pick(song.nodes) : undefined;
  const other = song.nodes.length ? r.pick(song.nodes) : undefined;
  switch (r.int(8)) {
    case 0: {
      const fresh = randomNode(r.pick([...SOURCES, ...EFFECTS]), r);
      return node && r.chance(0.5) && !isSource(nodeDefinitions[fresh.type]!)
        ? { type: 'insertAfter', after: node.id, node: fresh }
        : { type: 'add', nodes: [fresh] };
    }
    case 1:
      return { type: 'remove', ids: node ? [node.id] : [] };
    case 2: {
      if (!node) return { type: 'clearSolo' };
      const definition = nodeDefinitions[node.type]!;
      const entries = Object.entries(definition.parameters);
      if (!entries.length) return { type: 'select', ids: [node.id] };
      const [key, parameter] = r.pick(entries);
      return {
        type: 'setData',
        updates: {
          [node.id]: definition.encode({ [key]: valueFor(parameter, r) }),
        },
      };
    }
    case 3:
      return node
        ? {
            type: 'setData',
            updates: { [node.id]: { disabled: r.chance(0.5) || undefined } },
          }
        : { type: 'clearSolo' };
    case 4:
      return node
        ? { type: 'setMuted', id: node.id, muted: r.chance(0.5) }
        : { type: 'clearSolo' };
    case 5:
      return node
        ? {
            type: 'setSolo',
            id: node.id,
            soloed: r.chance(0.5),
            add: r.chance(0.3),
          }
        : { type: 'clearSolo' };
    case 6:
      return node && other
        ? {
            type: 'connect',
            connection: {
              source: node.id,
              target: other.id,
              sourceHandle: null,
              targetHandle: null,
            },
          }
        : { type: 'clearSolo' };
    default:
      return { type: 'setTempo', cpm: String(60 + r.int(120)) };
  }
}

describe('fuzz: random edits keep the song consistent', () => {
  it.each(seeds(5000))('seed %i', (seed) => {
    const r = random(seed);
    let song = randomSong(r);
    const done: string[] = [];
    for (let step = 0; step < 25; step++) {
      const command = randomCommand(song, r);
      try {
        song = { ...song, ...apply(song, command) };
        done.push(command.type);
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        continue; // Refused: the song stays as it was.
      }
      const where = `seed ${seed}, after ${done.join(' → ')}`;
      expect(problemsOf(song), where).toEqual([]);
      const code = codeOf(song);
      const parsed = parseProgram(code);
      expect(parsed.ok ? null : parsed.error, `${where}\n${code}`).toBeNull();
      // What the code says, read back, says it again.
      const reopened = typeInto(code, {
        nodes: [],
        edges: [],
        cpm: song.cpm,
        bpc: song.bpc,
        prelude: song.prelude,
      });
      // The same code (a wire into an instrument reads back as an explicit
      // Mix: same sound, one more node, so its layout may differ).
      expect(canonical(codeOf(reopened)), `${where}\n${code}`).toBe(
        canonical(code),
      );
    }
  });
});
