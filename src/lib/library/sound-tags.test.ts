import { describe, expect, it } from 'vitest';
import { autoTags, bankOf, kindOf, variantsOf } from './sound-tags';

describe('sound kinds and tags', () => {
  it('knows drum machines, instruments and synths', () => {
    expect(bankOf('RolandTR808_bd')).toBe('RolandTR808');
    expect(bankOf('gm_slap_bass_1')).toBeUndefined();
    expect(kindOf('RolandTR808_bd', { type: 'sample' })).toBe('drum machine');
    expect(kindOf('gm_slap_bass_1', { type: 'soundfont' })).toBe('instrument');
    expect(kindOf('sawtooth', { type: 'synth' })).toBe('synth');
    expect(kindOf('wt_digital', { type: 'wavetable' })).toBe('synth');
    expect(kindOf('jvbass', { type: 'sample' })).toBe('sample');
  });
  it('tags from names', () => {
    expect(autoTags('RolandTR808_bd', { type: 'sample' })).toEqual([
      'drums',
      'kick',
    ]);
    expect(autoTags('RolandTR909_hh', { type: 'sample' })).toEqual([
      'drums',
      'hats',
    ]);
    expect(autoTags('gm_slap_bass_1', { type: 'soundfont' })).toEqual(['bass']);
    expect(autoTags('gm_choir_aahs', { type: 'soundfont' })).toEqual([
      'vocals',
    ]);
    expect(autoTags('gm_pad_halo', { type: 'soundfont' })).toEqual(['pad']);
    expect(autoTags('jvbass', { type: 'sample' })).toEqual(['bass']);
    expect(autoTags('bd', { type: 'sample' })).toEqual(['drums', 'kick']);
    expect(autoTags('sawtooth', { type: 'synth' })).toEqual([
      'oscillator',
      'synth',
    ]);
    expect(autoTags('casio', { type: 'sample' })).toEqual([]);
    expect(autoTags('bassdrum1', { type: 'sample' })).toEqual([
      'drums',
      'kick',
    ]);
    expect(autoTags('gm_bassoon', { type: 'soundfont' })).toEqual(['winds']);
    expect(autoTags('gm_fretless_bass', { type: 'soundfont' })).toEqual([
      'bass',
    ]);
    expect(autoTags('gm_guitar_fret_noise', { type: 'soundfont' })).toEqual([
      'fx',
      'guitar & plucked',
      'noise',
    ]);
  });
  it('counts variants', () => {
    expect(variantsOf({ samples: ['a.wav', 'b.wav'] })).toBe(2);
    expect(variantsOf({ samples: { c3: 'x', e3: 'y', g3: 'z' } })).toBe(3);
    expect(variantsOf({ type: 'synth' })).toBe(0);
  });
});
