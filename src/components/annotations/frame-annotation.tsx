import { useState } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { setAnnotationText } from '@/lib/annotations';

type Data = { text: string; index: number };

/** A frame around an area of the canvas, named like Miro's frames. */
export function FrameAnnotation({ data, selected }: NodeProps) {
  const { text, index } = data as Data;
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div
      data-annotation="frame"
      className="size-full rounded-lg border-2 border-dashed border-primary/40 bg-primary/[0.03]"
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="border-primary!"
        handleClassName="bg-primary! border-primary!"
      />
      <input
        aria-label="Frame name"
        value={draft ?? text}
        placeholder="Frame"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== null) setAnnotationText(index, draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="nodrag absolute -top-9 left-0 w-80 bg-transparent text-2xl font-semibold tracking-wide text-primary/80 outline-none"
      />
    </div>
  );
}
