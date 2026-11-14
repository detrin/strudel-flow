import { parseExpressionAt } from 'acorn';

/**
 * What a typed value means as code: a number stays a number; bare
 * mini-notation (`<400 800>`, `200 400`) gets quotes; anything else
 * (`sine.range(200, 2000)`, `"<1 2>"`, `slider(0.5)`) is used as written.
 * Null when it is not a valid expression.
 */
export function typedValue(text: string): number | string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (Number.isFinite(Number(trimmed))) return Number(trimmed);
  const code =
    /^["'`]/.test(trimmed) ||
    /[A-Za-z_$][\w$]*\s*[(.]/.test(trimmed) ||
    /^[A-Za-z_$][\w$]*$/.test(trimmed)
      ? trimmed
      : JSON.stringify(trimmed);
  try {
    const node = parseExpressionAt(code, 0, { ecmaVersion: 'latest' });
    return node.end === code.length ? code : null;
  } catch {
    return null;
  }
}
