import { useAppStore } from '@/store/app-store';
import { nodeTypes, type AppNode } from '@/components/nodes/registry';
import type { ProjectState } from './project-state';

export function capturePatch(): ProjectState {
  const { name, author, description, nodes, edges, cpm, bpc, prelude } =
    useAppStore.getState();
  return {
    name: name.trim() || 'Untitled patch',
    author: author.trim(),
    description: description.trim(),
    nodes: nodes.map(({ id, type, position, data }) => ({
      id,
      type,
      position,
      data,
    })),
    edges: edges.map(
      ({ id, source, target, sourceHandle, targetHandle, type }) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        type,
      }),
    ),
    cpm,
    bpc,
    ...(prelude ? { prelude } : {}),
  };
}

export function applyPatch(state: ProjectState): boolean {
  if (
    state.nodes.some(
      (node) =>
        !Object.prototype.hasOwnProperty.call(nodeTypes, node.type ?? ''),
    )
  )
    return false;
  useAppStore.setState({
    graphRevision: useAppStore.getState().graphRevision + 1,
    name: state.name ?? 'Untitled patch',
    author: state.author ?? '',
    description: state.description ?? '',
    nodes: state.nodes as AppNode[],
    edges: state.edges,
    cpm: state.cpm,
    bpc: state.bpc ?? '4',
    prelude: state.prelude ?? '',
    isPlaying: false,
    error: null,
  });
  return true;
}
