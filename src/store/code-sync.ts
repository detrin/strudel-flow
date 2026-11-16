import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { emitProgram } from '@/lib/program/emit';
import { layout } from '@/lib/program/reconcile';
import { updateLayout, withoutLayout } from '@/lib/program/layout-comments';
import { mergeCode } from '@/lib/program/merge';
import { readStrudelFile } from '@/lib/save-format';
import { useAppStore } from './app-store';
import { tidyLines } from '@/lib/tidy';
import { report, setProblem } from '@/lib/diagnostics';

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
export function setCode(code: string, { typing = false } = {}) {
  const state = useAppStore.getState();
  const merged = mergeCode(code, state);
  if (!merged.ok) {
    useAppStore.setState({ code, codeError: merged.error });
    return;
  }
  const { program, autoPlaced, created } = merged;
  const next = {
    nodes: merged.nodes,
    edges: merged.edges,
    cpm: program.cpm,
    bpc: program.bpc,
    prelude: program.prelude,
    tempoName: program.tempoName,
  };
  for (const id of autoPlaced) unmeasured.add(id);
  lastGraphCode = graphCode(next);
  useAppStore.setState({ tempoName: program.tempoName });
  useAppStore.getState().dispatch({
    type: 'setGraph',
    nodes: next.nodes,
    edges: next.edges,
    cpm: next.cpm,
    bpc: next.bpc,
    prelude: next.prelude,
    reason: typing ? 'code typed' : 'code',
  });
  useAppStore.setState({
    code,
    codeError: null,
    fitRequest: created.length ? state.fitRequest + 1 : state.fitRequest,
  });
  // Code from anywhere but the keyboard (Insert, a file, Claude) gets its
  // lines' `// @layout` comments now; typed code when the console is left,
  // never under the cursor.
  if (!typing) writeLayout();
}

/**
 * Writes the `// @layout` comments the code is missing (or that are out of
 * date), keeping everything else as written: the code then holds every
 * node's place, so saving it never loses them.
 */
export function writeLayout() {
  const state = useAppStore.getState();
  if (state.codeError) return;
  const laid = updateLayout(state.code, programOf(state));
  if (laid && laid !== state.code) useAppStore.setState({ code: laid });
}

/** The patch as a complete Strudel file: code, tempo and node positions. */
export const patchCode = () => graphCode(useAppStore.getState());

/** Replaces the whole patch with code, e.g. a code patch from the gallery. */
export function loadCode(
  file: string,
  meta: { name: string; author: string; description: string },
) {
  // A saved .strudel file starts with its format's version.
  const code = readStrudelFile(file);
  useAppStore.setState({ isPlaying: false, error: null, ...meta });
  useAppStore.getState().dispatch({
    type: 'setGraph',
    nodes: [],
    edges: [],
    prelude: '',
    reason: 'new patch',
  });
  setCode(code);
  requestLayoutCheck();
  // A fresh patch starts a fresh undo history.
  useAppStore.setState({
    graphRevision: useAppStore.getState().graphRevision + 1,
  });
}

let layoutCheck = false;
/**
 * After a patch opens: once the canvas has measured its nodes, tidy it if
 * any of them overlap (a layout saved when nodes were smaller, say).
 * Layouts that fit are left as they were arranged.
 */
export function requestLayoutCheck() {
  layoutCheck = true;
}
function checkLayout(state: State) {
  if (!layoutCheck || state.nodes.some((node) => !node.measured?.width)) return;
  layoutCheck = false;
  const box = (node: State['nodes'][number]) => ({
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + (node.measured?.width ?? 0),
    bottom: node.position.y + (node.measured?.height ?? 0),
  });
  const boxes = state.nodes.map(box);
  const overlap = boxes.some((a, i) =>
    boxes.some(
      (b, j) =>
        j > i &&
        a.left < b.right - 4 &&
        b.left < a.right - 4 &&
        a.top < b.bottom - 4 &&
        b.top < a.bottom - 4,
    ),
  );
  // Positions only: opening a patch never changes its code's order.
  if (overlap) tidyLines(undefined, false);
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
  useAppStore.getState().dispatch({
    type: 'setGraph',
    nodes,
    edges: state.edges,
    reason: 'layout',
  });
  useAppStore.setState({ fitRequest: state.fitRequest + 1 });
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
  const merged = mergeCode(code, state);
  if (!merged.ok) return;
  const types = (lines: { sink: Parameters<typeof flatten>[0] }[]) =>
    lines.flatMap((line) => flatten(line.sink).map((node) => node.type));
  if (
    types(merged.program.lines).join() !== types(programOf(state).lines).join()
  ) {
    setCode(code);
    // Its layout was made for the old nodes; check it once they're measured.
    requestLayoutCheck();
  }
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
    // The code follows the song; the canvas's own changes (a node measured)
    // may still lay new nodes out, which changes the song in turn.
    if (state.nodes !== previous.nodes || state.song !== previous.song) {
      // An error here would leave the code silently behind the canvas from
      // now on: catch it, say so, and keep trying on the next change.
      try {
        relayout(state);
        checkLayout(useAppStore.getState());
        const now = useAppStore.getState();
        if (now.song !== previous.song) sync(now);
        setProblem('code sync', null);
      } catch (error) {
        report('code sync', error, {
          nodes: state.nodes.map((node) => `${node.id}:${node.type}`),
        });
        setProblem(
          'code sync',
          `The code isn't following the canvas: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  });
}
