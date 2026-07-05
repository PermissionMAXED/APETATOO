// APETATO ui/challengesScreen — challenge-style modes in one place.
// Lists Boss Rush / One Weapon / Hardcore / Chaos / Banana Madness with
// their rules and a Start button per mode (respecting unlock state).
// Starting a challenge routes through the normal flow: CHAR_SELECT (with the
// mode preselected) -> MODE_SELECT -> startRun.
//
// The core state machine has a fixed state list, so this screen rides on the
// MODE_SELECT state via the { uiScreen: 'challenges' } payload override in
// ui.js. Reachable from the main menu; Esc/B and the Back button return there.

import { el, mount, btn, unlockHint, contentList, contentById } from './dom.js';
import { Content } from '../content/registry.js';

/** Modes that count as "challenges" (order = display order). */
const CHALLENGE_MODE_IDS = ['boss_rush', 'one_weapon', 'hardcore', 'chaos_run', 'banana_madness'];

export function createChallengesScreen(ctx) {
  const { states, save, nav } = ctx;
  let screen = null;

  function isModeUnlocked(def) {
    if (!def) return false;
    const ids =
      save && save.data && save.data.unlocked && Array.isArray(save.data.unlocked.modes)
        ? save.data.unlocked.modes
        : [];
    if (ids.includes(def.id)) return true;
    return !def.unlock || def.unlock.type === 'default';
  }

  /** One-line human summary of a ModeDef.rules object (non-default keys). */
  function rulesSummary(rules) {
    if (!rules || typeof rules !== 'object') return '';
    const bits = [];
    for (const k of Object.keys(rules)) {
      const v = rules[k];
      if (v === undefined || v === null || typeof v === 'object') continue;
      if (v === false || v === 1) continue; // skip defaults for a tighter line
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      bits.push(`${label}: ${v}`);
      if (bits.length >= 4) break;
    }
    return bits.join(' · ');
  }

  function mountScreen(root) {
    screen = mount(root, el('div', 'ui-screen'));
    mount(screen, el('div', 'screen-heading', 'Challenges'));
    mount(screen, el('div', 'screen-sub', 'Special rules, same jungle. Win them for achievements.'));

    const body = mount(screen, el('div', 'screen-body'));
    const list = mount(body, el('div', 'mode-cards challenge-list'));

    const modes = contentList(Content, 'modes');
    let firstStartable = null;

    for (const id of CHALLENGE_MODE_IDS) {
      const def = contentById(Content, 'modes', id) || modes.find((m) => m && m.id === id);
      if (!def) continue;
      const unlocked = isModeUnlocked(def);

      const card = mount(list, el('div', 'mode-card challenge-card'));
      if (!unlocked) card.style.opacity = '0.55';
      mount(card, el('div', 'mode-name', (unlocked ? '' : '🔒 ') + (def.name || def.id)));
      mount(card, el('div', 'mode-desc', def.description || ''));
      const summary = rulesSummary(def.rules);
      if (summary) mount(card, el('div', 'mode-rules', summary));
      if (!unlocked) {
        mount(card, el('div', 'mode-rules', unlockHint(def.unlock) || 'Locked'));
      }

      const row = mount(card, el('div', 'screen-actions challenge-actions'));
      const start = mount(row, btn('Start ►', 'primary', () => {
        if (!isModeUnlocked(def)) return;
        states.set('CHAR_SELECT', { modeId: def.id, from: 'CHALLENGES' });
      }));
      start.dataset.uiId = 'challenge_' + def.id;
      start.disabled = !unlocked;
      if (unlocked && !firstStartable) {
        firstStartable = start;
        start.classList.add('autofocus');
      }
    }

    if (list.children.length === 0) {
      mount(list, el('div', 'empty-note', 'No challenge modes found in the content registry.'));
    }

    const actions = mount(screen, el('div', 'screen-actions'));
    const back = mount(actions, btn('◄ Back', firstStartable ? '' : 'autofocus', () => states.set('MENU')));
    back.dataset.uiId = 'challenges_back';

    const hints = mount(screen, el('div', 'hint-bar'));
    hints.append('Move ');
    mount(hints, el('b', '', '↑↓'));
    hints.append(' Select ');
    mount(hints, el('b', '', 'Enter'));
    hints.append(' Back ');
    mount(hints, el('b', '', 'Esc'));

    nav.setBack(() => states.set('MENU'));
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
