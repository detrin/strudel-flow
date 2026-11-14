import { mini, noteToMidi } from '@strudel/web';
import { rollMini, type RollNote } from '../../shared/roll';

/**
 * The Notes node's piano roll: chromatic rows (every semitone), read from
 * the node's mini-notation by playing it, written back with note names.
 */

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
/** MIDI note → Strudel name: 60 → `c4`, 61 → `c#4`. */
export const midiName = (midi: number) =>
  `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export const isBlackKey = (midi: number) =>
  NAMES[((midi % 12) + 12) % 12].includes('#');

/** Most cells per cycle the roll shows; finer rhythms are rounded. */
const MAX_DIVISION = 64;

type Fraction = { s: bigint; n: bigint; d: bigint };
type Hap = { whole?: { begin: Fraction; end: Fraction }; value: unknown };
const valueOf = (f: Fraction) => (Number(f.s) * Number(f.n)) / Number(f.d);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

function midiOf(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const midi = noteToMidi(value);
    return Number.isFinite(midi) ? midi : null;
  } catch {
    return null;
  }
}

/**
 * The notes a pattern plays in its first `bars` cycles, on the coarsest
 * grid that holds them (at least 4 cells per cycle). Null when it plays
 * something that is not a note.
 */
export function readNotes(
  pattern: string,
  fast: number,
  bars: number,
): { notes: RollNote[]; division: number } | null {
  let haps: Hap[];
  try {
    haps = (
      mini(pattern) as unknown as {
        fast: (n: number) => { queryArc: (b: number, e: number) => Hap[] };
      }
    )
      .fast(fast)
      .queryArc(0, bars);
  } catch {
    return null;
  }
  let division = 4;
  const events: { midi: number; begin: number; end: number }[] = [];
  for (const hap of haps) {
    if (!hap.whole) continue;
    const begin = valueOf(hap.whole.begin);
    if (begin < 0 || begin >= bars) continue;
    const midi = midiOf(hap.value);
    if (midi === null) return null;
    events.push({ midi, begin, end: valueOf(hap.whole.end) });
    for (const f of [hap.whole.begin, hap.whole.end])
      division = Math.min(MAX_DIVISION, lcm(division, Number(f.d)));
  }
  events.sort((a, b) => a.begin - b.begin || a.midi - b.midi);
  return {
    division,
    notes: events.map(({ midi, begin, end }) => ({
      pitch: midi,
      start: Math.round(begin * division),
      length: Math.max(1, Math.round((Math.min(end, bars) - begin) * division)),
    })),
  };
}

/** Mini-notation for drawn notes (`~` when there are none). */
export const writeNotes = (notes: RollNote[], division: number, bars: number) =>
  rollMini(notes, division, bars, midiName) || '~';
