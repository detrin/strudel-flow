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

  it('leaves masks that are not one value per bar to raw code', () => {
    expect(parseArrange(call('1 0 1 1'))).toBeNull();
    expect(parseArrange(call('<1 [1 0]>'))).toBeNull();
  });

  it('plays exactly the bars that are on', () => {
    const played = haps(`s("bd").${generateArrange({ bars: '1101' })}`, 4);
    expect(played.map((hap) => hap.begin)).toEqual(['0', '1', '3']);
  });
});
