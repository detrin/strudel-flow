/**
 * Round trips over real songs: the demo patches, DJ_Dave's songs
 * (../tidalcycles/dj_dave, the reference corpus) and the Library's presets
 * (~/.strudelton/presets), whichever are there. For each song:
 *
 * - it parses, and opening it then writing its code back is a fixed point
 *   (code → canvas → code → canvas → code changes nothing the second time);
 * - typing that code back in keeps every node: same ids, types and places;
 * - reopening it from scratch (as after a reload) puts every node back in
 *   the same place: the `// @layout` comments hold;
 * - every line plays exactly the events of the song as written.
 *
 * Failures are listed per song, so one run is a bug list.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppNode } from '@/components/nodes/types';
import { regionsOf } from '@/lib/lines';
import { getADSRValues } from '@strudel/web';
import { eventsOf } from '@/lib/same-sound';
import { previewCode } from '@/lib/library/preview';
import { programOf } from '.';
import { flatten } from './compile';
import { emitProgram } from './emit';
import { knownSources, parseProgram } from './parse';
import { reconcile } from './reconcile';

type Song = { name: string; code: string };

const repo = resolve(__dirname, '../../..');
const files = (dir: string, pattern: RegExp): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory())
          return name === 'node_modules' ? [] : files(path, pattern);
        return pattern.test(name) ? [path] : [];
      })
    : [];

function corpus(): Song[] {
  const songs: Song[] = [];
  const read = (path: string, root: string) =>
    songs.push({
      name: relative(root, path),
      code: readFileSync(path, 'utf8'),
    });
  for (const path of files(join(repo, 'patches'), /\.strudel$/))
    read(path, repo);
  const djDave =
    process.env.STRUDELTON_CORPUS ?? join(repo, '../tidalcycles/dj_dave');
  for (const path of files(djDave, /\.strudel(\.js)?$/)) read(path, djDave);
  const presets = join(
    process.env.STRUDELTON_HOME ?? join(homedir(), '.strudelton'),
    'presets',
  );
  for (const path of files(presets, /\.json$/)) {
    try {
      const preset = JSON.parse(readFileSync(path, 'utf8'));
      songs.push({
        name: `preset: ${preset.name}`,
        code: previewCode(preset, { cpm: '120', bpc: '4' }),
      });
    } catch {
      // Not a preset.
    }
  }
  return songs;
}

type Graph = {
  nodes: AppNode[];
  edges: import('@xyflow/react').Edge[];
  cpm: string;
  bpc: string;
  prelude: string;
};
let ids = 0;
const createId = () => `n${++ids}`;

/** What the app does when code is typed into an empty or an open canvas. */
function typeInto(code: string, graph?: Graph): Graph {
  const result = parseProgram(code, knownSources(graph?.nodes ?? []));
  if (!result.ok) throw new Error(`does not parse: ${result.error}`);
  const { program } = result;
  const next = reconcile(program, graph ?? { nodes: [], edges: [] }, createId);
  return {
    nodes: next.nodes,
    edges: next.edges,
    cpm: program.cpm ?? graph?.cpm ?? '120',
    bpc: program.bpc ?? graph?.bpc ?? '4',
    prelude: program.prelude,
  };
}
const codeOf = (graph: Graph) => emitProgram(programOf(graph));

/** Nodes in code order: per line, upstream first. */
const ordered = (graph: Graph) =>
  programOf(graph).lines.flatMap((line) =>
    flatten(line.sink)
      .reverse()
      .map((node) => graph.nodes.find((n) => n.id === node.id)!),
  );

