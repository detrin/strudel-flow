import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  Edge,
} from '@xyflow/react';

import type { AppNode } from '@/components/nodes/registry';
import { initialEdges, initialNodes } from '@/data/workflow-data';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { DEFAULT_THEME } from '@/themes';
import { applyTheme } from '@/themes/ui';

type AppState = {
  name: string;
  author: string;
  description: string;
  graphRevision: number;
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
    setCpm: (cpm) => set({ cpm }),
    setBpc: (bpc) => set({ bpc }),
    toggle: () =>
      set((state) => ({ isPlaying: !state.isPlaying, error: null })),
    setError: (error) => set({ error, ...(error ? { isPlaying: false } : {}) }),

    onNodesChange: (changes) => {
      set({ nodes: applyNodeChanges(changes, get().nodes) });
    },

    removeNode: (nodeId) =>
      set((state) => ({
        nodes: state.nodes.filter((node) => node.id !== nodeId),
        edges: state.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      })),

    setMuted: (nodeId, muted) =>
      set((state) => {
        const line = new Set(
          programOf(state)
            .lines.map((line) => flatten(line.sink).map((node) => node.id))
            .find((ids) => ids.includes(nodeId)) ?? [nodeId],
        );
        return {
          nodes: state.nodes.map((node) =>
            line.has(node.id)
              ? {
                  ...node,
                  data: { ...node.data, state: muted ? 'paused' : 'running' },
                }
              : node,
          ),
        };
      }),

    onEdgesChange: (changes) =>
      set({ edges: applyEdgeChanges(changes, get().edges) }),

    onConnect: (connection) => {
      if (connection.source === connection.target) return;
      const { source, target, sourceHandle, targetHandle } = connection;
      set({
        edges: addEdge(
          {
            id: `${source}-${target}`,
            source,
            target,
            type: 'default',
            ...(sourceHandle ? { sourceHandle } : {}),
            ...(targetHandle ? { targetHandle } : {}),
          },
          get().edges,
        ),
      });
    },

    setTheme: (theme) => {
      set({ theme });
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Not remembered; still applied.
      }
    },

    updateNodeData: (nodeId, updates) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...updates } }
            : node,
        ),
      })),
  })),
);

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
