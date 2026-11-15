import type { VisualProps } from '../define-node';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { canvasClass, useCanvas } from './use-canvas';
import { num, wave } from './math';

/** The LFO: one period of its wave, with its value now running along it. */
export function ModulateVisual({ values, isPlaying }: VisualProps) {
  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const shape = String(values.wave ?? 'sine');
      const min = num(values.min, 0);
      const max = num(values.max, 1);
      const cycles = Math.max(0.01, num(values.cycles, 1));
      const pad = 6;
      const Y = (unit: number) => height - pad - unit * (height - 2 * pad);
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        const y = Y(wave(shape, x / width));
        if (x) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(String(max), 3, 10);
      ctx.fillText(String(min), 3, height - 3);
      if (!isPlaying) return;
      const phase = (getSchedulerNow() / cycles) % 1;
      const unit = wave(shape, phase);
      ctx.beginPath();
      ctx.arc(phase * width, Y(unit), 4, 0, Math.PI * 2);
      ctx.fillStyle = colors.primary;
      ctx.fill();
      const value = min + (max - min) * unit;
      ctx.fillText(
        value >= 100 ? String(Math.round(value)) : value.toFixed(2),
        Math.min(phase * width + 6, width - 36),
        Y(unit) - 6,
      );
    },
    isPlaying,
    [values.wave, values.min, values.max, values.cycles],
  );
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="LFO wave and its value now"
      data-visual="modulate"
      className={canvasClass}
    />
  );
}
