/**
 * Two-finger scrolling pans the canvas. Parts of a node marked `nowheel`
 * (code boxes, the Arrange grid, the piano roll, inputs) keep the wheel so
 * they can scroll themselves, but only while they have something to scroll
 * in that direction: otherwise React Flow ignores the wheel there, the pan
 * stops under the pointer and the browser takes the gesture (on a Mac a
 * sideways swipe starts going back a page).
 *
 * So for each wheel event that cannot scroll anything between its target
 * and the `nowheel` element, the class is lifted for that one event and
 * React Flow pans (or zooms, for a pinch) as on empty canvas.
 */

const NOWHEEL = 'nowheel';

function scrollsIn(el: Element, axis: 'x' | 'y') {
  const style = getComputedStyle(el);
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/** Whether the wheel (dx, dy) can scroll any box from `target` up to `boundary`. */
export function canScroll(
  target: Element,
  boundary: Element,
  dx: number,
  dy: number,
): boolean {
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (dy !== 0 && scrollsIn(el, 'y')) {
      const room =
        dy > 0
          ? el.scrollHeight - el.clientHeight - el.scrollTop
          : el.scrollTop;
      if (room > 0.5) return true;
    }
    if (dx !== 0 && scrollsIn(el, 'x')) {
      const room =
        dx > 0
          ? el.scrollWidth - el.clientWidth - el.scrollLeft
          : el.scrollLeft;
      if (room > 0.5) return true;
    }
    if (el === boundary) break;
  }
  return false;
}

/** Listens on `root` (the canvas wrapper); returns a function that stops. */
export function installWheelPassthrough(root: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const zones: Element[] = [];
    for (
      let el = target.closest(`.${NOWHEEL}`);
      el && root.contains(el);
      el = el.parentElement?.closest(`.${NOWHEEL}`) ?? null
    )
      zones.push(el);
    const outer = zones.at(-1);
    if (!outer) return;
    // A pinch (Ctrl + wheel) always zooms the canvas.
    if (!event.ctrlKey && canScroll(target, outer, event.deltaX, event.deltaY))
      return;
    for (const zone of zones) zone.classList.remove(NOWHEEL);
    // Back once this event has been handled, before the next one.
    setTimeout(() => {
      for (const zone of zones) zone.classList.add(NOWHEEL);
    }, 0);
  };
  root.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => root.removeEventListener('wheel', onWheel, { capture: true });
}
