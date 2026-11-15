/**
 * MIDI controller mapping, like Ableton's MIDI learn: turn learn on,
 * click a knob, move a hardware knob or fader, and they are linked. Each
 * control change then sets the knob (and so the code). Mappings live in
 * this browser; a mapping follows its node through code edits by id, and
 * by line, node type and parameter when the id is gone.
 */
import { create } from 'zustand';
import { nodeDefinitions } from '@/components/nodes/registry';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';

/** A knob: which node, which parameter (and where, to find it again). */
export type Target = {
  nodeId: string;
  param: string;
  line?: string;
  type?: string;
};
export type Mapping = Target & { channel: number; cc: number };
/** A control change: channel 0–15, controller 0–127, value 0–127. */
export type ControlChange = { channel: number; cc: number; value: number };

/** Reads a control change from raw MIDI bytes, or null for anything else. */
export function controlChange(data: ArrayLike<number>): ControlChange | null {
  const [status, cc, value] = Array.from(data);
  if (status === undefined || (status & 0xf0) !== 0xb0) return null;
  return { channel: status & 0x0f, cc, value };
}

/** The mappings after linking `target` to `change`: one each way. */
export function learn(
  mappings: Mapping[],
  target: Target,
  change: ControlChange,
): Mapping[] {
  return [
    ...mappings.filter(
      (m) =>
        !(m.channel === change.channel && m.cc === change.cc) &&
        !(m.nodeId === target.nodeId && m.param === target.param),
    ),
    { ...target, channel: change.channel, cc: change.cc },
  ];
}

/** A 0–127 controller value on a knob's range, snapped to its step. */
export function scale(
  value: number,
  { min, max, step }: { min: number; max: number; step: number },
) {
  const raw = min + (value / 127) * (max - min);
  const snapped = min + Math.round((raw - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(5));
}

const KEY = 'strudelton:midi';
function saved(): Mapping[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

type Midi = {
  /** 'off' until access is asked; 'unsupported' or 'denied' if it fails. */
  status: 'off' | 'on' | 'unsupported' | 'denied';
  learning: boolean;
  /** The knob waiting for a control in learn mode. */
  armed: Target | null;
  mappings: Mapping[];
  /** The last control seen, to show that a device is talking. */
  last: ControlChange | null;
};
export const useMidi = create<Midi>()(() => ({
  status: 'off',
  learning: false,
  armed: null,
  mappings: saved(),
  last: null,
}));
useMidi.subscribe((state, previous) => {
  if (state.mappings === previous.mappings) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state.mappings));
  } catch {
    // Not remembered; still applied.
  }
});

/** Where a node is: its line label and type, to find it after edits. */
function locate(nodeId: string) {
  const state = useAppStore.getState();
  for (const line of programOf(state).lines)
    for (const node of flatten(line.sink))
      if (node.id === nodeId) return { line: line.label, type: node.type };
  return {};
}

/** The node a mapping drives now. */
function resolve(mapping: Mapping) {
  const state = useAppStore.getState();
  const byId = state.nodes.find((node) => node.id === mapping.nodeId);
  if (byId) return byId.id;
  if (!mapping.line || !mapping.type) return undefined;
  const line = programOf(state).lines.find((l) => l.label === mapping.line);
  return line
    ? flatten(line.sink).find((node) => node.type === mapping.type)?.id
    : undefined;
}

/** Arms a knob in learn mode (or disarms with null). */
export function arm(target: Target | null) {
  useMidi.setState({
    armed: target && { ...target, ...locate(target.nodeId) },
  });
}

export function unmap(target: Target) {
  useMidi.setState((state) => ({
    mappings: state.mappings.filter(
      (m) => !(m.nodeId === target.nodeId && m.param === target.param),
    ),
  }));
}

/** The mapping of a knob, if any. */
export const mappingOf = (mappings: Mapping[], target: Target) =>
  mappings.find((m) => m.nodeId === target.nodeId && m.param === target.param);

// Many changes a second: apply the latest per knob once a frame.
const queued = new Map<
  string,
  { nodeId: string; param: string; value: number }
>();
let frame = 0;
function flush() {
  frame = 0;
  const { updateNodeData, nodes } = useAppStore.getState();
  for (const { nodeId, param, value } of queued.values()) {
    const node = nodes.find((n) => n.id === nodeId);
    const definition = node && nodeDefinitions[node.type];
    if (definition)
      updateNodeData(nodeId, definition.encode({ [param]: value }));
  }
  queued.clear();
}

/** Handles one control change: learn it, or move the knobs it drives. */
export function receive(change: ControlChange) {
  const { learning, armed, mappings } = useMidi.getState();
  useMidi.setState({ last: change });
  if (learning && armed) {
    useMidi.setState({ mappings: learn(mappings, armed, change), armed: null });
    return;
  }
  for (const mapping of mappings) {
    if (mapping.channel !== change.channel || mapping.cc !== change.cc)
      continue;
    const nodeId = resolve(mapping);
    const node = useAppStore.getState().nodes.find((n) => n.id === nodeId);
    const parameter =
      node && nodeDefinitions[node.type]?.parameters[mapping.param];
    if (!nodeId || parameter?.control !== 'knob') continue;
    queued.set(`${nodeId}:${mapping.param}`, {
      nodeId,
      param: mapping.param,
      value: scale(change.value, parameter),
    });
  }
  if (queued.size && !frame) frame = requestAnimationFrame(flush);
}

type Port = { onmidimessage: ((event: { data: Uint8Array }) => void) | null };
type Access = {
  inputs: Map<string, Port>;
  onstatechange: (() => void) | null;
};

/** Asks for MIDI access and listens to every input (also ones plugged in later). */
export async function enableMidi() {
  if (useMidi.getState().status === 'on') return true;
  const request = (
    navigator as Navigator & { requestMIDIAccess?: () => Promise<Access> }
  ).requestMIDIAccess;
  if (!request) {
    useMidi.setState({ status: 'unsupported' });
    return false;
  }
  try {
    const access = await request.call(navigator);
    const listen = () =>
      access.inputs.forEach((input) => {
        input.onmidimessage = (event) => {
          const change = controlChange(event.data);
          if (change) receive(change);
        };
      });
    listen();
    access.onstatechange = listen;
    useMidi.setState({ status: 'on' });
    return true;
  } catch {
    useMidi.setState({ status: 'denied' });
    return false;
  }
}

/** Turns learn mode on (asking for MIDI first) or off. */
export async function toggleLearning() {
  if (useMidi.getState().learning) {
    useMidi.setState({ learning: false, armed: null });
    return;
  }
  if (await enableMidi()) useMidi.setState({ learning: true });
}
