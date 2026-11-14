import { describe, expect, it } from 'vitest';
import { typedValue } from './typed-value';

describe('typedValue', () => {
  it('reads numbers, mini-notation and code', () => {
    expect(typedValue(' 800 ')).toBe(800);
    expect(typedValue('<400 800>')).toBe('"<400 800>"');
    expect(typedValue('"<1 2>"')).toBe('"<1 2>"');
    expect(typedValue('sine.range(200, 2000)')).toBe('sine.range(200, 2000)');
    expect(typedValue('rand')).toBe('rand');
  });

  it('refuses what is not an expression', () => {
    expect(typedValue('')).toBeNull();
    expect(typedValue('sine.range(200')).toBeNull();
  });
});
