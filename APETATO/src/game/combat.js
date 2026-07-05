// APETATO game/combat — THE canonical damage pipeline.
//
// player→enemy:  raw = (weaponDamage + Σ scaling[k]*stats[k]) * (1 + damagePct/100)
//                crit if rng < (weapon.critChance + stats.critChance)/100
//                      → raw *= (weapon.critMult + stats.critDamage/100)
//                final = max(1, round(raw)); knockback (wKb + stats.knockback)*0.4
//                away from the player; lifesteal% chance to heal 1.
// enemy→player:  dodge% first → armorReduction(armor) → shield absorbs → hp;
//                0.35s iFrames; thorns reflect to contact attackers.
//
// Weapon-tier merge scaling (per tier above the def's base tier):
//                damage ×1.6, range ×1.15, cooldown ×0.92.

import { DERIVED } from '../core/statmodel.js';
import { CONFIG } from '../core/config.js';
import { release } from './entities.js';
import { fireTriggerFast, fireEnemyTrigger } from './effects.js';
import { healPlayer } from './player.js';
import { dropsForEnemy } from './pickups.js';
import { spawnEnemyById } from './spawner.js';

// --- reused event payloads (bus listeners must not retain these) -----------
const HIT_EV = { ent: null, damage: 0, crit: false, weaponId: '', x: 0, z: 0, kind: 'normal' };
const CRIT_EV = { damage: 0, x: 0, z: 0 };
const PHIT_EV = { damage: 0, source: null };
const DODGE_EV = { player: null, x: 0, z: 0 };
const DEATH_EV = { ent: null, def: null, x: 0, z: 0, elite: false, cause: '', damage: 0, maxHp: 0 };
const EXPL_EV = { x: 0, z: 0, radius: 0 };
const ROLL = { damage: 0, crit: false };

// Depth-indexed explosion scratch (explosions can chain via onHit/onKill
// effects, so each nesting level gets an isolated query buffer).
const EXPLODE_QS = [[], [], [], []];
let explodeDepth = 0;

// ---------------------------------------------------------------------------
// Weapon math (merge-tier aware)
// ---------------------------------------------------------------------------

/** Merge tiers above the weapon def's base tier (0..3). */
export function tierUp(w) {
  return Math.max(0, (w.tier | 0) - ((w.def.tier | 0) || 1));
}

/** Base damage of a weapon instance after merge scaling. */
export function weaponBaseDamage(w) {
  const s = w.def.stats || {};
  return (s.damage || 0) * Math.pow(1.6, tierUp(w));
}

/** Effective range (merge scaling + range% stat). */
export function weaponRange(w, stats) {
  const s = w.def.stats || {};
  return (s.range || 2) * Math.pow(1.15, tierUp(w)) * (1 + (stats.range || 0) / 100);
}

/** Effective cooldown (merge scaling + attackSpeed via DERIVED). */
export function weaponCooldown(w, stats) {
  const s = w.def.stats || {};
  const base = Math.max(0.05, (s.cooldown || 1) * Math.pow(0.92, tierUp(w)));
  return DERIVED.effectiveCooldown(base, stats.attackSpeed || 0);
}

/**
 * Roll a weapon damage instance (crit included). Result in a reused object:
 * { damage, crit } — consume immediately, do not retain.
 */
export function rollWeaponDamage(state, player, w, mult) {
  const stats = player.stats;
  const s = w.def.stats || {};
  let raw = weaponBaseDamage(w);
  const scaling = w.def.scaling;
  if (scaling) {
    for (const k in scaling) raw += scaling[k] * (stats[k] || 0);
  }
  raw *= 1 + (stats.damagePct || 0) / 100;
  raw *= mult || 1;
  const critChance = ((s.critChance || 0) + (stats.critChance || 0)) / 100;
  let crit = false;
  if (state.rng.next() < critChance) {
    crit = true;
    raw *= (s.critMult || 1.5) + (stats.critDamage || 0) / 100;
  }
  ROLL.damage = Math.max(1, Math.round(raw));
  ROLL.crit = crit;
  return ROLL;
}

