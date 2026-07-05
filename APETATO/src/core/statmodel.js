// APETATO stat model.
// The single source of truth for stat keys, base values, caps, aggregation,
// and derived formulas. Every system (items, characters, synergies, combat)
// speaks in these 28 keys and nothing else.

/** The ONLY valid stat keys, everywhere in the game. Frozen. */
export const STAT_KEYS = Object.freeze([
  'maxHp',
  'hpRegen',
  'lifesteal',
  'damagePct',
  'meleeDamage',
  'rangedDamage',
  'elementalDamage',
  'engineering',
  'attackSpeed',
  'critChance',
  'critDamage',
  'range',
  'armor',
  'dodge',
  'speed',
  'luck',
  'harvesting',
  'pickupRange',
  'xpGain',
  'coinGain',
  'knockback',
  'projectileSpeed',
  'extraProjectiles',
  'explosionSize',
  'effectDuration',
  'thorns',
  'shieldMax',
  'curse',
]);

const KEY_SET = new Set(STAT_KEYS);

/** Baseline every ape starts from: 18 HP of pure banana grit, 0 elsewhere. */
export const BASE_STATS = Object.freeze(
  STAT_KEYS.reduce((acc, k) => {
    acc[k] = k === 'maxHp' ? 18 : 0;
    return acc;
  }, {})
);

/** Hard upper caps applied after summing all sources. */
export const CAPS = Object.freeze({
  lifesteal: 60,
  dodge: 60,
  attackSpeed: 300,
  speed: 100,
  extraProjectiles: 3,
});

/**
 * Aggregate stats from many sources.
 * @param {Array<object>} sources each entry is either:
 *   - a partial stat map: { maxHp: 3, luck: 5 }, or
 *   - { mods: <partial stat map>, stacks: <count, default 1> } for stacked
 *     items (mods are multiplied by stacks).
 * Unknown keys are ignored (with a one-time console warning per key, to
 * catch typos in content data early).
 * @param {object} [out] optional reused output object (avoids allocation
 *   when recomputing frequently, e.g. timed buffs ticking).
 * @returns {object} full stat map: BASE_STATS + sum(sources), caps clamped,
 *   maxHp >= 1.
 */
export function computeStats(sources, out) {
  const stats = out || {};
  for (let i = 0; i < STAT_KEYS.length; i++) {
    const k = STAT_KEYS[i];
    stats[k] = BASE_STATS[k];
  }

  if (sources) {
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (!src) continue;
      const hasMods = src.mods && typeof src.mods === 'object';
      const mods = hasMods ? src.mods : src;
      const stacks = hasMods ? (typeof src.stacks === 'number' ? src.stacks : 1) : 1;
      for (const k in mods) {
        if (KEY_SET.has(k)) {
          const v = mods[k];
          if (typeof v === 'number' && !Number.isNaN(v)) stats[k] += v * stacks;
        } else if (k !== 'mods' && k !== 'stacks') {
          warnUnknownKey(k);
        }
      }
    }
  }

  for (const k in CAPS) {
    if (stats[k] > CAPS[k]) stats[k] = CAPS[k];
  }
  if (stats.maxHp < 1) stats.maxHp = 1;
  return stats;
}

const warnedKeys = new Set();
function warnUnknownKey(k) {
  if (warnedKeys.has(k)) return;
  warnedKeys.add(k);
  console.warn(`[statmodel] ignoring unknown stat key '${k}' — check your content data`);
}

// ---------------------------------------------------------------------------
// Derived formulas (exported individually AND as a DERIVED bundle).
// ---------------------------------------------------------------------------

/** Fraction of incoming damage removed by armor (15 armor = 50%). */
export function armorReduction(armor) {
  return armor / (armor + 15);
}

/** Weapon cooldown after attackSpeed (attackSpeed 100 = twice as fast). */
export function effectiveCooldown(cd, attackSpeed) {
  return cd / (1 + attackSpeed / 100);
}

