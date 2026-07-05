// APETATO ui/characterSelect — pick your ape.
// Grid of all characters (locked ones show a silhouette + unlock hint), with
// a detail panel: live 3D model preview (renderApi.buildPreview), stat mods,
// passive descriptions, and the starting weapon. Buy-gated apes get a
// "Buy for N 🍌" button (golden bananas, via meta.buyUnlock), and a compact
// Armory strip below the grid sells buy-gated weapon unlocks the same way.
//
// Mount payload (optional): { modeId, from } — set by the Challenges screen
// so Continue preselects that mode and Back returns to Challenges.

import {
  el, mount, clear, btn, fmtInt, statModsList, unlockHint, contentList, contentById,
} from './dom.js';
import { Content } from '../content/registry.js';

export function createCharacterSelect(ctx) {
  const { bus, states, save, renderApi, meta, nav } = ctx;

  let screen = null;
  let disposePreview = null;
  let selectedId = null;
  let cardsById = new Map();
  let detail = null;
  let continueBtn = null;
  let rootEl = null;
  let lastPayload = null;

  function unlockedSet() {
    const ids = new Set();
    const fromSave =
      save && save.data && save.data.unlocked && Array.isArray(save.data.unlocked.characters)
        ? save.data.unlocked.characters
        : [];
    for (const id of fromSave) ids.add(id);
    for (const c of contentList(Content, 'characters')) {
      if (c && c.unlock && c.unlock.type === 'default') ids.add(c.id);
    }
    return ids;
  }

  /** Humanize a passive DSL entry ({trigger, chance, do:[...]}) for display. */
  function describePassive(p) {
    if (!p) return '';
    if (typeof p === 'string') return p;
    if (p.description) return p.description;

    const TRIGGERS = {
      onTakeDamage: 'When hit',
      onKill: 'On kill',
      onHit: 'On hit',
      onCrit: 'On crit',
      onDodge: 'On dodge',
      interval: p.interval ? `Every ${p.interval}s` : 'Periodically',
      waveStart: 'At wave start',
      waveEnd: 'At wave end',
      onPickup: 'On pickup',
      lowHp: 'At low HP',
    };
    const OPS = {
      shield: (d) => `gain ${d.amount || '?'} shield`,
      heal: (d) => `heal ${d.amount || '?'} HP`,
      projectile: (d) => `fire ${d.count || 1} bonus projectile${(d.count || 1) > 1 ? 's' : ''}`,
      status: (d) => `apply ${d.status || 'a status'}${d.target === 'area' ? ' nearby' : ''}`,
      explode: (d) => `explode for ${d.damage || '?'} dmg`,
      coins: (d) => `gain ${d.amount || '?'} coins`,
      buff: (d) => `gain a short buff`,
      slow: () => 'slow enemies',
      knockback: () => 'knock enemies back',
      summon: (d) => `summon ${d.what || 'an ally'}`,
    };

    const when = TRIGGERS[p.trigger] || p.trigger || 'Sometimes';
    const chance = typeof p.chance === 'number' && p.chance < 100 ? `${p.chance}% chance to ` : '';
    const actions = Array.isArray(p.do)
      ? p.do
          .map((d) => {
            const fn = d && OPS[d.op];
            return fn ? fn(d) : d && d.op ? d.op.replace(/_/g, ' ') : '';
          })
          .filter(Boolean)
          .join(', ')
      : '';
    return `${when}: ${chance}${actions || 'something wonderful happens'}`;
  }

  function goldenBananas() {
    return (save && save.data && Number(save.data.goldenBananas)) || 0;
  }

  /**
   * Rebuild the whole screen in place (after a purchase) and restore the
   * selection + keyboard focus. unlockedSet() re-reads the save, so newly
   * bought entries render (and become selectable) immediately.
   */
  function rebuild(keepId, focusUiId) {
    const root = rootEl;
    const payload = lastPayload;
    unmount();
    mountScreen(root, payload);
    if (keepId) select(keepId);
    const target =
      (focusUiId && screen && screen.querySelector(`[data-ui-id="${focusUiId}"]`)) ||
      (keepId && cardsById.get(keepId)) || null;
    if (target && !target.disabled) target.focus({ preventScroll: false });
  }

  /**
   * Spend golden bananas on a buy-gated unlock via meta.buyUnlock.
   * On failure (not enough bananas / no meta wired) pings 'ui:deny' and
   * shows inline feedback next to the triggering button.
   */
  function tryBuy(kind, id, feedbackEl, focusUiId) {
    const ok = !!(meta && typeof meta.buyUnlock === 'function' && meta.buyUnlock(kind, id));
    if (ok) {
      rebuild(kind === 'characters' ? id : selectedId, focusUiId);
      return;
    }
    if (bus) bus.emit('ui:deny', { kind, id });
    if (feedbackEl) {
      feedbackEl.textContent = 'Not enough golden bananas!';
      feedbackEl.classList.add('deny');
    }
  }

  function select(id) {
    selectedId = id;
    for (const [cid, card] of cardsById) card.classList.toggle('selected', cid === id);
    renderDetail();
  }

  function renderDetail() {
    if (!detail) return;
    clear(detail);
    if (disposePreview) {
      try { disposePreview(); } catch (err) { console.error('[ui] preview dispose:', err); }
      disposePreview = null;
    }

    const def = contentById(Content, 'characters', selectedId);
    if (!def) {
      mount(detail, el('div', 'empty-note', 'Pick an ape from the grid.'));
      if (continueBtn) continueBtn.disabled = true;
      return;
    }
    const isUnlocked = unlockedSet().has(def.id);

    mount(detail, el('div', 'panel-title', def.name || def.id));
    const preview = mount(detail, el('div', 'char-preview'));
    if (isUnlocked && renderApi && typeof renderApi.buildPreview === 'function' && def.model) {
      try {
        disposePreview = renderApi.buildPreview(def.model, preview);
      } catch (err) {
        console.error('[ui] buildPreview failed:', err);
        mount(preview, el('div', '', '🐵'));
      }
    } else {
      const silhouette = mount(preview, el('div', '', '🙈'));
      silhouette.style.fontSize = '4em';
      silhouette.style.filter = 'grayscale(1) brightness(0.4)';
    }

    if (!isUnlocked) {
      const unlock = def.unlock || {};
      if (unlock.type === 'buy') {
        // Spendable unlock: show the price + a live Buy button.
        const cost = Number(unlock.cost) || 0;
        const row = mount(detail, el('div', 'buy-row'));
        const buyBtn = mount(row, btn(`Buy for ${cost} 🍌`, 'primary', () => {
          tryBuy('characters', def.id, feedback, 'char_' + def.id);
        }));
        buyBtn.dataset.uiId = 'buy_char_' + def.id;
        buyBtn.disabled = goldenBananas() < cost;
        const feedback = mount(row, el('div', 'buy-feedback',
          goldenBananas() < cost ? `You have ${fmtInt(goldenBananas())} 🍌` : ''));
        if (goldenBananas() < cost) feedback.classList.add('deny');
      } else {
        // wins / achievement gated: hint only, nothing to buy.
        mount(detail, el('div', 'passive-line', `🔒 ${unlockHint(def.unlock) || 'Locked'}`));
      }
    }

    mount(detail, el('div', 'detail-desc', def.description || ''));

    mount(detail, el('div', 'detail-section-title', 'Stats'));
    mount(detail, statModsList(def.statMods));

    mount(detail, el('div', 'detail-section-title', 'Passives'));
    const passives = Array.isArray(def.passives) ? def.passives : [];
    if (passives.length === 0) mount(detail, el('div', 'detail-desc', 'None. Pure muscle.'));
    for (const p of passives) mount(detail, el('div', 'passive-line', describePassive(p)));

    mount(detail, el('div', 'detail-section-title', 'Starting weapon'));
    const weapon = contentById(Content, 'weapons', def.startingWeaponId);
    mount(detail, el('div', 'passive-line', weapon ? weapon.name : def.startingWeaponId || '?'));
    mount(detail, el(
      'div', 'detail-desc',
      `Weapon slots: ${typeof def.weaponSlots === 'number' ? def.weaponSlots : '?'}`
    ));

    if (continueBtn) continueBtn.disabled = !isUnlocked;
  }

  /** Compact strip of meta-unlockable (non-default) weapons below the grid. */
  function buildArmory(parent) {
    const gated = contentList(Content, 'weapons').filter(
      (w) => w && w.unlock && w.unlock.type !== 'default'
    );
    if (gated.length === 0) return;

    const unlockedWeapons = new Set(
      save && save.data && save.data.unlocked && Array.isArray(save.data.unlocked.weapons)
        ? save.data.unlocked.weapons
        : []
    );

    const panel = mount(parent, el('div', 'panel armory-panel'));
    mount(panel, el('div', 'detail-section-title', 'Armory — weapon unlocks'));

    for (const def of gated) {
      const owned = unlockedWeapons.has(def.id);
      const row = mount(panel, el('div', 'owned-weapon armory-row'));
      mount(row, el('span', 'wn', (owned ? '✓ ' : '') + (def.name || def.id)));
      if (owned) {
        mount(row, el('span', 'tier', 'Unlocked'));
      } else if (def.unlock.type === 'buy') {
        const cost = Number(def.unlock.cost) || 0;
        const buyBtn = mount(row, btn(`Buy for ${cost} 🍌`, 'sell-btn', () => {
          tryBuy('weapons', def.id, null, 'buy_weapon_' + def.id);
        }));
        buyBtn.dataset.uiId = 'buy_weapon_' + def.id;
        buyBtn.disabled = goldenBananas() < cost;
        if (buyBtn.disabled) buyBtn.title = `Not enough golden bananas (you have ${fmtInt(goldenBananas())})`;
      } else {
        mount(row, el('span', 'lock-hint', `🔒 ${unlockHint(def.unlock) || 'Locked'}`));
      }
    }
  }

  function mountScreen(root, payload) {
    rootEl = root;
    lastPayload = payload || null;
    const modeId = lastPayload && lastPayload.modeId;
    const backTarget = lastPayload && lastPayload.from === 'CHALLENGES'
      ? () => states.set('MODE_SELECT', { uiScreen: 'challenges' })
      : () => states.set('MENU');

    screen = mount(root, el('div', 'ui-screen'));
    cardsById = new Map();

    // Golden banana balance, top-right (rebuilt from the save after buys).
    const balance = mount(screen, el('div', 'banana-balance golden'));
    mount(balance, el('span', 'banana-icon'));
    mount(balance, el('span', '', fmtInt(goldenBananas())));
    balance.title = 'Golden Bananas';

    mount(screen, el('div', 'screen-heading', 'Choose your ape'));
    if (modeId) {
      const modeDef = contentById(Content, 'modes', modeId);
      mount(screen, el('div', 'screen-sub', `Challenge: ${modeDef ? modeDef.name : modeId}`));
    }

    const body = mount(screen, el('div', 'screen-body'));
    const leftCol = mount(body, el('div', 'char-left'));
    const grid = mount(leftCol, el('div', 'char-grid'));
    buildArmory(leftCol);
    const detailPanel = mount(body, el('div', 'panel char-detail'));
    detail = detailPanel;

    const unlocked = unlockedSet();
    const characters = contentList(Content, 'characters');
    let firstUnlockedId = null;

    for (const def of characters) {
      if (!def || !def.id) continue;
      const isUnlocked = unlocked.has(def.id);
      if (isUnlocked && !firstUnlockedId) firstUnlockedId = def.id;

      const card = el('button', 'char-card' + (isUnlocked ? '' : ' locked'));
      card.type = 'button';
      card.dataset.uiId = 'char_' + def.id;
      mount(card, el('div', 'char-face', isUnlocked ? '🐵' : '?'));
      mount(card, el('div', 'char-name', isUnlocked ? def.name || def.id : '???'));
      if (!isUnlocked) mount(card, el('div', 'lock-hint', unlockHint(def.unlock)));
      card.addEventListener('click', () => select(def.id));
      cardsById.set(def.id, mount(grid, card));
    }

    if (characters.length === 0) {
      mount(grid, el('div', 'empty-note', 'No characters found in the content registry.'));
    }

    const actions = mount(screen, el('div', 'screen-actions'));
    mount(actions, btn('◄ Back', '', backTarget));
    continueBtn = mount(actions, btn('Continue ►', 'primary big', () => {
      if (selectedId && unlockedSet().has(selectedId)) {
        const next = { characterId: selectedId };
        if (modeId) next.modeId = modeId; // challenge flow: preselect the mode
        states.set('MODE_SELECT', next);
      }
    }));

    const hints = mount(screen, el('div', 'hint-bar'));
    hints.append('Move ');
    mount(hints, el('b', '', '↑↓←→'));
    hints.append(' Select ');
    mount(hints, el('b', '', 'Enter'));
    hints.append(' Back ');
    mount(hints, el('b', '', 'Esc'));

    select(firstUnlockedId || (characters[0] && characters[0].id) || null);

    // Focus the selected card first for immediate keyboard nav.
    const selCard = cardsById.get(selectedId);
    if (selCard) selCard.classList.add('autofocus');

    nav.setBack(backTarget);
  }

  function unmount() {
    if (disposePreview) {
      try { disposePreview(); } catch (err) { console.error('[ui] preview dispose:', err); }
      disposePreview = null;
    }
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
    detail = null;
    continueBtn = null;
    cardsById = new Map();
  }

  return { mount: mountScreen, unmount };
}
