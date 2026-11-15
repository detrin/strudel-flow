/**
 * The app was called Strudel Flow and kept its data under `strudel-flow:`
 * keys. Copies what this browser saved then (the open patch, presets and
 * tags, console and theme) to the `strudelton:` keys, once. Imported first,
 * before any store reads its key. The old keys are left as they are.
 */
const KEYS = ['patch', 'library', 'console', 'theme'];

try {
  for (const key of KEYS) {
    const old = localStorage.getItem(`strudel-flow:${key}`);
    if (old !== null && localStorage.getItem(`strudelton:${key}`) === null)
      localStorage.setItem(`strudelton:${key}`, old);
  }
} catch {
  // Storage unavailable: nothing to carry over.
}

export {};
