import { noteToMidi, type Pattern } from '@strudel/web';
import { getSchedulerNow } from '@/lib/strudel-clock';

/**
 * Punchcards as on strudel.cc: one row per pitch (or sound), events as
 * bars, the ones sounding now highlighted, and a playhead in the middle.
 */

/** Cycles shown at once; while playing, the playhead sits in the middle. */
const CYCLES = 4;

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

/** Draws a punchcard of `pattern` on `canvas` (`height` CSS pixels tall). */
export function drawPunchcard(
  canvas: HTMLCanvasElement,
  pattern: Pattern,
  playing: boolean,
  HEIGHT: number,
) {
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
