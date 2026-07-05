// APETATO game/enemyAI — behavior state machines for every enemy archetype.
//
// Behaviors (def.behavior): chaser, shooter, charger, exploder, healer,
// shielder, sniper, swarmer, orbiter, totem, splitter (split-on-death lives
// in combat.killEnemy), teleporter.
//
// Per-entity AI scratch: aiState / aiTimer / aiX / aiZ (see entities.js).
// Spawner pre-scales ent.speed / ent.dmg / ent.mult per wave; statuses.js
// owns slow/freeze/stun via statusSpeedMult / isDisabled.
//
// The contact-damage pass is exported separately (contactDamage) because the
// contract update order runs it AFTER projectiles.

import { TAU } from '../core/mathx.js';
import { statusSpeedMult, isDisabled } from './statuses.js';
import { damagePlayer, killEnemy } from './combat.js';
import { damageCompanionsInRadius } from './companions.js';
import { spawnEnemyProjectile } from './projectiles.js';
import { resolveArenaCollision } from './collision.js';
import { tickEnemyEffects } from './effects.js';

const NEIGH_Q = []; // swarmer separation scratch
const AURA_Q = []; // healer / shielder / totem scratch
const EXPL_EV = { x: 0, z: 0, radius: 0 };

const KB_DAMP = 6; // knockback impulse decay per second
const CONTACT_PAD = 0.12;

function nearestPlayer(state, ent) {
  let best = null;
  let bestD2 = Infinity;
  const players = state.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive) continue;
    const dx = p.x - ent.x;
    const dz = p.z - ent.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

function effectiveSpeed(state, ent) {
  let s = ent.speed * statusSpeedMult(ent);
  if (ent.frenzyT > 0) s *= 1.25; // totem aura
  if (state.chaosMod && state.chaosMod.enemySpeedMult) s *= state.chaosMod.enemySpeedMult;
  return s;
}

function moveToward(state, ent, tx, tz, speed, dt) {
  const dx = tx - ent.x;
  const dz = tz - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-4) {
    ent.x += (dx / d) * speed * dt;
    ent.z += (dz / d) * speed * dt;
    ent.facing = Math.atan2(dz, dx);
  }
}

function fireAt(state, ent, target, mult) {
  const atk = ent.def.attack || {};
  const dx = target.x - ent.x;
  const dz = target.z - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const dmg = Math.max(1, Math.round((atk.projDamage || 4) * ent.mult * (mult || 1)));
  spawnEnemyProjectile(state, ent, dx / d, dz / d, atk.projectileSpeed || 8, dmg, atk.projVisual);
  ent.facing = Math.atan2(dz, dx);
}

// ---------------------------------------------------------------------------
// Per-behavior updates
// ---------------------------------------------------------------------------

function updateCharger(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  if (ent.aiState === 0) {
    // Approach until mid range, then wind up.
    const dx = player.x - ent.x;
    const dz = player.z - ent.z;
    const d2 = dx * dx + dz * dz;
    if (ent.aiTimer > 0) {
      ent.aiTimer -= dt; // post-charge recovery
      moveToward(state, ent, player.x, player.z, spd * 0.5, dt);
    } else if (d2 < 7 * 7) {
      ent.aiState = 1;
      ent.aiTimer = params.windup || 0.7;
      const d = Math.sqrt(d2) || 1;
      ent.aiX = dx / d;
      ent.aiZ = dz / d;
      state.renderApi.vfx('telegraph', ent.x, ent.z, { radius: ent.radius + 0.5, duration: ent.aiTimer });
    } else {
      moveToward(state, ent, player.x, player.z, spd, dt);
    }
  } else if (ent.aiState === 1) {
    ent.aiTimer -= dt; // winding up (locked in place)
    ent.facing = Math.atan2(ent.aiZ, ent.aiX);
    if (ent.aiTimer <= 0) {
      ent.aiState = 2;
      ent.aiTimer = params.chargeDuration || 0.5;
    }
  } else {
    // Charging.
    const cs = (params.chargeSpeed || 9) * statusSpeedMult(ent);
    ent.x += ent.aiX * cs * dt;
    ent.z += ent.aiZ * cs * dt;
    ent.aiTimer -= dt;
    if (ent.aiTimer <= 0) {
      ent.aiState = 0;
      ent.aiTimer = 0.8; // recovery
    }
  }
}

