import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ColorMode,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  Edge,
} from '@xyflow/react';

import type { AppNode } from '@/components/nodes/registry';
import { initialEdges, initialNodes } from '@/data/workflow-data';
import { findConnectedComponents } from '@/lib/graph-utils';

type AppState = {
  name: string;
  author: string;
  description: string;
  graphRevision: number;
  nodes: AppNode[];
  edges: Edge[];
  colorMode: ColorMode;
  theme: string;
  cpm: string;
  bpc: string;
  /** Code statements that are not lines; kept verbatim. */
  prelude: string;
  pattern: string;
  /** The code console's text; in sync with the graph (see code-sync). */
  code: string;
  codeError: string | null;
  /** Bumped when code adds nodes, so the canvas can bring them into view. */
  fitRequest: number;
  console: ConsoleLayout;
  isPlaying: boolean;
  error: string | null;
};

/** The code console panel; remembered per browser. */
export type ConsoleLayout = { open: boolean; width: number };
const CONSOLE_KEY = 'strudel-flow:console';
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

type AppActions = {
  setConsole: (layout: Partial<ConsoleLayout>) => void;
  setCpm: (cpm: string) => void;
  setBpc: (bpc: string) => void;
  setPattern: (pattern: string) => void;
  toggle: () => void;
  setError: (error: string | null) => void;
  setColorMode: (colorMode: ColorMode) => void;
  onNodesChange: OnNodesChange<AppNode>;
  removeNode: (nodeId: string) => void;
  setGroupState: (nodeId: string, state: 'running' | 'paused') => void;
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
    theme: 'caffeine',
    colorMode: 'system',
    cpm: '120',
    bpc: '4',
    prelude: '',
    pattern: '',
    code: '',
    codeError: null,
    fitRequest: 0,
    console: savedConsole(),
    isPlaying: false,
    error: null,
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
    setPattern: (pattern) => set({ pattern }),
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

    setGroupState: (nodeId, playbackState) =>
      set((state) => {
        const group = new Set(
          findConnectedComponents(state.nodes, state.edges).find((ids) =>
            ids.includes(nodeId),
          ) ?? [nodeId],
        );
        return {
          nodes: state.nodes.map((node) =>
            group.has(node.id)
              ? { ...node, data: { ...node.data, state: playbackState } }
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

    setTheme: (theme) => set({ theme }),

    setColorMode: (colorMode) => set({ colorMode }),

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

const systemAppearance = window.matchMedia('(prefers-color-scheme: dark)');
function applyColorMode() {
  const { colorMode } = useAppStore.getState();
  document.documentElement.classList.toggle(
    'dark',
    colorMode === 'dark' ||
      (colorMode === 'system' && systemAppearance.matches),
  );
}
const unsubscribeAppearance = useAppStore.subscribe(
  (state) => state.colorMode,
  applyColorMode,
  {
    fireImmediately: true,
  },
);
systemAppearance.addEventListener('change', applyColorMode);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeAppearance();
    systemAppearance.removeEventListener('change', applyColorMode);
  });
}
