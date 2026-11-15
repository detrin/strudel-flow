import '@/lib/strudel-scope';
import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { emitProgram, isAudible } from '@/lib/program/emit';
import {
  initStrudel,
  evaluate,
  getAudioContext,
  hush,
  type StrudelSession,
} from '@strudel/web';
import { setSchedulerNow } from '@/lib/strudel-clock';
import { loadSamples } from '@/data/samples';
import { collectPunchcards, tagPunchcards } from '@/lib/punchcards';
import { setEvaluatedCode, startLive } from '@/lib/live';
import { startMeters, tagAnalysers } from '@/lib/meters';
import { prepareLaunch } from '@/lib/launch';

const ready: Promise<StrudelSession> = initStrudel().then(
  (session: StrudelSession) => {
    setSchedulerNow(
      () => session.scheduler.now(),
      () => session.scheduler.cps ?? 0,
    );
    startLive(() => session.scheduler.pattern);
    startMeters(
      () => session.scheduler.pattern,
      () => useAppStore.getState().isPlaying,
    );
    return session;
  },
);
void ready.catch((error: unknown) => {
  useAppStore
    .getState()
    .setError(
      error instanceof Error ? error.message : 'Audio could not start.',
    );
});
void loadSamples();

async function evaluateAudio(pattern: string) {
  const session = await ready;
  // Strudel's clock is the audio clock, and Strudel only wakes the audio
  // when a sound plays: a song whose first bars are silent (arranged to
  // start later, or muted) would stay frozen at its start. Playing wakes it.
  await getAudioContext().resume();
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
function createPlaybackEngine(adapter: PlaybackAdapter) {
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
export function useWorkflowRunner() {
  const engine = useRef<ReturnType<typeof createPlaybackEngine> | null>(null);
  const nodes = useAppStore((state) => state.nodes);
  const edges = useAppStore((state) => state.edges);
  const cpm = useAppStore((state) => state.cpm);
  const bpc = useAppStore((state) => state.bpc);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const preview = useAppStore((state) => state.preview);
  const prelude = useAppStore((state) => state.prelude);
  const setError = useAppStore((state) => state.setError);

  const compiled = useMemo(() => {
    try {
      const program = programOf({ nodes, edges, cpm, bpc, prelude });
      return {
        pattern: emitProgram(program),
        audible: isAudible(program),
        error: null,
      };
    } catch (error) {
      return {
        pattern: '',
        audible: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [nodes, edges, cpm, bpc, prelude]);

  useEffect(() => {
    const instance = createPlaybackEngine({
      evaluate: evaluateAudio,
      hush,
      onError: (error) =>
        setError(error instanceof Error ? error.message : String(error)),
    });
    engine.current = instance;
    return () => {
      instance.dispose();
      engine.current = null;
    };
  }, [setError]);

  useEffect(() => {
    if (compiled.error) setError(compiled.error);
  }, [compiled, setError]);

  useEffect(() => {
    // A preview plays instead of the song while it lasts.
    if (preview) {
      const timer = window.setTimeout(
        () => engine.current?.setPattern(preview.code),
        40,
      );
      return () => window.clearTimeout(timer);
    }
    if (!isPlaying || !compiled.audible || compiled.error) {
      engine.current?.setPattern(null);
      return;
    }
    const timer = window.setTimeout(
      () => engine.current?.setPattern(compiled.pattern),
      40,
    );
    return () => window.clearTimeout(timer);
  }, [compiled, isPlaying, preview]);
}
