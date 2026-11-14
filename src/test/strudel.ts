import * as strudel from '@strudel/web';

const scope = Object.entries(strudel).filter(([name]) =>
  /^[A-Za-z_$][\w$]*$/.test(name),
);

type Hap = { whole?: { begin: unknown; end: unknown }; value: unknown };

/** Evaluates one pattern expression headlessly and lists its events. */
export function haps(expression: string, cycles = 4) {
  const { output } = strudel.transpiler(expression, {
    emitWidgets: false,
    emitMiniLocations: false,
    wrapAsync: false,
    addReturn: true,
  });
  const pattern = new Function(...scope.map(([name]) => name), output)(
    ...scope.map(([, value]) => value),
  );
  return (pattern.queryArc(0, cycles) as Hap[])
    .map((hap) => ({
      begin: String(hap.whole?.begin),
      end: String(hap.whole?.end),
      value: hap.value,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
