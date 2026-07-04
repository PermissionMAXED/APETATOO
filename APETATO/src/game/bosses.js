// APETATO game/bosses — boss entity + the 8 phase patterns.
//
// Patterns: charge_slam, ring_barrage, summon_adds, ground_pound,
// laser_sweep, rage_spiral, teleport_burst, shield_totems. A boss's
// phases[] run top-down; a phase is active until hp fraction drops to its
// untilHpPct, then 'boss:phase' fires. Bosses render as an animated Group
// (renderer builds from def.model), so the entity is standalone (unpooled)
// but still enters the spatial hash so weapons hit it normally.
//
// Boss HP uses a soft version (sqrt) of the trash wave-HP scale so late
// waves stay winnable; contact damage uses the full damage scale.

import { TAU } from '../core/mathx.js';
import { makeEntity, resetEntity } from './entities.js';
import { damagePlayer } from './combat.js';
import { spawnEnemyProjectile } from './projectiles.js';
import { spawnEnemyById, computeEnemyScale } from './spawner.js';
import { resolveArenaCollision } from './collision.js';
import { statusSpeedMult, isDisabled } from './statuses.js';

const SPAWN_EV = { ent: null, def: null };
const PHASE_EV = { phase: 0, pattern: '' };
const EXPL_EV = { x: 0, z: 0, radius: 0 };

// ---------------------------------------------------------------------------
// Spawn / teardown
// ---------------------------------------------------------------------------

/**
 * Spawn a boss (or wave-10 miniboss). Returns the state.boss record:
 * { ent, def, hp, maxHp, phaseIdx, shieldMult, totemsAlive, ... }.
 */
export function spawnBoss(state, def, isMini) {
  if (!def) return null;
  const s = computeEnemyScale(state);
  const ent = resetEntity(makeEntity('enemy'));
  ent.active = true;
  ent.def = def;
  ent.archetype = def.id;
  ent.isBoss = true;
  const p = state.players[0];
  // Enter from the far side of the arena.
  ent.x = p && p.x < 0 ? state.arenaW / 2 - 3 : -state.arenaW / 2 + 3;
  ent.z = 0;
  ent.radius = def.radius || 1;
  let hpScale = Math.sqrt(Math.max(1, s.hp)) * (isMini ? 0.7 : 1);
  if (state.modeRules.bossRush) {
    // Boss Rush serves a boss every wave: ramp HP with run progress so the
    // wave-1 boss is beatable with a starter weapon.
    const finalWave = state.modeRules.waves || 8;
    hpScale *= 0.25 + 0.75 * Math.min(1, state.wave / finalWave);
  }
  ent.maxHp = Math.max(1, Math.round((def.hp || 500) * hpScale));
  ent.hp = ent.maxHp;
  ent.speed = (def.speed || 2) * Math.min(1.15, s.spd);
  ent.dmg = Math.max(1, Math.round((def.damage || 8) * s.dmg));
  ent.mult = s.dmg;
  ent.xpValue = def.xp || 40;

  const boss = {
    ent,
    def,
    hp: ent.hp,
    maxHp: ent.maxHp,
    isMini: !!isMini,
    phaseIdx: 0,
    shieldMult: 1,
    totemsAlive: 0,
    // pattern scratch
    timer: 1.5, // opening grace before the first pattern action
    subTimer: 0,
    subTimer2: 0,
    angle: 0,
    mode: 0, // pattern sub-state
    dirX: 0,
    dirZ: 0,
  };
  enterPhase(state, boss, 0, true);

  SPAWN_EV.ent = ent;
  SPAWN_EV.def = def;
  state.bus.emit('boss:spawn', SPAWN_EV);
  SPAWN_EV.ent = null;
  SPAWN_EV.def = null;
  state.renderApi.shake(0.5);
  return boss;
}

function currentPhase(boss) {
  const phases = boss.def.phases;
  if (!Array.isArray(phases) || phases.length === 0) return null;
  return phases[Math.min(boss.phaseIdx, phases.length - 1)];
}

function enterPhase(state, boss, idx, silent) {
  boss.phaseIdx = idx;
  boss.mode = 0;
  boss.timer = 1.2;
  boss.subTimer = 0;
  boss.shieldMult = 1;
  const phase = currentPhase(boss);
  if (!phase) return;
  if (phase.pattern === 'shield_totems') spawnTotems(state, boss, phase.params || {});
  if (!silent) {
    PHASE_EV.phase = idx;
    PHASE_EV.pattern = phase.pattern;
    state.bus.emit('boss:phase', PHASE_EV);
    state.renderApi.shake(0.35);
  }
}

