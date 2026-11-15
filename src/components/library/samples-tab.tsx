import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Loader2, Play, Plus, Tag } from 'lucide-react';
import {
  lineFor,
  previewSound,
  useSounds,
  type Sound,
} from '@/lib/library/sounds';
import { KINDS, type SoundKind } from '@/lib/library/sound-tags';
import { hasTags, matches, tagCounts } from '@/lib/library/filter';
import { addLine } from '@/lib/library/insert';
import { useLibrary } from '@/store/library-store';
import { cn } from '@/lib/utils';
import { TagFilter, TagInput, chip } from './tag-input';

const PAGE = 120;
const iconButton =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Every sound: search by name or tag, filter by kind and tags, listen, use. */
export function SamplesTab({ onStatus }: { onStatus: (text: string) => void }) {
  const sounds = useSounds();
  const userTags = useLibrary((state) => state.soundTags);
  const setSoundTags = useLibrary((state) => state.setSoundTags);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SoundKind | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [tagging, setTagging] = useState<string>();
  // The sound being previewed: loading, then playing for its length.
  const [preview, setPreview] = useState<{
    name: string;
    phase: 'loading' | 'playing';
  }>();
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(previewTimer.current), []);
  const listen = async (sound: Sound) => {
    clearTimeout(previewTimer.current);
    setPreview({ name: sound.name, phase: 'loading' });
    try {
      const seconds = await previewSound(sound);
      setPreview((now) =>
        now?.name === sound.name ? { name: sound.name, phase: 'playing' } : now,
      );
      previewTimer.current = setTimeout(
        () => setPreview((now) => (now?.name === sound.name ? undefined : now)),
        seconds * 1000 + 50,
      );
    } catch {
      setPreview(undefined);
      onStatus(`Couldn't play ${sound.name}`);
    }
  };

  const withTags = useMemo(
    () =>
      sounds.map((sound) => ({
        ...sound,
        mine: userTags[sound.name] ?? [],
        all: [...new Set([...sound.tags, ...(userTags[sound.name] ?? [])])],
      })),
    [sounds, userTags],
  );
  const ofKind = withTags.filter((s) => kind === 'all' || s.kind === kind);
  const found = ofKind.filter(
    (s) => matches(query, s.name, s.all) && hasTags(s.all, selected),
  );
  // Tags combine: only those the current results have, counted in them.
  const counts = tagCounts(found.map((s) => ({ tags: s.all })));

  const use = (sound: Sound) => {
    const label = addLine({ body: lineFor(sound), label: sound.name });
    onStatus(`Added line ${label}`);
  };

  return (
    <div className="space-y-2">
      <input
        type="search"
        aria-label="Search sounds"
        placeholder="Search sounds: 808 kick, piano, vocals…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setShown(PAGE);
        }}
        className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div
        role="group"
        aria-label="Kind of sound"
        className="flex flex-wrap gap-1"
      >
        {(['all', ...KINDS] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setShown(PAGE);
            }}
            className={cn(
              chip,
              'capitalize',
              kind === value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {value === 'all' ? 'All' : `${value}s`}
          </button>
        ))}
      </div>
      <TagFilter
        tags={counts}
        selected={selected}
        onChange={setSelected}
        pinned={[...new Set(Object.values(userTags).flat())]}
      />
      <p className="text-[11px] text-muted-foreground" role="status">
        {sounds.length === 0
          ? 'Loading sounds…'
          : `${found.length} of ${sounds.length} sounds`}
      </p>
      <ul className="divide-y divide-border/60" aria-label="Sounds">
        {found.slice(0, shown).map((sound) => (
          <li key={sound.name} className="py-1.5" data-sound={sound.name}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={
                  preview?.name === sound.name
                    ? `${sound.name} ${preview.phase === 'loading' ? 'loading' : 'playing'}`
                    : `Play ${sound.name}`
                }
                title={
                  preview?.name === sound.name
                    ? preview.phase === 'loading'
                      ? 'Loading…'
                      : 'Playing'
                    : 'Listen'
                }
                data-preview={
                  preview?.name === sound.name ? preview.phase : undefined
                }
                onClick={() => void listen(sound)}
                className={cn(
                  iconButton,
                  preview?.name === sound.name && 'text-primary',
                )}
              >
                {preview?.name !== sound.name ? (
                  <Play className="size-3.5" />
                ) : preview.phase === 'loading' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <AudioLines className="size-4 animate-pulse" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate font-mono text-xs">
                    {sound.name}
                  </span>
                  {sound.variants > 1 && (
                    <span
                      className="text-[10px] text-muted-foreground"
                      title={`${sound.variants} variants: choose with n`}
                    >
                      ×{sound.variants}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                  <span>{sound.kind}</span>
                  {sound.all.map((tag) => (
                    <span
                      key={tag}
                      className={sound.mine.includes(tag) ? 'text-primary' : ''}
                    >
                      · {tag}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Tag ${sound.name}`}
                aria-expanded={tagging === sound.name}
                title="Your tags"
                onClick={() =>
                  setTagging(tagging === sound.name ? undefined : sound.name)
                }
                className={iconButton}
              >
                <Tag className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Add ${sound.name} as a new line`}
                title="Add as a new line"
                onClick={() => use(sound)}
                className={iconButton}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {tagging === sound.name && (
              <div className="mt-1.5 rounded-md border bg-muted/30 p-2">
                <TagInput
                  label={`Your tags for ${sound.name}`}
                  tags={sound.mine}
                  onChange={(tags) => setSoundTags(sound.name, tags)}
                  suggestions={[
                    'techno',
                    'house',
                    'dnb',
                    'ambient',
                    'lofi',
                    'favourite',
                  ].filter((tag) => !sound.tags.includes(tag))}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {found.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE)}
          className="w-full rounded-md border py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Show {Math.min(PAGE, found.length - shown)} more
        </button>
      )}
    </div>
  );
}