function updateExploder(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  if (ent.aiState === 0) {
    moveToward(state, ent, player.x, player.z, spd, dt);
    const dx = player.x - ent.x;
    const dz = player.z - ent.z;
    const fuse = params.fuseRange || 1.6;
    if (dx * dx + dz * dz <= fuse * fuse) {
      ent.aiState = 1;
      ent.aiTimer = (ent.def.attack && ent.def.attack.telegraph) || 0.6;
      state.renderApi.vfx('telegraph', ent.x, ent.z, {
        radius: params.explodeRadius || 2.2,
        duration: ent.aiTimer,
      });
    }
  } else {
    ent.aiTimer -= dt;
    if (ent.aiTimer <= 0) {
      const radius = params.explodeRadius || 2.2;
      EXPL_EV.x = ent.x;
      EXPL_EV.z = ent.z;
      EXPL_EV.radius = radius;
      state.bus.emit('explosion', EXPL_EV);
      const dmg = Math.max(1, Math.round((params.explodeDamage || 8) * ent.mult));
      for (let i = 0; i < state.players.length; i++) {
        const pl = state.players[i];
        if (!pl.alive) continue;
        const dx = pl.x - ent.x;
        const dz = pl.z - ent.z;
        const rr = radius + pl.radius;
        if (dx * dx + dz * dz <= rr * rr) damagePlayer(state, pl, dmg, ent);
      }
      damageCompanionsInRadius(state, ent.x, ent.z, radius, dmg);
      killEnemy(state, ent, null, 'selfdestruct'); // credit nobody
    }
  }
}

function updateShooter(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  const keep = params.keepDistance || 6;
  const dx = player.x - ent.x;
  const dz = player.z - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  if (d > keep + 1) moveToward(state, ent, player.x, player.z, spd, dt);
  else if (d < keep - 1) moveToward(state, ent, ent.x - dx, ent.z - dz, spd, dt);
  else ent.facing = Math.atan2(dz, dx);
  ent.fireCd -= dt;
  if (ent.fireCd <= 0 && d <= keep + 4) {
    ent.fireCd = params.fireCooldown || (ent.def.attack && ent.def.attack.cooldown) || 2.2;
    fireAt(state, ent, player, 1);
  }
}

function updateSniper(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  if (ent.aiState === 0) {
    const keep = params.keepDistance || 9;
    const dx = player.x - ent.x;
    const dz = player.z - ent.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (d > keep + 1.5) moveToward(state, ent, player.x, player.z, spd, dt);
    else if (d < keep - 1.5) moveToward(state, ent, ent.x - dx, ent.z - dz, spd, dt);
    else ent.facing = Math.atan2(dz, dx);
    ent.fireCd -= dt;
    if (ent.fireCd <= 0) {
      // Lock aim, telegraph the laser line for 0.7s.
      ent.aiState = 1;
      ent.aiTimer = 0.7;
      ent.aiX = player.x;
      ent.aiZ = player.z;
      state.renderApi.vfx('beam', ent.x, ent.z, { x2: player.x, z2: player.z, duration: 0.7 });
      state.renderApi.vfx('telegraph', player.x, player.z, { radius: 0.8, duration: 0.7 });
    }
  } else {
    ent.aiTimer -= dt;
    ent.facing = Math.atan2(ent.aiZ - ent.z, ent.aiX - ent.x);
    if (ent.aiTimer <= 0) {
      ent.aiState = 0;
      ent.fireCd = params.fireCooldown || 3.2;
      // Instant shot: hits if the player stayed near the locked point.
      const dx = player.x - ent.aiX;
      const dz = player.z - ent.aiZ;
      if (player.alive && dx * dx + dz * dz <= 1.0) {
        const atk = ent.def.attack || {};
        const dmg = Math.max(1, Math.round((atk.projDamage || 9) * ent.mult));
        damagePlayer(state, player, dmg, ent);
      }
      state.renderApi.vfx('beam', ent.x, ent.z, { x2: ent.aiX, z2: ent.aiZ, duration: 0.12 });
    }
  }
}

