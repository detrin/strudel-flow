import { defineNode } from '../../define-node';
import { PunchcardNode } from './punchcard-node';

export type PunchcardData = {
  kind?: '_punchcard' | '_pianoroll';
  /** strudel.cc's options for the inline view: `{width: 1400}`. */
  options?: string;
};

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
  parse: (calls) => {
    if (calls.length !== 1) return null;
    const [{ name, args }] = calls;
    const kind = name as PunchcardData['kind'];
    if (!args.length) return { kind, options: '' };
    return args.length === 1 && typeof args[0] === 'object'
      ? { kind, options: args[0].code }
      : null;
  },
  generate: ({ kind, options }) => `${kind ?? '_punchcard'}(${options ?? ''})`,
});
