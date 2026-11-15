import { useEffect, useRef, type ReactElement } from 'react';
import {
  addEdge,
  reconnectEdge,
  useReactFlow,
  type Edge,
  type Connection,
  type OnConnectEnd,
  type ReactFlowProps,
  type XYPosition,
} from '@xyflow/react';
import type { RadialMenuHandle } from '@/components/ui/radial-menu';
import {
  RadialMenu,
  RadialMenuItem,
  RadialMenuSubItem,
} from '@/components/ui/radial-menu';
import {
  createNodeByType,
  nodeDefinitions,
  type AppNodeType,
} from '@/components/nodes/registry';
import { iconMapping } from '@/data/icon-mapping';
import { radialMenuItems } from '@/data/radial-menu';
import { useAppStore } from '@/store/app-store';
import { getMenuSize } from '@/components/ui/radial-menu/geometry';
import { dropPosition, insertNodeAfter } from '@/lib/node-placement';
import { AddAfterContext, NODE_DRAG_TYPE } from './add-node-context';

type ConnectionHandlers = Pick<
  ReactFlowProps,
  | 'onConnectEnd'
  | 'onReconnect'
  | 'onReconnectEnd'
  | 'onClick'
  | 'onDoubleClick'
  | 'onDragOver'
  | 'onDrop'
>;

const isPane = (target: EventTarget | null) =>
  target instanceof Element && target.classList.contains('react-flow__pane');

const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [role="menu"]',
  );

