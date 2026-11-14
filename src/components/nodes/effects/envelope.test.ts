import { describe, expect, it } from 'vitest';
import { getADSRValues } from '@strudel/web';
import { effectiveAdsr, type Adsr } from './envelope';

const UNSET: Adsr = [0.005, 0.14, 0, 0.1];
const options = [undefined, 0, 0.0005, 0.3, 1.5];

describe('effectiveAdsr', () => {
  it("matches Strudel's getADSRValues for every partial envelope", () => {
    for (const a of options)
      for (const d of options)
        for (const s of options)
          for (const r of options) {
            const values = [a, d, s, r] as [number?, number?, number?, number?];
            expect(effectiveAdsr(values, UNSET)).toEqual(
              getADSRValues(values, 'linear', UNSET),
            );
          }
  });
});
