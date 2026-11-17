/**
 * Every use of Strudel's internals goes through here: things @strudel/web
 * exports but doesn't document, whose shape can change between versions
 * (superdough's audio controller and its master gain, the analysers by
 * id, the sound map, resetting the output). Its public API (`mini`,
 * `transpiler`, `stack`, `samples`, `noteToMidi`, patterns) is used
 * directly elsewhere.
 *
 * Checked against @strudel/web 1.3.0 (strudel-internals.test.ts fails on
 * another version, so an upgrade starts by checking this file).
 */
import {
  analysers,
  getAudioContext,
  getSuperdoughAudioController,
  resetGlobalEffects,
  soundMap,
  superdough,
} from '@strudel/web';

export const STRUDEL_VERSION = '1.3.0';

/** The audio context Strudel plays through. */
export const audioContext = (): AudioContext => getAudioContext();

/**
 * Strudel's master output (superdough's destination gain), once it exists
 * (after the first sound); rebuilt by `resetOutput`.
 */
export function masterGain(): GainNode | undefined {
  const controller = getSuperdoughAudioController() as {
    output?: { destinationGain?: GainNode | null };
  };
  return controller.output?.destinationGain ?? undefined;
}

const limiters = new WeakMap<GainNode, GainNode>();
const THRESHOLD = -3;
const RATIO = 20;
// The browser's compressor adds make-up gain (Web Audio spec: 0.6 times the
// loss at full scale); the trim after it takes that back out, so what is
// below the threshold comes out exactly as it went in.
const MAKEUP_DB = 0.6 * -THRESHOLD * (1 - 1 / RATIO);

/**
 * What the speakers get: Strudel's master through a limiter, so a song
 * louder than full scale doesn't clip (fast, hard knee, 20:1 above
 * -3 dBFS, which leaves room for the transients it lets through; below
 * that it passes unchanged). Put in on first use and again after Strudel
 * rebuilds its output; the recorder and the master meter listen here, so
 * they hear what you hear.
 */
export function masterOutput(): AudioNode | undefined {
  const gain = masterGain();
  if (!gain) return undefined;
  let trim = limiters.get(gain);
  if (!trim) {
    const limiter = new DynamicsCompressorNode(gain.context, {
      threshold: THRESHOLD,
      knee: 0,
      ratio: RATIO,
      attack: 0.001,
      release: 0.1,
    });
    trim = new GainNode(gain.context, { gain: 10 ** (-MAKEUP_DB / 20) });
    gain.disconnect();
    gain.connect(limiter);
    limiter.connect(trim);
    trim.connect(gain.context.destination);
    limiters.set(gain, trim);
  }
  return trim;
}

/** The analyser Strudel feeds for `.analyze(id)`, once it has played. */
export const analyserById = (id: string | number) =>
  (analysers as Record<string, AnalyserNode | undefined>)[id];

/**
 * Rebuilds Strudel's output (every orbit, reverb and delay), dropping
 * whatever is still sounding.
 */
export const resetOutput = () => resetGlobalEffects();

export type SoundEntry = {
  data?: { type?: string; samples?: unknown; tag?: string } & Record<
    string,
    unknown
  >;
};
/** Every sound Strudel knows, by (lower-case) name. */
export const sounds = () =>
  soundMap.get() as Record<string, SoundEntry | undefined>;
/** Calls `listener` when sounds are added; returns a stop function. */
export const onSounds = (listener: () => void) => soundMap.listen(listener);

/** Plays one event now-ish (`time` in audio-context seconds). */
export const playEvent = (
  value: Record<string, unknown>,
  time: number,
  duration: number,
) => superdough(value, time, duration);
