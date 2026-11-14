import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitProgram } from '@/lib/program/emit';
import { knownSources, parseProgram } from '@/lib/program/parse';
import { layout, reconcile } from '@/lib/program/reconcile';
import { updateLayout, withoutLayout } from '@/lib/program/layout-comments';
import { useAppStore } from './app-store';

type State = ReturnType<typeof useAppStore.getState>;

const graphCode = (state: Parameters<typeof programOf>[0]) =>
  emitProgram(programOf(state));

/** The code the graph last wrote; graph changes that don't change it are ignored. */
let lastGraphCode = '';
/** Nodes placed with estimated sizes, laid out again once measured. */
let unmeasured = new Set<string>();

/**
 * Applies code typed in the console: parse, reconcile with the canvas, keep
 * the user's text as typed. Invalid code only records the error.
 */
export function setCode(code: string) {
  const state = useAppStore.getState();
  const result = parseProgram(code, knownSources(state.nodes));
  if (!result.ok) {
    useAppStore.setState({ code, codeError: result.error });
    return;
  }
  const { program } = result;
  const { autoPlaced, ...graph } = reconcile(program, state);
  const next = {
    ...graph,
    cpm: program.cpm ?? state.cpm,
    bpc: program.bpc ?? state.bpc,
    prelude: program.prelude,
    tempoName: program.tempoName,
  };
  const before = new Set(state.nodes.map((node) => node.id));
  const created = graph.nodes.filter((node) => !before.has(node.id));
  for (const id of autoPlaced) unmeasured.add(id);
  lastGraphCode = graphCode(next);
  useAppStore.setState({
    ...next,
    code,
    codeError: null,
    fitRequest: created.length ? state.fitRequest + 1 : state.fitRequest,
  });
}

/** The patch as a complete Strudel file: code, tempo and node positions. */
export const patchCode = () => graphCode(useAppStore.getState());

/** Replaces the whole patch with code, e.g. a code patch from the gallery. */
export function loadCode(
  code: string,
  meta: { name: string; author: string; description: string },
) {
  useAppStore.setState({
    nodes: [],
    edges: [],
    prelude: '',
    isPlaying: false,
    error: null,
    ...meta,
  });
  setCode(code);
  // A fresh patch starts a fresh undo history.
  useAppStore.setState({
    graphRevision: useAppStore.getState().graphRevision + 1,
  });
}

/** Re-runs the layout for code-created nodes once the canvas measured them. */
function relayout(state: State) {
  const pending = state.nodes.filter((node) => unmeasured.has(node.id));
  if (!pending.length || pending.some((node) => !node.measured?.width)) return;
  unmeasured = new Set();
  const nodes = state.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
  }));
  const { lines } = programOf({ ...state, nodes });
  layout(
    { nodes, edges: state.edges },
    lines,
    new Set(pending.map((node) => node.id)),
  );
  useAppStore.setState({ nodes, fitRequest: state.fitRequest + 1 });
}

/**
 * Re-reads a patch's own code when newer nodes would model it differently
 * (a saved `s("bd")` Code node becomes a Sound node), so patches saved
 * before a node existed pick it up. Positions and sounds stay the same.
 */
export function upgradePatch() {
  const state = useAppStore.getState();
  if (!state.nodes.length) return;
  const code = graphCode(state);
  const result = parseProgram(code, knownSources(state.nodes));
  if (!result.ok) return;
  const types = (lines: { sink: Parameters<typeof flatten>[0] }[]) =>
    lines.flatMap((line) => flatten(line.sink).map((node) => node.type));
  if (
    types(result.program.lines).join() !== types(programOf(state).lines).join()
  )
    setCode(code);
}

/** Rewrites the console whenever the canvas changes what the code says. */
export function startCodeSync() {
  const sync = (state: State) => {
    const code = graphCode(state);
    if (code === lastGraphCode) return;
    // Only positions moved: touch the layout comments, keep the user's text.
    const moved =
      withoutLayout(code) === withoutLayout(lastGraphCode) &&
      !state.codeError &&
      updateLayout(state.code, programOf(state));
    lastGraphCode = code;
    useAppStore.setState({ code: moved || code, codeError: null });
  };
  sync(useAppStore.getState());
  upgradePatch();
  return useAppStore.subscribe((state, previous) => {
    if (
      state.nodes !== previous.nodes ||
      state.edges !== previous.edges ||
      state.cpm !== previous.cpm ||
      state.bpc !== previous.bpc ||
      state.prelude !== previous.prelude
    ) {
      relayout(state);
      sync(useAppStore.getState());
    }
  });
}
