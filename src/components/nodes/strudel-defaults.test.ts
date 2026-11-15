import { describe, expect, it } from 'vitest';
import { implicitOf, methodOf } from './define-node';
import { nodeDefinitions } from './registry';

/**
 * What Strudel (superdough 1.2) uses when a control is not set: its
 * default table, plus the reverb's own defaults. A parameter left out of
 * the code must mean the same value in the node, or the knobs would show
 * something other than what plays.
 */
const STRUDEL = {
  gain: 0.8,
  postgain: 1,
  pan: 0.5,
  lpq: 1,
  hpq: 1,
  phaser: 0,
  phaserdepth: 0.75,
  delay: 0,
  delaytime: 0.25,
  delayfeedback: 0.5,
  room: 0,
  rsize: 2,
  rfade: 0.1,
  rlp: 15000,
  rdim: 1000,
  distort: 0,
  fm: 0,
  lpenv: 0,
  hpenv: 0,
  shape: 0,
  velocity: 1,
  fmh: 1,
  penv: 1,
  pcurve: 0,
  duckdepth: 1,
  duckattack: 0.1,
  duckonset: 0,
} as Record<string, number>;

const parameters = Object.values(nodeDefinitions).flatMap((definition) =>
  Object.entries(definition.parameters).map(([key, parameter]) => ({
    node: definition.id,
    method: methodOf(key, parameter),
    implicit: implicitOf(parameter),
  })),
);

describe('implicit values match Strudel', () => {
  it.each(parameters.filter(({ method }) => method in STRUDEL))(
    '$node .$method() defaults like Strudel',
    ({ method, implicit }) => {
      expect(implicit).toBe(STRUDEL[method]);
    },
  );
});
