/**
 * The playback engine: Strudel started once per tab, the live view and
 * meters attached to it, and a queue that plays one pattern at a time
 * (the newest wins; an error keeps the last good one). One service with a
 * clear lifecycle, created once per tab: a hot update reuses it instead of
 * starting a second Strudel nobody can stop.
 */
import '@/lib/strudel-scope';
import { initStrudel, evaluate, hush, type StrudelSession } from '@strudel/web';
import {
  audioContext,
  ensureWorklets,
  masterOutput,
} from '@/lib/strudel-internals';
import { setSchedulerNow } from '@/lib/strudel-clock';
import { loadSamples } from '@/data/samples';
import { collectPunchcards, tagPunchcards } from '@/lib/punchcards';
import { setEvaluatedCode, startLive } from '@/lib/live';
import { startMeters, tagAnalysers } from '@/lib/meters';
import { prepareLaunch } from '@/lib/launch';
import { cutSound } from '@/lib/cut-sound';

type Options = {
  /** Whether the song is meant to be playing (meters run only then). */
  isPlaying: () => boolean;
  /** Playback failed (Strudel didn't start, or code didn't evaluate). */
  onError: (message: string) => void;
};

/**
 * Strudel, started once per tab. A hot update re-runs this module (when it
 * or anything it imports changes); starting Strudel again would leave the
 * old player running, still audible, with nothing able to stop it. The
 * live view and meters re-attach to it instead, replacing the old ones.
 */
const shared = globalThis as {
  __strudeltonStrudel?: Promise<StrudelSession>;
  __strudeltonWatchers?: () => void;
  __strudeltonEngine?: Engine;
};
function startStrudel(options: Options): Promise<StrudelSession> {
  const ready = (shared.__strudeltonStrudel ??= initStrudel()).then(
    (session: StrudelSession) => {
      shared.__strudeltonWatchers?.();
      setSchedulerNow(
        () => session.scheduler.now(),
        () => session.scheduler.cps ?? 0,
      );
      const stopLive = startLive(() => session.scheduler.pattern);
      const stopMeters = startMeters(
        () => session.scheduler.pattern,
        () => options.isPlaying(),
      );
      shared.__strudeltonWatchers = () => {
        stopLive();
        stopMeters();
      };
      return session;
    },
  );
  void ready.catch((error: unknown) =>
    options.onError(
      error instanceof Error ? error.message : 'Audio could not start.',
    ),
  );
  void loadSamples();
  return ready;
}

async function evaluateAudio(ready: Promise<StrudelSession>, pattern: string) {
  const session = await ready;
  // Strudel's clock is the audio clock, and Strudel only wakes the audio
  // when a sound plays: a song whose first bars are silent (arranged to
  // start later, or muted) would stay frozen at its start. Playing wakes it.
  await audioContext().resume();
  await ensureWorklets();
  const code = tagAnalysers(tagPunchcards(pattern));
  // While playing, an edit may wait for the next bar (launch quantization).
  const launch = prepareLaunch(session.scheduler);
  await collectPunchcards(async () => {
    await evaluate(code);
    if (session.state.evalError) throw session.state.evalError;
  });
  launch?.();
  setEvaluatedCode(code);
}

type PlaybackAdapter = {
  evaluate: (pattern: string) => unknown | Promise<unknown>;
  hush: () => void;
  onError: (error: unknown) => void;
};
export function createPlaybackQueue(adapter: PlaybackAdapter) {
  let desired: string | null = null;
  let applied: string | null = null;
  let busy = false;
  let disposed = false;
  let revision = 0;
  let stopGeneration = 0;

  async function drain() {
    if (busy || disposed) return;
    busy = true;
    try {
      while (!disposed && desired !== null && desired !== applied) {
        const pattern = desired;
        const startedAt = revision;
        const generation = stopGeneration;
        try {
          await adapter.evaluate(pattern);
          applied = generation === stopGeneration ? pattern : null;
        } catch (error) {
          if (startedAt === revision && !disposed) {
            desired = applied;
            if (applied === null) {
              adapter.hush();
              adapter.onError(error);
            }
          }
        }
        if (disposed || desired === null) {
          adapter.hush();
          applied = null;
        }
      }
    } finally {
      busy = false;
    }
  }

  return {
    setPattern(pattern: string | null) {
      if (disposed) return;
      revision += 1;
      desired = pattern;
      if (pattern === null) {
        stopGeneration += 1;
        applied = null;
        adapter.hush();
      } else {
        void drain();
      }
    },
    dispose() {
      disposed = true;
      desired = null;
      adapter.hush();
    },
  };
}

export type Engine = {
  /** Plays this code (Strudel's), or nothing. */
  play: (code: string | null) => void;
  /** Silences what is still sounding; resolves when new sound may start. */
  cut: () => Promise<void>;
};

/** The engine of this tab: made on first use, then always the same one. */
export function playbackEngine(options: Options): Engine {
  if (shared.__strudeltonEngine) return shared.__strudeltonEngine;
  const ready = startStrudel(options);
  const queue = createPlaybackQueue({
    evaluate: (code) => evaluateAudio(ready, code),
    hush,
    onError: (error) =>
      options.onError(error instanceof Error ? error.message : String(error)),
  });
  const engine: Engine = {
    play: (code) => queue.setPattern(code),
    cut: cutSound,
  };
  shared.__strudeltonEngine = engine;
  // Strudel makes its master with the first sound and rebuilds it after a
  // cut: keep the limiter in front of the speakers whenever it does.
  setInterval(() => masterOutput(), 250);
  return engine;
}
