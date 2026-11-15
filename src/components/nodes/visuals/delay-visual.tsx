import type { VisualProps } from '../define-node';
import { sourceOf } from '@/lib/lines';
import { recentHaps, secondsPerCycle } from '@/lib/meters';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { canvasClass, useCanvas } from './use-canvas';
import { num } from './math';

/** Seconds shown, now at the right edge. */
const WINDOW = 3;

/**
 * Echoes: each hit and its taps (every `delaytime`, each `delayfeedback`
 * quieter), scrolling past as they fade.
 */
export function DelayVisual({ id, values, isPlaying }: VisualProps) {
  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const label = sourceOf(id);
      const now = getSchedulerNow();
      const spc = secondsPerCycle();
      // Stopped: one hit and its echoes, as a picture of the settings.
      const hits =
        isPlaying && label
          ? recentHaps(label).map((hap) => ({
              ago: (now - hap.begin) * spc,
              value: hap.value,
            }))
          : [{ ago: WINDOW * 0.9, value: {} as Record<string, unknown> }];
      const X = (ago: number) => width - (ago / WINDOW) * width;
      ctx.strokeStyle = colors.grid;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(width - 1, 0);
      ctx.lineTo(width - 1, height);
      ctx.stroke();
      for (const { ago, value } of hits) {
        const wet = num(value.delay, num(values.delay, 0));
        const time = Math.max(
          0.01,
          num(value.delaytime, num(values.delaytime, 0.25)),
        );
        const feedback = Math.min(
          0.98,
          num(value.delayfeedback, num(values.delayfeedback, 0.5)),
        );
        // The hit itself.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colors.foreground;
        if (ago <= WINDOW)
          ctx.fillRect(X(ago) - 1, height * 0.15, 2, height * 0.85);
        let level = wet;
        for (let tap = 1; tap < 40 && level > 0.02; tap++, level *= feedback) {
          const tapAgo = ago - tap * time;
          if (tapAgo > WINDOW) continue;
          // Taps still to come are faint; past ones fade with their age.
          ctx.globalAlpha = tapAgo < 0 ? 0.15 : 0.9 * (1 - tapAgo / WINDOW);
          ctx.fillStyle = colors.primary;
          const h = level * height * 0.85;
          ctx.fillRect(X(Math.max(tapAgo, 0)) - 1.5, height - h, 3, h);
        }
      }
      ctx.globalAlpha = 1;
    },
    isPlaying,
    [values.delay, values.delaytime, values.delayfeedback],
  );
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Delay: each hit and its fading echoes"
      data-visual="delay"
      className={canvasClass}
    />
  );
}
