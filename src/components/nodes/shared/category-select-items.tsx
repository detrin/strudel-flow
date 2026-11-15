import { SelectItem } from '@/components/ui/select';
import { SoundCategory } from '@/data/sounds';

/**
 * Grouped options for a Select. `describe` adds words to a name ("bd ·
 * kick"); `problem` says why an option won't play (it is greyed out and
 * can't be picked); `current` is shown even when it isn't in the list.
 */
export function CategorySelectItems({
  categories,
  describe,
  problem,
  current,
}: {
  categories: SoundCategory[];
  describe?: (option: string) => string | undefined;
  problem?: (option: string) => string | undefined;
  current?: string;
}) {
  const listed = categories.some((cat) => cat.options.includes(current ?? ''));
  const item = (option: string) => {
    const words = describe?.(option);
    const why = problem?.(option);
    return (
      <SelectItem
        key={option}
        value={option}
        disabled={Boolean(why) && option !== current}
      >
        {option}
        {words && <span className="text-muted-foreground"> · {words}</span>}
        {why && <span className="text-muted-foreground"> ({why})</span>}
      </SelectItem>
    );
  };
  return (
    <>
      {current && !listed && (
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            In this song
          </div>
          {item(current)}
        </div>
      )}
      {categories.map((cat) => (
        <div key={cat.label}>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            {cat.label}
          </div>
          {cat.options.map(item)}
        </div>
      ))}
    </>
  );
}
