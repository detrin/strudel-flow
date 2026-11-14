import { defineNode } from '../../define-node';
import { ArrangeNode } from './arrange-node';
import { generateArrange, parseArrange, type ArrangeData } from './arrange';

/** Song structure: which bars a line plays (`.mask("<1!8 0!8>")`). */
export default defineNode({
  id: 'arrange-node',
  title: 'Arrange',
  category: 'Audio Effects',
  icon: 'LayoutList',
  order: 0,
  parameters: {},
  defaults: { bars: '11110000' } as ArrangeData,
  methods: ['mask'],
  parse: parseArrange,
  generate: generateArrange,
  component: ArrangeNode,
});
