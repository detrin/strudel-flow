import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useCopyText } from '@/hooks/use-copy-text';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/app-store';
import { nodeDefinitions } from '../registry';
import { applyNodeCode } from '@/lib/node-code';

export default function PatternPopup({
  className = '',
  id,
}: {
  className?: string;
  id: string;
}) {
  const node = useAppStore((state) =>
    state.nodes.find((node) => node.id === id),
  );
  const code = node
    ? (nodeDefinitions[node.type]?.generate(node.data, { id }) ?? '')
    : '';
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = draft ?? code;
  const { copy: copyCode, status: copyStatus } = useCopyText(text);

  const apply = () => {
    if (draft === null || draft === code) {
      setDraft(null);
      return;
    }
    const problem = applyNodeCode(id, draft);
    setError(problem);
    if (!problem) setDraft(null);
  };

  return (
    <div
      className={`w-0 min-w-full border-t border-border bg-card px-3 py-2 text-card-foreground ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`code-${id}`} className="font-mono text-xs">
          Strudel code
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="nodrag nopan h-6 px-2 text-xs"
          aria-label="Copy code"
          disabled={!text}
          onClick={copyCode}
        >
          {copyStatus === 'copied' ? (
            <Check className="size-3" />
          ) : (
            <Copy className="size-3" />
          )}
          <span aria-live="polite">
            {copyStatus === 'copied' ? 'Copied!' : 'Copy'}
          </span>
        </Button>
      </div>
      <textarea
        id={`code-${id}`}
        value={text}
        spellCheck={false}
        rows={Math.min(8, Math.max(2, Math.ceil(text.length / 34)))}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={apply}
        onKeyDown={(event) => {
          // Enter applies (Shift+Enter for a new line); Escape reverts.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            apply();
          } else if (event.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        className="nodrag nopan nowheel mt-1 w-full resize-none rounded border border-border bg-background p-2 font-mono text-xs break-all text-foreground outline-none focus-visible:border-primary/60"
      />
      <p className="mt-1 text-[10px] text-muted-foreground">
        Enter applies · Shift+Enter new line · Esc reverts
      </p>
      {(error || copyStatus === 'error') && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error ?? 'Could not copy. Select the code and copy it manually.'}
        </p>
      )}
    </div>
  );
}