function spawnTotems(state, boss, params) {
  const count = params.totemCount || 3;
  boss.totemsAlive = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const ent = spawnEnemyById(state, 'stone_totem', boss.ent.x + Math.cos(a) * 4, boss.ent.z + Math.sin(a) * 4, null);
    if (!ent) continue;
    ent.bossTotem = true;
    ent.maxHp = Math.max(1, Math.round(params.totemHp || 40));
    ent.hp = ent.maxHp;
    boss.totemsAlive++;
  }
  if (boss.totemsAlive > 0) {
    boss.shieldMult = 1 - Math.min(0.95, params.shieldPct !== undefined ? params.shieldPct : 0.8);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function chase(state, boss, player, speedMult, dt) {
  const ent = boss.ent;
  const dx = player.x - ent.x;
  const dz = player.z - ent.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > ent.radius + player.radius + 0.2) {
    const spd = ent.speed * (speedMult || 1) * statusSpeedMult(ent);
    ent.x += (dx / d) * spd * dt;
    ent.z += (dz / d) * spd * dt;
  }
  ent.facing = Math.atan2(dz, dx);
}

function contact(state, boss, dt) {
  const ent = boss.ent;
  if (ent.attackCd > 0) {
    ent.attackCd -= dt;
    return;
  }
  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i];
    if (!pl.alive) continue;
    const dx = pl.x - ent.x;
    const dz = pl.z - ent.z;
    const rr = pl.radius + ent.radius + 0.1;
    if (dx * dx + dz * dz <= rr * rr) {
      damagePlayer(state, pl, ent.dmg, ent, { contact: true });
      ent.attackCd = (boss.def.attack && boss.def.attack.cooldown) || 1.2;
      return;
    }
  }
}

function ringOfProjectiles(state, ent, count, speed, damage, visual, angleOffset) {
  for (let i = 0; i < count; i++) {
    const a = angleOffset + (i / count) * TAU;
    spawnEnemyProjectile(state, ent, Math.cos(a), Math.sin(a), speed, damage, visual);
  }
}

function slamAt(state, boss, x, z, radius, damage) {
  EXPL_EV.x = x;
  EXPL_EV.z = z;
  EXPL_EV.radius = radius;
  state.bus.emit('explosion', EXPL_EV);
  for (let i = 0; i < state.players.length; i++) {
    const pl = state.players[i];
    if (!pl.alive) continue;
    const dx = pl.x - x;
    const dz = pl.z - z;
    const rr = radius + pl.radius;
    if (dx * dx + dz * dz <= rr * rr) damagePlayer(state, pl, damage, boss.ent);
  }
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

function patCharge(state, boss, player, params, dt) {
  const ent = boss.ent;
  if (boss.mode === 0) {
    chase(state, boss, player, 0.9, dt);
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.mode = 1;
      boss.subTimer = params.windup || 0.9;
      const dx = player.x - ent.x;
      const dz = player.z - ent.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      boss.dirX = dx / d;
      boss.dirZ = dz / d;
      state.renderApi.vfx('telegraph', ent.x, ent.z, { radius: ent.radius + 1, duration: boss.subTimer });
    }
  } else if (boss.mode === 1) {
    boss.subTimer -= dt;
    ent.facing = Math.atan2(boss.dirZ, boss.dirX);
    if (boss.subTimer <= 0) {
      boss.mode = 2;
      boss.subTimer = 0.8; // charge duration
    }
  } else {
    const cs = (params.chargeSpeed || 10) * statusSpeedMult(ent);
    ent.x += boss.dirX * cs * dt;
    ent.z += boss.dirZ * cs * dt;
    boss.subTimer -= dt;
    const hitWall =
      ent.x < -state.arenaW / 2 + ent.radius + 0.4 || ent.x > state.arenaW / 2 - ent.radius - 0.4 ||
      ent.z < -state.arenaH / 2 + ent.radius + 0.4 || ent.z > state.arenaH / 2 - ent.radius - 0.4;
    if (boss.subTimer <= 0 || hitWall) {
      boss.mode = 0;
      boss.timer = 2.4;
      const dmg = Math.max(1, Math.round((params.slamDamage || 12) * boss.ent.mult));
      slamAt(state, boss, ent.x, ent.z, params.slamRadius || 3, dmg);
      state.renderApi.shake(0.4);
    }
  }
}

function patRing(state, boss, player, params, dt) {
  chase(state, boss, player, 0.75, dt);
  boss.timer -= dt;
  if (boss.timer <= 0) {
    boss.timer = params.interval || 4;
    boss.angle += 0.53; // stagger successive rings
    const dmg = Math.max(1, Math.round((params.projDamage || 6) * boss.ent.mult));
    ringOfProjectiles(state, boss.ent, params.count || 10, params.projectileSpeed || 7, dmg, params.projVisual, boss.angle);
  }
}

