// APETATO ui/statsScreen — lifetime stats from save.data.stats.

import { el, mount, btn, fmtInt, fmtTime, contentById } from './dom.js';
import { Content } from '../content/registry.js';

export function createStatsScreen(ctx) {
  const { states, save, nav } = ctx;
  let screen = null;

  function mountScreen(root, payload) {
    const backTo = (payload && payload.from) || 'MENU';
    screen = mount(root, el('div', 'ui-screen'));
    mount(screen, el('div', 'screen-heading', 'Lifetime stats'));

    const s = (save && save.data && save.data.stats) || {};

    const body = mount(screen, el('div', 'screen-body'));

    const totals = mount(body, el('div', 'panel build-col'));
    mount(totals, el('div', 'panel-title', 'Totals'));
    const grid = mount(totals, el('div', 'summary-grid'));
    cell(grid, 'Runs', fmtInt(s.totalRuns || 0));
    cell(grid, 'Wins', fmtInt(s.wins || 0));
    cell(grid, 'Kills', fmtInt(s.totalKills || 0));
    cell(grid, 'Coins earned', fmtInt(s.coinsEarned || 0));
    cell(grid, 'Playtime', fmtTime(s.playtimeSec || 0));
    const winRate = s.totalRuns > 0 ? Math.round(((s.wins || 0) / s.totalRuns) * 100) + '%' : '—';
    cell(grid, 'Win rate', winRate);

    const waves = mount(body, el('div', 'panel build-col'));
    mount(waves, el('div', 'panel-title', 'Best wave per ape'));
    const bestWave = s.bestWave && typeof s.bestWave === 'object' ? s.bestWave : {};
    const keys = Object.keys(bestWave).sort((a, b) => (bestWave[b] || 0) - (bestWave[a] || 0));
    if (keys.length === 0) {
      mount(waves, el('div', 'empty-note', 'No runs recorded yet. Go peel something.'));
    } else {
      const table = mount(waves, el('table', 'table'));
      const thead = mount(table, el('thead'));
      const hr = mount(thead, el('tr'));
      for (const h of ['Character', 'Best wave']) mount(hr, el('th', '', h));
      const tbody = mount(table, el('tbody'));
      for (const id of keys) {
        const def = contentById(Content, 'characters', id);
        const tr = mount(tbody, el('tr'));
        mount(tr, el('td', '', def ? def.name : id));
        mount(tr, el('td', '', String(bestWave[id] || 0)));
      }
    }

    const actions = mount(screen, el('div', 'screen-actions'));
    mount(actions, btn('◄ Back', 'autofocus', () => states.set(backTo)));

    nav.setBack(() => states.set(backTo));
  }

  function cell(parent, label, value) {
    const c = mount(parent, el('div', 'summary-cell'));
    mount(c, el('div', 'k', label));
    mount(c, el('div', 'v', value));
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
