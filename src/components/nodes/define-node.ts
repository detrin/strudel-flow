import { createElement, type ComponentType, type ReactNode } from 'react';
import type { iconMapping } from '@/data/icon-mapping';
import type { Call } from '@/lib/program/syntax';

type Common = {
  label: string;
  /** Strudel method this parameter is written as. Defaults to its key. */
  method?: string;
  /** Show the control only when this holds for the node's values. */
  when?: (values: Record<string, string | number>) => boolean;
};
export type Parameter = Common &
  (
    | {
        control: 'knob';
        /** The value a new node starts with. */
        default: number;
        /**
         * The value Strudel uses when the method is not written; defaults to
         * `default`. Values equal to it are left out of the code, and code
         * that leaves the method out reads back as it.
         */
        implicit?: number;
        min: number;
        max: number;
        step: number;
        unit?: string;
        format?: (value: number) => string;
      }
    | { control: 'text'; default: string; implicit?: string }
    | {
        control: 'select';
        default: string;
        implicit?: string;
        options: readonly { value: string; label: string }[];
      }
  );
export type Parameters = Record<string, Parameter>;
export type ParameterValues<P extends Parameters> = {
  [K in keyof P]: P[K] extends { control: 'knob' } ? number : string;
};
export type NodeControlsProps<
  P extends Parameters,
  D extends Record<string, unknown> = Record<never, never>,
> = {
  values: D & ParameterValues<P>;
  onChange: (updates: Partial<D & ParameterValues<P>>) => void;
  id: string;
  isPlaying: boolean;
  isMuted: boolean;
};
export type CustomControlsProps<D extends Record<string, unknown>> =
  NodeControlsProps<Record<never, never>, D>;
type ControlsContext = Pick<
  CustomControlsProps<Record<never, never>>,
  'id' | 'isPlaying' | 'isMuted'
>;
export type Category = 'Instruments' | 'Synths' | 'Audio Effects';
/** Per-node context the compiler passes to `generate`. */
export type GenerateContext = { id: string };

export type NodeDefinition = {
  id: string;
  title: string;
  category: Category;
  icon: keyof typeof iconMapping;
  order?: number;
  parameters: Parameters;
  defaults: Record<string, unknown>;
  getValues: (data: Record<string, unknown>) => Record<string, string | number>;
  /** Values → node data (parameters are stored as strings). */
  encode: (values: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Instruments return a full pattern expression (`s("bd*4")`).
   * Everything else returns the method calls it appends to its input,
   * without the leading dot (`lpf(800).lpq(4)`), or '' to pass through.
   */
  generate: (data: Record<string, unknown>, context: GenerateContext) => string;
  /** Canonical Strudel methods this node writes (effects only). */
  methods: readonly string[];
  /**
   * True when call order changes the sound (`fast().late()`). Otherwise the
   * calls only set controls, which commute.
   */
  ordered: boolean;
  /** Calls → node data, or null when this node cannot express them. */
  parse: (calls: Call[]) => Record<string, unknown> | null;
  /**
   * Instruments: reads a line's base call (`note("c e g")`) into node data,
   * or null. The node must write that call back exactly.
   */
  parseSource?: (call: Call) => Record<string, unknown> | null;
  renderControls?: (
    data: Record<string, unknown>,
    update: (data: Record<string, unknown>) => void,
    context: ControlsContext,
  ) => ReactNode;
};

export const isSource = (definition: Pick<NodeDefinition, 'category'>) =>
  definition.category === 'Instruments';

export const methodOf = (key: string, parameter: Parameter) =>
  parameter.method ?? key;
type Knob = Extract<Parameter, { control: 'knob' }>;

/**
 * Declares a knob: `knob('gain', 0.8, [0, 2, 0.01])`. Its Strudel method is
 * the parameter's key unless `method` says otherwise.
 */
export const knob = (
  label: string,
  value: number,
  [min, max, step]: [min: number, max: number, step: number],
  options: Partial<
    Omit<Knob, 'control' | 'default' | 'min' | 'max' | 'step'>
  > = {},
): Knob => ({
  control: 'knob',
  label,
  default: value,
  min,
  max,
  step,
  ...options,
});

export const implicitOf = (parameter: Parameter) =>
  parameter.implicit ?? parameter.default;

/**
 * A knob holds a number or, like Strudel itself, a pattern: the code of
 * its argument (`"<400 800>"`, `sine.range(200, 2000)`, `slider(0.5)`).
 */
export const isPatternValue = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim() !== '' &&
  !Number.isFinite(Number(value));

function parameterValues<P extends Parameters>(
  parameters: P,
  data: Record<string, unknown>,
): ParameterValues<P> {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, parameter]) => {
      const raw = data[key] ?? parameter.default;
      if (parameter.control === 'knob' && isPatternValue(raw))
        return [key, raw.trim()];
      const value = parameter.control === 'knob' ? Number(raw) : String(raw);
      return [
        key,
        typeof value === 'number' && !Number.isFinite(value)
          ? parameter.default
          : value,
      ];
    }),
  ) as ParameterValues<P>;
}

