import { Pattern } from '@strudel/web';
import { labelOf } from '@/lib/lines';

/**
 * Punchcards, as on strudel.cc: a line ending in `._punchcard()` (or
 * `._pianoroll()`) is drawn under that line in the code console. Before a
 * program is evaluated, each such call is told its line's label
 * (`tagPunchcards`); while it runs, the call records its pattern here.
 */

const METHODS = ['_punchcard', '_pianoroll'] as const;

let cards = new Map<string, Pattern>();
let collecting: Map<string, Pattern> | null = null;
const listeners = new Set<() => void>();

/** The patterns drawn as punchcards, by line label (without a mute `_`). */
export const punchcards = (): ReadonlyMap<string, Pattern> => cards;

export function onPunchcards(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Wraps one evaluation: what it records replaces the previous cards. */
export async function collectPunchcards<T>(run: () => Promise<T>) {
  collecting = new Map();
  try {
    const result = await run();
    cards = collecting;
    for (const listener of listeners) listener();
    return result;
  } finally {
    collecting = null;
  }
}

const LABEL = /^([A-Za-z_$][\w$]*)\s*:(?!:)/;
const CALL = new RegExp(`\\.(${METHODS.join('|')})\\(`, 'g');

/**
 * Passes each punchcard call its line's label: `._punchcard(` becomes
 * `._punchcard({label:'CHOP'},`. A labelled statement runs until the next
 * line that starts at column 0 with something other than `.` or `)`.
 */
export function tagPunchcards(code: string) {
  let label: string | null = null;
  let anonymous = 0;
  return code
    .split('\n')
    .map((line) => {
      const match = LABEL.exec(line);
      // Anonymous `$:` lines are `$0`, `$1`, … as Strudel names them.
      if (match) {
        label = labelOf(match[1]).label;
        if (label === '$') label = `$${anonymous++}`;
      } else if (/^[^\s.)/]/.test(line)) label = null;
      return label
        ? // Single quotes: Strudel reads double-quoted strings as mini-notation.
          line.replace(CALL, `.$1({label:'${label}'},`)
        : line;
    })
    .join('\n');
}

const prototype = Pattern.prototype as unknown as Record<string, unknown>;
for (const name of METHODS) {
  prototype[name] = function (this: Pattern, meta?: { label?: string }) {
    if (meta?.label) collecting?.set(meta.label, this);
    return this;
  };
}
