// APETATO shop items — aggregate index + content validation.
// Combines the per-rarity item files into one frozen catalog and provides
// validate(), a dev-time integrity check over items, synergies and upgrades.
// Pure data plumbing; no gameplay logic lives here.

import { STAT_KEYS } from '../../core/statmodel.js';
import { COMMON_ITEMS } from './common.js';
import { RARE_ITEMS } from './rare.js';
import { EPIC_ITEMS } from './epic.js';
import { LEGENDARY_ITEMS } from './legendary.js';
import { MYTHIC_ITEMS } from './mythic.js';
import { SYNERGIES, WEAPON_CLASSES } from '../synergies.js';
import { UPGRADES } from '../upgrades.js';

/** Rarity indices and display names. */
export const RARITY = Object.freeze({ COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4 });
export const RARITY_NAMES = Object.freeze(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic']);

/** The shared item tag vocabulary. Content must not invent new tags. */
export const ITEM_TAGS = Object.freeze([
  'banana', 'fruit', 'tool', 'tech', 'jungle', 'cursed', 'shiny', 'meat', 'mystic', 'defense',
]);

/** Full item catalog, ordered by rarity. Frozen. */
export const ITEMS = Object.freeze([
  ...COMMON_ITEMS,
  ...RARE_ITEMS,
  ...EPIC_ITEMS,
  ...LEGENDARY_ITEMS,
  ...MYTHIC_ITEMS,
]);

/** id -> ItemDef lookup. Frozen. */
export const ITEMS_BY_ID = Object.freeze(
  ITEMS.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {})
);

export { COMMON_ITEMS, RARE_ITEMS, EPIC_ITEMS, LEGENDARY_ITEMS, MYTHIC_ITEMS };

// ---------------------------------------------------------------------------
// Validation (dev check)
// ---------------------------------------------------------------------------

const STAT_KEY_SET = new Set(STAT_KEYS);
const TAG_SET = new Set(ITEM_TAGS);
const CLASS_SET = new Set(WEAPON_CLASSES);
const ID_RE = /^[a-z][a-z0-9_]*$/;

const TRIGGERS = new Set([
  'passive', 'onKill', 'onHit', 'onCrit', 'onTakeDamage', 'onDodge',
  'onWaveStart', 'onWaveEnd', 'onLevelUp', 'onPickupCoin', 'onPickupXp',
  'interval', 'onShopEnter', 'onLowHp',
]);
const OPS = new Set([
  'stat', 'statPer', 'heal', 'shield', 'coins', 'xp', 'damageNearest',
  'explode', 'projectile', 'status', 'buff', 'summon',
]);
const STATUSES = new Set(['burn', 'poison', 'slow', 'freeze', 'stun', 'shock', 'bleed']);
const STAT_PER_WHATS = new Set(['itemTag', 'weaponClass', 'missingHpPct', 'wave', 'kills']);
const COND_KEYS = new Set(['hpBelowPct', 'waveGte', 'hasTag', 'stat', 'gte']);

/** Expected per-rarity item counts (index = rarity). */
const EXPECTED_RARITY_COUNTS = Object.freeze([40, 40, 35, 25, 12]);

/** Shop price bands per rarity, for sanity-checking basePrice. */
const PRICE_BANDS = Object.freeze([
  [10, 16],
  [22, 32],
  [48, 65],
  [85, 110],
  [150, 180],
]);

function fail(errors, msg) {
  errors.push(msg);
}

function checkStatMods(errors, where, statMods) {
  if (!statMods || typeof statMods !== 'object' || Array.isArray(statMods)) {
    fail(errors, `${where}: statMods must be an object`);
    return;
  }
  for (const k of Object.keys(statMods)) {
    if (!STAT_KEY_SET.has(k)) fail(errors, `${where}: illegal stat key '${k}'`);
    if (typeof statMods[k] !== 'number' || Number.isNaN(statMods[k])) {
      fail(errors, `${where}: statMods.${k} must be a number`);
    }
  }
}

function checkCond(errors, where, cond) {
  for (const k of Object.keys(cond)) {
    if (!COND_KEYS.has(k)) fail(errors, `${where}: unknown cond key '${k}'`);
  }
  if ('stat' in cond && !STAT_KEY_SET.has(cond.stat)) {
    fail(errors, `${where}: cond.stat '${cond.stat}' is not a legal stat key`);
  }
  if ('hasTag' in cond && !TAG_SET.has(cond.hasTag)) {
    fail(errors, `${where}: cond.hasTag '${cond.hasTag}' is not in the tag vocabulary`);
  }
}

