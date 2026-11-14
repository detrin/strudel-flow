import { Panel } from '@xyflow/react';
import { PanelLeftOpen, Plus, X } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { ControlButton } from './control-button';
import { AppearancePopover } from './appearance-popover';
import { AppInfoPopover } from './app-info-popover';
import { useAppStore } from '@/store/app-store';
import { PlayPauseButton } from './play-pause-button';
import { ZoomSlider } from './zoom-slider';
import { PresetPopover } from './preset-popover';

export function EditorToolbar({
  onAddNode,
}: {
  onAddNode: MouseEventHandler<HTMLButtonElement>;
}) {
  const cpm = useAppStore((state) => state.cpm);
  const setCpm = useAppStore((state) => state.setCpm);
  const bpc = useAppStore((state) => state.bpc);
  const setBpc = useAppStore((state) => state.setBpc);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const consoleOpen = useAppStore((state) => state.console.open);
  const bridge = useAppStore((state) => state.bridge);
  const setConsole = useAppStore((state) => state.setConsole);

  return (
    <>
      <Panel position="top-left" className="m-2! flex items-center gap-2">
        {!consoleOpen && (
          <ControlButton
            title="Show code console (Ctrl+B)"
            onClick={() => setConsole({ open: true })}
            className="nokey nodrag nopan"
          >
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          </ControlButton>
        )}
      </Panel>

      <Panel
        position="top-center"
        style={{ transform: 'translateX(-50%)' }}
        className="m-0! mt-14! flex items-center gap-1.5 rounded-md border border-border/60 bg-card p-1 pr-2 sm:mt-2!"
      >
        <PlayPauseButton />
        <div className="flex items-baseline gap-1.5">
          <input
            type="number"
            aria-label="Tempo in beats per minute"
            title="Tempo"
            min={1}
            max={200}
            value={cpm}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value))
                setCpm(String(Math.min(200, Math.max(1, value))));
            }}
            className="nodrag w-10 bg-transparent text-right font-mono text-base tabular-nums outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-[9px] font-medium tracking-widest text-muted-foreground">
            BPM
          </span>
        </div>
        <div className="flex items-baseline gap-1 border-l border-border pl-2">
          <select
            id="beats-per-cycle"
            aria-label="Beats per cycle"
            title="Beats per cycle"
            value={bpc}
            onChange={(event) => setBpc(event.target.value)}
            className="nodrag h-7 w-10 cursor-pointer rounded-md bg-card text-center font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Array.from({ length: 16 }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
          <label
            htmlFor="beats-per-cycle"
            className="cursor-pointer text-[9px] leading-tight text-muted-foreground"
            title="Beats per cycle"
          >
            B/C
          </label>
        </div>
      </Panel>

      {error && (
        <Panel
          position="top-center"
          style={{ transform: 'translateX(-50%)' }}
          className="m-0! mt-24! flex max-w-[min(420px,90vw)] sm:mt-12! items-start gap-3 rounded-md border border-destructive/40 bg-card p-3 text-xs"
          role="alert"
        >
          <span>Couldn’t play this patch. {error}</span>
          <button
            aria-label="Dismiss playback error"
            onClick={() => setError(null)}
          >
            <X className="size-4" />
          </button>
        </Panel>
      )}
      <ZoomSlider position="bottom-left" />
      <Panel
        position="top-right"
        className="m-2! flex gap-1 rounded-md border border-border/60 bg-card p-1"
      >
        <ControlButton
          title="Add node"
          onClick={onAddNode}
          className="nokey nodrag nopan rounded-full"
        >
          <Plus className="size-4" aria-hidden="true" />
        </ControlButton>
        <PresetPopover />
        <AppearancePopover />
        <AppInfoPopover />
      </Panel>
      {bridge === 'connected' && (
        <Panel
          position="bottom-right"
          className="m-2! flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
          <span role="status">Agent connected</span>
        </Panel>
      )}
    </>
  );
}
