import { type ReactNode } from 'react';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

/** Rows closer than this are one row (a curve, not a bus). */
const ROW_SLACK = 40;
/** Where a bus turns: this far before its target. */
const GUTTER = 28;

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
  // Three shapes, so wires never cross nodes:
  // - into a node stacked below (a channel strip): a stepped line around
  //   the stack instead of a loop;
  // - forward into another row (parts merging into one node): a bus, as
  //   in a circuit diagram: along its own row, through the empty space
  //   after the row's last node, turning only in the gutter just before
  //   the target, where the wires into it share one vertical line;
  // - along a row: a gentle curve.
  const backward = targetX < sourceX;
  const bus = !backward && Math.abs(targetY - sourceY) > ROW_SLACK;
  const [edgePath, labelX, labelY] =
    backward || bus
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 10,
          offset: 14,
          ...(bus ? { centerX: targetX - GUTTER } : {}),
        })
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
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
