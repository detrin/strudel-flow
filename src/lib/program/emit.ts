import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { flatten } from './compile';
import type { Line, Program, ProgramNode } from './types';

/** An expression split into its base and the calls chained onto it. */
type Chain = { base: string; calls: string[] };

const inline = ({ base, calls }: Chain) =>
  base + calls.map((call) => `.${call}`).join('');

function chain(node: ProgramNode): Chain {
  const definition = nodeDefinitions[node.type];
  const own = definition?.generate(node.data, { id: node.id ?? '' }) ?? '';
  const inputs = node.inputs.map(chain).filter((input) => input.base);
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
  return { base: input.base, calls: [...input.calls, own] };
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

export function emitLine({ label, muted, sink }: Line): string {
  const { base, calls } = chain(sink);
  if (!base) return '';
  const name = muted ? `_${label}` : label;
  const body = `${name}: ${base}${calls.map((call) => `\n  .${call}`).join('')}`;
  return layoutComment(sink) + body;
}

/** Program → Strudel code. */
export function emitProgram(program: Program): string {
  const prelude = program.prelude.trim();
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
  const lines = program.lines.map(emitLine).filter(Boolean);
  return [head.join('\n'), ...lines].join('\n\n') + '\n';
}

/** True when at least one line would make sound. */
export const isAudible = (program: Program) =>
  program.lines.some((line) => !line.muted && emitLine(line));
