import { defineNode, knob, textCode, textValue } from '../define-node';

/**
 * Stereo play: `jux(rev)` plays the line as is on the left and changed by
 * a function on the right; `juxBy(0.5, rev)` keeps the two sides closer.
 */
export default defineNode({
  id: 'stereo-node',
  title: 'Stereo',
  category: 'Audio Effects',
  icon: 'Headphones',
  order: 9,
  parameters: {
    // The function is code (`rev`, `press`, `fast(2)`), so it starts with =.
    fn: { control: 'text', label: 'right side', default: '=rev' },
    width: knob('width', 1, [0, 1, 0.01]),
  },
  methods: ['jux', 'juxBy'],
  ordered: true,
  parse: (calls) => {
    if (calls.length !== 1) return null;
    const [{ name, args }] = calls;
    if (name === 'jux' && args.length === 1)
      return { fn: textValue(args[0]), width: 1 };
    if (name === 'juxBy' && args.length === 2 && typeof args[0] === 'number')
      return { width: args[0], fn: textValue(args[1]) };
    return null;
  },
  generate: ({ fn, width }) =>
    width === 1 ? `jux(${textCode(fn)})` : `juxBy(${width}, ${textCode(fn)})`,
});
