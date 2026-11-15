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

  it('gives each part of a stack its own analyser instead of the line', () => {
    const code =
      'drums: stack(s("bd*4").hpf(100), s("hh*8").hpf(5000))\n  .room(0.2)';
    expect(tagAnalysers(code)).toBe(
      'drums: stack((s("bd*4").hpf(100)).analyze(\'flow_drums_0\'), ' +
        '(s("hh*8").hpf(5000)).analyze(\'flow_drums_1\'))\n  .room(0.2)',
    );
    expect(analyserIdOf('drums#0')).toBe('flow_drums_0');
    expect(analyserIdOf('drums#1')).toBe('flow_drums_1');
    expect(analyserIdOf('drums')).toBeUndefined();
  });

  it('tags parts that are plain strings or expressions too', () => {
    expect(tagAnalysers('d: stack("bd", s("hh"))')).toBe(
      'd: stack(("bd").analyze(\'flow_d_0\'), (s("hh")).analyze(\'flow_d_1\'))',
    );
  });
});
