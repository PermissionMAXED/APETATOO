// APETATO math helpers for 2D-on-XZ gameplay.
// Hot-path helpers allocate nothing; randDir writes into an out-param.

export const TAU = Math.PI * 2;

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation from a to b by t (t unclamped by design). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Squared distance between two XZ points (prefer in hot loops). */
export function dist2(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

/** Euclidean distance between two XZ points. */
export function dist(x1, z1, x2, z2) {
  return Math.sqrt(dist2(x1, z1, x2, z2));
}

/** Angle (radians) from point 1 to point 2 on the XZ plane. */
export function angleTo(x1, z1, x2, z2) {
  return Math.atan2(z2 - z1, x2 - x1);
}

/**
 * Move scalar `current` toward `target` by at most `maxDelta`,
 * never overshooting. Works for positions, timers, health bars...
 */
export function moveToward(current, target, maxDelta) {
  const delta = target - current;
  if (delta > maxDelta) return current + maxDelta;
  if (delta < -maxDelta) return current - maxDelta;
  return target;
}

/** True when two circles on the XZ plane overlap (or touch). */
export function circleOverlap(x1, z1, r1, x2, z2, r2) {
  const rr = r1 + r2;
  return dist2(x1, z1, x2, z2) <= rr * rr;
}

/**
 * Random unit direction on the XZ plane.
 * @param {() => number} [rand] RNG function in [0,1); defaults to Math.random
 *   (only acceptable for cosmetic use — pass a seeded rng for gameplay!).
 * @param {{x:number, z:number}} [out] reused output object (no allocation
 *   when provided).
 * @returns {{x:number, z:number}}
 */
export function randDir(rand, out) {
  const angle = (rand ? rand() : Math.random()) * TAU;
  const o = out || { x: 0, z: 0 };
  o.x = Math.cos(angle);
  o.z = Math.sin(angle);
  return o;
}
