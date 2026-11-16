/**
 * Chord progressions as Roman numerals in a key: which chords they are,
 * how to voice them (moving as little as possible from chord to chord),
 * and the techniques that change how a progression feels without
 * rewriting it. Numerals: case is the quality (IV major, iv minor), `b`
 * or `#` before shifts the root, and a suffix adds colour (7, maj7, sus2,
 * sus4, add9, 6, dim). A progression is bars of numerals: one or more
 * chords a bar.
 */

export type Bars = string[][];

export type Technique =
  /** End the loop on V, the strongest way home. */
  | 'resolve'
  /** End on bVI bVII: the triumphant back door home. */
  | 'mario'
  /** Follow IV with its minor iv: bittersweet. */
  | 'borrow-iv'
  /** Keep the tonic in the bass under every chord. */
  | 'pedal'
  /** Two chords a bar: the loop twice in the same time. */
  | 'faster'
  /** add9 on major chords, 7 on minor ones: open, floating. */
  | 'colour'
  /** Everything a whole step up: the final-chorus lift. */
  | 'key-up';

export type Chord = {
  numeral: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Semitones above the root. */
  tones: number[];
  name: string;
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const NUMERAL =
  /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(maj7|7|sus2|sus4|add9|6|dim)?$/;

function parseKey(key: string) {
  const match = /^([A-Ga-g])(#|b)?$/.exec(key.trim());
  if (!match) throw new Error(`Unknown key "${key}".`);
  const letter = LETTERS.indexOf(match[1]!.toUpperCase());
  const shift = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return { letter, pc: (NATURAL[letter]! + shift + 12) % 12 };
}

const accidental = (shift: number) =>
  shift > 0 ? '#'.repeat(shift) : 'b'.repeat(-shift);

export function chordOf(numeral: string, key: string): Chord {
  const match = NUMERAL.exec(numeral);
  if (!match) throw new Error(`Not a chord numeral: "${numeral}".`);
  const [, shiftMark, roman, suffix = ''] = match;
  const { letter: keyLetter, pc: keyPc } = parseKey(key);
  const degree = DEGREES.indexOf(roman!.toUpperCase());
  const shift = shiftMark === 'b' ? -1 : shiftMark === '#' ? 1 : 0;
  const root = (keyPc + MAJOR[degree]! + shift + 12) % 12;
  // Spelled from the key: the 6th degree of D is a B, so bVI is Bb.
  const letter = (keyLetter + degree) % 7;
  let off = root - NATURAL[letter]!;
  if (off > 6) off -= 12;
  if (off < -6) off += 12;
  const rootName = LETTERS[letter]! + accidental(off);
  const minor = roman === roman!.toLowerCase();
  const third = minor ? 3 : 4;
  const [tones, kind] = ((): [number[], string] => {
    switch (suffix) {
      case 'dim':
        return [[0, 3, 6], 'dim'];
      case '7':
        return [[0, third, 7, 10], minor ? 'm7' : '7'];
      case 'maj7':
        return [[0, third, 7, 11], minor ? 'm(maj7)' : 'maj7'];
      case 'sus2':
        return [[0, 2, 7], 'sus2'];
      case 'sus4':
        return [[0, 5, 7], 'sus4'];
      case 'add9':
        return [[0, third, 7, 14], minor ? 'madd9' : 'add9'];
      case '6':
        return [[0, third, 7, 9], minor ? 'm6' : '6'];
      default:
        return [[0, third, 7], minor ? 'm' : ''];
    }
  })();
  return { numeral, root, tones, name: rootName + kind };
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** A key moved by semitones ("D" + 2 → "E"), named as the app's keys are. */
export const transposeKey = (key: string, semitones: number) =>
  NAMES[(parseKey(key).pc + semitones + 120) % 12]!;

const base = (numeral: string) => NUMERAL.exec(numeral)?.[2] ?? '';

/** The progression changed by the techniques (pedal and key-up apply when realized). */
export function applyTechniques(bars: Bars, techniques: Technique[]): Bars {
  let out = bars.map((bar) => [...bar]);
  if (techniques.includes('colour'))
    out = out.map((bar) =>
      bar.map((numeral) => {
        const match = NUMERAL.exec(numeral);
        if (!match || match[3]) return numeral;
        return numeral + (match[2] === match[2]!.toUpperCase() ? 'add9' : '7');
      }),
    );
  if (techniques.includes('borrow-iv')) {
    const at = out.findIndex(
      (bar) => bar.length === 1 && base(bar[0]!) === 'IV',
    );
    if (at >= 0) out[at] = [out[at]![0]!, 'iv'];
  }
  const last = out.length - 1;
  const ending = out[last]?.at(-1) ?? '';
  if (techniques.includes('mario') && last >= 0) out[last] = ['bVI', 'bVII'];
  else if (
    techniques.includes('resolve') &&
    last >= 0 &&
    !['V', 'I'].includes(base(ending))
  )
    out[last] = [out[last]![0]!, 'V'];
  if (techniques.includes('faster')) {
    const flat = [...out.flat(), ...out.flat()];
    const pairs: Bars = [];
    for (let i = 0; i < flat.length && pairs.length < out.length; i += 2)
      pairs.push(flat.slice(i, i + 2));
    out = pairs;
  }
  return out;
}

const LOW = 55;
const HIGH = 79;

/** Every way to play the chord's notes once each, inside the range. */
function candidates(chord: Chord) {
  const pcs = chord.tones.map((t) => (chord.root + t) % 12);
  const out: number[][] = [];
  const pick = (index: number, chosen: number[]) => {
    if (index === pcs.length) {
      const sorted = [...chosen].sort((a, b) => a - b);
      if (sorted.at(-1)! - sorted[0]! <= 14) out.push(sorted);
      return;
    }
    for (let note = LOW; note <= HIGH; note++)
      if (note % 12 === pcs[index] && !chosen.includes(note))
        pick(index + 1, [...chosen, note]);
  };
  pick(0, []);
  return out;
}

const movement = (a: number[], b: number[]) =>
  a.length === b.length
    ? a.reduce((sum, n, i) => sum + Math.abs(n - b[i]!), 0)
    : Math.abs(
        a.reduce((s, n) => s + n, 0) / a.length -
          b.reduce((s, n) => s + n, 0) / b.length,
      ) * 3;

export type Realized = {
  key: string;
  bars: Chord[][];
  /** "D – E – G – Bb C": bars by dashes, chords in a bar by spaces. */
  names: string;
  /** Mini-notation of the voiced chords, one step a bar. */
  chords: string;
  /** Mini-notation of the roots (octave 2), one step a bar. */
  bass: string;
  voicings: number[][][];
};

/** The progression in a key: chords, voicings, roots, as Strudel can play them. */
export function realize(
  progression: Bars,
  key: string,
  techniques: Technique[],
): Realized {
  const inKey = techniques.includes('key-up') ? transposeKey(key, 2) : key;
  const tonic = parseKey(inKey).pc;
  const bars = applyTechniques(progression, techniques).map((bar) =>
    bar.map((numeral) => chordOf(numeral, inKey)),
  );
  let previous: number[] | undefined;
  const voicings = bars.map((bar) =>
    bar.map((chord) => {
      const options = candidates(chord);
      const best = options.reduce((winner, option) => {
        const score = previous
          ? movement(previous, option)
          : Math.abs(option.reduce((s, n) => s + n, 0) / option.length - 65);
        const top = previous
          ? movement(previous, winner)
          : Math.abs(winner.reduce((s, n) => s + n, 0) / winner.length - 65);
        return score < top ? option : winner;
      }, options[0]!);
      previous = best;
      return best;
    }),
  );
  const step = (items: string[]) =>
    items.length === 1 ? items[0]! : `[${items.join(' ')}]`;
  const root = (chord: Chord) =>
    36 + (techniques.includes('pedal') ? tonic : chord.root);
  return {
    key: inKey,
    bars,
    names: bars.map((bar) => bar.map((c) => c.name).join(' ')).join(' – '),
    chords: `<${voicings.map((bar) => step(bar.map((notes) => `[${notes.join(',')}]`))).join(' ')}>`,
    bass: `<${bars.map((bar) => step(bar.map((c) => String(root(c))))).join(' ')}>`,
    voicings,
  };
}
