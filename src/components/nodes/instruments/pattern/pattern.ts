import type { Call } from '@/lib/program/syntax';

export type PatternValues = { fn: string; pattern: string; fast: number };

const FAST = /^"((?:[^"\\]|\\.)*)"\s*\.fast\(\s*(\d+(?:\.\d+)?)\s*\)$/;

/**
 * Reads `note("c e g")` or `note("c e g".fast(4))` when the call is one of
 * `names`. The mini-notation must be a double-quoted string.
 */
export function readPattern(
  call: Call,
  names: readonly string[],
): PatternValues | null {
  if (!names.includes(call.name) || call.args.length !== 1) return null;
  const [arg] = call.args;
  if (typeof arg === 'string') return { fn: call.name, pattern: arg, fast: 1 };
  if (typeof arg === 'object') {
    const match = FAST.exec(arg.code.trim());
    if (match)
      return {
        fn: call.name,
        pattern: JSON.parse(`"${match[1]}"`) as string,
        fast: Number(match[2]),
      };
  }
  return null;
}

export const writePattern = ({ fn, pattern, fast }: PatternValues) =>
  `${fn}(${JSON.stringify(pattern)}${Number(fast) !== 1 ? `.fast(${fast})` : ''})`;
