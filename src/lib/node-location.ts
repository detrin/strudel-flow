import { nodeDefinitions } from '@/components/nodes/registry';
import { flatten } from '@/lib/program/compile';
import type { Program } from '@/lib/program/types';
import { methodNames, namesOf } from '@/lib/program/syntax';
import { regionsOf } from '@/lib/live';

/** Index just past the `)` matching the `(` at `open`, skipping strings. */
function closing(code: string, open: number) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const char = code[i];
    if (char === '"' || char === "'" || char === '`') {
      for (i++; i < code.length && code[i] !== char; i++)
        if (code[i] === '\\') i++;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')' && --depth === 0) return i + 1;
  }
  return code.length;
}

/** The first `.name(` (or an alias) at or after `from`, before `to`. */
function findCall(code: string, name: string, from: number, to: number) {
  let best = -1;
  for (const alias of namesOf(name)) {
    const pattern = new RegExp(
      `\\.\\s*${alias.replace(/\$/g, '\\$')}\\s*\\(`,
      'g',
    );
    pattern.lastIndex = from;
    const match = pattern.exec(code);
    if (match && match.index < to && (best === -1 || match.index < best))
      best = match.index;
  }
  return best;
}

/**
 * Where a node is written in `code` (the console's text, as typed): its
 * line found by label, then its calls in chain order within that line.
 * Null when it cannot be found (a node not in any line, say).
 */
export function locateNode(
  code: string,
  program: Pick<Program, 'lines'>,
  nodeId: string,
): { from: number; to: number } | null {
  let anonymous = 0;
  const regions = regionsOf(code);
  for (const line of program.lines) {
    const label = line.label === '$' ? `$${anonymous++}` : line.label;
    const members = flatten(line.sink).reverse();
    if (!members.some((node) => node.id === nodeId)) continue;
    const region = regions.find((r) => r.label === label);
    if (!region) return null;
    // The source starts after `label:`.
    const head = /^[^:]*:\s*/.exec(code.slice(region.start))?.[0].length ?? 0;
    let cursor = region.start + head;
    for (const [index, node] of members.entries()) {
      if (index === 0) {
        const open = code.indexOf('(', cursor);
        const end =
          open !== -1 && open < region.end ? closing(code, open) : region.end;
        if (node.id === nodeId) return { from: cursor, to: end };
        cursor = end;
        continue;
      }
      const definition = nodeDefinitions[node.type];
      const calls =
        methodNames(
          definition?.generate(node.data, { id: node.id ?? '' }) ?? '',
        ) ?? [];
      let from = -1;
      let to = cursor;
      for (const name of calls) {
        const at = findCall(code, name, to, region.end);
        if (at === -1) continue;
        if (from === -1) from = at;
        to = closing(code, code.indexOf('(', at));
      }
      if (from === -1) continue;
      if (node.id === nodeId) return { from: from + 1, to };
      cursor = to;
    }
    return null;
  }
  return null;
}
