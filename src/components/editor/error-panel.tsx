import { useEffect, useState, useSyncExternalStore } from 'react';
import { Panel } from '@xyflow/react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  currentProblems,
  diagnosticsText,
  onDiagnostics,
  record,
} from '@/lib/diagnostics';

const useProblems = () =>
  useSyncExternalStore(
    (listener) => {
      const stop = onDiagnostics(listener);
      return () => void stop();
    },
    () => currentProblems().join('\n'),
  );

/**
 * What went wrong, at the top of the canvas: a playback error (dismissable)
 * and ongoing problems such as the code no longer following the canvas,
 * with the recent log to read or copy.
 */
export function ErrorPanel() {
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const problems = useProblems();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Playback errors go in the log too.
  useEffect(() => {
    if (error) record({ where: 'playback', message: error });
  }, [error]);

  if (!error && !problems) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setOpen(true);
    }
  };
  return (
    <Panel
      position="top-center"
      style={{ transform: 'translateX(-50%)' }}
      className="m-0! mt-24! flex max-w-[min(520px,92vw)] flex-col gap-2 rounded-md border border-destructive/40 bg-card p-3 text-xs sm:mt-12!"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-1">
          {error && <p>Couldn’t play this patch. {error}</p>}
          {problems
            .split('\n')
            .filter(Boolean)
            .map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
        </div>
        {error && (
          <button
            aria-label="Dismiss playback error"
            onClick={() => setError(null)}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="flex gap-3 text-muted-foreground">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {open ? 'Hide details' : 'Details'}
        </button>
        <button
          type="button"
          onClick={copy}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {copied ? 'Copied' : 'Copy details'}
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Reload
        </button>
      </div>
      {open && (
        <pre
          aria-label="Recent errors"
          className="nowheel max-h-60 overflow-auto rounded bg-muted/40 p-2 text-[10px] whitespace-pre-wrap"
        >
          {diagnosticsText() || 'Nothing logged.'}
        </pre>
      )}
    </Panel>
  );
}
