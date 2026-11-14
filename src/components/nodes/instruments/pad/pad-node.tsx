import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Eraser } from 'lucide-react';
import type { CustomControlsProps } from '../../define-node';
import {
  BAR_OPTIONS,
  DEFAULTS,
  DIVISIONS,
  LEGACY_CLEARED,
  OCTAVE_OFFSETS,
  padClip,
  pitchRange,
  placeNote,
  rescaleNotes,
  type PadData,
  type PadNote,
} from './pad';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { AccordionControls } from '@/components/nodes/shared/accordion-controls';
import { cn } from '@/lib/utils';

const ROW_HEIGHT = 16;
/** Width of one cycle on screen; cells divide it. */
const BAR_WIDTH = 320;
/** At most this many cycles are visible; longer clips scroll. */
const VISIBLE_BARS = 2;
/** Grab zone at a note's right edge for resizing, in screen pixels. */
const EDGE = 6;

type Drag =
  | { kind: 'draw'; index: number }
  | { kind: 'resize'; index: number }
  | { kind: 'move'; index: number; grab: number; moved: boolean };

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
  const total = division * bars;
  const cellWidth = BAR_WIDTH / division;
  const width = total * cellWidth;
  const { low, high, size } = pitchRange(data);
  const rows = high - low + 1;
  const minOctave = data.minOctave ?? 0;
  const maxOctave = Math.max(minOctave, data.maxOctave ?? 0);
  const isRoot = (pitch: number) => ((pitch % size) + size) % size === 0;
  /** Row from the top for a degree. */
  const rowOf = (pitch: number) => high - pitch;
  const hidden = clip.notes.filter(
    (note) => note.pitch < low || note.pitch > high,
  ).length;

  const [draft, setDraft] = useState<PadNote[] | null>(null);
  const notes = draft ?? clip.notes;
  const drag = useRef<Drag | null>(null);
  const lastLength = useRef(1);
  const grid = useRef<HTMLDivElement>(null);

  const playhead = usePlayhead(bars, isPlaying && !isMuted);

  const save = (updates: Partial<PadData>) =>
    onChange({
      notes: clip.notes,
      division,
      bars,
      ...LEGACY_CLEARED,
      ...updates,
    });

  /** The cell under the pointer, in clip coordinates (zoom-independent). */
  const cellAt = (event: PointerEvent) => {
    const bounds = grid.current!.getBoundingClientRect();
    const scale = bounds.width / width;
    const x = (event.clientX - bounds.left) / scale;
    const y = (event.clientY - bounds.top) / scale;
    return {
      x,
      col: Math.max(0, Math.min(total - 1, Math.floor(x / cellWidth))),
      pitch: Math.max(low, Math.min(high, high - Math.floor(y / ROW_HEIGHT))),
      scale,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, col, pitch, scale } = cellAt(event);
    const element = (event.target as Element).closest('[data-note]');
    if (element) {
      const index = Number(element.getAttribute('data-note'));
      const note = notes[index];
      const end = (note.start + note.length) * cellWidth;
      drag.current =
        end - x <= EDGE / scale
          ? { kind: 'resize', index }
          : { kind: 'move', index, grab: col - note.start, moved: false };
      setDraft(notes);
      return;
    }
    const length = Math.min(lastLength.current, total - col);
    drag.current = { kind: 'draw', index: notes.length };
    setDraft([...notes, { pitch, start: col, length }]);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || !draft) return;
    const { col, pitch } = cellAt(event);
    const note = draft[current.index];
    let next: PadNote;
    if (current.kind === 'move') {
      const start = Math.max(
        0,
        Math.min(total - note.length, col - current.grab),
      );
      next = { ...note, start, pitch };
      if (start !== note.start || pitch !== note.pitch) current.moved = true;
    } else {
      next = { ...note, length: Math.max(1, col - note.start + 1) };
    }
    if (
      next.start === note.start &&
      next.pitch === note.pitch &&
      next.length === note.length
    )
      return;
    setDraft(draft.map((n, index) => (index === current.index ? next : n)));
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (!current || !draft) return;
    setDraft(null);
    if (current.kind === 'move' && !current.moved) {
      save({ notes: draft.filter((_, index) => index !== current.index) });
      return;
    }
    const note = draft[current.index];
    if (current.kind !== 'move') lastLength.current = note.length;
    save({ notes: placeNote(draft, note, current.index) });
  };

  const divisions = DIVISIONS.includes(division as (typeof DIVISIONS)[number])
    ? DIVISIONS
    : [...DIVISIONS, division].sort((a, b) => a - b);
  const beat = division % 4 === 0 ? division / 4 : division;

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
              lastLength.current = 1;
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

      <div className="flex">
        {/* Scale degrees, high to low; the tonic rows are marked. */}
        <div className="w-6 shrink-0 pr-1 text-right font-mono text-[9px] leading-4 text-muted-foreground">
          {Array.from({ length: rows }, (_, row) => {
            const pitch = high - row;
            return (
              <div
                key={pitch}
                className={cn(isRoot(pitch) && 'font-bold text-foreground')}
              >
                {pitch}
              </div>
            );
          })}
        </div>
        <div
          className="nodrag nowheel overflow-x-auto overflow-y-hidden rounded-sm"
          style={{ maxWidth: VISIBLE_BARS * BAR_WIDTH }}
        >
          <div
            ref={grid}
            role="grid"
            aria-label="Piano roll: click or drag to draw notes, drag a note to move it, drag its right edge to resize, click it to delete"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="nodrag nopan relative cursor-crosshair touch-none bg-muted/40 select-none"
            data-low={low}
            data-high={high}
            style={{ width, height: rows * ROW_HEIGHT }}
          >
            {Array.from({ length: rows }, (_, row) => {
              const pitch = high - row;
              return (
                <div
                  key={pitch}
                  className={cn(
                    'absolute inset-x-0 border-b border-border/30',
                    isRoot(pitch) && 'bg-foreground/[0.06]',
                  )}
                  style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              );
            })}
            {Array.from({ length: total }, (_, col) => (
              <div
                key={col}
                className={cn(
                  'absolute inset-y-0 w-px',
                  col % division === 0
                    ? 'bg-foreground/40'
                    : col % beat === 0
                      ? 'bg-foreground/20'
                      : 'bg-foreground/[0.07]',
                )}
                style={{ left: col * cellWidth }}
              />
            ))}
            {notes.map((note, index) =>
              note.start >= total ||
              note.pitch < low ||
              note.pitch > high ? null : (
                <div
                  key={index}
                  data-note={index}
                  title={`Degree ${note.pitch}, ${note.length}/${division}`}
                  data-sounding={
                    playhead >= 0 &&
                    note.start <= playhead * total &&
                    playhead * total < note.start + note.length
                      ? ''
                      : undefined
                  }
                  className="absolute cursor-grab rounded-[3px] border border-black/30 bg-primary shadow-sm transition-[filter,box-shadow] duration-75 after:absolute after:inset-y-0 after:right-0 after:w-1.5 after:cursor-ew-resize data-sounding:brightness-125 data-sounding:shadow-[0_0_0_2px_var(--foreground)]"
                  style={{
                    left: note.start * cellWidth + 1,
                    width:
                      Math.min(note.length, total - note.start) * cellWidth - 1,
                    top: rowOf(note.pitch) * ROW_HEIGHT + 1,
                    height: ROW_HEIGHT - 2,
                  }}
                />
              ),
            )}
            {playhead >= 0 && (
              <div
                aria-hidden="true"
                data-playhead=""
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground/80"
                style={{ left: playhead * width }}
              />
            )}
          </div>
        </div>
      </div>

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

/** Where the clip is playing, 0..1, or -1 when it is not. */
function usePlayhead(bars: number, active: boolean) {
  const [position, setPosition] = useState(-1);
  useEffect(() => {
    if (!active) {
      setPosition(-1);
      return;
    }
    let frame: number;
    const tick = () => {
      const now = getSchedulerNow();
      setPosition(now > 0 ? (now % bars) / bars : -1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bars, active]);
  return position;
}
