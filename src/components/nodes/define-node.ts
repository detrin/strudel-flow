import { createElement, type ComponentType, type ReactNode } from 'react';
import type { iconMapping } from '@/data/icon-mapping';

type Common = {
  label: string;
  /** Strudel method this parameter is written as. Defaults to its key. */
  method?: string;
};
export type Parameter = Common &
  (
    | {
        control: 'knob';
        default: number;
        min: number;
        max: number;
        step: number;
        unit?: string;
        format?: (value: number) => string;
      }
    | { control: 'text'; default: string }
    | {
        control: 'select';
        default: string;
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
  updateValues: (
    data: Record<string, unknown>,
    updates: Record<string, unknown>,
  ) => Record<string, unknown>;
  /**
   * Instruments return a full pattern expression (`s("bd*4")`).
   * Everything else returns the method calls it appends to its input,
   * without the leading dot (`lpf(800).lpq(4)`), or '' to pass through.
   */
  generate: (data: Record<string, unknown>, context: GenerateContext) => string;
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

function parameterValues<P extends Parameters>(
  parameters: P,
  data: Record<string, unknown>,
): ParameterValues<P> {
  return Object.fromEntries(
    Object.entries(parameters).map(([key, parameter]) => {
      const raw = data[key] ?? parameter.default;
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
 * The default code for parameter nodes: one call per parameter that differs
 * from its default. A node whose parameters are all at their defaults still
 * writes its first parameter, so it never disappears from the code.
 */
export function parameterCalls(
  parameters: Parameters,
  values: Record<string, string | number>,
) {
  const entries = Object.entries(parameters);
  const changed = entries.filter(
    ([key, parameter]) => values[key] !== parameter.default,
  );
  return (changed.length ? changed : entries.slice(0, 1))
    .map(
      ([key, parameter]) =>
        `${methodOf(key, parameter)}(${literal(values[key])})`,
    )
    .join('.');
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
  write?: (
    updates: Partial<D & ParameterValues<P>>,
    data: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Defaults to `parameterCalls` for parameter-only effect nodes. */
  generate?: (
    values: D & ParameterValues<P>,
    context: GenerateContext,
  ) => string;
  component?: ComponentType<NodeControlsProps<P, D>>;
}): NodeDefinition {
  const {
    parameters,
    component,
    generate = (values) =>
      parameterCalls(parameters, values as Record<string, string | number>),
    defaults = {} as D,
    read = (data) => data,
    write,
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
  const updateValues = (
    data: Record<string, unknown>,
    updates: Record<string, unknown>,
  ) =>
    encode(
      write ? write(updates as Partial<D & ParameterValues<P>>, data) : updates,
    );
  return {
    ...metadata,
    parameters,
    getValues: (data) => parameterValues(parameters, read(data)),
    updateValues,
    defaults: {
      ...defaults,
      ...encode(
        write ? write(resolve({}), {}) : parameterValues(parameters, {}),
      ),
    },
    generate: (data, context) => generate(resolve(data), context),
    renderControls: component
      ? (data, update, context) =>
          createElement(component, {
            ...context,
            values: resolve(data),
            onChange: (updates) => update(updateValues(data, updates)),
          })
      : undefined,
  };
}
