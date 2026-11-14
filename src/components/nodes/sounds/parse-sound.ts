import type { Call } from '@/lib/program/syntax';

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
