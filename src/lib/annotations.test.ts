import { describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/app-store';
import { setCode, startCodeSync } from '@/store/code-sync';
import {
  addAnnotation,
  annotationsOf,
  onAnnotationChanges,
  parseAnnotation,
  setAnnotationText,
  useAnnotations,
  withAnnotations,
} from './annotations';

describe('notes and frames', () => {
  it('read and write as comments', () => {
    const note = '// @note 120,-200 "bring the \\"bass\\" in"';
    expect(parseAnnotation(note)).toEqual({
      kind: 'note',
      x: 120,
      y: -200,
      text: 'bring the "bass" in',
    });
    expect(parseAnnotation('// @frame 0,0,800,400 "drums"')).toMatchObject({
      kind: 'frame',
      width: 800,
      height: 400,
    });
    expect(parseAnnotation('// a plain comment')).toBeNull();
  });

  it('replace, remove and add annotations in place', () => {
    const prelude =
      '// my song\n// @note 0,0 "a"\nconst x = 1\n// @note 5,5 "b"';
    const [, b] = annotationsOf(prelude);
    expect(
      withAnnotations(prelude, [
        b,
        { kind: 'frame', x: 1, y: 2, width: 3, height: 4, text: 'c' },
      ]),
    ).toBe('// my song\n// @note 5,5 "b"\nconst x = 1\n// @frame 1,2,3,4 "c"');
  });

  it('survive a round trip through the code and follow the canvas', () => {
    const stop = startCodeSync();
    setCode('// @frame -40,-80,1400,900 "drums"\nkick: s("bd*4")');
    expect(useAnnotations.getState().nodes.map((n) => n.type)).toEqual([
      'frame-annotation',
    ]);
    addAnnotation({ kind: 'note', x: 10, y: 20, text: 'drop here' });
    setAnnotationText(1, 'drop at bar 17');
    onAnnotationChanges([
      { type: 'position', id: 'annotation-0', position: { x: 0, y: 0 } },
    ]);
    const code = useAppStore.getState().code;
    expect(code).toContain('// @frame 0,0,1400,900 "drums"');
    expect(code).toContain('// @note 10,20 "drop at bar 17"');
    // Typed back in, the code is unchanged.
    setCode(code);
    expect(useAppStore.getState().code).toBe(code);
    onAnnotationChanges([{ type: 'remove', id: 'annotation-0' }]);
    expect(useAppStore.getState().code).not.toContain('@frame');
    stop();
  });
});
