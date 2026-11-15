/**
 * Whether an element is on screen, kept by one shared IntersectionObserver,
 * so animations can skip what nobody sees (nodes panned away, console
 * punchcards scrolled out).
 */
const seen = new WeakMap<Element, boolean>();
let observer: IntersectionObserver | undefined;

function observe(element: Element) {
  if (typeof IntersectionObserver === 'undefined') return;
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
  });
  observer.observe(element);
}

/** True until the observer says otherwise (draws once before it reports). */
export function isVisible(element: Element) {
  if (!seen.has(element)) {
    seen.set(element, true);
    observe(element);
  }
  return seen.get(element)!;
}
