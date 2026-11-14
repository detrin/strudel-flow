import { defineFilter } from './filter';

export default defineFilter({
  id: 'hpf-node',
  title: 'High-pass',
  prefix: 'hp',
  cutoff: 200,
  order: 11,
});
