// APETATO game/spawner — wave budgets, trickled packets, elite rolls.
//
// Budget B(wave) = (14 + 7*wave + 0.35*wave^2) * modeRules.spawnMult
//                  * arena.modifiers.spawnBudgetMult   [* chaos spawnMult]
// trickled in packets every 2.2s (packet cost ≈ B / (duration / 2.2)),
// weightedPick from arena.enemyPool. Spawns appear at the arena edge at
// least 8u from the player after a 0.6s telegraph marker.
//
// Enemy scaling: hp  *= 1 + 0.22*(w-1) + 0.012*(w-1)^2
//                dmg *= 1 + 0.09*(w-1)
//                spd *= min(1.25, 1 + 0.005*w)
// all * mode mults, hp/dmg * (1 + curse/100); endless waves past the final
// additionally * 1.08^(wave - finalWave) on hp/dmg.

import { Content } from '../content/registry.js';
import { acquire } from './entities.js';

const PACKET_PERIOD = 2.2;
const TELEGRAPH_TIME = 0.6;
const MIN_PLAYER_DIST = 8;
const PENDING_CAP = 96;

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/** Refresh state.enemyScale {hp,dmg,spd} for the current wave. */
export function computeEnemyScale(state) {
  const w = state.wave;
  const rules = state.modeRules;
  const arena = state.arena;
  const curse = 1 + ((state.players[0] && state.players[0].stats.curse) || 0) / 100;

  let hp = (1 + 0.22 * (w - 1) + 0.012 * (w - 1) * (w - 1)) * (rules.enemyHpMult || 1) * curse;
  let dmg = (1 + 0.09 * (w - 1)) * (rules.enemyDmgMult || 1) * curse;
  let spd = Math.min(1.25, 1 + 0.005 * w) * ((arena.modifiers && arena.modifiers.enemySpeedMult) || 1);

  if (state.chaosMod) {
    if (state.chaosMod.enemyHpMult) hp *= state.chaosMod.enemyHpMult;
    if (state.chaosMod.enemyDmgMult) dmg *= state.chaosMod.enemyDmgMult;
    // enemySpeedMult from chaos is applied live in enemyAI (wave-scoped).
  }
  const finalWave = rules.waves || 20;
  if (rules.endless && w > finalWave) {
    const over = Math.pow(1.08, w - finalWave);
    hp *= over;
    dmg *= over;
  }
  const s = state.enemyScale;
  s.hp = hp;
  s.dmg = dmg;
  s.spd = spd;
  return s;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/** Materialize one enemy (wave-scaled, optional elite mod). */
export function spawnEnemy(state, def, x, z, eliteMod) {
  if (!def) return null;
  const ent = acquire(state.stores.enemies);
  if (!ent) return null;
  const s = state.enemyScale;
  ent.def = def;
  ent.archetype = def.id;
  ent.x = x;
  ent.z = z;
  ent.radius = def.radius || 0.4;
  ent.maxHp = Math.max(1, Math.round((def.hp || 5) * s.hp));
  ent.speed = (def.speed || 2) * s.spd;
  ent.dmg = Math.max(0, Math.round((def.damage || 0) * s.dmg));
  ent.mult = s.dmg; // projectile/aoe damage multiplier
  ent.xpValue = def.xp || 1;
  ent.attackCd = 0.4; // spawn grace so telegraphed spawns don't insta-hit
  ent.fireCd = 0.5 + state.rng.next() * 0.8;
  if (eliteMod) {
    ent.elite = eliteMod;
    const m = eliteMod.statMult || {};
    ent.maxHp = Math.max(1, Math.round(ent.maxHp * (m.hp || 1)));
    ent.dmg = Math.max(0, Math.round(ent.dmg * (m.damage || 1)));
    ent.mult *= m.damage || 1;
    ent.speed *= m.speed || 1;
    ent.radius *= m.radius || 1;
    ent.xpValue = Math.round(ent.xpValue * (m.xp || 1));
    // Stagger elite interval-effect timers.
    ent.eliteT0 = 1 + state.rng.next();
    ent.eliteT1 = 2 + state.rng.next();
  }
  ent.hp = ent.maxHp;
  return ent;
}

/** Spawn by content id (splitters, boss adds). No telegraph. */
export function spawnEnemyById(state, id, x, z, eliteMod) {
  return spawnEnemy(state, Content.byId.enemies.get(id), x, z, eliteMod);
}

// ---------------------------------------------------------------------------
// Wave trickle
// ---------------------------------------------------------------------------

function makePendingSlot() {
  return { active: false, t: 0, def: null, elite: null, x: 0, z: 0 };
}

/** Build the spawner's per-run scratch (call once per run). */
export function createSpawnerState() {
  const pending = new Array(PENDING_CAP);
  for (let i = 0; i < PENDING_CAP; i++) pending[i] = makePendingSlot();
  return {
    budgetLeft: 0,
    packetCost: 0,
    packetTimer: 0,
    pending,
    active: false,
  };
}

/** Arm the spawner for the current wave. */
export function startWaveSpawning(state) {
  const sp = state.spawner;
  const rules = state.modeRules;
  const w = state.wave;
  let budget = (14 + 7 * w + 0.35 * w * w) * (rules.spawnMult || 1);
  budget *= (state.arena.modifiers && state.arena.modifiers.spawnBudgetMult) || 1;
  if (state.chaosMod && state.chaosMod.spawnMult) budget *= state.chaosMod.spawnMult;
  sp.budgetLeft = budget;
  sp.packetCost = Math.max(2, budget / Math.max(1, state.waveDuration / PACKET_PERIOD));
  sp.packetTimer = 0.8; // first packet lands quickly
  sp.active = true;
  for (let i = 0; i < sp.pending.length; i++) sp.pending[i].active = false;
  computeEnemyScale(state);
}

/** Stop trickling (boss phase end, wave end). */
export function stopWaveSpawning(state) {
  state.spawner.active = false;
  const pending = state.spawner.pending;
  for (let i = 0; i < pending.length; i++) pending[i].active = false;
}

function eliteChance(state) {
  if (state.wave < 4) return 0;
  let c = Math.min(0.25, 0.03 + 0.011 * state.wave) * (state.modeRules.eliteMult || 1);
  if (state.chaosMod && state.chaosMod.eliteMult) c *= state.chaosMod.eliteMult;
  return c;
}

function pickSpawnPoint(state, out) {
  const p = state.players[0];
  const hw = state.arenaW / 2 - 1;
  const hh = state.arenaH / 2 - 1;
  for (let tries = 0; tries < 8; tries++) {
    const side = state.rng.int(0, 3);
    let x;
    let z;
    if (side === 0) {
      x = -hw;
      z = state.rng.range(-hh, hh);
    } else if (side === 1) {
      x = hw;
      z = state.rng.range(-hh, hh);
    } else if (side === 2) {
      x = state.rng.range(-hw, hw);
      z = -hh;
    } else {
      x = state.rng.range(-hw, hw);
      z = hh;
    }
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz >= MIN_PLAYER_DIST * MIN_PLAYER_DIST || tries === 7) {
      out.x = x;
      out.z = z;
      return;
    }
  }
}

