import type { Edge } from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { compileGraph } from './compile';
import type { Program } from './types';

/** The program a patch plays: its graph plus tempo and prelude. */
export const programOf = (
  patch: { nodes: AppNode[]; edges: Edge[] } & Omit<Program, 'lines'>,
) => compileGraph(patch.nodes, patch.edges, patch);
