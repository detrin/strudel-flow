import { useState } from 'react';
import {
  Code2,
  Plus,
  Power,
  PowerOff,
  Rows3,
  Trash2,
  VolumeX,
} from 'lucide-react';
import { Position } from '@xyflow/react';
import { WorkflowNodeData, AppNodeType } from '@/components/nodes/registry';
import { nodeDefinitions } from '@/components/nodes/registry';
import { BaseNode } from '@/components/nodes/shared/base-node';
import { useAppStore } from '@/store/app-store';
import PatternPopup from '@/components/nodes/shared/pattern-popup';
import { BaseHandle } from '@/components/nodes/shared/base-handle';
import { NodeMenu } from './node-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAddAfter } from '@/components/editor/add-node-context';
import { lineLabelOf, useLive } from '@/lib/live';
import { tidyLines } from '@/lib/tidy';

function WorkflowNode({
  id,
  data,
  type,
  children,
}: {
  id: string;
  data: WorkflowNodeData;
  type: AppNodeType;
  children?: React.ReactNode;
}) {
  const [showCode, setShowCode] = useState(false);
  const removeNode = useAppStore((state) => state.removeNode);
  const setMuted = useAppStore((state) => state.setMuted);
  const addAfter = useAddAfter();
  const sounding = useLive((state) => state.nodes.has(id));
  const category = nodeDefinitions[type]?.category;
  const isInstrument = category === 'Instruments';
  // A line's Arrange heads its row like a DAW track: its name and a mute.
  useAppStore((state) => state.edges);
  const label = type === 'arrange-node' ? lineLabelOf(id) : undefined;
  const isHeader = label !== undefined;
  const isPaused = data.state === 'paused';
  const updateNodeData = useAppStore((state) => state.updateNodeData);
  const disabled = Boolean(data.disabled);
  const isSource = isInstrument;
  // The line's first node is off: the whole line is commented out.
  const lineOff = useLive((state) => state.off.has(id));

  return (
    <BaseNode
      data-muted={isPaused || undefined}
      data-sounding={sounding || undefined}
      data-disabled={disabled || lineOff || undefined}
      className={
        isPaused ? 'border-amber-500/70 ring-1 ring-amber-500/25' : undefined
      }
    >
      <BaseHandle
        position={Position.Left}
        type="target"
        aria-label="Patch input"
        style={{ top: 28 }}
      />
      <BaseHandle
        position={Position.Right}
        type="source"
        aria-label="Patch output"
        style={{ top: 28 }}
      />
      {/* Miro-style "+": add the next node in this chain (or press Tab). */}
      <div
        className={cn(
          'node-add-after nodrag nopan pointer-events-none absolute top-[14px] -right-[42px]',
          isHeader && 'hidden',
        )}
      >
        <button
          type="button"
          title="Add next node (Tab)"
          aria-label={`Add a node after ${data.title}`}
          onClick={() => addAfter(id)}
          className="pointer-events-auto flex size-7 items-center justify-center rounded-full border border-primary/50 bg-card text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      <header className="mb-1 flex h-12 items-center gap-3 px-3">
        <h3 className="flex-1 text-[11px] font-semibold tracking-[.16em] uppercase">
          {isHeader ? (
            <>
              {label.startsWith('$') ? 'line' : label}
              <span className="ml-2 font-normal tracking-normal text-muted-foreground normal-case">
                arrange
              </span>
            </>
          ) : (
            data.title
          )}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            aria-label={`${disabled ? 'Enable' : 'Disable'} ${data.title}`}
            aria-pressed={disabled}
            title={
              disabled
                ? 'Enable: its code is uncommented'
                : isSource
                  ? 'Disable the whole line: its code is commented out'
                  : 'Disable: its code is commented out'
            }
            onClick={() => updateNodeData(id, { disabled: !disabled })}
            className={cn(
              'nodrag size-7 rounded-md p-1 text-muted-foreground',
              disabled && 'bg-destructive/15 text-destructive',
            )}
          >
            {disabled ? (
              <PowerOff className="size-3.5" />
            ) : (
              <Power className="size-3.5" />
            )}
          </Button>
          <NodeMenu
            id={id}
            items={[
              {
                label: showCode ? 'Hide code' : 'Edit code',
                icon: <Code2 />,
                onSelect: () => setShowCode(!showCode),
              },
              {
                label: 'Tidy line',
                icon: <Rows3 />,
                onSelect: () => tidyLines(id),
              },
              {
                label: 'Remove',
                icon: <Trash2 />,
                onSelect: () => removeNode(id),
                destructive: true,
              },
            ]}
          />
        </div>
      </header>
      {isPaused && (
        <div
          role="status"
          className="mx-2 mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-800 dark:text-amber-200"
        >
          <VolumeX className="size-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-semibold">Muted</p>
            <p className="text-[10px] opacity-80">This line is silent</p>
          </div>
          <button
            aria-label={`Unmute ${data.title} line`}
            onClick={() => setMuted(id, false)}
            className="nodrag rounded-md border border-amber-600/30 bg-background/70 px-2 py-1.5 text-xs font-semibold hover:bg-background"
          >
            Unmute
          </button>
        </div>
      )}
      {children}
      {showCode && <PatternPopup id={id} />}
    </BaseNode>
  );
}
export default WorkflowNode;
