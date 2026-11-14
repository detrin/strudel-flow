import type { Call } from '@/lib/program/syntax';

/**
 * One character per bar: '1' plays, '0' is silent. A mask that is not one
 * value per bar (`mask(DROP)`, `mask("1 0 1 1")`) is kept as `pattern`.
 */
export type ArrangeData = { bars?: string; pattern?: string };
export const DEFAULT_BARS = '11110000';
export const MAX_BARS = 256;

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

export const generateArrange = ({
  bars = DEFAULT_BARS,
  pattern,
}: ArrangeData) =>
  pattern
    ? `mask(${pattern})`
    : `mask(${JSON.stringify(maskPattern(bars || DEFAULT_BARS))})`;

/** `<0!8 1@4 0>`: one value per bar, `!n` or `@n` for n bars. */
function barsOf(text: string) {
  const body = /^<\s*((?:[01](?:[!@]\d+)?\s*)+)>$/.exec(text.trim())?.[1];
  if (!body) return null;
  const bars = body
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [bit, count = '1'] = token.split(/[!@]/);
      return bit.repeat(Number(count));
    })
    .join('');
  return bars.length > 0 && bars.length <= MAX_BARS ? bars : null;
}

/** A mask: bars when it is one value per bar, otherwise its pattern. */
export function parseArrange([call, ...rest]: Call[]): ArrangeData | null {
  const [arg] = call?.args ?? [];
  if (rest.length || call.args.length !== 1) return null;
  if (typeof arg === 'string') {
    const bars = barsOf(arg);
    return bars ? { bars } : { pattern: JSON.stringify(arg) };
  }
  return typeof arg === 'object' ? { pattern: arg.code } : null;
}
