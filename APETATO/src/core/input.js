// APETATO unified input.
// Keyboard + mouse (player 0) and Gamepad API (pad slot 0 augments player 0,
// pad slot 1 is player 1). Call input.update() exactly once per frame BEFORE
// reading intents — it polls gamepads and latches edge-triggered buttons
// (pause/confirm/cancel fire true for exactly one frame).
//
// Mouse aim: aimX/aimZ is a normalized world-space direction. For it to be
// derived from the mouse, the renderer must supply an unprojector via
// input.setCamera(rig) — either a function (sx, sy, out) => {x, z} or an
// object exposing .screenToWorld(sx, sy, out). The game should also feed the
// player's world position each frame via input.setAimOrigin(x, z) so the
// direction is player->cursor. When no unprojector is available, aimX/aimZ
// stay 0,0 and the game falls back to nearest-enemy aim; raw screen coords
// are always available at input.mouseX / input.mouseY.

const STICK_DEADZONE = 0.25;
const TRIGGER_THRESHOLD = 0.5;

// Standard-mapping gamepad button indices.
const BTN_A = 0;
const BTN_B = 1;
const BTN_X = 2;
const BTN_Y = 3;
const BTN_RT = 7;
const BTN_START = 9;

function makeIntent() {
  return {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 0,
    firing: false,
    pause: false,
    confirm: false,
    cancel: false,
  };
}

/**
 * Initialize input listeners on a window and return the input singleton.
 * @param {Window} win
 */
