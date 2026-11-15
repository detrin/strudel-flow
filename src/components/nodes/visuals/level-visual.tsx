import type { VisualProps } from '../define-node';
import { lineLabelOf } from '@/lib/lines';
import { historyOf } from '@/lib/meters';
import { dbPosition, drawHistory } from './history-draw';
import { canvasClass, useCanvas } from './use-canvas';

/**
 * The line's loudness: a meter (RMS bar, peak tick) and the last 8 bars,
 * where drops and the sidechain pump show.
 */
export function LevelVisual({ id, isPlaying }: VisualProps) {
  const ref = useCanvas((ctx, width, height, colors) => {
    const label = lineLabelOf(id);
    const history = label ? historyOf(label) : [];
    const meter = 14;
    // Meter: RMS bar, peak tick.
    ctx.fillStyle = colors.grid;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, meter, height);
    ctx.globalAlpha = 1;
    const current = isPlaying ? history.at(-1) : undefined;
    if (current) {
      const rms = dbPosition(current.rms) * height;
      ctx.fillStyle = colors.primary;
      ctx.fillRect(0, height - rms, meter, rms);
      const peak = height - dbPosition(current.peak) * height;
      ctx.fillStyle = colors.foreground;
      ctx.fillRect(0, peak, meter, 2);
    }
    drawHistory(
      ctx,
      isPlaying ? history : [],
      { x: meter + 6, width: width - meter - 6, height },
      8,
      colors,
    );
  }, isPlaying);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Loudness of the line: meter and the last 8 bars"
      data-visual="level"
      className={canvasClass}
    />
  );
}
