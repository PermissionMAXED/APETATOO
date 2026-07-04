// APETATO game/weapons — weapon instances + the behavior interpreter.
//
// Behaviors: melee_swing (arc, default 100°), melee_thrust, melee_spin
// (360°), projectile, burst (burstCount shots ~60ms apart), shotgun
// (count + spread), lobbed (arc shot, explodes), beam (8 ticks/s on target),
// chain (hops, -20% dmg each), boomerang (out + return), orbit (persistent
// orbiters), aura (dps around player), nova (ring pulse per cooldown),
// homing (6 rad/s turn), turret / pet (companions), mine (proximity),
// support_buff (periodic buff op), rail (instant pierce-all line),
// chaos_random (random projectile/shotgun/nova/explosion at 0.8-1.5x).
//
// extraProjectiles adds to the count of projectile-family fires.
// Merge: same weapon id at the same tier combines to tier+1 (max 4);
// per tier: damage x1.6, range x1.15, cooldown x0.92 (combat.js math).

import { TAU } from '../core/mathx.js';
import {
  applyWeaponHit,
  rollWeaponDamage,
  explodeFromPlayer,
  weaponRange,
  weaponCooldown,
} from './combat.js';
import {
  spawnWeaponProjectile,
  spawnLobbed,
  spawnOrbiter,
  spawnMine,
} from './projectiles.js';
import { deployTurret, ensurePet } from './companions.js';
import { addBuff, recomputeStats } from './player.js';
import { registerOwner, unregisterOwner } from './effects.js';
import { updateSynergies } from './synergy.js';

const MELEE_Q = []; // arc-hit scratch
const FIRE_EV = { weaponId: '', x: 0, z: 0, behavior: '' };
const MAX_TIER = 4;
const BEAM_TICK = 1 / 8;

let instSeq = 1;

// ---------------------------------------------------------------------------
// Instances / inventory
// ---------------------------------------------------------------------------

/** Build a WeaponInstance (contract shape + interpreter scratch). */
export function makeWeaponInstance(def) {
  return {
    def,
    tier: (def.tier | 0) || 1,
    cooldownLeft: 0.3,
    slotIndex: -1,
    orbitAngle: 0,
    targetId: 0,
    dmgDealt: 0,
    // interpreter scratch
    _uid: instSeq++,
    _burstLeft: 0,
    _burstTimer: 0,
    _burstDirX: 1,
    _burstDirZ: 0,
    _beamAcc: 0,
    _beamTarget: null,
    _healAcc: 0,
    _orbitGen: 0,
    _orbitCount: 0,
    _petRespawnAt: 0,
  };
}

function weaponSlotLimit(state, player) {
  const rules = state.modeRules;
  if (rules.weaponSlots !== null && rules.weaponSlots !== undefined) return rules.weaponSlots;
  return (player.character && player.character.weaponSlots) || 6;
}

function effectSourceId(w) {
  return 'weapon:' + w.def.id + '#' + w._uid;
}

function findOwnedAtTier(player, id, tier) {
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i];
    if (w.def.id === id && w.tier === tier) return i;
  }
  return -1;
}

/**
 * Add (or merge) a weapon. Returns { ok, merged, weapon }.
 * Merging: an incoming copy at tier T absorbs an owned same-id weapon at
 * tier T into tier T+1 and cascades (two T+1s combine again), capped at 4.
 */
