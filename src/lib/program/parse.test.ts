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
      ['sound-node', 'level-node', 'lpf-node'],
    ]);
  });

  it('keeps unknown methods as Method nodes, merging neighbours', () => {
    const program = parsed('$: n("0 2").iter(4).swing(4).fast(2)');
    const [method] = flatten(program.lines[0].sink).filter(
      (node) => node.type === 'method-node',
    );
    expect(method.data.calls).toBe('iter(4).swing(4)');
    expect(types('$: n("0 2").iter(4).swing(4).fast(2)')).toEqual([
      ['notes-node', 'method-node', 'time-node'],
    ]);
  });

  it('never reorders calls to fit a node', () => {
    expect(types('$: s("bd").late(0.5).fast(2)')).toEqual([
      ['sound-node', 'time-node', 'time-node'],
    ]);
  });

  it('keeps values a node cannot hold as raw calls', () => {
    expect(types('$: s("bd").lpq(1)')).toEqual([['sound-node', 'method-node']]);
  });

  it('lets knobs hold patterns and expressions', () => {
    expect(types('$: s("bd").gain("<1 0.5>")')).toEqual([
      ['sound-node', 'level-node'],
    ]);
    const [line] = parsed(
      '$: s("bd").lpf("<400!4 800>").postgain(slider(0.5, 0, 1))',
    ).lines;
    const data = (type: string) =>
      flatten(line.sink).find((node) => node.type === type)?.data;
    expect(data('lpf-node')).toMatchObject({ cutoff: '"<400!4 800>"' });
    expect(data('level-node')).toMatchObject({ postgain: 'slider(0.5, 0, 1)' });
  });

  it('reads a filter in any order, with its envelope filled in like Strudel', () => {
    expect(types('$: s("bd").lpq(12).lpf(400)')).toEqual([
      ['sound-node', 'lpf-node'],
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
    // Only the stages that differ from what Strudel fills in are written.
    expect(emitLine(line)).toBe(
      '$: note("c2")\n  .lpf(400).lpenv(1).lpdecay(0.2)',
    );
    expect(types('$: s("hh").hpf(3000).hpq(4)')).toEqual([
      ['sound-node', 'hpf-node'],
    ]);
  });

  it('reads an LFO as Modulate, and never lets a Filter override it', () => {
    expect(
      types('$: s("bd").lpf(sine.range(200, 2000).slow(8)).lpq(12)'),
    ).toEqual([['sound-node', 'modulate-node', 'method-node']]);
  });

  it('understands Strudel aliases and routes sounds by name', () => {
    expect(types('$: n("0").s("sawtooth").cutoff(500)')).toEqual([
      ['notes-node', 'synth-select-node', 'lpf-node'],
    ]);
    expect(types('$: s("bd").struct("1 ~").s("hh")')).toEqual([
      ['sound-node', 'rhythm-node', 'drum-sounds-node'],
    ]);
  });

  it('fans stack(...) into the first node after it, or a Mix', () => {
    expect(types('$: stack(s("bd"), s("hh").gain(0.5)).room(0.3)')).toEqual([
      ['sound-node', 'level-node', 'sound-node', 'room-node'],
    ]);
    expect(types('$: stack(s("bd"), s("hh"))')).toEqual([
      ['sound-node', 'sound-node', 'mix-node'],
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

  it('reads layout comments into positions, not into the prelude', () => {
    const program = parsed(
      '// my song\n// @layout 1,2 3,4\nkick: s("bd").gain(1)\n',
    );
    expect(program.prelude).toBe('// my song');
    expect(flatten(program.lines[0].sink).map((n) => n.position)).toEqual([
      { x: 3, y: 4 },
      { x: 1, y: 2 },
    ]);
  });

  it('plays a trailing bare expression like Strudel does', () => {
    expect(types('samples("x")\nnote("c e").lpf(500)')).toEqual([
      ['notes-node', 'lpf-node'],
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
  '$: s("bd*4").lpf(sine.range(200, 2000).slow(4)).lpq(12)',
  '$: note("c2*8").s("saw").lpf(400).gain(perlin.range(0.6, 0.9))',
  '$: s("hh*16").mask("<1!3 0>").pan(saw.range(0, 1).slow(2))',
  '$: s("bd*4").slow(2).fast("<1 2>")',
  '$: note("c2").s("saw").shape(0.9).coarse("[8 8 [3 4] [6 7]]/4")',
  '$: s("hh*8").jux(rev).juxBy(0.5, press)',
  '$: s("bd*4").struct("x!7 ~ x!3 ~").segment(16)',
  '$: s("bd:4").penv(12).pcurve(2).pdec(1).duck("2").duckattack(0.12)',
  '$: s("breaks165").fit().slice(16, "0 1 <12 4> 3")',
  '$: s("breaks165").slice(8, irand(8).segment(8)).scrub("0.799 0.298")',
  '$: note("c e g").s("sine").fm(4).fmh(2).fmdecay(0.1).velocity(0.5)',
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

describe('nodes for what songs write', () => {
  it.each([
    ['$: s("bd").slow(2)', ['time-node']],
    ['$: s("bd").fast("<1 2>").slow(4)', ['time-node']],
    ['$: s("bd").shape(0.9).coarse(4).crush(8)', ['distortion-node']],
    ['$: s("bd").fm(2).fmh(1.5)', ['texture-node']],
    ['$: s("bd").jux(rev)', ['stereo-node']],
    ['$: s("bd").juxBy(0.5, iter(4))', ['stereo-node']],
    ['$: s("bd").struct(pick(beats, beat))', ['rhythm-node']],
    ['$: s("bd").seg(8)', ['rhythm-node']],
    ['$: s("bd").penv(12).pcurve(2).pdec(1)', ['pitch-envelope-node']],
    ['$: s("bd").duck(2).duckattack(0.12).duckdepth(0.7)', ['sidechain-node']],
    ['$: s("bd").duckorbit("2:3")', ['sidechain-node']],
    ['$: s("x").fit().slice(16, "0 1 2")', ['slice-node']],
    ['$: s("x").slice(64, "[0|8]*8".add(8))', ['slice-node']],
    ['$: s("x").striate("<2 8>").scrub(irand(16).div(16))', ['slice-node']],
    ['$: s("bd")._punchcard({width: 1400})', ['punchcard-node']],
    ['$: s("bd")._scope({height: 60})', ['analyzer-node']],
    ['$: s("bd").velocity(0.4)', ['level-node']],
  ])('%s', (code, effects) => {
    expect(types(code)).toEqual([['sound-node', ...effects]]);
    // Writes every call back (controls may come in another order) and
    // reads its own code back unchanged.
    const once = emit(parsed(code));
    const calls = (text: string) =>
      text
        .replace(/^.*?s\("[^"]*"\)/s, '')
        .replace(/\s+/g, '')
        .split(/\.(?=[a-zA-Z_]+\()/)
        .filter(Boolean)
        .sort();
    const canonical = code
      .replace('seg(', 'segment(')
      .replace('duckorbit(', 'duck(')
      .replace('pdec(', 'pdecay(');
    expect(calls(once)).toEqual(calls(canonical));
    expect(emit(parsed(once))).toBe(once);
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
        'sound-node',
      ]);
    },
  );
});

describe('Pad from code', () => {
  const DAVE =
    '$: n("[0,2,5] 4 [-2,2] ~ -2 [7,11] ~ 4 ~ -2 [3,9] ~ 10 [1,9] 10 [-1,1,5,9]").scale("A:major")';

  it('reads n("…").scale("…") as one Pad, writing the code back unchanged', () => {
    expect(types(`${DAVE}.sound("triangle").lpf(800)`)).toEqual([
      ['pad-node', 'synth-select-node', 'lpf-node'],
    ]);
    const program = parsed(DAVE);
    expect(expression(emit(program).trim().split('\n').at(-1)!)).toBe(
      expression(DAVE),
    );
    const [pad] = flatten(program.lines[0].sink);
    expect(pad.data).toMatchObject({
      division: 16,
      bars: 1,
      selectedKey: 'A',
      selectedScaleType: 'major',
      minOctave: -1,
      maxOctave: 1,
    });
    expect((pad.data.notes as unknown[]).length).toBe(21);
  });

  it('finds the loop length and the octave', () => {
    const [pad] = flatten(
      parsed('$: n("<0 2 4 [5,7]>*4").scale("C3:minor")').lines[0].sink,
    );
    expect(pad.type).toBe('pad-node');
    expect(pad.data).toMatchObject({ bars: 1, octave: 3, division: 16 });
    const [slow] = flatten(
      parsed('$: n("<0 2>").scale("C:major")').lines[0].sink,
    );
    expect(slow.data).toMatchObject({ bars: 2 });
    const phrase = Array.from({ length: 32 }, (_, i) => `[0 ${i % 5}]`);
    const [long] = flatten(
      parsed(`$: n("<${phrase.join(' ')}>").scale("C:major")`).lines[0].sink,
    );
    expect(long.type).toBe('pad-node');
    expect(long.data).toMatchObject({ bars: 32 });
    expect((long.data.notes as unknown[]).length).toBe(64);
  });

  it('leaves what a Pad cannot show to Notes and Pitch', () => {
    for (const code of [
      '$: n("0 2 4")', // no scale
      '$: n("0.5 2").scale("C:major")', // not whole degrees
      '$: n("0 2 4").scale("<C:major A:minor>")', // patterned scale
      '$: n("[0 1 2 3 4]*7").scale("C:major")', // no grid for it
      '$: n("0 <1 2 3>").scale("C:major")', // loops after 3 bars
      '$: n("40").scale("C:major")', // above the roll
    ])
      expect(types(code)[0][0], code).toBe('notes-node');
  });
});

describe('switching off one part of a stack', () => {
  const sources = (program: ParsedProgram) =>
    flatten(program.lines[0].sink).filter((node) =>
      isSource(nodeDefinitions[node.type]),
    );
  const lastLine = (program: ParsedProgram) =>
    emit(program).trim().split('\n\n').at(-1)!;

  it('ends that part with .hush(), and reads it back as off', () => {
    const program = parsed('d: stack(s("bd").gain(0.5), s("hh*8"))');
    const [kick] = sources(program).filter((n) => n.data.pattern === 'bd');
    kick.data.disabled = true;
    const code = lastLine(program);
    expect(code).toBe('d: stack(s("bd").gain(0.5).hush(), s("hh*8"))');
    const back = parsed(code);
    expect(
      sources(back).map((n) => [n.data.pattern, !!n.data.disabled]),
    ).toEqual(
      expect.arrayContaining([
        ['bd', true],
        ['hh*8', false],
      ]),
    );
    expect(lastLine(back)).toBe(code);
  });

  it('keeps calls switched off inside the part', () => {
    const code = 'd: stack(s("bd")/* .gain(2) */.lpf(500).hush(), s("hh"))';
    expect(lastLine(parsed(code))).toBe(code);
  });

  it('comments out the whole line once every part is off', () => {
    const program = parsed('d: stack(s("bd"), s("hh"))');
    for (const node of sources(program)) node.data.disabled = true;
    const code = lastLine(program);
    expect(code).toBe('// d: stack(s("bd"), s("hh"))');
    expect(sources(parsed(code)).every((n) => n.data.disabled)).toBe(true);
  });

  it('plays only the parts that are on', () => {
    const played = haps('stack(s("bd").hush(), s("hh"))').map(
      (hap) => (hap.value as { s: string }).s,
    );
    expect(new Set(played)).toEqual(new Set(['hh']));
  });
});

describe('envelopes set twice in one line', () => {
  it('a later envelope node keeps the stages set earlier', () => {
    const code =
      '$: note("a2").decay(0.25).sound("sine").release(1).lpf(800).attack(0.05)';
    const line = parsed(code).lines[0];
    const written = emitLine(line).replace(/^\$: /, '');
    expect(haps(written)).toEqual(haps(code.replace(/^\$: /, '')));
  });
});
