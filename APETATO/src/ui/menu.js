// APETATO ui/menu — main menu screen.

import { el, mount, btn, fmtInt } from './dom.js';

const VERSION = 'v0.1.0';

export function createMenu(ctx) {
  const { states, save, nav } = ctx;
  let screen = null;

  function mountScreen(root) {
    screen = mount(root, el('div', 'ui-screen'));

    // Golden banana balance, top-right.
    const balance = mount(screen, el('div', 'banana-balance golden'));
    mount(balance, el('span', 'banana-icon'));
    const bananas = save && save.data ? save.data.goldenBananas || 0 : 0;
    mount(balance, el('span', '', fmtInt(bananas)));
    balance.title = 'Golden Bananas';

    // Title block.
    const title = mount(screen, el('div', 'menu-title'));
    mount(title, document.createTextNode('APETAT'));
    mount(title, el('span', 'tilt', 'O'));
    mount(screen, el('div', 'menu-tag', 'peel · fight · survive'));

    // Buttons.
    const buttons = mount(screen, el('div', 'menu-buttons'));
    mount(buttons, btn('Play', 'primary big autofocus', () => states.set('CHAR_SELECT')));
    mount(buttons, btn('Stats', '', () => states.set('STATS', { from: 'MENU' })));
    mount(buttons, btn('Achievements', '', () => states.set('ACHIEVEMENTS', { from: 'MENU' })));
    mount(buttons, btn('Leaderboard', '', () => states.set('LEADERBOARD', { from: 'MENU' })));
    mount(buttons, btn('Settings', '', () => states.set('SETTINGS', { from: 'MENU' })));

    const hints = mount(screen, el('div', 'hint-bar'));
    hints.append('Navigate ');
    mount(hints, el('b', '', '↑↓'));
    hints.append(' Select ');
    mount(hints, el('b', '', 'Enter'));
    hints.append(' / ');
    mount(hints, el('b', '', 'A'));

    mount(screen, el('div', 'version-footer', `APETATO ${VERSION}`));

    nav.setBack(null); // nowhere to go back to from the main menu
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
