import { useEffect, useRef, useState } from 'react';
import { Panel } from '@xyflow/react';
import { MousePointer2 } from 'lucide-react';
import { radialMenuItems } from '@/data/radial-menu';
import { iconMapping } from '@/data/icon-mapping';
import { nodeDefinitions } from '@/components/nodes/registry';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { ControlButton } from './control-button';
import { NODE_DRAG_TYPE } from './add-node-context';

/**
 * Miro-style creation toolbar on the left: pick a category, then drag a
 * node onto the canvas or click it and click where it should go.
 */
export function NodePalette() {
  const [category, setCategory] = useState<string | null>(null);
  const placing = useAppStore((state) => state.placing);
  const setPlacing = useAppStore((state) => state.setPlacing);
  const panel = useRef<HTMLDivElement>(null);
  const open = radialMenuItems.find((item) => item.category === category);

  useEffect(() => {
    if (!category) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setCategory(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCategory(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [category]);

  return (
    <>
      <Panel
        position="center-left"
        className="m-2!"
        ref={panel}
        aria-label="Add nodes"
      >
        <div className="relative flex flex-col gap-1 rounded-md border border-border/60 bg-card p-1 shadow-sm">
          <ControlButton
            title="Select (Esc)"
            active={!placing && !category}
            onClick={() => {
              setPlacing(null);
              setCategory(null);
            }}
            className="nokey nodrag nopan"
          >
            <MousePointer2 className="size-4" aria-hidden="true" />
          </ControlButton>
          <div className="mx-1.5 h-px bg-border" />
          {radialMenuItems.map(({ label, category: id, icon: Icon }) => (
            <ControlButton
              key={id}
              title={label}
              aria-expanded={category === id}
              active={
                category === id ||
                (!!placing && nodeDefinitions[placing]?.category === id)
              }
              onClick={() => setCategory(category === id ? null : id)}
              className="nokey nodrag nopan"
            >
              <Icon className="size-4" aria-hidden="true" />
            </ControlButton>
          ))}

          {open && (
            <div
              role="menu"
              aria-label={open.label}
              className="nokey nodrag nopan absolute top-0 left-full ml-2 w-52 rounded-md border border-border/60 bg-card p-1.5 shadow-md"
            >
              <p className="px-2 pt-1 pb-2 text-[10px] font-semibold tracking-[.16em] text-muted-foreground uppercase">
                {open.label}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {open.items.map((node) => {
                  const NodeIcon = iconMapping[node.icon];
                  return (
                    <button
                      key={node.id}
                      type="button"
                      role="menuitem"
                      draggable
                      title={`Drag onto the canvas, or click then click where it goes`}
                      aria-label={`Place ${node.title}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(NODE_DRAG_TYPE, node.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDragEnd={() => setCategory(null)}
                      onClick={() => {
                        setPlacing(node.id);
                        setCategory(null);
                      }}
                      className={cn(
                        'flex cursor-grab flex-col items-center gap-1.5 rounded-md px-2 py-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing',
                        placing === node.id &&
                          'bg-primary text-primary-foreground',
                      )}
                    >
                      <NodeIcon className="size-4" aria-hidden="true" />
                      {node.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {placing && (
        <Panel
          position="bottom-center"
          className="m-2! rounded-md border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground"
        >
          <span role="status">
            Click the canvas to place{' '}
            <strong className="text-foreground">
              {nodeDefinitions[placing]?.title}
            </strong>{' '}
            · Esc to cancel
          </span>
        </Panel>
      )}
    </>
  );
}
