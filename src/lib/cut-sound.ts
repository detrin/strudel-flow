import { audioContext, masterGain, resetOutput } from '@/lib/strudel-internals';

/** How long the fade before the cut takes, in seconds (no click). */
const FADE = 0.03;

/**
 * Silences everything sounding now. Changing the pattern doesn't: notes
 * already started play to their end (a vocal held for bars, a sample, a
 * reverb or delay tail), so switching previews would layer them. Fades
 * Strudel's master out, then rebuilds its output (every orbit, reverb and
 * delay), which drops those notes. Resolves when new sounds can play.
 */
export function cutSound(): Promise<void> {
  const gain = masterGain();
  if (!gain) return Promise.resolve();
  const now = audioContext().currentTime;
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE);
  return new Promise((resolve) =>
    setTimeout(
      () => {
        resetOutput();
        resolve();
      },
      FADE * 1000 + 10,
    ),
  );
}
