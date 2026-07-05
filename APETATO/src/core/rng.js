// APETATO seeded randomness.
// All gameplay randomness (drops, waves, shop rolls, crits...) flows through
// makeRng so runs are reproducible from a seed. Math.random is reserved for
// cosmetic-only VFX.

/**
 * mulberry32 PRNG. Returns a function producing floats in [0, 1).
 * @param {number} seed any number; used as uint32.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a string hash -> uint32. Handy for turning seed phrases
 * ("banana_hoard_42") or daily-run date strings into numeric seeds.
 */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build a full-featured RNG from a seed (number or string).
 * @returns {{
 *   next: () => number,
 *   range: (a:number, b:number) => number,
 *   int: (a:number, b:number) => number,
 *   chance: (p:number) => boolean,
 *   pick: <T>(arr:T[]) => T,
 *   weightedPick: <T>(arr:T[], wFn:(item:T, index:number)=>number) => T,
 *   shuffle: <T>(arr:T[]) => T[],
 * }}
 */
export function makeRng(seed) {
  const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);

  return {
    /** Float in [0, 1). */
    next,

    /** Float in [a, b). */
    range(a, b) {
      return a + (b - a) * next();
    },

    /** Integer in [a, b] inclusive. */
    int(a, b) {
      return a + Math.floor((b - a + 1) * next());
    },

    /** True with probability p (p<=0 never, p>=1 always). */
    chance(p) {
      return next() < p;
    },

    /** Uniform pick from an array (undefined for empty arrays). */
    pick(arr) {
      return arr[(next() * arr.length) | 0];
    },

    /**
     * Weighted pick: wFn(item, index) -> non-negative weight. Items with
     * weight 0 are never picked. Falls back to uniform pick if all weights
     * are zero/invalid (better than exploding mid-run).
     */
    weightedPick(arr, wFn) {
      let total = 0;
      for (let i = 0; i < arr.length; i++) {
        const w = wFn(arr[i], i);
        if (w > 0) total += w;
      }
      if (total <= 0) return this.pick(arr);
      let roll = next() * total;
      for (let i = 0; i < arr.length; i++) {
        const w = wFn(arr[i], i);
        if (w <= 0) continue;
        roll -= w;
        if (roll < 0) return arr[i];
      }
      return arr[arr.length - 1]; // float dust safety net
    },

    /** In-place Fisher–Yates shuffle. Returns the same array. */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (next() * (i + 1)) | 0;
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}

/**
 * Self-test: determinism, bounds, string seeding, weighted picks, shuffle
 * permutation integrity. Returns true or throws.
 */
export function selfTest() {
  // Determinism: same seed -> identical stream.
  const a = makeRng(1234);
  const b = makeRng(1234);
  for (let i = 0; i < 100; i++) {
    if (a.next() !== b.next()) throw new Error('rng: not deterministic');
  }

  // Different seeds should diverge (probabilistically certain).
  const c = makeRng(1);
  const d = makeRng(2);
  let same = true;
  for (let i = 0; i < 10; i++) if (c.next() !== d.next()) same = false;
  if (same) throw new Error('rng: different seeds produced identical streams');

  // String seeds hash stably.
  if (hashString('banana') !== hashString('banana')) throw new Error('rng: hashString unstable');
  if (hashString('banana') === hashString('bananb')) throw new Error('rng: hashString collision (suspicious)');
  const s1 = makeRng('go_bananas');
  const s2 = makeRng('go_bananas');
  if (s1.next() !== s2.next()) throw new Error('rng: string seed not deterministic');

  // Bounds.
  const r = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const f = r.next();
    if (f < 0 || f >= 1) throw new Error('rng: next() out of [0,1)');
    const g = r.range(-5, 5);
    if (g < -5 || g >= 5) throw new Error('rng: range() out of bounds');
    const n = r.int(3, 7);
    if (n < 3 || n > 7 || n !== (n | 0)) throw new Error('rng: int() out of bounds');
  }

  // int() must reach both endpoints.
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(r.int(0, 3));
  if (seen.size !== 4) throw new Error('rng: int() endpoint coverage failed');

  // chance() extremes.
  if (r.chance(0)) throw new Error('rng: chance(0) returned true');
  if (!r.chance(1)) throw new Error('rng: chance(1) returned false');

  // weightedPick: zero-weight items never chosen.
  const items = ['never', 'common', 'rare'];
  const weights = { never: 0, common: 90, rare: 10 };
  const counts = { never: 0, common: 0, rare: 0 };
  for (let i = 0; i < 2000; i++) counts[r.weightedPick(items, (it) => weights[it])]++;
  if (counts.never !== 0) throw new Error('rng: weightedPick chose zero-weight item');
  if (counts.common <= counts.rare) throw new Error('rng: weightedPick weights ignored');

  // shuffle: permutation of the same elements, deterministic per seed.
  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
  const arr2 = [1, 2, 3, 4, 5, 6, 7, 8];
  makeRng(99).shuffle(arr1);
  makeRng(99).shuffle(arr2);
  if (arr1.join(',') !== arr2.join(',')) throw new Error('rng: shuffle not deterministic');
  if ([...arr1].sort((x, y) => x - y).join(',') !== '1,2,3,4,5,6,7,8') {
    throw new Error('rng: shuffle lost elements');
  }

  return true;
}
