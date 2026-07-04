// APETATO characters — master index.
// Concatenates every troop file into the single frozen CHARACTERS array and
// runs a dev-only validate() self-check (console.warn on any violation).

import { APES_A } from './apesA.js';
import { APES_B } from './apesB.js';
import { WEAPONS } from '../weapons/index.js';

export const CHARACTERS = Object.freeze([...APES_A, ...APES_B]);

const STAT_KEYS = [
  'maxHp', 'hpRegen', 'lifesteal', 'damagePct', 'meleeDamage', 'rangedDamage',
  'elementalDamage', 'engineering', 'attackSpeed', 'critChance', 'critDamage',
  'range', 'armor', 'dodge', 'speed', 'luck', 'harvesting', 'pickupRange',
  'xpGain', 'coinGain', 'knockback', 'projectileSpeed', 'extraProjectiles',
  'explosionSize', 'effectDuration', 'thorns', 'shieldMax', 'curse',
];

const UNLOCK_TYPES = ['default', 'achievement', 'buy', 'wins'];
const DEFAULT_IDS = ['kong_grunt', 'peel_gunner', 'chimp_zap'];

/**
 * Dev-only data self-check. Warns (never throws) so a bad entry can't brick
 * the game. Returns the number of problems found.
 */
export function validate() {
  const warn = (msg) => console.warn(`[characters] ${msg}`);
  let problems = 0;
  const bad = (msg) => { problems++; warn(msg); };

  if (CHARACTERS.length < 20) bad(`expected >= 20 characters, got ${CHARACTERS.length}`);

  const weaponIds = new Set(WEAPONS.map((w) => w.id));
  const seen = new Set();
  const defaults = [];

  for (const c of CHARACTERS) {
    const tag = c && c.id ? c.id : JSON.stringify(c);
    if (!c || typeof c.id !== 'string' || !/^[a-z0-9_]+$/.test(c.id)) {
      bad(`invalid id: ${tag}`);
      continue;
    }
    if (seen.has(c.id)) bad(`duplicate id: ${c.id}`);
    seen.add(c.id);

    if (!weaponIds.has(c.startingWeaponId)) {
      bad(`${c.id}: startingWeaponId '${c.startingWeaponId}' not found in WEAPONS`);
    }
    if (!(c.weaponSlots >= 1 && c.weaponSlots <= 6)) bad(`${c.id}: weaponSlots must be 1..6`);
    if (typeof c.shopPriceMult !== 'number') bad(`${c.id}: shopPriceMult missing`);
    if (!c.unlock || !UNLOCK_TYPES.includes(c.unlock.type)) bad(`${c.id}: bad unlock`);
    if (c.unlock && c.unlock.type === 'default') defaults.push(c.id);

    if (!c.model || c.model.base !== 'ape') bad(`${c.id}: model.base must be 'ape'`);

    const mods = c.statMods || {};
    for (const k of Object.keys(mods)) {
      if (!STAT_KEYS.includes(k)) bad(`${c.id}: unknown stat key '${k}'`);
    }
    const modCount = Object.keys(mods).length;
    if (modCount < 3 || modCount > 6) bad(`${c.id}: expected 3-6 statMods, got ${modCount}`);

    if (!Array.isArray(c.passives) || c.passives.length < 1 || c.passives.length > 2) {
      bad(`${c.id}: expected 1-2 passives`);
    }
    if (!Object.isFrozen(c)) bad(`${c.id}: not frozen`);
  }

  for (const id of DEFAULT_IDS) {
    if (!defaults.includes(id)) bad(`default-unlocked ids must include '${id}'`);
  }
  for (const id of defaults) {
    if (!DEFAULT_IDS.includes(id)) bad(`unexpected default-unlocked character '${id}'`);
  }

  if (problems === 0) {
    console.log(
      `[characters] validate OK — ${CHARACTERS.length} characters ` +
      `(troop A ${APES_A.length}, troop B ${APES_B.length}; defaults: ${defaults.join(', ')})`
    );
  }
  return problems;
}

// Dev-only self-check (Vite strips this in production builds).
if (import.meta.env && import.meta.env.DEV) validate();
