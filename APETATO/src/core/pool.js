// APETATO object pool.
// Fixed-size pools back every high-churn entity (enemies, projectiles,
// pickups, particles, damage numbers). Zero allocation after construction:
// acquire/release are O(1) via a free-stack + dense active list with
// swap-remove.

/**
 * Create a fixed-size pool.
 * @param {(index:number)=>object} factoryFn builds each pooled object once,
 *   up front. Objects gain pool-managed fields: `.active` (public) and
 *   `._poolIdx` (internal).
 * @param {number} size pool capacity.
 * @returns {{
 *   acquire: () => object|null,
 *   release: (obj:object) => void,
 *   forEachActive: (fn:(obj:object, i:number)=>void) => void,
 *   activeCount: number,
 *   reset: () => void,
 *   size: number,
 * }}
 */
export function createPool(factoryFn, size) {
  /** Stack of currently-free objects (top = next to hand out). */
  const free = new Array(size);
  /** Dense array of active objects; `_poolIdx` is each object's slot here. */
  const active = new Array(size);
  let freeCount = size;
  let activeCount = 0;

  for (let i = 0; i < size; i++) {
    const obj = factoryFn(i);
    obj.active = false;
    obj._poolIdx = -1;
    free[i] = obj;
  }

  const pool = {
    size,

    /** Take an object from the pool, or null when exhausted. */
    acquire() {
      if (freeCount === 0) return null;
      const obj = free[--freeCount];
      free[freeCount] = null;
      obj.active = true;
      obj._poolIdx = activeCount;
      active[activeCount++] = obj;
      return obj;
    },

    /** Return an object to the pool. Double-release is a safe no-op. */
    release(obj) {
      if (!obj || obj.active !== true) return;
      obj.active = false;
      const idx = obj._poolIdx;
      obj._poolIdx = -1;
      // Swap-remove from the dense active list.
      const lastIdx = --activeCount;
      const last = active[lastIdx];
      active[lastIdx] = null;
      if (idx !== lastIdx) {
        active[idx] = last;
        last._poolIdx = idx;
      }
      free[freeCount++] = obj;
    },

    /**
     * Iterate all active objects. Iterates backwards so releasing the
     * CURRENT object inside fn is safe (swap-remove only moves objects from
     * the tail we've already visited).
     */
    forEachActive(fn) {
      for (let i = activeCount - 1; i >= 0; i--) {
        fn(active[i], i);
      }
    },

    /** Number of currently active objects. */
    get activeCount() {
      return activeCount;
    },

    /** Release every active object. */
    reset() {
      for (let i = activeCount - 1; i >= 0; i--) {
        pool.release(active[i]);
      }
    },
  };

  return pool;
}

/**
 * Self-test: exhaustion, release/reuse, double-release safety,
 * release-during-iteration, reset. Returns true or throws.
 */
export function selfTest() {
  let built = 0;
  const pool = createPool((i) => {
    built++;
    return { id: i, hp: 0 };
  }, 4);
  if (built !== 4) throw new Error('pool: factory not called eagerly');

  const a = pool.acquire();
  const b = pool.acquire();
  const c = pool.acquire();
  const d = pool.acquire();
  if (!a || !b || !c || !d) throw new Error('pool: acquire failed');
  if (pool.acquire() !== null) throw new Error('pool: exhausted pool must return null');
  if (pool.activeCount !== 4) throw new Error('pool: activeCount wrong after acquires');
  if (!a.active) throw new Error('pool: acquired object missing active=true');

  pool.release(b);
  if (b.active) throw new Error('pool: released object still active');
  if (pool.activeCount !== 3) throw new Error('pool: activeCount wrong after release');
  pool.release(b); // double release must be a no-op
  if (pool.activeCount !== 3) throw new Error('pool: double release corrupted count');

  const e = pool.acquire();
  if (e !== b) throw new Error('pool: released object not reused');

  // forEachActive visits exactly the active set.
  const seen = new Set();
  pool.forEachActive((obj) => seen.add(obj));
  if (seen.size !== 4 || !seen.has(a) || !seen.has(c) || !seen.has(d) || !seen.has(e)) {
    throw new Error('pool: forEachActive visited wrong set');
  }

  // Releasing the current object during iteration must not skip others.
  const visited = [];
  pool.forEachActive((obj) => {
    visited.push(obj);
    if (obj === c) pool.release(c);
  });
  if (visited.length !== 4) throw new Error('pool: release-during-iteration skipped objects');
  if (pool.activeCount !== 3) throw new Error('pool: count wrong after iter-release');

  pool.reset();
  if (pool.activeCount !== 0) throw new Error('pool: reset failed');
  let count = 0;
  pool.forEachActive(() => count++);
  if (count !== 0) throw new Error('pool: forEachActive after reset visited objects');

  // Full capacity available again after reset.
  for (let i = 0; i < 4; i++) {
    if (pool.acquire() === null) throw new Error('pool: capacity lost after reset');
  }
  if (pool.acquire() !== null) throw new Error('pool: over-capacity after reset');

  return true;
}
