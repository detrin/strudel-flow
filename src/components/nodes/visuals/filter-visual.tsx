import type { VisualProps } from '../define-node';
import { sourceOf } from '@/lib/lines';
import { lineAnalyser, recentHaps, secondsPerCycle } from '@/lib/meters';
import { getSchedulerNow } from '@/lib/strudel-clock';
import { canvasClass, useCanvas } from './use-canvas';
import {
  envelopedCutoff,
  filterResponse,
  hz,
  hzAt,
  logPosition,
  num,
  type Adsr,
} from './math';

/** Strudel's filter envelope when only its depth is set. */
const UNSET: Adsr = [0.005, 0.14, 0, 0.1];
const KEYS = {
  lp: { cutoff: 'cutoff', q: 'resonance', env: 'lpenv', prefix: 'lp' },
  hp: { cutoff: 'hcutoff', q: 'hresonance', env: 'hpenv', prefix: 'hp' },
} as const;

const spectra = new WeakMap<AnalyserNode, Float32Array>();
function spectrum(analyser: AnalyserNode) {
  let data = spectra.get(analyser);
  if (data?.length !== analyser.frequencyBinCount) {
    data = new Float32Array(analyser.frequencyBinCount);
    spectra.set(analyser, data);
  }
  analyser.getFloatFrequencyData(data);
  return data;
}

/**
 * A filter, live: the spectrum of what it is in (its part of a stack, or
 * its line), and over it the filter's response,
 * whose cutoff follows each note (patterns, sliders, LFOs, the envelope).
 */
function FilterVisual({
  id,
  values,
  isPlaying,
  kind,
}: VisualProps & { kind: 'lp' | 'hp' }) {
  const keys = KEYS[kind];
  const ref = useCanvas(
    (ctx, width, height, colors) => {
      const label = sourceOf(id);
      // Grid: 100 Hz, 1 kHz, 10 kHz.
      ctx.strokeStyle = colors.grid;
      ctx.fillStyle = colors.muted;
      ctx.font = '9px ui-monospace, monospace';
      ctx.lineWidth = 1;
      for (const mark of [100, 1000, 10000]) {
        const x = logPosition(mark) * width;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.fillText(hz(mark), x + 2, height - 3);
      }
      ctx.globalAlpha = 1;

      // The part's (or line's) spectrum (dB), filled.
      const analyser = isPlaying && label ? lineAnalyser(label) : undefined;
      if (analyser) {
        const data = spectrum(analyser);
        const nyquist = analyser.context.sampleRate / 2;
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x++) {
          const bin = Math.min(
            data.length - 1,
            Math.round((hzAt(x / width) / nyquist) * data.length),
          );
          const db = Math.max(-110, Math.min(-10, data[bin]));
          ctx.lineTo(x, height - ((db + 110) / 100) * height);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = colors.primary;
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // The cutoff now: the newest sounding note's, else the node's.
      let cutoff = num(values.cutoff, NaN);
      let q = num(values.resonance, 1);
      if (isPlaying && label) {
        const now = getSchedulerNow();
        const spc = secondsPerCycle();
        const note = recentHaps(label)
          .filter((hap) => hap.value[keys.cutoff] !== undefined)
          .findLast((hap) => hap.begin <= now);
        if (note) {
          const v = note.value;
          const adsr: Adsr = [
            num(v[`${keys.prefix}attack`], UNSET[0]),
            num(v[`${keys.prefix}decay`], UNSET[1]),
            num(v[`${keys.prefix}sustain`], UNSET[2]),
            num(v[`${keys.prefix}release`], UNSET[3]),
          ];
          // Strudel: depth 1 once any part of the envelope is set.
          const shaped = ['attack', 'decay', 'sustain', 'release'].some(
            (part) => v[`${keys.prefix}${part}`] !== undefined,
          );
          const env = num(v[keys.env], shaped ? 1 : 0);
          cutoff = envelopedCutoff(
            num(v[keys.cutoff], cutoff),
            env,
            adsr,
            (now - note.begin) * spc,
            (note.end - note.begin) * spc,
          );
          q = num(v[keys.q], q);
        }
      }
      if (!Number.isFinite(cutoff)) return;

      // The filter's response, in dB (-36..+18).
      const points = new Float32Array(Math.ceil(width) + 1).map((_, x) =>
        hzAt(x / width),
      );
      const response = filterResponse(
        kind === 'lp' ? 'lowpass' : 'highpass',
        cutoff,
        q,
        points,
      );
      if (response) {
        ctx.beginPath();
        response.forEach((db, x) => {
          const y =
            height - ((Math.max(-36, Math.min(18, db)) + 36) / 54) * height;
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.strokeStyle = colors.foreground;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Its cutoff marker.
      const x = logPosition(cutoff) * width;
      ctx.strokeStyle = colors.primary;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colors.primary;
      ctx.fillText(`${hz(cutoff)} Hz`, Math.min(x + 3, width - 44), 10);
    },
    isPlaying,
    [values.cutoff, values.resonance],
  );
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Filter response over the spectrum of what it filters"
      data-visual="filter"
      className={canvasClass}
    />
  );
}

export const LowpassVisual = (props: VisualProps) => (
  <FilterVisual {...props} kind="lp" />
);
export const HighpassVisual = (props: VisualProps) => (
  <FilterVisual {...props} kind="hp" />
);
