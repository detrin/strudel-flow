import { useMemo, useState } from 'react';
import { Eraser } from 'lucide-react';
import type { CustomControlsProps } from '../../define-node';
import { isPatternValue } from '../../define-node';
import { PianoRoll } from '../../shared/piano-roll';
import { usePlayhead } from '../../shared/use-playhead';
import {
  BAR_OPTIONS,
  DIVISIONS,
  rescaleNotes,
  type RollNote,
} from '../../shared/roll';
import { isBlackKey, midiName, readNotes, writeNotes } from './notes-roll';
import { cn } from '@/lib/utils';

export type NotesView = {
  /** How the roll is shown; not part of the code. */
  bars?: number;
  division?: number;
  lowOctave?: number;
  highOctave?: number;
};
type NotesValues = NotesView & {
  pattern: string;
  fn: string;
  // A number, or (at runtime) a pattern string.
  fast: number;
};

const OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

/**
 * Notes as a piano roll with every semitone: the node's mini-notation is
 * played to show its notes, and drawing writes the notes back as code.
 */
export function NotesNode({
  values,
  onChange,
  isPlaying,
  isMuted,
}: CustomControlsProps<NotesValues>) {
  const { pattern, fn } = values;
  const fast = isPatternValue(values.fast) ? null : Number(values.fast);
  const bars = values.bars ?? 1;
  const read = useMemo(
    () =>
      fn === 'note' && fast !== null ? readNotes(pattern, fast, bars) : null,
    [fn, pattern, fast, bars],
  );
  const playhead = usePlayhead(bars, isPlaying && !isMuted);

  if (!read)
    return (
      <div className="w-80 max-w-[calc(100vw-32px)] space-y-2 px-3 pb-3">
        <CodeField values={values} onChange={onChange} />
        <p className="text-[11px] text-muted-foreground">
          {fn === 'n'
            ? 'Scale degrees: the Pad is the piano roll for those.'
            : 'This pattern is not plain notes, so it has no piano roll.'}
        </p>
      </div>
    );

  // The grid must hold every note exactly: a multiple of what the code uses.
  const preferred = values.division ?? 16;
  const division = preferred % read.division === 0 ? preferred : read.division;
  const notes = rescaleNotes(read.notes, read.division, division);
  const pitches = notes.map((note) => note.pitch);
  const lowOctave =
    values.lowOctave ?? (pitches.length ? octaveOf(Math.min(...pitches)) : 3);
  const highOctave = Math.max(
    lowOctave,
    values.highOctave ??
      (pitches.length ? octaveOf(Math.max(...pitches)) : lowOctave),
  );
  const low = (lowOctave + 1) * 12;
  const high = (highOctave + 1) * 12 + 11;
  const hidden = notes.filter((n) => n.pitch < low || n.pitch > high).length;

  const write = (next: RollNote[], view: NotesView = {}) =>
    onChange({
      pattern: writeNotes(next, view.division ?? division, view.bars ?? bars),
      fast: 1,
      division,
      ...view,
    });
  const divisions = (DIVISIONS as readonly number[]).includes(division)
    ? DIVISIONS
    : [...DIVISIONS, division].sort((a, b) => a - b);

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-card p-3 text-card-foreground">
      <div className="nodrag flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          Bars
          <select
            aria-label="Bars"
            value={bars}
            onChange={(event) => onChange({ bars: Number(event.target.value) })}
            className={selectClass}
          >
            {BAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Grid
          <select
            aria-label="Grid"
            value={division}
            onChange={(event) => {
              const next = Number(event.target.value);
              write(rescaleNotes(notes, division, next), { division: next });
            }}
            className={selectClass}
          >
            {divisions.map((option) => (
              <option key={option} value={option}>
                1/{option}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-1.5">
          Oct
          <select
            aria-label="Lowest octave"
            value={lowOctave}
            onChange={(event) =>
              onChange({ lowOctave: Number(event.target.value), highOctave })
            }
            className={selectClass}
          >
            {OCTAVES.filter((o) => o <= highOctave).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          to
          <select
            aria-label="Highest octave"
            value={highOctave}
            onChange={(event) =>
              onChange({ lowOctave, highOctave: Number(event.target.value) })
            }
            className={selectClass}
          >
            {OCTAVES.filter((o) => o >= lowOctave).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </span>
        {hidden > 0 && (
          <span
            title="Notes outside the octaves shown; they still play"
            className="text-amber-600 dark:text-amber-400"
          >
            {hidden} hidden
          </span>
        )}
        <button
          type="button"
          onClick={() => write([])}
          disabled={!notes.length}
          title="Clear all notes"
          className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>

      <PianoRoll
        notes={notes}
        division={division}
        bars={bars}
        low={low}
        high={high}
        onChange={(next) => write(next)}
        playhead={playhead}
        rowHeight={12}
        gutter="w-8"
        label={midiName}
        shade={(pitch) =>
          pitch % 12 === 0 ? 'root' : isBlackKey(pitch) ? 'dark' : null
        }
        noteTitle={(note) =>
          `${midiName(note.pitch)}, ${note.length}/${division}`
        }
      />

      <CodeField values={values} onChange={onChange} />
    </div>
  );
}

/** The node's mini-notation, editable as text. */
function CodeField({
  values,
  onChange,
}: {
  values: NotesValues;
  onChange: (updates: Partial<NotesValues>) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== values.pattern)
      onChange({ pattern: draft });
    setDraft(null);
  };
  const fast = String(values.fast);
  return (
    <div className="nodrag flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
      <select
        aria-label="Notes as"
        value={values.fn}
        onChange={(event) => onChange({ fn: event.target.value })}
        className={cn(selectClass, 'px-1')}
      >
        <option value="note">note</option>
        <option value="n">n</option>
      </select>
      <span>(</span>
      <input
        aria-label="Notes pattern"
        value={draft ?? values.pattern}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        className="nodrag nopan nowheel min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-foreground outline-none focus:border-primary/60"
      />
      <span>){fast !== '1' && `.fast(${fast})`}</span>
    </div>
  );
}

const selectClass =
  'h-7 cursor-pointer rounded-md border border-border bg-background/60 px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
