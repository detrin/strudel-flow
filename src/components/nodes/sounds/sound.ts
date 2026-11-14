import type { Call } from '@/lib/program/syntax';

/** Voice and Drums both write `.sound("name")`. */
export type SoundData = { sound?: string };

export const soundCode = ({ sound }: SoundData) =>
  sound ? `sound(${JSON.stringify(sound)})` : '';

/** `.sound("name")` → `{ sound: "name" }` when `accepts(name)`. */
export const parseSound =
  (accepts: (sound: string) => boolean) =>
  ([call, ...rest]: Call[]) => {
    const [sound] = call?.args ?? [];
    return rest.length === 0 &&
      call.args.length === 1 &&
      typeof sound === 'string' &&
      accepts(sound)
      ? { sound }
      : null;
  };
