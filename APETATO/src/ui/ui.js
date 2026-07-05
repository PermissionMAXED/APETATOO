// APETATO ui/ui — UI package entry point.
// Builds all HTML/CSS UI inside #ui-root, swaps screens on bus 'state:change',
// and provides keyboard + gamepad navigation for every menu screen.
//
// Screen contract (internal to src/ui): each screen module exports a factory
// create<Name>(ctx) -> { mount(root, payload), unmount() }. mount() appends a
// single .ui-screen element to `root`; unmount() removes it and releases any
// timers / bus subscriptions / 3D previews it took.

import './styles.css';

import { el, mount, clear } from './dom.js';
import { createHud } from './hud.js';
import { createMenu } from './menu.js';
import { createCharacterSelect } from './characterSelect.js';
import { createModeSelect } from './modeSelect.js';
import { createLevelupModal } from './levelupModal.js';
import { createShop } from './shop.js';
import { createPauseMenu } from './pauseMenu.js';
import { createSettingsMenu } from './settingsMenu.js';
import { createGameover } from './gameover.js';
import { createLeaderboard } from './leaderboard.js';
import { createStatsScreen } from './statsScreen.js';
import { createAchievementsScreen } from './achievementsScreen.js';
import { createChallengesScreen } from './challengesScreen.js';
import { initToasts } from './toasts.js';

/** States in which the UI nav manager owns keyboard/gamepad input. */
const NAV_STATES = new Set([
  'MENU', 'CHAR_SELECT', 'MODE_SELECT', 'LEVELUP', 'SHOP', 'PAUSED',
  'GAME_OVER', 'VICTORY', 'SETTINGS', 'STATS', 'ACHIEVEMENTS', 'LEADERBOARD',
]);

/** States that keep the gameplay HUD on screen. */
const HUD_STATES = new Set(['PLAYING', 'LEVELUP', 'PAUSED']);

const STATE_SCREEN = {
  MENU: 'menu',
  CHAR_SELECT: 'characterSelect',
  MODE_SELECT: 'modeSelect',
  LEVELUP: 'levelupModal',
  SHOP: 'shop',
  PAUSED: 'pauseMenu',
  GAME_OVER: 'gameover',
  VICTORY: 'gameover',
  SETTINGS: 'settingsMenu',
  STATS: 'statsScreen',
  ACHIEVEMENTS: 'achievementsScreen',
  LEADERBOARD: 'leaderboard',
};

// Gamepad nav tuning (ms).
const PAD_REPEAT_DELAY = 320;
const PAD_REPEAT_RATE = 140;
const PAD_AXIS_THRESHOLD = 0.55;

/**
 * Initialize the whole UI package. Called once from main.js.
 * @param {{bus:object, states:object, save:object, game:object,
 *          renderApi:object, meta:object}} deps
 *   meta comes from initMeta() and exposes buyUnlock/isUnlocked for
 *   golden-banana spending screens.
 */
