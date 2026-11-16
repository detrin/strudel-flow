import { NodeContextMenu } from './node-context-menu';
import { ReactFlow, SelectionMode, useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { nodeTypes } from '@/components/nodes/node-types';
import deleteEdge from '@/components/edges/delete-edge';
import { useAppStore } from '@/store/app-store';
import { EditorToolbar } from './toolbar';
import { NodePalette } from './node-palette';
import { MixerPanel } from '@/components/mixer/mixer-panel';
import { NoteAnnotation } from '@/components/annotations/note-annotation';
import { FrameAnnotation } from '@/components/annotations/frame-annotation';
import {
  isAnnotationId,
  onAnnotationChanges,
  useAnnotations,
} from '@/lib/annotations';
import type { AppNode } from '@/components/nodes/types';
import type { NodeChange } from '@xyflow/react';
import { useUrlState } from '@/hooks/use-url-state';
import { useWorkflowRunner } from '@/hooks/use-workflow-runner';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { themeByName } from '@/themes';
import { startCodeSync } from '@/store/code-sync';
import { startBridge } from '@/lib/bridge/connect';
import { installWheelPassthrough } from '@/lib/wheel-passthrough';

const edgeTypes = { default: deleteEdge };
const allNodeTypes = {
  ...nodeTypes,
  'note-annotation': NoteAnnotation,
  'frame-annotation': FrameAnnotation,
};
/** Shift, ⌘ or Ctrl + click adds a node to the selection, as in Miro. */
const MULTI_SELECT_KEYS = ['Shift', 'Meta', 'Control'];
/** Room for the panels on the canvas edges, so they never cover nodes. */
const FIT_PADDING = {
  top: '72px',
  bottom: '64px',
  left: '72px',
  right: '24px',
} as const;

export default function Editor() {
  useUrlState();
  useWorkflowRunner();
  useKeyboardShortcuts();

  const { nodes, edges, theme, onNodesChange, onEdgesChange, onConnect } =
    useAppStore(
      useShallow((state) => ({
        nodes: state.nodes,
        edges: state.edges,
        theme: state.theme,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        onConnect: state.onConnect,
      })),
    );
  // Notes and frames (comments in the code) sit on the canvas too.
  const annotations = useAnnotations((state) => state.nodes);
  const allNodes = useMemo(
    () => [...annotations, ...nodes] as AppNode[],
    [annotations, nodes],
  );
  const onAllNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      const mine = (change: NodeChange<AppNode>) =>
        'id' in change && isAnnotationId(change.id);
      const own = changes.filter(mine);
      if (own.length) onAnnotationChanges(own as NodeChange[]);
      const rest = changes.filter((change) => !mine(change));
      if (rest.length) onNodesChange(rest);
    },
    [onNodesChange],
  );
  useEffect(startCodeSync, []);
  useEffect(startBridge, []);
  // Scrolling over a node part with nothing to scroll still pans.
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = wrapper.current;
    return root ? installWheelPassthrough(root) : undefined;
  }, []);

  // Nodes created from code may land off screen; bring them into view.
  const fitRequest = useAppStore((state) => state.fitRequest);
  const focusRequest = useAppStore((state) => state.focusRequest);
  const placing = useAppStore((state) => state.placing);
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!fitRequest) return;
    const frame = requestAnimationFrame(() =>
      fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 300 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, fitView]);
  useEffect(() => {
    if (!focusRequest) return;
    fitView({
      nodes: [{ id: focusRequest.id }],
      padding: FIT_PADDING,
      maxZoom: 1,
      duration: 300,
    });
  }, [focusRequest, fitView]);

  return (
    <NodeContextMenu>
      {(connectionHandlers) => (
        <div
          ref={wrapper}
          className="reactflow-wrapper"
          tabIndex={0}
          data-placing={placing ? '' : undefined}
          aria-label="Patch canvas. Drag nodes in from the left toolbar, double-click or right-click empty space, or press Tab on a selected node to add nodes."
        >
          <ReactFlow
            {...connectionHandlers}
            nodes={allNodes}
            edges={edges}
            onNodesChange={onAllNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={allNodeTypes}
            edgeTypes={edgeTypes}
            colorMode={themeByName(theme).dark ? 'dark' : 'light'}
            panActivationKeyCode={null}
            zoomOnDoubleClick={false}
            // Like Miro: dragging empty space draws a selection box (anything
            // it touches is selected, and moves together); Shift or ⌘/Ctrl +
            // click adds or removes a node. Two-finger swipe or the middle
            // mouse button pans, pinch (or Ctrl/⌘ + wheel) zooms. (Space is
            // play/stop, so it can't pan.)
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1]}
            multiSelectionKeyCode={MULTI_SELECT_KEYS}
            panOnScroll
            // 1:1 with the fingers (React Flow's default is half speed).
            panOnScrollSpeed={1}
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
            fitView
            fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
          >
            <EditorToolbar />
            <NodePalette />
            <MixerPanel />
          </ReactFlow>
        </div>
      )}
    </NodeContextMenu>
  );
}
