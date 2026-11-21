/**
 * The Pad is a piano roll (as in Ableton's MIDI clips): notes are drawn on a
 * grid of scale degrees × time cells, each with its own start and length.
 * Notes that overlap in time play together.
 */

import { mini } from '@strudel/web';
import type { Call } from '@/lib/program/syntax';
import {
  BAR_OPTIONS,
  DIVISIONS,
  rollMini,
  type RollNote,
} from '../../shared/roll';

/** A drawn note: scale degree, start and length in grid cells. */
export type PadNote = RollNote;

export type PadData = {
  notes?: PadNote[];
  /** Grid cells per cycle: 16 = sixteenth notes in a 4-beat cycle. */
  division?: number;
  /** Cycles the clip spans before it loops. */
  bars?: number;
  octave?: number;
  /** Octaves shown, relative to `octave` (-3..3, min ≤ max). */
  minOctave?: number;
  maxOctave?: number;
  selectedKey?: string;
  selectedScaleType?: string;
  /**
   * The mini-notation as the code had it, written back unchanged until the
   * clip is edited (the notes are read from it, so the roll shows them).
   */
  pattern?: string;
  /** Legacy step grid (before the piano roll): grid[step][degree]. */
  grid?: boolean[][];
  steps?: number;
  mode?: 'arp' | 'chord';
  columnModifiers?: unknown;
};

export const OCTAVE_OFFSETS = [-3, -2, -1, 0, 1, 2, 3] as const;

const SCALE_SIZES: Record<string, number> = {
  'major:pentatonic': 5,
  'minor:pentatonic': 5,
  blues: 6,
  diminished: 8,
  chromatic: 12,
};
/** Notes per octave of a scale (7 unless listed). */
export const scaleSize = (scale: string) => SCALE_SIZES[scale] ?? 7;

/**
 * Scale degrees the roll shows: from the root of the lowest octave to the
 * root above the highest (0 and 0 = one octave, 8 rows in a major scale).
 */
export function pitchRange(data: PadData) {
  const size = scaleSize(data.selectedScaleType || DEFAULTS.selectedScaleType);
  const min = data.minOctave ?? 0;
  const max = Math.max(min, data.maxOctave ?? 0);
  return { low: min * size, high: (max + 1) * size, size };
}

export const DEFAULTS = {
  division: 16,
  bars: 1,
  octave: 3,
  selectedKey: 'C',
  selectedScaleType: 'major',
} as const;

/** Clears the legacy step-grid fields once the clip is saved as notes. */
export const LEGACY_CLEARED = {
  pattern: undefined,
  grid: undefined,
  steps: undefined,
  mode: undefined,
  columnModifiers: undefined,
} as const;

/** The clip's notes; a legacy step grid becomes one-cell notes (chords). */
export function padClip(data: PadData): {
  notes: PadNote[];
  division: number;
  bars: number;
} {
  const bars = data.bars ?? DEFAULTS.bars;
  if (data.notes) {
    return {
      notes: data.notes,
      division: data.division ?? DEFAULTS.division,
      bars,
    };
  }
  if (!data.grid) return { notes: [], division: DEFAULTS.division, bars };
  // The old pad's default was 5 steps.
  const steps = data.steps ?? 5;
  const notes = data.grid
    .slice(0, steps)
    .flatMap((column, start) =>
      column.flatMap((on, pitch) => (on ? [{ pitch, start, length: 1 }] : [])),
    );
  return { notes, division: steps, bars };
}

const scaleOf = (data: PadData) =>
  `${data.selectedKey || DEFAULTS.selectedKey}${data.octave || ''}:${data.selectedScaleType || DEFAULTS.selectedScaleType}`;

export function generatePattern(data: PadData) {
  if (data.pattern)
    return `n(${JSON.stringify(data.pattern)}).scale(${JSON.stringify(scaleOf(data))})`;
  const { notes, division, bars } = padClip(data);
  const pattern = rollMini(notes, division, bars);
  if (!pattern) return '';
  // An unset octave is left to Strudel, as the step pad did.
  return `n("${pattern}").scale("${scaleOf(data)}")`;
}

