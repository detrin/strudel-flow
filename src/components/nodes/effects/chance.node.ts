import { defineNode } from '../define-node';

const CHANCES = [
  { value: 'almostNever', label: 'almost never' },
  { value: 'rarely', label: 'rarely' },
  { value: 'sometimes', label: 'sometimes' },
  { value: 'often', label: 'often' },
  { value: 'almostAlways', label: 'almost always' },
] as const;

/** `x => x.trans(12)` → `trans(12)`; null when x is used anywhere else. */
function body(code: string) {
  const match =
    /^\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\1\s*\.([\s\S]+)$/.exec(code);
  if (!match) return null;
  const [, name, rest] = match;
  return new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}\\b`).test(rest)
    ? null
    : rest.trim();
}

/**
 * Applies some calls to random events only: `sometimes(x => x.trans(12))`
 * jumps an octave now and then.
 */
export default defineNode({
  id: 'chance-node',
  title: 'Chance',
  category: 'Audio Effects',
  icon: 'Dices',
  order: 25,
  parameters: {
    chance: {
      control: 'select',
      label: 'how often',
      default: 'sometimes',
      options: CHANCES,
    },
    apply: { control: 'text', label: 'apply .', default: 'trans(12)' },
  },
  methods: CHANCES.map((chance) => chance.value),
  ordered: true,
  parse: (calls) => {
    if (calls.length !== 1) return null;
    const [{ name, args }] = calls;
    const [arg] = args;
    if (args.length !== 1 || typeof arg !== 'object') return null;
    const apply = body(arg.code);
    return apply ? { chance: name, apply } : null;
  },
  generate: ({ chance, apply }) => `${chance}(x => x.${apply})`,
});
