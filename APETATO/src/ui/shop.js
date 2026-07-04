// APETATO ui/shop — between-wave shop.
// 4 stock cards (items + weapons), reroll with cost, per-card lock toggles,
// owned panel (weapons sellable, item stacks) and the full 28-stat sheet.
// Fully re-renders on 'shop:buy' / 'shop:reroll' / 'stats:recomputed'.

import {
  el, mount, clear, btn, statModsList, statLabel, fmtStatVal,
  rarityName, rarityColor, contentById,
} from './dom.js';
import { STAT_KEYS } from '../core/statmodel.js';
import { Content } from '../content/registry.js';

export function createShop(ctx) {
  const { bus, game, nav } = ctx;

  let screen = null;
  let coinsEl = null;
  let nextWaveEl = null;
  let stockRow = null;
  let rerollBtn = null;
  let ownedPanel = null;
  let statsPanel = null;
  const unsubs = [];

  // ------------------------------------------------------------ helpers ---

  function getState() {
    try {
      return game && typeof game.getState === 'function' ? game.getState() : null;
    } catch (err) {
      return null;
    }
  }

  function getStock() {
    try {
      const s = game.shop.getStock();
      if (Array.isArray(s)) return s;
      if (s && Array.isArray(s.stock)) return s.stock;
    } catch (err) {
      console.error('[ui] shop.getStock failed:', err);
    }
    return [];
  }

  function rerollCost() {
    const shop = game && game.shop;
    if (!shop) return null;
    try {
      if (typeof shop.getRerollCost === 'function') return Number(shop.getRerollCost());
      if (typeof shop.rerollCost === 'number') return shop.rerollCost;
    } catch (err) { /* optional API */ }
    return null;
  }

  /** Normalize one stock entry regardless of the exact game-side shape. */
  function normalizeOffer(raw) {
    if (!raw) return null;
    const def = raw.def || raw.item || raw.weapon || (raw.id ? raw : null);
    if (!def) return null;
    const kind = raw.kind || (Array.isArray(def.classes) ? 'weapon' : 'item');
    const price =
      typeof raw.price === 'number' ? raw.price
        : typeof raw.cost === 'number' ? raw.cost
          : typeof def.basePrice === 'number' ? def.basePrice : 0;
    return {
      def,
      kind,
      price,
      locked: !!(raw.locked || raw.lock),
      sold: !!(raw.sold || raw.bought || raw.purchased),
    };
  }

  function playerOf(state) {
    return (state && state.players && state.players[0]) || null;
  }

  /** [{def, stacks}] from the player's items Map (or object fallback). */
  function ownedItems(p) {
    const out = [];
    const items = p && p.items;
    if (!items) return out;
    const push = (key, val) => {
      let def = null;
      let stacks = 1;
      if (typeof val === 'number') {
        stacks = val;
        def = contentById(Content, 'items', key);
      } else if (val && typeof val === 'object') {
        def = val.def || contentById(Content, 'items', key);
        stacks = typeof val.stacks === 'number' ? val.stacks : typeof val.count === 'number' ? val.count : 1;
      }
      out.push({ id: key, def, stacks });
    };
    if (typeof items.forEach === 'function' && typeof items.get === 'function') {
      items.forEach((val, key) => push(key, val));
    } else if (typeof items === 'object') {
      for (const key of Object.keys(items)) push(key, items[key]);
    }
    return out;
  }

  function ownsSameIdTier(p, def, tier) {
    const weapons = (p && p.weapons) || [];
    for (const w of weapons) {
      const wd = (w && w.def) || w;
      const wt = (w && typeof w.tier === 'number') ? w.tier : 1;
      if (wd && wd.id === def.id && wt === tier) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- render ---

  function renderStock() {
    if (!stockRow) return;
    clear(stockRow);

    const state = getState();
    const coins = Math.floor((state && state.coins) || 0);
    const p = playerOf(state);
    const stock = getStock();

    stock.slice(0, 4).forEach((raw, i) => {
      const offer = normalizeOffer(raw);
      const card = el('div', 'shop-card');
      if (!offer) {
        card.classList.add('sold');
        mount(card, el('div', 'card-name', 'Sold out'));
        mount(stockRow, card);
        return;
      }
      const { def, kind, price, locked, sold } = offer;
      const rarity = typeof def.rarity === 'number' ? def.rarity : kind === 'weapon' ? (def.tier || 1) - 1 : 0;
      card.style.setProperty('--rar', rarityColor(rarity));
      if (sold) card.classList.add('sold');

      const top = mount(card, el('div', 'card-top'));
      mount(top, el('div', 'card-name', def.name || def.id));
      mount(top, el('div', 'card-rarity', kind === 'weapon' ? `Tier ${def.tier || 1}` : rarityName(rarity)));

      if (kind === 'weapon') {
        const tags = mount(card, el('div', 'class-tags'));
        for (const c of def.classes || []) mount(tags, el('span', 'class-tag', c));
        const stats = def.stats || {};
        if (typeof stats.damage === 'number' && typeof stats.cooldown === 'number' && stats.cooldown > 0) {
          const dps = stats.damage / stats.cooldown;
          mount(card, el('div', 'card-meta', `~${Math.round(dps * 10) / 10} DPS  (${stats.damage} dmg / ${stats.cooldown}s)`));
        }
        const tier = def.tier || 1;
        if (p && ownsSameIdTier(p, def, tier)) {
          mount(card, el('div', 'merge-badge', 'MERGE'));
        }
      } else if (def.statMods) {
        mount(card, statModsList(def.statMods));
      }

      mount(card, el('div', 'card-desc', def.description || ''));

      const actions = mount(card, el('div', 'card-actions'));
      const canAfford = coins >= price;
      const buyLabel = sold ? 'Sold' : `Buy 🍌${price}`;
      const buy = btn(buyLabel, 'primary buy-btn', () => {
        try {
          game.shop.buy(i);
        } catch (err) {
          console.error('[ui] shop.buy failed:', err);
        }
        refreshAll('buy_' + i);
      });
      buy.dataset.uiId = 'buy_' + i;
      buy.disabled = sold || !canAfford;
      mount(actions, buy);

      const lock = btn(locked ? '🔒' : '🔓', 'lock-btn' + (locked ? ' locked' : ''), () => {
        try {
          game.shop.toggleLock(i);
        } catch (err) {
          console.error('[ui] shop.toggleLock failed:', err);
        }
        refreshAll('lock_' + i);
      });
      lock.dataset.uiId = 'lock_' + i;
      lock.title = locked ? 'Unlock (may reroll away)' : 'Lock (keep through rerolls)';
      if (sold) lock.disabled = true;
      mount(actions, lock);

      mount(stockRow, card);
    });

    if (stock.length === 0) {
      mount(stockRow, el('div', 'empty-note', 'The shopkeeper is out foraging…'));
    }

    if (coinsEl) coinsEl.textContent = `🍌 ${coins}`;
    if (nextWaveEl && state) nextWaveEl.textContent = `Next: Wave ${(state.wave || 0) + 1}`;
    if (rerollBtn) {
      const cost = rerollCost();
      rerollBtn.textContent = cost === null || Number.isNaN(cost) ? 'Reroll' : `Reroll 🍌${cost}`;
      rerollBtn.disabled = cost !== null && !Number.isNaN(cost) && coins < cost;
    }
  }

  function renderOwned() {
    if (!ownedPanel) return;
    clear(ownedPanel);
    mount(ownedPanel, el('div', 'panel-title', 'Your gear'));

    const p = playerOf(getState());
    const weapons = (p && p.weapons) || [];

    mount(ownedPanel, el('div', 'detail-section-title', `Weapons (${weapons.length})`));
    weapons.forEach((w, i) => {
      const def = (w && w.def) || w || {};
      const tier = (w && typeof w.tier === 'number') ? w.tier : 1;
      const row = mount(ownedPanel, el('div', 'owned-weapon'));
      mount(row, el('span', 'wn', def.name || def.id || '?'));
      mount(row, el('span', 'tier', '★'.repeat(Math.max(1, Math.min(4, tier)))));
      const sell = btn('Sell', 'sell-btn danger', () => {
        try {
          game.shop.sell('weapon', i);
        } catch (err) {
          console.error('[ui] shop.sell failed:', err);
        }
        refreshAll();
      });
      sell.dataset.uiId = 'sell_w_' + i;
      mount(row, sell);
    });
    if (weapons.length === 0) mount(ownedPanel, el('div', 'empty-note', 'Bare hands only.'));

    const items = ownedItems(p);
    mount(ownedPanel, el('div', 'detail-section-title', `Items (${items.length})`));
    for (const it of items) {
      const row = mount(ownedPanel, el('div', 'owned-item-line'));
      const name = (it.def && it.def.name) || it.id;
      const rar = it.def && typeof it.def.rarity === 'number' ? it.def.rarity : 0;
      const nameEl = mount(row, el('span', '', name));
      nameEl.style.color = rarityColor(rar);
      mount(row, el('span', 'stacks', it.stacks > 1 ? `×${it.stacks}` : ''));
    }
    if (items.length === 0) mount(ownedPanel, el('div', 'empty-note', 'No trinkets yet.'));
  }

  function renderStats() {
    if (!statsPanel) return;
    clear(statsPanel);
    mount(statsPanel, el('div', 'panel-title', 'Stats'));
    const p = playerOf(getState());
    const stats = (p && p.stats) || {};
    const wrap = mount(statsPanel, el('div', 'stat-mods'));
    for (const key of STAT_KEYS) {
      const v = typeof stats[key] === 'number' ? stats[key] : 0;
      const row = mount(wrap, el('div', 'stat-row'));
      mount(row, el('span', 'stat-name', statLabel(key)));
      const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
      const text = key === 'maxHp' ? String(Math.round(v)) : fmtStatVal(key, v);
      mount(row, el('span', 'stat-val ' + cls, text));
    }
  }

  /** Re-render everything, trying to keep keyboard focus on the same control. */
  function refreshAll(focusId) {
    const prevFocus =
      focusId ||
      (document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.uiId
        : null);
    renderStock();
    renderOwned();
    renderStats();
    if (prevFocus && screen) {
      const again = screen.querySelector(`[data-ui-id="${prevFocus}"]`);
      if (again && !again.disabled) again.focus();
    }
  }

  // -------------------------------------------------------------- mount ---

  function mountScreen(root) {
    screen = mount(root, el('div', 'ui-screen shop-screen'));

    const head = mount(screen, el('div', 'shop-head'));
    mount(head, el('div', 'screen-heading', 'Banana bazaar'));
    nextWaveEl = mount(head, el('div', 'screen-sub', ''));
    coinsEl = mount(head, el('div', 'coins', '🍌 0'));

    const body = mount(screen, el('div', 'shop-body'));

    const stockCol = mount(body, el('div', 'shop-stock'));
    stockRow = mount(stockCol, el('div', 'stock-row'));

    const bottom = mount(stockCol, el('div', 'shop-bottom'));
    rerollBtn = mount(bottom, btn('Reroll', '', () => {
      try {
        game.shop.reroll();
      } catch (err) {
        console.error('[ui] shop.reroll failed:', err);
      }
      refreshAll('reroll');
    }));
    rerollBtn.dataset.uiId = 'reroll';

    const cont = mount(bottom, btn('Continue ►', 'primary big autofocus', () => {
      try {
        game.shop.close();
      } catch (err) {
        console.error('[ui] shop.close failed:', err);
      }
    }));
    cont.dataset.uiId = 'shop_continue';

    const hints = mount(bottom, el('div', 'hint-bar'));
    hints.append('Move ');
    mount(hints, el('b', '', '↑↓←→'));
    hints.append(' Buy/Toggle ');
    mount(hints, el('b', '', 'Enter'));

    const side = mount(body, el('div', 'shop-side'));
    ownedPanel = mount(side, el('div', 'panel owned-panel'));
    statsPanel = mount(side, el('div', 'panel statsheet-panel'));

    refreshAll();

    unsubs.push(ctx.bus.on('shop:buy', () => refreshAll()));
    unsubs.push(ctx.bus.on('shop:reroll', () => refreshAll()));
    unsubs.push(ctx.bus.on('stats:recomputed', () => refreshAll()));

    // Esc jumps focus to Continue (deliberate double-press to leave the shop
    // instead of accidentally skipping the whole shopping phase).
    nav.setBack(() => {
      const c = screen && screen.querySelector('[data-ui-id="shop_continue"]');
      if (c) c.focus();
    });
  }

  function unmount() {
    while (unsubs.length) {
      const u = unsubs.pop();
      try { u(); } catch (err) { /* already gone */ }
    }
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
    coinsEl = nextWaveEl = stockRow = rerollBtn = ownedPanel = statsPanel = null;
  }

  return { mount: mountScreen, unmount };
}
