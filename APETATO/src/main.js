// APETATO entry point.
// Wires the kernel to the render/game/ui/audio/meta packages in the exact
// integration order. Do not reorder: later systems subscribe to bus events
// that earlier systems emit during play.

import { bus } from './core/bus.js';
import { states } from './core/states.js';
import { startEngine } from './core/engine.js';
import { initSave } from './core/save.js';
import { initInput } from './core/input.js';
import { initRenderer } from './render/renderer.js';
import { createGame } from './game/run.js';
import { initUI } from './ui/ui.js';
import { initAudio } from './audio/audio.js';
import { initMeta } from './meta/progression.js';

// Kernel self-tests (cheap; exposed for the console via APETATO_DEBUG too).
import { selfTest as busSelfTest } from './core/bus.js';
import { selfTest as statesSelfTest } from './core/states.js';
import { selfTest as rngSelfTest } from './core/rng.js';
import { selfTest as poolSelfTest } from './core/pool.js';
import { selfTest as statmodelSelfTest } from './core/statmodel.js';

const gameCanvas = document.getElementById('game-canvas');
const fxCanvas = document.getElementById('fx-canvas');

// --- Boot order (contract) -------------------------------------------------
const save = initSave();
const input = initInput(window);
const renderApi = initRenderer(gameCanvas, fxCanvas);
const game = createGame({ bus, states, save, input, renderApi });
initUI({ bus, states, save, game, renderApi });
initAudio({ bus, save });
initMeta({ bus, save });

// Optional mouse-aim hookup: if the renderer exposes a camera rig with
// screenToWorld(sx, sy, out), wire it so player 0 can aim with the mouse.
// Without it, the game falls back to nearest-enemy aim.
if (renderApi && renderApi.cameraRig) {
  input.setCamera(renderApi.cameraRig);
}

// Console debugging handle. runSelfTests() re-verifies the kernel in-place.
window.APETATO_DEBUG = {
  bus,
  states,
  save,
  input,
  game,
  runSelfTests() {
    const results = {
      bus: busSelfTest(),
      states: statesSelfTest(),
      rng: rngSelfTest(),
      pool: poolSelfTest(),
      statmodel: statmodelSelfTest(),
    };
    console.log('[APETATO] kernel self-tests:', results);
    return results;
  },
};

startEngine({ update: game.update, render: game.render, states });
states.set('MENU');
