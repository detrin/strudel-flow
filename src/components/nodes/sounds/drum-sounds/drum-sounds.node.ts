import { defineNode } from '../../define-node';
import { DrumSoundsNode } from './drum-sounds-node';
import { generatePattern, type DrumSoundsData } from './drum-sounds';
import { parseSound } from '../parse-sound';
import { DRUM_CATEGORIES } from '@/data/sounds';

const DRUM_SOUNDS = new Set(
  DRUM_CATEGORIES.flatMap((category) => category.options),
);

export default defineNode({
  id: 'drum-sounds-node',
  title: 'Drums',
  category: 'Synths',
  icon: 'Music',
  order: 8,
  parameters: {},
  defaults: {} as DrumSoundsData,
  component: DrumSoundsNode,
  generate: generatePattern,
  methods: ['sound'],
  // Drum names go to Drums; every other sound to Voice.
  parse: parseSound((sound) => DRUM_SOUNDS.has(sound)),
});
