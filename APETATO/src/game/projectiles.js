// APETATO game/projectiles — pooled projectile simulation.
//
// One store holds player projectiles, enemy projectiles, orbiters, mines and
// lobbed shots. `ptype` carries the behavior key; `archetype` the visual key
// (weapon visual.projectile, enemy projVisual, or the ptype itself).
//
// Player-side damage always flows through combat.applyWeaponHit /
// explodeFromPlayer so crits, knockback, lifesteal, dpsLog and triggers stay
// canonical.

import { TAU } from '../core/mathx.js';
import { acquire, release, rememberHit, hasHit } from './entities.js';
import {
  applyWeaponHit,
  rollWeaponDamage,
  explodeFromPlayer,
  damagePlayer,
  applyDirectDamage,
  weaponCooldown,
  weaponRange,
} from './combat.js';

const HIT_Q = []; // scratch for hit queries (updateProjectiles is not reentrant)

function baseSpeed(w, stats) {
  const s = (w.def.stats && w.def.stats.projectileSpeed) || 10;
  return s * (1 + ((stats && stats.projectileSpeed) || 0) / 100);
}

function visualKey(w, fallback) {
  const v = w.def.visual && w.def.visual.projectile;
  return v && v !== 'none' ? v : fallback;
}

// ---------------------------------------------------------------------------
// Spawners
// ---------------------------------------------------------------------------

/** Straight / burst / shotgun / chain / homing player projectile. */
export function spawnWeaponProjectile(state, player, w, dirX, dirZ, ptype, mult) {
  const p = acquire(state.stores.projectiles);
  if (!p) return null;
  const stats = player.stats;
  const params = w.def.behaviorParams || {};
  p.x = player.x + dirX * 0.5;
  p.z = player.z + dirZ * 0.5;
  p.radius = 0.25;
  p.speed = baseSpeed(w, stats);
  p.vx = dirX * p.speed;
  p.vz = dirZ * p.speed;
  p.facing = Math.atan2(dirZ, dirX);
  p.owner = player;
  p.weaponRef = w;
  p.mult = mult || 1;
  p.ptype = ptype;
  p.archetype = visualKey(w, ptype);
  p.pierce = (w.def.stats && w.def.stats.pierce) || 0;
  p.rangeLeft = Math.max(3, weaponRange(w, stats) * 1.25);
  p.ttl = 4;
  if (ptype === 'homing') {
    p.homing = true;
    p.turnRate = params.turnRate || 6;
  } else if (ptype === 'chain') {
    p.chainLeft = params.jumps !== undefined ? params.jumps : 2;
  } else if (ptype === 'boomerang') {
    p.pierce = 99; // boomerangs pass through; per-phase dedupe limits hits
    p.phase = 0;
    p.spin = true;
    p.rangeLeft = weaponRange(w, stats);
    p.ttl = 6;
  }
  return p;
}

/** Lobbed shot toward (tx, tz); explodes on arrival. */
export function spawnLobbed(state, player, w, tx, tz, mult) {
  const p = acquire(state.stores.projectiles);
  if (!p) return null;
  const stats = player.stats;
  p.x = player.x;
  p.z = player.z;
  p.radius = 0.25;
  p.speed = Math.max(6, baseSpeed(w, stats) * 0.8);
  p.aiX = tx;
  p.aiZ = tz;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  p.vx = (dx / d) * p.speed;
  p.vz = (dz / d) * p.speed;
  p.owner = player;
  p.weaponRef = w;
  p.mult = mult || 1;
  p.ptype = 'lobbed';
  p.archetype = visualKey(w, 'lobbed');
  p.expRadius =
    ((w.def.stats && w.def.stats.radius) || 1.8) * (1 + ((stats && stats.explosionSize) || 0) / 100);
  p.ttl = d / p.speed + 0.05;
  return p;
}

/** Persistent orbiter. `angleOffset` spaces multiple orbiters apart. */
export function spawnOrbiter(state, player, w, angleOffset) {
  const p = acquire(state.stores.projectiles);
  if (!p) return null;
  p.radius = 0.35;
  p.owner = player;
  p.weaponRef = w;
  p.ptype = 'orbit';
  p.spin = true;
  p.archetype = visualKey(w, 'orbit');
  p.aiX = angleOffset;
  p.value = w._orbitGen; // generation stamp — stale orbiters self-release
  p.ttl = 0; // persistent
  const params = w.def.behaviorParams || {};
  p.expRadius = params.orbitRadius || (w.def.stats && w.def.stats.radius) || 2.6;
  p.x = player.x + Math.cos(angleOffset) * p.expRadius;
  p.z = player.z + Math.sin(angleOffset) * p.expRadius;
  return p;
}

/** Proximity mine at the player's feet. */
export function spawnMine(state, player, w) {
  const p = acquire(state.stores.projectiles);
  if (!p) return null;
  const params = w.def.behaviorParams || {};
  p.x = player.x;
  p.z = player.z;
  p.radius = 0.3;
  p.owner = player;
  p.weaponRef = w;
  p.ptype = 'mine';
  p.archetype = visualKey(w, 'mine');
  p.phase = 0; // arming
  p.aiTimer = params.armTime !== undefined ? params.armTime : 0.5;
  p.aiX = params.triggerRadius || 1.4;
  p.expRadius =
    ((w.def.stats && w.def.stats.radius) || 2) * (1 + ((player.stats && player.stats.explosionSize) || 0) / 100);
  p.ttl = 15;
  return p;
}

