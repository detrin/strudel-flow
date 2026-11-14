import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CircleAlert, PanelLeftClose } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { setCode } from '@/store/code-sync';
import { themeByName } from '@/themes';
import { CodeEditor } from './code-editor';

const SYNC_DELAY = 250;

/** The code console: the patch as Strudel code, editable. */
export function CodeConsole({ onClose }: { onClose: () => void }) {
  const code = useAppStore((state) => state.code);
  const error = useAppStore((state) => state.codeError);
  const theme = useAppStore((state) => state.theme);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) setCode(pending.current);
    pending.current = null;
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const keys = useMemo(
    () => [
      {
        // strudel.cc: Ctrl+Enter evaluates, Ctrl+. stops.
        key: 'Mod-Enter',
        run: () => {
          flush();
          useAppStore.setState({ isPlaying: true, error: null });
          return true;
        },
      },
      {
        key: 'Mod-.',
        run: () => {
          useAppStore.setState({ isPlaying: false });
          return true;
        },
      },
    ],
    [flush],
  );

  return (
    <section
      aria-label="Code console"
      className="flex h-full min-h-0 flex-col bg-background text-foreground"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="flex-1 text-[11px] font-semibold tracking-[.16em] uppercase">
          Code
        </h2>
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          Ctrl+Enter play · Ctrl+. stop
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide code console"
          title="Hide code console (Ctrl+B)"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <CodeEditor
          label="Strudel code"
          value={code}
          theme={themeByName(theme).editor}
          keys={keys}
          onChange={(value) => {
            pending.current = value;
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(flush, SYNC_DELAY);
          }}
        />
      </div>
      {error && (
        <p
          role="status"
          className="flex shrink-0 items-start gap-2 border-t border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <span>
            {error}
            <span className="block text-muted-foreground">
              The canvas keeps the last valid version.
            </span>
          </span>
        </p>
      )}
    </section>
  );
}
