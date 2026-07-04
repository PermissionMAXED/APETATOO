// APETATO weapons — master index.
// Concatenates every weapon class file into the single frozen WEAPONS array
// and runs a dev-only validate() self-check (console.warn on any violation).

import { MELEE_WEAPONS } from './melee.js';
import { RANGED_WEAPONS } from './ranged.js';
import { EXPLOSIVE_WEAPONS } from './explosive.js';
import { MAGIC_WEAPONS } from './magic.js';
import { TECH_WEAPONS } from './tech.js';
import { ELEMENTAL_WEAPONS } from './elemental.js';
import { SUPPORT_WEAPONS } from './support.js';
import { EXOTIC_WEAPONS } from './exotic.js';

export const WEAPONS = Object.freeze([
  ...MELEE_WEAPONS,
  ...RANGED_WEAPONS,
  ...EXPLOSIVE_WEAPONS,
  ...MAGIC_WEAPONS,
  ...TECH_WEAPONS,
  ...ELEMENTAL_WEAPONS,
  ...SUPPORT_WEAPONS,
  ...EXOTIC_WEAPONS,
]);

/** The 15 weapon classes usable for 2/4/6 set bonuses. */
export const WEAPON_CLASSES = Object.freeze([
  'melee', 'ranged', 'explosive', 'magic', 'tech', 'poison', 'fire', 'pet',
  'turret', 'support', 'crit', 'lifesteal', 'speed', 'chaos', 'precision',
]);

/** Allowed behavior keys, interpreted by the combat system. */
export const WEAPON_BEHAVIORS = Object.freeze([
  'melee_swing', 'melee_thrust', 'melee_spin', 'projectile', 'burst',
  'shotgun', 'lobbed', 'beam', 'chain', 'boomerang', 'orbit', 'aura', 'nova',
  'homing', 'turret', 'pet', 'mine', 'support_buff', 'rail', 'chaos_random',
]);

const UNLOCK_TYPES = ['default', 'achievement', 'buy', 'wins'];

/**
 * Dev-only data self-check. Warns (never throws) so a bad entry can't brick
 * the game. Returns the number of problems found.
 */
export function validate() {
  const warn = (msg) => console.warn(`[weapons] ${msg}`);
  let problems = 0;
  const bad = (msg) => { problems++; warn(msg); };

  if (WEAPONS.length < 80) bad(`expected >= 80 weapons, got ${WEAPONS.length}`);

  const seen = new Set();
  const classCounts = {};
  for (const c of WEAPON_CLASSES) classCounts[c] = 0;

  for (const w of WEAPONS) {
    const tag = w && w.id ? w.id : JSON.stringify(w);
    if (!w || typeof w.id !== 'string' || !/^[a-z0-9_]+$/.test(w.id)) {
      bad(`invalid id: ${tag}`);
      continue;
    }
    if (seen.has(w.id)) bad(`duplicate id: ${w.id}`);
    seen.add(w.id);

    if (!Array.isArray(w.classes) || w.classes.length < 1 || w.classes.length > 2) {
      bad(`${w.id}: classes must have 1-2 entries`);
    } else {
      for (const c of w.classes) {
        if (!WEAPON_CLASSES.includes(c)) bad(`${w.id}: unknown class '${c}'`);
        else classCounts[c]++;
      }
    }

    if (!(w.tier >= 1 && w.tier <= 4)) bad(`${w.id}: tier out of range`);
    if (!(w.basePrice > 0)) bad(`${w.id}: basePrice missing`);
    if (!WEAPON_BEHAVIORS.includes(w.behavior)) bad(`${w.id}: unknown behavior '${w.behavior}'`);
    if (!w.unlock || !UNLOCK_TYPES.includes(w.unlock.type)) bad(`${w.id}: bad unlock`);

    const s = w.stats || {};
    if (!(s.cooldown >= 0.15)) bad(`${w.id}: cooldown must be >= 0.15`);
    if (s.count !== undefined && s.count > 6) bad(`${w.id}: count > 6`);
    if (s.pierce !== undefined && s.pierce > 5) bad(`${w.id}: pierce > 5`);
    if (w.classes && w.classes.includes('crit')) {
      if (!(s.critChance >= 15 && s.critChance <= 30)) bad(`${w.id}: crit weapon critChance must be 15-30`);
      if (!(s.critMult >= 2.0 && s.critMult <= 3.0)) bad(`${w.id}: crit weapon critMult must be 2.0-3.0`);
    } else {
      if (!(s.critChance >= 3 && s.critChance <= 5)) bad(`${w.id}: critChance must be 3-5`);
      if (s.critMult !== 1.5) bad(`${w.id}: critMult must be 1.5`);
    }
    if (w.behavior === 'melee_swing' || w.behavior === 'melee_thrust' || w.behavior === 'melee_spin') {
      if (!(s.range >= 1.5 && s.range <= 3.5)) bad(`${w.id}: melee range must be 1.5-3.5`);
    }
    if (w.behavior === 'projectile' || w.behavior === 'burst' || w.behavior === 'homing' || w.behavior === 'rail') {
      if (!(s.range >= 6 && s.range <= 14)) bad(`${w.id}: ranged range must be 6-14`);
    }
    if (!Object.isFrozen(w)) bad(`${w.id}: not frozen`);
  }

  for (const c of WEAPON_CLASSES) {
    if (classCounts[c] < 4) bad(`class '${c}' has only ${classCounts[c]} weapons (need >= 4 for set bonuses)`);
  }

  if (problems === 0) {
    console.log(
      `[weapons] validate OK — ${WEAPONS.length} weapons ` +
      `(melee ${MELEE_WEAPONS.length}, ranged ${RANGED_WEAPONS.length}, ` +
      `explosive ${EXPLOSIVE_WEAPONS.length}, magic ${MAGIC_WEAPONS.length}, ` +
      `tech ${TECH_WEAPONS.length}, elemental ${ELEMENTAL_WEAPONS.length}, ` +
      `support ${SUPPORT_WEAPONS.length}, exotic ${EXOTIC_WEAPONS.length})`
    );
  }
  return problems;
}

// Dev-only self-check (Vite strips this in production builds).
if (import.meta.env && import.meta.env.DEV) validate();