function updateSwarmer(state, ent, player, spd, dt) {
  moveToward(state, ent, player.x, player.z, spd, dt);
  // Neighbor separation keeps the swarm from stacking into one point.
  const n = state.hash.query(ent.x, ent.z, ent.radius * 2.2, NEIGH_Q);
  let px = 0;
  let pz = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const o = NEIGH_Q[i];
    if (!o || o === ent || o.kind !== 'enemy') continue;
    const dx = ent.x - o.x;
    const dz = ent.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      px += dx / d;
      pz += dz / d;
      count++;
    }
    if (count >= 4) break;
  }
  if (count > 0) {
    ent.x += (px / count) * spd * 0.5 * dt;
    ent.z += (pz / count) * spd * 0.5 * dt;
  }
}

function updateOrbiter(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  const orbitR = params.keepDistance || 6;
  const dx = ent.x - player.x;
  const dz = ent.z - player.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  // Blend radial correction with a tangential orbit.
  const radial = (d - orbitR) * 1.2;
  const nx = dx / d;
  const nz = dz / d;
  ent.x += (-nx * radial - nz * spd * 0.85) * dt;
  ent.z += (-nz * radial + nx * spd * 0.85) * dt;
  ent.facing = Math.atan2(player.z - ent.z, player.x - ent.x);
  if (ent.def.attack && ent.def.attack.type === 'projectile') {
    ent.fireCd -= dt;
    if (ent.fireCd <= 0) {
      ent.fireCd = params.fireCooldown || ent.def.attack.cooldown || 2;
      fireAt(state, ent, player, 1);
    }
  }
}

function updateHealer(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  // Loose follow at mid distance.
  const dx = player.x - ent.x;
  const dz = player.z - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  if (d > 8) moveToward(state, ent, player.x, player.z, spd, dt);
  else if (d < 5) moveToward(state, ent, ent.x - dx, ent.z - dz, spd * 0.7, dt);
  ent.fireCd -= dt;
  if (ent.fireCd <= 0) {
    ent.fireCd = 1;
    const radius = params.healRadius || 4;
    const n = state.hash.query(ent.x, ent.z, radius, AURA_Q);
    let worst = null;
    let worstPct = 1;
    for (let i = 0; i < n; i++) {
      const o = AURA_Q[i];
      if (!o || o.kind !== 'enemy' || o === ent || o.hp >= o.maxHp) continue;
      const pct = o.hp / o.maxHp;
      if (pct < worstPct) {
        worstPct = pct;
        worst = o;
      }
    }
    if (worst) {
      worst.hp = Math.min(worst.maxHp, worst.hp + (params.healPerSec || 3) * ent.mult);
      state.renderApi.vfx('aura', worst.x, worst.z, { radius: worst.radius + 0.3, duration: 0.3 });
    }
  }
}

function updateShielder(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  const dx = player.x - ent.x;
  const dz = player.z - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  if (d > 6) moveToward(state, ent, player.x, player.z, spd, dt);
  ent.fireCd -= dt;
  if (ent.fireCd <= 0) {
    ent.fireCd = 4;
    const radius = params.shieldRadius || 3.5;
    const amount = Math.round((params.shieldHp || 25) * ent.mult);
    const n = state.hash.query(ent.x, ent.z, radius, AURA_Q);
    let granted = 0;
    for (let i = 0; i < n && granted < 3; i++) {
      const o = AURA_Q[i];
      if (!o || o.kind !== 'enemy' || o === ent || o.shieldHp > 0) continue;
      o.shieldHp = amount;
      granted++;
    }
    if (granted > 0) state.renderApi.vfx('aura', ent.x, ent.z, { radius, duration: 0.4 });
  }
}

function updateTotem(state, ent, dt) {
  // Stationary. Refresh the frenzy aura (allies +25% speed) periodically.
  ent.fireCd -= dt;
  if (ent.fireCd <= 0) {
    ent.fireCd = 0.5;
    const radius = (ent.def.attack && ent.def.attack.radius) || 4.5;
    const n = state.hash.query(ent.x, ent.z, radius, AURA_Q);
    for (let i = 0; i < n; i++) {
      const o = AURA_Q[i];
      if (o && o.kind === 'enemy' && o !== ent) o.frenzyT = 0.6;
    }
  }
}

