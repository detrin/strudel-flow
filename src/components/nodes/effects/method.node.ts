import { defineNode } from '../define-node';
import { methodNames } from '@/lib/program/syntax';

/**
 * Raw method calls the other nodes don't model, e.g. `scale("C:minor")`.
 * The parser creates these, so code with any method stays editable.
 */
export default defineNode({
  id: 'method-node',
  title: 'Method',
  category: 'Audio Effects',
  icon: 'Braces',
  order: 30,
  parameters: {
    calls: { control: 'text', label: '.calls', default: 'fast(2)' },
  },
  methods: [],
  parse: () => null,
  generate: ({ calls }) => {
    const text = calls.trim().replace(/^\./, '');
    return methodNames(text) ? text : '';
  },
});
