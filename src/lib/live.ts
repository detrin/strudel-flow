import { create } from 'zustand';
import type { Pattern } from '@strudel/web';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { isOff } from '@/lib/program/emit';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { lineNodes, regionsOf, setLineNodes } from '@/lib/lines';
import { isolateListeners } from '@/lib/diagnostics';

export { lineLabelOf, regionsOf } from '@/lib/lines';

/**
 * What is sounding right now, for highlighting: the code ranges of the
 * playing events (as strudel.cc outlines them) and the nodes of the lines
 * they belong to. Updated every animation frame while playing.
 */

export type CodeRange = { start: number; end: number };

type Live = {
  /** Ranges in the last evaluated code (see `evaluatedCode`). */
  ranges: readonly CodeRange[];
  /** Node ids of the lines that have a sound playing. */
  nodes: ReadonlySet<string>;
  /** Node ids of lines switched off (their first node disabled). */
  off: ReadonlySet<string>;
};

export const useLive = create<Live>(() => ({
  ranges: [],
  nodes: new Set(),
  off: new Set(),
}));
// One failing listener must not stop the others (see diagnostics).
isolateListeners(useLive, 'live');

let evaluated = '';
/** The code Strudel last evaluated; ranges point into it. */
export const evaluatedCode = () => evaluated;
export function setEvaluatedCode(code: string) {
  evaluated = code;
  labelRegions = regionsOf(code);
}

type Hap = {
  whole?: { begin: unknown; end: unknown };
  context?: { locations?: CodeRange[] };
};
type Queryable = { queryArc: (begin: number, end: number) => Hap[] };

let labelRegions: ReturnType<typeof regionsOf> = [];
const labelAt = (offset: number) =>
  labelRegions.find((r) => offset >= r.start && offset < r.end)?.label;

function updateLineNodes() {
  const state = useAppStore.getState();
  const lines = programOf(state).lines;
  // Nodes nothing reaches: a line, or a part of a stack, switched off.
  const off = new Set(
    lines
      .flatMap((line) => flatten(line.sink))
      .filter((node) => node.id && isOff(node))
      .map((node) => node.id!),
  );
  if (!sameSet(off, useLive.getState().off)) useLive.setState({ off });
  let anonymous = 0;
  setLineNodes(
    new Map(
      programOf(state)
        .lines.filter((line) => !line.muted)
        .map((line) => [
          line.label === '$' ? `$${anonymous++}` : line.label,
          flatten(line.sink).flatMap((node) => (node.id ? [node.id] : [])),
        ]),
    ),
  );
}

const sameRanges = (a: readonly CodeRange[], b: readonly CodeRange[]) =>
  a.length === b.length &&
  a.every((r, i) => r.start === b[i].start && r.end === b[i].end);
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

/** Polls the scheduler each frame; returns a stop function. */
export function startLive(getPattern: () => Pattern | undefined) {
  updateLineNodes();
  const stopGraph = useAppStore.subscribe((state, previous) => {
    if (state.nodes !== previous.nodes || state.edges !== previous.edges)
      updateLineNodes();
  });
  let frame = 0;
  let last = -Infinity;
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick);
    // About 30 times a second: often enough for any note, and half the work.
    if (time - last < 30) return;
    last = time;
    const pattern = getPattern() as unknown as Queryable | undefined;
    let ranges: CodeRange[] = [];
    const nodes = new Set<string>();
    if (useAppStore.getState().isPlaying && pattern) {
      const now = getSchedulerNow();
      let haps: Hap[] = [];
      try {
        haps = pattern.queryArc(now, now + 1e-4);
      } catch {
        // A pattern that fails to query has nothing to show.
      }
      const seen = new Set<string>();
      for (const hap of haps) {
        if (!hap.whole) continue;
        const begin = Number(hap.whole.begin);
        const end = Number(hap.whole.end);
        if (!(begin <= now && now < end)) continue;
        for (const location of hap.context?.locations ?? []) {
          const key = `${location.start}:${location.end}`;
          if (seen.has(key)) continue;
          seen.add(key);
          ranges.push({ start: location.start, end: location.end });
          const label = labelAt(location.start);
          for (const id of (label && lineNodes.get(label)) || []) nodes.add(id);
        }
      }
      ranges = ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    }
    const current = useLive.getState();
    if (!sameRanges(current.ranges, ranges) || !sameSet(current.nodes, nodes))
      useLive.setState({ ranges, nodes });
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    stopGraph();
  };
}

type Literal = { start: number; end: number; key: string };

/**
 * Double-quoted and template strings (where mini-notation lives), keyed by
 * line label, text and occurrence, skipping comments and '…' strings.
 */
export function literalsOf(code: string): Literal[] {
  const regions = regionsOf(code);
  const literals: Literal[] = [];
  const counts = new Map<string, number>();
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    const next = code[i + 1];
    if (char === '/' && next === '/') {
      i = code.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (char === '/' && next === '*') {
      i = code.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      let end = i + 1;
      while (end < code.length && code[end] !== char) {
        if (code[end] === '\\') end++;
        if (code[end] === '\n' && char !== '`') break;
        end++;
      }
      if (char !== "'") {
        const label =
          regions.find((r) => i >= r.start && i < r.end)?.label ?? '';
        const base = `${label}\u0000${code.slice(i, end + 1)}`;
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        literals.push({ start: i, end: end + 1, key: `${base}\u0000${n}` });
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return literals;
}

// Scanning is linear in the code (a song may embed a 170 KB sample), and
// highlights change many times a second: keep the last few scans.
const scans = new Map<string, Literal[]>();
function cachedLiterals(code: string): Literal[];
function cachedLiterals(code: string, byKey: true): Map<string, Literal>;
function cachedLiterals(code: string, byKey = false) {
  let literals = scans.get(code);
  if (!literals) {
    literals = literalsOf(code);
    if (scans.size >= 4) scans.delete(scans.keys().next().value!);
    scans.set(code, literals);
  }
  return byKey ? new Map(literals.map((l) => [l.key, l])) : literals;
}

/**
 * Moves ranges from the evaluated code onto the text being edited: a range
 * inside a string literal lands in the same literal (same line label, text
 * and occurrence) of `text`. Ranges with no such literal are dropped.
 */
export function mapRanges(
  from: string,
  text: string,
  ranges: readonly CodeRange[],
): CodeRange[] {
  if (from === text) return [...ranges];
  const source = cachedLiterals(from);
  const target = cachedLiterals(text, true);
  return ranges.flatMap((range) => {
    const literal = source.find(
      (l) => range.start >= l.start && range.end <= l.end,
    );
    const match = literal && target.get(literal.key);
    if (!match) return [];
    const shift = match.start - literal.start;
    return [{ start: range.start + shift, end: range.end + shift }];
  });
}
