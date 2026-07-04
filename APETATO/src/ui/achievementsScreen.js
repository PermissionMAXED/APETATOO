// APETATO ui/achievementsScreen — achievement grid.
// Defs come from src/meta/achievements.js; unlock state (with dates) from
// save.data.achievements. Secret achievements stay ??? until earned.

import { el, mount, btn } from './dom.js';
import { ACHIEVEMENT_DEFS } from '../meta/achievements.js';

export function createAchievementsScreen(ctx) {
  const { states, save, nav } = ctx;
  let screen = null;

  /** save.data.achievements[id] may be a timestamp, {at}, {date} or true. */
  function unlockDate(record) {
    if (record === undefined || record === null || record === false) return null;
    let ts = null;
    if (typeof record === 'number') ts = record;
    else if (typeof record === 'object') {
      ts = record.at || record.date || record.ts || record.time || null;
    }
    if (typeof ts === 'number') {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
    }
    if (typeof ts === 'string') return ts;
    return ''; // unlocked, date unknown
  }

  function mountScreen(root, payload) {
    const backTo = (payload && payload.from) || 'MENU';
    screen = mount(root, el('div', 'ui-screen'));

    const defs = Array.isArray(ACHIEVEMENT_DEFS) ? ACHIEVEMENT_DEFS : [];
    const records = (save && save.data && save.data.achievements) || {};
    const doneCount = defs.filter((d) => d && records[d.id] !== undefined && records[d.id] !== null && records[d.id] !== false).length;

    mount(screen, el('div', 'screen-heading', 'Achievements'));
    mount(screen, el('div', 'screen-sub', `${doneCount} / ${defs.length} earned`));

    const body = mount(screen, el('div', 'screen-body'));
    const panel = mount(body, el('div', 'panel build-col'));
    const grid = mount(panel, el('div', 'ach-grid'));

    for (const def of defs) {
      if (!def || !def.id) continue;
      const date = unlockDate(records[def.id]);
      const unlocked = date !== null;
      const hidden = !!def.secret && !unlocked;

      const card = mount(grid, el(
        'div',
        'ach-card' + (unlocked ? ' done' : '') + (hidden ? ' secret' : '')
      ));
      mount(card, el('div', 'ach-mark', unlocked ? '★' : '☆'));
      const text = mount(card, el('div'));
      mount(text, el('div', 'ach-name', hidden ? '???' : def.name || def.id));
      mount(text, el('div', 'ach-desc', hidden ? 'Secret achievement — keep monkeying around.' : def.description || ''));
      if (unlocked) mount(text, el('div', 'ach-date', date ? `Earned ${date}` : 'Earned'));
    }

    if (defs.length === 0) {
      mount(grid, el('div', 'empty-note', 'No achievements defined yet.'));
    }

    const actions = mount(screen, el('div', 'screen-actions'));
    mount(actions, btn('◄ Back', 'autofocus', () => states.set(backTo)));

    nav.setBack(() => states.set(backTo));
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
