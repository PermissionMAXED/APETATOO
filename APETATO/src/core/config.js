// APETATO global tuning constants.
// Frozen plain data; systems read from here rather than hard-coding numbers.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const CONFIG = deepFreeze({
  /** Fixed simulation timestep (must match engine STEP). */
  STEP: 1 / 60,

  /** Pool capacities — sized for the 400-enemies-at-60fps target. */
  POOL: {
    enemies: 512,
    playerProjectiles: 1024,
    enemyProjectiles: 256,
    pickups: 512,
    particles: 4096,
    damageNumbers: 128,
  },

  PLAYER: {
    radius: 0.5,
    baseSpeed: 5.2,
    /** Invulnerability window after taking a hit, seconds. */
    iFrames: 0.35,
    /** Base pickup magnet radius, world units. */
    basePickup: 1.5,
  },

  /** Default arena bounds (world units, XZ plane, centered on origin). */
  ARENA_DEFAULT: { w: 44, h: 28 },

  /** XP orbs closer than this merge into one bigger orb. */
  XP_ORB_MERGE_DIST: 0.6,
});
