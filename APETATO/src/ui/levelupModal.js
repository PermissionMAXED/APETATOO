// APETATO ui/levelupModal — pick 1 of 3-4 upgrades on level up.
// Mounted (over the HUD) whenever the state machine enters LEVELUP; the state
// re-enters LEVELUP for queued level-ups, which remounts us with new choices.

import { el, mount, btn, statModsList, rarityName, rarityColor, rarityClass } from './dom.js';

export function createLevelupModal(ctx) {
  const { game, nav } = ctx;
  let screen = null;

  function getChoices() {
    try {
      if (game && game.levelup && typeof game.levelup.getChoices === 'function') {
        const c = game.levelup.getChoices();
        if (Array.isArray(c)) return c;
        if (c && Array.isArray(c.choices)) return c.choices;
      }
    } catch (err) {
      console.error('[ui] levelup.getChoices failed:', err);
    }
    return [];
  }

  function getQueuedCount(payload) {
    if (payload && typeof payload.queued === 'number') return payload.queued;
    const lu = game && game.levelup;
    if (lu) {
      try {
        if (typeof lu.getQueued === 'function') return Number(lu.getQueued()) || 0;
        if (typeof lu.queued === 'number') return lu.queued;
        if (Array.isArray(lu.queue)) return lu.queue.length;
      } catch (err) { /* optional API */ }
    }
    try {
      const s = game && typeof game.getState === 'function' ? game.getState() : null;
      if (s && typeof s.levelupQueue === 'number') return s.levelupQueue;
      if (s && Array.isArray(s.levelupQueue)) return s.levelupQueue.length;
    } catch (err) { /* optional */ }
    return 0;
  }

  function choose(idx) {
    try {
      game.levelup.choose(idx);
    } catch (err) {
      console.error('[ui] levelup.choose failed:', err);
    }
  }

  function mountScreen(root, payload) {
    screen = mount(root, el('div', 'ui-screen ui-overlay'));
    const panel = mount(screen, el('div', 'levelup-panel'));

    mount(panel, el('div', 'screen-heading', 'Level up!'));

    const queued = getQueuedCount(payload);
    if (queued > 0) {
      const note = mount(panel, el('div', 'queued-note'));
      note.append('+');
      mount(note, el('b', '', String(queued)));
      note.append(` more level-up${queued > 1 ? 's' : ''} queued`);
    }

    const row = mount(panel, el('div', 'choice-row'));
    const choices = getChoices();

    choices.slice(0, 4).forEach((raw, i) => {
      const def = (raw && raw.def) || raw || {};
      const rarity = typeof def.rarity === 'number' ? def.rarity : (raw && raw.rarity) || 0;

      const card = el('button', 'choice-card ' + rarityClass(rarity));
      card.type = 'button';
      card.dataset.uiId = 'levelup_' + (def.id || i);
      card.style.setProperty('--rar', rarityColor(rarity));
      if (i === 0) card.classList.add('autofocus');

      mount(card, el('span', 'hotkey', String(i + 1)));
      mount(card, el('div', 'rarity-tag', rarityName(rarity)));
      mount(card, el('div', 'choice-name', def.name || def.id || '???'));
      if (def.statMods) mount(card, statModsList(def.statMods));
      mount(card, el('div', 'choice-desc', def.description || ''));

      card.addEventListener('click', () => choose(i));
      mount(row, card);
    });

    if (choices.length === 0) {
      mount(row, el('div', 'empty-note', 'No choices available…'));
      mount(panel, btn('Continue', 'primary', () => choose(0)));
    }

    const hints = mount(panel, el('div', 'hint-bar'));
    hints.append('Pick with ');
    mount(hints, el('b', '', '1-4'));
    hints.append(' or ');
    mount(hints, el('b', '', '←→'));
    hints.append(' + ');
    mount(hints, el('b', '', 'Enter'));

    // Digits 1-4 choose directly; Esc is swallowed (a choice must be made).
    nav.setKeyHandler((e) => {
      const n = digitOf(e.code);
      if (n !== null && n >= 1 && n <= choices.length) {
        choose(n - 1);
        return true;
      }
      return false;
    });
    nav.setBack(null);
  }

  function digitOf(code) {
    if (/^Digit[1-4]$/.test(code)) return Number(code.slice(5));
    if (/^Numpad[1-4]$/.test(code)) return Number(code.slice(6));
    return null;
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
