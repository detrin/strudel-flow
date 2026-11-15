import { useState } from 'react';
import { Folder } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ControlButton } from '@/components/editor/control-button';
import { useLibrary, type LibraryTab } from '@/store/library-store';
import { cn } from '@/lib/utils';
import { stopPreview } from '@/lib/library/preview';
import { SamplesTab } from './samples-tab';
import { PresetsTab } from './presets-tab';

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'samples', label: 'Samples' },
  { id: 'presets', label: 'Presets' },
];

/** The Library: every sound to search and use, and saved presets. */
export function LibraryPopover() {
  const open = useLibrary((state) => state.open);
  const setOpen = useLibrary((state) => state.setOpen);
  const tab = useLibrary((state) => state.tab);
  const setTab = useLibrary((state) => state.setTab);
  const [status, setStatus] = useState('');
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A preset playing on its own ends with the Library.
        if (!next) stopPreview();
        if (next) setStatus('');
      }}
    >
      <PopoverTrigger asChild>
        <ControlButton title="Library: samples and presets">
          <Folder className="size-4" />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        aria-label="Library"
        className="nowheel max-h-[calc(100dvh-100px)] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-lg p-0"
      >
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-popover px-3 pt-3">
          <h3 className="mr-auto pb-2 text-sm font-medium">Library</h3>
          <div role="tablist" aria-label="Library" className="flex">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  '-mb-px border-b-2 px-3 pb-2 text-xs',
                  tab === id
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div
          role="tabpanel"
          aria-label={tab === 'samples' ? 'Samples' : 'Presets'}
          className="p-3"
        >
          {status && (
            <p
              role="status"
              className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs"
            >
              {status}
            </p>
          )}
          {tab === 'samples' ? (
            <SamplesTab onStatus={setStatus} />
          ) : (
            <PresetsTab onStatus={setStatus} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
