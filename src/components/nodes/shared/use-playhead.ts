import { useEffect, useState } from 'react';
import { getSchedulerNow } from '@/lib/strudel-clock';

/** Where a clip of `bars` cycles is playing, 0..1, or -1 when it is not. */
export function usePlayhead(bars: number, active: boolean) {
  const [position, setPosition] = useState(-1);
  useEffect(() => {
    if (!active) {
      setPosition(-1);
      return;
    }
    let frame: number;
    const tick = () => {
      const now = getSchedulerNow();
      setPosition(now > 0 ? (now % bars) / bars : -1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bars, active]);
  return position;
}