function checkOp(errors, where, op) {
  if (!op || typeof op !== 'object' || !OPS.has(op.op)) {
    fail(errors, `${where}: unknown op '${op && op.op}'`);
    return;
  }
  if ((op.op === 'stat' || op.op === 'buff') && !STAT_KEY_SET.has(op.stat)) {
    fail(errors, `${where}: op '${op.op}' has illegal stat '${op.stat}'`);
  }
  if (op.op === 'statPer') {
    if (!STAT_KEY_SET.has(op.stat)) fail(errors, `${where}: statPer has illegal stat '${op.stat}'`);
    if (!op.per || !STAT_PER_WHATS.has(op.per.what)) {
      fail(errors, `${where}: statPer.per.what '${op.per && op.per.what}' is invalid`);
    } else if (op.per.what === 'itemTag' && !TAG_SET.has(op.per.tag)) {
      fail(errors, `${where}: statPer per itemTag '${op.per.tag}' is not in the tag vocabulary`);
    } else if (op.per.what === 'weaponClass' && !CLASS_SET.has(op.per.cls)) {
      fail(errors, `${where}: statPer per weaponClass '${op.per.cls}' is not a weapon class`);
    }
  }
  if (op.op === 'status' && !STATUSES.has(op.status)) {
    fail(errors, `${where}: unknown status '${op.status}'`);
  }
}

function checkEffects(errors, where, effects) {
  if (!Array.isArray(effects)) {
    fail(errors, `${where}: effects must be an array`);
    return;
  }
  effects.forEach((fx, i) => {
    const w = `${where}.effects[${i}]`;
    if (!fx || typeof fx !== 'object') {
      fail(errors, `${w}: not an object`);
      return;
    }
    if (!TRIGGERS.has(fx.trigger)) fail(errors, `${w}: unknown trigger '${fx.trigger}'`);
    if (fx.trigger === 'interval' && (typeof fx.interval !== 'number' || fx.interval <= 0)) {
      fail(errors, `${w}: interval trigger needs a positive 'interval'`);
    }
    if ('chance' in fx && (typeof fx.chance !== 'number' || fx.chance <= 0 || fx.chance > 100)) {
      fail(errors, `${w}: chance must be in (0, 100]`);
    }
    if ('cond' in fx) checkCond(errors, w, fx.cond);
    if (!Array.isArray(fx.do) || fx.do.length === 0) {
      fail(errors, `${w}: 'do' must be a non-empty array of ops`);
    } else {
      fx.do.forEach((op, j) => checkOp(errors, `${w}.do[${j}]`, op));
    }
  });
}

/**
 * Dev-time content integrity check. Throws with a full error list on any
 * violation; returns a summary report when everything is valid.
 *
 * Checks: unique snake_case ids across ALL items, total >= 150, per-rarity
 * counts, legal stat keys everywhere, tag vocabulary, effect DSL shape,
 * price bands, Legendary/Mythic maxStacks 1, all 15 synergy classIds, and
 * the upgrade pool.
 */
