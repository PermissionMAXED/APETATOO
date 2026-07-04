// APETATO ui/hud — in-run heads-up display.
// HP/shield + level/XP (top-left), wave + countdown + optional speedrun timer
// (top-center, with boss bar), banana coins (top-right), weapon chips
// (bottom-left), synergy badges (bottom-right).
//
// Refreshes from game.getState() on a 100ms timer while visible (never per
// frame). Boss bar and synergy badges are event-driven via the bus.

import { el, mount, clear, fmtTime } from './dom.js';
import { Content } from '../content/registry.js';

const TICK_MS = 100;
const MAX_TIER_PIPS = 4;

export function createHud(ctx, layer) {
  const { bus, save, game } = ctx;

  const root = mount(layer, el('div', 'hud'));
  root.style.display = 'none';

  // --- top-left: HP + XP ---------------------------------------------------
  const topLeft = mount(root, el('div', 'hud-topleft'));

  const hpBar = mount(topLeft, el('div', 'bar hp'));
  const hpFill = mount(hpBar, el('div', 'fill'));
  const shieldFill = mount(hpBar, el('div', 'fill shield'));
  const hpText = mount(hpBar, el('div', 'bar-text'));

  const xpBar = mount(topLeft, el('div', 'bar xp'));
  const xpFill = mount(xpBar, el('div', 'fill'));
  const xpText = mount(xpBar, el('div', 'bar-text'));

  // --- top-center: wave / timers / boss ------------------------------------
  const topCenter = mount(root, el('div', 'hud-topcenter'));
  const waveLabel = mount(topCenter, el('div', 'wave-label', 'Wave 1'));
  const waveTimer = mount(topCenter, el('div', 'wave-timer', '0'));
  const speedrun = mount(topCenter, el('div', 'speedrun-timer', ''));

  const bossWrap = mount(topCenter, el('div', 'boss-bar-wrap'));
  const bossName = mount(bossWrap, el('div', 'boss-name', 'BOSS'));
  const bossBar = mount(bossWrap, el('div', 'bar boss'));
  const bossFill = mount(bossBar, el('div', 'fill'));
  bossWrap.style.display = 'none';

  // --- top-right: coins ----------------------------------------------------
  const coinsWrap = mount(root, el('div', 'hud-topright'));
  mount(coinsWrap, el('span', 'banana-icon'));
  const coinsText = mount(coinsWrap, el('span', '', '0'));

  // --- bottom-left: weapon chips / bottom-right: synergies ------------------
  const weaponsWrap = mount(root, el('div', 'hud-bottomleft'));
  const synergyWrap = mount(root, el('div', 'synergy-badges'));

  // ------------------------------------------------------------- state ----

  let visible = false;
  let timer = null;
  let bossActive = false;
  let bossLabel = 'BOSS';
  /** classId -> tier, from 'synergy:tier' events. */
  const synergyTiers = new Map();
  /** Cache of last weapon signature to avoid rebuilding chips every tick. */
  let weaponsSig = '';

  function synergyName(classId) {
    const list = Array.isArray(Content && Content.synergies) ? Content.synergies : [];
    for (const s of list) {
      if (s && (s.classId === classId || s.id === classId)) return s.name || classId;
    }
    return classId ? String(classId).charAt(0).toUpperCase() + String(classId).slice(1) : '?';
  }

  function renderSynergies() {
    clear(synergyWrap);
    const entries = [...synergyTiers.entries()].filter(([, t]) => t > 0);
    entries.sort((a, b) => b[1] - a[1]);
    for (const [cls, tier] of entries) {
      mount(synergyWrap, el('div', 'synergy-badge', `${synergyName(cls)} ${tier}`));
    }
  }

  function setBar(fillEl, frac) {
    const f = Math.max(0, Math.min(1, Number(frac) || 0));
    fillEl.style.transform = `scaleX(${f})`;
  }

  function xpNeeded(p) {
    for (const k of ['xpNext', 'xpToNext', 'xpNeeded', 'nextXp', 'xpMax']) {
      if (typeof p[k] === 'number' && p[k] > 0) return p[k];
    }
    return 0;
  }

  function renderWeapons(p) {
    const weapons = Array.isArray(p && p.weapons) ? p.weapons : [];
    let slots = 0;
    if (p && p.character && typeof p.character.weaponSlots === 'number') slots = p.character.weaponSlots;
    if (!slots && p && typeof p.weaponSlots === 'number') slots = p.weaponSlots;
    if (!slots) slots = Math.max(weapons.length, 1);

    const sig = slots + '|' + weapons
      .map((w) => (w && w.def ? w.def.id : w && w.id ? w.id : '?') + ':' + ((w && w.tier) || 1))
      .join(',');
    if (sig === weaponsSig) return;
    weaponsSig = sig;

    clear(weaponsWrap);
    for (let i = 0; i < slots; i++) {
      const w = weapons[i];
      if (!w) {
        const chip = mount(weaponsWrap, el('div', 'weapon-chip empty'));
        mount(chip, el('div', 'wname', '—'));
        continue;
      }
      const def = w.def || w;
      const tier = typeof w.tier === 'number' ? w.tier : 1;
      const chip = mount(weaponsWrap, el('div', 'weapon-chip'));
      mount(chip, el('div', 'wname', def.name || def.id || '?'));
      const pips = mount(chip, el('div', 'pips'));
      for (let t = 1; t <= MAX_TIER_PIPS; t++) {
        mount(pips, el('span', 'pip' + (t <= tier ? ' on' : '')));
      }
    }
  }

  function tick() {
    let state = null;
    try {
      state = game && typeof game.getState === 'function' ? game.getState() : null;
    } catch (err) {
      /* run not live yet */
    }
    if (!state) return;

    const p = (state.players && state.players[0]) || null;
    if (p) {
      const stats = p.stats || {};
      const maxHp = Math.max(1, stats.maxHp || 1);
      const hp = Math.max(0, p.hp || 0);
      const shield = Math.max(0, p.shield || 0);
      const hpFrac = Math.min(1, hp / maxHp);
      setBar(hpFill, hpFrac);
      // Shield segment sits right after the HP fill (clamped to the bar).
      const shieldFrac = Math.min(1 - hpFrac, shield / maxHp);
      shieldFill.style.transform = `translateX(${hpFrac * 100}%) scaleX(${shieldFrac})`;
      hpText.textContent =
        `${Math.ceil(hp)}/${Math.round(maxHp)}` + (shield > 0 ? ` +${Math.ceil(shield)}` : '');

      const level = p.level || 1;
      const xp = Math.max(0, p.xp || 0);
      const need = xpNeeded(p);
      setBar(xpFill, need > 0 ? xp / need : 0);
      xpText.textContent = `Lv ${level}` + (need > 0 ? ` · ${Math.floor(xp)}/${Math.round(need)}` : '');

      renderWeapons(p);
    }

    const wave = state.wave || 1;
    waveLabel.textContent = `Wave ${wave}`;
    const dur = Number(state.waveDuration) || 0;
    const t = Number(state.waveTime) || 0;
    const remain = dur > 0 ? Math.max(0, dur - t) : t;
    waveTimer.textContent = String(Math.ceil(remain));
    waveTimer.classList.toggle('low', dur > 0 && remain <= 5);

    const settings = (save && save.data && save.data.settings) || {};
    if (settings.showTimer && typeof state.speedrunSec === 'number') {
      speedrun.textContent = fmtTime(state.speedrunSec);
      speedrun.style.display = '';
    } else {
      speedrun.style.display = 'none';
    }

    coinsText.textContent = String(Math.floor(state.coins || 0));

    if (bossActive) {
      const boss = state.boss;
      if (boss) {
        const maxB = boss.maxHp || (boss.def && boss.def.hp) || boss.hpMax || 1;
        setBar(bossFill, Math.max(0, boss.hp || 0) / Math.max(1, maxB));
      }
    }
  }

  // ------------------------------------------------------ bus wiring ------

  bus.on('boss:spawn', (payload) => {
    bossActive = true;
    bossLabel =
      (payload && (payload.name || (payload.def && payload.def.name) || (payload.boss && payload.boss.name))) ||
      'BOSS';
    bossName.textContent = bossLabel;
    setBar(bossFill, 1);
    bossWrap.style.display = '';
  });

  bus.on('boss:death', () => {
    bossActive = false;
    bossWrap.style.display = 'none';
  });

  bus.on('synergy:tier', (payload) => {
    if (!payload) return;
    const cls = payload.classId || payload.class || payload.id;
    if (!cls) return;
    synergyTiers.set(cls, Number(payload.tier) || 0);
    renderSynergies();
  });

  bus.on('run:start', () => {
    synergyTiers.clear();
    renderSynergies();
    bossActive = false;
    bossWrap.style.display = 'none';
    weaponsSig = '';
    clear(weaponsWrap);
  });

  // ---------------------------------------------------------- control -----

  function setVisible(v) {
    if (v === visible) return;
    visible = v;
    root.style.display = v ? '' : 'none';
    if (v) {
      tick();
      if (timer === null) timer = setInterval(tick, TICK_MS);
    } else if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { setVisible, element: root };
}
