import { defineNode } from '../../define-node';
import { AnalyzerNode, type AnalyzerData } from './analyzer-node';

/**
 * A closer look at what plays: a spectrogram (frequency over time) or the
 * loudness over the last bars, of its line or of the whole mix. Writes
 * strudel.cc's `._spectrum()`; the mode and source are view settings.
 */
export default defineNode({
  id: 'analyzer-node',
  title: 'Analyzer',
  category: 'Audio Effects',
  icon: 'AudioLines',
  order: 2,
  parameters: {},
  defaults: { mode: 'spectrogram', source: 'line' } as AnalyzerData,
  component: AnalyzerNode,
  methods: ['_spectrum'],
  ordered: true,
  parse: (calls) =>
    calls.length === 1 && calls[0].args.length === 0 ? {} : null,
  generate: () => '_spectrum()',
});
