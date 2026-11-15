import { useState } from 'react';
import type { NodeDefinition } from '@/components/nodes/define-node';
import { iconMapping } from '@/data/icon-mapping';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { NODE_DRAG_TYPE } from './add-node-context';

export type AddMenuSection = { title?: string; items: NodeDefinition[] };

/**
 * A searchable list of nodes to add, as in Miro: type to narrow it down
 * (by name, or a group's name), Enter picks the first match; drag one onto
 * the canvas, or click it and then click where it goes.
 */
export function AddMenu({
  label,
  sections,
  onDone,
  className,
}: {
  label: string;
  /** Extra classes, e.g. a lower height where it opens further down. */
  className?: string;
  sections: AddMenuSection[];
  /** After a node is picked or dragged out. */
  onDone: () => void;
}) {
  const placing = useAppStore((state) => state.placing);
  const setPlacing = useAppStore((state) => state.setPlacing);
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((node) => {
        const text = `${node.title} ${section.title ?? ''}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((section) => section.items.length);
  const matches = shown.flatMap((section) => section.items);
  const pick = (id: string) => {
    setPlacing(id);
    onDone();
  };

  return (
    <div
      role="menu"
      aria-label={label}
      className={cn(
        'nokey nodrag nopan flex max-h-[calc(100vh-24px)] w-80 flex-col rounded-md border border-border/60 bg-card shadow-md',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <p className="shrink-0 text-[10px] font-semibold tracking-[.16em] text-muted-foreground uppercase">
          {label}
        </p>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches[0]) pick(matches[0].id);
          }}
          placeholder="Search…"
          aria-label={`Search ${label.toLowerCase()}`}
          className="min-w-0 flex-1 rounded border border-border/60 bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
        />
      </div>
      <div className="overflow-y-auto p-1.5">
        {shown.map((section, index) => (
          <div
            key={`${section.title ?? ''}-${index}`}
            role="group"
            aria-label={section.title}
          >
            {section.title && (
              <p className="px-2 pt-2 pb-1 text-[10px] text-muted-foreground/80">
                {section.title}
              </p>
            )}
            <div className="grid grid-cols-2 gap-0.5">
              {section.items.map((node) => {
                const NodeIcon = iconMapping[node.icon];
                return (
                  <button
                    key={node.id}
                    type="button"
                    role="menuitem"
                    draggable
                    title="Drag onto the canvas, or click then click where it goes"
                    aria-label={`Place ${node.title}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={onDone}
                    onClick={() => pick(node.id)}
                    className={cn(
                      'flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing',
                      placing === node.id &&
                        'bg-primary text-primary-foreground',
                    )}
                  >
                    <NodeIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{node.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!matches.length && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nothing called “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
