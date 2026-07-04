// APETATO game/effects — the effect DSL interpreter.
//
// Content (items, character passives, synergy tiers, weapon onHit lists,
// elite mods) describes behavior as { trigger, chance?, cond?, do:[ops] }.
// This module owns registration, trigger dispatch, interval ticking, and op
// execution — for player-owned effects AND (separately) enemy/elite-owned
// effects.
//
// Player API (contract):
//   registerOwner(player, sourceId, effects[, opts])
//   unregisterOwner(sourceId)
//   fireTrigger(name, ctx = { player, target?, damage?, weapon?, state })
//
// passive `stat` / `statPer` ops feed computeStats via applyPassiveMods();
// all other ops execute at trigger time.

import { Content } from '../content/registry.js';
import { applyStatus } from './statuses.js';
import { applyDirectDamage, explodeFromPlayer, damagePlayer } from './combat.js';
import { healPlayer, addShield, addBuff, addEarnedStat } from './player.js';
import { spawnSimpleProjectile } from './projectiles.js';
import { summonCompanion } from './companions.js';
import { grantXp } from './levelup.js';
import { gainCoins } from './pickups.js';

/** @type {Map<string, object>} sourceId -> owner record */
const owners = new Map();
/** @type {Map<object, object[]>} player -> owner records (ordered) */
const byPlayer = new Map();

// Reentrancy-safe ctx pool: onHit can kill, which fires onKill, etc.
const CTX_POOL = [];
for (let i = 0; i < 8; i++) CTX_POOL.push({ player: null, target: null, damage: 0, weapon: null, state: null });
let ctxDepth = 0;

// Depth-indexed scratch arrays (nested triggers each get their own slot,
// e.g. onKill 'damageNearest' firing while an outer 'damageNearest' runs).
const NEAR_QS = [];
const PICKEDS = [];
for (let i = 0; i < 9; i++) {
  NEAR_QS.push([]);
  PICKEDS.push([]);
}

/** Wipe all registrations (run start). */
export function resetEffects() {
  owners.clear();
  byPlayer.clear();
  ctxDepth = 0;
}

/**
 * Register an effect owner for a player.
 * @param {object} player
 * @param {string} sourceId unique key ('item:x', 'char:y', 'syn:melee', ...)
 * @param {Array} effects list of effect defs (defensively coerced)
 * @param {object} [opts] { weapon } — restrict onHit/onCrit/onKill to hits
 *   made by that WeaponInstance.
 */
export function registerOwner(player, sourceId, effects, opts) {
  if (!player || !sourceId) return;
  unregisterOwner(sourceId);
  const list = Array.isArray(effects) ? effects : [];
  let hasPassive = false;
  for (const fx of list) {
    if (fx && fx.trigger === 'passive') hasPassive = true;
  }
  const rec = {
    player,
    sourceId,
    effects: list,
    weapon: (opts && opts.weapon) || null,
    timers: new Float64Array(list.length),
    passive: { mods: {} },
    passiveKeys: [],
    hasPassive,
  };
  for (let i = 0; i < list.length; i++) {
    const fx = list[i];
    rec.timers[i] = fx && fx.trigger === 'interval' ? Number(fx.interval) || 1 : 0;
  }
  owners.set(sourceId, rec);
  let arr = byPlayer.get(player);
  if (!arr) {
    arr = [];
    byPlayer.set(player, arr);
  }
  arr.push(rec);
  player._sourcesDirty = true;
}

/** Remove an owner by sourceId (contract signature). */
export function unregisterOwner(sourceId) {
  const rec = owners.get(sourceId);
  if (!rec) return;
  owners.delete(sourceId);
  const arr = byPlayer.get(rec.player);
  if (arr) {
    const i = arr.indexOf(rec);
    if (i !== -1) arr.splice(i, 1);
  }
  rec.player._sourcesDirty = true;
}

/** Owner records for a player (used by player.js to rebuild stat sources). */
export function ownersOf(player) {
  return byPlayer.get(player) || null;
}

// ---------------------------------------------------------------------------
// Conditions / chance
// ---------------------------------------------------------------------------

function playerHasTag(player, tag) {
  const items = player.items;
  if (!items) return false;
  for (const id of items.keys()) {
    const def = Content.byId.items.get(id);
    if (def && Array.isArray(def.tags) && def.tags.indexOf(tag) !== -1) return true;
  }
  return false;
}