export function initUI({ bus, states, save, game, renderApi, meta }) {
  const uiRoot = document.getElementById('ui-root');
  if (!uiRoot) {
    console.error('[ui] #ui-root not found — UI disabled');
    return null;
  }
  clear(uiRoot);

  // Layer stack: HUD under screens, toasts on top of everything.
  const hudLayer = mount(uiRoot, el('div', 'ui-layer hud-layer'));
  const screenLayer = mount(uiRoot, el('div', 'ui-layer screen-layer'));
  const toastLayer = mount(uiRoot, el('div', 'toast-layer'));

  // ---------------------------------------------------------------- nav ---

  /**
   * Keyboard + gamepad menu navigation.
   * - Arrow keys / d-pad / left stick move a geometric focus cursor between
   *   the visible focusable controls of the active screen.
   * - Enter / Space / pad A activates. Esc / pad B triggers the screen's
   *   registered back handler.
   * - Listens on window in CAPTURE phase and stops propagation for handled
   *   keys so core/input.js (which preventDefault's arrows/space globally)
   *   never fights typing in text fields or native range-slider stepping.
   */
  const nav = {
    _back: null,
    _keyHandler: null,
    /** Screens register what Esc/B should do while they are mounted. */
    setBack(fn) {
      nav._back = fn || null;
    },
    /** Optional per-screen raw key hook (e.g. 1-4 in the level-up modal). */
    setKeyHandler(fn) {
      nav._keyHandler = fn || null;
    },
    back() {
      if (nav._back) nav._back();
    },
    focusables() {
      const sel = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';
      const nodes = screenLayer.querySelectorAll(sel);
      const out = [];
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(n);
      }
      return out;
    },
    focusFirst() {
      const list = nav.focusables();
      if (list.length === 0) return;
      const preferred = list.find((n) => n.classList.contains('autofocus')) || list[0];
      preferred.focus({ preventScroll: false });
      preferred.classList.add('kb-focus');
    },
    current() {
      const a = document.activeElement;
      return a && screenLayer.contains(a) ? a : null;
    },
    move(dir) {
      const list = nav.focusables();
      if (list.length === 0) return;
      const cur = nav.current();
      if (!cur) {
        nav.focusFirst();
        return;
      }
      const next = pickByDirection(cur, list, dir);
      if (next && next !== cur) {
        next.focus({ preventScroll: false });
        next.classList.add('kb-focus');
        if (typeof next.scrollIntoView === 'function') {
          next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    },
    activate() {
      const cur = nav.current();
      if (!cur) {
        nav.focusFirst();
        return;
      }
      if (cur.tagName === 'BUTTON') {
        cur.click();
      } else if (cur.tagName === 'INPUT' && cur.type === 'text') {
        cur.select && cur.select();
      }
    },
  };

  /** Geometric directional focus: nearest candidate in the direction cone. */
  function pickByDirection(from, list, dir) {
    const fr = from.getBoundingClientRect();
    const fx = fr.left + fr.width / 2;
    const fy = fr.top + fr.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const n of list) {
      if (n === from) continue;
      const r = n.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - fx;
      const dy = cy - fy;
      let primary;
      let ortho;
      if (dir === 'left') { primary = -dx; ortho = Math.abs(dy); }
      else if (dir === 'right') { primary = dx; ortho = Math.abs(dy); }
      else if (dir === 'up') { primary = -dy; ortho = Math.abs(dx); }
      else { primary = dy; ortho = Math.abs(dx); }
      if (primary <= 1) continue; // must actually lie in that direction
      const score = primary + ortho * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  const KEY_DIRS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
  };

  function onKeydownCapture(e) {
    if (!NAV_STATES.has(states.get())) return;

    // Give the active screen first crack (e.g. digits 1-4 in level-up).
    if (nav._keyHandler && nav._keyHandler(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    const target = e.target;
    const isTextInput = target && target.tagName === 'INPUT' && target.type === 'text';
    const isRange = target && target.tagName === 'INPUT' && target.type === 'range';

    if (isTextInput) {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        target.blur();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Shield typing (incl. Space/arrows) from core/input.js preventDefault.
      e.stopImmediatePropagation();
      return;
    }

    if (isRange && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      // Let the browser step the slider; just shield it from core/input.js.
      e.stopImmediatePropagation();
      return;
    }

    const dir = KEY_DIRS[e.code];
    if (dir) {
      nav.move(dir);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      nav.activate();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.code === 'Escape') {
      // Swallow Esc entirely in menu states so core input never also latches
      // it (would double-toggle pause). The screen decides what "back" is.
      nav.back();
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  window.addEventListener('keydown', onKeydownCapture, true);

  // Gamepad polling for menu nav (keyboard-equivalent actions with repeat).
  const padState = { dir: null, since: 0, lastFire: 0, a: false, b: false };

  function pollPadNav(now) {
    requestAnimationFrame(pollPadNav);
    if (!NAV_STATES.has(states.get())) {
      padState.dir = null;
      return;
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    let gp = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
    if (!gp) {
      padState.dir = null;
      padState.a = false;
      padState.b = false;
      return;
    }

    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = (i) => gp.axes[i] || 0;

    let dir = null;
    if (btn(12) || ax(1) < -PAD_AXIS_THRESHOLD) dir = 'up';
    else if (btn(13) || ax(1) > PAD_AXIS_THRESHOLD) dir = 'down';
    else if (btn(14) || ax(0) < -PAD_AXIS_THRESHOLD) dir = 'left';
    else if (btn(15) || ax(0) > PAD_AXIS_THRESHOLD) dir = 'right';

    if (dir !== padState.dir) {
      padState.dir = dir;
      padState.since = now;
      padState.lastFire = 0;
      if (dir) {
        padDirAction(dir);
        padState.lastFire = now;
      }
    } else if (dir && now - padState.since > PAD_REPEAT_DELAY && now - padState.lastFire > PAD_REPEAT_RATE) {
      padDirAction(dir);
      padState.lastFire = now;
    }

    const a = btn(0);
    const b = btn(1);
    if (a && !padState.a) nav.activate();
    if (b && !padState.b) nav.back();
    padState.a = a;
    padState.b = b;
  }

  function padDirAction(dir) {
    const cur = nav.current();
    // Left/right on a focused range slider nudges its value instead of moving.
    if (cur && cur.tagName === 'INPUT' && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const step = Number(cur.step) || 1;
      const v = Number(cur.value) || 0;
      cur.value = String(dir === 'left' ? v - step : v + step);
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    nav.move(dir);
  }

  requestAnimationFrame(pollPadNav);

  // Every button activation pings the bus (audio hooks 'ui:click').
  uiRoot.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && !b.disabled) {
      bus.emit('ui:click', { label: b.textContent || '', id: b.dataset.uiId || '' });
    }
  });

  // ------------------------------------------------------------- screens ---

  /** Shared scratch that survives across screens (retry config, last run). */
  const session = {
    lastRunConfig: null,
    lastRunEnd: null,
  };

  bus.on('run:end', (payload) => {
    session.lastRunEnd = payload || null;
  });

  const ctx = { bus, states, save, game, renderApi, meta, nav, session };

  const hud = createHud(ctx, hudLayer);
  initToasts(ctx, toastLayer);

  const screens = {
    menu: createMenu(ctx),
    characterSelect: createCharacterSelect(ctx),
    modeSelect: createModeSelect(ctx),
    levelupModal: createLevelupModal(ctx),
    shop: createShop(ctx),
    pauseMenu: createPauseMenu(ctx),
    settingsMenu: createSettingsMenu(ctx),
    gameover: createGameover(ctx),
    leaderboard: createLeaderboard(ctx),
    statsScreen: createStatsScreen(ctx),
    achievementsScreen: createAchievementsScreen(ctx),
    challenges: createChallengesScreen(ctx),
  };

  let activeScreen = null;

  function swapScreen(stateName, payload) {
    if (activeScreen) {
      try {
        activeScreen.unmount();
      } catch (err) {
        console.error('[ui] screen unmount error:', err);
      }
      activeScreen = null;
    }
    nav.setBack(null);
    nav.setKeyHandler(null);
    clear(screenLayer);

    // A payload can override the default screen for a state (the core state
    // machine has a fixed state list, so e.g. the Challenges screen rides on
    // MODE_SELECT via { uiScreen: 'challenges' }).
    const override = payload && payload.uiScreen;
    const key = override && screens[override] ? override : STATE_SCREEN[stateName];
    if (key && screens[key]) {
      activeScreen = screens[key];
      try {
        activeScreen.mount(screenLayer, payload, stateName);
      } catch (err) {
        console.error(`[ui] screen mount error for '${stateName}':`, err);
      }
      // Focus the screen's preferred control for immediate keyboard nav.
      nav.focusFirst();
    } else {
      // PLAYING (or unknown): no menu screen; drop stray focus so keys reach
      // the game instead of a dead button.
      const a = document.activeElement;
      if (a && typeof a.blur === 'function') a.blur();
    }

    hud.setVisible(HUD_STATES.has(stateName));
  }

  bus.on('state:change', ({ to, payload }) => {
    swapScreen(to, payload);
  });

  // main.js sets MENU after initUI; but if the state machine already left
  // BOOT (integration order changes), sync immediately.
  if (states.get() && states.get() !== 'BOOT') {
    swapScreen(states.get(), states.getPayload());
  }

  return { nav, hud };
}
