// APETATO enemies — master index.
// Concatenates the basic + advanced rosters into the single frozen ENEMIES
// array, re-exports ELITE_MODS and BOSSES, and runs a dev-only validate()
// self-check (console.warn on any violation).

import { BASIC_ENEMIES } from './basic.js';
import { ADVANCED_ENEMIES } from './advanced.js';
import { ELITE_MODS } from './elites.js';
import { BOSSES } from './bosses.js';

export const ENEMIES = Object.freeze([...BASIC_ENEMIES, ...ADVANCED_ENEMIES]);
export { ELITE_MODS };
export { BOSSES };

/** Allowed behavior keys, interpreted by the enemy AI system. */
export const ENEMY_BEHAVIORS = Object.freeze([
  'chaser', 'shooter', 'charger', 'exploder', 'healer', 'shielder', 'sniper',
  'swarmer', 'orbiter', 'totem', 'splitter', 'teleporter',
]);

/** Allowed boss phase pattern keys, interpreted by the boss system. */
export const BOSS_PATTERNS = Object.freeze([
  'charge_slam', 'ring_barrage', 'summon_adds', 'ground_pound', 'laser_sweep',
  'rage_spiral', 'teleport_burst', 'shield_totems',
]);

const ATTACK_TYPES = ['contact', 'projectile', 'aoe'];
const MODEL_ANIMATIONS = ['bob', 'hop', 'slither', 'spin', 'hover', 'stomp', 'none'];
const EFFECT_TRIGGERS = ['onDeath', 'onHit', 'interval'];

/**
 * Dev-only data self-check. Warns (never throws) so a bad entry can't brick
 * the game. Returns the number of problems found.
 */
