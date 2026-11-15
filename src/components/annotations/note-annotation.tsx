import { useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { setAnnotationText } from '@/lib/annotations';

type Data = { text: string; index: number };

/** A sticky note: text you type, kept as a `// @note` comment. */
export function NoteAnnotation({ data, selected }: NodeProps) {
  const { text, index } = data as Data;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div
      data-annotation="note"
      className={`w-52 rounded-sm bg-amber-200 p-2 text-amber-950 shadow-md ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <textarea
        aria-label="Note"
        value={draft ?? text}
        placeholder="Note…"
        rows={Math.max(3, (draft ?? text).split('\n').length)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) setAnnotationText(index, draft);
          setDraft(null);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="nodrag nowheel w-full resize-none bg-transparent font-sans text-sm leading-snug outline-none placeholder:text-amber-900/50"
      />
    </div>
  );
}