function patSummon(state, boss, player, params, dt) {
  chase(state, boss, player, 0.8, dt);
  boss.timer -= dt;
  if (boss.timer <= 0) {
    boss.timer = params.interval || 8;
    const count = params.count || 3;
    for (let i = 0; i < count; i++) {
      const a = state.rng.next() * TAU;
      const ent = boss.ent;
      spawnEnemyById(state, params.addId, ent.x + Math.cos(a) * 2.2, ent.z + Math.sin(a) * 2.2, null);
    }
    state.renderApi.vfx('nova', boss.ent.x, boss.ent.z, { radius: 2.5 });
  }
}

function patPound(state, boss, player, params, dt) {
  const ent = boss.ent;
  if (boss.mode === 0) {
    chase(state, boss, player, 0.85, dt);
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.mode = 1;
      boss.subTimer = params.telegraph || 1;
      // Pound lands where the player is standing NOW.
      boss.dirX = player.x;
      boss.dirZ = player.z;
      state.renderApi.vfx('telegraph', boss.dirX, boss.dirZ, { radius: params.radius || 3.5, duration: boss.subTimer });
    }
  } else {
    boss.subTimer -= dt;
    if (boss.subTimer <= 0) {
      boss.mode = 0;
      boss.timer = params.interval || 5;
      const dmg = Math.max(1, Math.round((params.damage || 12) * ent.mult));
      slamAt(state, boss, boss.dirX, boss.dirZ, params.radius || 3.5, dmg);
      state.renderApi.shake(0.45);
    }
  }
}

function patLaser(state, boss, player, params, dt) {
  const ent = boss.ent;
  if (boss.mode === 0) {
    chase(state, boss, player, 0.6, dt);
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.mode = 1;
      boss.subTimer = params.telegraph || 1;
      boss.angle = Math.atan2(player.z - ent.z, player.x - ent.x) - (params.sweepArc || Math.PI) / 2;
      state.renderApi.vfx('beam', ent.x, ent.z, {
        x2: ent.x + Math.cos(boss.angle) * 14,
        z2: ent.z + Math.sin(boss.angle) * 14,
        duration: boss.subTimer,
      });
    }
  } else if (boss.mode === 1) {
    boss.subTimer -= dt;
    if (boss.subTimer <= 0) {
      boss.mode = 2;
      boss.subTimer = params.sweepTime || 2.5;
    }
  } else {
    const sweepTime = params.sweepTime || 2.5;
    boss.subTimer -= dt;
    const arc = params.sweepArc || Math.PI;
    boss.angle += (arc / sweepTime) * dt;
    const ca = Math.cos(boss.angle);
    const sa = Math.sin(boss.angle);
    ent.facing = boss.angle;
    // Redraw the beam every few steps (cheap persistent visual).
    boss.subTimer2 = (boss.subTimer2 || 0) - dt;
    if (boss.subTimer2 <= 0) {
      boss.subTimer2 = 0.1;
      state.renderApi.vfx('beam', ent.x, ent.z, { x2: ent.x + ca * 14, z2: ent.z + sa * 14, duration: 0.12 });
    }
    // Damage players near the beam segment.
    for (let i = 0; i < state.players.length; i++) {
      const pl = state.players[i];
      if (!pl.alive) continue;
      const px = pl.x - ent.x;
      const pz = pl.z - ent.z;
      const along = px * ca + pz * sa;
      if (along < 0 || along > 14) continue;
      const perp = Math.abs(-px * sa + pz * ca);
      if (perp <= pl.radius + 0.35) {
        damagePlayer(state, pl, Math.max(1, Math.round((params.dps || 12) * ent.mult * 0.25)), ent, { ignoreIFrames: false });
      }
    }
    if (boss.subTimer <= 0) {
      boss.mode = 0;
      boss.timer = 2.5;
    }
  }
}

function patSpiral(state, boss, player, params, dt) {
  chase(state, boss, player, 0.5, dt);
  if (boss.mode === 0) {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.mode = 1;
      boss.subTimer = params.duration || 3;
    }
  } else {
    boss.subTimer -= dt;
    boss.angle += 4.2 * dt; // spiral rotation
    boss.subTimer2 = (boss.subTimer2 || 0) - dt;
    const count = params.count || 12;
    const period = (params.duration || 3) / Math.max(1, count * 2);
    if (boss.subTimer2 <= 0) {
      boss.subTimer2 = Math.max(0.06, period);
      const dmg = Math.max(1, Math.round((params.projDamage || 7) * boss.ent.mult));
      spawnEnemyProjectile(state, boss.ent, Math.cos(boss.angle), Math.sin(boss.angle), params.projectileSpeed || 8, dmg, params.projVisual);
      spawnEnemyProjectile(state, boss.ent, -Math.cos(boss.angle), -Math.sin(boss.angle), params.projectileSpeed || 8, dmg, params.projVisual);
    }
    if (boss.subTimer <= 0) {
      boss.mode = 0;
      boss.timer = 3;
    }
  }
}

