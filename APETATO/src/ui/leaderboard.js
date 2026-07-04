// APETATO ui/leaderboard — local daily-challenge results.
// Today's runs as a ranked table plus a compact best-per-day history, all
// from save.data.daily (local only; no network anywhere in APETATO).

import { el, mount, btn, fmtTime, fmtInt, todayKey, contentById } from './dom.js';
import { Content } from '../content/registry.js';

export function createLeaderboard(ctx) {
  const { states, save, nav } = ctx;
  let screen = null;

  /** Normalize one day's blob into an array of run entries. */
  function entriesOf(dayBlob) {
    if (!dayBlob) return [];
    if (Array.isArray(dayBlob)) return dayBlob;
    if (Array.isArray(dayBlob.entries)) return dayBlob.entries;
    if (Array.isArray(dayBlob.runs)) return dayBlob.runs;
    if (typeof dayBlob === 'object') return [dayBlob];
    return [];
  }

  function charName(e) {
    const id = e.characterId || e.character || '';
    const def = contentById(Content, 'characters', id);
    return def ? def.name : id || '—';
  }

  function scoreOf(e) {
    return typeof e.score === 'number' ? e.score : 0;
  }

  function mountScreen(root, payload) {
    const backTo = (payload && payload.from) || 'MENU';
    screen = mount(root, el('div', 'ui-screen'));
    mount(screen, el('div', 'screen-heading', 'Leaderboard'));
    mount(screen, el('div', 'screen-sub', `Daily challenge · ${todayKey()}`));

    const body = mount(screen, el('div', 'screen-body'));
    const daily = (save && save.data && save.data.daily) || {};

    // --- today ---------------------------------------------------------------
    const todayPanel = mount(body, el('div', 'panel build-col'));
    mount(todayPanel, el('div', 'panel-title', "Today's runs"));

    const todays = entriesOf(daily[todayKey()])
      .slice()
      .sort((a, b) => scoreOf(b) - scoreOf(a));

    if (todays.length === 0) {
      mount(todayPanel, el('div', 'empty-note', 'No daily runs yet today. The bananas await.'));
    } else {
      const table = mount(todayPanel, el('table', 'table'));
      const thead = mount(table, el('thead'));
      const hr = mount(thead, el('tr'));
      for (const h of ['Rank', 'Score', 'Character', 'Wave', 'Time']) mount(hr, el('th', '', h));
      const tbody = mount(table, el('tbody'));
      todays.forEach((e, i) => {
        const tr = mount(tbody, el('tr' , i === 0 ? 'me' : ''));
        mount(tr, el('td', '', '#' + (i + 1)));
        mount(tr, el('td', '', fmtInt(scoreOf(e))));
        mount(tr, el('td', '', charName(e)));
        mount(tr, el('td', '', String(e.wave ?? '—')));
        mount(tr, el('td', '', fmtTime(e.timeSec ?? e.time ?? 0)));
      });
    }

    // --- past days -----------------------------------------------------------
    const pastPanel = mount(body, el('div', 'panel build-col'));
    mount(pastPanel, el('div', 'panel-title', 'Past days'));

    const pastKeys = Object.keys(daily)
      .filter((k) => k !== todayKey())
      .sort()
      .reverse()
      .slice(0, 14);

    if (pastKeys.length === 0) {
      mount(pastPanel, el('div', 'empty-note', 'No history yet.'));
    } else {
      const table = mount(pastPanel, el('table', 'table'));
      const thead = mount(table, el('thead'));
      const hr = mount(thead, el('tr'));
      for (const h of ['Day', 'Best score', 'Character', 'Wave']) mount(hr, el('th', '', h));
      const tbody = mount(table, el('tbody'));
      for (const key of pastKeys) {
        const best = entriesOf(daily[key]).slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
        if (!best) continue;
        const tr = mount(tbody, el('tr'));
        mount(tr, el('td', '', key));
        mount(tr, el('td', '', fmtInt(scoreOf(best))));
        mount(tr, el('td', '', charName(best)));
        mount(tr, el('td', '', String(best.wave ?? '—')));
      }
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
