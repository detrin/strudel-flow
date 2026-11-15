/**
 * Track controls for the lines of the open patch, like a DAW mixer: solo,
 * mute and level per line. Solo writes Strudel's own `S` label prefix
 * (`Skick:`), mute its `_`, so the code plays the same on strudel.cc.
 */
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
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
