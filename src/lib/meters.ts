import type { Pattern } from '@strudel/web';
import {
  analyserById,
  audioContext as getAudioContext,
  masterOutput,
} from '@/lib/strudel-internals';
import { getSchedulerCps, getSchedulerNow } from '@/lib/strudel-clock';
import { regionsOf } from '@/lib/lines';
import { parseScript } from '@/lib/program/syntax';
import type { Expression, Statement } from 'acorn';

/**
 * Measuring what plays, for the nodes that show it (Filter, Envelope,
 * Level, Delay, Space, Modulate, Analyzer). Before evaluation every line
 * gets its own analyser (`tagAnalysers`, in the evaluated code only); while
 * playing, a loop keeps each line's (and the master's) loudness history and
 * its recent notes. Nothing runs while stopped.
 */

export const MASTER = 'master';
/** Cycles of loudness kept. */
const HISTORY_CYCLES = 16;
/** Cycles of past notes kept (release tails, echoes, reverb). */
const RECENT_CYCLES = 4;

const idOf = (key: string) => `flow_${key.replace(/[^\w]/g, '_')}`;
/** Line label, or part key (`kick#0`), → its analyser id. */
let lineIds = new Map<string, string>();
/** A line that merges parts → its parts' keys, in code order. */
let lineParts = new Map<string, string[]>();

/**
 * The parts of a line's `stack(a, b, …)`, when the line is one (followed
 * by effects or not): their spans in `body`. Empty otherwise.
 */
function stackParts(body: string) {
  let statements: Statement[];
  try {
    statements = parseScript(body).body as Statement[];
  } catch {
    return [];
  }
  const [statement] = statements;
  if (
    statement?.type !== 'LabeledStatement' ||
    statement.body.type !== 'ExpressionStatement'
  )
    return [];
  let base: Expression = statement.body.expression;
  while (
    base.type === 'CallExpression' &&
    base.callee.type === 'MemberExpression'
  )
    base = base.callee.object as Expression;
  if (
    base.type !== 'CallExpression' ||
    base.callee.type !== 'Identifier' ||
    base.callee.name !== 'stack' ||
    base.arguments.length < 2 ||
    base.arguments.some((arg) => arg.type === 'SpreadElement')
  )
    return [];
  return base.arguments.map((arg) => ({ start: arg.start, end: arg.end }));
}

/**
 * Adds `.analyze('flow_<label>')` to the end of every line of the code to
 * evaluate, so each line is measured on its own. A line that merges parts
 * (`stack(a, b).fx()`) gets one per part instead (`flow_<label>_0`, …), so
 * a filter in one part shows that part; the line is their sum. A line that
 * already analyses (a Scope node) keeps its own id.
 */
export function tagAnalysers(code: string) {
  const ids = new Map<string, string>();
  const parts = new Map<string, string[]>();
  const insert: { at: number; text: string }[] = [];
  for (const region of regionsOf(code)) {
    const body = code.slice(region.start, region.end);
    const own = /\.analyze\(\s*["'`]([^"'`]+)["'`]/.exec(body)?.[1];
    if (own) {
      ids.set(region.label, own);
      continue;
    }
    const spans = stackParts(body);
    if (spans.length) {
      const keys = spans.map((span, index) => {
        const key = `${region.label}#${index}`;
        const id = idOf(key);
        ids.set(key, id);
        // Single quotes: double-quoted strings are mini-notation in Strudel.
        insert.push({ at: region.start + span.start, text: '(' });
        insert.push({
          at: region.start + span.end,
          text: `).analyze('${id}')`,
        });
        return key;
      });
      parts.set(region.label, keys);
      continue;
    }
    // After the line's last code (disabled calls are comment lines).
    const rows = body.split('\n');
    let offset = region.start;
    let at = -1;
    for (const row of rows) {
      const trimmed = row.trim();
      if (trimmed && !trimmed.startsWith('//')) at = offset + row.length;
      offset += row.length + 1;
    }
    if (at < 0) continue;
    const id = idOf(region.label);
    ids.set(region.label, id);
    insert.push({ at, text: `.analyze('${id}')` });
  }
  lineIds = ids;
  lineParts = parts;
  let tagged = code;
  // Back to front; at one offset, the closing `)` before an opening `(`.
  for (const { at, text } of insert
    .map((item, order) => ({ ...item, order }))
    .sort((a, b) => b.at - a.at || b.order - a.order))
    tagged = tagged.slice(0, at) + text + tagged.slice(at);
  return tagged;
}

/** Each line's parts summed, for a line that merges parts. */
const sums = new Map<
  string,
  { node: AnalyserNode; inputs: Set<AnalyserNode> }
>();
function summed(label: string, keys: string[]) {
  const sources = keys.flatMap((key) => {
    const id = lineIds.get(key);
    const node = id ? analyserById(id) : undefined;
    return node ? [node] : [];
  });
  if (!sources.length) return undefined;
  let sum = sums.get(label);
  if (!sum || sum.node.context !== sources[0].context) {
    const node = sources[0].context.createAnalyser();
    node.fftSize = sources[0].fftSize;
    node.smoothingTimeConstant = sources[0].smoothingTimeConstant;
    sum = { node, inputs: new Set() };
    sums.set(label, sum);
  }
  for (const source of sources)
    if (!sum.inputs.has(source)) {
      source.connect(sum.node);
      sum.inputs.add(source);
    }
  return sum.node;
}

