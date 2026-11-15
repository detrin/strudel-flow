/**
 * A log of what went wrong, for finding out why (in the app, in the console
 * as `__strudelton.diagnostics()`, and for Claude through the
 * `get_diagnostics` tool). Keeps the last errors with where they happened,
 * and the dev server's hot updates, since a half-saved file arriving in an
 * open tab is a common cause. Imports nothing from the app.
 */

export type Entry = {
  at: string;
  /** What was running: 'code sync', 'playback', 'page', 'hot update', … */
  where: string;
  message: string;
  stack?: string;
  /** Anything that helps: the files of a hot update, a node id, … */
  detail?: unknown;
};

const LIMIT = 100;
const entries: Entry[] = [];
const listeners = new Set<() => void>();

export function record(entry: Omit<Entry, 'at'>) {
  entries.push({ at: new Date().toISOString(), ...entry });
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT);
  listeners.forEach((listener) => listener());
}

/** Records an error (and logs it to the console with its context). */
export function report(where: string, error: unknown, detail?: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[strudelton] ${where}: ${message}`, detail ?? '', error);
  record({ where, message, stack, detail });
}

/**
 * Ongoing problems (the code no longer following the canvas, …), shown in
 * the app until cleared. Keyed so one place can set and clear its own.
 */
const problems = new Map<string, string>();
export function setProblem(key: string, message: string | null) {
  if ((problems.get(key) ?? null) === message) return;
  if (message === null) problems.delete(key);
  else problems.set(key, message);
  listeners.forEach((listener) => listener());
}
export const currentProblems = () => [...problems.values()];

export const diagnostics = () => [...entries];

export function onDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Makes a store's listeners independent: a store calls them one after
 * another, so one that throws would skip the rest (the code sync, the
 * autosave, …) and hand the error to whoever changed the store. Now each
 * error is logged and the others still run. Works for plain `subscribe`
 * and subscribeWithSelector's `subscribe(selector, listener)`.
 */
export function isolateListeners(
  store: { subscribe: (...args: never[]) => () => void },
  name: string,
) {
  const subscribe = store.subscribe.bind(store) as (
    ...args: unknown[]
  ) => () => void;
  const guard =
    (listener: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      try {
        return listener(...args);
      } catch (error) {
        report(`${name} listener`, error);
      }
    };
  (store as { subscribe: unknown }).subscribe = (...args: unknown[]) => {
    const at = typeof args[1] === 'function' ? 1 : 0;
    const next = [...args];
    next[at] = guard(args[at] as (...a: unknown[]) => unknown);
    return subscribe(...next);
  };
}

/** One text block to paste into a bug report or a chat. */
export function diagnosticsText() {
  return entries
    .map(
      (entry) =>
        `${entry.at} [${entry.where}] ${entry.message}` +
        (entry.detail === undefined
          ? ''
          : `\n  ${JSON.stringify(entry.detail)}`) +
        (entry.stack
          ? `\n  ${entry.stack.split('\n').slice(1, 6).join('\n  ')}`
          : ''),
    )
    .join('\n');
}

/** Errors nothing else caught, and hot updates. Call once at startup. */
export function watchErrors() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) =>
    report('page', event.error ?? event.message, {
      file: event.filename,
      line: event.lineno,
    }),
  );
  window.addEventListener('unhandledrejection', (event) =>
    report('page (promise)', event.reason),
  );
  (window as unknown as { __strudelton?: object }).__strudelton = {
    diagnostics,
    diagnosticsText,
  };
  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', (payload) =>
      record({
        where: 'hot update',
        message: 'files changed on disk were swapped into this tab',
        detail: payload.updates.map((update) => update.path),
      }),
    );
    import.meta.hot.on('vite:error', (payload) =>
      record({
        where: 'hot update',
        message: `a changed file failed to compile: ${payload.err.message}`,
        detail: payload.err.id,
      }),
    );
  }
}