export function validate() {
  const warn = (msg) => console.warn(`[enemies] ${msg}`);
  let problems = 0;
  const bad = (msg) => { problems++; warn(msg); };

  const enemyIds = new Set();
  const allIds = new Set();

  const checkModel = (tag, m) => {
    if (!m || typeof m.scale !== 'number') { bad(`${tag}: bad model`); return; }
    if (!MODEL_ANIMATIONS.includes(m.animation)) bad(`${tag}: unknown animation '${m.animation}'`);
    if (!Array.isArray(m.parts)) bad(`${tag}: model.parts must be an array`);
  };

  const checkEnemyCore = (e) => {
    const tag = e && e.id ? e.id : JSON.stringify(e);
    if (!e || typeof e.id !== 'string' || !/^[a-z0-9_]+$/.test(e.id)) {
      bad(`invalid id: ${tag}`);
      return false;
    }
    if (allIds.has(e.id)) bad(`duplicate id: ${e.id}`);
    allIds.add(e.id);

    if (!ENEMY_BEHAVIORS.includes(e.behavior)) bad(`${e.id}: unknown behavior '${e.behavior}'`);
    if (!e.attack || !ATTACK_TYPES.includes(e.attack.type)) bad(`${e.id}: bad attack type`);
    if (!(e.hp > 0)) bad(`${e.id}: hp must be > 0`);
    if (!(e.coinChance >= 0 && e.coinChance <= 1)) bad(`${e.id}: coinChance must be 0..1`);
    if (typeof e.sfxDeath !== 'string') bad(`${e.id}: sfxDeath missing`);
    checkModel(e.id, e.model);
    if (!Object.isFrozen(e)) bad(`${e.id}: not frozen`);
    return true;
  };

  // ---- regular enemies ----
  for (const e of ENEMIES) {
    if (!checkEnemyCore(e)) continue;
    enemyIds.add(e.id);
    if (!(e.tier >= 1 && e.tier <= 4)) bad(`${e.id}: tier out of range`);
    if (!(e.budgetCost >= 1)) bad(`${e.id}: budgetCost must be >= 1`);
    if (typeof e.eliteAllowed !== 'boolean') bad(`${e.id}: eliteAllowed missing`);
  }
  const nonSlimelet = ENEMIES.filter((e) => e.id !== 'banana_slimelet').length;
  if (nonSlimelet < 15) bad(`expected >= 15 non-slimelet enemy types, got ${nonSlimelet}`);

  // splitInto targets must resolve to real enemies
  for (const e of ENEMIES) {
    if (e.behavior === 'splitter' && !enemyIds.has(e.behaviorParams.splitInto)) {
      bad(`${e.id}: splitInto '${e.behaviorParams.splitInto}' not found in ENEMIES`);
    }
  }

  // ---- bosses ----
  if (BOSSES.length < 12) bad(`expected >= 12 bosses, got ${BOSSES.length}`);
  for (const b of BOSSES) {
    if (!checkEnemyCore(b)) continue;
    if (b.isBoss !== true) bad(`${b.id}: isBoss must be true`);
    if (!Array.isArray(b.phases) || b.phases.length < 1) bad(`${b.id}: needs >= 1 phase`);
    for (const p of b.phases || []) {
      if (!BOSS_PATTERNS.includes(p.pattern)) bad(`${b.id}: unknown pattern '${p.pattern}'`);
      if (!(p.untilHpPct >= 0 && p.untilHpPct < 1)) bad(`${b.id}: untilHpPct must be 0..1`);
      if (p.pattern === 'summon_adds' && !enemyIds.has(p.params.addId)) {
        bad(`${b.id}: summon_adds addId '${p.params.addId}' not found in ENEMIES`);
      }
    }
    if (b.behavior === 'splitter' && !enemyIds.has(b.behaviorParams.splitInto)) {
      bad(`${b.id}: splitInto '${b.behaviorParams.splitInto}' not found in ENEMIES`);
    }
  }
  const prime = BOSSES.find((b) => b.id === 'gorillard_prime');
  if (!prime) bad(`missing final boss 'gorillard_prime'`);
  else if (!(prime.phases.length === 3 && prime.hp >= 1200)) bad(`gorillard_prime must have 3 phases and >= 1200 hp`);
  if (!BOSSES.some((b) => b.id === 'crab_captain')) bad(`missing miniboss 'crab_captain'`);

  // ---- elite mods ----
  if (ELITE_MODS.length < 6) bad(`expected >= 6 elite mods, got ${ELITE_MODS.length}`);
  for (const m of ELITE_MODS) {
    const tag = m && m.id ? m.id : JSON.stringify(m);
    if (!m || typeof m.id !== 'string' || !/^[a-z0-9_]+$/.test(m.id)) {
      bad(`invalid elite id: ${tag}`);
      continue;
    }
    if (allIds.has(m.id)) bad(`duplicate id: ${m.id}`);
    allIds.add(m.id);
    if (!/^#[0-9a-f]{6}$/i.test(m.tint || '')) bad(`${m.id}: bad tint`);
    const sm = m.statMult || {};
    for (const k of ['hp', 'damage', 'speed', 'radius', 'xp']) {
      if (typeof sm[k] !== 'number') bad(`${m.id}: statMult.${k} missing`);
    }
    if (!Array.isArray(m.effects) || m.effects.length < 1) bad(`${m.id}: needs >= 1 effect`);
    for (const fx of m.effects || []) {
      if (!EFFECT_TRIGGERS.includes(fx.trigger)) bad(`${m.id}: unknown trigger '${fx.trigger}'`);
    }
    if (m.dropCrate !== true) bad(`${m.id}: dropCrate must be true`);
    if (!Object.isFrozen(m)) bad(`${m.id}: not frozen`);
  }

  if (problems === 0) {
    console.log(
      `[enemies] validate OK — ${ENEMIES.length} enemies ` +
      `(basic ${BASIC_ENEMIES.length}, advanced ${ADVANCED_ENEMIES.length}, ` +
      `${nonSlimelet} non-slimelet), ${BOSSES.length} bosses, ` +
      `${ELITE_MODS.length} elite mods`
    );
  }
  return problems;
}

// Dev-only self-check (Vite strips this in production builds).
if (import.meta.env && import.meta.env.DEV) validate();
