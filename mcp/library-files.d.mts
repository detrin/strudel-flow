import type { Plugin } from 'vite';

type Preset = { id: string; name: string } & Record<string, unknown>;
export type TakeDetails = {
  name: string;
  savedAt: number;
} & Record<string, unknown>;

export function libraryRoot(): string;
export function slugOf(name: string): string;
export const TAKE_NAME: RegExp;
export function takeNameOf(name: string): string;
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
  listTakes(): TakeDetails[];
  saveTake(
    name: string,
    take: { raw: Buffer; tuned: Buffer } & Record<string, unknown>,
  ): TakeDetails;
  readTake(name: string, kind?: 'tuned' | 'raw'): Buffer | undefined;
  deleteTake(name: string): boolean;
};
export function libraryFiles(): Plugin;
