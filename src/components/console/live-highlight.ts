import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
} from '@codemirror/view';
import { evaluatedCode, mapRanges, useLive, type CodeRange } from '@/lib/live';

/**
 * Outlines what is sounding right now in the code, like strudel.cc: each
 * playing event's step in the mini-notation lights up as it plays.
 */

const setActive = StateEffect.define<CodeRange[]>();
const mark = Decoration.mark({ class: 'cm-live-hap' });

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setActive)) {
        const length = transaction.state.doc.length;
        return Decoration.set(
          effect.value
            .filter((r) => r.start < r.end && r.end <= length)
            .map((r) => mark.range(r.start, r.end)),
          true,
        );
      }
    return transaction.docChanged ? value.map(transaction.changes) : value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const sync = ViewPlugin.define((view) => {
  const show = (ranges: readonly CodeRange[]) =>
    // Dispatching inside an update is not allowed; defer to a microtask.
    queueMicrotask(() =>
      view.dispatch({
        effects: setActive.of(
          mapRanges(evaluatedCode(), view.state.doc.toString(), ranges),
        ),
      }),
    );
  const stop = useLive.subscribe((state, previous) => {
    if (state.ranges !== previous.ranges) show(state.ranges);
  });
  return { destroy: stop };
});

const theme = EditorView.theme({
  '.cm-live-hap': {
    outline: '1.5px solid var(--primary)',
    outlineOffset: '0px',
    borderRadius: '2px',
    background: 'color-mix(in srgb, var(--primary) 18%, transparent)',
  },
});

export const liveHighlight: Extension = [field, sync, theme];
