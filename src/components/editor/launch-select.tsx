import { QUANTIZE_OPTIONS, useLaunch, type Quantize } from '@/lib/launch';
import { cn } from '@/lib/utils';

const LABELS: Record<Quantize, string> = {
  0: 'now',
  1: '1 bar',
  4: '4 bars',
};

/**
 * When edits start playing: at once, or on the next bar / 4 bars, like
 * Ableton's launch quantization. A light blinks while an edit waits.
 */
export function LaunchSelect() {
  const quantize = useLaunch((state) => state.quantize);
  const pending = useLaunch((state) => state.pending);
  const setQuantize = useLaunch((state) => state.setQuantize);
  return (
    <div className="flex items-center gap-1 border-l border-border pl-2">
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          pending === null ? 'bg-border' : 'animate-pulse bg-primary',
        )}
      />
      <select
        aria-label="When edits play"
        title="When edits play while the song runs: at once, or from the next bar (or 4 bars), so changes land on the beat"
        value={quantize}
        data-pending={pending ?? undefined}
        onChange={(event) =>
          setQuantize(Number(event.target.value) as Quantize)
        }
        className="nodrag h-7 w-16 cursor-pointer rounded-md bg-card px-1 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {QUANTIZE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {LABELS[value]}
          </option>
        ))}
      </select>
      <span className="text-[9px] font-medium tracking-widest text-muted-foreground">
        LAUNCH
      </span>
    </div>
  );
}