/** Effect-DSL projectile op ({ visual, damage, count, speed, scaled }). */
export function spawnSimpleProjectile(state, player, op, target) {
  const count = Math.max(1, Number(op.count) || 1);
  let dmg = Math.max(1, Math.round(Number(op.damage) || 1));
  if (op.scaled) dmg = Math.max(1, Math.round(dmg * (1 + (player.stats.damagePct || 0) / 100)));
  let baseA;
  const aim = target && target.active ? target : state.hash.nearest(player.x, player.z, 12, null);
  if (aim) baseA = Math.atan2(aim.z - player.z, aim.x - player.x);
  else baseA = state.rng.next() * TAU;
  for (let i = 0; i < count; i++) {
    const p = acquire(state.stores.projectiles);
    if (!p) return;
    const a = baseA + (count > 1 ? (i - (count - 1) / 2) * 0.35 : 0);
    p.x = player.x;
    p.z = player.z;
    p.radius = 0.22;
    p.speed = Number(op.speed) || 12;
    p.vx = Math.cos(a) * p.speed;
    p.vz = Math.sin(a) * p.speed;
    p.owner = player;
    p.ptype = 'effect';
    p.archetype = op.visual || 'seed';
    p.damage = dmg;
    p.rangeLeft = 14;
    p.ttl = 2.5;
  }
}

/** Enemy (or boss) projectile aimed along (dirX, dirZ). */
export function spawnEnemyProjectile(state, ent, dirX, dirZ, speed, damage, visual) {
  const p = acquire(state.stores.projectiles);
  if (!p) return null;
  p.x = ent.x + dirX * (ent.radius + 0.2);
  p.z = ent.z + dirZ * (ent.radius + 0.2);
  p.radius = 0.25;
  p.speed = speed || 8;
  p.vx = dirX * p.speed;
  p.vz = dirZ * p.speed;
  p.owner = ent;
  p.ptype = 'enemy';
  p.archetype = visual || 'seed_bolt';
  p.damage = damage || 3;
  p.rangeLeft = 26;
  p.ttl = 5;
  return p;
}

// ---------------------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------------------

export function updateProjectiles(state, dt) {
  const all = state.stores.projectiles.all;
  const hw = state.arenaW / 2 + 1.5;
  const hh = state.arenaH / 2 + 1.5;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (!p.active) continue;
    p.age += dt;

    if (p.ptype === 'orbit') {
      updateOrbiter(state, p, dt);
      continue;
    }
    if (p.ptype === 'mine') {
      updateMine(state, p, dt);
      continue;
    }

    // Homing steer.
    if (p.homing) {
      let t = p._target;
      if (!t || !t.active || t.dead) {
        t = state.hash.nearest(p.x, p.z, 10, null);
        p._target = t;
        p.targetId = t ? t.id : 0;
      }
      if (t) {
        const cur = Math.atan2(p.vz, p.vx);
        let want = Math.atan2(t.z - p.z, t.x - p.x);
        let delta = want - cur;
        while (delta > Math.PI) delta -= TAU;
        while (delta < -Math.PI) delta += TAU;
        const maxTurn = (p.turnRate || 6) * dt;
        if (delta > maxTurn) delta = maxTurn;
        else if (delta < -maxTurn) delta = -maxTurn;
        const a = cur + delta;
        p.vx = Math.cos(a) * p.speed;
        p.vz = Math.sin(a) * p.speed;
      }
    }

    // Boomerang return leg.
    if (p.ptype === 'boomerang' && p.phase === 1) {
      const pl = p.owner;
      const dx = pl.x - p.x;
      const dz = pl.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.8) {
        release(state.stores.projectiles, p);
        continue;
      }
      p.vx = (dx / d) * p.speed;
      p.vz = (dz / d) * p.speed;
    }

    const step = p.speed * dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.rangeLeft -= step;
    p.facing = Math.atan2(p.vz, p.vx);

    // Lobbed shots explode on arrival at their target point.
    if (p.ptype === 'lobbed') {
      const dx = p.aiX - p.x;
      const dz = p.aiZ - p.z;
      if (dx * dx + dz * dz <= step * step || p.age >= p.ttl) {
        explodeWeapon(state, p, p.aiX, p.aiZ);
        release(state.stores.projectiles, p);
      }
      continue;
    }

    // Out of range / lifetime / bounds.
    if (p.rangeLeft <= 0) {
      if (p.ptype === 'boomerang' && p.phase === 0) {
        p.phase = 1;
        p.hitMemCount = 0; // second pass may hit everyone again
      } else if (p.ptype !== 'boomerang') {
        release(state.stores.projectiles, p);
        continue;
      }
    }
    if (p.age >= p.ttl || p.x < -hw || p.x > hw || p.z < -hh || p.z > hh) {
      release(state.stores.projectiles, p);
      continue;
    }

    // Hit checks.
    if (p.ptype === 'enemy') {
      hitPlayers(state, p);
    } else {
      hitEnemies(state, p);
    }
  }
}

