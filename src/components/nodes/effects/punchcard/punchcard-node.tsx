import { useEffect, useRef } from 'react';
import type { CustomControlsProps } from '../../define-node';
import type { PunchcardData } from './punchcard.node';
import { drawPunchcard } from '@/lib/punchcard-draw';
import { onPunchcards, punchcards } from '@/lib/punchcards';
import { lineLabelOf } from '@/lib/lines';
import { isVisible } from '@/lib/visible';

const HEIGHT = 96;

export function PunchcardNode({
  id,
  isPlaying,
}: CustomControlsProps<PunchcardData>) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < 33) return;
      last = time;
      if (canvas.current && isVisible(canvas.current)) paint();
    };
    const paint = () => {
      const element = canvas.current;
      const label = lineLabelOf(id);
      const pattern = label ? punchcards().get(label) : undefined;
      if (element) {
        if (pattern) drawPunchcard(element, pattern, isPlaying, HEIGHT);
        else element.getContext('2d')?.clearRect(0, 0, 1e4, 1e4);
      }
    };
    paint();
    if (isPlaying) frame = requestAnimationFrame(loop);
    const stop = onPunchcards(paint);
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [id, isPlaying]);

  return (
    <div className="w-72 max-w-[calc(100vw-32px)] px-4 pb-4">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Punchcard of this line"
        style={{ height: HEIGHT }}
        className="w-full rounded border border-border bg-background text-foreground"
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Shows once the patch plays.
      </p>
    </div>
  );
}
