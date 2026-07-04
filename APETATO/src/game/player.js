// APETATO game/player — player construction, stats aggregation, movement.
//
// Stat pipeline (recomputeStats): computeStats([character.statMods,
// levelBonus, ...items×stacks, ...upgrades, ...earned, ...buffs,
// ...synergy bonuses, ...effect passive sources]) — recomputed on
// buy/sell/levelup/buff change/synergy change (and periodically for
// missingHpPct-style passives). Emits 'stats:recomputed' { player }.

import { computeStats, DERIVED } from '../core/statmodel.js';
import { CONFIG } from '../core/config.js';
import { registerOwner, unregisterOwner, ownersOf, applyPassiveMods } from './effects.js';
import { playerSpeedMult } from './statuses.js';
import { resolveArenaCollision } from './collision.js';
import { STATUS_SLOTS } from './entities.js';

const RECOMPUTE_EV = { player: null };
const REGEN_PERIOD = 5; // 1 hp per `hpRegen` point every 5 seconds
const LOWHP_REARM_PCT = 0.6;

function makeStatusSlot() {
  return { active: false, type: '', dps: 0, left: 0, duration: 0, stacks: 1, tickAcc: 0, slowPct: 0 };
}

/** Build a fresh player for a run. Stats/hp are finalized by the caller. */
export function createPlayer(state, index, character) {
  const statuses = new Array(STATUS_SLOTS);
  for (let i = 0; i < STATUS_SLOTS; i++) statuses[i] = makeStatusSlot();
  const player = {
    // --- contract shape ------------------------------------------------
    index,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    radius: CONFIG.PLAYER.radius || 0.5,
    facing: 0,
    hp: 1,
    shield: 0,
    alive: true,
    iFrames: 0,
    level: 1,
    xp: 0,
    pendingLevelups: 0,
    character,
    weapons: [],
    items: new Map(), // itemId -> stacks
    baseStats: computeStats([character && character.statMods]),
    stats: {},
    buffs: [], // { stat, add, left, mods }
    mesh: null,
    // --- internals -------------------------------------------------------
    statuses,
    kbX: 0,
    kbZ: 0,
    _itemSources: new Map(), // itemId -> { mods, stacks }
    _upgradeSources: [], // permanent level-up picks: { mods }
    _earned: { mods: {} }, // permanent trigger-time stat ops
    _levelSource: { mods: { maxHp: 0 } }, // +1 maxHp per level
    _synSources: new Map(), // classId -> { mods }
    _synTiers: new Map(), // classId -> tier (synergy.js)
    _sources: [],
    _sourcesDirty: true,
    _lowHpArmed: true,
    _hazardSlow: 0,
    _regenAcc: 0,
    itemsOrder: [], // stable order for sell-by-index
    itemPaid: new Map(), // itemId -> last paid price
  };
  if (character && Array.isArray(character.passives)) {
    registerOwner(player, 'char:' + (character.id || index), character.passives);
  }
  recomputeStats(state, player);
  player.hp = player.stats.maxHp;
  return player;
}

function rebuildSources(player) {
  const src = player._sources;
  src.length = 0;
  if (player.character && player.character.statMods) src.push(player.character.statMods);
  src.push(player._levelSource);
  for (const s of player._itemSources.values()) src.push(s);
  for (let i = 0; i < player._upgradeSources.length; i++) src.push(player._upgradeSources[i]);
  src.push(player._earned);
  for (let i = 0; i < player.buffs.length; i++) src.push(player.buffs[i]);
  for (const s of player._synSources.values()) src.push(s);
  const owners = ownersOf(player);
  if (owners) {
    for (let i = 0; i < owners.length; i++) {
      if (owners[i].hasPassive) src.push(owners[i].passive);
    }
  }
  player._sourcesDirty = false;
}

function shieldCap(player) {
  const sm = player.stats.shieldMax || 0;
  return sm > 0 ? sm : 6; // small default cap so shield ops still matter
}

/** Recompute a player's stats and clamp derived resources. */
export function recomputeStats(state, player) {
  if (player._sourcesDirty) rebuildSources(player);
  applyPassiveMods(player, state);
  const oldMax = player.stats.maxHp || 0;
  computeStats(player._sources, player.stats);
  const hpMult = (state.modeRules && state.modeRules.hpMult) || 1;
  if (hpMult !== 1) player.stats.maxHp = Math.max(1, Math.round(player.stats.maxHp * hpMult));
  const newMax = player.stats.maxHp;
  if (oldMax > 0 && newMax > oldMax) player.hp += newMax - oldMax; // maxHp gains heal the delta
  if (player.hp > newMax) player.hp = newMax;
  const cap = shieldCap(player);
  if (player.shield > cap) player.shield = cap;
  RECOMPUTE_EV.player = player;
  state.bus.emit('stats:recomputed', RECOMPUTE_EV);
  RECOMPUTE_EV.player = null;
}

