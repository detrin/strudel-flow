import WorkflowNode from './workflow-node';
import { ParameterKnob } from './parameter-knob';
import { useAppStore } from '@/store/app-store';
import type { WorkflowNodeProps } from '../types';
import type { NodeDefinition } from '../define-node';
import { ParameterField } from './parameter-field';

const formatNumber = (value: number, unit = '') =>
  `${Number(value.toFixed(Math.abs(value) < 0.1 ? 3 : 2))}${unit}`;

/** The generic node body: fields on top, knobs below. */
export function createDefinitionComponent(definition: NodeDefinition) {
  return function DefinitionNode({ id, data }: WorkflowNodeProps) {
    const update = useAppStore((state) => state.updateNodeData);
    const isPlaying = useAppStore((state) => state.isPlaying);
    const values = definition.getValues(data);
    const updateValues = (updates: Record<string, unknown>) =>
      update(id, updates);
    const updateParameter = (key: string, value: string | number) =>
      updateValues(definition.encode({ [key]: value }));
    const visible = Object.entries(definition.parameters).filter(
      ([, parameter]) => parameter.when?.(values) ?? true,
    );
    const knobs = visible.filter(([, p]) => p.control === 'knob');
    const fields = visible.filter(([, p]) => p.control !== 'knob');

    return (
      <WorkflowNode id={id} data={data} type={definition.id}>
        {definition.renderControls ? (
          definition.renderControls(data, updateValues, {
            id,
            isPlaying,
            isMuted: data.state === 'paused',
          })
        ) : (
          <div className="w-64 space-y-4 px-3 pt-1 pb-4">
            {fields.length > 0 && (
              <div className="grid grid-cols-2 gap-2 *:only:col-span-2">
                {fields.map(([key, parameter]) =>
                  parameter.control === 'knob' ? null : (
                    <ParameterField
                      key={key}
                      parameter={parameter}
                      value={String(values[key])}
                      onChange={(value) => updateParameter(key, value)}
                    />
                  ),
                )}
              </div>
            )}
            {knobs.length > 0 && (
              <div className="grid grid-cols-3 justify-items-center gap-x-2 gap-y-4">
                {knobs.map(([key, parameter]) =>
                  parameter.control === 'knob' ? (
                    <ParameterKnob
                      key={key}
                      label={parameter.label}
                      value={Number(values[key])}
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      format={
                        parameter.format ??
                        ((value) => formatNumber(value, parameter.unit))
                      }
                      onChange={(value) => updateParameter(key, value)}
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}
      </WorkflowNode>
    );
  };
}
