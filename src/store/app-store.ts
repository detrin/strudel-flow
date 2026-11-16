import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  Edge,
} from '@xyflow/react';

import type { AppNode } from '@/components/nodes/registry';
import { initialEdges, initialNodes } from '@/data/workflow-data';
import {
  apply,
  CommandError,
  logCommand,
  problemsOf,
  type Command,
} from '@/lib/commands';
import { DEFAULT_THEME } from '@/themes';
import { applyTheme } from '@/themes/ui';
import { isolateListeners, report, setProblem } from '@/lib/diagnostics';
import { songOf, type Song } from '@/lib/song';

type AppState = {
  name: string;
  author: string;
  description: string;
  graphRevision: number;
  /**
   * The model (lib/song): nodes, wires, tempo, prelude, without view
   * state. Follow it, not `nodes`, for anything about the music: it only
   * changes when the song does. `nodes`/`edges` are the canvas's view.
   */
  song: Song;
  nodes: AppNode[];
  edges: Edge[];
  /** strudel.cc theme name; a per-browser preference, not part of patches. */
  theme: string;
  cpm: string;
  bpc: string;
  /** Code statements that are not lines; kept verbatim. */
  prelude: string;
  /** The prelude constant the tempo is written with, see Program. */
  tempoName?: string;
  /** The code console's text; in sync with the graph (see code-sync). */
  code: string;
  codeError: string | null;
  /** Bumped when code adds nodes, so the canvas can bring them into view. */
  fitRequest: number;
  console: ConsoleLayout;
  /** Connection to a local MCP server (Claude Code), see lib/bridge. */
  bridge: 'off' | 'connecting' | 'connected';
  isPlaying: boolean;
  /**
   * Something played instead of the song for a moment (a preset from the
   * Library); the song comes back when it ends.
   */
  preview: { id: string; code: string } | null;
  error: string | null;
  /** Node type waiting to be placed by a click on the canvas (toolbar). */
  placing: string | null;
  /** A node to bring into view (an agent pointing at it). */
  focusRequest?: { id: string; at: number };
};

/** The code console panel; remembered per browser. */
export type ConsoleLayout = { open: boolean; width: number };
const CONSOLE_KEY = 'strudelton:console';
function savedConsole(): ConsoleLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(CONSOLE_KEY) ?? 'null');
    if (typeof saved?.open === 'boolean' && Number.isFinite(saved?.width))
      return saved;
  } catch {
    // Storage can be unavailable (private mode); use the default.
  }
  return { open: true, width: 440 };
}

const THEME_KEY = 'strudelton:theme';
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

type AppActions = {
  /**
   * Applies a change to the song (see lib/commands): the one way to change
   * its nodes, wires and tempo. Returns false when the command is refused.
   */
  dispatch: (command: Command) => boolean;
  setConsole: (layout: Partial<ConsoleLayout>) => void;
  setCpm: (cpm: string) => void;
  setBpc: (bpc: string) => void;
  toggle: () => void;
  setError: (error: string | null) => void;
  setPlacing: (type: string | null) => void;
  onNodesChange: OnNodesChange<AppNode>;
  removeNode: (nodeId: string) => void;
  /** Mutes or unmutes every line the node is part of. */
  setMuted: (nodeId: string, muted: boolean) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
  onConnect: OnConnect;
  setTheme: (theme: string) => void;
  onEdgesChange: OnEdgesChange<Edge>;
};

type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    graphRevision: 0,
    name: 'Untitled patch',
    author: '',
    description: '',
    nodes: initialNodes,
    edges: initialEdges,
    song: songOf({
      nodes: initialNodes,
      edges: initialEdges,
      cpm: '120',
      bpc: '4',
      prelude: '',
    }),
    theme: savedTheme(),
    cpm: '120',
    bpc: '4',
    prelude: '',
    code: '',
    codeError: null,
    fitRequest: 0,
    console: savedConsole(),
    bridge: 'off',
    isPlaying: false,
    preview: null,
    error: null,
    placing: null,
    setPlacing: (placing) => set({ placing }),
    setConsole: (layout) => {
      const next = { ...get().console, ...layout };
      set({ console: next });
      try {
        localStorage.setItem(CONSOLE_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; still applied.
      }
    },
    dispatch: (command) => {
      let change;
      try {
        change = apply(get(), command);
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        report('command', error, command.type);
        return false;
      }
      // The view and the model in one update: the song is rebuilt from
      // the changed canvas, reusing whatever did not change.
      const state = get();
      set({ ...change, song: songOf({ ...state, ...change }, state.song) });
      logCommand(command);
      // In development, a command that broke the song says so at once.
      if (import.meta.env.DEV) {
        const problems = problemsOf(get());
        setProblem(
          'song',
          problems.length
            ? `The song is inconsistent after ${command.type}: ${problems.join('; ')}`
            : null,
        );
      }
      return true;
    },
    setCpm: (cpm) => void get().dispatch({ type: 'setTempo', cpm }),
    setBpc: (bpc) => void get().dispatch({ type: 'setTempo', bpc }),
    toggle: () =>
      set((state) => ({
        isPlaying: !state.isPlaying,
        preview: null,
        error: null,
      })),
    setError: (error) =>
      set({ error, ...(error ? { isPlaying: false, preview: null } : {}) }),

    onNodesChange: (changes) =>
      void get().dispatch({ type: 'nodeChanges', changes }),

    removeNode: (nodeId) =>
      void get().dispatch({ type: 'remove', ids: [nodeId] }),

    setMuted: (nodeId, muted) =>
      void get().dispatch({ type: 'setMuted', id: nodeId, muted }),

    onEdgesChange: (changes) =>
      void get().dispatch({ type: 'edgeChanges', changes }),

    onConnect: (connection) =>
      void get().dispatch({ type: 'connect', connection }),

    setTheme: (theme) => {
      set({ theme });
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Not remembered; still applied.
      }
    },

    updateNodeData: (nodeId, updates) =>
      void get().dispatch({ type: 'setData', updates: { [nodeId]: updates } }),
  })),
);
// One failing listener must not stop the others (see diagnostics).
isolateListeners(useAppStore, 'app store');

/**
 * The song follows the canvas even when something sets the canvas without
 * a command (a test, older code): first in line, so every other listener
 * sees a song that matches.
 */
useAppStore.subscribe((state, previous) => {
  if (
    state.song === previous.song &&
    (state.nodes !== previous.nodes ||
      state.edges !== previous.edges ||
      state.cpm !== previous.cpm ||
      state.bpc !== previous.bpc ||
      state.prelude !== previous.prelude)
  ) {
    const song = songOf(state, state.song);
    if (song !== state.song) useAppStore.setState({ song });
  }
});

const unsubscribeTheme = useAppStore.subscribe(
  (state) => state.theme,
  applyTheme,
  { fireImmediately: true },
);

if (import.meta.hot) import.meta.hot.dispose(unsubscribeTheme);

/**
 * A hot reload re-runs this module and would start a fresh store: the
 * default patch, with no code; the autosave would then keep that over the
 * open song. So the new store takes the previous one's data (the actions
 * come from the new code). Vite runs no dispose hook for a module re-run
 * this way, hence the global.
 */
if (import.meta.hot) {
  const scope = globalThis as { __strudeltonStore?: typeof useAppStore };
  const previous = scope.__strudeltonStore;
  if (previous && previous !== useAppStore)
    useAppStore.setState(
      Object.fromEntries(
        Object.entries(previous.getState()).filter(
          ([, value]) => typeof value !== 'function',
        ),
      ) as Partial<AppState>,
    );
  scope.__strudeltonStore = useAppStore;
}