type Fraction = { s: bigint; n: bigint; d: bigint };
type Hap = { whole?: { begin: Fraction; end: Fraction }; value: unknown };
const numberOf = (f: Fraction) => (Number(f.s) * Number(f.n)) / Number(f.d);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** Cycles read to find the loop: twice the longest clip the Pad has. */
const LOOK = 2 * Math.max(...BAR_OPTIONS);

/**
 * A Pad from code: `n("0 [2,4] ~ -1").scale("A:minor")`, when its notes are
 * whole scale degrees on a grid the Pad has, looping within the Pad's longest
 * clip. Null
 * otherwise (the line stays a Notes node). The code is kept as written.
 */
export function readPad(base: Call, next: Call | undefined): PadData | null {
  if (base.name !== 'n' || base.args.length !== 1 || next?.name !== 'scale')
    return null;
  const [pattern] = base.args;
  const [scale] = next.args;
  if (typeof pattern !== 'string' || next.args.length !== 1) return null;
  if (typeof scale !== 'string') return null;
  const key = /^([A-Ga-g][#b]?)([0-8])?:([a-z0-9:]+)$/.exec(scale);
  if (!key) return null;

  let haps: Hap[];
  try {
    haps = (
      mini(pattern) as unknown as {
        queryArc: (b: number, e: number) => Hap[];
      }
    ).queryArc(0, LOOK);
  } catch {
    return null;
  }
  const events: { pitch: number; begin: number; end: number }[] = [];
  let unit = 1;
  for (const hap of haps) {
    if (!hap.whole) continue;
    const pitch = Number(hap.value);
    if (!Number.isInteger(pitch) || typeof hap.value === 'boolean') return null;
    const begin = numberOf(hap.whole.begin);
    if (begin < 0 || begin >= LOOK) continue;
    events.push({ pitch, begin, end: numberOf(hap.whole.end) });
    for (const f of [hap.whole.begin, hap.whole.end]) {
      const d = Number(f.d);
      unit = (unit / gcd(unit, d)) * d;
    }
  }
  if (!events.length) return null;
  const division =
    DIVISIONS.find((d) => d % unit === 0 && d >= 16) ??
    DIVISIONS.find((d) => d % unit === 0);
  if (!division) return null;

  // The shortest loop that everything read repeats.
  const id = (e: (typeof events)[number], bars: number) =>
    `${e.pitch}:${(e.begin % bars).toFixed(6)}:${(e.end - e.begin).toFixed(6)}`;
  const bars = BAR_OPTIONS.find((b) => {
    const first = events.filter((e) => e.begin < b);
    const ids = new Set(first.map((e) => id(e, b)));
    return (
      first.length * (LOOK / b) === events.length &&
      events.every((e) => ids.has(id(e, b)))
    );
  });
  if (!bars) return null;
  const notes = events
    .filter((e) => e.begin < bars)
    .map(({ pitch, begin, end }) => ({
      pitch,
      start: Math.round(begin * division),
      length: Math.max(1, Math.round((Math.min(end, bars) - begin) * division)),
    }));

  const scaleType = key[3];
  const size = scaleSize(scaleType);
  const pitches = notes.map((note) => note.pitch);
  const minOctave = Math.floor(Math.min(...pitches) / size);
  const maxOctave = Math.floor(Math.max(...pitches) / size);
  if (minOctave < OCTAVE_OFFSETS[0] || maxOctave > OCTAVE_OFFSETS.at(-1)!)
    return null;
  return {
    pattern,
    notes,
    division,
    bars,
    selectedKey: key[1],
    ...(key[2] ? { octave: Number(key[2]) } : {}),
    selectedScaleType: scaleType,
    minOctave,
    maxOctave: Math.max(minOctave, Math.min(maxOctave, OCTAVE_OFFSETS.at(-1)!)),
  };
}
