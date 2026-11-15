/**
 * Lines of a program, by label: where each line's code is, and which nodes
 * make it up. Imports nothing from the app, so node definitions and their
 * visuals can use it without an import cycle through the store.
 */

const LABEL = /^([A-Za-z_$][\w$]*)\s*:(?!:)/;

/**
 * A statement label as Strudel reads it: `_kick` is muted, and any label
 * longer than one letter that starts with `S` is soloed (`Skick`, `S$`).
 * `label` is the line's name without either mark.
 */
export function labelOf(name: string) {
  const muted = name.startsWith('_');
  const rest = name.replace(/^_/, '');
  const soloed = rest.length > 1 && rest.startsWith('S');
  return { label: (soloed ? rest.slice(1) : rest) || '$', muted, soloed };
}

/**
 * Each labelled line's span in some code: from its label to the next line
 * that starts at column 0 with something other than `.` or `)`. Anonymous
 * `$:` lines are numbered (`$0`, `$1`, …) the way Strudel names them.
 */
export function regionsOf(code: string) {
  const regions: { label: string; start: number; end: number }[] = [];
  let offset = 0;
  let anonymous = 0;
  for (const line of code.split('\n')) {
    const match = LABEL.exec(line);
    const last = regions.at(-1);
    if (match) {
      let { label } = labelOf(match[1]);
      if (label === '$') label = `$${anonymous++}`;
      if (last && last.end === -1) last.end = offset;
      regions.push({ label, start: offset, end: -1 });
    } else if (/^[^\s.)/]/.test(line) && last && last.end === -1) {
      last.end = offset;
    }
    offset += line.length + 1;
  }
  const last = regions.at(-1);
  if (last && last.end === -1) last.end = code.length;
  return regions;
}

/** Node ids by line label, from the current graph (kept by live.ts). */
export let lineNodes = new Map<string, string[]>();
export const setLineNodes = (lines: Map<string, string[]>) => {
  lineNodes = lines;
};
/** The label of the line a node is part of (`$0` for the first `$:`). */
export const lineLabelOf = (nodeId: string) =>
  [...lineNodes].find(([, ids]) => ids.includes(nodeId))?.[0];
