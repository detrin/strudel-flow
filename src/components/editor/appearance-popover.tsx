import { Check, Palette } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { themes, type Theme } from '@/themes';
import { useAppStore } from '@/store/app-store';
import { ControlButton } from './control-button';

/** A tiny code sample in the theme's own colours. */
function Swatch({ settings }: Pick<Theme, 'settings'>) {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-11 shrink-0 items-center justify-center gap-0.5 rounded border border-border font-mono text-[10px]"
      style={{ background: settings.background, color: settings.foreground }}
    >
      s<span style={{ color: settings.caret ?? settings.selection }}>(</span>)
    </span>
  );
}

export function AppearancePopover() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ControlButton title="Theme">
          <Palette className="size-4" />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        aria-label="Theme"
        className="nowheel max-h-[calc(100dvh-100px)] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-lg p-4"
      >
        <h3 className="mb-1 text-sm font-medium">Theme</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          The themes of strudel.cc, for the code and the whole app.
        </p>
        <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-2">
          {themes.map((option) => (
            <button
              key={option.name}
              type="button"
              aria-pressed={theme === option.name}
              onClick={() => setTheme(option.name)}
              className="flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/10"
            >
              <Swatch settings={option.settings} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {theme === option.name && (
                <Check
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-primary"
                />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