export function NodeContextMenu({
  children,
}: {
  children: (handlers: ConnectionHandlers) => ReactElement;
}) {
  const menuRef = useRef<RadialMenuHandle>(null);
  const pending = useRef<PendingConnection | null>(null);
  const { screenToFlowPosition, getViewport } = useReactFlow();

  const placeAt = (type: AppNodeType, point: XYPosition) => {
    const newNode = createNodeByType({
      type,
      position: dropPosition(screenToFlowPosition(point)),
    });
    useAppStore.setState((state) => ({
      nodes: [
        ...state.nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        { ...newNode, selected: true },
      ],
    }));
  };

  const openFromHandle: OnConnectEnd = (event, state) => {
    pending.current = null;
    if (state.isValid || !state.fromNode || !state.fromHandle) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (
      !point ||
      !isPane(document.elementFromPoint(point.clientX, point.clientY))
    )
      return;
    pending.current = {
      nodeId: state.fromNode.id,
      handleId: state.fromHandle.id ?? null,
      type: state.fromHandle.type,
    };
    menuRef.current?.openAt({ x: point.clientX, y: point.clientY }, true);
  };

  /** The "+" beside a node: pick a type, it is added right after the node. */
  const openAfter = (nodeId: string) => {
    const element = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`,
    );
    const bounds = element?.getBoundingClientRect();
    if (!bounds) return;
    const size = getMenuSize(window.innerWidth, window.innerHeight);
    pending.current = {
      nodeId,
      handleId: null,
      type: 'source',
      insertAfter: true,
    };
    menuRef.current?.openAt(
      { x: bounds.right + 24 + size / 2, y: bounds.top + 28 },
      true,
    );
  };

  const placing = useAppStore((state) => state.placing);
  const setPlacing = useAppStore((state) => state.setPlacing);

  const handlers: ConnectionHandlers = {
    onConnectEnd: openFromHandle,
    onReconnect: (edge, connection) =>
      useAppStore.setState((state) => ({
        edges: reconnectEdge(edge, connection, state.edges),
      })),
    onReconnectEnd: (event, edge, _type, state) => {
      openFromHandle(event, state);
      if (pending.current) pending.current.edge = edge;
    },
    // Toolbar click-to-place: the next click on the canvas puts it there.
    // A click on the empty canvas itself (target is the pane element).
    onClick: (event) => {
      if (!placing || !isPane(event.target)) return;
      placeAt(placing, { x: event.clientX, y: event.clientY });
      setPlacing(null);
    },
    onDoubleClick: (event) => {
      if (placing || !isPane(event.target)) return;
      pending.current = null;
      menuRef.current?.openAt({ x: event.clientX, y: event.clientY }, true);
    },
    onDragOver: (event) => {
      if (!event.dataTransfer.types.includes(NODE_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (event) => {
      const type = event.dataTransfer.getData(NODE_DRAG_TYPE);
      if (!Object.prototype.hasOwnProperty.call(nodeDefinitions, type)) return;
      event.preventDefault();
      setPlacing(null);
      placeAt(type, { x: event.clientX, y: event.clientY });
    },
  };

  // Tab adds after the selected node; Escape leaves click-to-place.
  const openAfterRef = useRef(openAfter);
  openAfterRef.current = openAfter;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isTyping(event.target))
        return;
      if (event.key === 'Escape' && useAppStore.getState().placing) {
        useAppStore.getState().setPlacing(null);
        return;
      }
      if (
        event.key !== 'Tab' ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const selected = useAppStore
        .getState()
        .nodes.filter((node) => node.selected);
      if (selected.length !== 1) return;
      event.preventDefault();
      openAfterRef.current(selected[0].id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const position = useRef({ x: 0, y: 0 });
  const addNode = (type: AppNodeType) => {
    const origin = pending.current;
    pending.current = null;
    if (origin?.insertAfter) {
      const newNode = createNodeByType({ type });
      useAppStore.setState((state) => {
        const graph = insertNodeAfter(state, origin.nodeId, newNode);
        return {
          edges: graph.edges,
          nodes: graph.nodes.map((node) =>
            node.id === newNode.id
              ? { ...node, selected: true }
              : node.selected
                ? { ...node, selected: false }
                : node,
          ),
        };
      });
      return;
    }
    const canvas = document
      .querySelector('.reactflow-wrapper')
      ?.getBoundingClientRect();
    if (!canvas) return;
    const { zoom } = getViewport();
    const existing = useAppStore
      .getState()
      .nodes.find((node) => node.type === type);
    const width = (existing?.measured?.width ?? 500) * zoom;
    const height = (existing?.measured?.height ?? 500) * zoom;
    const inset = 24;
    const spawn = {
      x: Math.max(
        canvas.left + inset,
        Math.min(position.current.x, canvas.right - width - inset),
      ),
      y: Math.max(
        canvas.top + inset,
        Math.min(position.current.y, canvas.bottom - height - inset),
      ),
    };
    const newNode = createNodeByType({
      type,
      position: screenToFlowPosition(spawn),
    });
    useAppStore.setState((state) => {
      let edges = state.edges;
      if (origin && state.nodes.some((node) => node.id === origin.nodeId)) {
        const connection = connectionToNode(origin, newNode.id);
        edges = origin.edge
          ? reconnectEdge(origin.edge, connection, edges)
          : addEdge({ ...connection, type: 'default' }, edges);
      }
      return { nodes: [...state.nodes, newNode], edges };
    });
  };

  return (
    <AddAfterContext.Provider value={openAfter}>
      <RadialMenu
        ariaLabel="Add nodes"
        openOnTouchTap
        isTriggerTarget={(target) =>
          isPane(target) && !useAppStore.getState().placing
        }
        menuRef={menuRef}
        trigger={children(handlers)}
        onPositionChange={(point, fromHandle) => {
          position.current = point;
          if (!fromHandle) pending.current = null;
        }}
      >
        {radialMenuItems.map(({ label, category, icon: Icon, items }) => (
          <RadialMenuItem
            key={category}
            label={label}
            icon={<Icon strokeWidth={1.7} />}
          >
            {items.map((node) => {
              const NodeIcon = iconMapping[node.icon];
              return (
                <RadialMenuSubItem
                  key={node.id}
                  aria-label={`Add ${node.title}`}
                  icon={<NodeIcon aria-hidden="true" />}
                  onSelect={() => addNode(node.id)}
                >
                  {node.title}
                </RadialMenuSubItem>
              );
            })}
          </RadialMenuItem>
        ))}
      </RadialMenu>
    </AddAfterContext.Provider>
  );
}

type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  type: 'source' | 'target';
  edge?: Edge;
  /** From a node's "+": splice the new node in right after it. */
  insertAfter?: boolean;
};

function connectionToNode(
  origin: PendingConnection,
  nodeId: string,
): Connection {
  return origin.type === 'source'
    ? {
        source: origin.nodeId,
        sourceHandle: origin.handleId,
        target: nodeId,
        targetHandle: null,
      }
    : {
        source: nodeId,
        sourceHandle: null,
        target: origin.nodeId,
        targetHandle: origin.handleId,
      };
}
