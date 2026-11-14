import { defineNode } from '../../define-node';
import { PunchcardNode } from './punchcard-node';

export type PunchcardData = { kind?: '_punchcard' | '_pianoroll' };

/**
 * Shows what its line plays as a punchcard, on the canvas and under the
 * line in the code (`._punchcard()`, as on strudel.cc).
 */
export default defineNode({
  id: 'punchcard-node',
  title: 'Punchcard',
  category: 'Audio Effects',
  icon: 'ChartNoAxesGantt',
  order: 1,
  parameters: {},
  defaults: { kind: '_punchcard' } as PunchcardData,
  component: PunchcardNode,
  methods: ['_punchcard', '_pianoroll'],
  ordered: true,
  parse: (calls) =>
    calls.length === 1 && calls[0].args.length === 0
      ? { kind: calls[0].name as PunchcardData['kind'] }
      : null,
  generate: ({ kind }) => `${kind ?? '_punchcard'}()`,
});
