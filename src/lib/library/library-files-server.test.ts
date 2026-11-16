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
import {
  TAKE_NAME,
  createLibrary,
  slugOf,
  takeNameOf,
} from '../../../mcp/library-files.mjs';

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

describe('takes on disk', () => {
  const wav = (n: number) => Buffer.from([82, 73, 70, 70, n]);
  it('names takes as Strudel sounds', () => {
    expect(takeNameOf('Clean windows!')).toBe('clean_windows');
    expect(takeNameOf('2 girls')).toBe('take_2_girls');
    expect(TAKE_NAME.test('vox_today')).toBe(true);
    expect(TAKE_NAME.test('Vox')).toBe(false);
    expect(TAKE_NAME.test('../x')).toBe(false);
  });
  it('saves both WAVs and the details, lists and deletes them', () => {
    const library = createLibrary(root);
    expect(library.listTakes()).toEqual([]);
    const saved = library.saveTake('vox', {
      raw: wav(1),
      tuned: wav(2),
      key: 'D',
      scale: 'major',
      amount: 1,
    });
    expect(saved).toMatchObject({ name: 'vox', key: 'D', amount: 1 });
    expect(readdirSync(join(root, 'takes')).sort()).toEqual([
      'vox.json',
      'vox.raw.wav',
      'vox.wav',
    ]);
    expect(library.readTake('vox')).toEqual(wav(2));
    expect(library.readTake('vox', 'raw')).toEqual(wav(1));
    expect(library.listTakes().map((take) => take.name)).toEqual(['vox']);
    // Retuning writes over the tuned one; the raw one is what was sent.
    library.saveTake('vox', { raw: wav(1), tuned: wav(3), amount: 0.5 });
    expect(library.readTake('vox')).toEqual(wav(3));
    expect(library.deleteTake('vox')).toBe(true);
    expect(library.listTakes()).toEqual([]);
    expect(library.deleteTake('vox')).toBe(false);
  });
  it('refuses names that are not sounds (no paths)', () => {
    const library = createLibrary(root);
    expect(() =>
      library.saveTake('../evil', { raw: wav(1), tuned: wav(1) }),
    ).toThrow(/take name/);
    expect(library.readTake('../evil')).toBeUndefined();
  });
});
