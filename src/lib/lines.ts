/**
 * Lines of a program, by label: where each line's code is, and which nodes
 * make it up. Imports nothing from the app, so node definitions and their
 * visuals can use it without an import cycle through the store.
 */

import { parse } from 'acorn';

const LABEL = /^([A-Za-z_$][\w$]*)\s*:(?!:)/;

/**
 * The top-level statements of some code, as spans (start, end, kind), or
 * null when it does not parse. The real extent of each statement, wherever
 * its rows start: `0.4)).gain(0.6)` at column 0 still belongs to its line.
 */
export function statementsOf(code: string) {
  try {
    const program = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowAwaitOutsideFunction: true,
    });
    return program.body.map((statement) => ({
      start: statement.start,
      end: statement.end,
      type: statement.type,
    }));
  } catch {
    return null;
  }
}
/** The offset just after the row `offset` is on. */
const rowEnd = (code: string, offset: number) => {
  const at = code.indexOf('\n', offset);
  return at === -1 ? code.length : at;
};

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
  // A statement may run on past a row that starts at column 0; when the
  // code parses, each line reaches at least to its statement's end.
  const statements = statementsOf(code);
  if (statements)
    regions.forEach((region, index) => {
      const statement = statements.find(
        (s) => s.start >= region.start && s.start < region.end,
      );
      if (!statement || statement.end <= region.end) return;
      const end = rowEnd(code, statement.end) + 1;
      region.end = Math.min(code.length, end);
      const next = regions[index + 1];
      if (next && next.start < region.end) next.start = region.end;
    });
  return regions.filter((region) => region.start < region.end);
}

/** Node ids by line label, from the current graph (kept by live.ts). */
export let lineNodes = new Map<string, string[]>();
export const setLineNodes = (lines: Map<string, string[]>) => {
  lineNodes = lines;
};
/** The label of the line a node is part of (`$0` for the first `$:`). */
export const lineLabelOf = (nodeId: string) =>
  [...lineNodes].find(([, ids]) => ids.includes(nodeId))?.[0];

/**
 * Node ids by part: in a line that merges parts (`stack(a, b).fx()`), the
 * nodes of each part, keyed `<label>#<index>` in code order.
 */
export let partNodes = new Map<string, string[]>();
export const setPartNodes = (parts: Map<string, string[]>) => {
  partNodes = parts;
};
/**
 * What a node hears, for meters and visuals: its part (`kick#0`) when it
 * sits in one part of a stack, otherwise its line's label.
 */
export const sourceOf = (nodeId: string) =>
  [...partNodes].find(([, ids]) => ids.includes(nodeId))?.[0] ??
  lineLabelOf(nodeId);
