import { DRUM_MACHINES } from '@/data/samples';

/**
 * Kinds and tags for Strudel's sounds. Strudel keeps no genre or category
 * data, so tags come from what names reliably tell: drum machine banks
 * (`RolandTR808_bd`), General MIDI instruments (`gm_slap_bass_1`) and the
 * usual drum abbreviations (bd, sd, hh…). People add their own on top.
 */

export type SoundKind = 'drum machine' | 'sample' | 'instrument' | 'synth';
export const KINDS: readonly SoundKind[] = [
  'drum machine',
  'sample',
  'instrument',
  'synth',
];

type SoundData = { type?: string; samples?: unknown };

const BANKS = new Set(DRUM_MACHINES.map((bank) => bank.toLowerCase()));
/** The drum machine a sound belongs to (`RolandTR808_bd` → RolandTR808). */
export function bankOf(name: string) {
  const at = name.lastIndexOf('_');
  if (at <= 0) return undefined;
  const bank = name.slice(0, at);
  return BANKS.has(bank.toLowerCase()) ? bank : undefined;
}

export function kindOf(name: string, data: SoundData = {}): SoundKind {
  if (data.type === 'synth' || data.type === 'wavetable') return 'synth';
  if (data.type === 'soundfont' || name.startsWith('gm_')) return 'instrument';
  if (bankOf(name)) return 'drum machine';
  return 'sample';
}

/** Drum abbreviations, as the drum machines and Dirt-Samples use them. */
const DRUMS: Record<string, string[]> = {
  bd: ['drums', 'kick'],
  sd: ['drums', 'snare'],
  rim: ['drums', 'snare'],
  cp: ['drums', 'clap'],
  hh: ['drums', 'hats'],
  oh: ['drums', 'hats'],
  cr: ['drums', 'cymbal'],
  rd: ['drums', 'cymbal'],
  lt: ['drums', 'toms'],
  mt: ['drums', 'toms'],
  ht: ['drums', 'toms'],
  cb: ['drums', 'percussion'],
  sh: ['drums', 'percussion'],
  tb: ['drums', 'percussion'],
  perc: ['drums', 'percussion'],
  misc: ['drums', 'percussion'],
  fx: ['fx'],
};

/** Words in names, and the tags they mean. First match per rule. */
const WORDS: [RegExp, string[]][] = [
  [/kick|^bd|bassdrum|808bd/, ['drums', 'kick']],
  [/snare|^sd/, ['drums', 'snare']],
  [/drum/, ['drums']],
  [/clap/, ['drums', 'clap']],
  [/hat|^hh|^oh/, ['drums', 'hats']],
  [/cymbal|crash|ride/, ['drums', 'cymbal']],
  [/tom/, ['drums', 'toms']],
  [/break|amen|jungle/, ['drums', 'breaks']],
  [
    /perc|conga|bongo|tabla|mridangam|cowbell|shaker|tambourine|clave|timbale|taiko|woodblock|agogo|cuica|guiro/,
    ['drums', 'percussion'],
  ],
  [/bass(?!oon|drum)/, ['bass']],
  [/piano|epiano|rhodes|harpsichord|clavinet|clav\b/, ['keys']],
  [/organ|accordion|harmonica/, ['keys', 'organ']],
  [/guitar|sitar|banjo|shamisen|koto|harp\b|ukulele/, ['guitar & plucked']],
  [/violin|viola|cello|string|orchestra|pizzicato|tremolo/, ['strings']],
  [
    /choir|voice|vox|vocal|speech|mouth|numbers|alphabet|diphone|yeah|hmm|sing/,
    ['vocals'],
  ],
  [/trumpet|trombone|tuba|horn|brass/, ['brass']],
  [
    /sax|oboe|clarinet|bassoon|flute|piccolo|recorder|whistle|ocarina|shanai|bag_?pipe/,
    ['winds'],
  ],
  [
    /marimba|xylophone|vibraphone|glockenspiel|celesta|music_box|kalimba|tubular|steel_drum|dulcimer|tinkle|bell/,
    ['mallets & bells'],
  ],
  [/lead/, ['lead']],
  [/pad/, ['pad']],
  [/arp/, ['arp']],
  [/noise|white|pink|brown|crackle/, ['noise']],
  [
    /fx|effect|sweep|riser|rain|seashore|bird|telephone|helicopter|applause|gunshot|breath|fret_noise|scratch|glitch/,
    ['fx'],
  ],
];

/** Tags a sound's name implies; sorted, without duplicates. */
export function autoTags(name: string, data: SoundData = {}): string[] {
  const tags = new Set<string>();
  const kind = kindOf(name, data);
  const lower = name.toLowerCase();
  if (kind === 'synth') tags.add('synth');
  const bank = bankOf(name);
  const word = bank ? lower.slice(bank.length + 1) : lower.replace(/^gm_/, '');
  if (bank) tags.add('drums');
  const drum = DRUMS[word.replace(/\d+$/, '')];
  if (drum) drum.forEach((tag) => tags.add(tag));
  else
    for (const [pattern, implied] of WORDS)
      if (pattern.test(word)) implied.forEach((tag) => tags.add(tag));
  if (
    kind === 'synth' &&
    /saw|square|tri|sine|pulse|supersaw|sbd|zzfx/.test(word)
  )
    tags.add('oscillator');
  return [...tags].sort();
}

/** Number of sample files (variants, `n`) a sound has. */
export function variantsOf(data: SoundData = {}) {
  const { samples } = data;
  if (Array.isArray(samples)) return samples.length;
  if (samples && typeof samples === 'object')
    return Object.keys(samples).length;
  return 0;
}
