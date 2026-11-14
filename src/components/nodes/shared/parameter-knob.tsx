import { useRef, useState } from 'react';
import { Hash } from 'lucide-react';
import { typedValue } from '@/lib/typed-value';

type ParameterKnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  /** The pattern the knob holds instead of a number (its code). */
  pattern?: string;
  /** Sets a pattern, or null to go back to a number. */
  onPattern?: (code: string | null) => void;
};

export function ParameterKnob({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = String,
  pattern,
  onPattern,
}: ParameterKnobProps) {
  const drag = useRef<{ x: number; y: number; value: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (editing === null) return;
    const value = typedValue(editing);
    if (value === null) {
      setInvalid(true);
      return;
    }
    setEditing(null);
    setInvalid(false);
    if (typeof value === 'number') {
      if (pattern !== undefined) onPattern?.(null);
      onChange(value);
    } else onPattern?.(value);
  };
  const field = (initial: string) => (
    <input
      aria-label={`${label} value or pattern`}
      autoFocus
      value={editing ?? initial}
      spellCheck={false}
      onChange={(event) => {
        setEditing(event.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') {
          setEditing(null);
          setInvalid(false);
        }
      }}
      title="A number, or a pattern: <400 800>, sine.range(200, 2000), …"
      className={`nodrag nopan nowheel w-full min-w-0 rounded border bg-background px-1 py-0.5 text-center font-mono text-[10px] outline-none ${invalid ? 'border-destructive' : 'border-primary/60'}`}
    />
  );

  if (pattern !== undefined)
    return (
      <div className="flex w-20 flex-col items-center gap-1.5">
        <div className="relative grid min-h-20 w-full place-items-center rounded-lg border border-dashed border-primary/50 bg-primary/5 p-1.5">
          {editing !== null ? (
            field(pattern)
          ) : (
            <button
              type="button"
              onClick={() => onPattern && setEditing(pattern)}
              title="A pattern: click to edit"
              aria-label={`${label}: pattern ${pattern}`}
              className="nodrag max-h-16 w-full overflow-hidden font-mono text-[10px] leading-tight break-all text-foreground"
            >
              {pattern}
            </button>
          )}
          {onPattern && (
            <button
              type="button"
              onClick={() => onPattern(null)}
              title="Back to a number"
              aria-label={`${label}: back to a number`}
              className="nodrag absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            >
              <Hash className="size-3" />
            </button>
          )}
        </div>
        <span className="text-[9px] font-medium tracking-widest text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    );
  const clamped = Math.min(
    max,
    Math.max(min, Number.isFinite(value) ? value : min),
  );
  const proportion = (clamped - min) / (max - min);
  const update = (next: number) =>
    onChange(
      Number(
        Math.min(
          max,
          Math.max(min, min + Math.round((next - min) / step) * step),
        ).toFixed(5),
      ),
    );

  return (
    <div className="flex min-w-20 flex-col items-center gap-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={format(clamped)}
        className="nokey nodrag nopan relative grid size-20 touch-none cursor-ns-resize place-items-center rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, value: clamped };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const distance =
            drag.current.y - event.clientY + event.clientX - drag.current.x;
          const next = Math.min(
            max,
            Math.max(
              min,
              drag.current.value +
                (distance * (max - min)) / (event.shiftKey ? 1200 : 180),
            ),
          );
          drag.current = { x: event.clientX, y: event.clientY, value: next };
          update(next);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const increments: Record<string, number> = {
            ArrowUp: step,
            ArrowRight: step,
            ArrowDown: -step,
            ArrowLeft: -step,
            PageUp: step * 10,
            PageDown: -step * 10,
          };
          if (
            event.key === 'Home' ||
            event.key === 'End' ||
            event.key in increments
          ) {
            event.preventDefault();
            event.stopPropagation();
            update(
              event.key === 'Home'
                ? min
                : event.key === 'End'
                  ? max
                  : clamped + increments[event.key],
            );
          }
        }}
      >
        <svg
          viewBox="0 0 80 80"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full -rotate-225 fill-none stroke-[3]"
        >
          <circle
            cx="40"
            cy="40"
            r="35"
            pathLength="100"
            strokeDasharray="75 100"
            className="stroke-muted-foreground/20"
          />
          <circle
            cx="40"
            cy="40"
            r="35"
            pathLength="100"
            strokeDasharray={`${proportion * 75} 100`}
            className="stroke-primary"
            strokeLinecap="round"
          />
        </svg>
        <div
          aria-hidden
          className="grid size-14 place-items-center rounded-full border border-muted-foreground/20 bg-secondary "
          style={{ transform: `rotate(${-135 + proportion * 270}deg)` }}
        >
          <span className="absolute top-1.5 h-3 w-0.5 rounded-full bg-primary" />
        </div>
      </div>
      {editing !== null ? (
        field(String(clamped))
      ) : (
        <button
          type="button"
          onClick={() => setEditing(String(clamped))}
          title={
            onPattern
              ? 'Click to type a value or a pattern'
              : 'Click to type a value'
          }
          className="nodrag font-mono text-xs tabular-nums text-foreground hover:underline"
        >
          {format(clamped)}
        </button>
      )}
      <span className="text-[9px] font-medium tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}
