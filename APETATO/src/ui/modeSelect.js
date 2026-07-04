// APETATO ui/modeSelect — pick mode + arena, tweak a Custom Run, then start.
// Receives { characterId } via the MODE_SELECT state payload.

import {
  el, mount, clear, btn, todayKey, fmtInt, unlockHint, contentList, contentById,
} from './dom.js';
import { Content } from '../content/registry.js';

export function createModeSelect(ctx) {
  const { states, save, game, nav, session } = ctx;

  let screen = null;
  let characterId = null;
  let selectedModeId = null;
  let selectedArenaId = null;
  let modeCards = new Map();
  let arenaChips = new Map();
  let customPanel = null;
  let startBtn = null;

  const custom = {
    waves: 20,
    enemyHp: 1,
    enemyDmg: 1,
    spawn: 1,
    xp: 1,
    coin: 1,
    startCoins: 0,
    weaponSlots: 6,
    seed: '',
  };

  function unlockedModes() {
    const ids = new Set(
      save && save.data && save.data.unlocked && Array.isArray(save.data.unlocked.modes)
        ? save.data.unlocked.modes
        : []
    );
    return ids;
  }

  function unlockedArenas() {
    return new Set(
      save && save.data && save.data.unlocked && Array.isArray(save.data.unlocked.arenas)
        ? save.data.unlocked.arenas
        : []
    );
  }

  function isModeUnlocked(def) {
    if (!def) return false;
    if (unlockedModes().has(def.id)) return true;
    return !def.unlock || def.unlock.type === 'default';
  }

  function isArenaUnlocked(def) {
    if (!def) return false;
    if (unlockedArenas().has(def.id)) return true;
    return def.unlock && def.unlock.type === 'default';
  }

  /** One-line human summary of a ModeDef.rules object. */
  function rulesSummary(rules) {
    if (!rules || typeof rules !== 'object') return '';
    const bits = [];
    for (const k of Object.keys(rules)) {
      const v = rules[k];
      if (v === undefined || v === null || typeof v === 'object') continue;
      const label = k
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase());
      bits.push(`${label}: ${v}`);
      if (bits.length >= 4) break;
    }
    return bits.join(' · ');
  }

  function dailyBest() {
    const daily = save && save.data && save.data.daily;
    const entry = daily ? daily[todayKey()] : null;
    const entries = Array.isArray(entry)
      ? entry
      : entry && Array.isArray(entry.entries)
        ? entry.entries
        : entry && typeof entry === 'object'
          ? [entry]
          : [];
    let best = null;
    for (const e of entries) {
      const score = e && typeof e.score === 'number' ? e.score : null;
      if (score !== null && (best === null || score > best)) best = score;
    }
    return best;
  }

  function selectMode(id) {
    selectedModeId = id;
    for (const [mid, card] of modeCards) card.classList.toggle('selected', mid === id);
    if (customPanel) customPanel.style.display = id === 'custom' ? '' : 'none';
    if (startBtn) {
      const def = contentById(Content, 'modes', id);
      startBtn.disabled = !def || !isModeUnlocked(def);
    }
  }

  function selectArena(id) {
    selectedArenaId = id;
    for (const [aid, chip] of arenaChips) chip.classList.toggle('selected', aid === id);
  }

  function sliderRow(parent, label, min, max, step, value, onChange, fmt) {
    const row = mount(parent, el('div', 'form-row'));
    const lab = mount(row, el('label'));
    mount(lab, el('span', '', label));
    const valEl = mount(lab, el('span', 'form-val', fmt ? fmt(value) : String(value)));
    const input = mount(row, el('input'));
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      valEl.textContent = fmt ? fmt(v) : String(v);
      onChange(v);
    });
    return input;
  }

  function start() {
    const modeDef = contentById(Content, 'modes', selectedModeId);
    if (!modeDef || !isModeUnlocked(modeDef)) return;

    const cfg = {
      modeId: selectedModeId,
      characterId,
      arenaId: selectedArenaId,
    };
    if (selectedModeId === 'custom') {
      if (custom.seed.trim()) cfg.seed = custom.seed.trim();
      cfg.customRules = {
        waves: custom.waves,
        enemyHp: custom.enemyHp,
        enemyDmg: custom.enemyDmg,
        spawn: custom.spawn,
        xp: custom.xp,
        coin: custom.coin,
        startCoins: custom.startCoins,
        weaponSlots: custom.weaponSlots,
      };
    } else if (selectedModeId === 'daily') {
      cfg.seed = todayKey();
    }

    session.lastRunConfig = cfg;
    try {
      game.startRun(cfg);
    } catch (err) {
      console.error('[ui] startRun failed:', err);
    }
  }

  function mountScreen(root, payload) {
    characterId = (payload && payload.characterId) || characterId || 'kong_grunt';
    modeCards = new Map();
    arenaChips = new Map();

    screen = mount(root, el('div', 'ui-screen'));
    mount(screen, el('div', 'screen-heading', 'Pick your fight'));

    const charDef = contentById(Content, 'characters', characterId);
    mount(screen, el('div', 'screen-sub', `Playing as ${charDef ? charDef.name : characterId}`));

    const body = mount(screen, el('div', 'screen-body'));

    // --- left: mode cards --------------------------------------------------
    const modeCol = mount(body, el('div', 'mode-cards'));
    const modes = contentList(Content, 'modes');
    let firstPlayable = null;

    for (const def of modes) {
      if (!def || !def.id) continue;
      const unlocked = isModeUnlocked(def);
      if (unlocked && !firstPlayable) firstPlayable = def.id;

      const card = el('button', 'mode-card');
      card.type = 'button';
      card.dataset.uiId = 'mode_' + def.id;
      if (!unlocked) card.style.opacity = '0.45';
      mount(card, el('div', 'mode-name', (unlocked ? '' : '🔒 ') + (def.name || def.id)));
      mount(card, el('div', 'mode-desc', unlocked ? def.description || '' : unlockHint(def.unlock) || 'Locked'));
      const summary = rulesSummary(def.rules);
      if (summary && unlocked) mount(card, el('div', 'mode-rules', summary));

      if (def.id === 'daily' && unlocked) {
        const best = dailyBest();
        const meta = mount(card, el('div', 'mode-rules daily-meta'));
        const b1 = el('b', '', todayKey());
        meta.append('Today: ');
        meta.appendChild(b1);
        meta.append(' · seed ');
        meta.appendChild(el('b', '', todayKey()));
        meta.append(' · best ');
        meta.appendChild(el('b', '', best === null ? '—' : fmtInt(best)));
      }

      card.addEventListener('click', () => {
        if (isModeUnlocked(def)) selectMode(def.id);
      });
      modeCards.set(def.id, mount(modeCol, card));
    }
    if (modes.length === 0) {
      mount(modeCol, el('div', 'empty-note', 'No modes found in the content registry.'));
    }

    // --- right: arena picker + custom form ----------------------------------
    const side = mount(body, el('div', 'mode-side'));

    const arenaPanel = mount(side, el('div', 'panel'));
    mount(arenaPanel, el('div', 'panel-title', 'Arena'));
    const arenaRow = mount(arenaPanel, el('div', 'arena-row'));
    let firstArena = null;
    for (const def of contentList(Content, 'arenas')) {
      if (!def || !def.id) continue;
      const unlocked = isArenaUnlocked(def);
      const chip = el('button', 'arena-chip');
      chip.type = 'button';
      chip.dataset.uiId = 'arena_' + def.id;
      chip.textContent = unlocked ? def.name || def.id : `🔒 ${def.name || def.id}`;
      if (!unlocked) {
        chip.disabled = true;
        chip.title = unlockHint(def.unlock) || 'Locked';
      } else {
        if (!firstArena) firstArena = def.id;
        chip.addEventListener('click', () => selectArena(def.id));
      }
      arenaChips.set(def.id, mount(arenaRow, chip));
    }
    if (arenaChips.size === 0) {
      mount(arenaRow, el('div', 'empty-note', 'No arenas found.'));
    }

    customPanel = mount(side, el('div', 'panel'));
    mount(customPanel, el('div', 'panel-title', 'Custom run'));
    const form = mount(customPanel, el('div', 'custom-form'));
    const x = (v) => v.toFixed(1) + '×';
    sliderRow(form, 'Waves', 5, 40, 1, custom.waves, (v) => (custom.waves = v));
    sliderRow(form, 'Weapon slots', 1, 6, 1, custom.weaponSlots, (v) => (custom.weaponSlots = v));
    sliderRow(form, 'Enemy HP', 0.5, 3, 0.1, custom.enemyHp, (v) => (custom.enemyHp = v), x);
    sliderRow(form, 'Enemy damage', 0.5, 3, 0.1, custom.enemyDmg, (v) => (custom.enemyDmg = v), x);
    sliderRow(form, 'Spawn rate', 0.5, 3, 0.1, custom.spawn, (v) => (custom.spawn = v), x);
    sliderRow(form, 'XP gain', 0.5, 3, 0.1, custom.xp, (v) => (custom.xp = v), x);
    sliderRow(form, 'Coin gain', 0.5, 3, 0.1, custom.coin, (v) => (custom.coin = v), x);
    sliderRow(form, 'Start coins', 0, 200, 10, custom.startCoins, (v) => (custom.startCoins = v));

    const seedRow = mount(form, el('div', 'form-row'));
    const seedLab = mount(seedRow, el('label'));
    mount(seedLab, el('span', '', 'Seed (optional)'));
    const seedInput = mount(seedRow, el('input'));
    seedInput.type = 'text';
    seedInput.maxLength = 32;
    seedInput.placeholder = 'random';
    seedInput.value = custom.seed;
    seedInput.addEventListener('input', () => (custom.seed = seedInput.value));

    // --- footer -------------------------------------------------------------
    const actions = mount(screen, el('div', 'screen-actions'));
    mount(actions, btn('◄ Back', '', () => states.set('CHAR_SELECT')));
    startBtn = mount(actions, btn('Start Run ►', 'primary big autofocus', start));

    const hints = mount(screen, el('div', 'hint-bar'));
    hints.append('Move ');
    mount(hints, el('b', '', '↑↓←→'));
    hints.append(' Select ');
    mount(hints, el('b', '', 'Enter'));
    hints.append(' Back ');
    mount(hints, el('b', '', 'Esc'));

    selectMode(
      firstPlayable && modeCards.has('classic') && isModeUnlocked(contentById(Content, 'modes', 'classic'))
        ? 'classic'
        : firstPlayable
    );
    selectArena(firstArena);

    nav.setBack(() => states.set('CHAR_SELECT'));
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
    customPanel = null;
    startBtn = null;
    modeCards = new Map();
    arenaChips = new Map();
  }

  return { mount: mountScreen, unmount };
}
