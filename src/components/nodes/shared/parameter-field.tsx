import type { Parameter } from '../define-node';

/** A select or text field. */
export function ParameterField({
  parameter,
  value,
  onChange,
}: {
  parameter: Exclude<Parameter, { control: 'knob' }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const className =
    'nodrag w-full min-w-0 rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground';
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] text-muted-foreground">
      {parameter.label}
      {parameter.control === 'select' ? (
        <select
          className={className}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {parameter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={`${className} font-mono`}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
