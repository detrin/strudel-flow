import { parse, type Expression, type Node } from 'acorn';

/** A call argument: a literal, or the source text of anything else. */
export type Value = number | string | { code: string };
/** One `.name(args)` link of a method chain. */
export type Call = { name: string; args: Value[]; text: string };

/** Strudel's alternative names for the methods nodes write. */
const ALIASES: Record<string, string> = {
  s: 'sound',
  cutoff: 'lpf',
  ctf: 'lpf',
  lp: 'lpf',
  resonance: 'lpq',
  hcutoff: 'hpf',
  hp: 'hpf',
  hresonance: 'hpq',
  size: 'rsize',
  sz: 'rsize',
  roomsize: 'rsize',
  delayfb: 'delayfeedback',
  dfb: 'delayfeedback',
  delayt: 'delaytime',
  dt: 'delaytime',
  lpe: 'lpenv',
  lpa: 'lpattack',
  lpd: 'lpdecay',
  lps: 'lpsustain',
  lpr: 'lprelease',
  hpe: 'hpenv',
  hpa: 'hpattack',
  hpd: 'hpdecay',
  hps: 'hpsustain',
  hpr: 'hprelease',
  att: 'attack',
  dec: 'decay',
  sus: 'sustain',
  rel: 'release',
  o: 'orbit',
  det: 'detune',
};
export const canonical = (name: string) => ALIASES[name] ?? name;

export function parseScript(code: string, onComment?: acornComment) {
  return parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    preserveParens: true,
    onComment,
  });
}
type acornComment = (
  block: boolean,
  text: string,
  start: number,
  end: number,
) => void;

export function parseExpression(code: string): Expression | null {
  try {
    const program = parseScript(`(${code}\n)`);
    const [statement] = program.body;
    if (program.body.length !== 1 || statement.type !== 'ExpressionStatement')
      return null;
    const expression = statement.expression;
    return expression.type === 'ParenthesizedExpression'
      ? expression.expression
      : expression;
  } catch {
    return null;
  }
}

export const slice = (source: string, node: Node) =>
  source.slice(node.start, node.end);

export function valueOf(source: string, node: Node): Value {
  if (node.type === 'Literal') {
    const { value } = node as Node & { value: unknown };
    if (typeof value === 'number' || typeof value === 'string') return value;
  }
  if (node.type === 'TemplateLiteral') {
    const template = node as Node & {
      expressions: unknown[];
      quasis: { value: { cooked: string } }[];
    };
    if (template.expressions.length === 0)
      return template.quasis[0].value.cooked;
  }
  if (node.type === 'UnaryExpression') {
    const unary = node as Node & { operator: string; argument: Node };
    const inner = valueOf(source, unary.argument);
    if (unary.operator === '-' && typeof inner === 'number') return -inner;
  }
  return { code: slice(source, node) };
}

/** Splits `base.a(1).b(2)` into its base expression and its calls. */
export function decompose(source: string, expression: Expression) {
  const calls: (Call & { end: number })[] = [];
  let current: Expression = expression;
  while (
    current.type === 'CallExpression' &&
    !current.optional &&
    current.callee.type === 'MemberExpression' &&
    !current.callee.computed &&
    !current.callee.optional &&
    current.callee.property.type === 'Identifier'
  ) {
    const { property } = current.callee;
    calls.unshift({
      name: canonical(property.name),
      args: current.arguments.map((arg) => valueOf(source, arg)),
      text: source.slice(property.start, current.end),
      end: current.end,
    });
    current = current.callee.object as Expression;
  }
  return { base: current, calls };
}

/** The (canonical) method names in a chain of calls like `lpf(1).lpq(2)`. */
export function methodNames(calls: string): string[] | null {
  if (!calls) return [];
  const expression = parseExpression(`_.${calls}`);
  if (!expression) return null;
  const { base, calls: parsed } = decompose(`(_.${calls}\n)`, expression);
  return base.type === 'Identifier' && base.name === '_'
    ? parsed.map((call) => call.name)
    : null;
}

/**
 * True when `code` can be written without parentheses in front of a method
 * chain: a name, a literal, or a plain function call like `note("c e")`.
 */
export function isAtom(code: string) {
  const expression = parseExpression(code);
  if (!expression) return false;
  switch (expression.type) {
    case 'Identifier':
    case 'Literal':
    case 'TemplateLiteral':
    case 'ArrayExpression':
    case 'ParenthesizedExpression':
      return true;
    case 'CallExpression':
      return expression.callee.type === 'Identifier';
    default:
      return false;
  }
}
