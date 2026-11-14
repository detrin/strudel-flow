/**
 * The Pad is a piano roll (as in Ableton's MIDI clips): notes are drawn on a
 * grid of scale degrees × time cells, each with its own start and length.
 * Notes that overlap in time play together.
 */

import { rollMini, type RollNote } from '../../shared/roll';

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

export function generatePattern(data: PadData) {
  const { notes, division, bars } = padClip(data);
  const pattern = rollMini(notes, division, bars);
  if (!pattern) return '';
  // An unset octave is left to Strudel, as the step pad did.
  const scale = `${data.selectedKey || DEFAULTS.selectedKey}${data.octave || ''}:${data.selectedScaleType || DEFAULTS.selectedScaleType}`;
  return `n("${pattern}").scale("${scale}")`;
}
