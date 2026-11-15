/**
 * Notes and frames on the canvas, like Miro's sticky notes and frames:
 * labels for areas ("drums", "drop") and reminders. They are comments in
 * the code, so they travel with the song and strudel.cc ignores them:
 *
 *   // @note 120,-200 "bring the bass in at bar 17"
 *   // @frame -40,-80,1400,900 "drums"
 *
 * They live in the patch's prelude (comments outside lines); the canvas
 * shows them as nodes, and moving, resizing or typing rewrites them.
 */
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react';
import { create } from 'zustand';
import { useAppStore } from '@/store/app-store';

export type Annotation = {
  kind: 'note' | 'frame';
  x: number;
  y: number;
  /** Frames only: their size. */
  width?: number;
  height?: number;
  text: string;
};

const PATTERN =
  /^\/\/ @(note|frame) (-?\d+),(-?\d+)(?:,(\d+),(\d+))? ("(?:[^"\\]|\\.)*")\s*$/;
export const FRAME_SIZE = { width: 1200, height: 700 };

/** The annotation a comment line holds, or null. */
export function parseAnnotation(line: string): Annotation | null {
  const match = PATTERN.exec(line.trim());
  if (!match) return null;
  const [, kind, x, y, width, height, text] = match;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'string') return null;
  return {
    kind: kind as Annotation['kind'],
    x: Number(x),
    y: Number(y),
    ...(kind === 'frame'
      ? {
          width: Number(width ?? FRAME_SIZE.width),
          height: Number(height ?? FRAME_SIZE.height),
        }
      : {}),
    text: value,
  };
}

export function formatAnnotation(annotation: Annotation) {
  const round = (n: number) => Math.round(n);
  const place =
    annotation.kind === 'frame'
      ? [annotation.x, annotation.y, annotation.width, annotation.height]
      : [annotation.x, annotation.y];
  return `// @${annotation.kind} ${place
    .map((n) => round(n ?? 0))
    .join(',')} ${JSON.stringify(annotation.text)}`;
}

/** The annotations in a prelude, in order. */
export const annotationsOf = (prelude: string) =>
  prelude.split('\n').flatMap((line) => {
    const annotation = parseAnnotation(line);
    return annotation ? [annotation] : [];
  });

/**
 * The prelude with its annotations replaced by `next`: each stays on its
 * own line, removed ones go, new ones are added at the end.
 */
export function withAnnotations(prelude: string, next: Annotation[]) {
  let index = 0;
  const lines = prelude
    .split('\n')
    .flatMap((line) => {
      if (!parseAnnotation(line)) return [line];
      const annotation = next[index++];
      return annotation ? [formatAnnotation(annotation)] : [];
    })
    .filter((line, i, all) => line !== '' || i < all.length - 1);
  const added = next.slice(index).map(formatAnnotation);
  return [...lines, ...added].join('\n').replace(/^\n+/, '');
}

const ID = 'annotation-';
export const isAnnotationId = (id: string) => id.startsWith(ID);

/** The canvas nodes of the annotations, frames behind everything. */
function nodesOf(prelude: string, previous: Node[]): Node[] {
  return annotationsOf(prelude).map((annotation, index) => {
    const id = `${ID}${index}`;
    const frame = annotation.kind === 'frame';
    const type = frame ? 'frame-annotation' : 'note-annotation';
    // Keep what the canvas knows (selection, size) only for the same kind.
    const old = previous.find((node) => node.id === id && node.type === type);
    return {
      ...old,
      id,
      type,
      position: { x: annotation.x, y: annotation.y },
      data: { text: annotation.text, index },
      ...(frame
        ? {
            width: annotation.width,
            height: annotation.height,
            zIndex: -1,
          }
        : { zIndex: 1 }),
    };
  });
}

export const useAnnotations = create<{ nodes: Node[] }>()(() => ({
  nodes: nodesOf(useAppStore.getState().prelude, []),
}));
useAppStore.subscribe((state, previous) => {
  if (state.prelude !== previous.prelude)
    useAnnotations.setState({
      nodes: nodesOf(state.prelude, useAnnotations.getState().nodes),
    });
});

const write = (next: Annotation[]) => {
  const { prelude } = useAppStore.getState();
  const updated = withAnnotations(prelude, next);
  if (updated !== prelude) useAppStore.setState({ prelude: updated });
};

/** Applies canvas changes (move, resize, select, delete) to annotations. */
export function onAnnotationChanges(changes: NodeChange[]) {
  const nodes = applyNodeChanges(changes, useAnnotations.getState().nodes);
  useAnnotations.setState({ nodes });
  const current = annotationsOf(useAppStore.getState().prelude);
  const next = nodes.flatMap((node) => {
    const old = current[(node.data as { index: number }).index];
    if (!old) return [];
    return [
      {
        ...old,
        x: node.position.x,
        y: node.position.y,
        ...(old.kind === 'frame'
          ? {
              width: node.width ?? old.width,
              height: node.height ?? old.height,
            }
          : {}),
      },
    ];
  });
  write(next);
}

export function setAnnotationText(index: number, text: string) {
  const current = annotationsOf(useAppStore.getState().prelude);
  if (!current[index]) return;
  current[index] = { ...current[index], text };
  write(current);
}

export function addAnnotation(annotation: Annotation) {
  write([...annotationsOf(useAppStore.getState().prelude), annotation]);
}
