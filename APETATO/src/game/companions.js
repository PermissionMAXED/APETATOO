// APETATO game/companions — pets, turrets, and the (optional) buddy.
//
// Two sources of companions:
//   1. Weapons with behavior 'pet' / 'turret' (weapons.js calls ensurePet /
//      deployTurret). Their attacks flow through the canonical weapon damage
//      pipeline (combat.applyWeaponHit) so crits/lifesteal/dpsLog work.
//   2. Effect-DSL 'summon' ops (effects.js calls summonCompanion). These use
//      built-in specs (SUMMON_SPECS) with flat, damagePct-scaled damage.
//
// The 'buddy' ai slot is reserved for a co-op player 2: when a second
// gamepad is connected, its intent (input.getIntent(1)) drives the buddy.
// This is optional and never blocks the solo game.

import { acquire, release } from './entities.js';
import { applyWeaponHit, applyDirectDamage, weaponCooldown, weaponRange } from './combat.js';

const FIND_Q = []; // scratch for target queries (single-threaded update)
const PET_EV = { count: 0 };
const PET_DEATH_EV = { count: 0 };
const PET_HIT_COOLDOWN = 0.6; // seconds between enemy contact hits on a pet

function liveCompanionCount(state) {
  const all = state.stores.companions.all;
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].active) n++;
  }
  return n;
}

/** Emit 'pet:spawn' with the absolute live companion count (achievements). */
function emitPetCount(state) {
  PET_EV.count = liveCompanionCount(state);
  state.bus.emit('pet:spawn', PET_EV);
}

// ---------------------------------------------------------------------------
// Built-in summon specs (models render as animated groups via def.model)
// ---------------------------------------------------------------------------

function petModel(primary, secondary) {
  return {
    base: 'custom', scale: 0.5, primary, secondary, accent: '#ffd93b',
    parts: [
      { shape: 'sphere', size: [0.16, 0.16, 0.14], pos: [0, 0.2, 0], rot: [0, 0, 0], color: 'primary' },
      { shape: 'sphere', size: [0.1, 0.09, 0.08], pos: [0, 0.16, 0.12], rot: [0, 0, 0], color: 'secondary' },
      { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [-0.05, 0.24, 0.12], rot: [0, 0, 0], color: 'accent' },
      { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [0.05, 0.24, 0.12], rot: [0, 0, 0], color: 'accent' },
    ],
    animation: 'hop',
  };
}

function turretModel(primary, secondary) {
  return {
    base: 'custom', scale: 0.6, primary, secondary, accent: '#2b2b2b',
    parts: [
      { shape: 'cylinder', size: [0.18, 0.12, 0.18], pos: [0, 0.06, 0], rot: [0, 0, 0], color: 'secondary' },
      { shape: 'sphere', size: [0.14, 0.12, 0.14], pos: [0, 0.2, 0], rot: [0, 0, 0], color: 'primary' },
      { shape: 'cylinder', size: [0.04, 0.22, 0.04], pos: [0, 0.22, 0.12], rot: [1.57, 0, 0], color: 'accent' },
    ],
    animation: 'none',
  };
}

/** Spec per 'summon' op `what` key. type: 'pet' chases, 'turret' is static. */
const SUMMON_SPECS = {
  monkey_pal: { type: 'pet', damage: 4, cooldown: 0.8, speed: 6.5, range: 9, duration: 0, model: petModel('#7a5233', '#d9b38c') },
  stray_chimp: { type: 'pet', damage: 3, cooldown: 0.9, speed: 6, range: 9, duration: 0, model: petModel('#5d452a', '#c9a52b') },
  spirit_monkey: { type: 'pet', damage: 6, cooldown: 0.7, speed: 7.5, range: 11, duration: 0, model: petModel('#a3d5ff', '#e8f4ff') },
  typewriter_monkey: { type: 'pet', damage: 5, cooldown: 0.6, speed: 7, range: 9, duration: 20, model: petModel('#8f8a7a', '#e8e4d8') },
  scrap_turret: { type: 'turret', damage: 5, cooldown: 0.8, range: 8, projSpeed: 12, duration: 0, model: turretModel('#6d7a85', '#3a424a') },
  scrap_bot: { type: 'turret', damage: 4, cooldown: 0.9, range: 7, projSpeed: 11, duration: 0, model: turretModel('#8f9aa3', '#5d666e') },
  banana_turret: { type: 'turret', damage: 5, cooldown: 0.7, range: 8, projSpeed: 12, duration: 0, model: turretModel('#ffd93b', '#8a5a2b') },
  banana_gatling: { type: 'turret', damage: 3, cooldown: 0.25, range: 7, projSpeed: 14, duration: 15, model: turretModel('#ffd93b', '#3a424a') },
};
const DEFAULT_SPEC = SUMMON_SPECS.monkey_pal;

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

