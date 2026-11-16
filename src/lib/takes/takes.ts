/**
 * Takes: sounds recorded in the app (a voice, a mouth click, anything),
 * tuned by an amount toward a key and scale, and kept in the Library
 * folder (~/.strudelton/takes, served at /__library/takes): the tuned WAV
 * and the raw one beside it, so a take can be tuned again from what was
 * recorded. Every take is a Strudel sound named after it: `s("vox")`.
 */
import { create } from 'zustand';
import { samples } from '@strudel/web';
import { audioContext } from '@/lib/strudel-internals';
import { encodeWav } from '@/lib/recorder';
import { base64Of, bytesOf } from '@/lib/base64';
import { trimSilence, tuneTake, type TuneOptions } from './tune';

export type TakeDetails = TuneOptions & {
  name: string;
  seconds: number;
  savedAt: number;
};

type TakesState = {
  takes: TakeDetails[];
  /** Null until known: false without the dev server (no folder). */
  available: boolean | null;
};

export const useTakes = create<TakesState>()(() => ({
  takes: [],
  available: null,
}));

/** A sound name from what was typed: "Clean windows!" → "clean_windows". */
export function takeNameOf(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) return '';
  return (/^[a-z]/.test(slug) ? slug : `take_${slug}`).slice(0, 40);
}

const url = (take: Pick<TakeDetails, 'name' | 'savedAt'>, raw = false) =>
  // The date makes a retuned take a new URL, so no old copy is played.
  `/__library/takes/${take.name}${raw ? '.raw' : ''}.wav?v=${take.savedAt}`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/__library${path}`, init);
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Record<string, unknown>;
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

/** Makes takes Strudel sounds (the newest file of each). */
async function register(takes: TakeDetails[]) {
  if (!takes.length) return;
  await samples(
    Object.fromEntries(takes.map((take) => [take.name, [url(take)]])),
  );
}

/** Reads the takes from the folder and makes each a sound. */
export async function refreshTakes() {
  if (new URLSearchParams(window.location.search).get('library') === 'browser')
    return useTakes.setState({ available: false });
  try {
    const { takes } = (await request('/takes')) as { takes: TakeDetails[] };
    useTakes.setState({ takes, available: true });
    await register(takes);
  } catch {
    useTakes.setState({ available: false });
  }
}

export const listTakes = () => useTakes.getState().takes;

/** Audio as a mono array at the audio context's rate. */
export async function decodeAudio(bytes: ArrayBuffer) {
  const buffer = await audioContext().decodeAudioData(bytes);
  const samples = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < samples.length; i++)
      samples[i] =
        (samples[i] ?? 0) + (channel[i] ?? 0) / buffer.numberOfChannels;
  }
  return { samples, rate: buffer.sampleRate };
}

/** The take as it was recorded. */
export async function loadRaw(take: TakeDetails) {
  const response = await fetch(url(take, true));
  if (!response.ok) throw new Error(`No raw audio for "${take.name}".`);
  return decodeAudio(await response.arrayBuffer());
}

const wavOf = (samples: Float32Array, rate: number) =>
  new Blob([encodeWav([samples], rate)], { type: 'audio/wav' });

/**
 * Tunes the raw take and keeps both: `name.wav` and `name.raw.wav`.
 * Returns the saved take, already playable as `s(name)`.
 */
export async function saveTake(input: {
  name: string;
  raw: Float32Array;
  rate: number;
  tune: TuneOptions;
  /** Already tuned (what was listened to), to skip tuning again. */
  tuned?: Float32Array;
}) {
  const name = takeNameOf(input.name);
  if (!name) throw new Error('A take needs a name.');
  const tuned = input.tuned ?? tuneTake(input.raw, input.rate, input.tune);
  const { take } = (await request(`/takes/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input.tune,
      seconds: Math.round((input.raw.length / input.rate) * 100) / 100,
      raw: await base64Of(wavOf(input.raw, input.rate)),
      tuned: await base64Of(wavOf(tuned, input.rate)),
    }),
  })) as { take: TakeDetails };
  useTakes.setState({
    takes: [take, ...listTakes().filter((t) => t.name !== name)],
    available: true,
  });
  await register([take]);
  return take;
}

export async function deleteTake(name: string) {
  await request(`/takes/${name}`, { method: 'DELETE' });
  useTakes.setState({ takes: listTakes().filter((t) => t.name !== name) });
}

const findTake = (name: string) => {
  const take = listTakes().find((t) => t.name === name);
  if (!take) throw new Error(`No take named "${name}".`);
  return take;
};

/** Tunes a kept take again from its raw recording. */
export async function retuneTake(name: string, change: Partial<TuneOptions>) {
  const take = findTake(name);
  const { samples: raw, rate } = await loadRaw(take);
  return saveTake({
    name,
    raw,
    rate,
    tune: {
      amount: change.amount ?? take.amount,
      key: change.key ?? take.key,
      scale: change.scale ?? take.scale,
    },
  });
}

/** A sound file (base64) becomes a take, tuned like a recorded one. */
export async function importTake(input: {
  name: string;
  base64: string;
  tune: TuneOptions;
  trim?: boolean;
}) {
  const bytes = bytesOf(input.base64);
  const decoded = await decodeAudio(bytes.buffer);
  const raw =
    input.trim === false
      ? decoded.samples
      : trimSilence(decoded.samples, decoded.rate);
  return saveTake({
    name: input.name,
    raw,
    rate: decoded.rate,
    tune: input.tune,
  });
}

let playing: AudioBufferSourceNode | undefined;

/** Plays audio once (listening before saving); stops what played before. */
export function playSamples(samples: Float32Array, rate: number) {
  stopSamples();
  const context = audioContext();
  void context.resume();
  const buffer = context.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  playing = source;
  source.onended = () => {
    if (playing === source) playing = undefined;
  };
}

export function stopSamples() {
  try {
    playing?.stop();
  } catch {
    // Already ended.
  }
  playing = undefined;
}
