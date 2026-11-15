import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { arm, mappingOf, unmap, useMidi, type Target } from '@/lib/midi';
import { cn } from '@/lib/utils';

/**
 * A knob as MIDI learn sees it: in learn mode a click arms it (the next
 * control moved is linked to it); a linked knob shows its CC.
 */
export function MidiLearn({
  target,
  label,
  children,
}: {
  target: Target;
  label: string;
  children: ReactNode;
}) {
  const learning = useMidi((state) => state.learning);
  const armed = useMidi(
    (state) =>
      state.armed?.nodeId === target.nodeId &&
      state.armed.param === target.param,
  );
  const mapping = useMidi((state) => mappingOf(state.mappings, target));
  return (
    <div
      data-midi={mapping ? `cc${mapping.cc}` : undefined}
      className={cn(
        'relative rounded-lg',
        learning &&
          'outline-1 outline-offset-2 outline-primary/40 outline-dashed',
        armed && 'animate-pulse outline-2 outline-primary outline-solid',
      )}
      // In learn mode the knob doesn't turn: a click arms it instead.
      onPointerDownCapture={(event) => {
        if (learning) event.stopPropagation();
      }}
    >
      {learning && (
        <button
          type="button"
          aria-label={`MIDI learn ${label}`}
          aria-pressed={armed}
          className="nodrag absolute inset-0 z-10 cursor-pointer rounded-lg"
          onClick={() => arm(armed ? null : target)}
        />
      )}
      {children}
      {mapping && (
        <span className="absolute -top-2 -left-2 z-20 flex items-center gap-0.5 rounded bg-primary px-1 font-mono text-[9px] text-primary-foreground">
          CC{mapping.cc}
          {learning && (
            <button
              type="button"
              aria-label={`Unlink ${label} from MIDI`}
              onPointerDownCapture={(event) => event.stopPropagation()}
              onClick={() => unmap(target)}
              className="nodrag cursor-pointer"
            >
              <X className="size-2.5" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
