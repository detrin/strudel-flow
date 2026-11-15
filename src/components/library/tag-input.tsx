import { useState } from 'react';
import { X } from 'lucide-react';
import { normalizeTag } from '@/store/library-store';
import { cn } from '@/lib/utils';

export const chip =
  'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] leading-none';

/** Tags as removable chips, an input to add more, and suggestions. */
export function TagInput({
  tags,
  onChange,
  suggestions = [],
  label = 'Tags',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  label?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (text: string) => {
    const fresh = text.split(',').map(normalizeTag).filter(Boolean);
    if (fresh.length) onChange([...new Set([...tags, ...fresh])]);
    setDraft('');
  };
  const offered = suggestions.filter((tag) => !tags.includes(tag));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(chip, 'border-primary/50 bg-primary/10')}
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="rounded-full opacity-70 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          placeholder={tags.length ? 'Add tag…' : 'Add tags: bass, vocals…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add(draft);
            } else if (event.key === 'Backspace' && !draft && tags.length)
              onChange(tags.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          className="h-6 min-w-24 flex-1 bg-transparent text-xs outline-none"
        />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Suggested:</span>
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange([...tags, tag])}
              className={cn(
                chip,
                'border-dashed text-muted-foreground hover:text-foreground',
              )}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tags to filter by, with counts; selected ones are highlighted. */
export function TagFilter({
  tags,
  selected,
  onChange,
  limit = 14,
  pinned = [],
}: {
  tags: { tag: string; count: number }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  limit?: number;
  /** Always shown first (the person's own tags). */
  pinned?: string[];
}) {
  const [all, setAll] = useState(false);
  const first = (t: { tag: string }) =>
    selected.includes(t.tag) || pinned.includes(t.tag);
  const shown = all
    ? [...tags.filter(first), ...tags.filter((t) => !first(t))]
    : [...tags.filter(first), ...tags.filter((t) => !first(t)).slice(0, limit)];
  if (!tags.length) return null;
  return (
    <div
      role="group"
      aria-label="Filter by tag"
      className="flex flex-wrap gap-1"
    >
      {shown.map(({ tag, count }) => {
        const on = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? selected.filter((t) => t !== tag) : [...selected, tag],
              )
            }
            className={cn(
              chip,
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {tag}
            <span className="opacity-60">{count}</span>
          </button>
        );
      })}
      {tags.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={cn(
            chip,
            'border-transparent text-muted-foreground underline',
          )}
        >
          {tags.length - shown.length} more
        </button>
      )}
    </div>
  );
}
