// APETATO game/statuses — status effects on entities and players.
//
// Types: burn/poison (dps, ticks 2/s; poison stacks up to 5), slow (-40%
// speed), freeze (speed 0, capped 0.8s), stun, shock (dps ticks + arcs 25%
// of each tick to 2 nearby), bleed (dps).
//
// Application scaling (from the APPLIER's stats): dps *(1 + elementalDamage
// / 20), duration *(1 + effectDuration / 100).
//
// Storage: every entity/player owns STATUS_SLOTS preallocated slot objects
// (entities.js) — zero allocation on apply/tick.

import { STATUS_SLOTS } from './entities.js';
import { applyDirectDamage, damagePlayerDot } from './combat.js';

const TICK_PERIOD = 0.5; // dps statuses tick twice per second
const FREEZE_CAP = 0.8;
const POISON_MAX_STACKS = 5;
const SHOCK_ARC_RADIUS = 3;
const SHOCK_ARC_COUNT = 2;
const SHOCK_ARC_MULT = 0.25;

const DPS_TYPES = { burn: 1, poison: 1, shock: 1, bleed: 1 };

// Scratch for shock arcs (module-private; statuses never nest queries).
const ARC_Q = [];

/**
 * Apply (or refresh) a status on a target that owns `.statuses` slots.
 * `srcStats` are the applier's stats (may be null for hazards/enemies).
 */
export function applyStatus(state, target, type, dps, duration, srcStats) {
  if (!target || !target.statuses) return;
  let d = dps || 0;
  let dur = duration || 0;
  if (srcStats) {
    d *= 1 + (srcStats.elementalDamage || 0) / 20;
    dur *= 1 + (srcStats.effectDuration || 0) / 100;
  }
  if (type === 'freeze' && dur > FREEZE_CAP) dur = FREEZE_CAP;

  const slots = target.statuses;
  let free = null;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = slots[i];
    if (s.active && s.type === type) {
      // Refresh; poison stacks up.
      if (type === 'poison' && s.stacks < POISON_MAX_STACKS) s.stacks++;
      if (dur > s.left) s.left = dur;
      if (d > s.dps) s.dps = d;
      return;
    }
    if (!s.active && free === null) free = s;
  }
  if (free === null) return; // all slots busy — drop (graceful)
  free.active = true;
  free.type = type;
  free.dps = d;
  free.left = dur;
  free.duration = dur;
  free.stacks = 1;
  free.tickAcc = 0;
  free.slowPct = type === 'slow' ? 40 : 0;
}

/** Cached movement multiplier from active statuses (0 for freeze/stun). */
export function statusSpeedMult(target) {
  const slots = target.statuses;
  let mult = 1;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = slots[i];
    if (!s.active) continue;
    if (s.type === 'freeze' || s.type === 'stun') return 0;
    if (s.type === 'slow') mult *= 0.6;
  }
  return mult;
}

/** True while the target is stunned or frozen (blocks attacks too). */
export function isDisabled(target) {
  const slots = target.statuses;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = slots[i];
    if (s.active && (s.type === 'freeze' || s.type === 'stun')) return true;
  }
  return false;
}

/** Tick all statuses on an ENEMY entity. Updates ent.slowMult. */
export function tickStatuses(state, ent, dt) {
  const slots = ent.statuses;
  let mult = 1;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = slots[i];
    if (!s.active) continue;
    s.left -= dt;
    if (DPS_TYPES[s.type] === 1 && s.dps > 0) {
      s.tickAcc += dt;
      while (s.tickAcc >= TICK_PERIOD) {
        s.tickAcc -= TICK_PERIOD;
        const dmg = s.dps * s.stacks * TICK_PERIOD;
        applyDirectDamage(state, ent, dmg, s.type, null);
        if (s.type === 'shock') arcShock(state, ent, dmg);
        if (!ent.active || ent.dead) return;
      }
    }
    if (s.left <= 0) {
      s.active = false;
      continue;
    }
    if (s.type === 'freeze' || s.type === 'stun') mult = 0;
    else if (s.type === 'slow' && mult > 0) mult *= 0.6;
  }
  ent.slowMult = mult;
}

/** Shock arcs: 25% of the tick damage to up to 2 enemies nearby. */
function arcShock(state, ent, tickDmg) {
  const n = state.hash.query(ent.x, ent.z, SHOCK_ARC_RADIUS, ARC_Q);
  let hit = 0;
  for (let i = 0; i < n && hit < SHOCK_ARC_COUNT; i++) {
    const other = ARC_Q[i];
    if (other === ent || other.kind !== 'enemy') continue;
    applyDirectDamage(state, other, tickDmg * SHOCK_ARC_MULT, 'shock', null);
    hit++;
  }
}

/** Tick statuses on a PLAYER (DoT bypasses armor; slow affects movement). */
export function tickPlayerStatuses(state, player, dt) {
  const slots = player.statuses;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = slots[i];
    if (!s.active) continue;
    s.left -= dt;
    if (DPS_TYPES[s.type] === 1 && s.dps > 0) {
      s.tickAcc += dt;
      while (s.tickAcc >= TICK_PERIOD) {
        s.tickAcc -= TICK_PERIOD;
        damagePlayerDot(state, player, s.dps * s.stacks * TICK_PERIOD, s.type);
        if (!player.alive) return;
      }
    }
    if (s.left <= 0) s.active = false;
  }
}

/** Movement multiplier for a player from statuses (+ hazard slows). */
export function playerSpeedMult(player) {
  let mult = statusSpeedMult(player);
  if (player._hazardSlow > 0) mult *= 1 - player._hazardSlow / 100;
  return mult;
}
