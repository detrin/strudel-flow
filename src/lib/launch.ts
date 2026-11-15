/**
 * Launch quantization, like Ableton's: while the song plays, an edit
 * waits for the next bar (or the next 4) instead of cutting in mid-bar.
 * One cycle is one bar here (`setcpm(bpm/beatsPerBar)`).
 *
 * The new code is evaluated at once, but what plays is spliced: the old
 * pattern's events start before the boundary, the new one's from it on.
 * Once the boundary has passed, the plain new pattern takes over.
 */
import { create } from 'zustand';
import { stack, type Hap, type Pattern } from '@strudel/web';

/** Bars an edit waits for: 0 plays it at once. */
export const QUANTIZE_OPTIONS = [0, 1, 4] as const;
export type Quantize = (typeof QUANTIZE_OPTIONS)[number];

const KEY = 'strudelton:launch';
function saved(): Quantize {
  try {
    const value = Number(localStorage.getItem(KEY));
    return (QUANTIZE_OPTIONS as readonly number[]).includes(value)
      ? (value as Quantize)
      : 0;
  } catch {
    return 0;
  }
}

type Launch = {
  quantize: Quantize;
  /** The cycle a waiting edit starts at, or null. */
  pending: number | null;
  setQuantize: (quantize: Quantize) => void;
};

export const useLaunch = create<Launch>()((set) => ({
  quantize: saved(),
  pending: null,
  setQuantize: (quantize) => {
    set({ quantize });
    try {
      localStorage.setItem(KEY, String(quantize));
    } catch {
      // Not remembered; still applied.
    }
  },
}));

/**
 * The first multiple of `bars` at or after `scheduled`, the cycle up to
 * which events are already on their way: an edit can't change those.
 */
export function boundaryAfter(scheduled: number, bars: number) {
  return Math.ceil(scheduled / bars - 1e-9) * bars;
}

const onset = (hap: Hap) => Number((hap.whole ?? hap.part).begin.valueOf());

/** `before` until cycle `at`, `after` from it on, cut at event onsets. */
export function splice(before: Pattern, after: Pattern, at: number) {
  return stack(
    before.filterHaps((hap) => onset(hap) < at),
    after.filterHaps((hap) => onset(hap) >= at),
  );
}

type Scheduler = {
  started?: boolean;
  lastEnd?: number;
  pattern?: Pattern;
  cps?: number;
  now: () => number;
  setPattern: (pattern: Pattern, autostart?: boolean) => Promise<void>;
};

let handover: ReturnType<typeof setTimeout> | undefined;

/**
 * Call before evaluating an edit: returns what to call after it, which
 * makes the edit wait for the next boundary, or null to let it play now
 * (stopped, or no quantization).
 */
export function prepareLaunch(scheduler: Scheduler) {
  const bars = useLaunch.getState().quantize;
  const before = scheduler.pattern;
  if (!bars || !scheduler.started || !before) {
    useLaunch.setState({ pending: null });
    return null;
  }
  const at = boundaryAfter(scheduler.lastEnd ?? scheduler.now(), bars);
  return () => {
    const after = scheduler.pattern;
    if (!after || after === before) return;
    void scheduler.setPattern(splice(before, after, at), false);
    const spliced = scheduler.pattern;
    useLaunch.setState({ pending: at });
    clearTimeout(handover);
    const cps = scheduler.cps || 0.5;
    const wait = Math.max(0, (at - scheduler.now()) / cps) * 1000 + 500;
    handover = setTimeout(() => {
      // Past the boundary only the new pattern plays: drop the splice.
      if (scheduler.pattern === spliced)
        void scheduler.setPattern(after, false);
      useLaunch.setState({ pending: null });
    }, wait);
  };
}
