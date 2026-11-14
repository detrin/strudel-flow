import type { Call } from '@/lib/program/syntax';

/** One character per bar: '1' plays, '0' is silent. */
export type ArrangeData = { bars?: string };
export const DEFAULT_BARS = '11110000';
export const MAX_BARS = 64;

/** `11110000` → `<1!4 0!4>`. */
export function maskPattern(bars: string) {
  const runs: string[] = [];
  for (let i = 0; i < bars.length;) {
    let end = i;
    while (bars[end] === bars[i]) end++;
    runs.push(end - i > 1 ? `${bars[i]}!${end - i}` : bars[i]);
    i = end;
  }
  return `<${runs.join(' ')}>`;
}

export const generateArrange = ({ bars = DEFAULT_BARS }: ArrangeData) =>
  `mask(${JSON.stringify(maskPattern(bars || DEFAULT_BARS))})`;

/** Only a plain one-value-per-bar mask is an arrangement. */
export function parseArrange([call, ...rest]: Call[]): ArrangeData | null {
  const [arg] = call?.args ?? [];
  if (rest.length || call.args.length !== 1 || typeof arg !== 'string')
    return null;
  const body = /^<\s*((?:[01](?:!\d+)?\s*)+)>$/.exec(arg.trim())?.[1];
  if (!body) return null;
  const bars = body
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [bit, count = '1'] = token.split('!');
      return bit.repeat(Number(count));
    })
    .join('');
  return bars.length > 0 && bars.length <= MAX_BARS ? { bars } : null;
}
