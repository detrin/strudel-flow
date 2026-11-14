/**
 * A patch as a program: what the code console shows and what the canvas
 * draws. Pure data, no positions — those live on the graph.
 */
export type ProgramNode = {
  /** Graph node id, when the node came from (or was matched to) the graph. */
  id?: string;
  type: string;
  data: Record<string, unknown>;
  /** Upstream nodes, in stack order. More than one means `stack(...)`. */
  inputs: ProgramNode[];
  /** Canvas position, saved in the code as a `// @layout` comment. */
  position?: { x: number; y: number };
};

/** One `label: expression` statement; `sink` is its last node. */
export type Line = { label: string; muted: boolean; sink: ProgramNode };

export type Program = {
  cpm: string;
  bpc: string;
  /** Statements that are not lines (`samples(...)`, `const x = ...`). */
  prelude: string;
  /**
   * The prelude constant the tempo is written with (`const BPM = 81` and
   * `setcpm(BPM/4)`); a new tempo is written into that constant.
   */
  tempoName?: string;
  lines: Line[];
};

export const ANONYMOUS = '$';