function countByKey(state, key) {
  const all = state.stores.companions.all;
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].active && all[i].archetype === key) n++;
  }
  return n;
}

/**
 * Effect-DSL summon op. `what` keys map to SUMMON_SPECS (unknown keys get a
 * default pet so content never breaks). `max` caps living companions of that
 * kind. `sourceId` is informational (elite/synergy debugging).
 */
export function summonCompanion(state, player, what, max, sourceId) {
  const spec = SUMMON_SPECS[what] || DEFAULT_SPEC;
  if (countByKey(state, what) >= (max || 1)) return null;
  const c = acquire(state.stores.companions);
  if (!c) return null;
  const a = state.rng.next() * Math.PI * 2;
  c.x = player.x + Math.cos(a) * 1.2;
  c.z = player.z + Math.sin(a) * 1.2;
  c.radius = 0.3;
  c.ai = spec.type === 'turret' ? 'turret' : 'pet';
  c.archetype = what;
  c.def = spec; // renderer builds the group from def.model
  c.ownerPlayer = player;
  c.weaponInst = null;
  c.hp = 10;
  c.maxHp = 10;
  c.speed = spec.speed || 6;
  c.dmg = spec.damage;
  c.attackCd = 0;
  c.ttl = spec.duration || 0; // 0 = lives until the wave ends
  emitPetCount(state);
  return c;
}

/** Weapon-driven turret (behavior 'turret'). Respects maxActive. */
export function deployTurret(state, player, w) {
  const params = w.def.behaviorParams || {};
  const maxActive = params.maxTurrets || params.maxActive || 2;
  // Count this weapon's turrets; recycle the oldest when at cap.
  const all = state.stores.companions.all;
  let count = 0;
  let oldest = null;
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (c.active && c.ai === 'turret' && c.weaponInst === w) {
      count++;
      if (!oldest || c.age > oldest.age) oldest = c;
    }
  }
  if (count >= maxActive && oldest) release(state.stores.companions, oldest);
  const c = acquire(state.stores.companions);
  if (!c) return null;
  c.x = player.x;
  c.z = player.z;
  c.radius = 0.3;
  c.ai = 'turret';
  c.archetype = 'turret:' + w.def.id;
  c.def = { model: (w.def.visual && w.def.visual.model) || turretModel('#6d7a85', '#3a424a') };
  c.ownerPlayer = player;
  c.weaponInst = w;
  c.hp = 20;
  c.maxHp = 20;
  c.aiX = params.turretFireRate || 0.8; // seconds between shots
  c.ttl = (w.def.stats && w.def.stats.duration) || 0; // authored turret lifetime
  emitPetCount(state);
  return c;
}

/** Weapon-driven pet (behavior 'pet'). One living pet per weapon instance. */
export function ensurePet(state, player, w) {
  const all = state.stores.companions.all;
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (c.active && c.ai === 'pet' && c.weaponInst === w) return c;
  }
  // Respawn delay after death.
  if (w._petRespawnAt !== undefined && state.timeSec < w._petRespawnAt) return null;
  const params = w.def.behaviorParams || {};
  const c = acquire(state.stores.companions);
  if (!c) return null;
  c.x = player.x + 0.8;
  c.z = player.z;
  c.radius = 0.3;
  c.ai = 'pet';
  c.archetype = 'pet:' + w.def.id;
  c.def = { model: (w.def.visual && w.def.visual.model) || petModel('#7a5233', '#d9b38c') };
  c.ownerPlayer = player;
  c.weaponInst = w;
  c.hp = params.petHp || 20;
  c.maxHp = c.hp;
  c.speed = params.petSpeed || 7;
  c.ttl = 0;
  emitPetCount(state);
  return c;
}