function patTeleport(state, boss, player, params, dt) {
  const ent = boss.ent;
  if (boss.mode === 0) {
    chase(state, boss, player, 0.7, dt);
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.mode = 1;
      boss.subTimer = 0.5; // pre-blink telegraph
      const range = params.blinkRange || 8;
      const a = state.rng.next() * TAU;
      const r = 2.5 + state.rng.next() * 2;
      let tx = player.x + Math.cos(a) * r;
      let tz = player.z + Math.sin(a) * r;
      const hw = state.arenaW / 2 - ent.radius - 0.5;
      const hh = state.arenaH / 2 - ent.radius - 0.5;
      if (tx < -hw) tx = -hw;
      else if (tx > hw) tx = hw;
      if (tz < -hh) tz = -hh;
      else if (tz > hh) tz = hh;
      const dx = tx - ent.x;
      const dz = tz - ent.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > range) {
        tx = ent.x + (dx / d) * range;
        tz = ent.z + (dz / d) * range;
      }
      boss.dirX = tx;
      boss.dirZ = tz;
      state.renderApi.vfx('telegraph', tx, tz, { radius: ent.radius + 0.6, duration: boss.subTimer });
    }
  } else {
    boss.subTimer -= dt;
    if (boss.subTimer <= 0) {
      boss.mode = 0;
      boss.timer = 3.2;
      ent.x = boss.dirX;
      ent.z = boss.dirZ;
      const dmg = Math.max(1, Math.round((params.projDamage || 6) * ent.mult));
      ringOfProjectiles(state, ent, params.burstCount || 8, params.projectileSpeed || 8, dmg, params.projVisual, state.rng.next() * TAU);
      state.renderApi.vfx('nova', ent.x, ent.z, { radius: 2 });
    }
  }
}

function patTotems(state, boss, player, params, dt) {
  // Totems were spawned on phase entry; while any live, the boss takes
  // reduced damage (boss.shieldMult, consumed by combat.js) and circles.
  chase(state, boss, player, boss.totemsAlive > 0 ? 0.55 : 0.9, dt);
  boss.timer -= dt;
  if (boss.timer <= 0) {
    boss.timer = 6;
    if (boss.totemsAlive === 0) spawnTotems(state, boss, params);
  }
}

// ---------------------------------------------------------------------------
// Per-step boss update
// ---------------------------------------------------------------------------

/** Tick the live boss (run.js calls while state.boss is set). */
export function updateBoss(state, dt) {
  const boss = state.boss;
  if (!boss || !boss.ent.active || boss.ent.dead) return;
  const ent = boss.ent;
  ent.age += dt;
  if (ent.hitFlash > 0) ent.hitFlash -= dt;

  // Phase transitions on hp fraction.
  const phases = boss.def.phases || [];
  const frac = ent.hp / Math.max(1, ent.maxHp);
  while (boss.phaseIdx < phases.length - 1 && frac <= phases[boss.phaseIdx].untilHpPct) {
    enterPhase(state, boss, boss.phaseIdx + 1, false);
  }

  if (!isDisabled(ent)) {
    const player = alivePlayer(state);
    if (player) {
      const phase = currentPhase(boss);
      const params = (phase && phase.params) || {};
      switch (phase && phase.pattern) {
        case 'charge_slam':
          patCharge(state, boss, player, params, dt);
          break;
        case 'ring_barrage':
          patRing(state, boss, player, params, dt);
          break;
        case 'summon_adds':
          patSummon(state, boss, player, params, dt);
          break;
        case 'ground_pound':
          patPound(state, boss, player, params, dt);
          break;
        case 'laser_sweep':
          patLaser(state, boss, player, params, dt);
          break;
        case 'rage_spiral':
          patSpiral(state, boss, player, params, dt);
          break;
        case 'teleport_burst':
          patTeleport(state, boss, player, params, dt);
          break;
        case 'shield_totems':
          patTotems(state, boss, player, params, dt);
          break;
        default:
          chase(state, boss, player, 1, dt);
          break;
      }
      contact(state, boss, dt);
    }
  }

  resolveArenaCollision(ent, state);
  // Mirror onto the boss record for the HUD bar.
  boss.hp = ent.hp;
  boss.maxHp = ent.maxHp;
}

function alivePlayer(state) {
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].alive) return state.players[i];
  }
  return null;
}
