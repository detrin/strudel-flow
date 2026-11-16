import * as strudel from '@strudel/web';

/** Strudel's functions, for evaluating code the way the REPL does. */
const scope = Object.entries(strudel).filter(([name]) =>
  /^[A-Za-z_$][\w$]*$/.test(name),
);

type Hap = { whole?: { begin: unknown; end: unknown }; value: unknown };

const sorted = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, inner]) => [key, sorted(inner)]),
      )
    : value;

/**
 * Every event a pattern expression plays in its first `cycles`, as text,
 * or null when it cannot be evaluated on its own (it uses a name defined
 * elsewhere in the song, say).
 */
export function eventsOf(
  expression: string,
  cycles = 8,
  /** Rewrites each event's value before comparing (e.g. resolve defaults). */
  normalize: (value: unknown) => unknown = (value) => value,
): string | null {
  try {
    const { output } = (
      strudel as unknown as {
        transpiler: (
          code: string,
          options: Record<string, boolean>,
        ) => { output: string };
      }
    ).transpiler(expression, {
      emitWidgets: false,
      emitMiniLocations: false,
      wrapAsync: false,
      addReturn: true,
    });
    const pattern = new Function(...scope.map(([name]) => name), output)(
      ...scope.map(([, value]) => value),
    ) as { queryArc: (begin: number, end: number) => Hap[] };
    return pattern
      .queryArc(0, cycles)
      .map((hap) =>
        JSON.stringify([
          String(hap.whole?.begin),
          String(hap.whole?.end),
          sorted(normalize(hap.value)),
        ]),
      )
      .sort()
      .join('\n');
  } catch {
    return null;
  }
}

/** True when two expressions provably play the same events. */
export function sameSound(a: string, b: string) {
  const events = eventsOf(a);
  return events !== null && events === eventsOf(b);
}
