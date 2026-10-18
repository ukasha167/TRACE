/**
 * THE GLIDE: one easing for everything a finger moves.
 *
 * Lenis makes a web page feel heavy and smooth by never moving the page to
 * where the input says. The page chases that point instead, closing a fixed
 * fraction of the gap each frame, so uneven input arrives as even motion and a
 * release coasts to rest with no bounce. This is the same law, written against
 * elapsed time rather than per frame: Lenis's "0.1 of the gap per frame" is
 * only 0.1 at 60 Hz, and a 120 Hz iPhone would run it twice as fast as a
 * 60 Hz Android phone.
 *
 * Springs were the previous answer and they were the jank. A spring started
 * with the finger's velocity overshoots, and a carousel that overshoots its
 * detent and comes back reads as a stutter rather than as weight.
 */

/** Time constants, in milliseconds. The gap shrinks to 37% in one of these. */
export const GLIDE = {
  /**
   * Under a finger. Short enough that the content stays attached to the touch,
   * long enough to even out touch events that arrive two to a frame and then
   * none for a frame, which is what Android delivers while the JS thread is busy.
   */
  follow: 45,
  /** Coasting after release. 160 ms is Lenis's default lerp of 0.1 at 60 Hz. */
  coast: 160,
  /**
   * How far a release throws, in seconds of the finger's last velocity. The
   * coast covers the throw in about three time constants, so this is the
   * distance a flick would travel if it kept going for a fifth of a second.
   */
  throwSeconds: 0.22,
} as const;

/** A step of the glide: `current` moved toward `target` over `dtMs`. */
export function glide(current: number, target: number, dtMs: number, tauMs: number): number {
  "worklet";
  if (tauMs <= 0 || !(dtMs > 0)) return dtMs > 0 ? target : current;
  // A dropped frame must not throw the content past its target, so the step is
  // the exact exponential and never a linear approximation of it.
  return target + (current - target) * Math.exp(-Math.min(dtMs, 100) / tauMs);
}

/** True once the gap is too small to move a pixel, so a loop can stop. */
export function settled(current: number, target: number, epsilon = 1e-4): boolean {
  "worklet";
  return Math.abs(target - current) < epsilon;
}
