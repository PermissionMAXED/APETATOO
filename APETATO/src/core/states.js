// APETATO game-state machine.
// A flat state machine (no nesting) whose transitions drive the whole app:
// the engine only ticks gameplay while in PLAYING, the UI package swaps
// screens by listening to bus 'state:change', etc.

import { bus } from './bus.js';

/** Every legal state name, frozen. */
export const STATE_NAMES = Object.freeze([
  'BOOT',
  'MENU',
  'CHAR_SELECT',
  'MODE_SELECT',
  'PLAYING',
  'LEVELUP',
  'SHOP',
  'PAUSED',
  'GAME_OVER',
  'VICTORY',
  'SETTINGS',
  'STATS',
  'ACHIEVEMENTS',
  'LEADERBOARD',
]);

const VALID = new Set(STATE_NAMES);

/**
 * Factory used by the app singleton and by self-tests (so tests never
 * disturb live app state).
 * @param {{emit:Function}} [busRef] bus used for 'state:change' emissions.
 */
export function createStates(busRef = bus) {
  let current = 'BOOT';
  let currentPayload = null;
  /** @type {Map<string, {enter?:Function, exit?:Function}[]>} */
  const hooks = new Map();

  function callHooks(name, kind, payload, other) {
    const list = hooks.get(name);
    if (!list) return;
    // Iterate a snapshot-by-length so hooks registered during a transition
    // only apply to future transitions.
    const len = list.length;
    for (let i = 0; i < len; i++) {
      const h = list[i];
      const fn = h && h[kind];
      if (typeof fn !== 'function') continue;
      try {
        fn(payload, other);
      } catch (err) {
        console.error(`[states] ${kind} hook error for '${name}':`, err);
      }
    }
  }

  const states = {
    /**
     * Transition to a state. Re-entering the same state is allowed and
     * re-fires exit/enter hooks (useful for e.g. LEVELUP -> LEVELUP on
     * multi-level-ups).
     */
    set(name, payload = null) {
      if (!VALID.has(name)) {
        console.error(`[states] unknown state '${name}' (ignored)`);
        return;
      }
      const from = current;
      callHooks(from, 'exit', payload, name);
      current = name;
      currentPayload = payload;
      callHooks(name, 'enter', payload, from);
      busRef.emit('state:change', { from, to: name, payload });
    },

    /** Current state name. */
    get() {
      return current;
    },

    /** Payload passed to the most recent set(). */
    getPayload() {
      return currentPayload;
    },

    /** True when the current state matches. */
    is(name) {
      return current === name;
    },

    /**
     * Register enter/exit hooks for a state. Returns an unsubscribe fn.
     * enter(payload, from) / exit(nextPayload, to).
     */
    on(name, { enter, exit } = {}) {
      if (!VALID.has(name)) {
        console.error(`[states] cannot hook unknown state '${name}'`);
        return () => {};
      }
      let list = hooks.get(name);
      if (!list) {
        list = [];
        hooks.set(name, list);
      }
      const entry = { enter, exit };
      list.push(entry);
      return function unsub() {
        const i = list.indexOf(entry);
        if (i !== -1) list.splice(i, 1);
      };
    },
  };

  return states;
}

/** The shared, app-wide state machine. Boots in 'BOOT'. */
export const states = createStates();

/**
 * Self-test: runs on a private instance + private bus, verifying transitions,
 * hooks, payloads, re-entry, and the 'state:change' emission contract.
 * Returns true or throws.
 */
export function selfTest() {
  const log = [];
  const fakeBus = {
    emit(evt, payload) {
      log.push(`${evt}:${payload.from}->${payload.to}`);
    },
  };
  const s = createStates(fakeBus);

  if (s.get() !== 'BOOT') throw new Error('states: initial state must be BOOT');
  if (!s.is('BOOT')) throw new Error('states: is() failed');

  let entered = null;
  let exited = false;
  const unsub = s.on('MENU', {
    enter(payload, from) {
      entered = `${from}:${payload && payload.reason}`;
    },
    exit() {
      exited = true;
    },
  });

  s.set('MENU', { reason: 'boot_done' });
  if (entered !== 'BOOT:boot_done') throw new Error('states: enter hook failed');
  if (s.getPayload().reason !== 'boot_done') throw new Error('states: payload failed');

  s.set('PLAYING');
  if (!exited) throw new Error('states: exit hook failed');
  if (log.join('|') !== 'state:change:BOOT->MENU|state:change:MENU->PLAYING') {
    throw new Error('states: state:change emissions wrong: ' + log.join('|'));
  }

  // Unknown states are rejected without transitioning.
  let prevError = console.error;
  console.error = () => {}; // silence expected rejection log
  s.set('BANANA_HEAVEN');
  console.error = prevError;
  if (s.get() !== 'PLAYING') throw new Error('states: invalid state was accepted');

  // Re-entry re-fires hooks.
  let reenter = 0;
  s.on('PLAYING', { enter: () => reenter++ });
  s.set('PLAYING');
  if (reenter !== 1) throw new Error('states: re-entry failed');

  // Unsub stops hook delivery.
  unsub();
  entered = null;
  s.set('MENU');
  if (entered !== null) throw new Error('states: hook unsub failed');

  // A throwing hook must not block the transition.
  s.on('SHOP', {
    enter() {
      throw new Error('intentional');
    },
  });
  prevError = console.error;
  console.error = () => {};
  s.set('SHOP');
  console.error = prevError;
  if (!s.is('SHOP')) throw new Error('states: throwing hook blocked transition');

  return true;
}
