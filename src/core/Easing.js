/**
 * Easing curves. Movement feel is a first-class concern in this game, so the
 * curves are named after the sensation they produce rather than their maths.
 */

export const Easing = {
  /** Standard smooth in/out. The safe default. */
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  /** Gentle, cinematic. Used for the elevator and camera moves. */
  cinematic: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  /**
   * Heavy stone: reluctant to start, carries momentum through the middle, then
   * settles with a small damped wobble as it locks. This one curve is most of
   * why the rotating tower feels like tonnes of masonry rather than a tween.
   */
  heavy: (t) => {
    const base = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (t <= 0.72) return base;
    const k = (t - 0.72) / 0.28;
    return base + Math.sin(k * Math.PI * 2) * 0.014 * (1 - k);
  },

  /** Decelerating only -- for things that are already moving when we see them. */
  out: (t) => 1 - Math.pow(1 - t, 3),

  /** Slight anticipation then release. Good for small mechanical parts. */
  mechanical: (t) => {
    if (t < 0.18) return -0.05 * Math.sin((t / 0.18) * Math.PI);
    const k = (t - 0.18) / 0.82;
    return 1 - Math.pow(1 - k, 2.4);
  },
};

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
