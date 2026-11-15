import { useEffect, useState } from 'react';
import { Circle, Square } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import {
  recordingName,
  startRecording,
  stopRecording,
  useRecorder,
} from '@/lib/recorder';
import { cn } from '@/lib/utils';

const time = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Records what plays to a WAV file; stopping downloads it. */
export function RecordButton() {
  const since = useRecorder((state) => state.since);
  const error = useRecorder((state) => state.error);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [since]);
  const recording = since !== null;

  const onClick = () => {
    if (!recording) {
      void startRecording();
      return;
    }
    const wav = stopRecording();
    if (!wav) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(wav);
    link.download = recordingName(useAppStore.getState().name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  };

  return (
    <button
      type="button"
      aria-label={recording ? 'Stop recording and save WAV' : 'Record to WAV'}
      aria-pressed={recording}
      title={
        error
          ? `Recording failed: ${error}`
          : recording
            ? 'Stop recording and save the WAV file'
            : 'Record what plays to a WAV file'
      }
      onClick={onClick}
      className={cn(
        'nodrag flex h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring',
        recording
          ? 'bg-red-600 text-white'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {recording ? (
        <>
          <Square className="size-3 fill-current" aria-hidden="true" />
          <span className="font-mono tabular-nums">
            {time(Math.max(0, now - since))}
          </span>
        </>
      ) : (
        <Circle
          className={cn(
            'size-3.5',
            error ? 'text-destructive' : 'text-red-500',
          )}
          fill="currentColor"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
