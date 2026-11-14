import { useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { placeNote, type RollNote } from './roll';

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

export type RowShade = 'root' | 'dark' | null;

/**
 * A piano roll (as in Ableton's MIDI clips): click or drag on the grid to
 * draw a note, drag a note to move it, drag its right edge to change its
 * length, click it to delete it.
 */
export function PianoRoll({
  notes: saved,
  division,
  bars,
  low,
  high,
  onChange,
  playhead,
  label,
  shade,
  noteTitle,
  rowHeight = 16,
  gutter = 'w-6',
}: {
  notes: RollNote[];
  division: number;
  bars: number;
  /** Lowest and highest pitch rows shown. */
  low: number;
  high: number;
  onChange: (notes: RollNote[]) => void;
  /** Where the clip plays, 0..1, or -1. */
  playhead: number;
  label: (pitch: number) => string;
  shade: (pitch: number) => RowShade;
  noteTitle: (note: RollNote) => string;
  rowHeight?: number;
  gutter?: string;
}) {
  const total = division * bars;
  const cellWidth = BAR_WIDTH / division;
  const width = total * cellWidth;
  const rows = high - low + 1;
  const rowOf = (pitch: number) => high - pitch;

  const [draft, setDraft] = useState<RollNote[] | null>(null);
  const notes = draft ?? saved;
  const drag = useRef<Drag | null>(null);
  const lastLength = useRef(1);
  const grid = useRef<HTMLDivElement>(null);

  /** The cell under the pointer, in clip coordinates (zoom-independent). */
  const cellAt = (event: PointerEvent) => {
    const bounds = grid.current!.getBoundingClientRect();
    const scale = bounds.width / width;
    const x = (event.clientX - bounds.left) / scale;
    const y = (event.clientY - bounds.top) / scale;
    return {
      x,
      col: Math.max(0, Math.min(total - 1, Math.floor(x / cellWidth))),
      pitch: Math.max(low, Math.min(high, high - Math.floor(y / rowHeight))),
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
    let next: RollNote;
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
      onChange(draft.filter((_, index) => index !== current.index));
      return;
    }
    const note = draft[current.index];
    if (current.kind !== 'move') lastLength.current = note.length;
    onChange(placeNote(draft, note, current.index));
  };

  const beat = division % 4 === 0 ? division / 4 : division;

  return (
    <div className="flex">
      <div
        className={cn(
          'shrink-0 pr-1 text-right font-mono text-[9px] text-muted-foreground',
          gutter,
        )}
      >
        {Array.from({ length: rows }, (_, row) => {
          const pitch = high - row;
          return (
            <div
              key={pitch}
              className={cn(
                'truncate',
                shade(pitch) === 'root' && 'font-bold text-foreground',
              )}
              style={{ height: rowHeight, lineHeight: `${rowHeight}px` }}
            >
              {label(pitch)}
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
          style={{ width, height: rows * rowHeight }}
        >
          {Array.from({ length: rows }, (_, row) => {
            const pitch = high - row;
            const kind = shade(pitch);
            return (
              <div
                key={pitch}
                className={cn(
                  'absolute inset-x-0 border-b border-border/30',
                  kind === 'root' && 'bg-foreground/[0.06]',
                  kind === 'dark' && 'bg-black/25',
                )}
                style={{ top: row * rowHeight, height: rowHeight }}
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
                title={noteTitle(note)}
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
                  top: rowOf(note.pitch) * rowHeight + 1,
                  height: rowHeight - 2,
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
  );
}
