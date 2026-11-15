import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import { parseProgram } from './parse';
import { flatten } from './compile';
import { emitLine, emitProgram, isAudible } from './emit';

const parse = (code: string) => {
  const result = parseProgram(code);
  if (!result.ok) throw new Error(result.error);
  return result.program;
};
const nodes = (code: string) =>
  parse(code).lines.map((line) =>
    flatten(line.sink)
      .reverse()
      .map((node) => `${node.type}${node.data.disabled ? ' (off)' : ''}`),
  );
const program = (code: string) => ({ cpm: '120', bpc: '4', ...parse(code) });

describe('disabled nodes are commented-out code', () => {
  const effect = 'kick: s("bd*4")\n  // .lpf(800)\n  .gain(0.5)';

  it('reads a commented-out call as a disabled node, in its place', () => {
    expect(nodes(effect)).toEqual([
      ['sound-node', 'lpf-node (off)', 'level-node'],
    ]);
    expect(emitLine(parse(effect).lines[0])).toBe(effect);
  });

  it('plays as if the disabled node were not there', () => {
    const [line] = parse(effect).lines;
    const code = emitLine(line).replace(/^kick:\s*/, '');
    expect(haps(code)).toEqual(haps('s("bd*4").gain(0.5)'));
  });

  it('reads a commented-out line as a disabled line', () => {
    const code =
      'kick: s("bd")\n\n// hat: s("hh*8")\n//   // .lpf(800)\n//   .gain(0.4)';
    expect(nodes(code)).toEqual([
      ['sound-node'],
      ['sound-node (off)', 'lpf-node (off)', 'level-node'],
    ]);
    const written = emitProgram(program(code));
    expect(written).toContain(
      '// hat: s("hh*8")\n//   // .lpf(800)\n//   .gain(0.4)',
    );
    expect(nodes(written)).toEqual(nodes(code));
  });

  it('keeps disabled lines in their place among the others', () => {
    const code = '// a: s("bd")\nb: s("sd")\n// c: s("hh")';
    expect(parse(code).lines.map((line) => line.label)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leaves prose comments alone', () => {
    const code =
      '// HATS: 15 closed hats then a gap\n// todo: fix\nkick: s("bd")';
    expect(nodes(code)).toEqual([['sound-node']]);
    expect(parse(code).prelude).toContain('// HATS: 15 closed hats');
  });

  it('a song with only disabled lines is silent', () => {
    expect(isAudible(program('// kick: s("bd")'))).toBe(false);
    expect(isAudible(program('kick: s("bd")'))).toBe(true);
  });
});
