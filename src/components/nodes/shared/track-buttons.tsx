import { useAppStore } from '@/store/app-store';
import { setSoloed } from '@/lib/mixer';
import { cn } from '@/lib/utils';

const button =
  'nodrag flex size-6 cursor-pointer items-center justify-center rounded border text-[10px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-ring';

/**
 * A line's Mute and Solo, as on a DAW track. Solo replaces other solos;
 * Cmd/Ctrl-click adds to them.
 */
export function TrackButtons({
  nodeId,
  name,
  className,
}: {
  /** Any node of the line. */
  nodeId: string;
  /** The line's name, for screen readers. */
  name: string;
  className?: string;
}) {
  const data = useAppStore(
    (state) => state.nodes.find((node) => node.id === nodeId)?.data,
  );
  const setMuted = useAppStore((state) => state.setMuted);
  const muted = data?.state === 'paused';
  const soloed = data?.solo === true;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label={`Mute ${name}`}
        aria-pressed={muted}
        title="Mute (writes _ before the label)"
        onClick={() => setMuted(nodeId, !muted)}
        className={cn(
          button,
          muted
            ? 'border-amber-500 bg-amber-500 text-black'
            : 'border-border text-muted-foreground hover:bg-accent',
        )}
      >
        M
      </button>
      <button
        type="button"
        aria-label={`Solo ${name}`}
        aria-pressed={soloed}
        title="Solo (writes S before the label; Cmd/Ctrl-click to solo several)"
        onClick={(event) =>
          setSoloed(nodeId, !soloed, event.metaKey || event.ctrlKey)
        }
        className={cn(
          button,
          soloed
            ? 'border-sky-500 bg-sky-500 text-black'
            : 'border-border text-muted-foreground hover:bg-accent',
        )}
      >
        S
      </button>
    </div>
  );
}
