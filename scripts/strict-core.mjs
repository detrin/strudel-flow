#!/usr/bin/env node
// The core (how code becomes the song and back, commands, the model, the
// save format, the engine) is checked with noUncheckedIndexedAccess: an
// array or map lookup may be missing, and the code must say what then
// (`must(…)` for what can't be missing). The rest of the app isn't yet.
// Part of `pnpm check`.
import { spawnSync } from 'node:child_process';

const CORE =
  /^src\/lib\/(program\/(parse|emit|reconcile|layout-comments|syntax|compile|merge|groups|index)|commands|song|save-format|engine|strudel-internals|must)\.ts\(/;

const result = spawnSync(
  'pnpm',
  ['exec', 'tsc', '--noEmit', '-p', '.', '--noUncheckedIndexedAccess'],
  { encoding: 'utf8' },
);
const errors = `${result.stdout}${result.stderr}`
  .split('\n')
  .filter((line) => CORE.test(line));
if (errors.length) {
  console.error('Unchecked lookups in the core:');
  for (const line of errors) console.error(`  ${line}`);
  process.exit(1);
}
console.log('Core lookups are all checked.');
