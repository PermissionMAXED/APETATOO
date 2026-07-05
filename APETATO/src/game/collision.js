// APETATO game/collision — uniform-grid spatial hash for the XZ plane.
//
// Rebuilt every fixed step from live enemies (+ the boss). Cell size 2.0.
// Buckets are lazily created once and then reused forever via a stamp
// counter, so clear() is O(1) and the whole insert/query path allocates
// nothing after warm-up.

const DEFAULT_CELL = 2.0;
// Key packing: cells offset by +512 then packed into one int. Covers world
// coords roughly ±1000 units — far beyond any arena.
const KEY_OFF = 512;
const KEY_STRIDE = 2048;

export function createSpatialHash(cellSize = DEFAULT_CELL) {
  /** @type {Map<number, {stamp:number, items:object[], count:number}>} */
  const buckets = new Map();
  const inv = 1 / cellSize;
  let stamp = 1;
  let maxRadius = 0.6; // grown on insert; queries expand by it

  function bucketFor(cx, cz) {
    const key = (cx + KEY_OFF) * KEY_STRIDE + (cz + KEY_OFF);
    let b = buckets.get(key);
    if (!b) {
      b = { stamp: 0, items: [], count: 0 };
      buckets.set(key, b);
    }
    return b;
  }

  const hash = {
    cellSize,

    /** Invalidate all buckets (O(1)). */
    clear() {
      stamp++;
      maxRadius = 0.6;
    },

    /** Insert an entity by its center cell. */
    insert(e) {
      const b = bucketFor(Math.floor(e.x * inv), Math.floor(e.z * inv));
      if (b.stamp !== stamp) {
        b.stamp = stamp;
        b.count = 0;
      }
      b.items[b.count++] = e;
      if (e.radius > maxRadius) maxRadius = e.radius;
    },

    /**
     * Collect active entities whose circle overlaps the query circle.
     * Results are written into `out` (reused array); returns the count.
     */
    query(x, z, r, out) {
      let n = 0;
      const reach = r + maxRadius;
      const cx0 = Math.floor((x - reach) * inv);
      const cx1 = Math.floor((x + reach) * inv);
      const cz0 = Math.floor((z - reach) * inv);
      const cz1 = Math.floor((z + reach) * inv);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const b = buckets.get((cx + KEY_OFF) * KEY_STRIDE + (cz + KEY_OFF));
          if (!b || b.stamp !== stamp) continue;
          const items = b.items;
          for (let i = 0; i < b.count; i++) {
            const e = items[i];
            if (!e.active || e.dead) continue;
            const dx = e.x - x;
            const dz = e.z - z;
            const rr = r + e.radius;
            if (dx * dx + dz * dz <= rr * rr) out[n++] = e;
          }
        }
      }
      return n;
    },

    /**
     * Nearest active entity within maxR of (x, z), or null.
     * Optional `skip` entity is ignored (self-queries).
     */
    nearest(x, z, maxR, skip) {
      let best = null;
      let bestD2 = maxR * maxR;
      const reach = maxR + maxRadius;
      const cx0 = Math.floor((x - reach) * inv);
      const cx1 = Math.floor((x + reach) * inv);
      const cz0 = Math.floor((z - reach) * inv);
      const cz1 = Math.floor((z + reach) * inv);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const b = buckets.get((cx + KEY_OFF) * KEY_STRIDE + (cz + KEY_OFF));
          if (!b || b.stamp !== stamp) continue;
          const items = b.items;
          for (let i = 0; i < b.count; i++) {
            const e = items[i];
            if (!e.active || e.dead || e === skip) continue;
            const dx = e.x - x;
            const dz = e.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = e;
            }
          }
        }
      }
      return best;
    },
  };

  return hash;
}

/**
 * Push a circular body out of every overlapping arena obstacle, then clamp
 * to the arena extents (±w/2, ±h/2). Mutates body.x/z in place. Works for
 * players, enemies and companions alike.
 */
export function resolveArenaCollision(body, state) {
  const obs = state.arenaObstacles;
  if (obs) {
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      const dx = body.x - o.x;
      const dz = body.z - o.z;
      const minD = o.r + body.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2);
        if (d > 1e-5) {
          const push = (minD - d) / d;
          body.x += dx * push;
          body.z += dz * push;
        } else {
          body.x += minD; // dead-center: push out along +x
        }
      }
    }
  }
  const hw = state.arenaW / 2 - body.radius;
  const hh = state.arenaH / 2 - body.radius;
  if (body.x < -hw) body.x = -hw;
  else if (body.x > hw) body.x = hw;
  if (body.z < -hh) body.z = -hh;
  else if (body.z > hh) body.z = hh;
}
