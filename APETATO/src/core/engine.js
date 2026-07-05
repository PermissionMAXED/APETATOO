// APETATO fixed-timestep engine loop.
// Gameplay simulates at a locked 60Hz (STEP = 1/60) using an accumulator so
// physics/combat are deterministic regardless of display refresh rate.
// Rendering runs every rAF frame with the real frame delta for smooth VFX.

import { bus } from './bus.js';

/** Fixed simulation step in seconds. */
export const STEP = 1 / 60;

/** Max simulation steps per rendered frame (spiral-of-death guard). */
const MAX_STEPS = 5;

/** Longest raw frame delta we will honor (tab-switch / debugger pauses). */
const MAX_FRAME_DT = 0.25;

// --- slow-mo pulse controller ------------------------------------------------
// pulseSlowMo(scale, duration) drops timeScale to `scale`, holds it for
// `duration` REAL seconds, then eases back to 1 over SLOWMO_RECOVER seconds.
// Overlapping pulses merge: strongest slow wins, hold windows extend.

const SLOWMO_RECOVER = 0.25; // real seconds for the ease back to 1

let smActive = false;
let smScale = 1;
let smHold = 0; // remaining hold time, real seconds
let smRecover = 0; // remaining recovery time, real seconds

function pulseSlowMo(scale, duration) {
  const s = Math.min(1, Math.max(0.05, typeof scale === 'number' ? scale : 0.35));
  const d = Math.max(0, typeof duration === 'number' ? duration : 0.18);
  smScale = smActive ? Math.min(smScale, s) : s;
  smHold = Math.max(smHold, d);
  smRecover = 0;
  smActive = true;
  engine.timeScale = smScale;
}

function updateSlowMo(rawDt) {
  if (!smActive) return;
  if (smHold > 0) {
    smHold -= rawDt;
    if (smHold > 0) return;
    smRecover = SLOWMO_RECOVER + smHold; // carry the frame leftover
    smHold = 0;
  } else {
    smRecover -= rawDt;
  }
  if (smRecover <= 0) {
    smActive = false;
    engine.timeScale = 1;
    return;
  }
  const k = 1 - smRecover / SLOWMO_RECOVER; // 0 -> 1 over the recovery window
  engine.timeScale = smScale + (1 - smScale) * k * k; // gentle ease back
}

/**
 * Engine handle. `timeScale` can be tweaked at runtime for slow-mo
 * (e.g. 0.25 on level-up flourish) — it scales both sim accumulation and the
 * frameDt handed to render(). Prefer `pulseSlowMo` for one-shot flourishes.
 */
export const engine = {
  timeScale: 1,
  running: false,
  /** Simulation steps executed since start (debug/metrics). */
  stepCount: 0,
  /** One-shot slow-mo flourish: hold `scale` for `duration` real seconds,
   *  then ease back to 1. Overlapping pulses merge (never stack). */
  pulseSlowMo,
  stop() {
    engine.running = false;
  },
};

// Juice hooks: brief slow-mo punch on level-ups and boss kills. Wired once,
// module-level, so repeated startEngine calls never double-subscribe.
let juiceWired = false;
function wireJuice() {
  if (juiceWired || !bus || typeof bus.on !== 'function') return;
  juiceWired = true;
  bus.on('player:levelup', () => pulseSlowMo(0.35, 0.18));
  bus.on('boss:death', () => pulseSlowMo(0.35, 0.22));
}

/**
 * Start the main loop.
 * @param {object} opts
 * @param {(dt:number)=>void} opts.update called with STEP, only while states.get()==='PLAYING'
 * @param {(alphaUnused:number, frameDt:number)=>void} opts.render called every frame regardless of state
 * @param {{get:()=>string}} opts.states the app state machine
 * @returns {typeof engine}
 */
export function startEngine({ update, render, states }) {
  let last = -1;
  let acc = 0;
  engine.running = true;
  wireJuice();

  function frame(now) {
    if (!engine.running) return;
    requestAnimationFrame(frame);

    if (last < 0) {
      // First frame: establish the clock, don't simulate a giant delta.
      last = now;
      return;
    }
    let rawDt = (now - last) / 1000;
    last = now;
    if (rawDt > MAX_FRAME_DT) rawDt = MAX_FRAME_DT;

    updateSlowMo(rawDt); // slow-mo pulse runs on REAL time, not scaled time

    const frameDt = rawDt * engine.timeScale;
    acc += frameDt;

    let steps = 0;
    while (acc >= STEP && steps < MAX_STEPS) {
      if (states.get() === 'PLAYING') {
        update(STEP);
        engine.stepCount++;
      }
      acc -= STEP;
      steps++;
    }
    // If we maxed out, drop the leftover backlog instead of chasing it
    // forever (keeps the game responsive after a long hitch).
    if (steps === MAX_STEPS && acc >= STEP) acc = STEP;

    // Interpolation alpha is intentionally unused (2D-on-XZ at 60Hz reads
    // fine without it), but the slot is reserved by contract.
    render(0, frameDt);
  }

  requestAnimationFrame(frame);
  return engine;
}
