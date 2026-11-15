#!/usr/bin/env node
// pnpm survey <folder> [--json report.json]: how much of a folder of songs
// the canvas models with real nodes. Compare before and after a change.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const [folder, flag, out] = process.argv.slice(2);
if (!folder) {
  console.error('Usage: pnpm survey <folder of songs> [--json report.json]');
  process.exit(1);
}
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--config',
    'scripts/vitest.survey.config.ts',
    '--silent=false',
    '--reporter=dot',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SURVEY_DIR: resolve(folder),
      ...(flag === '--json' && out ? { SURVEY_OUT: resolve(out) } : {}),
    },
  },
);
process.exit(result.status ?? 1);
