import { useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { emitProgram, isAudible } from '@/lib/program/emit';
import { useRecorder } from '@/lib/recorder';
import { playbackEngine, type Engine } from '@/lib/engine';

export function useWorkflowRunner() {
  const engine = useRef<Engine | null>(null);
  // The song, not the canvas: selecting or measuring nodes plays nothing.
  const song = useAppStore((state) => state.song);
  const tempoName = useAppStore((state) => state.tempoName);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const preview = useAppStore((state) => state.preview);
  const setError = useAppStore((state) => state.setError);

  const compiled = useMemo(() => {
    try {
      const program = programOf({ ...song, tempoName });
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
  }, [song, tempoName]);

  useEffect(() => {
    const instance = playbackEngine({
      isPlaying: () => useAppStore.getState().isPlaying,
      onError: (message) => useAppStore.getState().setError(message),
    });
    engine.current = instance;
    return () => {
      instance.play(null);
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (compiled.error) setError(compiled.error);
  }, [compiled, setError]);

  // Switching to or from a preview cuts what is still sounding (a held
  // vocal, a tail), or the previews would layer. Not while recording: the
  // recorder listens on the output the cut rebuilds.
  const shown = useRef<string | null>(null);
  const cutting = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const id = preview?.id ?? null;
    if (id === shown.current) return;
    shown.current = id;
    if (useRecorder.getState().since === null) {
      cutting.current = engine.current?.cut() ?? Promise.resolve();
    }
  }, [preview]);

  useEffect(() => {
    // A preview plays instead of the song while it lasts.
    if (preview) {
      let cancelled = false;
      const timer = window.setTimeout(
        () =>
          void cutting.current.then(() => {
            if (!cancelled) engine.current?.play(preview.code);
          }),
        40,
      );
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    if (!isPlaying || !compiled.audible || compiled.error) {
      engine.current?.play(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(
      () =>
        void cutting.current.then(() => {
          if (!cancelled) engine.current?.play(compiled.pattern);
        }),
      40,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [compiled, isPlaying, preview]);
}
