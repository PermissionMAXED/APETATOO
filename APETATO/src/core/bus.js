// APETATO event bus.
// Tiny synchronous pub/sub used by every system. Listener errors are caught
// and logged so one misbehaving banana never breaks an emit cascade.
//
// Implementation note: listeners are stored in arrays and unsubscribing
// nulls-out the slot (compacted lazily after emit). This keeps emit()
// allocation-free even when called from hot paths (e.g. 'enemy:died' with
// 400 enemies on screen).

function createBusInternal() {
  /** @type {Map<string, (Function|null)[]>} */
  const channels = new Map();
  /** @type {Map<string, boolean>} evt -> has null holes needing compaction */
  const dirty = new Map();
  let emitting = 0;

  function getChannel(evt) {
    let arr = channels.get(evt);
    if (!arr) {
      arr = [];
      channels.set(evt, arr);
    }
    return arr;
  }

  function compact(evt) {
    const arr = channels.get(evt);
    if (!arr) return;
    let w = 0;
    for (let r = 0; r < arr.length; r++) {
      if (arr[r] !== null) arr[w++] = arr[r];
    }
    arr.length = w;
    dirty.set(evt, false);
  }

  const bus = {
    /**
     * Subscribe to an event. Returns an unsubscribe function.
     * @param {string} evt
     * @param {Function} fn
     * @returns {() => void} unsub
     */
    on(evt, fn) {
      const arr = getChannel(evt);
      arr.push(fn);
      let alive = true;
      return function unsub() {
        if (!alive) return;
        alive = false;
        const i = arr.indexOf(fn);
        if (i !== -1) {
          // Null the slot instead of splicing so emit() can safely iterate
          // even if a listener unsubscribes mid-emit.
          arr[i] = null;
          if (emitting > 0) dirty.set(evt, true);
          else compact(evt);
        }
      };
    },

    /**
     * Subscribe for exactly one emission. Returns an unsubscribe function.
     */
    once(evt, fn) {
      const unsub = bus.on(evt, function onceWrapper(payload) {
        unsub();
        fn(payload);
      });
      return unsub;
    },

    /**
     * Emit an event synchronously to all listeners. Listener exceptions are
     * caught and console.error'd; they never interrupt delivery.
     */
    emit(evt, payload) {
      const arr = channels.get(evt);
      if (!arr || arr.length === 0) return;
      emitting++;
      // Snapshot length: listeners added during emit fire on the NEXT emit.
      const len = arr.length;
      for (let i = 0; i < len; i++) {
        const fn = arr[i];
        if (fn === null) continue;
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bus] listener error on '${evt}':`, err);
        }
      }
      emitting--;
      if (emitting === 0 && dirty.get(evt)) compact(evt);
    },

    /**
     * Remove all listeners for one event, or for every event when omitted.
     */
    clear(evt) {
      if (evt !== undefined) {
        channels.delete(evt);
        dirty.delete(evt);
      } else {
        channels.clear();
        dirty.clear();
      }
    },
  };

  return bus;
}

/** Factory (used by self-tests and any system needing a private bus). */
export const createBus = createBusInternal;

/** The shared, app-wide event bus. */
export const bus = createBusInternal();

/**
 * Self-test: exercises on/once/emit/clear, unsub-during-emit, and the
 * error-isolation guarantee. Returns true or throws.
 */
export function selfTest() {
  const b = createBusInternal();
  const log = [];

  const unsubA = b.on('ping', (p) => log.push('a' + p));
  b.on('ping', (p) => log.push('b' + p));
  b.emit('ping', 1);
  if (log.join(',') !== 'a1,b1') throw new Error('bus: basic emit failed');

  unsubA();
  unsubA(); // double-unsub must be a no-op
  b.emit('ping', 2);
  if (log.join(',') !== 'a1,b1,b2') throw new Error('bus: unsub failed');

  log.length = 0;
  b.once('boom', (p) => log.push('once' + p));
  b.emit('boom', 1);
  b.emit('boom', 2);
  if (log.join(',') !== 'once1') throw new Error('bus: once failed');

  // A throwing listener must not stop later listeners.
  log.length = 0;
  const prevError = console.error;
  console.error = () => {}; // silence expected error output during test
  b.on('err', () => {
    throw new Error('intentional');
  });
  b.on('err', () => log.push('survived'));
  b.emit('err');
  console.error = prevError;
  if (log.join(',') !== 'survived') throw new Error('bus: error isolation failed');

  // Unsubscribing during emit must not skip or crash.
  log.length = 0;
  const unsubSelf = b.on('mid', () => {
    log.push('self');
    unsubSelf();
  });
  b.on('mid', () => log.push('after'));
  b.emit('mid');
  b.emit('mid');
  if (log.join(',') !== 'self,after,after') throw new Error('bus: mid-emit unsub failed');

  b.clear('mid');
  log.length = 0;
  b.emit('mid');
  if (log.length !== 0) throw new Error('bus: clear(evt) failed');

  b.clear();
  b.emit('ping', 3);
  return true;
}
