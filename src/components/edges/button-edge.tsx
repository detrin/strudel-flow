import { type ReactNode } from 'react';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

export const ButtonEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  children,
}: EdgeProps & { children: ReactNode }) => {
  // Into a node stacked below (a channel strip): a tidy stepped line
  // around the stack instead of a loop.
  const path = targetX < sourceX ? getSmoothStepPath : getBezierPath;
  const [edgePath, labelX, labelY] = path({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    ...(targetX < sourceX ? { borderRadius: 10, offset: 14 } : {}),
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {children}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