/** World-units-per-second movement from the speed stat. */
export function moveSpeed(stats) {
  return 5.2 * (1 + stats.speed / 100);
}

/** Pickup magnet radius from the pickupRange stat (base = CONFIG.PLAYER.basePickup). */
export function pickupRadius(stats) {
  return 2.2 * (1 + stats.pickupRange / 100);
}

export const DERIVED = Object.freeze({
  armorReduction,
  effectiveCooldown,
  moveSpeed,
  pickupRadius,
});

/**
 * Self-test: key integrity, summation, stacks, caps, maxHp floor, unknown
 * key tolerance, derived formulas. Returns true or throws.
 */
export function selfTest() {
  if (STAT_KEYS.length !== 28) throw new Error(`statmodel: expected 28 keys, got ${STAT_KEYS.length}`);
  if (BASE_STATS.maxHp !== 18) throw new Error('statmodel: BASE_STATS.maxHp must be 18');
  for (const k of STAT_KEYS) {
    if (k !== 'maxHp' && BASE_STATS[k] !== 0) throw new Error(`statmodel: BASE_STATS.${k} must be 0`);
  }

  // Plain summation.
  let s = computeStats([{ maxHp: 5, luck: 10 }, { luck: -4, armor: 3 }]);
  if (s.maxHp !== 23 || s.luck !== 6 || s.armor !== 3 || s.curse !== 0) {
    throw new Error('statmodel: summation failed');
  }

  // Stacked item mods.
  s = computeStats([{ mods: { maxHp: 2, harvesting: 1 }, stacks: 3 }]);
  if (s.maxHp !== 24 || s.harvesting !== 3) throw new Error('statmodel: stacks failed');

  // Caps.
  s = computeStats([{ dodge: 90, lifesteal: 100, attackSpeed: 500, speed: 250, extraProjectiles: 9 }]);
  if (s.dodge !== 60 || s.lifesteal !== 60 || s.attackSpeed !== 300 || s.speed !== 100 || s.extraProjectiles !== 3) {
    throw new Error('statmodel: caps failed');
  }

  // maxHp floor.
  s = computeStats([{ maxHp: -999 }]);
  if (s.maxHp !== 1) throw new Error('statmodel: maxHp floor failed');

  // Unknown keys ignored without breaking.
  const prevWarn = console.warn;
  console.warn = () => {};
  s = computeStats([{ bananaPower: 999, maxHp: 1 }]);
  console.warn = prevWarn;
  if (s.maxHp !== 19 || 'bananaPower' in s === true) throw new Error('statmodel: unknown key handling failed');

  // Empty / missing sources -> pure base.
  s = computeStats([]);
  if (s.maxHp !== 18) throw new Error('statmodel: empty sources failed');
  s = computeStats();
  if (s.maxHp !== 18) throw new Error('statmodel: no-arg failed');

  // Out-param reuse.
  const reused = {};
  const ret = computeStats([{ armor: 5 }], reused);
  if (ret !== reused || reused.armor !== 5) throw new Error('statmodel: out-param failed');

  // Derived formulas.
  if (armorReduction(15) !== 0.5) throw new Error('statmodel: armorReduction failed');
  if (armorReduction(0) !== 0) throw new Error('statmodel: armorReduction(0) failed');
  if (effectiveCooldown(1.2, 100) !== 0.6) throw new Error('statmodel: effectiveCooldown failed');
  if (Math.abs(moveSpeed({ speed: 50 }) - 7.8) > 1e-9) throw new Error('statmodel: moveSpeed failed');
  if (Math.abs(pickupRadius({ pickupRange: 100 }) - 4.4) > 1e-9) throw new Error('statmodel: pickupRadius failed');
  if (DERIVED.armorReduction !== armorReduction) throw new Error('statmodel: DERIVED bundle mismatch');

  return true;
}