export function addWeapon(state, player, def) {
  if (!def) return { ok: false, merged: false, weapon: null };
  let tier = (def.tier | 0) || 1;
  let merged = false;
  let carriedDmg = 0;
  // Cascade-absorb owned copies of the same tier.
  while (tier < MAX_TIER) {
    const idx = findOwnedAtTier(player, def.id, tier);
    if (idx === -1) break;
    const absorbed = removeWeaponAt(state, player, idx);
    if (absorbed) carriedDmg += absorbed.dmgDealt;
    tier++;
    merged = true;
  }
  if (player.weapons.length >= weaponSlotLimit(state, player)) {
    return { ok: false, merged: false, weapon: null };
  }
  const w = makeWeaponInstance(def);
  w.tier = tier;
  w.dmgDealt = carriedDmg;
  w.slotIndex = player.weapons.length;
  player.weapons.push(w);
  if (Array.isArray(def.onHit) && def.onHit.length > 0) {
    registerOwner(player, effectSourceId(w), def.onHit, { weapon: w });
  }
  state.runStats.buildLog.push({
    wave: state.wave,
    kind: merged ? 'merge' : 'weapon',
    id: def.id,
    tier,
  });
  updateSynergies(state, player);
  recomputeStats(state, player);
  return { ok: true, merged, weapon: w };
}

/** Remove the weapon at index (sell). Returns the removed instance or null. */
export function removeWeaponAt(state, player, idx) {
  const w = player.weapons[idx];
  if (!w) return null;
  player.weapons.splice(idx, 1);
  for (let i = 0; i < player.weapons.length; i++) player.weapons[i].slotIndex = i;
  unregisterOwner(effectSourceId(w));
  w._orbitGen++; // orphan its orbiters (they self-release)
  updateSynergies(state, player);
  recomputeStats(state, player);
  return w;
}

// ---------------------------------------------------------------------------
// Firing helpers
// ---------------------------------------------------------------------------

function emitFire(state, player, w) {
  FIRE_EV.weaponId = w.def.id;
  FIRE_EV.x = player.x;
  FIRE_EV.z = player.z;
  FIRE_EV.behavior = w.def.behavior;
  state.bus.emit('weapon:fire', FIRE_EV);
}

function effectiveRange(w, player) {
  return weaponRange(w, player.stats) * (player._darkMult || 1);
}

function findTarget(state, player, range) {
  return state.hash.nearest(player.x, player.z, range, null);
}

function projectileCount(w, player) {
  return 1 + Math.max(0, Math.round(player.stats.extraProjectiles || 0));
}

/** Fire `count` projectiles fanned around (dirX, dirZ). */
function fanProjectiles(state, player, w, dirX, dirZ, count, spreadRad, ptype, mult) {
  const base = Math.atan2(dirZ, dirX);
  for (let i = 0; i < count; i++) {
    const off = count > 1 ? (i / (count - 1) - 0.5) * spreadRad : 0;
    const a = base + off;
    spawnWeaponProjectile(state, player, w, Math.cos(a), Math.sin(a), ptype, mult);
  }
}

function meleeArcHit(state, player, w, dirX, dirZ, arcDeg, range, mult) {
  const halfArc = ((arcDeg || 100) * Math.PI) / 180 / 2;
  const aim = Math.atan2(dirZ, dirX);
  const n = state.hash.query(player.x, player.z, range + 0.4, MELEE_Q);
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const ent = MELEE_Q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    const dx = ent.x - player.x;
    const dz = ent.z - player.z;
    if (dx * dx + dz * dz > (range + ent.radius) * (range + ent.radius)) continue;
    let delta = Math.atan2(dz, dx) - aim;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    if (Math.abs(delta) <= halfArc) {
      applyWeaponHit(state, player, w, ent, mult || 1);
      hits++;
    }
  }
  return hits;
}

function novaPulse(state, player, w, radius, mult) {
  state.renderApi.vfx('nova', player.x, player.z, { radius });
  const n = state.hash.query(player.x, player.z, radius, MELEE_Q);
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const ent = MELEE_Q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    applyWeaponHit(state, player, w, ent, mult || 1);
    hits++;
  }
  return hits;
}