export function markSourcesDirty(player) {
  player._sourcesDirty = true;
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function healPlayer(state, player, amount) {
  if (!player.alive || amount <= 0) return;
  player.hp = Math.min(player.stats.maxHp, player.hp + amount);
  if (player.hp / Math.max(1, player.stats.maxHp) >= LOWHP_REARM_PCT) player._lowHpArmed = true;
}

export function addShield(state, player, amount) {
  if (!player.alive || amount <= 0) return;
  player.shield = Math.min(shieldCap(player), player.shield + amount);
}

/** Temporary stat buff (op 'buff'). Expires in tickPlayer. */
export function addBuff(state, player, stat, add, duration) {
  if (!stat || !add) return;
  const mods = {};
  mods[stat] = add;
  player.buffs.push({ stat, add, left: duration || 3, mods });
  player._sourcesDirty = true;
  recomputeStats(state, player);
}

/** Permanent trigger-time stat gain (ops 'stat'/'statPer' outside passive). */
export function addEarnedStat(state, player, stat, add) {
  if (!stat || !add) return;
  player._earned.mods[stat] = (player._earned.mods[stat] || 0) + add;
  recomputeStats(state, player);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Add one stack of an item. Returns false when maxStacks blocks it. */
export function addItem(state, player, itemDef, paidPrice) {
  if (!itemDef || !itemDef.id) return false;
  const id = itemDef.id;
  const cur = player.items.get(id) || 0;
  const maxStacks = itemDef.maxStacks === undefined ? -1 : itemDef.maxStacks;
  if (maxStacks !== -1 && cur >= maxStacks) return false;
  player.items.set(id, cur + 1);
  let src = player._itemSources.get(id);
  if (!src) {
    src = { mods: itemDef.statMods || {}, stacks: 1 };
    player._itemSources.set(id, src);
    player.itemsOrder.push(id);
    if (Array.isArray(itemDef.effects) && itemDef.effects.length > 0) {
      registerOwner(player, 'item:' + id, itemDef.effects);
    }
    player._sourcesDirty = true;
  } else {
    src.stacks = cur + 1;
  }
  if (paidPrice !== undefined) player.itemPaid.set(id, paidPrice);
  recomputeStats(state, player);
  return true;
}

/**
 * Remove one stack of the item at `orderIdx` (sell-by-index contract).
 * Returns { id, paid } or null.
 */
export function removeItemAt(state, player, orderIdx) {
  const id = player.itemsOrder[orderIdx];
  if (!id) return null;
  const cur = player.items.get(id) || 0;
  if (cur <= 0) return null;
  const paid = player.itemPaid.get(id) || 0;
  if (cur === 1) {
    player.items.delete(id);
    player._itemSources.delete(id);
    player.itemsOrder.splice(orderIdx, 1);
    unregisterOwner('item:' + id);
    player._sourcesDirty = true;
  } else {
    player.items.set(id, cur - 1);
    const src = player._itemSources.get(id);
    if (src) src.stacks = cur - 1;
  }
  recomputeStats(state, player);
  return { id, paid };
}

// ---------------------------------------------------------------------------
// Per-step player update
// ---------------------------------------------------------------------------

/** Movement from an input intent. speed = DERIVED.moveSpeed(stats). */
export function movePlayer(state, player, intent, dt) {
  if (!player.alive) return;
  let speed = DERIVED.moveSpeed(player.stats) * playerSpeedMult(player);
  if (state.chaosMod && state.chaosMod.playerSpeed) speed *= state.chaosMod.playerSpeed;
  player.vx = intent.moveX * speed;
  player.vz = intent.moveZ * speed;
  player.x += (player.vx + player.kbX) * dt;
  player.z += (player.vz + player.kbZ) * dt;
  const damp = Math.max(0, 1 - 8 * dt);
  player.kbX *= damp;
  player.kbZ *= damp;
  resolveArenaCollision(player, state);

  // Facing: aim wins, then movement direction.
  if (intent.aimX !== 0 || intent.aimZ !== 0) {
    player.facing = Math.atan2(intent.aimZ, intent.aimX);
  } else if (intent.moveX !== 0 || intent.moveZ !== 0) {
    player.facing = Math.atan2(player.vz, player.vx);
  }
}

/** Timers: iFrames, hp regen, buff expiry. */
export function tickPlayer(state, player, dt) {
  if (!player.alive) return;
  if (player.iFrames > 0) player.iFrames -= dt;

  const regen = player.stats.hpRegen || 0;
  if (regen > 0 && player.hp < player.stats.maxHp) {
    player._regenAcc += (regen * dt) / REGEN_PERIOD;
    if (player._regenAcc >= 1) {
      const whole = Math.floor(player._regenAcc);
      player._regenAcc -= whole;
      healPlayer(state, player, whole);
    }
  }

  let buffsChanged = false;
  for (let i = player.buffs.length - 1; i >= 0; i--) {
    const b = player.buffs[i];
    b.left -= dt;
    if (b.left <= 0) {
      player.buffs.splice(i, 1);
      buffsChanged = true;
    }
  }
  if (buffsChanged) {
    player._sourcesDirty = true;
    recomputeStats(state, player);
  }
}