function hitPlayers(state, p) {
  const players = state.players;
  for (let i = 0; i < players.length; i++) {
    const pl = players[i];
    if (!pl.alive) continue;
    const dx = pl.x - p.x;
    const dz = pl.z - p.z;
    const rr = pl.radius + p.radius;
    if (dx * dx + dz * dz <= rr * rr) {
      damagePlayer(state, pl, p.damage, p.owner);
      release(state.stores.projectiles, p);
      return;
    }
  }
}

function hitEnemies(state, p) {
  const n = state.hash.query(p.x, p.z, p.radius, HIT_Q);
  for (let i = 0; i < n; i++) {
    const ent = HIT_Q[i];
    if (!ent || ent.kind !== 'enemy' || hasHit(p, ent.id)) continue;
    rememberHit(p, ent.id);

    if (p.weaponRef) applyWeaponHit(state, p.owner, p.weaponRef, ent, p.mult);
    else applyDirectDamage(state, ent, p.damage, 'normal', null);

    if (p.ptype === 'chain') {
      if (p.chainLeft > 0) {
        p.chainLeft--;
        p.mult *= 0.8; // -20% damage per hop
        const params = (p.weaponRef && p.weaponRef.def.behaviorParams) || {};
        const jumpRange = params.jumpRange || 4;
        const next = nearestUnhit(state, p, ent.x, ent.z, jumpRange);
        if (next) {
          const dx = next.x - p.x;
          const dz = next.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz) || 1;
          p.vx = (dx / d) * p.speed;
          p.vz = (dz / d) * p.speed;
          p.rangeLeft = jumpRange + 1;
          return;
        }
      }
      release(state.stores.projectiles, p);
      return;
    }

    if (p.ptype === 'boomerang') continue; // passes through everything

    if (p.pierce > 0) {
      p.pierce--;
      continue;
    }
    // Depleted: optional final explosion (behaviorParams.explodeOnLastPierce).
    const params = p.weaponRef && p.weaponRef.def.behaviorParams;
    if (params && params.explodeOnLastPierce) {
      const cfg = params.explodeOnLastPierce;
      const roll = rollWeaponDamage(state, p.owner, p.weaponRef, (cfg.damageMult || 0.5) * p.mult);
      explodeFromPlayer(state, p.owner, p.x, p.z, cfg.radius || 2, roll.damage, p.weaponRef);
    }
    release(state.stores.projectiles, p);
    return;
  }
}

function nearestUnhit(state, p, x, z, radius) {
  const n = state.hash.query(x, z, radius, HIT_Q);
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < n; i++) {
    const ent = HIT_Q[i];
    if (!ent || ent.kind !== 'enemy' || hasHit(p, ent.id)) continue;
    const dx = ent.x - x;
    const dz = ent.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = ent;
    }
  }
  return best;
}

function updateOrbiter(state, p, dt) {
  const w = p.weaponRef;
  const pl = p.owner;
  // Stale (weapon sold/merged, generation bumped, player dead) → release.
  if (!w || !pl || !pl.alive || w._orbitGen !== p.value || pl.weapons.indexOf(w) === -1) {
    release(state.stores.projectiles, p);
    return;
  }
  const r = p.expRadius;
  const a = w.orbitAngle + p.aiX;
  p.x = pl.x + Math.cos(a) * r;
  p.z = pl.z + Math.sin(a) * r;
  p.facing = a;
  if (p.attackCd > 0) {
    p.attackCd -= dt;
    return;
  }
  const n = state.hash.query(p.x, p.z, p.radius, HIT_Q);
  for (let i = 0; i < n; i++) {
    const ent = HIT_Q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    applyWeaponHit(state, pl, w, ent, p.mult);
    p.attackCd = weaponCooldown(w, pl.stats);
    break;
  }
}

function updateMine(state, p, dt) {
  if (p.phase === 0) {
    p.aiTimer -= dt;
    if (p.aiTimer <= 0) p.phase = 1; // armed
    return;
  }
  if (p.age >= p.ttl) {
    explodeWeapon(state, p, p.x, p.z);
    release(state.stores.projectiles, p);
    return;
  }
  const trigger = p.aiX;
  const near = state.hash.nearest(p.x, p.z, trigger, null);
  if (near) {
    explodeWeapon(state, p, p.x, p.z);
    release(state.stores.projectiles, p);
  }
}

/** Shared weapon explosion (lobbed arrival, mine trigger). */
function explodeWeapon(state, p, x, z) {
  if (!p.weaponRef || !p.owner) return;
  const roll = rollWeaponDamage(state, p.owner, p.weaponRef, p.mult);
  explodeFromPlayer(state, p.owner, x, z, p.expRadius || 2, roll.damage, p.weaponRef);
}

/** Release every projectile (wave transitions). */
export function clearProjectiles(state) {
  state.stores.projectiles.pool.reset();
}
