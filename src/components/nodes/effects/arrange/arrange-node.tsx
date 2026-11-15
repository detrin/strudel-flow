import { useEffect, useState } from 'react';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { LayoutList, Minus, Plus } from 'lucide-react';
import { typedValue } from '@/lib/typed-value';
import type { CustomControlsProps } from '../../define-node';
import { DEFAULT_BARS, MAX_BARS, type ArrangeData } from './arrange';
import { cn } from '@/lib/utils';

/** A row of bars to switch on and off: the song's structure for one line. */
/** The bar the song is in (counting from 0), while playing. */
function useCurrentBar(isPlaying: boolean) {
  const [bar, setBar] = useState<number>();
  useEffect(() => {
    if (!isPlaying) {
      setBar(undefined);
      return;
    }
    const tick = () => setBar(Math.max(0, Math.floor(getSchedulerNow())));
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [isPlaying]);
  return bar;
}

/** What the line does now: plays, or is silent until its next bar on. */
function nowText(bars: string, at: number) {
  if (bars[at] === '1') return `Bar ${at + 1} · plays`;
  for (let step = 1; step < bars.length; step++) {
    const next = (at + step) % bars.length;
    if (bars[next] === '1')
      return `Bar ${at + 1} · silent here, plays from bar ${next + 1}`;
  }
  return `Bar ${at + 1} · silent in every bar`;
}

export function ArrangeNode({
  values,
  onChange,
  isPlaying,
}: CustomControlsProps<ArrangeData>) {
  const bars = values.bars || DEFAULT_BARS;
  const song = useCurrentBar(isPlaying);
  // The mask repeats every bars.length bars.
  const current = song === undefined ? undefined : song % bars.length;
  if (values.pattern)
    return (
      <PatternMask
        pattern={values.pattern}
        onChange={(pattern) => onChange({ pattern })}
        onBars={() => onChange({ pattern: undefined, bars: DEFAULT_BARS })}
      />
    );
  const resize = (count: number) =>
    onChange({
      bars:
        count > bars.length
          ? bars + bars.at(-1)!.repeat(count - bars.length)
          : bars.slice(0, count),
    });
  const toggle = (index: number) =>
    onChange({
      bars:
        bars.slice(0, index) +
        (bars[index] === '1' ? '0' : '1') +
        bars.slice(index + 1),
    });

  return (
    <div className="w-80 max-w-[calc(100vw-32px)] space-y-3 px-3 pb-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{bars.length} bars</span>
        <span className="flex gap-1">
          <button
            type="button"
            aria-label="Fewer bars"
            disabled={bars.length <= 1}
            onClick={() => resize(bars.length - 1)}
            className="nodrag rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
          >
            <Minus className="size-3" />
          </button>
          <button
            type="button"
            aria-label="More bars"
            disabled={bars.length >= MAX_BARS}
            onClick={() => resize(bars.length + 1)}
            className="nodrag rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
          >
            <Plus className="size-3" />
          </button>
        </span>
      </div>
      <div
        role="group"
        aria-label="Bars"
        // Same size at any length; long songs scroll (12 rows show).
        className="nodrag nowheel grid max-h-[22rem] grid-cols-8 gap-1 overflow-y-auto"
      >
        {[...bars].map((bit, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Bar ${index + 1}`}
            aria-pressed={bit === '1'}
            aria-current={index === current ? 'step' : undefined}
            onClick={() => toggle(index)}
            className={cn(
              'nodrag rounded-sm border border-border text-[9px] transition-colors',
              'h-7 shrink-0',
              bit === '1'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
              index % 4 === 0 && 'border-l-foreground/60',
              index === current &&
                'ring-2 ring-foreground ring-offset-1 ring-offset-card',
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>
      {current !== undefined && (
        <p
          role="status"
          className={cn(
            'text-[11px]',
            bars[current] === '1' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {nowText(bars, current)}
        </p>
      )}
    </div>
  );
}

/** A mask that is not one value per bar, edited as code. */
function PatternMask({
  pattern,
  onChange,
  onBars,
}: {
  pattern: string;
  onChange: (pattern: string) => void;
  onBars: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const value = typedValue(draft);
    if (value === null || typeof value === 'number') {
      setInvalid(true);
      return;
    }
    setDraft(null);
    setInvalid(false);
    if (value !== pattern) onChange(value);
  };
  return (
    <div className="w-80 max-w-[calc(100vw-32px)] space-y-2 px-3 pb-3">
      <label className="block text-xs text-muted-foreground">
        Plays when this pattern is 1 (or true)
        <input
          aria-label="Mask pattern"
          value={draft ?? pattern}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(null);
          }}
          className={cn(
            'nodrag nopan nowheel mt-1 w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none',
            invalid
              ? 'border-destructive'
              : 'border-border focus:border-primary/60',
          )}
        />
      </label>
      <button
        type="button"
        onClick={onBars}
        className="nodrag flex items-center gap-1.5 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LayoutList className="size-3.5" aria-hidden="true" />
        Use bars instead
      </button>
    </div>
  );
}
