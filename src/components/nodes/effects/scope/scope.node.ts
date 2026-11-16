import { defineNode } from '../../define-node';
import { ScopeNode } from './scope-node';
import { analyserOf, type ScopeData } from './scope';

export default defineNode({
  id: 'scope-node',
  title: 'Scope',
  category: 'Audio Effects',
  icon: 'Activity',
  order: 0,
  parameters: {},
  defaults: {} as ScopeData,
  component: ScopeNode,
  generate: (values, { id }) =>
    `analyze(${JSON.stringify(analyserOf(id, values))})`,
  methods: ['analyze'],
  // The id stays as written: a reopened song keeps its code.
  parse: ([call]) =>
    typeof call?.args[0] === 'string' ? { analyser: call.args[0] } : {},
});
