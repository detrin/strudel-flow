import { useEffect, useRef, useState } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { Frame, MousePointer2, StickyNote } from 'lucide-react';
import { addAnnotation, FRAME_SIZE } from '@/lib/annotations';
import { radialMenuItems } from '@/data/radial-menu';
import { nodeDefinitions } from '@/components/nodes/registry';
import { useAppStore } from '@/store/app-store';
import { ControlButton } from './control-button';
import { AddMenu } from './add-menu';

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
  const { screenToFlowPosition } = useReactFlow();
  /** A note or frame in the middle of the view. */
  const addAt = (kind: 'note' | 'frame') => {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addAnnotation(
      kind === 'note'
        ? { kind, x: center.x - 100, y: center.y - 50, text: '' }
        : {
            kind,
            x: center.x - FRAME_SIZE.width / 2,
            y: center.y - FRAME_SIZE.height / 2,
            ...FRAME_SIZE,
            text: 'Frame',
          },
    );
  };

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
          <div className="mx-1.5 h-px bg-border" />
          <ControlButton
            title="Add a note"
            onClick={() => addAt('note')}
            className="nokey nodrag nopan"
          >
            <StickyNote className="size-4" aria-hidden="true" />
          </ControlButton>
          <ControlButton
            title="Add a frame"
            onClick={() => addAt('frame')}
            className="nokey nodrag nopan"
          >
            <Frame className="size-4" aria-hidden="true" />
          </ControlButton>

          {open && (
            <div className="absolute top-1/2 left-full ml-2 -translate-y-1/2">
              <AddMenu
                key={open.category}
                label={open.label}
                sections={open.sections}
                onDone={() => setCategory(null)}
              />
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