// ---------------------------------------------------------------------------
// player → enemy
// ---------------------------------------------------------------------------

/**
 * Full player→enemy pipeline for a weapon hit. Returns damage dealt (0 when
 * the target was already gone).
 */
export function applyWeaponHit(state, player, w, ent, mult) {
  if (!ent || !ent.active || ent.dead) return 0;
  const roll = rollWeaponDamage(state, player, w, mult);
  let dmg = roll.damage;
  const crit = roll.crit;

  // Boss shield-totem phase reduction.
  if (state.boss && ent === state.boss.ent && state.boss.shieldMult < 1) {
    dmg = Math.max(1, Math.round(dmg * state.boss.shieldMult));
  }
  // Shielder-granted absorb.
  if (ent.shieldHp > 0) {
    const absorbed = Math.min(ent.shieldHp, dmg);
    ent.shieldHp -= absorbed;
    dmg -= absorbed;
  }

  ent.hp -= dmg;
  ent.hitFlash = 0.15;

  // Knockback impulse away from the player.
  const stats = player.stats;
  const kb = (((w.def.stats && w.def.stats.knockback) || 0) + (stats.knockback || 0)) * 0.4;
  if (kb > 0 && !ent.isBoss) {
    const dx = ent.x - player.x;
    const dz = ent.z - player.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    ent.vx += (dx / d) * kb;
    ent.vz += (dz / d) * kb;
  }

  // Lifesteal: stats.lifesteal% chance to heal 1.
  if (stats.lifesteal > 0 && state.rng.next() * 100 < stats.lifesteal) {
    healPlayer(state, player, 1);
  }

  // Bookkeeping + events.
  w.dmgDealt += dmg;
  const log = state.runStats.dpsLog;
  log.set(w.def.id, (log.get(w.def.id) || 0) + dmg);
  state.runStats.damageDealt += dmg;

  HIT_EV.ent = ent;
  HIT_EV.damage = dmg;
  HIT_EV.crit = crit;
  HIT_EV.weaponId = w.def.id;
  HIT_EV.x = ent.x;
  HIT_EV.z = ent.z;
  HIT_EV.kind = crit ? 'crit' : 'normal';
  state.bus.emit('enemy:hit', HIT_EV);
  HIT_EV.ent = null;
  if (crit) {
    CRIT_EV.damage = dmg;
    CRIT_EV.x = ent.x;
    CRIT_EV.z = ent.z;
    state.bus.emit('crit', CRIT_EV);
  }

  fireTriggerFast('onHit', player, state, ent, dmg, w);
  if (crit) fireTriggerFast('onCrit', player, state, ent, dmg, w);

  if (ent.hp <= 0 && !ent.dead) killEnemy(state, ent, player, '', dmg);
  return dmg;
}

/**
 * Minimal damage path (DoTs, auras via statuses, effect ops). No crit, no
 * knockback. `kind` colors the damage number ('poison' | 'burn' | 'normal'...).
 */
export function applyDirectDamage(state, ent, dmg, kind, weaponRef) {
  if (!ent || !ent.active || ent.dead || dmg <= 0) return;
  if (state.boss && ent === state.boss.ent && state.boss.shieldMult < 1) {
    dmg *= state.boss.shieldMult;
  }
  if (ent.shieldHp > 0) {
    const absorbed = Math.min(ent.shieldHp, dmg);
    ent.shieldHp -= absorbed;
    dmg -= absorbed;
    if (dmg <= 0) return;
  }
  ent.hp -= dmg;
  ent.hitFlash = 0.1;
  state.runStats.damageDealt += dmg;
  if (weaponRef) {
    weaponRef.dmgDealt += dmg;
    const log = state.runStats.dpsLog;
    log.set(weaponRef.def.id, (log.get(weaponRef.def.id) || 0) + dmg);
  }
  const shown = Math.round(dmg);
  if (shown >= 1) {
    HIT_EV.ent = ent;
    HIT_EV.damage = shown;
    HIT_EV.crit = false;
    HIT_EV.weaponId = weaponRef ? weaponRef.def.id : '';
    HIT_EV.x = ent.x;
    HIT_EV.z = ent.z;
    HIT_EV.kind = kind || 'normal';
    state.bus.emit('enemy:hit', HIT_EV);
    HIT_EV.ent = null;
  }
  if (ent.hp <= 0 && !ent.dead) killEnemy(state, ent, state.players[0], kind, dmg);
}

