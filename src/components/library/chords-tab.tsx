import { useState } from 'react';
import { Play, Plus, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KEY_OPTIONS } from '@/data/sounds';
import {
  FEELINGS,
  PROGRESSIONS,
  STYLES,
  TECHNIQUES,
  type Progression,
} from '@/data/progressions';
import { useAppStore } from '@/store/app-store';
import { realize, type Technique } from '@/lib/chords/theory';
import {
  insertProgression,
  previewId,
  togglePreviewProgression,
} from '@/lib/chords/use';
import { cn } from '@/lib/utils';
import { chip } from './tag-input';

const KEY = 'strudelton:chords-key';

function ProgressionCard({
  progression,
  musicalKey,
  techniques,
  onStatus,
}: {
  progression: Progression;
  musicalKey: string;
  techniques: Technique[];
  onStatus: (text: string) => void;
}) {
  const realized = realize(progression.bars, musicalKey, techniques);
  const id = previewId(musicalKey, progression.bars, techniques);
  const playing = useAppStore((state) => state.preview?.id === id);
  return (
    <li
      data-progression={progression.id}
      className="space-y-1 rounded-md border px-3 py-2"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{progression.name}</div>
          <div className="text-xs text-muted-foreground">
            {progression.feeling}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${playing ? 'Stop' : 'Preview'} ${progression.name}`}
          title={playing ? 'Stop' : 'Listen on its own'}
          onClick={() =>
            togglePreviewProgression(musicalKey, progression.bars, techniques)
          }
        >
          {playing ? <Square /> : <Play />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Use ${progression.name}`}
          title="Add its chords and roots to the song"
          onClick={() => {
            const labels = insertProgression(
              musicalKey,
              progression.bars,
              techniques,
            );
            onStatus(
              `Added lines ${labels.map((l) => `“${l}”`).join(' and ')}`,
            );
          }}
        >
          <Plus />
        </Button>
      </div>
      <div className="font-mono text-sm" data-chords>
        {realized.names}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {realized.bars
          .map((bar) => bar.map((chord) => chord.numeral).join(' '))
          .join(' – ')}
        {realized.key !== musicalKey && ` · in ${realized.key}`}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {progression.why}{' '}
        <a
          href={progression.source.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {progression.source.label}
        </a>
      </p>
    </li>
  );
}

/** Chord progressions by feeling: change them, hear them, use them. */
export function ChordsTab({ onStatus }: { onStatus: (text: string) => void }) {
  const [musicalKey, setKey] = useState(() => localStorage.getItem(KEY) ?? 'D');
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = PROGRESSIONS.filter((p) => {
    if (feeling && !p.tags.includes(feeling)) return false;
    if (style && !p.style.includes(style)) return false;
    const text = [p.name, p.feeling, p.why, ...p.tags, ...p.style]
      .join(' ')
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const filter = (
    label: string,
    tags: readonly string[],
    value: string | null,
    set: (tag: string | null) => void,
  ) => (
    <div>
      <div className="mb-1 text-xs font-medium">{label}</div>
      <div className="flex flex-wrap gap-1" aria-label={`${label}s`}>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={value === tag}
            onClick={() => set(value === tag ? null : tag)}
            className={cn(
              chip,
              value === tag
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          Key
          <select
            aria-label="Key"
            value={musicalKey}
            onChange={(event) => {
              setKey(event.target.value);
              localStorage.setItem(KEY, event.target.value);
            }}
            className="h-8 rounded-md border bg-muted/30 px-2"
          >
            {KEY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">
          (numerals: upper case major, lower case minor)
        </span>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium">Change it</div>
        <div className="flex flex-wrap gap-1" aria-label="Techniques">
          {TECHNIQUES.map((technique) => {
            const on = techniques.includes(technique.id);
            return (
              <button
                key={technique.id}
                type="button"
                aria-pressed={on}
                title={technique.feeling}
                onClick={() =>
                  setTechniques(
                    on
                      ? techniques.filter((t) => t !== technique.id)
                      : [...techniques, technique.id],
                  )
                }
                className={cn(
                  chip,
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {technique.label}
              </button>
            );
          })}
        </div>
      </div>
      <input
        type="search"
        aria-label="Search progressions"
        placeholder="Search: name, feeling, style…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-md border bg-muted/30 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      {filter('Feeling', FEELINGS, feeling, setFeeling)}
      {filter('Style', STYLES, style, setStyle)}
      <p className="text-[11px] text-muted-foreground" role="note">
        {shown.length} of {PROGRESSIONS.length} progressions
      </p>
      <ul aria-label="Progressions" className="space-y-2">
        {shown.map((progression) => (
          <ProgressionCard
            key={progression.id}
            progression={progression}
            musicalKey={musicalKey}
            techniques={techniques}
            onStatus={onStatus}
          />
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        These feelings are conventions Western listeners learned, not laws; what
        moves most is expectation: a chord that comes, is delayed, or swerves.
      </p>
    </div>
  );
}
