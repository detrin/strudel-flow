import { Panel } from '@xyflow/react';
import { AlignStartVertical, PanelLeftOpen, Plus } from 'lucide-react';
import { tidyLines } from '@/lib/tidy';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ControlButton } from './control-button';
import { AppearancePopover } from './appearance-popover';
import { AppInfoPopover } from './app-info-popover';
import { useAppStore } from '@/store/app-store';
import { PlayPauseButton } from './play-pause-button';
import { ErrorPanel } from './error-panel';
import { LaunchSelect } from './launch-select';
import { RecordButton } from './record-button';
import { MixerButton } from '@/components/mixer/mixer-button';
import { MidiButton } from './midi-button';
import { ZoomSlider } from './zoom-slider';
import { PresetPopover } from './preset-popover';
import { LibraryPopover } from '@/components/library/library-popover';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { radialMenuItems } from '@/data/radial-menu';
import { AddMenu } from './add-menu';

export function EditorToolbar() {
  const cpm = useAppStore((state) => state.cpm);
  const setCpm = useAppStore((state) => state.setCpm);
  const bpc = useAppStore((state) => state.bpc);
  const setBpc = useAppStore((state) => state.setBpc);
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
        <RecordButton />
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
        <LaunchSelect />
      </Panel>

      <ErrorPanel />
      <ZoomSlider position="bottom-left" />
      <Panel
        position="top-right"
        className="m-2! flex gap-1 rounded-md border border-border/60 bg-card p-1"
      >
        <AddAnythingButton />
        <AutoArrangeButton />
        <MixerButton />
        <MidiButton />
        <LibraryPopover />
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

/**
 * Auto-arrange: every track, lined up flush left (the default), or, while
 * nodes are selected, just the tracks holding them, where they are.
 */
function AutoArrangeButton() {
  const selected = useAppStore(
    useShallow((state) =>
      state.nodes.filter((node) => node.selected).map((node) => node.id),
    ),
  );
  const title = selected.length
    ? `Auto-arrange the selected tracks (${selected.length} node${selected.length === 1 ? '' : 's'} selected)`
    : 'Auto-arrange all tracks, aligned left (select nodes to arrange just their tracks)';
  return (
    <ControlButton
      title={title}
      onClick={() => tidyLines(selected.length ? selected : undefined)}
      className="nokey nodrag nopan"
    >
      <AlignStartVertical className="size-4" aria-hidden="true" />
    </ControlButton>
  );
}

/** Every node, by category and group, for the + button's menu. */
const EVERYTHING = radialMenuItems.flatMap((category) =>
  category.sections.map((section) => ({
    title: section.title
      ? `${category.label} · ${section.title}`
      : category.label,
    items: section.items,
  })),
);

/** +: any node, searchable; pick one, then click where it goes. */
function AddAnythingButton() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ControlButton
          title="Add node (search every node)"
          aria-label="Add node"
          className="nokey nodrag nopan rounded-full"
        >
          <Plus className="size-4" aria-hidden="true" />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        <AddMenu
          label="Add"
          sections={EVERYTHING}
          className="max-h-[calc(100vh-72px)]"
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
