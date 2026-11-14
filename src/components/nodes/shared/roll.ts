/**
 * Piano-roll clips (Pad, Notes): notes on a grid of pitch rows × time
 * cells, each with its own start and length, written as mini-notation.
 */

/** A drawn note: a pitch row, start and length in grid cells. */
export type RollNote = { pitch: number; start: number; length: number };

export const DIVISIONS = [4, 8, 12, 16, 24, 32] as const;
export const BAR_OPTIONS = [1, 2, 4, 8] as const;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

type Event = { start: number; length: number; pitches: number[] };

/**
 * Mini-notation for a clip. Each voice is a sequence of weighted steps
 * (`0@4 ~@2`); voices stack with commas, so notes can overlap freely, and
 * notes that start together with the same length are one chord.
 * `name` writes a pitch (`String` for degrees, a note name for MIDI).
 */
export function rollMini(
  notes: RollNote[],
  division: number,
  bars: number,
  name: (pitch: number) => string = String,
) {
  const total = division * bars;
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
      const sorted = [...pitches].sort((a, b) => a - b).map(name);
      steps.push(
        step(sorted.length > 1 ? `[${sorted.join(',')}]` : sorted[0], length),
      );
      cursor = start + length;
    }
    if (cursor < total) steps.push(step('~', total - cursor));
    return steps.join(' ');
  };

  const body = voices.map((voice) => sequence(voice.events)).join(', ');
  return bars > 1
    ? `[${body}]/${bars}`
    : voices.length > 1
      ? `[${body}]`
      : body;
}

/**
 * Puts `changed` into the clip the way a piano roll does: a note of the same
 * pitch it overlaps is shortened if it starts earlier, otherwise removed.
 */
export function placeNote(
  notes: RollNote[],
  changed: RollNote,
  replacing?: number,
): RollNote[] {
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
export function rescaleNotes(notes: RollNote[], from: number, to: number) {
  const factor = to / from;
  let rescaled: RollNote[] = [];
  for (const note of notes) {
    rescaled = placeNote(rescaled, {
      pitch: note.pitch,
      start: Math.round(note.start * factor),
      length: Math.max(1, Math.round(note.length * factor)),
    });
  }
  return rescaled;
}
