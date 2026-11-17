import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as strudel from '@strudel/web';
import { STRUDEL_VERSION } from './strudel-internals';

describe("Strudel's internals", () => {
  it('are used against the version they were checked with', () => {
    const { version } = JSON.parse(
      readFileSync('node_modules/@strudel/web/package.json', 'utf8'),
    ) as { version: string };
    // A new Strudel: check src/lib/strudel-internals.ts (and what it
    // wraps) still holds, then update STRUDEL_VERSION.
    expect(version).toBe(STRUDEL_VERSION);
  });

  it('are all still exported', () => {
    for (const name of [
      'analysers',
      'getAudioContext',
      'getSuperdoughAudioController',
      'loadWorklets',
      'resetGlobalEffects',
      'soundMap',
      'superdough',
    ])
      expect(strudel, name).toHaveProperty(name);
  });
});