// ---------------------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------------------

function nearestEnemy(state, x, z, radius) {
  return state.hash.nearest(x, z, radius, null);
}

/** Enemy contact pass for a companion (pets/buddy). Gated by c.fireCd. */
function tickCompanionContact(state, c, dt) {
  if (c.fireCd > 0) {
    c.fireCd -= dt;
    return;
  }
  const n = state.hash.query(c.x, c.z, c.radius + 0.12, FIND_Q);
  for (let k = 0; k < n; k++) {
    const ent = FIND_Q[k];
    if (!ent || ent.kind !== 'enemy' || !(ent.dmg > 0)) continue;
    c.fireCd = PET_HIT_COOLDOWN;
    damageCompanion(state, c, ent.dmg);
    break;
  }
}

/** Damage a companion (enemy contact / AoE). Kills it at 0 hp. */
export function damageCompanion(state, c, amount) {
  if (!c.active || !(amount > 0)) return;
  const w = c.weaponInst;
  const params = (w && w.def.behaviorParams) || {};
  if (params.ethereal) return; // spirit pets pass through harm
  c.hp -= amount;
  c.hitFlash = 0.15;
  if (c.hp <= 0) killCompanion(state, c);
}

/** Enemy AoE at (x, z): also hits companions (pets and the buddy). */
export function damageCompanionsInRadius(state, x, z, radius, dmg) {
  const all = state.stores.companions.all;
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (!c.active || (c.ai !== 'pet' && c.ai !== 'buddy')) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    const rr = radius + c.radius;
    if (dx * dx + dz * dz <= rr * rr) damageCompanion(state, c, dmg);
  }
}

function fireTurretShot(state, c, target) {
  const p = acquire(state.stores.projectiles);
  if (!p) return;
  const dx = target.x - c.x;
  const dz = target.z - c.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const w = c.weaponInst;
  p.x = c.x + (dx / d) * 0.3;
  p.z = c.z + (dz / d) * 0.3;
  p.radius = 0.22;
  p.speed = w
    ? ((w.def.stats && w.def.stats.projectileSpeed) || 11)
    : (c.def.projSpeed || 11);
  p.vx = (dx / d) * p.speed;
  p.vz = (dz / d) * p.speed;
  p.facing = Math.atan2(dz, dx);
  p.owner = c.ownerPlayer;
  if (w) {
    const params = w.def.behaviorParams || {};
    p.weaponRef = w;
    p.archetype = (w.def.visual && w.def.visual.projectile) || 'seed_bolt';
    p.pierce = (w.def.stats && w.def.stats.pierce) || 0;
    if (params.lobbed) {
      // Mortar turrets (melon_mortar_turret): arc to the target and explode.
      p.ptype = 'lobbed';
      p.aiX = target.x;
      p.aiZ = target.z;
      const stats = c.ownerPlayer.stats;
      p.expRadius =
        ((w.def.stats && w.def.stats.radius) || 1.8) * (1 + ((stats && stats.explosionSize) || 0) / 100);
      p.ttl = d / p.speed + 0.05;
    } else if (params.chainJumps) {
      // Tesla turrets (tesla_totem_turret): bolts chain between enemies.
      p.ptype = 'chain';
      p.chainLeft = params.chainJumps;
    } else {
      p.ptype = 'projectile';
    }
  } else {
    p.ptype = 'effect';
    p.archetype = 'seed_bolt';
    const pl = c.ownerPlayer;
    p.damage = Math.max(1, Math.round(c.dmg * (1 + ((pl && pl.stats.damagePct) || 0) / 100)));
  }
  p.rangeLeft = w ? weaponRange(w, c.ownerPlayer.stats) + 2 : (c.def.range || 8) + 2;
  if (p.ptype !== 'lobbed') p.ttl = 3;
  c.facing = p.facing;
}

