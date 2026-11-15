import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('carrying data over from the old name', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      clear: () => data.clear(),
    });
    vi.resetModules();
  });
  it('copies old keys the new name has not saved yet', async () => {
    localStorage.setItem('strudel-flow:patch', '{"song":1}');
    localStorage.setItem('strudel-flow:library', '{"presets":[]}');
    localStorage.setItem('strudel-flow:theme', 'old');
    localStorage.setItem('strudelton:theme', 'new');
    await import('./storage-migration');
    expect(localStorage.getItem('strudelton:patch')).toBe('{"song":1}');
    expect(localStorage.getItem('strudelton:library')).toBe('{"presets":[]}');
    // Newer data under the new name wins.
    expect(localStorage.getItem('strudelton:theme')).toBe('new');
    expect(localStorage.getItem('strudel-flow:patch')).toBe('{"song":1}');
  });
});
