// APETATO mode logic.
// Resolves the effective rules for a run (including Custom-mode overrides)
// and provides the Chaos Run wave-modifier table + roller. The game applies
// modifiers; this module only defines and picks them.

import { MODES_BY_ID, RULE_DEFAULTS } from '../content/modes.js';

const RULE_KEYS = Object.keys(RULE_DEFAULTS);

/**
 * Resolve the frozen, complete rules object for a mode.
 *
 * - Non-custom modes return their (already complete, frozen) ModeDef rules.
 * - 'custom' merges the user's customRules over classic defaults. Only known
 *   rule keys are honored, and `custom:true` is always forced so the
 *   golden-banana zeroing in progression can never be bypassed.
 * - Unknown modeIds fall back to classic rules (never throws mid-run).
 *
 * @param {string} modeId
 * @param {object} [customRules] user overrides, only used for 'custom' mode
 * @returns {Readonly<object>} frozen rules with every rule key present
 */
export function resolveRules(modeId, customRules) {
  const def = MODES_BY_ID[modeId];
  if (!def) {
    console.warn(`[modesLogic] unknown modeId '${modeId}', falling back to classic rules`);
    return MODES_BY_ID.classic.rules;
  }
  if (!def.rules.custom) return def.rules;

  const merged = { ...MODES_BY_ID.classic.rules };
  if (customRules && typeof customRules === 'object') {
    for (const k of RULE_KEYS) {
      if (customRules[k] !== undefined) merged[k] = customRules[k];
    }
  }
  merged.custom = true; // never overridable
  return Object.freeze(merged);
}

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

/**
 * The 10 Chaos Run wave modifiers. `apply` uses multiplicative knobs the
 * wave/spawn systems understand plus `playerStatMods` (additive stat deltas
 * for the wave) and `bananaRain` (banana pickups fall during the wave).
 * `minWave` gates the nastier ones out of the earliest waves.
 */
export const CHAOS_MODIFIERS = deepFreeze([
  {
    id: 'frenzy',
    name: 'Frenzy',
    description: 'Enemies move 40% faster. Legs day, apparently.',
    minWave: 1,
    apply: { enemySpeedMult: 1.4 },
  },
  {
    id: 'thick_hide',
    name: 'Thick Hide',
    description: 'Enemies have 50% more HP. Peel harder.',
    minWave: 1,
    apply: { enemyHpMult: 1.5 },
  },
  {
    id: 'horde',
    name: 'Horde',
    description: '75% more enemies spawn this wave.',
    minWave: 1,
    apply: { spawnMult: 1.75 },
  },
  {
    id: 'elite_hour',
    name: 'Elite Hour',
    description: 'Triple elite spawns. The management is on the floor.',
    minWave: 3,
    apply: { eliteMult: 3 },
  },
  {
    id: 'gold_rush',
    name: 'Gold Rush',
    description: 'Double coins, but enemies are 20% beefier.',
    minWave: 1,
    apply: { coinMult: 2, enemyHpMult: 1.2 },
  },
  {
    id: 'glass_jungle',
    name: 'Glass Jungle',
    description: 'Enemies are frail (-40% HP) but hit 60% harder.',
    minWave: 2,
    apply: { enemyHpMult: 0.6, enemyDmgMult: 1.6 },
  },
  {
    id: 'molasses',
    name: 'Molasses',
    description: 'Your feet stick to the floor: -20 speed this wave.',
    minWave: 3,
    apply: { playerStatMods: { speed: -20 } },
  },
  {
    id: 'banana_shower',
    name: 'Banana Shower',
    description: 'Bananas rain from the sky and coins are worth 50% more.',
    minWave: 1,
    apply: { bananaRain: true, coinMult: 1.5 },
  },
  {
    id: 'night_jungle',
    name: 'Night Jungle',
    description: 'Hard to see far: -25 range, but +10% crit in the dark.',
    minWave: 2,
    apply: { playerStatMods: { range: -25, critChance: 10 } },
  },
  {
    id: 'big_game',
    name: 'Big Game',
    description: 'Half as many enemies, each more than twice as tough. +25% XP.',
    minWave: 4,
    apply: { spawnMult: 0.5, enemyHpMult: 2.2, xpMult: 1.25 },
  },
]);

/**
 * Roll one chaos modifier for a wave. Deterministic given the rng stream.
 * @param {{pick: Function}} rng an rng from makeRng()
 * @param {number} wave 1-based wave number
 * @returns {Readonly<object>} one entry of CHAOS_MODIFIERS
 */
export function rollChaosModifier(rng, wave) {
  const w = Number(wave) || 1;
  const eligible = CHAOS_MODIFIERS.filter((m) => w >= m.minWave);
  return rng.pick(eligible.length > 0 ? eligible : CHAOS_MODIFIERS);
}