function updateTeleporter(state, ent, player, spd, dt) {
  const params = ent.def.behaviorParams || {};
  moveToward(state, ent, player.x, player.z, spd, dt);
  ent.fireCd -= dt;
  if (ent.fireCd <= 0) {
    ent.fireCd = params.blinkCooldown || 3.5;
    const range = params.blinkRange || 6;
    const a = state.rng.next() * TAU;
    const r = 1.5 + state.rng.next() * 1.5;
    let tx = player.x + Math.cos(a) * r;
    let tz = player.z + Math.sin(a) * r;
    // Blink range is measured from the teleporter's position.
    const dx = tx - ent.x;
    const dz = tz - ent.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > range) {
      tx = ent.x + (dx / d) * range;
      tz = ent.z + (dz / d) * range;
    }
    state.renderApi.vfx('telegraph', tx, tz, { radius: 0.6, duration: 0.25 });
    ent.x = tx;
    ent.z = tz;
    ent.attackCd = Math.max(ent.attackCd, 0.35); // no cheap blink-hit
  }
}

// ---------------------------------------------------------------------------
// Main passes
// ---------------------------------------------------------------------------

/** Movement + behavior state machines (contract slot: before hash rebuild). */
export function updateEnemyAI(state, dt) {
  const all = state.stores.enemies.all;
  for (let i = 0; i < all.length; i++) {
    const ent = all[i];
    if (!ent.active || ent.dead) continue;
    ent.age += dt;
    if (ent.hitFlash > 0) ent.hitFlash -= dt;
    if (ent.frenzyT > 0) ent.frenzyT -= dt;
    if (ent.attackCd > 0) ent.attackCd -= dt;

    // Knockback impulse integration + decay.
    if (ent.vx !== 0 || ent.vz !== 0) {
      ent.x += ent.vx * dt;
      ent.z += ent.vz * dt;
      const damp = Math.max(0, 1 - KB_DAMP * dt);
      ent.vx *= damp;
      ent.vz *= damp;
      if (ent.vx * ent.vx + ent.vz * ent.vz < 0.01) {
        ent.vx = 0;
        ent.vz = 0;
      }
    }

    if (ent.elite) tickEnemyEffects(state, ent, dt);
    if (isDisabled(ent)) {
      resolveArenaCollision(ent, state);
      continue;
    }

    const player = nearestPlayer(state, ent);
    if (!player) continue;
    const spd = effectiveSpeed(state, ent);

    switch (ent.def.behavior) {
      case 'charger':
        updateCharger(state, ent, player, spd, dt);
        break;
      case 'exploder':
        updateExploder(state, ent, player, spd, dt);
        break;
      case 'shooter':
        updateShooter(state, ent, player, spd, dt);
        break;
      case 'sniper':
        updateSniper(state, ent, player, spd, dt);
        break;
      case 'swarmer':
        updateSwarmer(state, ent, player, spd, dt);
        break;
      case 'orbiter':
        updateOrbiter(state, ent, player, spd, dt);
        break;
      case 'healer':
        updateHealer(state, ent, player, spd, dt);
        break;
      case 'shielder':
        updateShielder(state, ent, player, spd, dt);
        break;
      case 'totem':
        updateTotem(state, ent, dt);
        break;
      case 'teleporter':
        updateTeleporter(state, ent, player, spd, dt);
        break;
      case 'splitter': // splits on death (combat.killEnemy); walks like a chaser
      case 'chaser':
      default:
        moveToward(state, ent, player.x, player.z, spd, dt);
        break;
    }

    if (ent.dead || !ent.active) continue; // exploder may have died mid-update
    resolveArenaCollision(ent, state);
  }
}

/** Contact-damage pass (contract slot: after projectiles). */
export function contactDamage(state, dt) {
  const all = state.stores.enemies.all;
  const players = state.players;
  for (let i = 0; i < all.length; i++) {
    const ent = all[i];
    if (!ent.active || ent.dead || ent.attackCd > 0) continue;
    if (isDisabled(ent)) continue;
    const dmg = ent.dmg;
    if (!(dmg > 0)) continue;
    for (let j = 0; j < players.length; j++) {
      const pl = players[j];
      if (!pl.alive) continue;
      const dx = pl.x - ent.x;
      const dz = pl.z - ent.z;
      const rr = pl.radius + ent.radius + CONTACT_PAD;
      if (dx * dx + dz * dz <= rr * rr) {
        damagePlayer(state, pl, dmg, ent, { contact: true });
        ent.attackCd = (ent.def.attack && ent.def.attack.cooldown) || 1;
        break;
      }
    }
  }
}
