/**
 * Chord progressions as Roman numerals in a key: which chords they are,
 * how to voice them (moving as little as possible from chord to chord),
 * and the techniques that change how a progression feels without
 * rewriting it. Numerals: case is the quality (IV major, iv minor), `b`
 * or `#` before shifts the root, a suffix adds colour (7, maj7, 9, maj9,
 * 11, 13, 6, 69, add9, sus2, sus4, 7sus4, dim, dim7, m7b5, aug, 7b9,
 * maj7#11), and `/` puts another degree in the bass (II/I is E over D in
 * D). A progression is bars of numerals: one or more chords a bar.
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
  /** Each chord two bars: calmer, more space. */
  | 'slower'
  /** add9 on major chords, 7 on minor ones: open, floating. */
  | 'colour'
  /** maj9, 9 and m9: the lush future-bass sound. */
  | 'lush'
  /** Each plain chord leans on its 4th first, then resolves: yearning. */
  | 'suspend'
  /** V goes to vi instead of home: a poignant surprise. */
  | 'deceptive'
  /** Everything a whole step up: the final-chorus lift. */
  | 'key-up';

export type Chord = {
  numeral: string;
  /** Pitch class of the root, 0 = C. */
  root: number;
  /** Pitch class in the bass: the root, or the degree after a slash. */
  bass: number;
  /** Semitones above the root. */
  tones: number[];
  name: string;
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const ROMAN = '(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)';
const SUFFIX =
  '(maj7#11|maj9|maj7|m7b5|7sus4|7b9|dim7|dim|aug|sus2|sus4|add9|69|13|11|9|7|6)?';
const NUMERAL = new RegExp(`^${ROMAN}${SUFFIX}(?:/${ROMAN})?$`);

function parseKey(key: string) {
  const match = /^([A-Ga-g])(#|b)?$/.exec(key.trim());
  if (!match) throw new Error(`Unknown key "${key}".`);
  const letter = LETTERS.indexOf(match[1]!.toUpperCase());
  const shift = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return { letter, pc: (NATURAL[letter]! + shift + 12) % 12 };
}

const accidental = (shift: number) =>
  shift > 0 ? '#'.repeat(shift) : 'b'.repeat(-shift);

/** A degree of the key: its pitch class and its name, spelled from the key. */
function degreeOf(mark: string | undefined, roman: string, key: string) {
  const { letter: keyLetter, pc: keyPc } = parseKey(key);
  const degree = DEGREES.indexOf(roman.toUpperCase());
  const shift = mark === 'b' ? -1 : mark === '#' ? 1 : 0;
  const pc = (keyPc + MAJOR[degree]! + shift + 12) % 12;
  // The 6th degree of D is a B, so bVI is Bb (not A#).
  const letter = (keyLetter + degree) % 7;
  let off = pc - NATURAL[letter]!;
  if (off > 6) off -= 12;
  if (off < -6) off += 12;
  return { pc, name: LETTERS[letter]! + accidental(off) };
}

/** Tones (semitones over the root) and the name's ending, by suffix. */
function quality(suffix: string, minor: boolean): [number[], string] {
  const third = minor ? 3 : 4;
  const m = minor ? 'm' : '';
  switch (suffix) {
    case '7':
      return [[0, third, 7, 10], `${m}7`];
    case 'maj7':
      return [[0, third, 7, 11], minor ? 'm(maj7)' : 'maj7'];
    case '9':
      return [[0, third, 7, 10, 14], `${m}9`];
    case 'maj9':
      return [[0, third, 7, 11, 14], minor ? 'm(maj9)' : 'maj9'];
    // 11 and 13 leave out what clashes (the 3rd under a major 11th, the
    // 5th and 11th in a 13th), as players do.
    case '11':
      return [minor ? [0, 3, 7, 10, 14, 17] : [0, 7, 10, 14, 17], `${m}11`];
    case '13':
      return [[0, third, 10, 14, 21], `${m}13`];
    case '6':
      return [[0, third, 7, 9], `${m}6`];
    case '69':
      return [[0, third, 7, 9, 14], `${m}6/9`];
    case 'add9':
      return [[0, third, 7, 14], `${m}add9`];
    case 'sus2':
      return [[0, 2, 7], 'sus2'];
    case 'sus4':
      return [[0, 5, 7], 'sus4'];
    case '7sus4':
      return [[0, 5, 7, 10], '7sus4'];
    case 'dim':
      return [[0, 3, 6], 'dim'];
    case 'dim7':
      return [[0, 3, 6, 9], 'dim7'];
    case 'm7b5':
      return [[0, 3, 6, 10], 'm7b5'];
    case 'aug':
      return [[0, 4, 8], 'aug'];
    case '7b9':
      return [[0, 4, 7, 10, 13], '7b9'];
    case 'maj7#11':
      return [[0, 4, 7, 11, 18], 'maj7#11'];
    default:
      return [[0, third, 7], m];
  }
}

export function chordOf(numeral: string, key: string): Chord {
  const match = NUMERAL.exec(numeral);
  if (!match) throw new Error(`Not a chord numeral: "${numeral}".`);
  const [, mark, roman, suffix = '', bassMark, bassRoman] = match;
  const root = degreeOf(mark, roman!, key);
  const [tones, kind] = quality(suffix, roman === roman!.toLowerCase());
  const bass = bassRoman ? degreeOf(bassMark, bassRoman, key) : root;
  return {
    numeral,
    root: root.pc,
    bass: bass.pc,
    tones,
    name: root.name + kind + (bassRoman ? `/${bass.name}` : ''),
  };
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** A key moved by semitones ("D" + 2 → "E"), named as the app's keys are. */
export const transposeKey = (key: string, semitones: number) =>
  NAMES[(parseKey(key).pc + semitones + 120) % 12]!;

const parts = (numeral: string) => {
  const match = NUMERAL.exec(numeral);
  return {
    roman: match?.[2] ?? '',
    plain: Boolean(match && !match[3] && !match[5]),
  };
};
const base = (numeral: string) => parts(numeral).roman.toUpperCase();
const isMajor = (numeral: string) => {
  const { roman } = parts(numeral);
  return roman !== '' && roman === roman.toUpperCase();
};

/** Plain triads changed by a function (chords with colour are left alone). */
const onPlain = (bars: Bars, change: (numeral: string) => string[]) =>
  bars.map((bar) =>
    bar.length === 1 && parts(bar[0]!).plain ? change(bar[0]!) : bar,
  );

/** The progression changed by the techniques (pedal and key-up apply when realized). */
export function applyTechniques(bars: Bars, techniques: Technique[]): Bars {
  const has = (technique: Technique) => techniques.includes(technique);
  let out = bars.map((bar) => [...bar]);
  if (has('lush'))
    out = out.map((bar) =>
      bar.map((numeral) => {
        if (!parts(numeral).plain) return numeral;
        if (!isMajor(numeral)) return `${numeral}9`;
        // The home chords get the major 7th; the others are dominant 9ths.
        return ['I', 'IV'].includes(base(numeral)) || /^b/.test(numeral)
          ? `${numeral}maj9`
          : `${numeral}9`;
      }),
    );
  else if (has('colour'))
    out = out.map((bar) =>
      bar.map((numeral) =>
        parts(numeral).plain
          ? numeral + (isMajor(numeral) ? 'add9' : '7')
          : numeral,
      ),
    );
  if (has('borrow-iv')) {
    const at = out.findIndex(
      (bar) => bar.length === 1 && base(bar[0]!) === 'IV' && isMajor(bar[0]!),
    );
    if (at >= 0) out[at] = [out[at]![0]!, 'iv'];
  }
  const last = out.length - 1;
  const ending = out[last]?.at(-1) ?? '';
  if (has('mario') && last >= 0) out[last] = ['bVI', 'bVII'];
  else if (has('resolve') && last >= 0 && !['V', 'I'].includes(base(ending)))
    out[last] = [out[last]![0]!, 'V'];
  if (has('deceptive')) {
    // The first V that goes home goes to vi instead (around the loop too).
    const flat = out.flatMap((bar, b) => bar.map((n, i) => ({ n, b, i })));
    for (let k = 0; k < flat.length; k++) {
      const here = flat[k]!;
      const next = flat[(k + 1) % flat.length]!;
      if (base(here.n) === 'V' && isMajor(here.n) && base(next.n) === 'I') {
        out[next.b]![next.i] = 'vi';
        break;
      }
    }
  }
  if (has('suspend'))
    out = onPlain(out, (numeral) => [`${numeral}sus4`, numeral]);
  if (has('faster')) {
    const flat = [...out.flat(), ...out.flat()];
    const pairs: Bars = [];
    for (let i = 0; i < flat.length && pairs.length < out.length; i += 2)
      pairs.push(flat.slice(i, i + 2));
    out = pairs;
  } else if (has('slower')) out = out.flatMap((bar) => [bar, [...bar]]);
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
    36 + (techniques.includes('pedal') ? tonic : chord.bass);
  return {
    key: inKey,
    bars,
    names: bars.map((bar) => bar.map((c) => c.name).join(' ')).join(' – '),
    chords: `<${voicings.map((bar) => step(bar.map((notes) => `[${notes.join(',')}]`))).join(' ')}>`,
    bass: `<${bars.map((bar) => step(bar.map((c) => String(root(c))))).join(' ')}>`,
    voicings,
  };
}
