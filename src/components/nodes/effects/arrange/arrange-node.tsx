import { Minus, Plus } from 'lucide-react';
import type { CustomControlsProps } from '../../define-node';
import { DEFAULT_BARS, MAX_BARS, type ArrangeData } from './arrange';
import { cn } from '@/lib/utils';

/** A row of bars to switch on and off: the song's structure for one line. */
export function ArrangeNode({
  values,
  onChange,
}: CustomControlsProps<ArrangeData>) {
  const bars = values.bars || DEFAULT_BARS;
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
      <div role="group" aria-label="Bars" className="grid grid-cols-8 gap-1">
        {[...bars].map((bit, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Bar ${index + 1}`}
            aria-pressed={bit === '1'}
            onClick={() => toggle(index)}
            className={cn(
              'nodrag h-7 rounded-sm border border-border text-[9px] transition-colors',
              bit === '1'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
              index % 4 === 0 && 'border-l-foreground/60',
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
