/**
 * A progression in the song: the two lines that play it (supersaw chords,
 * a sine root bass), a preview of it alone at the song's tempo, and adding
 * it to the song.
 */
import { useAppStore } from '@/store/app-store';
import { addLine } from '@/lib/library/insert';
import { PROGRESSIONS, type Progression } from '@/data/progressions';
import { realize, type Bars, type Realized, type Technique } from './theory';

export const TECHNIQUE_IDS: Technique[] = [
  'resolve',
  'mario',
  'borrow-iv',
  'pedal',
  'faster',
  'colour',
  'key-up',
];

/** Bars from text: "I II IV bVI", a bar of two chords as "bVI+bVII". */
export function parseBars(text: string): Bars {
  const bars = text
    .split(/[\s|–-]+/)
    .filter(Boolean)
    .map((bar) => bar.split('+').filter(Boolean));
  if (!bars.length) throw new Error('A progression needs chords.');
  return bars;
}

export function findProgression(id: string): Progression {
  const found = PROGRESSIONS.find(
    (p) => p.id === id || p.name.toLowerCase() === id.toLowerCase(),
  );
  if (!found) throw new Error(`No progression "${id}".`);
  return found;
}

export function progressionLines(realized: Realized) {
  return [
    {
      label: 'chords',
      body: `note("${realized.chords}").sound("supersaw").attack(0.02).release(0.3).lpf(3000).gain(0.35).room(0.3)`,
    },
    {
      label: 'roots',
      body: `note("${realized.bass}").sound("sine").attack(0.005).release(0.1).gain(0.7)`,
    },
  ];
}

/** The preview's id: one per progression, key and techniques. */
export const previewId = (key: string, bars: Bars, techniques: Technique[]) =>
  `chords:${key}:${JSON.stringify(bars)}:${techniques.join(',')}`;

/** Plays the progression alone at the song's tempo, or stops it. */
export function togglePreviewProgression(
  key: string,
  bars: Bars,
  techniques: Technique[],
) {
  const state = useAppStore.getState();
  const id = previewId(key, bars, techniques);
  if (state.preview?.id === id) {
    useAppStore.setState({ preview: null });
    return false;
  }
  const lines = progressionLines(realize(bars, key, techniques));
  const code = [
    `setcpm(${state.cpm}/${state.bpc})`,
    ...lines.map((line) => `${line.label}: ${line.body}`),
  ].join('\n');
  useAppStore.setState({ preview: { id, code }, error: null });
  return true;
}

/** Adds the progression's lines to the song; returns their labels. */
export function insertProgression(
  key: string,
  bars: Bars,
  techniques: Technique[],
) {
  return progressionLines(realize(bars, key, techniques)).map((line) =>
    addLine(line),
  );
}