function railShot(state, player, w, dirX, dirZ, range, mult) {
  // Instant pierce-all line: march the segment, hitting each enemy once.
  const len = Math.max(range, 10) * 1.4;
  state.renderApi.vfx('beam', player.x, player.z, {
    x2: player.x + dirX * len,
    z2: player.z + dirZ * len,
    duration: 0.15,
  });
  const n = state.hash.query(player.x + dirX * len * 0.5, player.z + dirZ * len * 0.5, len * 0.5 + 2, MELEE_Q);
  for (let i = 0; i < n; i++) {
    const ent = MELEE_Q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    const px = ent.x - player.x;
    const pz = ent.z - player.z;
    const along = px * dirX + pz * dirZ;
    if (along < 0 || along > len) continue;
    const perp = Math.abs(-px * dirZ + pz * dirX);
    if (perp <= ent.radius + 0.35) applyWeaponHit(state, player, w, ent, mult || 1);
  }
  if (w.def.behaviorParams && w.def.behaviorParams.screenShake) state.renderApi.shake(0.2);
}

function supportBuff(state, player, w) {
  const params = w.def.behaviorParams || {};
  let buff = params.buff;
  if (Array.isArray(params.randomBuff) && params.randomBuff.length > 0) {
    buff = state.rng.pick(params.randomBuff);
  }
  if (buff && buff.stat) {
    const dur = (buff.duration || 2) * (1 + (player.stats.effectDuration || 0) / 100);
    addBuff(state, player, buff.stat, buff.add || 0, dur);
  }
  if (params.alsoNova) {
    const radius = (w.def.stats && w.def.stats.radius) || 3;
    novaPulse(state, player, w, radius, 1);
  }
  if (params.healSelf) {
    // rare content variant; graceful
    w._healAcc += params.healSelf;
  }
}

