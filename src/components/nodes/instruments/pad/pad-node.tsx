import { Eraser } from 'lucide-react';
import type { CustomControlsProps } from '../../define-node';
import {
  DEFAULTS,
  LEGACY_CLEARED,
  OCTAVE_OFFSETS,
  padClip,
  pitchRange,
  type PadData,
} from './pad';
import { BAR_OPTIONS, DIVISIONS, rescaleNotes } from '../../shared/roll';
import { PianoRoll } from '../../shared/piano-roll';
import { usePlayhead } from '../../shared/use-playhead';
import { AccordionControls } from '@/components/nodes/shared/accordion-controls';

/**
 * A piano roll: draw notes by clicking or dragging on the grid, drag a note
 * to move it, drag its right edge to change its length, click it to delete.
 */
export function PadNode({
  values: data,
  onChange,
  isPlaying,
  isMuted,
}: CustomControlsProps<PadData>) {
  const clip = padClip(data);
  const { division, bars } = clip;
  const { low, high, size } = pitchRange(data);
  const minOctave = data.minOctave ?? 0;
  const maxOctave = Math.max(minOctave, data.maxOctave ?? 0);
  const isRoot = (pitch: number) => ((pitch % size) + size) % size === 0;
  const hidden = clip.notes.filter(
    (note) => note.pitch < low || note.pitch > high,
  ).length;
  const playhead = usePlayhead(bars, isPlaying && !isMuted);

  const save = (updates: Partial<PadData>) =>
    onChange({
      notes: clip.notes,
      division,
      bars,
      ...LEGACY_CLEARED,
      ...updates,
    });

  const divisions = DIVISIONS.includes(division as (typeof DIVISIONS)[number])
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
            onChange={(event) => save({ bars: Number(event.target.value) })}
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
              save({
                division: next,
                notes: rescaleNotes(clip.notes, division, next),
              });
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
            title="Lowest octave shown"
            value={minOctave}
            onChange={(event) =>
              onChange({ minOctave: Number(event.target.value), maxOctave })
            }
            className={selectClass}
          >
            {OCTAVE_OFFSETS.filter((o) => o <= maxOctave).map((option) => (
              <option key={option} value={option}>
                {option > 0 ? `+${option}` : option}
              </option>
            ))}
          </select>
          to
          <select
            aria-label="Highest octave"
            title="Highest octave shown"
            value={maxOctave}
            onChange={(event) =>
              onChange({ minOctave, maxOctave: Number(event.target.value) })
            }
            className={selectClass}
          >
            {OCTAVE_OFFSETS.filter((o) => o >= minOctave).map((option) => (
              <option key={option} value={option}>
                {option > 0 ? `+${option}` : option}
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
          onClick={() => save({ notes: [] })}
          disabled={!clip.notes.length}
          title="Clear all notes"
          className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="size-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>

      <PianoRoll
        notes={clip.notes}
        division={division}
        bars={bars}
        low={low}
        high={high}
        onChange={(notes) => save({ notes })}
        playhead={playhead}
        label={String}
        shade={(pitch) => (isRoot(pitch) ? 'root' : null)}
        noteTitle={(note) => `Degree ${note.pitch}, ${note.length}/${division}`}
      />

      <AccordionControls
        keyScaleOctaveProps={{
          selectedKey: data.selectedKey || DEFAULTS.selectedKey,
          onKeyChange: (key) => onChange({ selectedKey: key }),
          selectedScale: data.selectedScaleType || DEFAULTS.selectedScaleType,
          onScaleChange: (scale) => onChange({ selectedScaleType: scale }),
          octave: data.octave || DEFAULTS.octave,
          onOctaveChange: (octave) => onChange({ octave }),
        }}
      />
    </div>
  );
}

const selectClass =
  'h-7 cursor-pointer rounded-md border border-border bg-background/60 px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';
