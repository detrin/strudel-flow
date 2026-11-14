import type {
  Expression,
  PrivateIdentifier,
  SpreadElement,
  Statement,
} from 'acorn';
import { isPatternValue, isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import {
  decompose,
  methodNames,
  parseScript,
  slice,
  valueOf,
  type Call,
} from './syntax';
import { flatten } from './compile';
import { LAYOUT } from './emit';
import { ANONYMOUS, type Line, type Program, type ProgramNode } from './types';

/** An existing source node and the code it writes, for identity matching. */
export type Known = Pick<ProgramNode, 'type' | 'data'> & {
  id: string;
  text: string;
};
export type ParsedProgram = Omit<Program, 'cpm' | 'bpc'> &
  Partial<Pick<Program, 'cpm' | 'bpc'>>;
export type ParseResult =
  { ok: true; program: ParsedProgram } | { ok: false; error: string };

const MIX = 'mix-node';
const METHOD = 'method-node';
const CODE = 'custom-node';
/** Calls that configure the session rather than make a pattern. */
const SETUP = new Set([
  'samples',
  'aliasBank',
  'soundAlias',
  'setcpm',
  'setcps',
  'setCps',
  'hush',
  'register',
  'initHydra',
]);

/** Line breaks and indentation between chain links don't change meaning. */
const normalize = (code: string) => code.replace(/\s*\n\s*/g, '');

let methodIndex: Map<string, string[]> | undefined;
/** Node types by the methods they write; built on first use. */
function byMethod(name: string) {
  if (!methodIndex) {
    methodIndex = new Map();
    for (const definition of Object.values(nodeDefinitions))
      for (const method of definition.methods)
        methodIndex.set(method, [
          ...(methodIndex.get(method) ?? []),
          definition.id,
        ]);
  }
  return methodIndex.get(name) ?? [];
}

/**
 * Finds the node that writes `calls[from…]`: the longest run its definition
 * parses and writes back. Order-sensitive nodes must write the same calls in
 * the same order; control setters may also write values Strudel would have
 * used anyway (their parser guarantees that), but never drop a call.
 */
function claim(calls: Call[], from: number) {
  // A node that understands the calls (Modulate for an LFO) beats one that
  // only keeps them as pattern values; then the longer run wins.
  let best: ReturnType<typeof claimAs> = null;
  let bestScore = -1;
  for (const type of byMethod(calls[from].name)) {
    const found = claimAs(type, calls, from);
    if (!found) continue;
    const definition = nodeDefinitions[type];
    const literal = !Object.entries(definition.parameters).some(
      ([key, parameter]) =>
        parameter.control === 'knob' && isPatternValue(found.data[key]),
    );
    const score = (literal ? 1000 : 0) + found.length;
    if (score > bestScore) [best, bestScore] = [found, score];
  }
  return best;
}

function claimAs(type: string, calls: Call[], from: number) {
  const definition = nodeDefinitions[type];
  let end = from;
  const seen = new Set<string>();
  while (
    end < calls.length &&
    definition.methods.includes(calls[end].name) &&
    !seen.has(calls[end].name)
  )
    seen.add(calls[end++].name);
  for (; end > from; end--) {
    const run = calls.slice(from, end).map((call) => call.name);
    const data = definition.parse(calls.slice(from, end));
    const written = data && methodNames(definition.generate(data, { id: '' }));
    const faithful = definition.ordered
      ? written?.join() === run.join()
      : written && run.every((name) => written.includes(name));
    if (faithful) return { type, data: data!, length: end - from };
  }
  return null;
}

/** Turns method calls into a chain of effect nodes fed by `inputs`. */
function chainEffects(inputs: ProgramNode[], calls: Call[]): ProgramNode {
  let current = inputs;
  for (let index = 0; index < calls.length;) {
    const claimed = claim(calls, index);
    const previous = current.length === 1 ? current[0] : undefined;
    if (claimed) {
      current = [{ type: claimed.type, data: claimed.data, inputs: current }];
      index += claimed.length;
    } else if (previous?.type === METHOD) {
      previous.data.calls += `.${calls[index++].text}`;
    } else {
      const data = { calls: calls[index++].text };
      current = [{ type: METHOD, data, inputs: current }];
    }
  }
  return current.length === 1
    ? current[0]
    : { type: MIX, data: {}, inputs: current };
}

function createParser(source: string, known: Known[]) {
  const unmatched = known.map((node) => ({
    ...node,
    text: normalize(node.text),
  }));
  const takeKnown = (text: string) => {
    const index = unmatched.findIndex((node) => node.text === text);
    return index === -1 ? undefined : unmatched.splice(index, 1)[0];
  };

  const tree = (expression: Expression): ProgramNode => {
    const { base, calls } = decompose(source, expression);
    // 1. An existing source node that writes exactly this code keeps its id.
    for (let used = calls.length; used >= 0; used--) {
      const end = used ? calls[used - 1].end : base.end;
      const match = takeKnown(normalize(source.slice(base.start, end)));
      if (match) {
        const { id, type, data } = match;
        const node = { id, type, data: { ...data }, inputs: [] };
        return calls.length > used
          ? chainEffects([node], calls.slice(used))
          : node;
      }
    }
    // 2. stack(a, b) fans several chains into the first call (or a Mix).
    if (
      base.type === 'CallExpression' &&
      base.callee.type === 'Identifier' &&
      base.callee.name === 'stack' &&
      base.arguments.length > 0 &&
      base.arguments.every((arg) => arg.type !== 'SpreadElement')
    ) {
      const inputs = base.arguments.map((arg) => tree(arg as Expression));
      return chainEffects(inputs, calls);
    }
    // 3. A call an instrument models (`note("c e g")` is a Notes node).
    if (base.type === 'CallExpression' && base.callee.type === 'Identifier') {
      const text = slice(source, base);
      const call = {
        name: base.callee.name,
        args: base.arguments.map((arg) => valueOf(source, arg)),
        text,
      };
      for (const definition of Object.values(nodeDefinitions)) {
        const data = definition.parseSource?.(call);
        if (
          data &&
          normalize(definition.generate(data, { id: '' })) === normalize(text)
        ) {
          const node = { type: definition.id, data, inputs: [] };
          return calls.length ? chainEffects([node], calls) : node;
        }
      }
    }
    // 4. Anything else is a Code node holding the base expression.
    const inner =
      base.type === 'ParenthesizedExpression' ? base.expression : base;
    const node = {
      type: CODE,
      data: { customPattern: slice(source, inner) },
      inputs: [],
    };
    return calls.length ? chainEffects([node], calls) : node;
  };

  return tree;
}

/**
 * Tempo from `setcpm(120/4)`, `setcpm(30)` or `setcps(0.5)`. Names bound by
 * an earlier `const BPM = 81` count as their number, so `setcpm(BPM/4)`
 * reads as 81 BPM in 4 beats; `tempoName` is then that constant.
 */
function tempoOf(
  statement: Statement,
  source: string,
  constants: ReadonlyMap<string, number>,
) {
  if (
    statement.type !== 'ExpressionStatement' ||
    statement.expression.type !== 'CallExpression' ||
    statement.expression.callee.type !== 'Identifier' ||
    statement.expression.arguments.length !== 1
  )
    return null;
  const { name } = statement.expression.callee;
  const [arg] = statement.expression.arguments;
  type Operand = Expression | PrivateIdentifier | SpreadElement;
  const resolve = (node: Operand) => {
    const value =
      node.type === 'Identifier'
        ? constants.get(node.name)
        : valueOf(source, node);
    return typeof value === 'number' && value > 0 ? value : null;
  };
  const nameOf = (node: Operand) =>
    node.type === 'Identifier' ? { tempoName: node.name } : {};
  if (name === 'setcpm' && arg.type === 'BinaryExpression') {
    const cpm = resolve(arg.left);
    const bpc = resolve(arg.right);
    return arg.operator === '/' && cpm && bpc
      ? { cpm: String(cpm), bpc: String(bpc), ...nameOf(arg.left) }
      : null;
  }
  const value = resolve(arg);
  if (!value) return null;
  if (name === 'setcpm')
    return { cpm: String(value), bpc: '1', ...nameOf(arg) };
  if (name === 'setcps' || name === 'setCps')
    return { cpm: String(value * 60), bpc: '1' };
  return null;
}

/** Numbers bound by `const NAME = 81` (literals only). */
function constantsOf(statement: Statement, source: string) {
  if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const')
    return [];
  return statement.declarations.flatMap((declaration) => {
    if (declaration.id.type !== 'Identifier' || !declaration.init) return [];
    const value = valueOf(source, declaration.init);
    return typeof value === 'number'
      ? [[declaration.id.name, value] as const]
      : [];
  });
}

/** True for a bare statement that plays a pattern rather than setting up. */
function isPattern(statement: Statement, source: string) {
  if (statement.type !== 'ExpressionStatement') return false;
  const { base } = decompose(source, statement.expression);
  return !(
    base.type === 'AwaitExpression' ||
    (base.type === 'CallExpression' &&
      base.callee.type === 'Identifier' &&
      SETUP.has(base.callee.name))
  );
}

/** Code → Program. Never drops code: anything unmodelled stays as text. */
export function parseProgram(source: string, known: Known[] = []): ParseResult {
  const comments: { start: number; end: number; text: string }[] = [];
  let body: Statement[];
  try {
    body = parseScript(source, (_block, _text, start, end) =>
      comments.push({ start, end, text: source.slice(start, end) }),
    ).body as Statement[];
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const tree = createParser(source, known);
  const program: ParsedProgram = { prelude: '', lines: [] };
  const prelude: { start: number; text: string }[] = [];
  const lineRanges: { start: number; end: number }[] = [];
  let lastBare: { statement: Statement; index: number } | undefined;

  const constants = new Map<string, number>();
  for (const statement of body) {
    const tempo = tempoOf(statement, source, constants);
    if (tempo) {
      Object.assign(program, tempo);
      continue;
    }
    if (
      statement.type === 'LabeledStatement' &&
      statement.body.type === 'ExpressionStatement'
    ) {
      const name = statement.label.name;
      const muted = name.startsWith('_');
      // The `// @layout` comment right above the line is part of it.
      const layout = comments.findLast(
        (comment) =>
          comment.end <= statement.start &&
          !source.slice(comment.end, statement.start).trim() &&
          comment.text.includes(LAYOUT),
      );
      if (layout) lineRanges.push(layout);
      program.lines.push(
        line(
          name.replace(/^_/, '') || ANONYMOUS,
          muted,
          tree(statement.body.expression),
          layout && positionsOf(layout.text),
        ),
      );
      // A comment on the same line as the statement belongs to it.
      const lineEnd = source.indexOf('\n', statement.end);
      lineRanges.push({
        start: statement.start,
        end: lineEnd === -1 ? source.length : lineEnd,
      });
      continue;
    }
    for (const [name, value] of constantsOf(statement, source))
      constants.set(name, value);
    if (isPattern(statement, source))
      lastBare = { statement, index: prelude.length };
    prelude.push({ start: statement.start, text: slice(source, statement) });
  }

  // Strudel plays a trailing bare expression when there are no labels.
  if (
    program.lines.length === 0 &&
    lastBare &&
    lastBare.index === prelude.length - 1
  ) {
    const { statement } = lastBare;
    prelude.pop();
    if (statement.type === 'ExpressionStatement')
      program.lines.push(line(ANONYMOUS, false, tree(statement.expression)));
  }

  for (const comment of comments)
    if (
      !lineRanges.some(
        (range) => comment.start >= range.start && comment.end <= range.end,
      )
    )
      prelude.push(comment);
  program.prelude = prelude
    .sort((a, b) => a.start - b.start)
    .map((part) => part.text)
    .join('\n');
  return { ok: true, program };
}

/** `// @layout 0,0 320,0` → positions, or undefined if malformed. */
function positionsOf(comment: string) {
  const pairs = comment.split(LAYOUT)[1]?.trim().split(/\s+/) ?? [];
  const positions = pairs.map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
  return positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
    ? positions
    : undefined;
}

function line(
  label: string,
  muted: boolean,
  sink: ProgramNode,
  positions?: { x: number; y: number }[],
): Line {
  const nodes = flatten(sink).reverse();
  // A layout for a different number of nodes is stale; lay out anew.
  if (positions?.length === nodes.length)
    nodes.forEach((node, index) => (node.position = positions[index]));
  for (const node of flatten(sink)) {
    node.data = { ...node.data, state: muted ? 'paused' : 'running' };
    delete node.data.label;
  }
  if (label !== ANONYMOUS) sink.data.label = label;
  return { label, muted, sink };
}

/** The code each existing source node writes, for `parseProgram`. */
export function knownSources(
  nodes: { id: string; type: string; data: Record<string, unknown> }[],
): Known[] {
  return nodes.flatMap(({ id, type, data }) => {
    const definition = nodeDefinitions[type];
    if (!definition || !isSource(definition)) return [];
    const text = definition.generate(data, { id });
    return text ? [{ id, type, data, text }] : [];
  });
}
