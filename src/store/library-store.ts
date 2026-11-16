import { create } from 'zustand';
import type { Preset } from '@/lib/library/presets';
import { isolateListeners } from '@/lib/diagnostics';

/**
 * The Library: saved presets (tracks) and the tags people give sounds.
 * With the dev server, they live in ~/.strudelton (one file per preset,
 * see mcp/library-files.mjs); without it (or with `?library=browser`), in
 * this browser's storage, which also keeps a copy. Presets can be exported.
 */

const KEY = 'strudelton:library';

type Saved = { presets: Preset[]; soundTags: Record<string, string[]> };

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved;
    if (saved && Array.isArray(saved.presets))
      return { presets: saved.presets, soundTags: saved.soundTags ?? {} };
  } catch {
    // Unreadable or unavailable storage: start empty.
  }
  return { presets: [], soundTags: {} };
}

export type LibraryTab = 'samples' | 'presets' | 'takes';

/** Where the Library is kept: a folder on disk, or this browser. */
export type LibraryStorage =
  { kind: 'browser' } | { kind: 'folder'; folder: string };

type LibraryState = Saved & {
  storage: LibraryStorage;
  /** Set when a change could not be written to the folder. */
  storageError?: string;
  open: boolean;
  tab: LibraryTab;
  /** A line to save as a preset (from a node's menu). */
  saving?: string;
  setOpen: (open: boolean) => void;
  setTab: (tab: LibraryTab) => void;
  /** Opens the Library on the save form for a line. */
  startSaving: (label: string) => void;
  savePreset: (preset: Omit<Preset, 'id' | 'createdAt'>) => Preset;
  updatePreset: (
    id: string,
    change: Partial<Pick<Preset, 'name' | 'tags'>>,
  ) => void;
  deletePreset: (id: string) => void;
  /** Adds presets from a file; returns how many were new. */
  importPresets: (presets: Preset[]) => number;
  setSoundTags: (name: string, tags: string[]) => void;
};

export const normalizeTag = (tag: string) =>
  tag.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30);
const cleanTags = (tags: string[]) =>
  [...new Set(tags.map(normalizeTag).filter(Boolean))].sort();
const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const useLibrary = create<LibraryState>()((set, get) => ({
  ...load(),
  storage: { kind: 'browser' },
  open: false,
  tab: 'samples',
  setOpen: (open) => set(open ? { open } : { open, saving: undefined }),
  setTab: (tab) => set({ tab }),
  startSaving: (label) => set({ open: true, tab: 'presets', saving: label }),
  savePreset: (input) => {
    const preset: Preset = {
      ...input,
      name: input.name.trim() || input.label,
      tags: cleanTags(input.tags),
      id: newId(),
      createdAt: Date.now(),
    };
    set({ presets: [preset, ...get().presets], saving: undefined });
    return preset;
  },
  updatePreset: (id, change) =>
    set({
      presets: get().presets.map((preset) =>
        preset.id === id
          ? {
              ...preset,
              ...change,
              ...(change.tags ? { tags: cleanTags(change.tags) } : {}),
            }
          : preset,
      ),
    }),
  deletePreset: (id) =>
    set({ presets: get().presets.filter((preset) => preset.id !== id) }),
  importPresets: (incoming) => {
    const known = new Set(get().presets.map((p) => `${p.name}\n${p.body}`));
    const fresh = incoming
      .filter(
        (p) =>
          p &&
          typeof p.body === 'string' &&
          typeof p.name === 'string' &&
          !known.has(`${p.name}\n${p.body}`),
      )
      .map((p) => ({
        id: newId(),
        name: p.name,
        body: p.body,
        label: typeof p.label === 'string' ? p.label : 'track',
        tags: cleanTags(Array.isArray(p.tags) ? p.tags : []),
        needs: Array.isArray(p.needs) ? p.needs : [],
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      }));
    set({ presets: [...fresh, ...get().presets] });
    return fresh.length;
  },
  setSoundTags: (name, tags) => {
    const soundTags = { ...get().soundTags, [name]: cleanTags(tags) };
    if (!soundTags[name].length) delete soundTags[name];
    set({ soundTags });
  },
}));
// One failing listener must not stop the others (see diagnostics).
isolateListeners(useLibrary, 'library');

/** True while loading from the folder: those changes are not saved back. */
let loading = false;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/__library${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok)
    throw new Error(
      ((await response.json().catch(() => ({}))) as { error?: string }).error ??
        `HTTP ${response.status}`,
    );
  return response.json() as Promise<unknown>;
}

/** Writes what changed between two states to the folder. */
async function writeChanges(state: Saved, previous: Saved) {
  const before = new Map(previous.presets.map((p) => [p.id, p]));
  const now = new Set(state.presets.map((p) => p.id));
  const writes: Promise<unknown>[] = [];
  for (const preset of state.presets)
    if (before.get(preset.id) !== preset)
      writes.push(
        request(`/presets/${encodeURIComponent(preset.id)}`, {
          method: 'PUT',
          body: JSON.stringify(preset),
        }),
      );
  for (const id of before.keys())
    if (!now.has(id))
      writes.push(
        request(`/presets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      );
  if (state.soundTags !== previous.soundTags)
    writes.push(
      request('/sound-tags', {
        method: 'PUT',
        body: JSON.stringify(state.soundTags),
      }),
    );
  await Promise.all(writes);
}

/**
 * Switches to the folder when the dev server offers one. The first time
 * (an empty folder), what this browser kept moves there.
 */
async function connectFolder() {
  let disk: Saved & { empty: boolean; folder: string };
  try {
    if (
      new URLSearchParams(window.location.search).get('library') === 'browser'
    )
      return;
    disk = (await request('')) as typeof disk;
    if (!Array.isArray(disk.presets)) return;
  } catch {
    return; // No dev server (a deployed site): stay in this browser.
  }
  const local = useLibrary.getState();
  const storage: LibraryStorage = { kind: 'folder', folder: disk.folder };
  if (
    disk.empty &&
    (local.presets.length || Object.keys(local.soundTags).length)
  ) {
    try {
      await writeChanges(local, { presets: [], soundTags: {} });
      useLibrary.setState({ storage });
    } catch (error) {
      useLibrary.setState({ storageError: String(error) });
    }
    return;
  }
  loading = true;
  useLibrary.setState({
    storage,
    presets: [...disk.presets].sort((a, b) => b.createdAt - a.createdAt),
    soundTags: disk.soundTags,
  });
  loading = false;
}

useLibrary.subscribe((state, previous) => {
  if (
    state.presets === previous.presets &&
    state.soundTags === previous.soundTags
  )
    return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ presets: state.presets, soundTags: state.soundTags }),
    );
  } catch {
    // Storage full or unavailable: kept for this visit only.
  }
  if (state.storage.kind === 'folder' && !loading)
    writeChanges(state, previous).then(
      () =>
        useLibrary.getState().storageError &&
        useLibrary.setState({ storageError: undefined }),
      (error: unknown) =>
        useLibrary.setState({
          storageError: `Couldn't save to ${state.storage.kind === 'folder' ? state.storage.folder : 'the folder'}: ${String(error)}`,
        }),
    );
});

if (typeof window !== 'undefined' && typeof fetch !== 'undefined')
  void connectFolder();