const literal = (value: string | number) =>
  typeof value === 'number' ? String(value) : JSON.stringify(value);

/**
 * The default code for parameter nodes: one call per parameter whose value
 * differs from Strudel's implicit one. A node whose parameters all match
 * still writes its first parameter, so it never disappears from the code.
 */
export function parameterCalls(
  parameters: Parameters,
  values: Record<string, string | number>,
) {
  const entries = Object.entries(parameters);
  const written = entries.filter(
    ([key, parameter]) => values[key] !== implicitOf(parameter),
  );
  return (written.length ? written : entries.slice(0, 1))
    .map(
      ([key, parameter]) =>
        `${methodOf(key, parameter)}(${
          parameter.control === 'knob' && isPatternValue(values[key])
            ? values[key]
            : literal(values[key])
        })`,
    )
    .join('.');
}

/** The default parser for parameter nodes: one literal per parameter. */
export function parseParameters(parameters: Parameters, calls: Call[]) {
  const byMethod = new Map(
    Object.entries(parameters).map(([key, parameter]) => [
      methodOf(key, parameter),
      [key, parameter] as const,
    ]),
  );
  const values: Record<string, string | number> = {};
  for (const { name, args } of calls) {
    const entry = byMethod.get(name);
    if (!entry || args.length !== 1) return null;
    const [key, parameter] = entry;
    const [arg] = args;
    if (parameter.control === 'knob') {
      const value =
        typeof arg === 'number'
          ? arg
          : typeof arg === 'string' && arg.trim()
            ? Number(arg)
            : NaN;
      // Not a plain number: keep the argument's code as a pattern value.
      values[key] = Number.isFinite(value)
        ? value
        : typeof arg === 'string'
          ? JSON.stringify(arg)
          : typeof arg === 'object'
            ? arg.code
            : String(arg);
    } else {
      if (typeof arg !== 'string') return null;
      if (
        parameter.control === 'select' &&
        !parameter.options.some((option) => option.value === arg)
      )
        return null;
      values[key] = arg;
    }
  }
  return values;
}

export function defineNode<
  const P extends Parameters,
  D extends Record<string, unknown> = Record<never, never>,
>(definition: {
  id: string;
  title: string;
  category: Category;
  icon: NodeDefinition['icon'];
  order?: number;
  parameters: P;
  defaults?: D;
  read?: (data: Record<string, unknown>) => Record<string, unknown>;
  /** Defaults to `parameterCalls` for parameter-only effect nodes. */
  generate?: (
    values: D & ParameterValues<P>,
    context: GenerateContext,
  ) => string;
  /** Defaults to the methods of the parameters. */
  methods?: readonly string[];
  ordered?: boolean;
  /** Defaults to `parseParameters`. */
  parse?: (calls: Call[]) => Partial<D & ParameterValues<P>> | null;
  parseSource?: (call: Call) => Partial<D & ParameterValues<P>> | null;
  component?: ComponentType<NodeControlsProps<P, D>>;
}): NodeDefinition {
  const {
    parameters,
    component,
    generate = (values) =>
      parameterCalls(parameters, values as Record<string, string | number>),
    defaults = {} as D,
    read = (data) => data,
    methods = Object.entries(parameters).map(([key, parameter]) =>
      methodOf(key, parameter),
    ),
    parse = (calls) =>
      parseParameters(parameters, calls) as Partial<
        D & ParameterValues<P>
      > | null,
    ordered = false,
    parseSource,
    ...metadata
  } = definition;
  const resolve = (data: Record<string, unknown>) => {
    const values = read(data);
    return {
      ...defaults,
      ...values,
      ...parameterValues(parameters, values),
    } as D & ParameterValues<P>;
  };
  const encode = (updates: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [
        key,
        key in parameters && value !== undefined ? String(value) : value,
      ]),
    );
  return {
    ...metadata,
    parameters,
    getValues: (data) => parameterValues(parameters, read(data)),
    encode,
    defaults: {
      ...defaults,
      ...encode(parameterValues(parameters, {})),
    },
    generate: (data, context) => generate(resolve(data), context),
    methods,
    ordered,
    parse: (calls) => {
      const values = parse(calls);
      // Whatever the code leaves out is what Strudel would use.
      const implicit = Object.fromEntries(
        Object.entries(parameters).map(([key, p]) => [key, implicitOf(p)]),
      );
      return values && encode({ ...implicit, ...values });
    },
    parseSource: parseSource
      ? (call) => {
          const values = parseSource(call);
          return values && encode({ ...values });
        }
      : undefined,
    renderControls: component
      ? (data, update, context) =>
          createElement(component, {
            ...context,
            values: resolve(data),
            onChange: (updates) => update(encode(updates)),
          })
      : undefined,
  };
}
