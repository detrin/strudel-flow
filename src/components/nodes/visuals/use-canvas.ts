import { useEffect, useRef } from 'react';

export type Colors = {
  foreground: string;
  muted: string;
  primary: string;
  grid: string;
};

/** The theme's colours for drawing, read from CSS. */
function colorsOf(canvas: HTMLCanvasElement): Colors {
  const root = getComputedStyle(document.documentElement);
  const foreground = getComputedStyle(canvas).color;
  return {
    foreground,
    muted: root.getPropertyValue('--muted-foreground').trim() || foreground,
    primary: root.getPropertyValue('--primary').trim() || foreground,
    grid: root.getPropertyValue('--border').trim() || foreground,
  };
}

export type Draw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: Colors,
) => void;

/**
 * A canvas that draws with `draw`: about 30 times a second while `animate`
 * (playing), once otherwise and whenever `deps` change. Sized for the
 * screen's pixel density.
 */
export function useCanvas(draw: Draw, animate: boolean, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef(draw);
  latest.current = draw;
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const paint = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      if (canvas.width !== Math.round(width * ratio))
        canvas.width = Math.round(width * ratio);
      if (canvas.height !== Math.round(height * ratio))
        canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      latest.current(ctx, width, height, colorsOf(canvas));
    };
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < 33) return;
      last = time;
      paint();
    };
    if (animate) frame = requestAnimationFrame(loop);
    else paint();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, ...deps]);
  return ref;
}

export const canvasClass =
  'block h-20 w-full rounded border border-border bg-background text-foreground';
