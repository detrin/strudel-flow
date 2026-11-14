import { stateFromJson, type ProjectState } from './project-state';

type Meta = { name: string; author: string; description: string };
/** A patch from `patches/`: graph JSON, or Strudel code (`.strudel`). */
export type CommunityPatch = Meta & { id: string } & (
    | { state: ProjectState; code?: undefined }
    | { code: string; state?: undefined }
  );

const files = import.meta.glob<string>('../../patches/*.{json,strudel}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/** `// @name Undertow` style header comments of a code patch. */
export function codeMeta(code: string): Partial<Meta> {
  return Object.fromEntries(
    [...code.matchAll(/^\/\/\s*@(name|author|description)\s+(.+)$/gm)].map(
      ([, key, value]) => [key, value.trim()],
    ),
  );
}

const valid = (meta: Partial<Meta>): meta is Meta =>
  Boolean(meta.name?.trim() && meta.author?.trim());

export const communityPatches: CommunityPatch[] = Object.entries(files)
  .flatMap(([id, text]): CommunityPatch[] => {
    if (id.endsWith('.strudel')) {
      const meta = { description: '', ...codeMeta(text) };
      return valid(meta) ? [{ id, ...meta, code: text }] : [];
    }
    const state = stateFromJson(text);
    if (!state) return [];
    const meta = { description: '', ...state };
    return valid(meta) && typeof meta.description === 'string'
      ? [
          {
            id,
            name: meta.name,
            author: meta.author,
            description: meta.description,
            state,
          },
        ]
      : [];
  })
  .sort((a, b) => a.name.localeCompare(b.name));