function condOk(cond, player, state) {
  if (!cond) return true;
  const stats = player.stats;
  if (cond.hpBelowPct !== undefined) {
    if (!((player.hp / Math.max(1, stats.maxHp)) * 100 <= cond.hpBelowPct)) return false;
  }
  if (cond.waveGte !== undefined && !(state.wave >= cond.waveGte)) return false;
  if (cond.hasTag !== undefined && !playerHasTag(player, cond.hasTag)) return false;
  if (cond.stat !== undefined && !(Number(stats[cond.stat]) >= (cond.gte !== undefined ? cond.gte : 0))) {
    return false;
  }
  return true;
}

function chanceOk(fx, player, state) {
  if (fx.chance === undefined) return true;
  let pct = fx.chance;
  if (fx.luckScales) pct *= 1 + (player.stats.luck || 0) / 100;
  if (pct > 100) pct = 100;
  return state.rng.next() * 100 < pct;
}

// ---------------------------------------------------------------------------
// Passive stat collection (feeds computeStats)
// ---------------------------------------------------------------------------

function statPerCount(per, player, state) {
  if (!per) return 0;
  const step = Number(per.step) || 1;
  switch (per.what) {
    case 'itemTag': {
      let n = 0;
      for (const [id, stacks] of player.items) {
        const def = Content.byId.items.get(id);
        if (def && Array.isArray(def.tags) && def.tags.indexOf(per.tag) !== -1) n += stacks;
      }
      return n / step;
    }
    case 'weaponClass': {
      let n = 0;
      const ws = player.weapons;
      for (let i = 0; i < ws.length; i++) {
        const cls = ws[i].def.classes;
        if (Array.isArray(cls) && cls.indexOf(per.cls) !== -1) n++;
      }
      return n / step;
    }
    case 'missingHpPct': {
      const maxHp = Math.max(1, player.stats.maxHp || 1);
      return ((1 - player.hp / maxHp) * 100) / step;
    }
    case 'wave':
      return Math.floor(state.wave / step);
    case 'kills':
      return Math.floor(state.runStats.kills / step);
    default:
      return 0;
  }
}

/**
 * Refresh every owner's passive mods object in place. Called by
 * player.recomputeStats right before computeStats().
 */
