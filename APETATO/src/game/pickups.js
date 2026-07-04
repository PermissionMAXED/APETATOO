// APETATO game/pickups — XP bananas, coins, crates, heal fruit.
//
// Pooled pickup entities. Magnet: pickups inside DERIVED.pickupRadius(stats)
// slide toward the player at 12 u/s and collect at 0.6 u. Nearby XP orbs
// merge on spawn (CONFIG.XP_ORB_MERGE_DIST) to keep entity counts sane.
//
// Archetypes (renderer instancing keys): 'xp_banana' | 'coin' | 'crate' |
// 'heal_fruit'.

import { DERIVED } from '../core/statmodel.js';
import { CONFIG } from '../core/config.js';
import { Content } from '../content/registry.js';
import { acquire, release } from './entities.js';
import { healPlayer, addItem } from './player.js';
import { grantXp } from './levelup.js';
import { fireTriggerFast } from './effects.js';

const MAGNET_SPEED = 12;
const COLLECT_DIST = 0.6;
const CRATE_COINS = 20;

const COLLECT_EV = { ptype: '', value: 0, x: 0, z: 0 };
const COIN_EV = { amount: 0 };

const ARCHETYPES = {
  xp: 'xp_banana',
  coin: 'coin',
  crate: 'crate',
  heal: 'heal_fruit',
};

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/** Spawn any pickup. Returns the entity (or null when the pool is full). */
export function spawnPickup(state, ptype, x, z, value) {
  const p = acquire(state.stores.pickups);
  if (!p) return null;
  p.x = x;
  p.z = z;
  p.radius = 0.3;
  p.ptype = ptype;
  p.value = value || 1;
  p.archetype = ARCHETYPES[ptype] || ptype;
  p.ttl = ptype === 'xp' ? 60 : 90;
  return p;
}

/** Spawn an XP orb, merging into a close-enough existing orb instead. */
export function spawnXpOrb(state, x, z, value) {
  const mergeD = CONFIG.XP_ORB_MERGE_DIST || 0.6;
  const md2 = mergeD * mergeD;
  const all = state.stores.pickups.all;
  for (let i = 0; i < all.length; i++) {
    const o = all[i];
    if (!o.active || o.ptype !== 'xp') continue;
    const dx = o.x - x;
    const dz = o.z - z;
    if (dx * dx + dz * dz <= md2) {
      o.value += value || 1;
      return o;
    }
  }
  return spawnPickup(state, 'xp', x, z, value);
}

/** Chance a trash kill drops a heal fruit (chip damage must be recoverable). */
const HEAL_DROP_CHANCE = 0.03;

/** Standard drop table on enemy death: XP orb, coin chance, heal, elite crate. */
export function dropsForEnemy(state, ent) {
  const def = ent.def || {};
  const xp = ent.xpValue || def.xp || 1;
  if (xp > 0) spawnXpOrb(state, ent.x, ent.z, xp);
  const coinChance = def.coinChance || 0;
  if (coinChance > 0 && state.rng.next() < coinChance) {
    spawnPickup(state, 'coin', ent.x + 0.3, ent.z, 1 + ((def.tier | 0) > 2 ? 1 : 0));
  }
  if (state.rng.next() < HEAL_DROP_CHANCE) {
    spawnPickup(state, 'heal', ent.x - 0.3, ent.z, 2 + (def.tier | 0));
  }
  if (ent.elite && ent.elite.dropCrate !== false) {
    spawnPickup(state, 'crate', ent.x, ent.z + 0.3, 1);
  }
  if (ent.isBoss) {
    // Bosses shower the arena in bananas and a heal.
    for (let i = 0; i < 6; i++) {
      const a = state.rng.next() * Math.PI * 2;
      spawnPickup(state, 'coin', ent.x + Math.cos(a) * 1.2, ent.z + Math.sin(a) * 1.2, 3);
    }
    spawnPickup(state, 'heal', ent.x, ent.z, Math.max(3, Math.round((state.players[0].stats.maxHp || 15) * 0.2)));
  }
}

// ---------------------------------------------------------------------------
// Coins (canonical gain path — effects, harvest, crates all come through here)
// ---------------------------------------------------------------------------

