import { Pattern, drawTimeScope } from '@strudel/web';
import { analyserById } from '@/lib/strudel-internals';
Pattern.prototype._scope = function ({ id = 1 } = {}) {
  return this.analyze(id);
};
Pattern.prototype._tscope = Pattern.prototype._scope;

/*
 * strudel.cc's editor adds inline widgets that @strudel/web lacks; songs
 * written there use them. Without these, such a song does not play at all.
 */
// Other inline visuals of strudel.cc's editor: no-ops here (punchcards are
// drawn, see lib/punchcards).
const visuals = ['_spiral', '_pitchwheel', '_spectrum', '_wordfall'] as const;
const patternMethods = Pattern.prototype as unknown as Record<string, unknown>;
for (const name of visuals) {
  if (!(name in patternMethods))
    patternMethods[name] = function (this: Pattern) {
      return this;
    };
}
// `slider(value, min, max)` is rewritten to `sliderWithID(id, value, …)`;
// with no slider to drag, it plays at its initial value.
const scope = globalThis as unknown as Record<string, unknown>;
scope.sliderWithID ??= (_id: string, value = 0.5) => value;
scope.slider ??= (value = 0.5) => value;

export function drawScope(
  ctx: CanvasRenderingContext2D,
  id: string,
  scale: number,
  playing: boolean,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTimeScope(playing ? analyserById(id) : undefined, {
    id,
    ctx,
    scale,
    pos: 0.5,
    color: getComputedStyle(ctx.canvas).color,
  });
}
