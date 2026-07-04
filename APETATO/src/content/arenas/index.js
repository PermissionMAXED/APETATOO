// APETATO arenas — master index.
// Concatenates the jungle + temple sets into the single frozen ARENAS array
// and runs a dev-only validate() self-check (console.warn on any violation).

import { JUNGLE_ARENAS } from './jungleSet.js';
import { TEMPLE_ARENAS } from './templeSet.js';
import { ENEMIES, BOSSES } from '../enemies/index.js';

export const ARENAS = Object.freeze([...JUNGLE_ARENAS, ...TEMPLE_ARENAS]);

/** Allowed hazard type keys, interpreted by the arena/hazard system. */
export const HAZARD_TYPES = Object.freeze([
  'lava_pool', 'poison_puddle', 'conveyor', 'banana_storm', 'collapsing_stone',
  'geyser', 'thorn_patch', 'dark_zone',
]);

const OBSTACLE_MODELS = ['rock', 'tree', 'pillar', 'crate'];
const MUSIC_KEYS = ['jungle', 'temple', 'volcano', 'storm', 'night'];
const UNLOCK_TYPES = ['default', 'wins', 'achievement'];

/**
 * Dev-only data self-check. Warns (never throws) so a bad entry can't brick
 * the game. Returns the number of problems found.
 */
export function validate() {
  const warn = (msg) => console.warn(`[arenas] ${msg}`);
  let problems = 0;
  const bad = (msg) => { problems++; warn(msg); };

  if (ARENAS.length < 10) bad(`expected >= 10 arenas, got ${ARENAS.length}`);

  const enemyIds = new Set(ENEMIES.map((e) => e.id));
  const bossIds = new Set(BOSSES.map((b) => b.id));
  const seen = new Set();
  const pooledEnemyIds = new Set();

  for (const a of ARENAS) {
    const tag = a && a.id ? a.id : JSON.stringify(a);
    if (!a || typeof a.id !== 'string' || !/^[a-z0-9_]+$/.test(a.id)) {
      bad(`invalid id: ${tag}`);
      continue;
    }
    if (seen.has(a.id)) bad(`duplicate id: ${a.id}`);
    seen.add(a.id);

    const s = a.size || {};
    if (!(s.w >= 36 && s.w <= 56 && s.h >= 24 && s.h <= 36)) {
      bad(`${a.id}: size must be within 36x24..56x36, got ${s.w}x${s.h}`);
    }
    if (!(a.propDensity >= 0 && a.propDensity <= 1)) bad(`${a.id}: propDensity must be 0..1`);

    for (const o of a.obstacles || []) {
      if (o.shape !== 'circle') bad(`${a.id}: obstacle shape must be 'circle'`);
      if (!OBSTACLE_MODELS.includes(o.model)) bad(`${a.id}: unknown obstacle model '${o.model}'`);
    }
    for (const h of a.hazards || []) {
      if (!HAZARD_TYPES.includes(h.type)) bad(`${a.id}: unknown hazard type '${h.type}'`);
    }

    if (!Array.isArray(a.enemyPool) || a.enemyPool.length < 5 || a.enemyPool.length > 8) {
      bad(`${a.id}: enemyPool must have 5-8 entries, got ${(a.enemyPool || []).length}`);
    }
    for (const p of a.enemyPool || []) {
      if (!enemyIds.has(p.id)) bad(`${a.id}: enemyPool id '${p.id}' not found in ENEMIES`);
      else pooledEnemyIds.add(p.id);
      if (!(p.weight > 0)) bad(`${a.id}: enemyPool weight for '${p.id}' must be > 0`);
    }

    if (!bossIds.has(a.bossId)) bad(`${a.id}: bossId '${a.bossId}' not found in BOSSES`);
    if (!bossIds.has(a.minibossId)) bad(`${a.id}: minibossId '${a.minibossId}' not found in BOSSES`);

    const m = a.modifiers || {};
    if (typeof m.enemySpeedMult !== 'number' || typeof m.spawnBudgetMult !== 'number') {
      bad(`${a.id}: modifiers must have enemySpeedMult and spawnBudgetMult`);
    }
    if (!MUSIC_KEYS.includes(a.music)) bad(`${a.id}: unknown music '${a.music}'`);
    if (!a.unlock || !UNLOCK_TYPES.includes(a.unlock.type)) bad(`${a.id}: bad unlock`);
    if (!Object.isFrozen(a)) bad(`${a.id}: not frozen`);
  }

  if (!ARENAS.some((a) => a.unlock && a.unlock.type === 'default')) {
    bad(`at least one arena must be default-unlocked`);
  }
  const final = ARENAS.find((a) => a.id === 'gorillard_throne');
  if (!final) bad(`missing final arena 'gorillard_throne'`);
  else if (final.bossId !== 'gorillard_prime') bad(`gorillard_throne bossId must be 'gorillard_prime'`);

  // Every defined enemy must be spawnable somewhere.
  for (const id of enemyIds) {
    if (!pooledEnemyIds.has(id)) bad(`enemy '${id}' appears in no arena enemyPool`);
  }

  if (problems === 0) {
    console.log(
      `[arenas] validate OK — ${ARENAS.length} arenas ` +
      `(jungle ${JUNGLE_ARENAS.length}, temple ${TEMPLE_ARENAS.length}; ` +
      `all ${enemyIds.size} enemy types pooled)`
    );
  }
  return problems;
}

// Dev-only self-check (Vite strips this in production builds).
if (import.meta.env && import.meta.env.DEV) validate();
