import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

export type NodeMenuItem = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * A node's "…" menu, drawn inside the node so it zooms with the canvas
 * (a portalled menu would keep screen size whatever the zoom).
 */
export function NodeMenu({ id, items }: { id: string; items: NodeMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Selected nodes are drawn above the others, so the menu is not hidden.
    useAppStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.selected === (node.id === id)
          ? node
          : { ...node, selected: node.id === id },
      ),
    }));
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open, id]);

  const menuItems = () =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
        []),
    ] as HTMLElement[];

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector<HTMLElement>('button')?.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const all = menuItems();
          const at = all.indexOf(document.activeElement as HTMLElement);
          const step = event.key === 'ArrowDown' ? 1 : -1;
          all[(at + step + all.length) % all.length]?.focus();
        }
      }}
    >
      <Button
        variant="ghost"
        aria-label="Module options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="nodrag size-7 rounded-md p-1 text-muted-foreground"
      >
        <Ellipsis />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Module options"
          className="nodrag nopan nowheel absolute top-full right-0 z-50 mt-1 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
                item.destructive &&
                  'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 [&_svg]:text-destructive',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
