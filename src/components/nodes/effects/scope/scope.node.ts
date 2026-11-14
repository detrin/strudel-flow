import { defineNode } from '../../define-node';
import { ScopeNode } from './scope-node';
import { scopeId, type ScopeData } from './scope';

export default defineNode({
  id: 'scope-node',
  title: 'Scope',
  category: 'Audio Effects',
  icon: 'Activity',
  order: 0,
  parameters: {},
  defaults: {} as ScopeData,
  component: ScopeNode,
  generate: (_values, { id }) => `analyze(${JSON.stringify(scopeId(id))})`,
});
