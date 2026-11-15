import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { flatten } from './compile';
import type { Line, Program, ProgramNode } from './types';

/**
 * An expression split into its base and the calls chained onto it. A
 * disabled node's calls stay in the code, commented out.
 */
type Call = { text: string; disabled: boolean };
type Chain = { base: string; calls: Call[] };
/** Ends a switched-off part of a stack. */
export const HUSH = 'hush()';

const inline = ({ base, calls }: Chain) =>
  base +
  calls
    .map(({ text, disabled }) => (disabled ? `/* .${text} */` : `.${text}`))
    .join('');

/** A node switched off: its code is commented out (a source: its line). */
export const isDisabled = (node: ProgramNode | undefined) =>
  Boolean(node?.data.disabled);

/**
 * True when nothing reaches this node: its sources are all switched off.
 * A line that is off is commented out; one part of a `stack(…)` that is
 * off ends in `.hush()` (Strudel's silence), so the rest still plays.
 */
export function isOff(node: ProgramNode): boolean {
  const definition = nodeDefinitions[node.type];
  if (definition && isSource(definition))
    return isDisabled(node) && node.inputs.every(isOff);
  return node.inputs.length > 0 && node.inputs.every(isOff);
}

function chain(node: ProgramNode): Chain {
  const definition = nodeDefinitions[node.type];
  const own = definition?.generate(node.data, { id: node.id ?? '' }) ?? '';
  const off = node.inputs.length > 1 && !isOff(node);
  const inputs = node.inputs
    .map((input) => {
      const part = chain(input);
      return off && part.base && isOff(input)
        ? { ...part, calls: [...part.calls, { text: HUSH, disabled: false }] }
        : part;
    })
    .filter((input) => input.base);
  const stacked = (extra: string[] = []): Chain => {
    const parts = [...inputs.map(inline), ...extra];
    return parts.length === 1
      ? (inputs[0] ?? { base: parts[0], calls: [] })
      : { base: parts.length ? `stack(${parts.join(', ')})` : '', calls: [] };
  };
  if (definition && isSource(definition)) {
    return stacked(own ? [own] : []);
  }
  const input = stacked();
  if (!input.base || !own) return input;
  return {
    base: input.base,
    calls: [...input.calls, { text: own, disabled: isDisabled(node) }],
  };
}

/**
 * `// @layout 0,0 320,0`: where the line's nodes sit on the canvas, upstream
 * first, so the code alone restores the canvas.
 */
export const LAYOUT = '@layout';
export function layoutComment(sink: ProgramNode) {
  const positions = flatten(sink)
    .reverse()
    .map((node) => node.position);
  return positions.every(Boolean)
    ? `// ${LAYOUT} ${positions
        .map((p) => `${Math.round(p!.x)},${Math.round(p!.y)}`)
        .join(' ')}\n`
    : '';
}

/** The statement label: `_` mutes, `S` solos (Strudel's own syntax). */
export const labelCode = ({ label, muted, soloed }: Line) =>
  `${muted ? '_' : ''}${soloed ? 'S' : ''}${label}`;

export function emitLine(line: Line): string {
  const { sink } = line;
  const { base, calls } = chain(sink);
  if (!base) return '';
  const name = labelCode(line);
  const body = `${name}: ${base}${calls
    .map(({ text, disabled }) =>
      disabled ? `\n  // .${text}` : `\n  .${text}`,
    )
    .join('')}`;
  // All its sources off: the whole line is commented out, so it never plays.
  const code = isOff(sink)
    ? body
        .split('\n')
        .map((text) => `// ${text}`)
        .join('\n')
    : body;
  return layoutComment(sink) + code;
}

/** Program → Strudel code. */
export function emitProgram(program: Program): string {
  // A song's opening comments (its title, notes) stay at the very top.
  const lines = program.prelude.trim().split('\n');
  const opening = lines.findIndex((line) => !line.trimStart().startsWith('//'));
  const intro = (opening === -1 ? lines : lines.slice(0, opening)).join('\n');
  const prelude = opening === -1 ? '' : lines.slice(opening).join('\n').trim();
  const { cpm, bpc, tempoName } = program;
  // A tempo written with a constant (`const BPM = 81`, `setcpm(BPM/4)`)
  // stays that way: the constant takes the tempo, setcpm follows it.
  const constant =
    tempoName &&
    new RegExp(
      `(\\bconst\\s+${tempoName.replace(/\$/g, '\\$')}\\s*=\\s*)-?[\\d.]+`,
    );
  const head =
    constant && constant.test(prelude)
      ? [prelude.replace(constant, `$1${cpm}`), `setcpm(${tempoName}/${bpc})`]
      : [`setcpm(${cpm}/${bpc})`, ...(prelude ? [prelude] : [])];
  const body = program.lines.map(emitLine).filter(Boolean);
  return [intro, head.join('\n'), ...body].filter(Boolean).join('\n\n') + '\n';
}

/**
 * The lines Strudel plays: not muted or switched off, and, while any line
 * is soloed, only the soloed ones.
 */
export function playingLines(program: Pick<Program, 'lines'>) {
  const live = program.lines.filter(
    (line) => !line.muted && !isOff(line.sink) && emitLine(line),
  );
  return live.some((line) => line.soloed)
    ? live.filter((line) => line.soloed)
    : live;
}

/** True when at least one line would make sound. */
export const isAudible = (program: Program) => playingLines(program).length > 0;
