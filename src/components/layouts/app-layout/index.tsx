import { useEffect, type PointerEvent, type ReactNode } from 'react';
import { CodeConsole } from '@/components/console/code-console';
import { useAppStore } from '@/store/app-store';

const MIN_WIDTH = 280;

/** Code console on the left (optional), canvas on the right. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { open, width } = useAppStore((state) => state.console);
  const setConsole = useAppStore((state) => state.setConsole);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setConsole({ open: !useAppStore.getState().console.open });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setConsole]);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (move: globalThis.PointerEvent) =>
      setConsole({
        width: Math.round(
          Math.min(window.innerWidth * 0.7, Math.max(MIN_WIDTH, move.clientX)),
        ),
      });
    const target = event.currentTarget;
    target.addEventListener('pointermove', onMove);
    target.addEventListener(
      'pointerup',
      () => target.removeEventListener('pointermove', onMove),
      { once: true },
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {open && (
        <>
          <aside
            className="relative h-full max-w-full shrink-0 max-md:absolute max-md:inset-0 max-md:z-50 max-md:w-full!"
            style={{ width }}
          >
            <CodeConsole onClose={() => setConsole({ open: false })} />
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize code console"
            onPointerDown={startResize}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary max-md:hidden"
          />
        </>
      )}
      <main className="relative h-full min-w-0 flex-1">{children}</main>
    </div>
  );
}
