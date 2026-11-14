import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { chainOf, node } from '@/test/graph';
import { compileGraph, flatten } from './compile';
import { emitLine, emitProgram } from './emit';
import { knownSources, parseProgram, type ParsedProgram } from './parse';

function parsed(code: string, known = knownSources([])): ParsedProgram {
  const result = parseProgram(code, known);
  if (!result.ok) throw new Error(result.error);
  return result.program;
}
const emit = (program: ParsedProgram) =>
  emitProgram({ cpm: '120', bpc: '4', ...program });
/** Node types of each line, upstream first. */
const types = (code: string) =>
  parsed(code).lines.map((line) =>
    flatten(line.sink)
      .map((node) => node.type)
      .reverse(),
  );
const expression = (line: string) => line.replace(/^_?[\w$]+: /, '');

describe('parseProgram', () => {
  it('turns known methods into nodes and keeps the source as Code', () => {
    expect(types('$: s("bd*4").gain(0.5).lpf(800).lpq(4)')).toEqual([
      ['custom-node', 'level-node', 'lpf-node'],
    ]);
  });

  it('keeps unknown methods as Method nodes, merging neighbours', () => {
    const program = parsed('$: n("0 2").scale("C:minor").ply(2).fast(2)');
    const [method] = flatten(program.lines[0].sink).filter(
      (node) => node.type === 'method-node',
    );
    expect(method.data.calls).toBe('scale("C:minor").ply(2)');
    expect(types('$: n("0 2").scale("C:minor").ply(2).fast(2)')).toEqual([
      ['custom-node', 'method-node', 'time-node'],
    ]);
  });

  it('never reorders calls to fit a node', () => {
    expect(types('$: s("bd").late(0.5).fast(2)')).toEqual([
      ['custom-node', 'time-node', 'time-node'],
    ]);
  });

  it('keeps values a node cannot hold as raw calls', () => {
    expect(types('$: s("bd").lpq(1)')).toEqual([
      ['custom-node', 'method-node'],
    ]);
    expect(types('$: s("bd").gain("<1 0.5>")')).toEqual([
      ['custom-node', 'method-node'],
    ]);
  });

  it('reads a filter in any order, with its envelope filled in like Strudel', () => {
    expect(types('$: s("bd").lpq(12).lpf(400)')).toEqual([
      ['custom-node', 'lpf-node'],
    ]);
    const [line] = parsed('$: note("c2").lpf(400).lpd(0.2)').lines;
    expect(line.sink).toMatchObject({
      type: 'lpf-node',
      data: {
        cutoff: '400',
        env: '1',
        attack: '0.001',
        decay: '0.2',
        sustain: '0.001',
        release: '0.01',
      },
    });
    expect(emitLine(line)).toBe(
      '$: note("c2")\n  .lpf(400).lpenv(1).lpattack(0.001).lpdecay(0.2).lpsustain(0.001).lprelease(0.01)',
    );
    expect(types('$: s("hh").hpf(3000).hpq(4)')).toEqual([
      ['custom-node', 'hpf-node'],
    ]);
  });

  it('understands Strudel aliases and routes sounds by name', () => {
    expect(types('$: n("0").s("sawtooth").cutoff(500)')).toEqual([
      ['custom-node', 'synth-select-node', 'lpf-node'],
    ]);
    expect(types('$: s("bd").struct("1 ~").s("hh")')).toEqual([
      ['custom-node', 'method-node', 'drum-sounds-node'],
    ]);
  });

  it('fans stack(...) into the first node after it, or a Mix', () => {
    expect(types('$: stack(s("bd"), s("hh").gain(0.5)).room(0.3)')).toEqual([
      ['custom-node', 'level-node', 'custom-node', 'room-node'],
    ]);
    expect(types('$: stack(s("bd"), s("hh"))')).toEqual([
      ['custom-node', 'custom-node', 'mix-node'],
    ]);
  });

  it('reads labels, mutes and tempo', () => {
    const program = parsed('setcpm(132/4)\nkick: s("bd*4")\n_hat: s("hh*8")');
    expect(program).toMatchObject({ cpm: '132', bpc: '4' });
    expect(program.lines.map(({ label, muted }) => [label, muted])).toEqual([
      ['kick', false],
      ['hat', true],
    ]);
    expect(program.lines[1].sink.data).toMatchObject({
      label: 'hat',
      state: 'paused',
    });
    expect(parsed('setcps(0.5)\n$: s("bd")')).toMatchObject({
      cpm: '30',
      bpc: '1',
    });
  });

  it('keeps setup code and comments as the prelude', () => {
    const program = parsed(
      "// my song\nsamples('github:x/y')\nconst kick = s('bd')\n$: kick // inline\n",
    );
    expect(program.prelude).toBe(
      "// my song\nsamples('github:x/y')\nconst kick = s('bd')",
    );
    expect(types("const kick = s('bd')\n$: kick")).toEqual([['custom-node']]);
  });

  it('plays a trailing bare expression like Strudel does', () => {
    expect(types('samples("x")\nnote("c e").lpf(500)')).toEqual([
      ['custom-node', 'lpf-node'],
    ]);
  });

  it('reports syntax errors instead of throwing', () => {
    expect(parseProgram('$: s("bd"').ok).toBe(false);
  });
});

