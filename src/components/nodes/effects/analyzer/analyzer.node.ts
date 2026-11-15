import { defineNode } from '../../define-node';
import { AnalyzerNode, type AnalyzerData } from './analyzer-node';

/**
 * A closer look at what plays: a spectrogram (frequency over time) or the
 * loudness over the last bars, or the waveform, of its line or of the
 * whole mix. Writes strudel.cc's `._spectrum()` or `._scope()` (with its
 * options, if any); the view and source are settings of the node.
 */
export default defineNode({
  id: 'analyzer-node',
  title: 'Analyzer',
  category: 'Audio Effects',
  icon: 'AudioLines',
  order: 2,
  parameters: {},
  defaults: { inline: '_spectrum', source: 'line' } as AnalyzerData,
  component: AnalyzerNode,
  methods: ['_spectrum', '_scope'],
  ordered: true,
  parse: (calls) => {
    if (calls.length !== 1) return null;
    const [{ name, args }] = calls;
    const inline = name as AnalyzerData['inline'];
    if (!args.length) return { inline, options: '' };
    return args.length === 1 && typeof args[0] === 'object'
      ? { inline, options: args[0].code }
      : null;
  },
  generate: ({ inline, options }) =>
    `${inline ?? '_spectrum'}(${options ?? ''})`,
});
