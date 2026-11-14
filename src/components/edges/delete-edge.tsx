import { EdgeProps, useInternalNode, useReactFlow } from '@xyflow/react';
import { memo } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ButtonEdge } from '@/components/edges/button-edge';

const DeleteEdge = memo((props: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const target = useInternalNode(props.target);
  // A line's Arrange sits at the start of its row as the track header; the
  // wire into it would cross the whole row backwards.
  if (target?.type === 'arrange-node' && props.targetX < props.sourceX)
    return null;

  const onDeleteEdge = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== props.id));
  };

  return (
    <ButtonEdge
      {...props}
      style={{
        ...props.style,
        stroke: 'var(--primary)',
        strokeWidth: 2,
        opacity: props.selected ? 1 : 0.4,
      }}
    >
      {props.selected && (
        <Button
          aria-label="Disconnect modules"
          onClick={onDeleteEdge}
          size="icon"
          variant="secondary"
          className="h-8 w-8 rounded-full border hover:bg-muted transition-colors"
        >
          <X size={12} />
        </Button>
      )}
    </ButtonEdge>
  );
});

DeleteEdge.displayName = 'DeleteEdge';

export default DeleteEdge;
