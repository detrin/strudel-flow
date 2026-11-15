import { useRef } from 'react';
import type { CustomControlsProps } from '../../define-node';
import { sourceOf } from '@/lib/lines';
import { analyserOf, historyOf, MASTER } from '@/lib/meters';
import { canvasClass, useCanvas } from '../../visuals/use-canvas';
import { drawHistory } from '../../visuals/history-draw';
import { hz, hzAt, logPosition } from '../../visuals/math';
import { cn } from '@/lib/utils';

export type AnalyzerData = {
  mode?: 'spectrogram' | 'loudness' | 'waveform';
  source?: 'line' | 'master';
  /** strudel.cc's inline view the code writes, and its options. */
  inline?: '_spectrum' | '_scope';
  options?: string;
};

const LABELS = {
  spectrogram: 'Spectrogram',
  loudness: 'Loudness over time',
  waveform: 'Waveform',
};

/** One frame of the waveform, centred, scaled to the height. */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  analyser: AnalyserNode | undefined,
  width: number,
  height: number,
  color: string,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (!analyser) {
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
  } else {
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height / 2 - data[i] * (height / 2) * 0.9;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

const select =
  'h-7 cursor-pointer rounded-md border border-border bg-background/60 px-1.5 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** A spectrogram or loudness curve of its line, or of the master mix. */
export function AnalyzerNode({
  id,
  values,
  onChange,
  isPlaying,
}: CustomControlsProps<AnalyzerData>) {
  // Without a choice, show what the code's inline view shows.
  const mode =
    values.mode ?? (values.inline === '_scope' ? 'waveform' : 'spectrogram');
  const source = values.source ?? 'line';
  const waterfall = useRef<HTMLCanvasElement | null>(null);
  const bins = useRef<Float32Array | null>(null);

  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const key = source === MASTER ? MASTER : sourceOf(id);
      if (!key) return;
      if (mode === 'waveform') {
        drawWaveform(
          ctx,
          isPlaying ? analyserOf(key) : undefined,
          width,
          height,
          colors.primary,
        );
        return;
      }
      if (mode === 'loudness') {
        drawHistory(
          ctx,
          isPlaying ? historyOf(key) : [],
          { x: 0, width, height },
          16,
          colors,
          true,
        );
        return;
      }
      // Spectrogram: an offscreen strip that scrolls left a column a frame.
      let strip = waterfall.current;
      if (
        !strip ||
        strip.width !== Math.round(width) ||
        strip.height !== Math.round(height)
      ) {
        strip = document.createElement('canvas');
        strip.width = Math.round(width);
        strip.height = Math.round(height);
        waterfall.current = strip;
      }
      const analyser = isPlaying ? analyserOf(key) : undefined;
      const paint = strip.getContext('2d')!;
      if (analyser) {
        if (bins.current?.length !== analyser.frequencyBinCount)
          bins.current = new Float32Array(analyser.frequencyBinCount);
        const data = bins.current;
        analyser.getFloatFrequencyData(data);
        const nyquist = analyser.context.sampleRate / 2;
        const step = 2;
        // Shift, replacing (drawn over itself it would pile up).
        paint.globalCompositeOperation = 'copy';
        paint.drawImage(strip, -step, 0);
        paint.globalCompositeOperation = 'source-over';
        paint.clearRect(strip.width - step, 0, step, strip.height);
        paint.fillStyle = colors.primary;
        for (let y = 0; y < strip.height; y += 2) {
          // Low frequencies at the bottom.
          const frequency = hzAt(1 - y / strip.height);
          const bin = Math.min(
            data.length - 1,
            Math.round((frequency / nyquist) * data.length),
          );
          // -95 dB is silence, -25 dB loud; curved so detail shows.
          const level = Math.max(0, Math.min(1, (data[bin] + 95) / 70)) ** 1.8;
          if (level <= 0.02) continue;
          paint.globalAlpha = level;
          paint.fillRect(strip.width - step, y, step, 2);
        }
        paint.globalAlpha = 1;
      }
      ctx.drawImage(strip, 0, 0, width, height);
      ctx.fillStyle = colors.muted;
      ctx.font = '9px ui-monospace, monospace';
      for (const mark of [100, 1000, 10000]) {
        const y = height - logPosition(mark) * height;
        ctx.fillText(hz(mark), 2, y - 2);
      }
    },
    isPlaying,
    [mode, source],
  );

  return (
    <div className="w-80 max-w-[calc(100vw-32px)] space-y-2 px-3 pb-3">
      <div className="nodrag flex items-center gap-2">
        <select
          aria-label="Analyzer view"
          value={mode}
          onChange={(event) =>
            onChange({ mode: event.target.value as AnalyzerData['mode'] })
          }
          className={select}
        >
          <option value="spectrogram">Spectrogram</option>
          <option value="loudness">Loudness over time</option>
          <option value="waveform">Waveform</option>
        </select>
        <select
          aria-label="Analyzer source"
          value={source}
          onChange={(event) =>
            onChange({ source: event.target.value as AnalyzerData['source'] })
          }
          className={select}
        >
          <option value="line">This line</option>
          <option value="master">Master mix</option>
        </select>
      </div>
      <canvas
        ref={ref}
        role="img"
        aria-label={`${LABELS[mode]} of ${source === 'master' ? 'the master mix' : 'this line'}`}
        data-visual="analyzer"
        className={cn(canvasClass, 'h-32')}
      />
      {!isPlaying && (
        <p className="text-[10px] text-muted-foreground">
          Shows once the patch plays.
        </p>
      )}
    </div>
  );
}
