import type { Plugin } from 'vite';

type Preset = { id: string; name: string } & Record<string, unknown>;

export function libraryRoot(): string;
export function slugOf(name: string): string;
export function createLibrary(root?: string): {
  root: string;
  read(): {
    presets: Preset[];
    soundTags: Record<string, string[]>;
    empty: boolean;
  };
  savePreset(preset: Preset): string;
  deletePreset(id: string): boolean;
  saveSoundTags(tags: Record<string, string[]>): void;
};
export function libraryFiles(): Plugin;
