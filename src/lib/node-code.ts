import { nodeDefinitions } from '@/components/nodes/registry';
import { isSource } from '@/components/nodes/define-node';
import { useAppStore } from '@/store/app-store';
import { programOf } from '@/lib/program';
import { emitProgram } from '@/lib/program/emit';
import { knownSources, parseProgram } from '@/lib/program/parse';
import { setCode } from '@/store/code-sync';

/**
 * Applies edited code for one node: the node is swapped for raw code (a
 * Code node for an instrument, a Method node for an effect) and the patch
 * is re-read, so the code becomes whatever node models it (`lpf(1200)` a
 * Filter, `s("bd*4")` a Code node) in the same place. Returns an error
 * message when the code is not valid.
 */
export function applyNodeCode(id: string, text: string): string | null {
  const state = useAppStore.getState();
  const node = state.nodes.find((n) => n.id === id);
  const definition = node && nodeDefinitions[node.type];
  if (!node || !definition) return 'This node no longer exists.';
  // The snippet must be valid on its own; a raw node would otherwise
  // quietly drop what it cannot write.
  const alone = parseProgram(
    isSource(definition)
      ? `$: ${text}`
      : `$: s("x").${text.replace(/^\./, '')}`,
  );
  if (!alone.ok) return alone.error;
  const raw = isSource(definition)
    ? { type: 'custom-node', data: { customPattern: text } }
    : { type: 'method-node', data: { calls: text.replace(/^\./, '') } };
  const nodes = state.nodes.map((n) =>
    n.id === id
      ? { ...n, type: raw.type, data: { ...raw.data, state: n.data.state } }
      : n,
  );
  const code = emitProgram(programOf({ ...state, nodes }));
  const parsed = parseProgram(code, knownSources(nodes));
  if (!parsed.ok) return parsed.error;
  setCode(code);
  return null;
}
