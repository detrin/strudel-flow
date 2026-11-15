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
  parseExpression,
  parseScript,
  slice,
  valueOf,
  type Call,
} from './syntax';
import { labelOf } from '@/lib/lines';
import { flatten } from './compile';
import { HUSH, LAYOUT } from './emit';
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

type Comment = { start: number; end: number; text: string };

/**
 * The calls of a commented-out node: `// .lpf(800).lpq(4)` (or a block
 * comment) holding only method calls. Null for any other comment.
 */
function commentCalls(text: string): Call[] | null {
  const body = text.startsWith('/*')
    ? text.slice(2, -2)
    : text.replace(/^\/\//, '');
  const code = body.trim();
  if (!/^\.\s*[A-Za-z_$]/.test(code)) return null;
  const snippet = `_${code}`;
  const expression = parseExpression(snippet);
  if (!expression) return null;
  const { base, calls } = decompose(`(${snippet}\n)`, expression);
  return base.type === 'Identifier' && base.name === '_' && calls.length
    ? calls
    : null;
}

/** A line's calls in code order, with commented-out ones as disabled runs. */
type Item = { at: number } & (
  { call: Call & { end: number } } | { disabled: Call[] }
);

/**
 * Chains effect nodes onto `inputs` from `items`: enabled calls as usual,
 * each commented-out run as its own nodes, marked disabled.
 */
function chainItems(inputs: ProgramNode[], items: Item[]): ProgramNode {
  let current = inputs;
  let run: Call[] = [];
  const flush = () => {
    if (run.length) current = [chainEffects(current, run)];
    run = [];
  };
  for (const item of items) {
    if ('call' in item) {
      run.push(item.call);
      continue;
    }
    flush();
    const before = new Set(current);
    const node = chainEffects(current, item.disabled);
    for (
      let at: ProgramNode | undefined = node;
      at && !before.has(at);
      at = at.inputs[0]
    )
      at.data.disabled = true;
    current = [node];
  }
  flush();
  return current.length === 1 ? current[0] : chainEffects(current, []);
}

function createParser(source: string, known: Known[], comments: Comment[]) {
  const unmatched = known.map((node) => ({
    ...node,
    text: normalize(node.text),
  }));
  const takeKnown = (text: string, skipCode = false) => {
    const index = unmatched.findIndex(
      (node) => node.text === text && !(skipCode && node.type === CODE),
    );
    return index === -1 ? undefined : unmatched.splice(index, 1)[0];
  };

  /**
   * A node for a base call an instrument models (`note("c e g")`), with
   * `used` = how many of the line's method calls it also writes (the Pad's
   * `n("0 2").scale("C:major")` is one node).
   */
  const modelled = (
    base: Expression,
    calls: (Call & { end: number })[],
  ): { node: ProgramNode; used: number } | null => {
    if (base.type !== 'CallExpression' || base.callee.type !== 'Identifier')
      return null;
    const text = slice(source, base);
    const call = {
      name: base.callee.name,
      args: base.arguments.map((arg) => valueOf(source, arg)),
      text,
    };
    const definitions = Object.values(nodeDefinitions);
    const [next] = calls;
    if (next)
      for (const definition of definitions) {
        const data = definition.parseClip?.(call, next);
        if (
          data &&
          normalize(definition.generate(data, { id: '' })) ===
            normalize(source.slice(base.start, next.end))
        )
          return { node: { type: definition.id, data, inputs: [] }, used: 1 };
      }
    for (const definition of definitions) {
      const data = definition.parseSource?.(call);
      if (
        data &&
        normalize(definition.generate(data, { id: '' })) === normalize(text)
      )
        return { node: { type: definition.id, data, inputs: [] }, used: 0 };
    }
    return null;
  };

  /** Marks every source feeding `node` switched off. */
  const switchOff = (node: ProgramNode) => {
    for (const member of flatten(node)) {
      const definition = nodeDefinitions[member.type];
      if (definition && isSource(definition)) member.data.disabled = true;
    }
    return node;
  };

  /** `part` is one part of a stack: `.hush()` at its end switches it off. */
  const tree = (expression: Expression, part = false): ProgramNode => {
    const { base, calls } = decompose(source, expression);
    const last = calls.at(-1);
    if (part && last && `${last.name}()` === HUSH && !last.args.length) {
      calls.pop();
      return switchOff(build(expression, base, calls));
    }
    return build(expression, base, calls);
  };

  const build = (
    expression: Expression,
    base: Expression,
    calls: (Call & { end: number })[],
  ): ProgramNode => {
    const model = modelled(base, calls);
    // Commented-out calls between this line's calls are disabled nodes.
    const items: Item[] = [
      ...calls.map((call) => ({ at: call.end, call })),
      ...comments.flatMap((comment) => {
        if (comment.start < base.end || comment.end > expression.end) return [];
        const disabled = commentCalls(comment.text);
        return disabled ? [{ at: comment.start, disabled }] : [];
      }),
    ].sort((a, b) => a.at - b.at);
    const after = (offset: number) => items.filter((item) => item.at > offset);
    // 1. An existing source node that writes exactly this code keeps its id
    //    (a Code node only while no instrument models its code).
    //    A shorter match than an instrument's model loses to the model (a
    //    Notes node no longer holds what is now a Pad's code).
    for (let used = calls.length; used >= (model?.used ?? 0); used--) {
      const end = used ? calls[used - 1].end : base.end;
      const match = takeKnown(
        normalize(source.slice(base.start, end)),
        used === 0 && model !== null,
      );
      if (match) {
        const { id, type, data } = match;
        const node = { id, type, data: { ...data }, inputs: [] };
        const rest = after(end);
        return rest.length ? chainItems([node], rest) : node;
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
      const inputs = base.arguments.map((arg) => tree(arg as Expression, true));
      return chainItems(inputs, after(base.end - 1));
    }
    // 3. A call an instrument models (`note("c e g")` is a Notes node).
    if (model) {
      const rest = model.used ? after(calls[model.used - 1].end) : items;
      return rest.length ? chainItems([model.node], rest) : model.node;
    }
    // 4. Anything else is a Code node holding the base expression.
    const inner =
      base.type === 'ParenthesizedExpression' ? base.expression : base;
    const node = {
      type: CODE,
      data: { customPattern: slice(source, inner) },
      inputs: [],
    };
    return items.length ? chainItems([node], items) : node;
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

  const tree = createParser(source, known, comments);
  const program: ParsedProgram = { prelude: '', lines: [] };
  const prelude: { start: number; text: string }[] = [];
  const lineRanges: { start: number; end: number }[] = [];
  /** Where each line starts, to keep disabled lines in their place. */
  const lineStarts = new Map<Line, number>();
  const layoutAbove = (start: number) =>
    comments.findLast(
      (comment) =>
        comment.end <= start &&
        !source.slice(comment.end, start).trim() &&
        comment.text.includes(LAYOUT),
    );
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
      const { label, muted, soloed } = labelOf(statement.label.name);
      // The `// @layout` comment right above the line is part of it.
      const layout = layoutAbove(statement.start);
      if (layout) lineRanges.push(layout);
      const parsed = line(
        label,
        muted,
        tree(statement.body.expression),
        layout && positionsOf(layout.text),
        soloed,
      );
      program.lines.push(parsed);
      lineStarts.set(parsed, statement.start);
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

  // Commented-out lines are disabled lines, in their place among the others.
  for (const block of disabledLines(source)) {
    const layout = layoutAbove(block.start);
    if (layout) lineRanges.push(layout);
    lineRanges.push(block);
    const parsed = line(
      block.line.label,
      block.line.muted,
      block.line.sink,
      layout && positionsOf(layout.text),
      block.line.soloed,
    );
    // Every source: the line is off when they all are.
    for (const member of flatten(parsed.sink)) {
      const definition = nodeDefinitions[member.type];
      if (definition && isSource(definition)) member.data.disabled = true;
    }
    program.lines.push(parsed);
    lineStarts.set(parsed, block.start);
  }
  program.lines.sort(
    (a, b) => (lineStarts.get(a) ?? 0) - (lineStarts.get(b) ?? 0),
  );

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

const COMMENT_LINE = /^(\s*)\/\/ ?(.*)$/;
const LABELLED = /^_?[A-Za-z_$][\w$]*\s*:/;

/**
 * Lines commented out whole (`// kick: s("bd")`, `//   .gain(1)` …): their
 * code, parsed, when it is exactly one line whose source is a call. Prose
 * comments (`// HATS: closed hats`) do not parse, so they stay comments.
 */
function disabledLines(source: string) {
  const found: { start: number; end: number; line: Line }[] = [];
  const rows = source.split('\n');
  const offsets: number[] = [];
  rows.reduce((at, row) => (offsets.push(at), at + row.length + 1), 0);
  for (let i = 0; i < rows.length; i++) {
    const head = COMMENT_LINE.exec(rows[i]);
    if (!head || !LABELLED.test(head[2])) continue;
    const body = [head[2]];
    let last = i;
    for (let j = i + 1; j < rows.length; j++) {
      const next = COMMENT_LINE.exec(rows[j]);
      // Continuations are indented, or start with `.` or an inner comment.
      if (!next || !/^(\s|\.|\/\/)/.test(next[2])) break;
      body.push(next[2]);
      last = j;
    }
    const result = parseProgram(body.join('\n'));
    if (!result.ok || result.program.lines.length !== 1) continue;
    if (result.program.prelude.trim()) continue;
    const [parsed] = result.program.lines;
    const first = flatten(parsed.sink).at(-1);
    // `todo: fix` is valid code but no music: the source must be a call.
    if (first?.type === CODE && !/\(/.test(String(first.data.customPattern)))
      continue;
    found.push({
      start: offsets[i],
      end: offsets[last] + rows[last].length,
      line: parsed,
    });
    i = last;
  }
  return found;
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
  soloed = false,
): Line {
  const nodes = flatten(sink).reverse();
  // A layout for a different number of nodes is stale; lay out anew.
  if (positions?.length === nodes.length)
    nodes.forEach((node, index) => (node.position = positions[index]));
  for (const node of flatten(sink)) {
    node.data = { ...node.data, state: muted ? 'paused' : 'running' };
    if (soloed) node.data.solo = true;
    else delete node.data.solo;
    delete node.data.label;
  }
  if (label !== ANONYMOUS) sink.data.label = label;
  return { label, muted, soloed, sink };
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
