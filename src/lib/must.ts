/**
 * A value the code guarantees is there (an index inside its bounds, a node
 * type from the registry): `must(calls[at], 'call')`. If it ever isn't, an
 * error says what was missing, instead of `undefined` silently flowing on.
 */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing ${what}.`);
  return value;
}
