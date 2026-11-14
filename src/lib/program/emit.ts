import { isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
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

export function emitLine({ label, muted, sink }: Line): string {
  const { base, calls } = chain(sink);
  if (!base) return '';
  const name = muted ? `_${label}` : label;
  return `${name}: ${base}${calls.map((call) => `\n  .${call}`).join('')}`;
}

/** Program → Strudel code. */
export function emitProgram(program: Program): string {
  const head = [`setcpm(${program.cpm}/${program.bpc})`];
  if (program.prelude.trim()) head.push(program.prelude.trim());
  const lines = program.lines.map(emitLine).filter(Boolean);
  return [head.join('\n'), ...lines].join('\n\n') + '\n';
}

/** True when at least one line would make sound. */
export const isAudible = (program: Program) =>
  program.lines.some((line) => !line.muted && emitLine(line));