const SPAWN_PT = { x: 0, z: 0 };
const POOL_WEIGHT = (entry) => entry.weight || 1;

function queueSpawn(state, def, elite) {
  const pending = state.spawner.pending;
  for (let i = 0; i < pending.length; i++) {
    const slot = pending[i];
    if (slot.active) continue;
    pickSpawnPoint(state, SPAWN_PT);
    slot.active = true;
    slot.t = TELEGRAPH_TIME;
    slot.def = def;
    slot.elite = elite;
    slot.x = SPAWN_PT.x;
    slot.z = SPAWN_PT.z;
    state.renderApi.vfx('telegraph', slot.x, slot.z, {
      radius: (def.radius || 0.4) + 0.4,
      duration: TELEGRAPH_TIME,
    });
    return true;
  }
  return false; // queue full — spawn next packet instead
}

function spawnPacket(state) {
  const sp = state.spawner;
  const pool = state.arena.enemyPool;
  if (!Array.isArray(pool) || pool.length === 0) return;
  let cost = Math.min(sp.packetCost, sp.budgetLeft);
  // Elite chance is rolled once PER PACKET (contract): at most one elite.
  let eliteArmed = state.rng.next() < eliteChance(state);
  let guard = 40;
  while (cost > 0 && guard-- > 0) {
    const entry = state.rng.weightedPick(pool, POOL_WEIGHT);
    const def = entry && Content.byId.enemies.get(entry.id);
    if (!def) break;
    let elite = null;
    if (eliteArmed && def.eliteAllowed && Content.eliteMods.length > 0) {
      elite = state.rng.pick(Content.eliteMods);
      eliteArmed = false;
    }
    if (!queueSpawn(state, def, elite)) break;
    const c = Math.max(1, def.budgetCost || 1) * (elite ? 3 : 1);
    cost -= c;
    sp.budgetLeft -= c;
  }
  if (sp.budgetLeft < 1) sp.budgetLeft = 0;
}

/** Per-step spawner tick: packet trickle + telegraphed spawn resolution. */
export function updateSpawner(state, dt) {
  const sp = state.spawner;
  // Resolve pending telegraphs even after the trickle stops.
  const pending = sp.pending;
  for (let i = 0; i < pending.length; i++) {
    const slot = pending[i];
    if (!slot.active) continue;
    slot.t -= dt;
    if (slot.t <= 0) {
      slot.active = false;
      spawnEnemy(state, slot.def, slot.x, slot.z, slot.elite);
    }
  }
  if (!sp.active || sp.budgetLeft <= 0) return;
  sp.packetTimer -= dt;
  if (sp.packetTimer <= 0) {
    sp.packetTimer = PACKET_PERIOD;
    spawnPacket(state);
  }
}

/** Live trash count (excludes the boss, which is unpooled). */
export function aliveEnemyCount(state) {
  return state.stores.enemies.pool.activeCount;
}
