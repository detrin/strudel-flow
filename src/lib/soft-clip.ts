/** Where the curve starts to bend: below it, samples pass unchanged. */
const KNEE = 0.9;

/**
 * A WaveShaper curve for the end of the master: linear up to the knee,
 * then bending smoothly (tanh) toward a ceiling under full scale, so the
 * few transients a limiter lets through are rounded instead of clipped.
 * `length` points across inputs -1 to 1.
 */
export function softClipCurve(length = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(length);
  const room = (1 - KNEE) * 0.85;
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    const size = Math.abs(x);
    const y =
      size <= KNEE ? size : KNEE + room * Math.tanh((size - KNEE) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}
