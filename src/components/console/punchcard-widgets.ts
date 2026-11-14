import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { noteToMidi, type Pattern } from '@strudel/web';
import { onPunchcards, punchcards } from '@/lib/punchcards';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { useAppStore } from '@/store/app-store';

/** Cycles shown at once; while playing, the playhead sits in the middle. */
const CYCLES = 4;
const HEIGHT = 64;

const refresh = StateEffect.define<null>();

class PunchcardWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(other: PunchcardWidget) {
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
  get estimatedHeight() {
    return HEIGHT + 8;
  }
}

/** The line a label's punchcard goes under: its `._punchcard(` line. */
function cardLines(doc: EditorView['state']['doc'], labels: string[]) {
  const lines: { label: string; at: number }[] = [];
  for (const label of labels) {
    const start = new RegExp(`^_?${label.replace(/\$/g, '\\$')}\\s*:`);
    for (let n = 1; n <= doc.lines; n++) {
      if (!start.test(doc.line(n).text)) continue;
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

type Value = Record<string, unknown> | string | number;

/** A hap's row: its pitch, or its sound when it has none. */
function rowKey(value: Value): number | string {
  if (typeof value !== 'object' || value === null) return value;
  const pitch = value.note ?? value.freq;
  if (typeof pitch === 'number') return pitch;
  if (typeof pitch === 'string') {
    try {
      return noteToMidi(pitch);
    } catch {
      return pitch;
    }
  }
  if (value.s !== undefined) return `${value.s}:${value.n ?? 0}`;
  return typeof value.n === 'number' ? value.n : JSON.stringify(value);
}

function draw(canvas: HTMLCanvasElement, pattern: Pattern, playing: boolean) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  if (!width) return;
  if (canvas.width !== width * ratio) canvas.width = width * ratio;
  if (canvas.height !== HEIGHT * ratio) canvas.height = HEIGHT * ratio;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, HEIGHT);

  const now = playing ? getSchedulerNow() : 0;
  const begin = playing ? now - CYCLES / 2 : 0;
  type Hap = {
    whole?: { begin: number; end: number };
    value: Value;
  };
  let haps: Hap[];
  try {
    haps = (pattern as unknown as { queryArc: (b: number, e: number) => Hap[] })
      .queryArc(begin, begin + CYCLES)
      .filter((hap) => hap.whole);
  } catch {
    return;
  }
  const keys = [...new Set(haps.map((hap) => rowKey(hap.value)))].sort(
    (a, b) =>
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b)),
  );
  const rowHeight = HEIGHT / Math.max(keys.length, 1);
  const style = getComputedStyle(canvas);
  const root = getComputedStyle(document.documentElement);
  const color = style.color;
  const active = root.getPropertyValue('--primary').trim() || color;
  const x = (t: number) => ((t - begin) / CYCLES) * width;

  for (const hap of haps) {
    const start = Number(hap.whole!.begin);
    const end = Number(hap.whole!.end);
    const row = keys.indexOf(rowKey(hap.value));
    const on = playing && start <= now && now < end;
    ctx.globalAlpha = on ? 1 : 0.45;
    ctx.fillStyle = on ? active : color;
    ctx.fillRect(
      x(start) + 0.5,
      (keys.length - 1 - row) * rowHeight + 0.5,
      Math.max(1, x(end) - x(start) - 1),
      Math.max(1, rowHeight - 1),
    );
  }
  ctx.globalAlpha = 1;
  if (playing) {
    ctx.fillStyle = active;
    ctx.fillRect(x(now) - 0.5, 0, 1, HEIGHT);
  }
}

const animation = ViewPlugin.define((view) => {
  let frame = 0;
  const paint = () => {
    const playing = useAppStore.getState().isPlaying;
    const cards = punchcards();
    view.dom
      .querySelectorAll<HTMLCanvasElement>('canvas[data-punchcard]')
      .forEach((canvas) => {
        const pattern = cards.get(canvas.dataset.punchcard!);
        if (pattern) draw(canvas, pattern, playing);
      });
    frame = playing ? requestAnimationFrame(paint) : 0;
  };
  const restart = () => {
    cancelAnimationFrame(frame);
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
