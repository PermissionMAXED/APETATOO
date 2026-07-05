// APETATO ui/settingsMenu — audio/visual options.
// Writes save.data.settings, persists, and emits 'settings:changed' with the
// full settings object on every tweak. Reachable from MENU and PAUSED (back
// target comes from the state payload).

import { el, mount, btn } from './dom.js';

export function createSettingsMenu(ctx) {
  const { bus, states, save, nav } = ctx;
  let screen = null;

  function settings() {
    if (!save.data.settings) {
      save.data.settings = { sfxVol: 0.8, musicVol: 0.5, screenShake: 1, damageNumbers: true, showTimer: true };
    }
    return save.data.settings;
  }

  function apply(key, value) {
    const s = settings();
    s[key] = value;
    try {
      save.persist();
    } catch (err) {
      console.error('[ui] settings persist failed:', err);
    }
    bus.emit('settings:changed', s);
  }

  function volumeRow(parent, label, key) {
    const s = settings();
    const row = mount(parent, el('div', 'setting-row'));
    mount(row, el('span', 'setting-name', label));
    const input = mount(row, el('input'));
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(typeof s[key] === 'number' ? s[key] : 0.5);
    const val = mount(row, el('span', 'setting-val', pct(Number(input.value))));
    input.addEventListener('input', () => {
      const v = Math.round(Number(input.value) * 100) / 100;
      val.textContent = pct(v);
      apply(key, v);
    });
    return input;
  }

  function pct(v) {
    return Math.round(v * 100) + '%';
  }

  function toggleRow(parent, label, key) {
    const s = settings();
    const row = mount(parent, el('div', 'setting-row'));
    mount(row, el('span', 'setting-name', label));
    const toggle = mount(row, btn(s[key] ? 'On' : 'Off', 'toggle-btn' + (s[key] ? ' on' : ''), () => {
      const next = !settings()[key];
      toggle.textContent = next ? 'On' : 'Off';
      toggle.classList.toggle('on', next);
      apply(key, next);
    }));
    toggle.dataset.uiId = 'setting_' + key;
    return toggle;
  }

  function shakeRow(parent) {
    const s = settings();
    const row = mount(parent, el('div', 'setting-row'));
    mount(row, el('span', 'setting-name', 'Screen shake'));
    const seg = mount(row, el('div', 'seg-row'));
    const options = [
      { label: 'Off', value: 0 },
      { label: 'Half', value: 0.5 },
      { label: 'Full', value: 1 },
    ];
    const btns = options.map((opt) => {
      const b = mount(seg, btn(opt.label, 'seg-btn' + (s.screenShake === opt.value ? ' on' : ''), () => {
        for (const other of btns) other.classList.remove('on');
        b.classList.add('on');
        apply('screenShake', opt.value);
      }));
      b.dataset.uiId = 'shake_' + opt.value;
      return b;
    });
  }

  function mountScreen(root, payload) {
    const backTo = (payload && payload.from) || 'MENU';
    screen = mount(root, el('div', 'ui-screen' + (backTo === 'PAUSED' ? ' ui-overlay' : '')));

    const panel = mount(screen, el('div', 'panel settings-panel'));
    mount(panel, el('div', 'screen-heading', 'Settings'));

    volumeRow(panel, 'SFX volume', 'sfxVol');
    volumeRow(panel, 'Music volume', 'musicVol');
    shakeRow(panel);
    toggleRow(panel, 'Damage numbers', 'damageNumbers');
    toggleRow(panel, 'Show run timer', 'showTimer');
    mount(panel, el('div', 'setting-note', 'The run timer is always shown in Daily and Endless.'));

    mount(panel, btn('◄ Back', 'autofocus', () => states.set(backTo, backTo === 'PAUSED' ? undefined : { from: 'SETTINGS' })));

    const hints = mount(panel, el('div', 'hint-bar'));
    hints.append('Adjust ');
    mount(hints, el('b', '', '←→'));
    hints.append(' Move ');
    mount(hints, el('b', '', '↑↓'));
    hints.append(' Back ');
    mount(hints, el('b', '', 'Esc'));

    nav.setBack(() => states.set(backTo, backTo === 'PAUSED' ? undefined : { from: 'SETTINGS' }));
  }

  function unmount() {
    if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    screen = null;
  }

  return { mount: mountScreen, unmount };
}