function activeMineCount(state, w) {
  const all = state.stores.projectiles.all;
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (p.active && p.ptype === 'mine' && p.weaponRef === w) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Per-behavior fire
// ---------------------------------------------------------------------------

function fireWeapon(state, player, w, target, dirX, dirZ, range) {
  const behavior = w.def.behavior || 'projectile';
  const params = w.def.behaviorParams || {};
  const stats = w.def.stats || {};

  switch (behavior) {
    case 'melee_swing':
      meleeArcHit(state, player, w, dirX, dirZ, params.arc || 100, range, 1);
      break;

    case 'melee_thrust': {
      // Narrow jab, slightly longer reach; lunge nudges the player forward.
      meleeArcHit(state, player, w, dirX, dirZ, 35, range * 1.2, 1);
      if (params.lunge) {
        player.kbX += dirX * params.lunge * 6;
        player.kbZ += dirZ * params.lunge * 6;
      }
      break;
    }

    case 'melee_spin':
      meleeArcHit(state, player, w, dirX, dirZ, 360, range, 1);
      break;

    case 'projectile':
      fanProjectiles(state, player, w, dirX, dirZ, projectileCount(w, player), 0.22, 'projectile', 1);
      break;

    case 'burst': {
      w._burstLeft = (params.burstCount || 3) * projectileCount(w, player) - 1;
      w._burstTimer = params.burstInterval || 0.06;
      w._burstDirX = dirX;
      w._burstDirZ = dirZ;
      spawnWeaponProjectile(state, player, w, dirX, dirZ, 'projectile', 1);
      break;
    }

    case 'shotgun': {
      const count = (stats.count || 5) + Math.max(0, Math.round(player.stats.extraProjectiles || 0));
      const spread = ((stats.spread || 30) * Math.PI) / 180;
      fanProjectiles(state, player, w, dirX, dirZ, count, spread, 'projectile', 1);
      if (params.recoilDash) {
        player.kbX -= dirX * params.recoilDash * 8;
        player.kbZ -= dirZ * params.recoilDash * 8;
      }
      break;
    }

    case 'lobbed': {
      const count = projectileCount(w, player);
      for (let i = 0; i < count; i++) {
        const jx = i === 0 ? 0 : (state.rng.next() - 0.5) * 2.4;
        const jz = i === 0 ? 0 : (state.rng.next() - 0.5) * 2.4;
        const tx = target ? target.x + jx : player.x + dirX * range + jx;
        const tz = target ? target.z + jz : player.z + dirZ * range + jz;
        spawnLobbed(state, player, w, tx, tz, 1);
      }
      break;
    }

    case 'chain':
      fanProjectiles(state, player, w, dirX, dirZ, projectileCount(w, player), 0.35, 'chain', 1);
      break;

    case 'homing':
      fanProjectiles(state, player, w, dirX, dirZ, projectileCount(w, player), 0.5, 'homing', 1);
      break;

    case 'boomerang':
      fanProjectiles(state, player, w, dirX, dirZ, projectileCount(w, player), 0.4, 'boomerang', 1);
      break;

    case 'nova':
      novaPulse(state, player, w, (stats.radius || range) * (1 + (player.stats.explosionSize || 0) / 100), 1);
      break;

    case 'mine': {
      if (activeMineCount(state, w) < (params.maxActive || 3)) spawnMine(state, player, w);
      break;
    }

    case 'turret':
      deployTurret(state, player, w);
      break;

    case 'support_buff':
      supportBuff(state, player, w);
      break;

    case 'rail':
      railShot(state, player, w, dirX, dirZ, range, 1);
      break;

    case 'chaos_random': {
      const mult = 0.8 + state.rng.next() * 0.7; // 0.8 - 1.5x
      const pick = state.rng.int(0, 3);
      if (pick === 0) {
        fanProjectiles(state, player, w, dirX, dirZ, projectileCount(w, player), 0.25, 'projectile', mult);
      } else if (pick === 1) {
        const count = 4 + Math.max(0, Math.round(player.stats.extraProjectiles || 0));
        fanProjectiles(state, player, w, dirX, dirZ, count, 0.6, 'projectile', mult);
      } else if (pick === 2) {
        novaPulse(state, player, w, (stats.radius || 3) * (1 + (player.stats.explosionSize || 0) / 100), mult);
      } else {
        const x = target ? target.x : player.x + dirX * 3;
        const z = target ? target.z : player.z + dirZ * 3;
        const roll = rollWeaponDamage(state, player, w, mult);
        const radius = (stats.radius || 2.2) * (1 + (player.stats.explosionSize || 0) / 100);
        explodeFromPlayer(state, player, x, z, radius, roll.damage, w);
      }
      break;
    }

    default:
      // Unknown behavior — fall back to a plain shot so content never bricks.
      spawnWeaponProjectile(state, player, w, dirX, dirZ, 'projectile', 1);
      break;
  }

  emitFire(state, player, w);
}

// ---------------------------------------------------------------------------
// Continuous behaviors (aura / beam / orbit upkeep / pets / bursts)
// ---------------------------------------------------------------------------

function tickAura(state, player, w, dt) {
  const params = w.def.behaviorParams || {};
  const stats = w.def.stats || {};
  const period = Math.max(0.15, weaponCooldown(w, player.stats) * ((params.tick || 0.5) / Math.max(0.05, stats.cooldown || 0.5)));
  w._beamAcc += dt;
  if (w._beamAcc < period) return;
  w._beamAcc -= period;
  const radius = (stats.radius || 2.5) * (1 + (player.stats.range || 0) / 100);
  const n = state.hash.query(player.x, player.z, radius, MELEE_Q);
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const ent = MELEE_Q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    applyWeaponHit(state, player, w, ent, 1);
    hits++;
  }
  if (hits > 0) {
    state.renderApi.vfx('aura', player.x, player.z, { radius, duration: period });
    emitFire(state, player, w);
    if (params.healSelfPerTick) {
      w._healAcc += params.healSelfPerTick * hits;
      if (w._healAcc >= 1) {
        const whole = Math.floor(w._healAcc);
        w._healAcc -= whole;
        player.hp = Math.min(player.stats.maxHp, player.hp + whole);
      }
    }
  }
}

