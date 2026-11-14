import { defineNode } from '../../define-node';
import { SynthSelectNode } from './synth-select-node';
import { parseSound, soundCode, type SoundData } from '../sound';

export default defineNode({
  id: 'synth-select-node',
  title: 'Voice',
  category: 'Synths',
  icon: 'CheckCheck',
  order: 9,
  parameters: {},
  defaults: {} as SoundData,
  component: SynthSelectNode,
  generate: soundCode,
  methods: ['sound'],
  parse: parseSound(() => true),
});
