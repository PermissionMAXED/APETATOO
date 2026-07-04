// APETATO fixed-timestep engine loop.
// Gameplay simulates at a locked 60Hz (STEP = 1/60) using an accumulator so
// physics/combat are deterministic regardless of display refresh rate.
// Rendering runs every rAF frame with the real frame delta for smooth VFX.

/** Fixed simulation step in seconds. */
export const STEP = 1 / 60;

/** Max simulation steps per rendered frame (spiral-of-death guard). */
const MAX_STEPS = 5;

/** Longest raw frame delta we will honor (tab-switch / debugger pauses). */
const MAX_FRAME_DT = 0.25;

/**
 * Engine handle. `timeScale` can be tweaked at runtime for slow-mo
 * (e.g. 0.25 on level-up flourish) — it scales both sim accumulation and the
 * frameDt handed to render().
 */
export const engine = {
  timeScale: 1,
  running: false,
  /** Simulation steps executed since start (debug/metrics). */
  stepCount: 0,
  stop() {
    engine.running = false;
  },
};

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
