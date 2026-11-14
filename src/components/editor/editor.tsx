import { NodeContextMenu } from './node-context-menu';
import { ReactFlow, useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { nodeTypes } from '@/components/nodes/registry';
import deleteEdge from '@/components/edges/delete-edge';
import { useAppStore } from '@/store/app-store';
import { EditorToolbar } from './toolbar';
import { useUrlState } from '@/hooks/use-url-state';
import { useWorkflowRunner } from '@/hooks/use-workflow-runner';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useThemeCss } from '@/hooks/use-theme-css';
import { startCodeSync } from '@/store/code-sync';

const edgeTypes = { default: deleteEdge };

export default function Editor() {
  useUrlState();
  useWorkflowRunner();
  useKeyboardShortcuts();

  const {
    nodes,
    edges,
    colorMode,
    theme,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useAppStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      colorMode: state.colorMode,
      theme: state.theme,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      onConnect: state.onConnect,
    })),
  );
  useThemeCss(theme);
  useEffect(startCodeSync, []);

  // Nodes created from code may land off screen; bring them into view.
  const fitRequest = useAppStore((state) => state.fitRequest);
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!fitRequest) return;
    const frame = requestAnimationFrame(() =>
      fitView({ padding: 0.2, maxZoom: 1, duration: 300 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [fitRequest, fitView]);

  return (
    <NodeContextMenu>
      {(connectionHandlers, onAddNode) => (
        <div
          className="reactflow-wrapper"
          tabIndex={0}
          aria-label="Patch canvas. Right-click or tap empty space to add nodes."
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
            colorMode={colorMode}
            panActivationKeyCode={null}
            minZoom={0.2}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          >
            <EditorToolbar onAddNode={onAddNode} />
          </ReactFlow>
        </div>
      )}
    </NodeContextMenu>
  );
}