/** Add coins (multiplier-adjusted), emit 'coin:gain'. Returns amount added. */
export function gainCoins(state, amount, x, z) {
  if (!(amount > 0)) return 0;
  const p = state.players[0];
  let mult = 1 + ((p && p.stats.coinGain) || 0) / 100;
  mult *= state.modeRules.coinMult || 1;
  if (state.chaosMod && state.chaosMod.coinMult) mult *= state.chaosMod.coinMult;
  const gained = Math.max(1, Math.round(amount * mult));
  state.coins += gained;
  state.runStats.coinsEarned += gained;
  COIN_EV.amount = gained;
  state.bus.emit('coin:gain', COIN_EV);
  return gained;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function emitCollect(state, ptype, value, x, z) {
  COLLECT_EV.ptype = ptype;
  COLLECT_EV.value = value;
  COLLECT_EV.x = x;
  COLLECT_EV.z = z;
  state.bus.emit('pickup:collect', COLLECT_EV);
}

function randomCrateItem(state) {
  const items = Content.items;
  // Common (rarity 0) and Rare (rarity 1) only.
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const r = items[i].rarity | 0;
    if (r <= 1) count++;
  }
  if (count === 0) return null;
  let pick = state.rng.int(0, count - 1);
  for (let i = 0; i < items.length; i++) {
    const r = items[i].rarity | 0;
    if (r <= 1 && pick-- === 0) return items[i];
  }
  return null;
}

function collect(state, player, p) {
  const ptype = p.ptype;
  const value = p.value;
  emitCollect(state, ptype, value, p.x, p.z);
  switch (ptype) {
    case 'xp': {
      grantXp(state, player, value);
      fireTriggerFast('onPickupXp', player, state, null, value, null);
      break;
    }
    case 'coin': {
      gainCoins(state, value, p.x, p.z);
      fireTriggerFast('onPickupCoin', player, state, null, value, null);
      break;
    }
    case 'crate': {
      gainCoins(state, CRATE_COINS, p.x, p.z);
      const item = randomCrateItem(state);
      if (item) {
        addItem(state, player, item);
        state.runStats.buildLog.push({ wave: state.wave, kind: 'crate-item', id: item.id });
      }
      fireTriggerFast('onPickupCoin', player, state, null, CRATE_COINS, null);
      break;
    }
    case 'heal': {
      healPlayer(state, player, value);
      break;
    }
    default:
      break;
  }
  release(state.stores.pickups, p);
}

/** Per-step: magnet + collect + expiry. */
export function updatePickups(state, dt) {
  const all = state.stores.pickups.all;
  const players = state.players;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (!p.active) continue;
    p.age += dt;
    if (p.ttl > 0 && p.age >= p.ttl) {
      release(state.stores.pickups, p);
      continue;
    }
    for (let j = 0; j < players.length; j++) {
      const pl = players[j];
      if (!pl.alive) continue;
      // Heal fruit waits on the ground until the ape is actually hurt.
      if (p.ptype === 'heal' && pl.hp >= pl.stats.maxHp) continue;
      const dx = pl.x - p.x;
      const dz = pl.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= COLLECT_DIST * COLLECT_DIST) {
        collect(state, pl, p);
        break;
      }
      const magnet = DERIVED.pickupRadius(pl.stats);
      if (d2 <= magnet * magnet) {
        const d = Math.sqrt(d2) || 1;
        p.x += (dx / d) * MAGNET_SPEED * dt;
        p.z += (dz / d) * MAGNET_SPEED * dt;
        break; // one magnet at a time
      }
    }
  }
}

/**
 * Vacuum every remaining xp/coin/heal/crate pickup into player 0 (wave end).
 */
export function collectAllPickups(state) {
  const player = state.players[0];
  if (!player || !player.alive) return;
  const all = state.stores.pickups.all;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (p.active) collect(state, player, p);
  }
}

/** Banana-rain modes: periodically drop XP bananas around the arena. */
export function tickBananaRain(state, dt) {
  state._rainAcc = (state._rainAcc || 0) + dt;
  if (state._rainAcc < 1.1) return;
  state._rainAcc -= 1.1;
  const x = (state.rng.next() - 0.5) * (state.arenaW - 3);
  const z = (state.rng.next() - 0.5) * (state.arenaH - 3);
  spawnXpOrb(state, x, z, 1);
  state.renderApi.vfx('telegraph', x, z, { radius: 0.4, duration: 0.3 });
}

/** Release every pickup (run teardown). */
export function clearPickups(state) {
  state.stores.pickups.pool.reset();
}