const corpus = [
  '$: s("bd*4").gain(0.8)',
  '$: s("bd*4").bank("RolandTR909").gain(1.2).lpf(4000)',
  '$: note("c2 [eb2 g2]").s("sawtooth").lpf(400).lpq(12).room(0.3).rsize(4)',
  '$: n("0 2 4 <6 7>").scale("C:minor").s("triangle").late(0.25).fast(2).rev()',
  '$: stack(s("hh*8").gain(0.4), s("~ cp").room(0.5)).pan(0.3)',
  '$: s("bd").attack(0.01).decay(0.2).sustain(0).release(0.1).crush(8)',
  '$: s("sd*2").phaser(2).phaserdepth(0.7).distort(0.5)',
  '$: note("c3").s("sine").every(2, rev).palindrome()',
  '$: (note("c e g").s("piano")).gain(0.5)',
];

describe('round trips', () => {
  it.each(corpus)('%s is stable under parse → emit', (code) => {
    const once = emit(parsed(code));
    expect(emit(parsed(once))).toBe(once);
  });

  it.each(corpus)('%s sounds the same after parse → emit', (code) => {
    const [line] = parsed(code).lines;
    expect(haps(expression(emitLine(line)))).toEqual(haps(expression(code)));
  });

  it('keeps instrument nodes and ids when the code is re-read', () => {
    const nodes = [
      node('pad-node', 'pad', {}, { x: 0, y: 0 }),
      node('synth-select-node', 'voice', { sound: 'triangle' }),
      node(
        'beat-machine-node',
        'beat',
        {
          rows: [{ instrument: 'bd', pattern: [true, false, true, false] }],
          steps: 4,
        },
        { x: 0, y: 300 },
      ),
      node('chord-node', 'chord', {}, { x: 0, y: 600 }),
    ];
    nodes[0].data.grid = nodes[0].data.grid ?? [[true]];
    const program = compileGraph(nodes, chainOf('pad', 'voice'), {
      cpm: '120',
      bpc: '4',
      prelude: '',
    });
    const code = emitProgram(program);
    const reread = parsed(code, knownSources(nodes));
    // Sources keep their ids here; effects get theirs in reconcile.
    const summary = (lines: typeof program.lines) =>
      lines.map((line) =>
        flatten(line.sink).map(({ id, type }) =>
          type === 'synth-select-node' ? type : `${type}#${id}`,
        ),
      );
    expect(summary(reread.lines)).toEqual(summary(program.lines));
    expect(emit(reread)).toBe(code);
  });
});

describe('node contract', () => {
  const effects = Object.values(nodeDefinitions).filter(
    (definition) =>
      !isSource(definition) &&
      !['method-node', 'mix-node'].includes(definition.id),
  );
  it.each(effects.map((definition) => [definition.id, definition] as const))(
    '%s reads its own code back as itself',
    (id, definition) => {
      const data =
        id === 'synth-select-node' || id === 'drum-sounds-node'
          ? { sound: id === 'drum-sounds-node' ? 'bd' : 'sawtooth' }
          : definition.defaults;
      const calls = definition.generate(data, { id: 'x' });
      expect(calls).not.toBe('');
      const [line] = parsed(`$: s("bd").${calls}`).lines;
      expect(line.sink.type).toBe(id);
      expect(line.sink.inputs.map((input) => input.type)).toEqual([
        'custom-node',
      ]);
    },
  );
});
