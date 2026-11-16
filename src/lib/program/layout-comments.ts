import type { Statement } from 'acorn';
import { LAYOUT, layoutComment } from './emit';
import { parseScript } from './syntax';
import type { Program } from './types';
import { labelOf } from '@/lib/lines';

/** Code without its `// @layout` lines: what the patch says, not where. */
export const withoutLayout = (code: string) =>
  code.replace(/^[ \t]*\/\/[ \t]*@layout\b.*\n/gm, '');

/**
 * Rewrites only the `// @layout` comments of `code` for `program`, keeping
 * everything else as the user wrote it. Null when the code's lines don't
 * line up with the program's.
 */
export function updateLayout(code: string, program: Program): string | null {
  const comments: { start: number; end: number; text: string }[] = [];
  let body: Statement[];
  try {
    body = parseScript(code, (_block, text, start, end) =>
      comments.push({ start, end, text }),
    ).body as Statement[];
  } catch {
    return null;
  }
  const statements = body.filter(
    (statement) => statement.type === 'LabeledStatement',
  );
  if (statements.length !== program.lines.length) return null;
  // Each statement's line by name (`$` lines by their order), so a song
  // whose canvas order differs from its text never trades layouts; by
  // position only when names can't tell them apart.
  const keyed = (labels: string[]) => {
    let anonymous = 0;
    return labels.map((label) =>
      label === '$' ? '$' + String(anonymous++) : label,
    );
  };
  const statementKeys = keyed(
    statements.map((statement) =>
      statement.type === 'LabeledStatement'
        ? labelOf(statement.label.name).label
        : '',
    ),
  );
  const lineKeys = keyed(program.lines.map((line) => line.label));
  const byName =
    new Set(statementKeys).size === statementKeys.length &&
    statementKeys.every((key) => lineKeys.includes(key));
  const lineFor = (index: number) =>
    byName
      ? program.lines[lineKeys.indexOf(statementKeys[index])]
      : program.lines[index];
  let result = code;
  // Back to front, so earlier offsets stay valid.
  for (let index = statements.length - 1; index >= 0; index--) {
    const statement = statements[index];
    const comment = layoutComment(lineFor(index).sink).trimEnd();
    const existing = comments.findLast(
      (c) =>
        c.end <= statement.start &&
        !code.slice(c.end, statement.start).trim() &&
        c.text.includes(LAYOUT),
    );
    if (existing)
      result =
        result.slice(0, existing.start) + comment + result.slice(existing.end);
    else if (comment) {
      const lineStart = code.lastIndexOf('\n', statement.start - 1) + 1;
      result = `${result.slice(0, lineStart)}${comment}\n${result.slice(lineStart)}`;
    }
  }
  return result;
}
