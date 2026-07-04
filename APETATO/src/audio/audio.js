// APETATO audio entry point — owns the single AudioContext and master graph.
//
// Node graph:
//   sfx voices   → sfxGain   ─┐
//   music voices → musicGain ─┴→ master GainNode → DynamicsCompressor → destination
//
// The compressor tames event storms (200 events/sec of hits + explosions)
// so the mix never clips or crackles.
//
// Autoplay policy: the context is created lazily on the FIRST user gesture
// (pointerdown or keydown, listeners added exactly once) and resume()d.
// Before that gesture every call in this package is a silent no-op and
// NEVER throws — playSfx()/setTrack() are safe from frame one.

import { initSfx } from './sfx.js';
import { initMusic, onAudioReady as musicOnAudioReady } from './music.js';
import { initAudioEvents } from './audioEvents.js';

let ctx = null;
let master = null;
let compressor = null;
let sfxGain = null;
let musicGain = null;

let saveRef = null;
let api = null;
let unlocked = false;
let gestureListenersOn = false;

function clamp01(v) {
  return typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Shared audio handle for sfx.js / music.js (and debugging).
 * @returns {{ctx:AudioContext, master:GainNode, compressor:DynamicsCompressorNode,
 *            sfxGain:GainNode, musicGain:GainNode} | null} null until the
 *          first user gesture has created the context.
 */
export function getAudio() {
  return ctx ? { ctx, master, compressor, sfxGain, musicGain } : null;
}

function currentVolumes() {
  const s = saveRef && saveRef.data && saveRef.data.settings;
  return {
    sfx: clamp01(s && s.sfxVol !== undefined ? s.sfxVol : 0.8),
    music: clamp01(s && s.musicVol !== undefined ? s.musicVol : 0.5),
  };
}

/** Re-read save settings and apply to the bus gains (click-free). */
function applyVolumes() {
  if (!ctx) return;
  const v = currentVolumes();
  const t = ctx.currentTime;
  sfxGain.gain.setTargetAtTime(v.sfx, t, 0.03);
  musicGain.gain.setTargetAtTime(v.music, t, 0.03);
}

function buildGraph() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9; // headroom before the compressor

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    master.connect(compressor);
    compressor.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.connect(master);

    const v = currentVolumes();
    sfxGain.gain.value = v.sfx;
    musicGain.gain.value = v.music;
    return true;
  } catch (err) {
    console.warn('[audio] AudioContext creation failed:', err);
    ctx = null;
    return false;
  }
}

function finishUnlock() {
  if (unlocked) return;
  unlocked = true;
  detachGestureListeners();
  musicOnAudioReady(); // start the sequencer + any track requested pre-gesture
}

/**
 * Create/resume the context. Safe to call at any time (it is the gesture
 * handler, and is also exposed on the init API so UI code can force-start
 * audio from its own click handlers).
 */
function unlock() {
  try {
    if (!ctx && !buildGraph()) {
      // No WebAudio in this environment (tests, ancient browser): stay silent.
      detachGestureListeners();
      return;
    }
    if (ctx.state === 'running') {
      finishUnlock();
      return;
    }
    const p = typeof ctx.resume === 'function' ? ctx.resume() : null;
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (ctx.state === 'running') finishUnlock();
      }).catch(() => {});
    } else if (ctx.state === 'running') {
      finishUnlock();
    }
  } catch (err) {
    console.warn('[audio] unlock failed:', err);
  }
}

function onGesture() {
  unlock();
}

function attachGestureListeners() {
  if (gestureListenersOn) return;
  const g = globalThis;
  if (typeof g.addEventListener !== 'function') return;
  // Capture phase so audio unlocks even when UI stops propagation.
  g.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  g.addEventListener('keydown', onGesture, { capture: true });
  gestureListenersOn = true;
}

function detachGestureListeners() {
  if (!gestureListenersOn) return;
  const g = globalThis;
  if (typeof g.removeEventListener === 'function') {
    g.removeEventListener('pointerdown', onGesture, { capture: true });
    g.removeEventListener('keydown', onGesture, { capture: true });
  }
  gestureListenersOn = false;
}

/**
 * Boot the audio layer. Called once from main.js.
 * @param {{bus?:object, save?:object}} deps app bus + save (both optional so
 *        the module never throws when booted headless/standalone).
 * @returns {{getAudio:Function, unlock:Function, applyVolumes:Function}}
 */
export function initAudio({ bus, save } = {}) {
  if (api) return api; // idempotent — never double-subscribe or re-listen

  saveRef = save || null;

  // Sub-modules pull the shared ctx/gains through getAudio() on demand,
  // so they are automatically silent no-ops until the first gesture.
  initSfx(getAudio);
  initMusic(getAudio);
  initAudioEvents({ bus });

  if (bus && typeof bus.on === 'function') {
    bus.on('settings:changed', applyVolumes);
  }

  attachGestureListeners();

  api = { getAudio, unlock, applyVolumes };
  return api;
}
