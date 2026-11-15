import { NodeContextMenu } from './node-context-menu';
import { ReactFlow, useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { nodeTypes } from '@/components/nodes/registry';
import deleteEdge from '@/components/edges/delete-edge';
import { useAppStore } from '@/store/app-store';
import { EditorToolbar } from './toolbar';
import { NodePalette } from './node-palette';
import { useUrlState } from '@/hooks/use-url-state';
import { useWorkflowRunner } from '@/hooks/use-workflow-runner';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { themeByName } from '@/themes';
import { startCodeSync } from '@/store/code-sync';
import { startBridge } from '@/lib/bridge/connect';

const edgeTypes = { default: deleteEdge };
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
  useEffect(startCodeSync, []);
  useEffect(startBridge, []);

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
      {(connectionHandlers, onAddNode) => (
        <div
          className="reactflow-wrapper"
          tabIndex={0}
          data-placing={placing ? '' : undefined}
          aria-label="Patch canvas. Drag nodes in from the left toolbar, double-click or right-click empty space, or press Tab on a selected node to add nodes."
        >
          <ReactFlow
            {...connectionHandlers}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={themeByName(theme).dark ? 'dark' : 'light'}
            panActivationKeyCode={null}
            zoomOnDoubleClick={false}
            // Like Miro: two-finger swipe pans, pinch (or Ctrl/⌘ + wheel) zooms.
            panOnScroll
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
            minZoom={0.1}
            fitView
            fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
          >
            <EditorToolbar onAddNode={onAddNode} />
            <NodePalette />
          </ReactFlow>
        </div>
      )}
    </NodeContextMenu>
  );
}