export function applyPassiveMods(player, state) {
  const list = byPlayer.get(player);
  if (!list) return;
  for (let o = 0; o < list.length; o++) {
    const rec = list[o];
    if (!rec.hasPassive) continue;
    const mods = rec.passive.mods;
    for (let k = 0; k < rec.passiveKeys.length; k++) mods[rec.passiveKeys[k]] = 0;
    for (let i = 0; i < rec.effects.length; i++) {
      const fx = rec.effects[i];
      if (!fx || fx.trigger !== 'passive') continue;
      if (!condOk(fx.cond, player, state)) continue;
      const ops = fx.do;
      if (!Array.isArray(ops)) continue;
      for (let j = 0; j < ops.length; j++) {
        const op = ops[j];
        if (!op || !op.stat) continue;
        let add = 0;
        if (op.op === 'stat') {
          add = Number(op.add) || 0;
        } else if (op.op === 'statPer') {
          add = (Number(op.add) || 0) * statPerCount(op.per, player, state);
          if (op.max !== undefined) {
            if (add > op.max) add = op.max;
            else if (add < -op.max) add = -op.max;
          }
        } else {
          continue;
        }
        if (mods[op.stat] === undefined) rec.passiveKeys.push(op.stat);
        mods[op.stat] = (mods[op.stat] || 0) + add;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Trigger dispatch + op execution (player-owned)
// ---------------------------------------------------------------------------

/**
 * Fire a trigger for a player. ctx = { player, state, target?, damage?,
 * weapon? }. Contract entry point.
 */
export function fireTrigger(name, ctx) {
  if (!ctx || !ctx.player || !ctx.state) return;
  const list = byPlayer.get(ctx.player);
  if (!list) return;
  // Iterate a snapshot-by-length; owners added mid-fire apply next time.
  const len = list.length;
  for (let o = 0; o < len; o++) {
    const rec = list[o];
    if (!rec) continue;
    if (rec.weapon && ctx.weapon !== rec.weapon) continue;
    for (let i = 0; i < rec.effects.length; i++) {
      const fx = rec.effects[i];
      if (!fx || fx.trigger !== name) continue;
      if (!condOk(fx.cond, ctx.player, ctx.state)) continue;
      if (!chanceOk(fx, ctx.player, ctx.state)) continue;
      runOps(fx.do, rec, ctx);
    }
  }
}

/** Allocation-free trigger helper for hot paths (borrows a pooled ctx). */
export function fireTriggerFast(name, player, state, target, damage, weapon) {
  if (ctxDepth >= CTX_POOL.length) return; // pathological nesting — bail
  const ctx = CTX_POOL[ctxDepth++];
  ctx.player = player;
  ctx.state = state;
  ctx.target = target || null;
  ctx.damage = damage || 0;
  ctx.weapon = weapon || null;
  fireTrigger(name, ctx);
  ctx.player = null;
  ctx.target = null;
  ctx.weapon = null;
  ctx.state = null;
  ctxDepth--;
}

function runOps(ops, rec, ctx) {
  if (!Array.isArray(ops)) return;
  for (let i = 0; i < ops.length; i++) runOp(ops[i], rec, ctx);
}

function scaledDamage(base, player) {
  return Math.max(1, Math.round(base * (1 + (player.stats.damagePct || 0) / 100)));
}

function runOp(op, rec, ctx) {
  if (!op || !op.op) return;
  const player = ctx.player;
  const state = ctx.state;
  switch (op.op) {
    case 'stat': // non-passive stat ops grant a permanent bonus
      if (op.stat) addEarnedStat(state, player, op.stat, Number(op.add) || 0);
      break;
    case 'statPer':
      if (op.stat) {
        let add = (Number(op.add) || 0) * statPerCount(op.per, player, state);
        if (op.max !== undefined && add > op.max) add = op.max;
        addEarnedStat(state, player, op.stat, add);
      }
      break;
    case 'heal':
      healPlayer(state, player, Number(op.amount) || 1);
      break;
    case 'shield':
      addShield(state, player, Number(op.amount) || 1);
      break;
    case 'coins':
      gainCoins(state, Math.round(Number(op.amount) || 1), player.x, player.z);
      break;
    case 'xp':
      grantXp(state, player, Number(op.amount) || 1);
      break;
    case 'damageNearest': {
      const NEAR_Q = NEAR_QS[Math.min(ctxDepth, 8)];
      const PICKED = PICKEDS[Math.min(ctxDepth, 8)];
      const radius = Number(op.radius) || 5;
      const count = Math.max(1, Number(op.count) || 1);
      const dmg = op.scaled ? scaledDamage(op.damage || 1, player) : Math.max(1, Math.round(op.damage || 1));
      const n = state.hash.query(player.x, player.z, radius, NEAR_Q);
      let picked = 0;
      while (picked < count) {
        let best = null;
        let bestD2 = Infinity;
        for (let i = 0; i < n; i++) {
          const e = NEAR_Q[i];
          if (!e || e.kind !== 'enemy' || !e.active) continue;
          let already = false;
          for (let j = 0; j < picked; j++) {
            if (PICKED[j] === e) {
              already = true;
              break;
            }
          }
          if (already) continue;
          const dx = e.x - player.x;
          const dz = e.z - player.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = e;
          }
        }
        if (!best) break;
        PICKED[picked++] = best;
        applyDirectDamage(state, best, dmg, 'normal', null);
      }
      for (let j = 0; j < picked; j++) PICKED[j] = null;
      break;
    }
    case 'explode': {
      const atTarget = op.at === 'target' && ctx.target;
      const x = atTarget ? ctx.target.x : player.x;
      const z = atTarget ? ctx.target.z : player.z;
      const dmg = op.scaled ? scaledDamage(op.damage || 1, player) : Math.max(1, Math.round(op.damage || 1));
      const radius = (Number(op.radius) || 2) * (1 + (player.stats.explosionSize || 0) / 100);
      explodeFromPlayer(state, player, x, z, radius, dmg, null);
      break;
    }
    case 'projectile':
      spawnSimpleProjectile(state, player, op, ctx.target);
      break;
    case 'status': {
      const dps = Number(op.dps) || 0;
      const dur = Number(op.duration) || 1;
      if (op.target === 'area') {
        const NEAR_Q = NEAR_QS[Math.min(ctxDepth, 8)];
        const radius = Number(op.radius) || 3;
        const cx = ctx.target ? ctx.target.x : player.x;
        const cz = ctx.target ? ctx.target.z : player.z;
        const n = state.hash.query(cx, cz, radius, NEAR_Q);
        for (let i = 0; i < n; i++) {
          const e = NEAR_Q[i];
          if (e && e.kind === 'enemy') applyStatus(state, e, op.status, dps, dur, player.stats);
        }
      } else if (ctx.target) {
        applyStatus(state, ctx.target, op.status, dps, dur, player.stats);
      }
      break;
    }
    case 'buff':
      if (op.stat) addBuff(state, player, op.stat, Number(op.add) || 0, Number(op.duration) || 3);
      break;
    case 'summon':
      summonCompanion(state, player, op.what || 'monkey_pal', Math.max(1, Number(op.max) || 1), rec.sourceId);
      break;
    default:
      break;
  }
}

/** Interval triggers for all player-owned effects. Called once per step. */
export function updateEffects(state, dt) {
  const players = state.players;
  for (let p = 0; p < players.length; p++) {
    const player = players[p];
    if (!player.alive) continue;
    const list = byPlayer.get(player);
    if (!list) continue;
    for (let o = 0; o < list.length; o++) {
      const rec = list[o];
      for (let i = 0; i < rec.effects.length; i++) {
        const fx = rec.effects[i];
        if (!fx || fx.trigger !== 'interval') continue;
        rec.timers[i] -= dt;
        if (rec.timers[i] > 0) continue;
        rec.timers[i] = Number(fx.interval) || 1;
        if (!condOk(fx.cond, player, state)) continue;
        if (!chanceOk(fx, player, state)) continue;
        if (ctxDepth >= CTX_POOL.length) continue;
        const ctx = CTX_POOL[ctxDepth++];
        ctx.player = player;
        ctx.state = state;
        ctx.target = null;
        ctx.damage = 0;
        ctx.weapon = rec.weapon;
        runOps(fx.do, rec, ctx);
        ctx.player = null;
        ctx.state = null;
        ctx.weapon = null;
        ctxDepth--;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy/elite-owned effects (ops target the players)
// ---------------------------------------------------------------------------

const EXPL_EV = { x: 0, z: 0, radius: 0 };

function runEnemyOps(state, ent, ops, hitPlayer) {
  if (!Array.isArray(ops)) return;
  const player = hitPlayer || nearestPlayer(state, ent);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op) continue;
    switch (op.op) {
      case 'explode': {
        const radius = Number(op.radius) || 2;
        EXPL_EV.x = ent.x;
        EXPL_EV.z = ent.z;
        EXPL_EV.radius = radius;
        state.bus.emit('explosion', EXPL_EV);
        for (let p = 0; p < state.players.length; p++) {
          const pl = state.players[p];
          if (!pl.alive) continue;
          const dx = pl.x - ent.x;
          const dz = pl.z - ent.z;
          if (dx * dx + dz * dz <= (radius + pl.radius) * (radius + pl.radius)) {
            damagePlayer(state, pl, Number(op.damage) || 5, ent);
          }
        }
        break;
      }
      case 'status': {
        if (op.target === 'area') {
          const radius = Number(op.radius) || 3;
          for (let p = 0; p < state.players.length; p++) {
            const pl = state.players[p];
            if (!pl.alive) continue;
            const dx = pl.x - ent.x;
            const dz = pl.z - ent.z;
            if (dx * dx + dz * dz <= radius * radius) {
              applyStatus(state, pl, op.status, Number(op.dps) || 0, Number(op.duration) || 1, null);
            }
          }
        } else if (player) {
          applyStatus(state, player, op.status, Number(op.dps) || 0, Number(op.duration) || 1, null);
        }
        break;
      }
      case 'damageNearest': {
        const radius = Number(op.radius) || 4;
        if (player) {
          const dx = player.x - ent.x;
          const dz = player.z - ent.z;
          if (dx * dx + dz * dz <= radius * radius) {
            damagePlayer(state, player, Number(op.damage) || 3, ent);
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

function nearestPlayer(state, ent) {
  let best = null;
  let bestD2 = Infinity;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
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

/** Fire an enemy-owned trigger ('onDeath' | 'onHit'). */
export function fireEnemyTrigger(state, ent, trigger, hitPlayer) {
  const mod = ent.elite;
  if (!mod || !Array.isArray(mod.effects)) return;
  for (let i = 0; i < mod.effects.length; i++) {
    const fx = mod.effects[i];
    if (!fx || fx.trigger !== trigger) continue;
    if (fx.chance !== undefined && !(state.rng.next() * 100 < fx.chance)) continue;
    runEnemyOps(state, ent, fx.do, hitPlayer);
  }
}

/** Tick enemy-owned interval effects (elite mods have <= 2 effects). */
export function tickEnemyEffects(state, ent, dt) {
  const mod = ent.elite;
  if (!mod || !Array.isArray(mod.effects)) return;
  for (let i = 0; i < mod.effects.length && i < 2; i++) {
    const fx = mod.effects[i];
    if (!fx || fx.trigger !== 'interval') continue;
    const t = (i === 0 ? (ent.eliteT0 -= dt) : (ent.eliteT1 -= dt));
    if (t > 0) continue;
    const period = Number(fx.interval) || 4;
    if (i === 0) ent.eliteT0 = period;
    else ent.eliteT1 = period;
    runEnemyOps(state, ent, fx.do, null);
  }
}
