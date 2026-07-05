// APETATO game/shoplogic — between-wave shop stock, prices, rerolls, locks.
//
// 4 slots, ~55% items / 45% weapons (weapons only offered while a slot is
// free or a merge is possible). Rarity weights per wave:
//   common    max(5, 100 - wave*4)
//   rare      25 + wave*2
//   epic      wave>=3  ? (wave-2)*2.5 : 0
//   legendary wave>=7  ? (wave-6)*1.5 : 0
//   mythic    wave>=12 ? (wave-11)*0.8 : 0
// non-common weights * (1 + luck/100).
//
// Price = round(basePrice * (1 + 0.10*(wave-1)) * character.shopPriceMult),
// floored per rarity at 12/25/55/95/160. Reroll = 2 + floor(wave*0.8),
// +50% compounding per reroll this visit (ceil). Locks persist through
// rerolls AND into the next wave. Sell = 70% of paid.

import { Content } from '../content/registry.js';
import { addItem, removeItemAt } from './player.js';
import { addWeapon, removeWeaponAt } from './weapons.js';
import { gainCoins } from './pickups.js';

const SLOTS = 4;
const ITEM_CHANCE = 0.55;
const SELL_RATE = 0.7;
const RARITY_FLOORS = [12, 25, 55, 95, 160];

const OPEN_EV = { wave: 0, stock: null };
const BUY_EV = { kind: '', id: '', price: 0 };
const REROLL_EV = { cost: 0 };
const SPEND_EV = { amount: 0, total: 0 };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Per-run shop record (slots persist between waves so locks carry over). */
export function createShopState() {
  const slots = new Array(SLOTS);
  for (let i = 0; i < SLOTS; i++) {
    slots[i] = { kind: '', def: null, price: 0, locked: false, sold: true };
  }
  return { slots, rerolls: 0, open: false };
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

function rarityWeight(state, player, rarity) {
  const w = state.wave;
  let base;
  switch (rarity) {
    case 0:
      return Math.max(5, 100 - w * 4);
    case 1:
      base = 25 + w * 2;
      break;
    case 2:
      base = w >= 3 ? (w - 2) * 2.5 : 0;
      break;
    case 3:
      base = w >= 7 ? (w - 6) * 1.5 : 0;
      break;
    case 4:
      base = w >= 12 ? (w - 11) * 0.8 : 0;
      break;
    default:
      base = 0;
  }
  return base * (1 + ((player && player.stats.luck) || 0) / 100);
}

function priceFor(state, player, basePrice, rarity) {
  const mult = (player.character && player.character.shopPriceMult) || 1;
  const p = Math.round((basePrice || 10) * (1 + 0.1 * (state.wave - 1)) * mult);
  const floor = RARITY_FLOORS[Math.max(0, Math.min(4, rarity | 0))];
  return Math.max(p, floor);
}

function alreadyOffered(shop, def) {
  for (let i = 0; i < SLOTS; i++) {
    if (!shop.slots[i].sold && shop.slots[i].def === def) return true;
  }
  return false;
}

function itemWeight(state, player, shop, item) {
  if (alreadyOffered(shop, item)) return 0;
  const maxStacks = item.maxStacks === undefined ? -1 : item.maxStacks;
  if (maxStacks !== -1 && (player.items.get(item.id) || 0) >= maxStacks) return 0;
  return rarityWeight(state, player, item.rarity | 0) * (item.weight || 1);
}

function weaponAllowed(state, player, def) {
  const rules = state.modeRules;
  const limit =
    rules.weaponSlots !== null && rules.weaponSlots !== undefined
      ? rules.weaponSlots
      : (player.character && player.character.weaponSlots) || 6;
  if (player.weapons.length < limit) return true;
  // Full — only mergeable copies are sellable stock.
  const base = (def.tier | 0) || 1;
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i];
    if (w.def.id === def.id && w.tier === base && w.tier < 4) return true;
  }
  return false;
}

function weaponWeight(state, player, shop, def, targetTier) {
  if (alreadyOffered(shop, def)) return 0;
  if (((def.tier | 0) || 1) !== targetTier) return 0;
  if (!weaponAllowed(state, player, def)) return 0;
  return 1;
}

function rollWeaponTier(state, player) {
  // Reuse the rarity ladder: rarity r maps to weapon tier r+1 (capped 4).
  let total = 0;
  for (let r = 0; r < 4; r++) total += rarityWeight(state, player, r);
  let roll = state.rng.next() * total;
  for (let r = 0; r < 4; r++) {
    roll -= rarityWeight(state, player, r);
    if (roll < 0) return r + 1;
  }
  return 1;
}

const ITEM_W = (item) => ITEM_W_CTX.state && itemWeight(ITEM_W_CTX.state, ITEM_W_CTX.player, ITEM_W_CTX.shop, item);
const WEAP_W = (def) =>
  WEAP_W_CTX.state && weaponWeight(WEAP_W_CTX.state, WEAP_W_CTX.player, WEAP_W_CTX.shop, def, WEAP_W_CTX.tier);
const ITEM_W_CTX = { state: null, player: null, shop: null };
const WEAP_W_CTX = { state: null, player: null, shop: null, tier: 1 };

