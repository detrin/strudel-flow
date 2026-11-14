import { describe, expect, it } from 'vitest';
import { haps } from '@/test/strudel';
import { generateArrange, maskPattern, parseArrange } from './arrange';

const call = (arg: string) => [{ name: 'mask', args: [arg], text: '' }];

describe('Arrange', () => {
  it('writes runs of bars compactly', () => {
    expect(maskPattern('11110000')).toBe('<1!4 0!4>');
    expect(maskPattern('1011')).toBe('<1 0 1!2>');
  });

  it('reads back what it writes', () => {
    for (const bars of ['1', '10', '1111111100000000', '0110011001100110'])
      expect(parseArrange(call(maskPattern(bars)))).toEqual({ bars });
  });

  it('keeps masks that are not one value per bar as their pattern', () => {
    expect(parseArrange(call('1 0 1 1'))).toEqual({ pattern: '"1 0 1 1"' });
    expect(parseArrange(call('<1 [1 0]>'))).toEqual({
      pattern: '"<1 [1 0]>"',
    });
    expect(
      parseArrange([{ name: 'mask', args: [{ code: 'DROP' }], text: '' }]),
    ).toEqual({ pattern: 'DROP' });
    expect(generateArrange({ pattern: 'DROP' })).toBe('mask(DROP)');
  });

  it('reads @ like ! and long songs', () => {
    expect(parseArrange(call('<0 1@3>'))).toEqual({ bars: '0111' });
    const long = '1'.repeat(100) + '0'.repeat(28);
    expect(parseArrange(call(maskPattern(long)))).toEqual({ bars: long });
  });

  it('plays exactly the bars that are on', () => {
    const played = haps(`s("bd").${generateArrange({ bars: '1101' })}`, 4);
    expect(played.map((hap) => hap.begin)).toEqual(['0', '1', '3']);
  });
});
