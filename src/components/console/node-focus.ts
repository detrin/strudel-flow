import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
} from '@codemirror/view';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { locateNode } from '@/lib/node-location';

/**
 * Clicking a node on the canvas shows its code: the console scrolls to it
 * and highlights it while the node stays selected.
 */

const setFocus = StateEffect.define<{ from: number; to: number } | null>();
const mark = Decoration.mark({ class: 'cm-node-focus' });

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setFocus))
        return effect.value &&
          effect.value.to <= transaction.state.doc.length &&
          effect.value.from < effect.value.to
          ? Decoration.set([mark.range(effect.value.from, effect.value.to)])
          : Decoration.none;
    return transaction.docChanged ? value.map(transaction.changes) : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const selectedId = () => {
  const selected = useAppStore.getState().nodes.filter((node) => node.selected);
  return selected.length === 1 ? selected[0].id : null;
};

const follow = ViewPlugin.define((view) => {
  let current: string | null = null;
  const stop = useAppStore.subscribe((state, previous) => {
    if (state.nodes === previous.nodes) return;
    const id = selectedId();
    if (id === current) return;
    current = id;
    // Dispatching from inside another update is not allowed.
    queueMicrotask(() => {
      const at = id
        ? locateNode(view.state.doc.toString(), programOf(state), id)
        : null;
      view.dispatch({
        effects: [
          setFocus.of(at),
          ...(at ? [EditorView.scrollIntoView(at.from, { y: 'center' })] : []),
        ],
      });
    });
  });
  return { destroy: stop };
});

const theme = EditorView.theme({
  '.cm-node-focus': {
    background: 'color-mix(in srgb, var(--primary) 22%, transparent)',
    borderRadius: '2px',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--primary) 60%, transparent)',
  },
});

export const nodeFocus: Extension = [field, follow, theme];
