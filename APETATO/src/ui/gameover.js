// APETATO ui/gameover — end-of-run screen for both GAME_OVER and VICTORY.
// Run summary (wave/time/kills/damage/coins), full build summary (character,
// weapons w/ tiers, item stacks, final stat sheet) and the damage meter.
// Retry restarts with the exact same config captured by modeSelect.

import {
  el, mount, btn, fmtTime, fmtInt, statLabel, fmtStatVal, rarityColor,
  contentById,
} from './dom.js';
import { STAT_KEYS } from '../core/statmodel.js';
import { Content } from '../content/registry.js';
import { createDamageMeter } from './damageMeter.js';

export function createGameover(ctx) {
  const { states, game, nav, session } = ctx;
  let screen = null;

  function getState() {
    try {
      return game && typeof game.getState === 'function' ? game.getState() : null;
    } catch (err) {
      return null;
    }
  }

  function summaryCell(parent, label, value) {
    const cell = mount(parent, el('div', 'summary-cell'));
    mount(cell, el('div', 'k', label));
    mount(cell, el('div', 'v', value));
  }

  function mountScreen(root, payload, stateName) {
    const end = session.lastRunEnd || payload || {};
    const state = getState();
    const victory = stateName === 'VICTORY' || !!end.victory;

    const runStats = end.runStats || (state && state.runStats) || {};
    const wave = end.wave ?? (state && state.wave) ?? 0;
    const timeSec = (state && state.speedrunSec) ?? end.timeSec ?? end.speedrunSec ?? 0;
    const p = (state && state.players && state.players[0]) || null;

    screen = mount(root, el('div', 'ui-screen'));

    mount(screen, el(
      'div',
      'screen-heading gameover-heading ' + (victory ? 'victory' : 'defeat'),
      victory ? '🍌 VICTORY 🍌' : 'MONKEY DOWN'
    ));
    mount(screen, el(
      'div', 'screen-sub',
      victory ? 'The jungle is yours. For now.' : `The horde got you on wave ${wave}.`
    ));

    const body = mount(screen, el('div', 'screen-body gameover-body'));

    // --- left column: run summary + damage meter ----------------------------
    const left = mount(body, el('div', 'panel build-col'));
    mount(left, el('div', 'panel-title', 'Run summary'));
    const grid = mount(left, el('div', 'summary-grid'));
    summaryCell(grid, 'Wave', String(wave));
    summaryCell(grid, 'Time', fmtTime(timeSec));
    summaryCell(grid, 'Kills', fmtInt(runStats.kills || 0));
    summaryCell(grid, 'Dmg dealt', fmtInt(runStats.damageDealt || 0));
    summaryCell(grid, 'Dmg taken', fmtInt(runStats.damageTaken || 0));
    summaryCell(grid, 'Coins', fmtInt(runStats.coinsEarned || 0));

    mount(left, el('div', 'detail-section-title', 'Damage by weapon'));
    mount(left, createDamageMeter(runStats.dpsLog));

    // --- right column: build summary ----------------------------------------
    const right = mount(body, el('div', 'panel build-col'));
    mount(right, el('div', 'panel-title', 'Build summary'));

    let charDef = null;
    if (p && p.character) {
      charDef = typeof p.character === 'string'
        ? contentById(Content, 'characters', p.character)
        : p.character;
    }
    if (!charDef && session.lastRunConfig) {
      charDef = contentById(Content, 'characters', session.lastRunConfig.characterId);
    }
    mount(right, el('div', 'passive-line', `🐵 ${charDef ? charDef.name || charDef.id : 'Unknown ape'}`));

    const weapons = (p && p.weapons) || [];
    mount(right, el('div', 'detail-section-title', `Weapons (${weapons.length})`));
    for (const w of weapons) {
      const def = (w && w.def) || w || {};
      const tier = (w && typeof w.tier === 'number') ? w.tier : 1;
      const row = mount(right, el('div', 'owned-weapon'));
      mount(row, el('span', 'wn', def.name || def.id || '?'));
      mount(row, el('span', 'tier', '★'.repeat(Math.max(1, Math.min(4, tier)))));
    }
    if (weapons.length === 0) mount(right, el('div', 'empty-note', 'No weapons. Impressive, honestly.'));

    const items = collectItems(p);
    mount(right, el('div', 'detail-section-title', `Items (${items.length})`));
    for (const it of items) {
      const row = mount(right, el('div', 'owned-item-line'));
      const nameEl = mount(row, el('span', '', (it.def && it.def.name) || it.id));
      nameEl.style.color = rarityColor(it.def && typeof it.def.rarity === 'number' ? it.def.rarity : 0);
      mount(row, el('span', 'stacks', it.stacks > 1 ? `×${it.stacks}` : ''));
    }
    if (items.length === 0) mount(right, el('div', 'empty-note', 'Travelled light.'));

    mount(right, el('div', 'detail-section-title', 'Final stats'));
    const statsWrap = mount(right, el('div', 'stat-mods'));
    const stats = (p && p.stats) || {};
    for (const key of STAT_KEYS) {
      const v = typeof stats[key] === 'number' ? stats[key] : 0;
      if (v === 0 && key !== 'maxHp') continue; // keep the end screen readable
      const row = mount(statsWrap, el('div', 'stat-row'));
      mount(row, el('span', 'stat-name', statLabel(key)));
      const text = key === 'maxHp' ? String(Math.round(v)) : fmtStatVal(key, v);
      mount(row, el('span', 'stat-val ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'), text));
    }

    // --- actions -------------------------------------------------------------
    const actions = mount(screen, el('div', 'screen-actions'));
    const retry = mount(actions, btn('Retry', 'primary big autofocus', () => {
      if (session.lastRunConfig) {
        try {
          game.startRun(session.lastRunConfig);
        } catch (err) {
          console.error('[ui] retry startRun failed:', err);
        }
      } else {
        states.set('CHAR_SELECT');
      }
    }));
    if (!session.lastRunConfig) retry.disabled = true;
    mount(actions, btn('New Run', '', () => states.set('CHAR_SELECT')));
    mount(actions, btn('Menu', '', () => states.set('MENU')));

    nav.setBack(() => states.set('MENU'));
  }

  function collectItems(p) {
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

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