/**
 * Player-owned explosion at (x, z): 'explosion' event + damage/knockback to
 * every enemy in radius. `damage` is pre-rolled (one roll per explosion).
 */
export function explodeFromPlayer(state, player, x, z, radius, damage, weaponRef) {
  if (explodeDepth >= EXPLODE_QS.length) return; // pathological chaining — bail
  EXPL_EV.x = x;
  EXPL_EV.z = z;
  EXPL_EV.radius = radius;
  state.bus.emit('explosion', EXPL_EV);
  const q = EXPLODE_QS[explodeDepth++];
  const n = state.hash.query(x, z, radius, q);
  for (let i = 0; i < n; i++) {
    const ent = q[i];
    if (!ent || ent.kind !== 'enemy') continue;
    // Small radial knockback.
    if (!ent.isBoss) {
      const dx = ent.x - x;
      const dz = ent.z - z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      ent.vx += (dx / d) * 2.5;
      ent.vz += (dz / d) * 2.5;
    }
    applyDirectDamage(state, ent, damage, 'normal', weaponRef);
    if (weaponRef && ent.active && !ent.dead) {
      fireTriggerFast('onHit', player, state, ent, damage, weaponRef);
    }
  }
  explodeDepth--;
}

/** Enemy death: splits, elite effects, drops, stats, events, pool release.
 * `cause` labels the killing source ('thorns', 'poison'...) and `dmg` is the
 * killing blow — both flow into the 'enemy:death' payload (achievements). */
export function killEnemy(state, ent, killer, cause, dmg) {
  if (ent.dead) return;
  ent.dead = true;
  ent.hp = 0;
  const def = ent.def || {};
  const player = killer || state.players[0];

  if (ent.bossTotem && state.boss) {
    state.boss.totemsAlive = Math.max(0, state.boss.totemsAlive - 1);
    if (state.boss.totemsAlive === 0) state.boss.shieldMult = 1;
  }

  // Splitters burst into smaller versions of themselves.
  if (def.behavior === 'splitter' && def.behaviorParams && def.behaviorParams.splitInto) {
    const count = def.behaviorParams.count || 2;
    for (let i = 0; i < count; i++) {
      const a = state.rng.next() * Math.PI * 2;
      spawnEnemyById(state, def.behaviorParams.splitInto, ent.x + Math.cos(a) * 0.7, ent.z + Math.sin(a) * 0.7, null);
    }
  }

  if (ent.elite) {
    fireEnemyTrigger(state, ent, 'onDeath', null);
    state.runStats.elitesKilled++;
  }

  dropsForEnemy(state, ent);

  state.runStats.kills++;
  DEATH_EV.ent = ent;
  DEATH_EV.def = def;
  DEATH_EV.x = ent.x;
  DEATH_EV.z = ent.z;
  DEATH_EV.elite = !!ent.elite;
  DEATH_EV.cause = cause || '';
  DEATH_EV.damage = dmg || 0;
  DEATH_EV.maxHp = ent.maxHp || 0;
  state.bus.emit('enemy:death', DEATH_EV);
  DEATH_EV.ent = null;
  DEATH_EV.def = null;

  if (player) fireTriggerFast('onKill', player, state, ent, 0, null);

  if (ent.isBoss) {
    state.runStats.bossesKilled++;
    state.bossJustDied = true;
    state.bus.emit('boss:death', { ent });
    ent.active = false; // boss ents are standalone (not pooled)
  } else {
    release(state.stores.enemies, ent);
  }
}

