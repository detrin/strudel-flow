import type { Level } from '@/lib/meters';
import { getSchedulerNow } from '@/lib/strudel-clock';

const FLOOR_DB = -60;
/** 0..1 on a dB scale from -60 dB to 0 dB. */
export const dbPosition = (amplitude: number) => {
  const db = 20 * Math.log10(Math.max(amplitude, 1e-6));
  return Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
};

/**
 * Draws loudness over the last `cycles` (bar lines numbered like the
 * Arrange), RMS filled and peaks as a line.
 */
export function drawHistory(
  ctx: CanvasRenderingContext2D,
  history: Level[],
  box: { x: number; width: number; height: number },
  cycles: number,
  colors: { foreground: string; primary: string; grid: string; muted: string },
  numbered = false,
) {
  const now = getSchedulerNow();
  const start = now - cycles;
  const X = (at: number) => box.x + ((at - start) / cycles) * box.width;
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.muted;
  ctx.font = '9px ui-monospace, monospace';
  for (let bar = Math.ceil(start); bar <= now; bar++) {
    const x = X(bar);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, box.height);
    ctx.stroke();
    if (numbered && bar >= 0) {
      ctx.globalAlpha = 0.8;
      ctx.fillText(String(bar + 1), x + 2, 9);
    }
  }
  ctx.globalAlpha = 1;
  const points = history.filter((level) => level.at >= start);
  if (points.length < 2) return;
  const Y = (amplitude: number) =>
    box.height - dbPosition(amplitude) * (box.height - 2) - 1;
  ctx.beginPath();
  ctx.moveTo(X(points[0].at), box.height);
  for (const point of points) ctx.lineTo(X(point.at), Y(point.rms));
  ctx.lineTo(X(points.at(-1)!.at), box.height);
  ctx.closePath();
  ctx.fillStyle = colors.primary;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  points.forEach((point, i) =>
    i
      ? ctx.lineTo(X(point.at), Y(point.peak))
      : ctx.moveTo(X(point.at), Y(point.peak)),
  );
  ctx.strokeStyle = colors.foreground;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
