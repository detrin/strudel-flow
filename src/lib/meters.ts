import {
  analysers,
  getAudioContext,
  getSuperdoughAudioController,
  type Pattern,
} from '@strudel/web';
import { useAppStore } from '@/store/app-store';
import { getSchedulerCps, getSchedulerNow } from '@/lib/strudel-clock';
import { regionsOf } from '@/lib/live';

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

const idOf = (label: string) => `flow_${label.replace(/[^\w]/g, '_')}`;
/** Line label → its analyser id. */
let lineIds = new Map<string, string>();

/**
 * Adds `.analyze('flow_<label>')` to the end of every line of the code to
 * evaluate. A line that already analyses (a Scope node) keeps its own id.
 */
export function tagAnalysers(code: string) {
  const ids = new Map<string, string>();
  const insert: { at: number; text: string }[] = [];
  for (const region of regionsOf(code)) {
    const body = code.slice(region.start, region.end);
    const own = /\.analyze\(\s*["'`]([^"'`]+)["'`]/.exec(body)?.[1];
    if (own) {
      ids.set(region.label, own);
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
    // Single quotes: double-quoted strings are mini-notation in Strudel.
    insert.push({ at, text: `.analyze('${id}')` });
  }
  lineIds = ids;
  let tagged = code;
  for (const { at, text } of insert.sort((a, b) => b.at - a.at))
    tagged = tagged.slice(0, at) + text + tagged.slice(at);
  return tagged;
}

/** The analyser measuring a line (by label), once it has played. */
export const lineAnalyser = (label: string) => {
  const id = lineIds.get(label);
  return id ? (analysers[id] as AnalyserNode | undefined) : undefined;
};
export const analyserIdOf = (label: string) => lineIds.get(label);

let master: AnalyserNode | undefined;
let tapped: AudioNode | undefined;
/** An analyser on the master output (re-tapped if Strudel rebuilds it). */
export function masterAnalyser() {
  const output = (
    getSuperdoughAudioController() as unknown as {
      output?: { destinationGain?: AudioNode | null };
    }
  ).output;
  const gain = output?.destinationGain;
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
let recent = new Map<string, RecentHap[]>();
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
export function startMeters(getPattern: () => Pattern | undefined) {
  let frame = 0;
  let last = 0;
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick);
    if (!useAppStore.getState().isPlaying || time - last < 30) return;
    last = time;
    const now = getSchedulerNow();
    const record = (source: string, analyser: AnalyserNode | undefined) => {
      if (!analyser) return;
      const list = levels.get(source) ?? [];
      list.push({ at: now, ...measure(analyser) });
      while (list.length && list[0].at < now - HISTORY_CYCLES) list.shift();
      levels.set(source, list);
    };
    for (const label of lineIds.keys()) record(label, lineAnalyser(label));
    record(MASTER, masterAnalyser());

    const pattern = getPattern() as unknown as Queryable | undefined;
    if (!pattern) return;
    const byId = new Map([...lineIds].map(([label, id]) => [id, label]));
    const next = new Map<string, RecentHap[]>();
    let haps: Hap[] = [];
    try {
      haps = pattern.queryArc(Math.max(0, now - RECENT_CYCLES), now + 0.01);
    } catch {
      return;
    }
    for (const hap of haps) {
      if (!hap.whole || (hap.hasOnset && !hap.hasOnset())) continue;
      const value = (hap.value ?? {}) as Record<string, unknown>;
      const label = byId.get(String(value.analyze));
      if (!label) continue;
      const begin = Number(hap.whole.begin);
      if (begin > now) continue;
      const list = next.get(label) ?? [];
      list.push({ begin, end: Number(hap.whole.end), value });
      next.set(label, list);
    }
    recent = next;
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Cycles → seconds at the current tempo. */
export const secondsPerCycle = () => 1 / (getSchedulerCps() || 0.5);