/** Statements the sound check leaves out: they load or set the clock. */
const SIDE_EFFECTS = /^\s*(await\s|samples\s*\(|setc[pp]m\s*\(|setcps\s*\()/;

/**
 * Envelopes as superdough plays them: Strudel fills the stages a pattern
 * leaves out (getADSRValues), so `.decay(0.2)` and
 * `.attack(0.001).decay(0.2).sustain(0.001).release(0.01)` are one sound.
 */
const ENVELOPES: { keys: string[]; trigger?: string; unset?: number[] }[] = [
  { keys: ['attack', 'decay', 'sustain', 'release'] },
  ...['lp', 'hp', 'bp'].map((p) => ({
    keys: ['attack', 'decay', 'sustain', 'release'].map((k) => `${p}${k}`),
    trigger: `${p}env`,
    unset: [0.005, 0.14, 0, 0.1],
  })),
  { keys: ['fmattack', 'fmdecay', 'fmsustain', 'fmrelease'] },
];
const resolveAdsr = getADSRValues as unknown as (
  values: (number | undefined)[],
  curve?: string,
  unset?: number[],
) => number[];
function asPlayed(value: unknown) {
  if (!value || typeof value !== 'object') return value;
  const out = { ...(value as Record<string, unknown>) };
  for (const { keys, trigger, unset } of ENVELOPES) {
    const given = keys.map((key) =>
      typeof out[key] === 'number' ? (out[key] as number) : undefined,
    );
    if (given.every((v) => v === undefined) && !(trigger && trigger in out))
      continue;
    resolveAdsr(given, 'linear', unset).forEach((v, i) => (out[keys[i]] = v));
  }
  return out;
}

/** Each line's expression, with the song's prelude to evaluate it with. */
function linesOf(code: string) {
  const regions = regionsOf(code);
  let prelude = code;
  for (const region of [...regions].reverse())
    prelude = prelude.slice(0, region.start) + prelude.slice(region.end);
  prelude = prelude
    .split('\n')
    .filter((row) => !SIDE_EFFECTS.test(row))
    .join('\n');
  return regions.map((region) => ({
    label: region.label,
    expression: code
      .slice(region.start, region.end)
      .split('\n')
      .filter((row) => !/^\s*\/\//.test(row))
      .join('\n')
      .replace(/^\s*_?S?[\w$]*\s*:\s*/, '')
      .trim(),
    prelude,
  }));
}

/** Differences between a song as written and as the app writes it. */
function check(song: Song): string[] {
  const problems: string[] = [];
  let opened: Graph;
  try {
    opened = typeInto(song.code);
  } catch (error) {
    return [String((error as Error).message)];
  }
  const written = codeOf(opened);

  // Fixed point: typing the app's own code back in changes nothing.
  let again: Graph;
  try {
    again = typeInto(written, opened);
  } catch (error) {
    return [`its own code ${String((error as Error).message)}`];
  }
  const rewritten = codeOf(again);
  const debug =
    process.env.CORPUS_DEBUG && song.name.includes(process.env.CORPUS_DEBUG);
  if (rewritten !== written) {
    problems.push('writing it twice changes it');
    if (debug) {
      const a = written.split('\n');
      const b = rewritten.split('\n');
      const at = a.findIndex((row, i) => row !== b[i]);
      console.log(
        `FIRST:\n${a.slice(Math.max(0, at - 4), at + 6).join('\n')}\nSECOND:\n${b.slice(Math.max(0, at - 4), at + 6).join('\n')}`,
      );
    }
  }

  // Same nodes: ids, types and places kept.
  const before = ordered(opened);
  const after = ordered(again);
  const shape = (nodes: AppNode[]) =>
    nodes.map((n) => `${n.id}:${n.type}@${n.position.x},${n.position.y}`);
  if (shape(before).join() !== shape(after).join()) {
    problems.push('typing its own code back moves or replaces nodes');
    if (debug)
      console.log(
        `BEFORE:\n${shape(before).join('\n')}\nAFTER:\n${shape(after).join('\n')}\nCODE:\n${written}`,
      );
  }

  // A reload: the same code, from scratch, puts every node back.
  try {
    const reloaded = ordered(typeInto(written));
    const places = (nodes: AppNode[]) =>
      nodes.map((n) => `${n.type}@${n.position.x},${n.position.y}`);
    if (places(reloaded).join() !== places(before).join())
      problems.push('reopening it puts nodes elsewhere');
  } catch (error) {
    problems.push(`reopening it: ${String((error as Error).message)}`);
  }

  // Same sound, line by line.
  const original = linesOf(song.code);
  const ours = linesOf(written);
  if (original.length !== ours.length) {
    problems.push(
      `has ${original.length} playing lines, the app writes ${ours.length}`,
    );
  } else {
    original.forEach((line, index) => {
      const mine = ours[index];
      const a = eventsOf(`${line.prelude}\n${line.expression}`, 8, asPlayed);
      if (a === null) return; // Not evaluable on its own (a sample URL…).
      const b = eventsOf(`${mine.prelude}\n${mine.expression}`, 8, asPlayed);
      if (a !== b) {
        problems.push(`line ${line.label} sounds different`);
        if (
          process.env.CORPUS_DEBUG &&
          song.name.includes(process.env.CORPUS_DEBUG)
        )
          console.log(
            `--- ${song.name} ${line.label}\nWRITTEN:\n${line.expression}\nAPP:\n${mine.expression}\nEVENTS A:\n${a?.split('\n').slice(0, 3).join('\n')}\nEVENTS B:\n${b?.split('\n').slice(0, 3).join('\n')}`,
          );
      }
    });
  }
  return problems;
}

const songs = corpus();

describe('corpus round trips', () => {
  it('has songs to check', () => {
    expect(songs.length).toBeGreaterThan(0);
  });

  it.each(songs.map((song) => [song.name, song] as const))(
    '%s',
    (_name, song) => {
      expect(check(song).join('\n')).toBe('');
    },
    30_000,
  );
});
