import { defineNode, knob } from '../define-node';

export const WAVES = [
  'sine',
  'cosine',
  'saw',
  'isaw',
  'tri',
  'square',
  'perlin',
  'rand',
];
/** Controls worth modulating, by the method that sets them. */
export const TARGETS = [
  'lpf',
  'hpf',
  'lpq',
  'gain',
  'pan',
  'room',
  'delay',
  'speed',
  'crush',
  'distort',
];
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
const number = /-?\d+(?:\.\d+)?/.source;
const SIGNAL = new RegExp(
  `^(${WAVES.join('|')})\\.range\\((${number}),\\s*(${number})\\)(?:\\.slow\\((${number})\\))?$`,
);

/** An LFO: `.lpf(sine.range(200, 2000).slow(4))`. */
export default defineNode({
  id: 'modulate-node',
  title: 'Modulate',
  category: 'Audio Effects',
  icon: 'AudioWaveform',
  order: 14,
  parameters: {
    target: {
      control: 'select',
      label: 'target',
      default: 'lpf',
      options: options(TARGETS),
    },
    wave: {
      control: 'select',
      label: 'wave',
      default: 'sine',
      options: options(WAVES),
    },
    min: { control: 'text', label: 'from', default: '200' },
    max: { control: 'text', label: 'to', default: '2000' },
    cycles: knob('cycles', 4, [0.25, 64, 0.25]),
  },
  methods: TARGETS,
  parse: ([call, ...rest]) => {
    const [arg] = call?.args ?? [];
    if (rest.length || call.args.length !== 1 || typeof arg !== 'object')
      return null;
    const match = SIGNAL.exec(arg.code.replace(/\s+/g, ' ').trim());
    if (!match || !TARGETS.includes(call.name)) return null;
    const [, wave, min, max, cycles = '1'] = match;
    return { target: call.name, wave, min, max, cycles: Number(cycles) };
  },
  generate: ({ target, wave, min, max, cycles }) => {
    const value = (text: string) =>
      Number.isFinite(Number(text)) ? Number(text) : 0;
    const slow = cycles === 1 ? '' : `.slow(${cycles})`;
    return `${target}(${wave}.range(${value(min)}, ${value(max)})${slow})`;
  },
});
