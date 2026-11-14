import { describe, expect, it } from 'vitest';
import { updateLayout, withoutLayout } from './layout-comments';
import type { Program } from './types';

const program = (...positions: { x: number; y: number }[][]): Program => ({
  cpm: '120',
  bpc: '4',
  prelude: '',
  lines: positions.map((line) => ({
    label: '$',
    muted: false,
    // A chain: last position is the sink, first the source.
    sink: line.reduce<Program['lines'][number]['sink'] | undefined>(
      (input, position) => ({
        type: 'level-node',
        data: {},
        position,
        inputs: input ? [input] : [],
      }),
      undefined,
    )!,
  })),
});

describe('layout comments', () => {
  it('adds comments above lines, keeping the text as written', () => {
    const code =
      '// mine\nkick:   s("bd")  // loud\n\nhat: s("hh").gain(0.5)\n';
    expect(
      updateLayout(
        code,
        program(
          [{ x: 1, y: 2 }],
          [
            { x: 0, y: 9 },
            { x: 5, y: 9 },
          ],
        ),
      ),
    ).toBe(
      '// mine\n// @layout 1,2\nkick:   s("bd")  // loud\n\n// @layout 0,9 5,9\nhat: s("hh").gain(0.5)\n',
    );
  });

  it('replaces existing layout comments', () => {
    expect(
      updateLayout('// @layout 0,0\nkick: s("bd")', program([{ x: 7, y: 8 }])),
    ).toBe('// @layout 7,8\nkick: s("bd")');
  });

  it("gives up when the code's lines don't match", () => {
    expect(updateLayout('kick: s("bd")', program())).toBeNull();
    expect(updateLayout('kick: s("bd"', program([{ x: 0, y: 0 }]))).toBeNull();
  });

  it('strips layout lines', () => {
    expect(withoutLayout('// @layout 1,2\nkick: s("bd")\n')).toBe(
      'kick: s("bd")\n',
    );
  });
});
