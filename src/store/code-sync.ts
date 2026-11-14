import { programOf } from '@/lib/program';
import { emitProgram } from '@/lib/program/emit';
import { knownSources, parseProgram } from '@/lib/program/parse';
import { layout, reconcile } from '@/lib/program/reconcile';
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
  const graph = reconcile(program, state);
  const next = {
    ...graph,
    cpm: program.cpm ?? state.cpm,
    bpc: program.bpc ?? state.bpc,
    prelude: program.prelude,
  };
  const before = new Set(state.nodes.map((node) => node.id));
  const created = graph.nodes.filter((node) => !before.has(node.id));
  for (const node of created) unmeasured.add(node.id);
  lastGraphCode = graphCode(next);
  useAppStore.setState({
    ...next,
    code,
    codeError: null,
    fitRequest: created.length ? state.fitRequest + 1 : state.fitRequest,
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

/** Rewrites the console whenever the canvas changes what the code says. */
export function startCodeSync() {
  const sync = (state: State) => {
    const code = graphCode(state);
    if (code === lastGraphCode) return;
    lastGraphCode = code;
    useAppStore.setState({ code, codeError: null });
  };
  sync(useAppStore.getState());
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
