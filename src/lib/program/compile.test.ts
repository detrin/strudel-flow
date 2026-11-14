import { describe, expect, it } from 'vitest';
import { chainOf, node, wire } from '@/test/graph';
import { compileGraph } from './compile';
import { emitProgram } from './emit';

const tempo = { cpm: '120', bpc: '4', prelude: '' };
const code = (...args: Parameters<typeof compileGraph>) =>
  emitProgram(compileGraph(...args));
const kick = (id = 'k', y = 0) =>
  node('custom-node', id, { customPattern: 's("bd*4")' }, { x: 0, y });

describe('compileGraph + emitProgram', () => {
  it('writes tempo and one line per sink', () => {
    expect(code([kick()], [], tempo)).toBe(
      'setcpm(120/4)\n\n// @layout 0,0\n$: s("bd*4")\n',
    );
  });

  it('applies effects in wire order, not node order', () => {
    const nodes = [
      node('level-node', 'g', { gain: '0.5' }),
      kick(),
      node('lpf-node', 'f', { cutoff: '800' }),
    ];
    expect(code(nodes, chainOf('k', 'f', 'g'), tempo)).toContain(
      '$: s("bd*4")\n  .lpf(800)\n  .gain(0.5)',
    );
  });

  it('stacks inputs that fan into one node, top to bottom', () => {
    const nodes = [
      kick('a', 100),
      node('custom-node', 'b', { customPattern: 's("hh*8")' }, { x: 0, y: 0 }),
      node('level-node', 'g', { gain: '0.8' }),
    ];
    expect(code(nodes, [wire('a', 'g'), wire('b', 'g')], tempo)).toContain(
      '$: stack(s("hh*8"), s("bd*4"))\n  .gain(0.8)',
    );
  });

  it('stacks an instrument with its upstream chain', () => {
    const nodes = [
      kick(),
      node('lpf-node', 'f', { cutoff: '800' }),
      node('custom-node', 'b', { customPattern: 'note("c")' }),
    ];
    expect(code(nodes, chainOf('k', 'f', 'b'), tempo)).toContain(
      '$: stack(s("bd*4").lpf(800), note("c"))',
    );
  });

  it('orders lines by canvas position', () => {
    const nodes = [kick('low', 300), kick('high', 0)];
    nodes[1].data.customPattern = 's("hh")';
    expect(code(nodes, [], tempo)).toMatch(/hh[\s\S]*bd/);
  });

  it('skips chains without a sound source', () => {
    expect(code([node('lpf-node', 'f')], [], tempo)).toBe('setcpm(120/4)\n');
  });

  it('wraps Code that is more than a call in parentheses', () => {
    const nodes = [
      node('custom-node', 'k', { customPattern: 's("bd").fast(2)' }),
      node('level-node', 'g'),
    ];
    expect(code(nodes, chainOf('k', 'g'), tempo)).toContain(
      '$: (s("bd").fast(2))\n  .gain(0.8)',
    );
  });

  it('writes labels and mutes with Strudel label syntax', () => {
    const nodes = [kick()];
    nodes[0].data = { ...nodes[0].data, label: 'kick', state: 'paused' };
    expect(code(nodes, [], tempo)).toContain('_kick: s("bd*4")');
  });

  it('keeps an effect at its defaults visible in the code', () => {
    expect(
      code([kick(), node('room-node', 'r')], chainOf('k', 'r'), tempo),
    ).toContain('.room(0.3)');
  });

  it('ignores wires that close a cycle', () => {
    const nodes = [kick(), node('level-node', 'g')];
    const edges = [...chainOf('k', 'g'), wire('g', 'k')];
    expect(() => code(nodes, edges, tempo)).not.toThrow();
  });

  it('keeps the prelude verbatim after the tempo', () => {
    expect(
      code([kick()], [], { ...tempo, prelude: "samples('github:x/y')" }),
    ).toMatch(
      /^setcpm\(120\/4\)\nsamples\('github:x\/y'\)\n\n\/\/ @layout 0,0\n\$:/,
    );
  });
});
