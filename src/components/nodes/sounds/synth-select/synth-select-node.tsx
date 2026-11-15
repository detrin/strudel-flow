import { useState, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import type { CustomControlsProps } from '../../define-node';
import type { SoundData } from '../sound';
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
} from '@/components/ui/select';
import { SYNTH_CATEGORIES } from '@/data/sounds';
import { cn } from '@/lib/utils';
import { CategorySelectItems } from '@/components/nodes/shared/category-select-items';

const waveforms = [
  { value: 'sine', label: 'Sine', path: 'M2 16 C8 0 12 0 18 16 S28 32 34 16' },
  { value: 'triangle', label: 'Triangle', path: 'M2 24 L10 8 L26 24 L34 8' },
  { value: 'sawtooth', label: 'Saw', path: 'M2 24 L17 8 L17 24 L32 8 L32 24' },
  {
    value: 'square',
    label: 'Square',
    path: 'M2 24 L2 8 L18 8 L18 24 L34 24 L34 8',
  },
];

const NAME = /^[\w#.:-]+$/;
/**
 * The sounds of a voice: one name (`"sawtooth"`) or several played
 * together (`"[square, supersaw]"`). Null for other patterns
 * (`"<sine square>"`), which are edited as code.
 */
function layersOf(sound: string): string[] | null {
  const text = sound.trim();
  if (NAME.test(text)) return [text];
  const inner = /^\[([^[\]]*)\]$/.exec(text)?.[1];
  if (inner === undefined) return null;
  const names = inner.split(',').map((name) => name.trim());
  return names.length && names.every((name) => NAME.test(name)) ? names : null;
}
const soundOf = (layers: string[]) =>
  layers.length === 1 ? layers[0] : `[${layers.join(', ')}]`;

/**
 * Which instrument plays: a waveform or synth, or several layered (shift+
 * click a waveform, or "Add layer"). The value is shown as code below.
 */
export function SynthSelectNode({
  values: data,
  onChange,
}: CustomControlsProps<SoundData>) {
  const sound = data.sound ?? '';
  const layers = layersOf(sound);
  const set = (value: string) => onChange({ sound: value });

  const pickWave = (value: string, event: MouseEvent) => {
    if (!event.shiftKey || !layers) return set(value);
    const next = layers.includes(value)
      ? layers.filter((layer) => layer !== value)
      : [...layers, value];
    if (next.length) set(soundOf(next));
  };

  return (
    <div className="nodrag flex w-60 flex-col gap-3 p-3">
      <div className="grid grid-cols-4 gap-1.5">
        {waveforms.map((wave) => (
          <button
            key={wave.value}
            aria-label={wave.label}
            title={`${wave.label} (shift+click to layer it)`}
            aria-pressed={layers?.includes(wave.value) ?? false}
            onClick={(event) => pickWave(wave.value, event)}
            className={cn(
              'grid h-12 place-items-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              layers?.includes(wave.value)
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <svg
              viewBox="0 0 36 32"
              className="h-7 w-8 fill-none stroke-current stroke-[1.5]"
              aria-hidden
            >
              <path d={wave.path} />
            </svg>
          </button>
        ))}
      </div>

      {layers && layers.length > 1 && (
        <div role="list" aria-label="Layers" className="flex flex-wrap gap-1">
          {layers.map((layer) => (
            <span
              role="listitem"
              key={layer}
              className="flex items-center gap-1 rounded-md bg-primary/10 py-0.5 pr-0.5 pl-2 font-mono text-[11px] text-foreground"
            >
              {layer}
              <button
                type="button"
                aria-label={`Remove ${layer}`}
                onClick={() => set(soundOf(layers.filter((l) => l !== layer)))}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Select value={layers?.length === 1 ? layers[0] : ''} onValueChange={set}>
        <SelectTrigger
          aria-label="Voice sound"
          className="w-full border-0 bg-muted/50 text-xs"
        >
          <SelectValue
            placeholder={
              layers && layers.length > 1
                ? `${layers.length} sounds layered`
                : 'Choose sound'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {waveforms
            .filter(
              (wave) =>
                !SYNTH_CATEGORIES.some((category) =>
                  category.options.includes(wave.value),
                ),
            )
            .map((wave) => (
              <SelectItem key={wave.value} value={wave.value}>
                {wave.label}
              </SelectItem>
            ))}
          <CategorySelectItems categories={SYNTH_CATEGORIES} />
        </SelectContent>
      </Select>

      {layers && (
        <Select
          value=""
          onValueChange={(value) =>
            !layers.includes(value) && set(soundOf([...layers, value]))
          }
        >
          <SelectTrigger
            aria-label="Add a layer"
            className="w-full border-0 bg-muted/30 text-xs text-muted-foreground"
          >
            <SelectValue placeholder="+ Add layer…" />
          </SelectTrigger>
          <SelectContent>
            {waveforms.map((wave) => (
              <SelectItem key={wave.value} value={wave.value}>
                {wave.label}
              </SelectItem>
            ))}
            <CategorySelectItems categories={SYNTH_CATEGORIES} />
          </SelectContent>
        </Select>
      )}

      <CodeValue sound={sound} onChange={set} />
    </div>
  );
}

/** The voice as code: `sound("…")`, editable for any pattern. */
function CodeValue({
  sound,
  onChange,
}: {
  sound: string;
  onChange: (sound: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() && draft !== sound) onChange(draft);
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
      sound(
      <input
        aria-label="Voice as code"
        value={draft ?? sound}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        className="nodrag nopan nowheel min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-foreground outline-none focus:border-primary/60"
      />
      )
    </label>
  );
}
