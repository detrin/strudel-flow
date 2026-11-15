import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLibrary, slugOf } from '../../../mcp/library-files.mjs';

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'strudelton-test-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const preset = (id: string, name: string) => ({
  id,
  name,
  label: 'bass',
  body: 'note("c2")',
  needs: [],
  tags: ['bass'],
  createdAt: 1,
});

describe('the Library on disk', () => {
  it('names files after presets', () => {
    expect(slugOf('Acid bass!')).toBe('acid-bass');
    expect(slugOf('Příliš žluťoučký kůň')).toBe('prilis-zlutoucky-kun');
    expect(slugOf('???')).toBe('preset');
  });
  it('is empty until something is saved', () => {
    expect(createLibrary(root).read()).toEqual({
      presets: [],
      soundTags: {},
      empty: true,
    });
  });
  it('saves, renames and deletes presets as files', () => {
    const library = createLibrary(root);
    expect(library.savePreset(preset('a', 'Acid bass'))).toBe('acid-bass.json');
    expect(library.savePreset(preset('b', 'Acid bass'))).toBe(
      'acid-bass-2.json',
    );
    // Saving again under the same name keeps its file.
    expect(library.savePreset(preset('a', 'Acid bass'))).toBe('acid-bass.json');
    // Renaming moves the file.
    expect(library.savePreset(preset('a', 'Night bass'))).toBe(
      'night-bass.json',
    );
    expect(readdirSync(join(root, 'presets')).sort()).toEqual([
      'acid-bass-2.json',
      'night-bass.json',
    ]);
    expect(
      JSON.parse(readFileSync(join(root, 'presets', 'night-bass.json'), 'utf8'))
        .name,
    ).toBe('Night bass');
    expect(library.deletePreset('b')).toBe(true);
    expect(library.deletePreset('nope')).toBe(false);
    expect(library.read().presets.map((p: { id: string }) => p.id)).toEqual([
      'a',
    ]);
  });
  it('keeps sound tags, and skips files that are not presets', () => {
    const library = createLibrary(root);
    library.saveSoundTags({ casio: ['techno'] });
    library.savePreset(preset('a', 'One'));
    writeFileSync(join(root, 'presets', 'broken.json'), '{nope');
    expect(library.read()).toMatchObject({
      soundTags: { casio: ['techno'] },
      empty: false,
    });
    expect(library.read().presets).toHaveLength(1);
  });
});
