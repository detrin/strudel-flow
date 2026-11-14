import { createContext, useContext } from 'react';

/** Drag-and-drop data type for a node type dragged from the toolbar. */
export const NODE_DRAG_TYPE = 'application/x-strudel-node';

/** Opens the add menu for the "+" next to a node (Miro-style). */
export const AddAfterContext = createContext<(nodeId: string) => void>(
  () => {},
);
export const useAddAfter = () => useContext(AddAfterContext);
