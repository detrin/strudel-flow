export type ScopeData = {
  scopeScale?: string;
  /** The analyser id the code names, kept so reopening never renames it. */
  analyser?: string;
};
/** The analyser a Scope listens to: the one its code names, else its own. */
export const analyserOf = (nodeId: string, data: ScopeData) =>
  data.analyser ?? scopeId(nodeId);
export const DEFAULT_SCOPE_SCALE = 0.25;
export const scopeId = (nodeId: string) => `flow-scope-${nodeId}`;