/**
 * The analyser measuring a line (by label) or one part of it (`kick#0`),
 * once it has played.
 */
export const lineAnalyser = (key: string) => {
  const keys = lineParts.get(key);
  if (keys) return summed(key, keys);
  const id = lineIds.get(key);
  return id ? analyserById(id) : undefined;
};

export const analyserIdOf = (key: string) => lineIds.get(key);

let master: AnalyserNode | undefined;
let tapped: AudioNode | undefined;
/** An analyser on the master output (re-tapped if Strudel rebuilds it). */
export function masterAnalyser() {
  const gain = masterOutput();
  if (!gain) return undefined;
  if (gain !== tapped) {
    master ??= getAudioContext().createAnalyser();
    master.fftSize = 4096;
    master.smoothingTimeConstant = 0.6;
    gain.connect(master);
    tapped = gain;
  }
  return master;
}

/** The analyser for a source: a line label, or MASTER. */
export const analyserOf = (source: string) =>
  source === MASTER ? masterAnalyser() : lineAnalyser(source);

export type Level = { at: number; rms: number; peak: number };
const levels = new Map<string, Level[]>();
/** Loudness over the last cycles (at: cycle), oldest first. */
export const historyOf = (source: string) => levels.get(source) ?? [];

/** A note that played recently: cycles, and the values it had. */
export type RecentHap = {
  begin: number;
  end: number;
  value: Record<string, unknown>;
};
const recent = new Map<string, RecentHap[]>();
/** Notes of a line that started in the last few cycles. */
export const recentHaps = (label: string) => recent.get(label) ?? [];

const buffers = new WeakMap<AnalyserNode, Float32Array>();
function measure(analyser: AnalyserNode) {
  let data = buffers.get(analyser);
  if (data?.length !== analyser.fftSize) {
    data = new Float32Array(analyser.fftSize);
    buffers.set(analyser, data);
  }
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  let peak = 0;
  for (const sample of data) {
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: Math.sqrt(sum / data.length), peak };
}

type Fraction = { valueOf: () => number };
type Hap = {
  whole?: { begin: Fraction; end: Fraction };
  value: unknown;
  hasOnset?: () => boolean;
};
type Queryable = { queryArc: (begin: number, end: number) => Hap[] };

/** Keeps histories and recent notes while playing; returns a stop function. */
export function startMeters(
  getPattern: () => Pattern | undefined,
  isPlaying: () => boolean,
) {
  let frame = 0;
  let last = 0;
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick);
    if (!isPlaying() || time - last < 30) return;
    last = time;
    const now = getSchedulerNow();
    const record = (source: string, analyser: AnalyserNode | undefined) => {
      if (!analyser) return;
      const list = levels.get(source) ?? [];
      list.push({ at: now, ...measure(analyser) });
      while (list.length && list[0].at < now - HISTORY_CYCLES) list.shift();
      levels.set(source, list);
    };
    for (const key of [...lineIds.keys(), ...lineParts.keys()])
      record(key, lineAnalyser(key));
    record(MASTER, masterAnalyser());

    const pattern = getPattern() as unknown as Queryable | undefined;
    if (!pattern) return;
    // Only the time since the last tick is new: query just that slice
    // (from scratch after a new pattern, a jump or a restart).
    if (pattern !== queried || now < until || now - until > RECENT_CYCLES) {
      recent.clear();
      queried = pattern;
      until = Math.max(0, now - RECENT_CYCLES);
    }
    if (now <= until) return;
    const byId = new Map([...lineIds].map(([label, id]) => [id, label]));
    let haps: Hap[] = [];
    try {
      haps = pattern.queryArc(until, now);
    } catch {
      return;
    }
    for (const hap of haps) {
      if (!hap.whole || (hap.hasOnset && !hap.hasOnset())) continue;
      const value = (hap.value ?? {}) as Record<string, unknown>;
      const key = byId.get(String(value.analyze));
      if (!key) continue;
      const played = {
        begin: Number(hap.whole.begin),
        end: Number(hap.whole.end),
        value,
      };
      // A part's notes are its line's too.
      const line = key.includes('#') ? key.slice(0, key.indexOf('#')) : null;
      for (const owner of line ? [key, line] : [key]) {
        const list = recent.get(owner) ?? [];
        list.push(played);
        recent.set(owner, list);
      }
    }
    until = now;
    for (const [label, list] of recent) {
      const kept = list.filter((hap) => hap.begin >= now - RECENT_CYCLES);
      if (kept.length !== list.length) recent.set(label, kept);
    }
  };
  let queried: Queryable | undefined;
  let until = 0;
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Cycles → seconds at the current tempo. */
export const secondsPerCycle = () => 1 / (getSchedulerCps() || 0.5);