export function validate() {
  const errors = [];
  const ids = new Set();
  const byRarity = [0, 0, 0, 0, 0];

  const buckets = [
    [COMMON_ITEMS, 0],
    [RARE_ITEMS, 1],
    [EPIC_ITEMS, 2],
    [LEGENDARY_ITEMS, 3],
    [MYTHIC_ITEMS, 4],
  ];

  for (const [bucket, rarity] of buckets) {
    for (const item of bucket) {
      const where = `item '${item && item.id}'`;
      if (!item || typeof item !== 'object') {
        fail(errors, `rarity ${rarity}: non-object item`);
        continue;
      }
      if (!Object.isFrozen(item)) fail(errors, `${where}: not frozen`);
      if (typeof item.id !== 'string' || !ID_RE.test(item.id)) {
        fail(errors, `${where}: id must be lowercase snake_case`);
      }
      if (ids.has(item.id)) fail(errors, `${where}: duplicate id`);
      ids.add(item.id);
      if (typeof item.name !== 'string' || !item.name) fail(errors, `${where}: missing name`);
      if (typeof item.description !== 'string' || !item.description) fail(errors, `${where}: missing description`);
      if (item.rarity !== rarity) fail(errors, `${where}: rarity ${item.rarity} but lives in the rarity-${rarity} file`);
      byRarity[rarity]++;

      const [lo, hi] = PRICE_BANDS[rarity];
      if (typeof item.basePrice !== 'number' || item.basePrice < lo || item.basePrice > hi) {
        fail(errors, `${where}: basePrice ${item.basePrice} outside [${lo}, ${hi}] for rarity ${rarity}`);
      }
      if (!Number.isInteger(item.maxStacks) || item.maxStacks === 0 || item.maxStacks < -1) {
        fail(errors, `${where}: maxStacks must be -1 or a positive integer`);
      }
      if (rarity >= 3 && item.maxStacks !== 1) {
        fail(errors, `${where}: Legendary/Mythic items must have maxStacks 1`);
      }
      if (!Array.isArray(item.tags) || item.tags.length === 0) {
        fail(errors, `${where}: tags must be a non-empty array`);
      } else {
        for (const t of item.tags) {
          if (!TAG_SET.has(t)) fail(errors, `${where}: tag '${t}' is not in the shared vocabulary`);
        }
      }
      checkStatMods(errors, where, item.statMods);
      checkEffects(errors, where, item.effects);
      if (Object.keys(item.statMods || {}).length === 0 && (item.effects || []).length === 0) {
        fail(errors, `${where}: has neither statMods nor effects`);
      }
    }
  }

  if (ITEMS.length < 150) fail(errors, `total items ${ITEMS.length} < 150`);
  EXPECTED_RARITY_COUNTS.forEach((expected, r) => {
    if (byRarity[r] !== expected) {
      fail(errors, `rarity ${r} (${RARITY_NAMES[r]}): expected ${expected} items, got ${byRarity[r]}`);
    }
  });

  // --- Synergies -------------------------------------------------------------
  if (SYNERGIES.length !== WEAPON_CLASSES.length) {
    fail(errors, `expected ${WEAPON_CLASSES.length} synergies, got ${SYNERGIES.length}`);
  }
  const seenClasses = new Set();
  for (const syn of SYNERGIES) {
    const where = `synergy '${syn && syn.classId}'`;
    if (!CLASS_SET.has(syn.classId)) fail(errors, `${where}: classId is not one of the 15 weapon classes`);
    if (seenClasses.has(syn.classId)) fail(errors, `${where}: duplicate classId`);
    seenClasses.add(syn.classId);
    if (typeof syn.name !== 'string' || !syn.name) fail(errors, `${where}: missing name`);
    for (const tier of [2, 4, 6]) {
      const bonus = syn.bonuses && syn.bonuses[tier];
      if (!bonus) {
        fail(errors, `${where}: missing tier ${tier} bonus`);
        continue;
      }
      checkStatMods(errors, `${where} tier ${tier}`, bonus.statMods);
      if ('effects' in bonus) checkEffects(errors, `${where} tier ${tier}`, bonus.effects);
    }
  }
  for (const cls of WEAPON_CLASSES) {
    if (!seenClasses.has(cls)) fail(errors, `weapon class '${cls}' has no synergy`);
  }

  // --- Upgrades ----------------------------------------------------------------
  const upIds = new Set();
  const upByRarity = [0, 0, 0, 0];
  for (const up of UPGRADES) {
    const where = `upgrade '${up && up.id}'`;
    if (typeof up.id !== 'string' || !ID_RE.test(up.id)) fail(errors, `${where}: id must be lowercase snake_case`);
    if (upIds.has(up.id)) fail(errors, `${where}: duplicate id`);
    upIds.add(up.id);
    if (ids.has(up.id)) fail(errors, `${where}: id collides with an item id`);
    if (typeof up.name !== 'string' || !up.name) fail(errors, `${where}: missing name`);
    if (typeof up.description !== 'string' || !up.description) fail(errors, `${where}: missing description`);
    if (!Number.isInteger(up.rarity) || up.rarity < 0 || up.rarity > 3) {
      fail(errors, `${where}: rarity must be 0..3`);
    } else {
      upByRarity[up.rarity]++;
    }
    if (typeof up.weight !== 'number' || up.weight <= 0) fail(errors, `${where}: weight must be > 0`);
    checkStatMods(errors, where, up.statMods);
    if (Object.keys(up.statMods || {}).length === 0) fail(errors, `${where}: statMods empty`);
  }
  if (UPGRADES.length < 36) fail(errors, `upgrade pool ${UPGRADES.length} < 36`);

  if (errors.length) {
    throw new Error(`[content] validate() found ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  }

  return {
    ok: true,
    items: {
      total: ITEMS.length,
      byRarity: {
        common: byRarity[0],
        rare: byRarity[1],
        epic: byRarity[2],
        legendary: byRarity[3],
        mythic: byRarity[4],
      },
    },
    synergies: SYNERGIES.length,
    upgrades: {
      total: UPGRADES.length,
      byRarity: {
        common: upByRarity[0],
        rare: upByRarity[1],
        epic: upByRarity[2],
        legendary: upByRarity[3],
      },
    },
  };
}

// Auto-run the integrity check in Vite dev builds so content typos surface
// immediately in the console. No-ops in production bundles and plain node.
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  console.log('[content] validate():', validate());
}
