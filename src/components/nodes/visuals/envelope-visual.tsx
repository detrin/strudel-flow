import type { VisualProps } from '../define-node';
import { sourceOf } from '@/lib/lines';
import { recentHaps, secondsPerCycle } from '@/lib/meters';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { canvasClass, useCanvas } from './use-canvas';
import { envelopeAt, num, type Adsr } from './math';

/** Share of the width the held part of a note takes. */
const HOLD = 0.25;

/**
 * The envelope as a shape (attack, decay, hold at sustain, release), with a
 * dot running along it for every note that sounds now.
 */
export function EnvelopeVisual({ id, values, isPlaying }: VisualProps) {
  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const shape: Adsr = [
        num(values.attack, 0.01),
        num(values.decay, 0.1),
        Math.min(1, Math.max(0, num(values.sustain, 0.7))),
        num(values.release, 0.1),
      ];
      const [a, d, s, r] = shape;
      const total = Math.max(a + d + r, 1e-6);
      const span = (time: number) => ((1 - HOLD) * time) / total;
      // Segment boundaries, 0..1 across.
      const ends = [span(a), span(a) + span(d)];
      ends.push(ends[1] + HOLD, ends[1] + HOLD + span(r));
      const pad = 6;
      const X = (position: number) => pad + position * (width - 2 * pad);
      const Y = (level: number) => height - pad - level * (height - 2 * pad);

      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(ends[0]), Y(1));
      ctx.lineTo(X(ends[1]), Y(s));
      ctx.lineTo(X(ends[2]), Y(s));
      ctx.lineTo(X(ends[3]), Y(0));
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineTo(X(0), Y(0));
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;

      const label = sourceOf(id);
      if (!isPlaying || !label) return;
      const now = getSchedulerNow();
      const spc = secondsPerCycle();
      for (const hap of recentHaps(label)) {
        const v = hap.value;
        // A note's own envelope when the code sets one per note.
        const own: Adsr = [
          num(v.attack, a),
          num(v.decay, d),
          num(v.sustain, s),
          num(v.release, r),
        ];
        const at = envelopeAt(
          (now - hap.begin) * spc,
          (hap.end - hap.begin) * spc,
          own,
        );
        if (!at) continue;
        const start = [0, ...ends][
          ['attack', 'decay', 'hold', 'release'].indexOf(at.segment)
        ];
        const end =
          ends[['attack', 'decay', 'hold', 'release'].indexOf(at.segment)];
        const x = X(start + (end - start) * Math.min(1, at.progress));
        ctx.beginPath();
        ctx.arc(x, Y(at.level), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors.primary;
        ctx.globalAlpha = at.segment === 'release' ? 0.5 : 0.95;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    isPlaying,
    [values.attack, values.decay, values.sustain, values.release],
  );
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Envelope, with a dot for each sounding note"
      data-visual="envelope"
      className={canvasClass}
    />
  );
}
