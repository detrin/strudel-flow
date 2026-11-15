import type { VisualProps } from '../define-node';
import { lineLabelOf } from '@/lib/live';
import { recentHaps, secondsPerCycle } from '@/lib/meters';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { canvasClass, useCanvas } from './use-canvas';
import { num } from './math';

const WINDOW = 4;

/**
 * Reverb: the tail after each hit decaying (its length set by size), the
 * tails summed as they overlap.
 */
export function RoomVisual({ id, values, isPlaying }: VisualProps) {
  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const label = lineLabelOf(id);
      const now = getSchedulerNow();
      const spc = secondsPerCycle();
      const hits =
        isPlaying && label
          ? recentHaps(label).map((hap) => ({
              ago: (now - hap.begin) * spc,
              value: hap.value,
            }))
          : [{ ago: WINDOW * 0.85, value: {} as Record<string, unknown> }];
      const tail = (ago: number, value: Record<string, unknown>) => {
        const wet = Math.min(1, num(value.room, num(values.room, 0)));
        // A tail of `size` seconds falls 60 dB.
        const length = Math.max(
          0.1,
          num(value.roomsize, num(values.roomsize, 2)),
        );
        return ago < 0 ? 0 : wet * Math.exp((-6.9 * ago) / length);
      };
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 2) {
        const at = ((width - x) / width) * WINDOW;
        const level = Math.min(
          1,
          hits.reduce((sum, hit) => sum + tail(hit.ago - at, hit.value), 0),
        );
        ctx.lineTo(x, height - level * height * 0.9);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = colors.primary;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
    isPlaying,
    [values.room, values.roomsize],
  );
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Reverb: the tail after each hit"
      data-visual="room"
      className={canvasClass}
    />
  );
}
