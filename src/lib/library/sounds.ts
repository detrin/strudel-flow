import { useEffect, useState } from 'react';
import { getAudioContext, soundMap, superdough } from '@strudel/web';
import { autoTags, kindOf, variantsOf, type SoundKind } from './sound-tags';

export type Sound = {
  name: string;
  kind: SoundKind;
  variants: number;
  tags: string[];
};

/** Names Strudel registers for itself, not for playing. */
const HIDDEN = /^(_|tri$|sqr$|sin$|saw$)/;

function readSounds(): Sound[] {
  return Object.entries(soundMap.get())
    .filter(([name]) => !HIDDEN.test(name))
    .map(([name, { data = {} }]) => ({
      name,
      kind: kindOf(name, data),
      variants: variantsOf(data),
      tags: autoTags(name, data),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every sound Strudel knows, updated as sample packs finish loading. */
export function useSounds() {
  const [sounds, setSounds] = useState(readSounds);
  useEffect(() => {
    // Packs register thousands of names one by one: update once they settle.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = soundMap.listen(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setSounds(readSounds()), 300);
    });
    setSounds(readSounds());
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);
  return sounds;
}

/** Seconds a pitched preview (instrument, synth) lasts. */
const PITCHED = 0.8;

/** The first file of a sample, as a URL (undefined for synths). */
function sampleUrl(name: string) {
  const data = soundMap.get()[name]?.data as
    { samples?: unknown; baseUrl?: string } | undefined;
  const { samples } = data ?? {};
  const first = Array.isArray(samples)
    ? samples[0]
    : samples && typeof samples === 'object'
      ? Object.values(samples)[0]
      : undefined;
  const file = Array.isArray(first) ? first[0] : first;
  if (typeof file !== 'string') return undefined;
  return /^(https?:|data:|blob:)/.test(file)
    ? file
    : `${data?.baseUrl ?? ''}${file}`;
}

const lengths = new Map<string, number>();
/** Sounds already fetched by Strudel. */
const loaded = new Set<string>();
/** How long a sample plays, read from its file (the browser caches it). */
async function lengthOf(name: string) {
  const known = lengths.get(name);
  if (known) return known;
  const url = sampleUrl(name);
  if (!url) return 1;
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    const buffer = await getAudioContext().decodeAudioData(bytes);
    lengths.set(name, buffer.duration);
    return buffer.duration;
  } catch {
    return 1;
  }
}

/**
 * Plays a sound once (a pitched one at C3), for listening before using.
 * Resolves when it starts, with how many seconds it plays.
 */
export async function previewSound(sound: Sound) {
  const context = getAudioContext();
  await context.resume();
  const pitched = sound.kind === 'instrument' || sound.kind === 'synth';
  const value = { s: sound.name, n: 0, ...(pitched ? { note: 48 } : {}) };
  const duration = pitched ? PITCHED : 0.5;
  // Strudel fetches a sound the first time it plays, and drops it if that
  // takes past its start time: so load it silently first, then play.
  if (!loaded.has(sound.name)) {
    await superdough(
      { ...value, gain: 0 },
      context.currentTime + 0.01,
      duration,
    );
    loaded.add(sound.name);
  }
  const [seconds] = await Promise.all([
    pitched ? PITCHED : lengthOf(sound.name),
    superdough({ ...value, gain: 0.8 }, context.currentTime + 0.05, duration),
  ]);
  return Math.min(seconds, 30);
}

/** Code for a new line playing a sound. */
export const lineFor = (sound: Sound) =>
  sound.kind === 'instrument' || sound.kind === 'synth'
    ? `note("c3 e3 g3 c4").s("${sound.name}")`
    : sound.kind === 'drum machine' || sound.tags.includes('drums')
      ? `s("${sound.name}*4")`
      : `s("${sound.name}")`;

/** A registered sound's tags (none for a name Strudel doesn't know). */
export function tagsOfSound(name: string) {
  const entry = soundMap.get()[name.toLowerCase()];
  return entry ? autoTags(name, entry.data) : [];
}
