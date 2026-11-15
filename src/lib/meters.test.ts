import { describe, expect, it } from 'vitest';
import { analyserIdOf, tagAnalysers } from './meters';

describe('tagAnalysers', () => {
  it('gives every playing line its own analyser, after its last code', () => {
    const code = [
      'setcpm(120/4)',
      'kick: s("bd*4")',
      '  .gain(0.5)',
      '  // .lpf(800)',
      '_hat: s("hh*8")',
      '// off: s("cp")',
      '$: note("c e")',
    ].join('\n');
    expect(tagAnalysers(code).split('\n')).toEqual([
      'setcpm(120/4)',
      'kick: s("bd*4")',
      "  .gain(0.5).analyze('flow_kick')",
      '  // .lpf(800)',
      `_hat: s("hh*8").analyze('flow_hat')`,
      '// off: s("cp")',
      `$: note("c e").analyze('flow__0')`,
    ]);
    expect(analyserIdOf('kick')).toBe('flow_kick');
  });

  it("keeps a line's own analyser (a Scope node)", () => {
    const code = 'acid: note("c2").analyze("acid-scope")';
    expect(tagAnalysers(code)).toBe(code);
    expect(analyserIdOf('acid')).toBe('acid-scope');
  });
});
