// APETATO ui/pauseMenu — overlay while PAUSED.
// Resume / Settings / Abandon Run (with an inline, gamepad-friendly confirm).

import { el, mount, btn } from './dom.js';

export function createPauseMenu(ctx) {
  const { states, game, nav } = ctx;
  let screen = null;
  let armedAbandon = false;

  function resume() {
    try {
      game.togglePause();
    } catch (err) {
      console.error('[ui] togglePause failed:', err);
    }
  }

  function mountScreen(root) {
    armedAbandon = false;
    screen = mount(root, el('div', 'ui-screen ui-overlay'));

    const panel = mount(screen, el('div', 'panel pause-panel'));
    mount(panel, el('div', 'screen-heading', 'Paused'));

    mount(panel, btn('Resume', 'primary big autofocus', resume));
    mount(panel, btn('Settings', '', () => states.set('SETTINGS', { from: 'PAUSED' })));

    const abandon = mount(panel, btn('Abandon Run', 'danger', () => {
      if (!armedAbandon) {
        armedAbandon = true;
        abandon.textContent = 'Really abandon? This run is toast.';
        return;
      }
      try {
        game.abandonRun();
      } catch (err) {
        console.error('[ui] abandonRun failed:', err);
      }
    }));

    const hints = mount(panel, el('div', 'hint-bar'));
    hints.append('Resume ');
    mount(hints, el('b', '', 'Esc'));
    hints.append(' Move ');
    mount(hints, el('b', '', '↑↓'));
    hints.append(' Select ');
    mount(hints, el('b', '', 'Enter'));

    nav.setBack(resume);
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
    armedAbandon = false;
  }

  return { mount: mountScreen, unmount };
}
