import { useEffect, useMemo, useRef } from 'react';
import { Panel } from '@xyflow/react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { addLevel, stripsOf, useMixer, type Strip } from '@/lib/mixer';
import { lineLabelOf } from '@/lib/live';
import { historyOf } from '@/lib/meters';
import { TrackButtons } from '@/components/nodes/shared/track-buttons';

/** A level meter of a line: its loudness now, redrawn each frame. */
function Meter({ nodeId }: { nodeId: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const isPlaying = useAppStore((state) => state.isPlaying);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const key = lineLabelOf(nodeId);
      const level = isPlaying && key ? historyOf(key).at(-1) : undefined;
      // RMS of 0.5 fills the meter.
      const fill = Math.min(1, (level?.rms ?? 0) * 2);
      if (bar.current) bar.current.style.height = `${fill * 100}%`;
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [nodeId, isPlaying]);
  return (
    <div
      aria-hidden="true"
      className="relative h-24 w-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        ref={bar}
        className="absolute bottom-0 w-full rounded-full bg-primary"
      />
    </div>
  );
}

function ChannelStrip({ strip }: { strip: Strip }) {
  const updateNodeData = useAppStore((state) => state.updateNodeData);
  const name = strip.label.startsWith('$') ? 'line' : strip.label;
  const patterned = typeof strip.gain === 'string';
  return (
    <li
      data-strip={strip.label}
      className="flex w-16 shrink-0 flex-col items-center gap-2 rounded-md border border-border/60 bg-background/60 px-1 py-2"
    >
      <span
        className="w-full truncate text-center text-[10px] font-semibold tracking-wider uppercase"
        title={name}
      >
        {name}
      </span>
      <div className="flex h-24 items-end gap-1.5">
        {strip.levelId && !patterned ? (
          <input
            type="range"
            aria-label={`${name} gain`}
            min={0}
            max={2}
            step={0.01}
            value={strip.gain}
            onChange={(event) =>
              updateNodeData(strip.levelId!, {
                gain: event.target.value,
              })
            }
            className="nodrag h-24 w-4 cursor-pointer accent-primary [direction:rtl] [writing-mode:vertical-lr]"
          />
        ) : (
          <div className="flex h-24 w-4 items-center justify-center">
            {patterned ? (
              <span
                className="text-[9px] text-muted-foreground [writing-mode:vertical-lr]"
                title={`Gain is a pattern: ${strip.gain}`}
              >
                pattern
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Add a Level to ${name}`}
                title="Add a Level node to this line"
                onClick={() => addLevel(strip.nodeId)}
                className="nodrag rounded border border-dashed border-border px-0.5 text-[9px] text-muted-foreground hover:bg-accent [writing-mode:vertical-lr]"
              >
                + level
              </button>
            )}
          </div>
        )}
        <Meter nodeId={strip.nodeId} />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {patterned ? '~' : Number(strip.gain).toFixed(2)}
      </span>
      <TrackButtons nodeId={strip.nodeId} name={name} />
    </li>
  );
}

/**
 * Every line side by side, like a DAW mixer: level, meter, mute and solo.
 * Faders move each line's Level node, so the code follows.
 */
export function MixerPanel() {
  const open = useMixer((state) => state.open);
  const toggle = useMixer((state) => state.toggle);
  const song = useAppStore((state) => state.song);
  const strips = useMemo(() => stripsOf(programOf(song).lines), [song]);
  if (!open) return null;
  return (
    <Panel
      position="bottom-center"
      aria-label="Mixer"
      role="region"
      className="m-2! max-w-[calc(100vw-32px)] rounded-md border border-border/60 bg-card p-2 shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-[11px] font-semibold tracking-[.16em] uppercase">
          Mixer
        </h2>
        <button
          type="button"
          aria-label="Close mixer"
          onClick={toggle}
          className="nodrag rounded p-0.5 text-muted-foreground hover:bg-accent"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {strips.length ? (
        <ul className="flex gap-1.5 overflow-x-auto pb-1">
          {strips.map((strip) => (
            <ChannelStrip key={strip.nodeId} strip={strip} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-4 text-xs text-muted-foreground">No lines yet.</p>
      )}
    </Panel>
  );
}
