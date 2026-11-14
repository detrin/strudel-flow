import { defineNode } from '../define-node';

/** Joins every wire into it with `stack(...)` and changes nothing else. */
export default defineNode({
  id: 'mix-node',
  title: 'Mix',
  category: 'Audio Effects',
  icon: 'Layers',
  order: 31,
  parameters: {},
  methods: [],
  parse: () => null,
  generate: () => '',
});
