import type { CustomControlsProps } from '../../define-node';
import type { SoundData } from '../sound';
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DRUM_CATEGORIES, DRUM_NAMES } from '@/data/sounds';
import { drumProblem, useSoundNames } from '@/lib/library/sounds';
import { useLineBank } from '@/components/nodes/shared/use-line-bank';
import { CategorySelectItems } from '@/components/nodes/shared/category-select-items';

export function DrumSoundsNode({
  id,
  values: data,
  onChange,
}: CustomControlsProps<SoundData>) {
  const sound = data.sound ?? '';
  const names = useSoundNames();
  const bank = useLineBank(id);
  const problem = (name: string) => drumProblem(names, name, bank);

  const handleValueChange = (value: string) => {
    onChange({ sound: value });
  };

  return (
    <div className="flex w-64 flex-col gap-3 px-4 pt-1 pb-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          ['bd', 'Kick'],
          ['sd', 'Snare'],
          ['hh', 'Hat'],
          ['cp', 'Clap'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={sound === value}
            onClick={() => handleValueChange(value)}
            className="nodrag rounded-md border border-border bg-background/40 py-5 text-[10px] text-muted-foreground transition hover:border-primary/50 aria-pressed:border-primary/60 aria-pressed:bg-primary/15 aria-pressed:text-primary"
          >
            {label}
          </button>
        ))}
      </div>
      <Select value={sound} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="More sounds" />
        </SelectTrigger>
        <SelectContent>
          <CategorySelectItems
            categories={DRUM_CATEGORIES}
            describe={(name) => DRUM_NAMES[name]}
            problem={problem}
            current={sound}
          />
        </SelectContent>
      </Select>
    </div>
  );
}