export function initInput(win) {
  /** Currently-held key codes (KeyboardEvent.code). */
  const held = new Set();
  /** Key codes pressed since the last update() (edge buffer). */
  let pendingPressed = new Set();
  /** Key codes considered "pressed this frame" (published by update()). */
  let framePressed = new Set();

  let mouseButtons = 0; // MouseEvent.buttons bitmask
  let unprojector = null; // (sx, sy, out) => {x, z} | null

  // Per-player reusable state (no per-frame allocations).
  const intents = [makeIntent(), makeIntent()];
  const aimOrigins = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  const mouseWorld = { x: 0, z: 0, valid: false };

  // Gamepad edge-tracking: previous pressed-state per pad slot per button.
  const padPrev = [
    { a: false, b: false, x: false, y: false, start: false },
    { a: false, b: false, x: false, y: false, start: false },
  ];
  const padEdge = [
    { a: false, b: false, x: false, y: false, start: false },
    { a: false, b: false, x: false, y: false, start: false },
  ];
  // Reusable per-frame pad snapshot slots (filled from navigator.getGamepads()).
  const padSlots = [null, null];

  // --- DOM listeners -------------------------------------------------------

  win.addEventListener('keydown', (e) => {
    // Keep the page from scrolling / space-bar jumping.
    if (
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }
    if (!e.repeat) pendingPressed.add(e.code);
    held.add(e.code);
  });

  win.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });

  // Losing focus must never leave keys stuck down.
  win.addEventListener('blur', () => {
    held.clear();
    mouseButtons = 0;
  });

  win.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  });

  win.addEventListener('mousedown', (e) => {
    mouseButtons = e.buttons;
  });

  win.addEventListener('mouseup', (e) => {
    mouseButtons = e.buttons;
  });

  // Right-click is reserved for gameplay (or nothing), not the browser menu.
  win.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- Helpers -------------------------------------------------------------

  function keyHeld(code) {
    return held.has(code);
  }

  function keyPressed(code) {
    return framePressed.has(code);
  }

  function pollGamepads() {
    const nav = win.navigator;
    const list = nav && typeof nav.getGamepads === 'function' ? nav.getGamepads() : null;
    padSlots[0] = null;
    padSlots[1] = null;
    if (list) {
      // Map connected pads, in order, to slots 0 and 1.
      let slot = 0;
      for (let i = 0; i < list.length && slot < 2; i++) {
        const gp = list[i];
        if (gp && gp.connected) padSlots[slot++] = gp;
      }
    }
    for (let s = 0; s < 2; s++) {
      const gp = padSlots[s];
      const prev = padPrev[s];
      const edge = padEdge[s];
      const a = !!(gp && gp.buttons[BTN_A] && gp.buttons[BTN_A].pressed);
      const b = !!(gp && gp.buttons[BTN_B] && gp.buttons[BTN_B].pressed);
      const x = !!(gp && gp.buttons[BTN_X] && gp.buttons[BTN_X].pressed);
      const y = !!(gp && gp.buttons[BTN_Y] && gp.buttons[BTN_Y].pressed);
      const start = !!(gp && gp.buttons[BTN_START] && gp.buttons[BTN_START].pressed);
      edge.a = a && !prev.a;
      edge.b = b && !prev.b;
      edge.x = x && !prev.x;
      edge.y = y && !prev.y;
      edge.start = start && !prev.start;
      prev.a = a;
      prev.b = b;
      prev.x = x;
      prev.y = y;
      prev.start = start;
    }
  }

  /** Read a stick pair with deadzone; writes into intent[mx]/[mz] keys. */
  function readStick(gp, axX, axZ, obj, kx, kz) {
    const x = gp.axes[axX] || 0;
    const z = gp.axes[axZ] || 0;
    const mag = Math.sqrt(x * x + z * z);
    if (mag < STICK_DEADZONE) return false;
    obj[kx] = x / (mag > 1 ? mag : 1);
    obj[kz] = z / (mag > 1 ? mag : 1);
    return true;
  }

  function updateMouseWorld() {
    mouseWorld.valid = false;
    if (!unprojector) return;
    try {
      const res = unprojector(input.mouseX, input.mouseY, mouseWorld);
      // Support unprojectors that return a fresh object instead of using out.
      if (res && res !== mouseWorld && typeof res.x === 'number') {
        mouseWorld.x = res.x;
        mouseWorld.z = res.z;
      }
      mouseWorld.valid = true;
    } catch (err) {
      console.error('[input] unprojector threw:', err);
    }
  }

  function buildIntent0() {
    const it = intents[0];
    // Movement: keyboard first...
    let mx = (keyHeld('KeyD') || keyHeld('ArrowRight') ? 1 : 0) - (keyHeld('KeyA') || keyHeld('ArrowLeft') ? 1 : 0);
    let mz = (keyHeld('KeyS') || keyHeld('ArrowDown') ? 1 : 0) - (keyHeld('KeyW') || keyHeld('ArrowUp') ? 1 : 0);
    const mag = Math.sqrt(mx * mx + mz * mz);
    if (mag > 1) {
      mx /= mag;
      mz /= mag;
    }
    it.moveX = mx;
    it.moveZ = mz;

    // ...pad slot 0's left stick overrides when deflected.
    const gp = padSlots[0];
    if (gp) readStick(gp, 0, 1, it, 'moveX', 'moveZ');

    // Aim: pad right stick wins; otherwise mouse-through-unprojector;
    // otherwise 0,0 (game handles nearest-enemy fallback).
    it.aimX = 0;
    it.aimZ = 0;
    let aimed = false;
    if (gp) aimed = readStick(gp, 2, 3, it, 'aimX', 'aimZ');
    if (!aimed && mouseWorld.valid) {
      const dx = mouseWorld.x - aimOrigins[0].x;
      const dz = mouseWorld.z - aimOrigins[0].z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 1e-4) {
        it.aimX = dx / d;
        it.aimZ = dz / d;
      }
    }

    // Space is intentionally NOT firing — it is reserved for dash.
    it.firing =
      (mouseButtons & 1) !== 0 ||
      !!(
        gp &&
        ((gp.buttons[BTN_A] && gp.buttons[BTN_A].pressed) ||
          (gp.buttons[BTN_RT] && gp.buttons[BTN_RT].value > TRIGGER_THRESHOLD))
      );

    it.pause = keyPressed('Escape') || keyPressed('KeyP') || padEdge[0].start;
    it.confirm = keyPressed('Enter') || keyPressed('NumpadEnter') || keyPressed('Space') || padEdge[0].a;
    it.cancel = keyPressed('Escape') || padEdge[0].b;
  }

  function buildIntent1() {
    const it = intents[1];
    it.moveX = 0;
    it.moveZ = 0;
    it.aimX = 0;
    it.aimZ = 0;
    it.firing = false;
    it.pause = false;
    it.confirm = false;
    it.cancel = false;
    const gp = padSlots[1];
    if (!gp) return;
    readStick(gp, 0, 1, it, 'moveX', 'moveZ');
    readStick(gp, 2, 3, it, 'aimX', 'aimZ');
    it.firing = !!(
      (gp.buttons[BTN_A] && gp.buttons[BTN_A].pressed) ||
      (gp.buttons[BTN_RT] && gp.buttons[BTN_RT].value > TRIGGER_THRESHOLD)
    );
    it.pause = padEdge[1].start;
    it.confirm = padEdge[1].a;
    it.cancel = padEdge[1].b;
  }

  // --- Public API ----------------------------------------------------------

  const input = {
    /** Raw mouse position in screen (CSS pixel) coordinates. */
    mouseX: 0,
    mouseY: 0,
    /** Mouse position unprojected onto the XZ plane (see mouseWorldValid). */
    mouseWorldX: 0,
    mouseWorldZ: 0,
    mouseWorldValid: false,

    /**
     * Poll gamepads, latch key/button edges, refresh both player intents.
     * MUST be called exactly once per frame, before getIntent().
     */
    update() {
      // Publish this frame's pressed-edges, recycle the old set as the new
      // pending buffer (no allocation).
      const swap = framePressed;
      framePressed = pendingPressed;
      swap.clear();
      pendingPressed = swap;

      pollGamepads();
      updateMouseWorld();
      input.mouseWorldX = mouseWorld.x;
      input.mouseWorldZ = mouseWorld.z;
      input.mouseWorldValid = mouseWorld.valid;

      buildIntent0();
      buildIntent1();
    },

    /**
     * Get the (reused, do-not-retain) intent object for a player.
     * Player 0 = keyboard/mouse + pad slot 0; player 1 = pad slot 1.
     */
    getIntent(playerIndex = 0) {
      return intents[playerIndex] || intents[0];
    },

    /**
     * Optional camera hook for mouse aim. Accepts either a function
     * (screenX, screenY, out) => {x, z} or an object with a
     * .screenToWorld(screenX, screenY, out) method.
     */
    setCamera(cameraRig) {
      if (typeof cameraRig === 'function') {
        unprojector = cameraRig;
      } else if (cameraRig && typeof cameraRig.screenToWorld === 'function') {
        unprojector = (sx, sy, out) => cameraRig.screenToWorld(sx, sy, out);
      } else {
        unprojector = null;
        if (cameraRig) console.warn('[input] setCamera: rig has no screenToWorld(sx, sy, out); mouse aim disabled');
      }
    },

    /**
     * Feed the player's world position so mouse aim becomes player->cursor.
     * Call each frame from the game (cheap; just stores two numbers).
     */
    setAimOrigin(x, z, playerIndex = 0) {
      const o = aimOrigins[playerIndex];
      if (o) {
        o.x = x;
        o.z = z;
      }
    },

    /** Is a key currently held (KeyboardEvent.code)? */
    isDown(code) {
      return held.has(code);
    },

    /** Was a key pressed this frame (edge)? */
    wasPressed(code) {
      return framePressed.has(code);
    },
  };

  return input;
}
