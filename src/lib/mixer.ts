/**
 * Track controls for the lines of the open patch, like a DAW mixer: solo,
 * mute and level per line. Solo writes Strudel's own `S` label prefix
 * (`Skick:`), mute its `_`, so the code plays the same on strudel.cc.
 */
import { create } from 'zustand';
import { isPatternValue } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';
import { useAppStore } from '@/store/app-store';
import { setCode } from '@/store/code-sync';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitProgram } from '@/lib/program/emit';
import type { Line } from '@/lib/program/types';

/** The ids of every node in the line that holds `nodeId`. */
function lineIds(lines: Line[], nodeId: string) {
  return new Set(
    lines
      .map((line) => flatten(line.sink).map((node) => node.id))
      .find((ids) => ids.includes(nodeId)) ?? [nodeId],
  );
}

/**
 * Solos the line holding `nodeId`, or un-solos it. Like Ableton, a solo
 * on its own replaces the others; `add` keeps them (Cmd/Ctrl-click).
 */
export function setSoloed(nodeId: string, soloed: boolean, add = false) {
  const state = useAppStore.getState();
  const own = lineIds(programOf(state).lines, nodeId);
  useAppStore.setState({
    nodes: state.nodes.map((node) => {
      const solo = own.has(node.id) ? soloed : add && node.data.solo === true;
      if (Boolean(node.data.solo) === solo) return node;
      const data = { ...node.data };
      if (solo) data.solo = true;
      else delete data.solo;
      return { ...node, data };
    }),
  });
}

/** Clears every solo. */
export function clearSolo() {
  const state = useAppStore.getState();
  if (!state.nodes.some((node) => node.data.solo)) return;
  useAppStore.setState({
    nodes: state.nodes.map((node) => {
      if (!node.data.solo) return node;
      const data = { ...node.data };
      delete data.solo;
      return { ...node, data };
    }),
  });
}

/** Whether the mixer is open (a view setting, not part of the song). */
export const useMixer = create<{ open: boolean; toggle: () => void }>()(
  (set) => ({
    open: false,
    toggle: () => set((state) => ({ open: !state.open })),
  }),
);

/** A line as the mixer shows it. */
export type Strip = {
  /** The line's name (`$` for unnamed). */
  label: string;
  /** A node of the line, to address it. */
  nodeId: string;
  /** The line's Level node, if it has one. */
  levelId?: string;
  /** Its gain: a number, or a pattern's code. */
  gain: number | string;
};

/** One strip per line of the program, in code order. */
export function stripsOf(lines: Line[]): Strip[] {
  return lines.map((line) => {
    const nodes = flatten(line.sink);
    const level = nodes.find((node) => node.type === 'level-node');
    // Gain set elsewhere (an LFO from a Modulate node) is a pattern too.
    const other = level
      ? undefined
      : nodes
          .map((node) =>
            nodeDefinitions[node.type]?.generate(node.data, { id: '' }),
          )
          .find((code) => code && /(^|\.)gain\(/.test(code));
    const raw = other ?? level?.data.gain ?? 0.8;
    const gain = isPatternValue(raw) ? raw : Number(raw);
    return {
      label: line.label,
      nodeId: line.sink.id!,
      levelId: level?.id,
      gain: Number.isFinite(gain) || typeof gain === 'string' ? gain : 0.8,
    };
  });
}

/** Gives the line holding `nodeId` a Level node at its end. */
export function addLevel(nodeId: string) {
  const state = useAppStore.getState();
  const program = programOf(state);
  const index = program.lines.findIndex((line) =>
    flatten(line.sink).some((node) => node.id === nodeId),
  );
  if (index === -1) return;
  const line = program.lines[index];
  const level = nodeDefinitions['level-node'];
  program.lines[index] = {
    ...line,
    sink: { type: level.id, data: { ...level.defaults }, inputs: [line.sink] },
  };
  setCode(emitProgram(program));
}