function tickBeam(state, player, w, dt) {
  const range = effectiveRange(w, player);
  let target = w._beamTarget;
  if (!target || !target.active || target.dead) {
    target = findTarget(state, player, range);
    w._beamTarget = target;
    w.targetId = target ? target.id : 0;
  }
  if (!target) {
    w._beamAcc = 0;
    return;
  }
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  if (dx * dx + dz * dz > range * range) {
    w._beamTarget = null;
    return;
  }
  const tick = BEAM_TICK / (1 + (player.stats.attackSpeed || 0) / 100);
  w._beamAcc += dt;
  while (w._beamAcc >= tick) {
    w._beamAcc -= tick;
    applyWeaponHit(state, player, w, target, 1);
    if (!target.active || target.dead) {
      w._beamTarget = null;
      break;
    }
  }
  state.renderApi.vfx('beam', player.x, player.z, { x2: target.x, z2: target.z, duration: 0.1 });
}

function tickOrbit(state, player, w, dt) {
  const params = w.def.behaviorParams || {};
  w.orbitAngle += (params.orbitSpeed || 3.5) * dt;
  if (w.orbitAngle > TAU) w.orbitAngle -= TAU;
  const want = projectileCount(w, player);
  if (w._orbitCount !== want) {
    w._orbitGen++; // old orbiters self-release next update
    w._orbitCount = want;
    for (let i = 0; i < want; i++) {
      spawnOrbiter(state, player, w, (i / want) * TAU);
    }
  }
}

// ---------------------------------------------------------------------------
// Main per-step update
// ---------------------------------------------------------------------------

const CONTINUOUS = { aura: 1, beam: 1, orbit: 1, pet: 1 };
/** Behaviors that fire on cooldown even with no enemy in range. */
const ALWAYS_FIRE = { support_buff: 1, mine: 1, turret: 1 };

export function updateWeapons(state, dt) {
  const players = state.players;
  for (let pi = 0; pi < players.length; pi++) {
    const player = players[pi];
    if (!player.alive) continue;
    const weapons = player.weapons;
    for (let i = 0; i < weapons.length; i++) {
      const w = weapons[i];
      const behavior = w.def.behavior || 'projectile';

      // Continuous behaviors bypass the cooldown gate entirely.
      if (CONTINUOUS[behavior] === 1) {
        if (behavior === 'aura') tickAura(state, player, w, dt);
        else if (behavior === 'beam') tickBeam(state, player, w, dt);
        else if (behavior === 'orbit') tickOrbit(state, player, w, dt);
        else if (behavior === 'pet') ensurePet(state, player, w);
        continue;
      }

      // Burst continuation (already paid the cooldown).
      if (w._burstLeft > 0) {
        w._burstTimer -= dt;
        if (w._burstTimer <= 0) {
          w._burstTimer = (w.def.behaviorParams && w.def.behaviorParams.burstInterval) || 0.06;
          w._burstLeft--;
          spawnWeaponProjectile(state, player, w, w._burstDirX, w._burstDirZ, 'projectile', 1);
        }
      }

      w.cooldownLeft -= dt;
      if (w.cooldownLeft > 0) continue;

      const range = effectiveRange(w, player);
      const target = findTarget(state, player, range);
      w.targetId = target ? target.id : 0;

      if (!target && ALWAYS_FIRE[behavior] !== 1) continue; // hold fire

      let dirX;
      let dirZ;
      if (target) {
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        dirX = dx / d;
        dirZ = dz / d;
        player.facing = Math.atan2(dirZ, dirX);
      } else {
        dirX = Math.cos(player.facing);
        dirZ = Math.sin(player.facing);
      }

      w.cooldownLeft = weaponCooldown(w, player.stats);
      fireWeapon(state, player, w, target, dirX, dirZ, range);
    }
  }
}