function rollSlot(state, player, shop, slot) {
  slot.sold = false;
  slot.locked = false;
  const canWeapon = anyWeaponAllowed(state, player);
  const wantItem = !canWeapon || state.rng.next() < ITEM_CHANCE || Content.weapons.length === 0;

  if (!wantItem) {
    WEAP_W_CTX.state = state;
    WEAP_W_CTX.player = player;
    WEAP_W_CTX.shop = shop;
    WEAP_W_CTX.tier = rollWeaponTier(state, player);
    let def = state.rng.weightedPick(Content.weapons, WEAP_W);
    if (!def || !weaponAllowed(state, player, def)) {
      WEAP_W_CTX.tier = 1;
      def = state.rng.weightedPick(Content.weapons, WEAP_W);
    }
    WEAP_W_CTX.state = null;
    if (def && weaponAllowed(state, player, def)) {
      slot.kind = 'weapon';
      slot.def = def;
      slot.price = priceFor(state, player, def.basePrice, ((def.tier | 0) || 1) - 1);
      return;
    }
  }

  ITEM_W_CTX.state = state;
  ITEM_W_CTX.player = player;
  ITEM_W_CTX.shop = shop;
  const item = state.rng.weightedPick(Content.items, ITEM_W);
  ITEM_W_CTX.state = null;
  if (item) {
    slot.kind = 'item';
    slot.def = item;
    slot.price = priceFor(state, player, item.basePrice, item.rarity | 0);
  } else {
    slot.kind = '';
    slot.def = null;
    slot.sold = true;
  }
}

function anyWeaponAllowed(state, player) {
  const rules = state.modeRules;
  const limit =
    rules.weaponSlots !== null && rules.weaponSlots !== undefined
      ? rules.weaponSlots
      : (player.character && player.character.weaponSlots) || 6;
  if (player.weapons.length < limit) return true;
  for (let i = 0; i < player.weapons.length; i++) {
    const w = player.weapons[i];
    if (w.tier < 4 && w.tier === ((w.def.tier | 0) || 1)) return true; // merge path
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public shop operations (run.js wraps these into game.shop)
// ---------------------------------------------------------------------------

export function baseRerollCost(state) {
  return 2 + Math.floor(state.wave * 0.8);
}

export function currentRerollCost(state) {
  let cost = baseRerollCost(state);
  for (let i = 0; i < state.shop.rerolls; i++) cost = Math.ceil(cost * 1.5);
  return cost;
}

/** Open the shop for the current wave: reroll unlocked slots, keep locks. */
export function openShop(state) {
  const shop = state.shop;
  const player = state.players[0];
  shop.rerolls = 0;
  shop.open = true;
  for (let i = 0; i < SLOTS; i++) {
    const slot = shop.slots[i];
    if (slot.locked && !slot.sold && slot.def) continue; // lock persists into next wave
    rollSlot(state, player, shop, slot);
  }
  OPEN_EV.wave = state.wave;
  OPEN_EV.stock = shop.slots;
  state.bus.emit('shop:open', OPEN_EV);
  OPEN_EV.stock = null;
}

export function getStock(state) {
  return state.shop.slots;
}

export function buy(state, slotIdx) {
  const shop = state.shop;
  const slot = shop.slots[slotIdx];
  if (!slot || slot.sold || !slot.def) return false;
  if (state.coins < slot.price) return false;
  const player = state.players[0];

  if (slot.kind === 'weapon') {
    const res = addWeapon(state, player, slot.def);
    if (!res.ok) return false;
    if (res.weapon) res.weapon._paid = slot.price;
  } else {
    if (!addItem(state, player, slot.def, slot.price)) return false;
    state.runStats.buildLog.push({ wave: state.wave, kind: 'item', id: slot.def.id });
  }

  state.coins -= slot.price;
  slot.sold = true;
  slot.locked = false;
  BUY_EV.kind = slot.kind;
  BUY_EV.id = slot.def.id;
  BUY_EV.price = slot.price;
  state.bus.emit('shop:buy', BUY_EV);
  SPEND_EV.amount = slot.price;
  SPEND_EV.total = state.coins;
  state.bus.emit('coin:spend', SPEND_EV);
  return true;
}

/** Sell owned gear: kind 'weapon' (by weapons index) or 'item' (by order). */
export function sell(state, kind, idx) {
  const player = state.players[0];
  if (kind === 'weapon') {
    const w = player.weapons[idx];
    if (!w) return false;
    const paid = w._paid !== undefined && w._paid > 0 ? w._paid : w.def.basePrice || 0;
    removeWeaponAt(state, player, idx);
    const refund = Math.floor(paid * SELL_RATE);
    if (refund > 0) {
      state.coins += refund; // direct refund — no coinGain multipliers on sales
      state.bus.emit('coin:gain', { amount: refund });
    }
    return true;
  }
  if (kind === 'item') {
    const res = removeItemAt(state, player, idx);
    if (!res) return false;
    const refund = Math.floor((res.paid || 0) * SELL_RATE);
    if (refund > 0) {
      state.coins += refund;
      state.bus.emit('coin:gain', { amount: refund });
    }
    return true;
  }
  return false;
}

export function reroll(state) {
  const shop = state.shop;
  const cost = currentRerollCost(state);
  if (state.coins < cost) return false;
  state.coins -= cost;
  shop.rerolls++;
  const player = state.players[0];
  for (let i = 0; i < SLOTS; i++) {
    const slot = shop.slots[i];
    if (slot.locked && !slot.sold && slot.def) continue;
    rollSlot(state, player, shop, slot);
  }
  REROLL_EV.cost = cost;
  state.bus.emit('shop:reroll', REROLL_EV);
  SPEND_EV.amount = cost;
  SPEND_EV.total = state.coins;
  state.bus.emit('coin:spend', SPEND_EV);
  return true;
}

export function toggleLock(state, slotIdx) {
  const slot = state.shop.slots[slotIdx];
  if (!slot || slot.sold || !slot.def) return false;
  slot.locked = !slot.locked;
  return true;
}

/** Mark closed + emit (the wave transition itself lives in run.js). */
export function closeShop(state) {
  if (!state.shop.open) return;
  state.shop.open = false;
  state.bus.emit('shop:close', { wave: state.wave });
}