// ---------------------------------------------------------------------------
// enemy → player
// ---------------------------------------------------------------------------

function finishPlayerDeath(state, player) {
  player.hp = 0;
  player.alive = false;
  state.bus.emit('player:death', { player });
}

/**
 * Standard enemy→player pipeline. opts: { bypassDodge, ignoreIFrames,
 * contact } (contact enables thorns reflection).
 */
export function damagePlayer(state, player, amount, source, opts) {
  if (!player || !player.alive || state.over || amount <= 0) return;
  if (player.iFrames > 0 && !(opts && opts.ignoreIFrames)) return;
  const stats = player.stats;

  // 1. Dodge.
  if (!(opts && opts.bypassDodge) && stats.dodge > 0 && state.rng.next() * 100 < stats.dodge) {
    DODGE_EV.player = player;
    DODGE_EV.x = player.x;
    DODGE_EV.z = player.z;
    state.bus.emit('player:dodge', DODGE_EV);
    DODGE_EV.player = null;
    fireTriggerFast('onDodge', player, state, source, 0, null);
    return;
  }

  // 2. Armor.
  let dmg = Math.max(1, Math.round(amount * (1 - DERIVED.armorReduction(stats.armor || 0))));
  if (state.modeRules.hardcore) dmg = Math.max(dmg, player.hp + player.shield);

  // 3. Shield absorbs first.
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
  }

  player.iFrames = CONFIG.PLAYER.iFrames || 0.35;
  if (dmg > 0) player.hp -= dmg;
  state.runStats.damageTaken += dmg;

  PHIT_EV.damage = dmg;
  PHIT_EV.source = source || null;
  state.bus.emit('player:hit', PHIT_EV);
  PHIT_EV.source = null;

  // Thorns reflect to contact attackers ('thorns' cause feeds achievements).
  if (opts && opts.contact && source && source.kind === 'enemy' && stats.thorns > 0) {
    applyDirectDamage(state, source, stats.thorns, 'thorns', null);
  }
  // Elite on-hit effects proc when the elite lands a hit.
  if (source && source.elite) fireEnemyTrigger(state, source, 'onHit', player);

  fireTriggerFast('onTakeDamage', player, state, source, dmg, null);
  checkLowHp(state, player);

  if (player.hp <= 0) finishPlayerDeath(state, player);
}

/** Hazard damage: bypasses dodge, respects armor + shield, no iFrames. */
export function hazardDamagePlayer(state, player, amount) {
  if (!player || !player.alive || state.over || amount <= 0) return;
  const stats = player.stats;
  let dmg = Math.max(1, Math.round(amount * (1 - DERIVED.armorReduction(stats.armor || 0))));
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, dmg);
    player.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) player.hp -= dmg;
  state.runStats.damageTaken += dmg;
  PHIT_EV.damage = dmg;
  PHIT_EV.source = null;
  state.bus.emit('player:hit', PHIT_EV);
  fireTriggerFast('onTakeDamage', player, state, null, dmg, null);
  checkLowHp(state, player);
  if (player.hp <= 0) finishPlayerDeath(state, player);
}

/** Status DoT on the player: straight to hp (no dodge/armor/iFrames). */
export function damagePlayerDot(state, player, amount, kind) {
  if (!player || !player.alive || state.over || amount <= 0) return;
  player.hp -= amount;
  state.runStats.damageTaken += amount;
  checkLowHp(state, player);
  if (player.hp <= 0) finishPlayerDeath(state, player);
}

/** onLowHp fires once when dropping below 30%; re-arms above 60% (player.js). */
function checkLowHp(state, player) {
  const maxHp = Math.max(1, player.stats.maxHp || 1);
  if (player._lowHpArmed && player.hp > 0 && player.hp / maxHp <= 0.3) {
    player._lowHpArmed = false;
    fireTriggerFast('onLowHp', player, state, null, 0, null);
  }
}
