import { describe, expect, it } from 'vitest';
import { parseProgram } from '@/lib/program/parse';
import { flatten } from '@/lib/program/compile';
import { locateNode } from './node-location';

const ids = (code: string) => {
  const result = parseProgram(code);
  if (!result.ok) throw new Error(result.error);
  let n = 0;
  for (const line of result.program.lines)
    for (const node of flatten(line.sink)) node.id ??= `n${n++}`;
  return result.program;
};
const text = (code: string, type: string) => {
  const program = ids(code);
  const node = program.lines
    .flatMap((line) => flatten(line.sink))
    .find((n) => n.type === type)!;
  const at = locateNode(code, program, node.id!);
  return at && code.slice(at.from, at.to);
};

describe('locating a node in the code', () => {
  const code = [
    '// my song',
    'kick: s("bd*4")',
    '  .lpf(800).lpq(4)',
    '  .gain(0.5) // loud',
    '',
    'hat: s("hh*8").o(2)',
  ].join('\n');

  it('finds a source and its effects in its line', () => {
    expect(text(code, 'sound-node')).toBe('s("bd*4")');
    expect(text(code, 'lpf-node')).toBe('lpf(800).lpq(4)');
    expect(text(code, 'level-node')).toBe('gain(0.5)');
  });

  it('reads aliases as written', () => {
    expect(text(code, 'output-node')).toBe('o(2)');
  });
});