export function updateCompanions(state, dt) {
  const all = state.stores.companions.all;
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (!c.active) continue;
    c.age += dt;
    if (c.ttl > 0 && c.age >= c.ttl) {
      release(state.stores.companions, c);
      continue;
    }
    const owner = c.ownerPlayer;
    if (!owner || !owner.alive) {
      release(state.stores.companions, c);
      continue;
    }
    // Weapon-bound companions die with their weapon (sold / merged away).
    const w = c.weaponInst;
    if (w && owner.weapons.indexOf(w) === -1) {
      release(state.stores.companions, c);
      continue;
    }
    if (c.attackCd > 0) c.attackCd -= dt;

    if (c.ai === 'turret') {
      const range = w ? weaponRange(w, owner.stats) : (c.def.range || 8);
      const target = nearestEnemy(state, c.x, c.z, range);
      if (target && c.attackCd <= 0) {
        fireTurretShot(state, c, target);
        c.attackCd = w ? Math.max(0.15, c.aiX || 0.8) : (c.def.cooldown || 0.8);
      }
      continue;
    }

    if (c.ai === 'pet') {
      const params = (w && w.def.behaviorParams) || {};
      const leash = 12;
      const target = nearestEnemy(state, owner.x, owner.z, leash);
      let tx;
      let tz;
      if (target) {
        tx = target.x;
        tz = target.z;
      } else {
        tx = owner.x + 0.9;
        tz = owner.z + 0.4;
      }
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const speed = c.speed || params.petSpeed || 7;
      if (d > 0.5) {
        c.x += (dx / d) * speed * dt;
        c.z += (dz / d) * speed * dt;
        c.facing = Math.atan2(dz, dx);
      }
      // Bite anything in contact range.
      if (c.attackCd <= 0) {
        const n = state.hash.query(c.x, c.z, c.radius + 0.35, FIND_Q);
        for (let k = 0; k < n; k++) {
          const ent = FIND_Q[k];
          if (!ent || ent.kind !== 'enemy') continue;
          if (w) {
            applyWeaponHit(state, owner, w, ent, 1);
            c.attackCd = weaponCooldown(w, owner.stats);
          } else {
            const dmg = Math.max(1, Math.round(c.dmg * (1 + (owner.stats.damagePct || 0) / 100)));
            applyDirectDamage(state, ent, dmg, 'normal', null);
            c.attackCd = c.def.cooldown || 0.8;
          }
          break;
        }
      }
      // Pets take enemy contact damage (and can die; see killCompanion).
      tickCompanionContact(state, c, dt);
      continue;
    }

    if (c.ai === 'buddy') {
      // Optional co-op buddy: second gamepad drives it like a light player.
      const intent = state.input ? state.input.getIntent(1) : null;
      if (intent) {
        const speed = 5.2;
        c.x += intent.moveX * speed * dt;
        c.z += intent.moveZ * speed * dt;
        if (intent.moveX !== 0 || intent.moveZ !== 0) {
          c.facing = Math.atan2(intent.moveZ, intent.moveX);
        }
        const hw = state.arenaW / 2 - c.radius;
        const hh = state.arenaH / 2 - c.radius;
        if (c.x < -hw) c.x = -hw;
        else if (c.x > hw) c.x = hw;
        if (c.z < -hh) c.z = -hh;
        else if (c.z > hh) c.z = hh;
      }
      if (c.attackCd <= 0) {
        const n = state.hash.query(c.x, c.z, c.radius + 0.4, FIND_Q);
        for (let k = 0; k < n; k++) {
          const ent = FIND_Q[k];
          if (!ent || ent.kind !== 'enemy') continue;
          applyDirectDamage(state, ent, 4, 'normal', null);
          c.attackCd = 0.6;
          break;
        }
      }
      tickCompanionContact(state, c, dt);
    }
  }
}

/** Pet death: sets the weapon's respawn timer, emits 'pet:death' {count}. */
export function killCompanion(state, c) {
  if (!c.active) return;
  if (c.weaponInst) c.weaponInst._petRespawnAt = state.timeSec + ((c.weaponInst.def.behaviorParams || {}).respawn || 5);
  release(state.stores.companions, c);
  PET_DEATH_EV.count = liveCompanionCount(state);
  state.bus.emit('pet:death', PET_DEATH_EV);
}

/** Release everything (wave transitions / run teardown). */
export function clearCompanions(state) {
  state.stores.companions.pool.reset();
}
