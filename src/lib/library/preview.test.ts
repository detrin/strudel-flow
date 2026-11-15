import { describe, expect, it } from 'vitest';
import { previewCode } from './preview';

const song = { cpm: '120', bpc: '4' };

describe('playing a preset on its own', () => {
  it('uses its own tempo when a tag gives it', () => {
    expect(
      previewCode(
        {
          label: 'bass',
          body: 'note("c2").s("sawtooth")',
          needs: ['const cut = 800'],
          tags: ['bass', '136 bpm'],
        },
        song,
      ),
    ).toBe('setcpm(136/4)\nconst cut = 800\nbass: note("c2").s("sawtooth")');
  });
  it("otherwise the song's, under a usable label", () => {
    expect(
      previewCode(
        { label: 'my line', body: 's("bd*4")', needs: [], tags: [] },
        song,
      ),
    ).toBe('setcpm(120/4)\npreview: s("bd*4")');
  });
});
