import { describe, expect, it } from 'vitest';
import { canScroll, installWheelPassthrough } from './wheel-passthrough';

/** A box with a scroll size and position (jsdom has no layout). */
function box(
  overflow: string,
  size: { sh: number; ch: number; sw?: number; cw?: number },
  at: { top?: number; left?: number } = {},
) {
  const el = document.createElement('div');
  // jsdom neither expands the shorthand nor keeps scroll positions.
  const [x, y = x] = overflow.split(' ');
  el.style.overflowX = x ?? 'visible';
  el.style.overflowY = y ?? 'visible';
  Object.defineProperty(el, 'scrollHeight', { value: size.sh });
  Object.defineProperty(el, 'clientHeight', { value: size.ch });
  Object.defineProperty(el, 'scrollWidth', { value: size.sw ?? 0 });
  Object.defineProperty(el, 'clientWidth', { value: size.cw ?? 0 });
  Object.defineProperty(el, 'scrollTop', { value: at.top ?? 0 });
  Object.defineProperty(el, 'scrollLeft', { value: at.left ?? 0 });
  return el;
}

describe('canScroll', () => {
  it('is false for a box with nothing to scroll', () => {
    const el = box('auto', { sh: 100, ch: 100 });
    expect(canScroll(el, el, 0, 50)).toBe(false);
  });

  it('is true while there is room in the wheel direction', () => {
    const el = box('auto', { sh: 300, ch: 100 });
    expect(canScroll(el, el, 0, 50)).toBe(true);
    expect(canScroll(el, el, 0, -50)).toBe(false);
  });

  it('is false at the end it is scrolling towards', () => {
    const el = box('auto', { sh: 300, ch: 100 }, { top: 200 });
    expect(canScroll(el, el, 0, 50)).toBe(false);
    expect(canScroll(el, el, 0, -50)).toBe(true);
  });

  it('ignores an axis the box does not scroll in', () => {
    const el = box('auto hidden', { sh: 300, ch: 100, sw: 300, cw: 100 });
    expect(canScroll(el, el, 0, 50)).toBe(false);
    expect(canScroll(el, el, 50, 0)).toBe(true);
  });

  it('looks at every box from the target up to the boundary', () => {
    const outer = box('auto', { sh: 300, ch: 100 });
    const inner = box('visible', { sh: 0, ch: 0 });
    outer.append(inner);
    expect(canScroll(inner, outer, 0, 50)).toBe(true);
  });
});

describe('installWheelPassthrough', () => {
  function setup(scrollable: boolean) {
    const root = document.createElement('div');
    const zone = box('auto', { sh: scrollable ? 300 : 100, ch: 100 });
    zone.className = 'nowheel';
    root.append(zone);
    document.body.append(root);
    const seen: (string | null)[] = [];
    // Stands in for React Flow: it checks the class while the event bubbles.
    root.addEventListener('wheel', (e) =>
      seen.push(
        (e.target as Element).closest('.nowheel') ? 'nowheel' : 'canvas',
      ),
    );
    const off = installWheelPassthrough(root);
    return { root, zone, seen, off };
  }

  it('hands the wheel to the canvas when the box cannot scroll', async () => {
    const { zone, seen, off } = setup(false);
    zone.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true }));
    expect(seen).toEqual(['canvas']);
    await new Promise((r) => setTimeout(r, 0));
    expect(zone.classList.contains('nowheel')).toBe(true);
    off();
  });

  it('leaves the wheel to the box when it can scroll', () => {
    const { zone, seen, off } = setup(true);
    zone.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true }));
    expect(seen).toEqual(['nowheel']);
    off();
  });

  it('always hands a pinch (Ctrl + wheel) to the canvas', () => {
    const { zone, seen, off } = setup(true);
    zone.dispatchEvent(
      new WheelEvent('wheel', { deltaY: 40, ctrlKey: true, bubbles: true }),
    );
    expect(seen).toEqual(['canvas']);
    off();
  });
});
