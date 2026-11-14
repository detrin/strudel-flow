/**
 * The Pad is a piano roll (as in Ableton's MIDI clips): notes are drawn on a
 * grid of scale degrees × time cells, each with its own start and length.
 * Notes that overlap in time play together.
 */

/** A drawn note: scale degree, start and length in grid cells. */
export type PadNote = { pitch: number; start: number; length: number };

export type PadData = {
  notes?: PadNote[];
  /** Grid cells per cycle: 16 = sixteenth notes in a 4-beat cycle. */
  division?: number;
  /** Cycles the clip spans before it loops. */
  bars?: number;
  octave?: number;
  selectedKey?: string;
  selectedScaleType?: string;
  /** Legacy step grid (before the piano roll): grid[step][degree]. */
  grid?: boolean[][];
  steps?: number;
  mode?: 'arp' | 'chord';
  columnModifiers?: unknown;
};

/** Scale degrees shown, low to high: two octaves of a 7-note scale. */
export const ROWS = 15;
export const DIVISIONS = [4, 8, 12, 16, 24, 32] as const;
export const BAR_OPTIONS = [1, 2, 4, 8] as const;

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

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

type Event = { start: number; length: number; pitches: number[] };

/**
 * Strudel code for the clip. Each voice is a sequence of weighted steps
 * (`0@4 ~@2`); voices stack with commas, so notes can overlap freely.
 */
export function generatePattern(data: PadData) {
  const { notes, division, bars } = padClip(data);
  const total = division * bars;

  // Notes starting together with the same length form one chord.
  const chords = new Map<string, Event>();
  for (const note of notes) {
    if (note.start < 0 || note.start >= total || note.length < 1) continue;
    const length = Math.min(note.length, total - note.start);
    const key = `${note.start}:${length}`;
    const chord = chords.get(key) ?? { start: note.start, length, pitches: [] };
    if (!chord.pitches.includes(note.pitch)) chord.pitches.push(note.pitch);
    chords.set(key, chord);
  }
  const events = [...chords.values()].sort(
    (a, b) => a.start - b.start || b.length - a.length,
  );
  if (!events.length) return '';

  // Fewest voices: each event goes to the first voice that is free by then.
  const voices: { end: number; events: Event[] }[] = [];
  for (const event of events) {
    let voice = voices.find((v) => v.end <= event.start);
    if (!voice) voices.push((voice = { end: 0, events: [] }));
    voice.events.push(event);
    voice.end = event.start + event.length;
  }

  // The coarsest unit every time fits, to keep the code short.
  const unit = events.reduce(
    (g, event) => gcd(gcd(g, event.start), event.length),
    total,
  );
  const step = (value: string, cells: number) =>
    cells === unit ? value : `${value}@${cells / unit}`;
  const sequence = (voiceEvents: Event[]) => {
    const steps: string[] = [];
    let cursor = 0;
    for (const { start, length, pitches } of voiceEvents) {
      if (start > cursor) steps.push(step('~', start - cursor));
      const sorted = [...pitches].sort((a, b) => a - b);
      steps.push(
        step(
          sorted.length > 1 ? `[${sorted.join(',')}]` : `${sorted[0]}`,
          length,
        ),
      );
      cursor = start + length;
    }
    if (cursor < total) steps.push(step('~', total - cursor));
    return steps.join(' ');
  };

  const body = voices.map((voice) => sequence(voice.events)).join(', ');
  const pattern =
    bars > 1 ? `[${body}]/${bars}` : voices.length > 1 ? `[${body}]` : body;
  // An unset octave is left to Strudel, as the step pad did.
  const scale = `${data.selectedKey || DEFAULTS.selectedKey}${data.octave || ''}:${data.selectedScaleType || DEFAULTS.selectedScaleType}`;
  return `n("${pattern}").scale("${scale}")`;
}

/**
 * Puts `changed` into the clip the way a piano roll does: a note of the same
 * pitch it overlaps is shortened if it starts earlier, otherwise removed.
 */
export function placeNote(
  notes: PadNote[],
  changed: PadNote,
  replacing?: number,
): PadNote[] {
  const end = changed.start + changed.length;
  const others = notes
    .filter((_, index) => index !== replacing)
    .flatMap((note) => {
      if (
        note.pitch !== changed.pitch ||
        note.start >= end ||
        note.start + note.length <= changed.start
      )
        return [note];
      if (note.start < changed.start)
        return [{ ...note, length: changed.start - note.start }];
      return [];
    });
  return [...others, changed];
}

/** Notes moved onto a finer or coarser grid (at least one cell long). */
export function rescaleNotes(notes: PadNote[], from: number, to: number) {
  const factor = to / from;
  let rescaled: PadNote[] = [];
  for (const note of notes) {
    rescaled = placeNote(rescaled, {
      pitch: note.pitch,
      start: Math.round(note.start * factor),
      length: Math.max(1, Math.round(note.length * factor)),
    });
  }
  return rescaled;
}
