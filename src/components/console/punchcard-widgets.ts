import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { onPunchcards, punchcards } from '@/lib/punchcards';
import { isVisible } from '@/lib/visible';
import { drawPunchcard } from '@/lib/punchcard-draw';
import { useAppStore } from '@/store/app-store';

const HEIGHT = 64;

const refresh = StateEffect.define<null>();

class PunchcardWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  override eq(other: PunchcardWidget) {
    return other.label === this.label;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-punchcard';
    const canvas = document.createElement('canvas');
    canvas.dataset.punchcard = this.label;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Punchcard of ${this.label}`);
    canvas.style.cssText = `display:block;width:100%;height:${HEIGHT}px`;
    wrap.append(canvas);
    return wrap;
  }
  override get estimatedHeight() {
    return HEIGHT + 8;
  }
}

/** The line a label's punchcard goes under: its `._punchcard(` line. */
function cardLines(doc: EditorView['state']['doc'], labels: string[]) {
  const lines: { label: string; at: number }[] = [];
  for (const label of labels) {
    // `$2` is the third anonymous `$:` line.
    const anonymous = /^\$(\d+)$/.exec(label);
    const start = anonymous
      ? /^\$\s*:/
      : new RegExp(`^_?${label.replace(/\$/g, '\\$')}\\s*:`);
    let skip = anonymous ? Number(anonymous[1]) : 0;
    for (let n = 1; n <= doc.lines; n++) {
      if (!start.test(doc.line(n).text)) continue;
      if (skip-- > 0) continue;
      let at = doc.line(n).to;
      for (let m = n; m <= doc.lines; m++) {
        const text = doc.line(m).text;
        if (m > n && /^[^\s.)/]/.test(text)) break;
        if (/\._(punchcard|pianoroll)\(/.test(text)) {
          at = doc.line(m).to;
          break;
        }
      }
      lines.push({ label, at });
      break;
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}

function decorations(state: EditorView['state']): DecorationSet {
  const lines = cardLines(state.doc, [...punchcards().keys()]);
  return Decoration.set(
    lines.map(({ label, at }) =>
      Decoration.widget({
        widget: new PunchcardWidget(label),
        block: true,
        side: 1,
      }).range(at),
    ),
  );
}

const field = StateField.define<DecorationSet>({
  create: decorations,
  update: (value, transaction) =>
    transaction.docChanged ||
    transaction.effects.some((effect) => effect.is(refresh))
      ? decorations(transaction.state)
      : value,
  provide: (f) => EditorView.decorations.from(f),
});

const animation = ViewPlugin.define((view) => {
  let frame = 0;
  let last = 0;
  let force = true;
  const paint = (time: number) => {
    const playing = useAppStore.getState().isPlaying;
    frame = playing ? requestAnimationFrame(paint) : 0;
    // About 30 frames a second is plenty for a punchcard.
    if (!force && time - last < 33) return;
    last = time;
    const cards = punchcards();
    view.dom
      .querySelectorAll<HTMLCanvasElement>('canvas[data-punchcard]')
      .forEach((canvas) => {
        if (!force && !isVisible(canvas)) return;
        const pattern = cards.get(canvas.dataset.punchcard!);
        if (pattern) drawPunchcard(canvas, pattern, playing, HEIGHT);
      });
    force = false;
  };
  const restart = () => {
    cancelAnimationFrame(frame);
    force = true;
    frame = requestAnimationFrame(paint);
  };
  const stopCards = onPunchcards(() => {
    view.dispatch({ effects: refresh.of(null) });
    restart();
  });
  const stopPlaying = useAppStore.subscribe(
    (state) => state.isPlaying,
    restart,
  );
  restart();
  return {
    update: (update) => {
      if (update.docChanged || update.geometryChanged) restart();
    },
    destroy: () => {
      cancelAnimationFrame(frame);
      stopCards();
      stopPlaying();
    },
  };
});

const theme = EditorView.theme({
  '.cm-punchcard': {
    padding: '4px 0 6px',
    opacity: '0.9',
  },
});

/** Draws `._punchcard()` lines under themselves, like strudel.cc. */
export const punchcardWidgets: Extension = [field, animation, theme];
