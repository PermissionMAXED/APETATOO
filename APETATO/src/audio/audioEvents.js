// APETATO bus → audio wiring. Every gameplay/UI event that makes noise is
// subscribed here, each hot path guarded by a per-key token-bucket throttle
// so 200 events/sec collapse to a musical, crackle-free mix (the master
// compressor in audio.js is the final safety net).
//
// The bus is injected by initAudio() — this module never imports it, so the
// file parses and runs standalone (initAudioEvents without a bus is a no-op).

import { playSfx, play, SFX } from './sfx.js';
import { setTrack, setIntensity } from './music.js';

function nowSec() {
  return (typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()) / 1000;
}

/**
 * Token bucket: sustained rate `perSec`, with a small burst capacity so one
 * frame (e.g. a shotgun volley or a bomb wiping 30 enemies) can't stack
 * enough identical voices to clip.
 */
function makeThrottle(perSec, capacity = Math.max(2, Math.round(perSec / 3))) {
  let tokens = capacity;
  let last = nowSec();
  return function take() {
    const t = nowSec();
    tokens = Math.min(capacity, tokens + (t - last) * perSec);
    last = t;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/** Weapon behavior → shoot recipe name. */
function shootFor(behavior) {
  const b = typeof behavior === 'string' ? behavior : '';
  if (b.indexOf('melee') === 0) return 'swing'; // melee_swing/thrust/spin
  if (b === 'projectile' || b === 'burst' || b === 'shotgun') return 'shoot_pop';
  if (b === 'beam' || b === 'rail') return 'shoot_laser';
  if (b === 'lobbed' || b === 'explosive') return 'shoot_heavy';
  return 'shoot_pluck'; // orbit, homing, chain, boomerang, pets, turrets...
}

// --- xp pickup pitch ramp (Vampire-Survivors style) --------------------------
// Rapid successive xp pickups climb in pitch; ~0.6s without one resets the
// ramp. The combo counts EVERY collect event (even ones the 15/s throttle
// mutes) so a dense xp stream keeps climbing audibly instead of flatlining.
const XP_COMBO_WINDOW = 0.6; // idle seconds before the ramp resets
const XP_COMBO_MAX = 12; // caps the climb at ~2x base pitch
const XP_PITCH_STEP = 1.06; // ~one semitone per rapid pickup
const XP_BASE_FREQ = SFX.pickup_xp.freq;
const XP_BASE_FREQ_END = SFX.pickup_xp.freqEnd;
// Mutable copy of the recipe (SFX map is shared); low jitter so the ramp reads.
const xpRecipe = Object.assign({}, SFX.pickup_xp, { freqJitter: 0.03 });
let xpCombo = 0;
let xpLastAt = -Infinity;

let wired = false;

/**
 * Subscribe all bus → sound mappings. Called once from initAudio().
 * @param {{bus?:{on:Function}}} deps
 */
export function initAudioEvents({ bus } = {}) {
  if (wired || !bus || typeof bus.on !== 'function') return;
  wired = true;

  // Per-key buckets (events/sec sustained).
  const fireTb = makeThrottle(12);
  const hitTb = makeThrottle(20);
  const deathTb = makeThrottle(10);
  const critTb = makeThrottle(8);
  const explTb = makeThrottle(8);
  const hurtTb = makeThrottle(6);
  const dodgeTb = makeThrottle(6);
  const pickupTb = makeThrottle(15);
  const burnTb = makeThrottle(2); // statuses tick constantly: heavy throttle
  const poisonTb = makeThrottle(2);

  // -- combat ---------------------------------------------------------------
  bus.on('weapon:fire', (p) => {
    if (fireTb()) playSfx(shootFor(p && p.behavior));
  });
  bus.on('enemy:hit', () => {
    if (hitTb()) playSfx('hit_soft');
  });
  bus.on('crit', () => {
    if (critTb()) playSfx('crit');
  });
  bus.on('enemy:death', () => {
    if (deathTb()) playSfx(Math.random() < 0.5 ? 'enemy_die' : 'squish');
  });
  bus.on('explosion', () => {
    if (explTb()) playSfx('explosion');
  });
  bus.on('player:hit', () => {
    if (hurtTb()) playSfx('player_hurt');
  });
  bus.on('player:dodge', () => {
    if (dodgeTb()) playSfx('dodge');
  });
  bus.on('status:apply', (p) => {
    const t = p && p.type;
    if (t === 'burn') {
      if (burnTb()) playSfx('status_burn');
    } else if (t === 'poison') {
      if (poisonTb()) playSfx('status_poison');
    }
  });
  bus.on('shield:break', () => playSfx('shield_break'));

  // -- pickups / progression -----------------------------------------------
  bus.on('pickup:collect', (p) => {
    const t = String((p && p.ptype) || '');
    if (t === 'xp') {
      const now = nowSec();
      xpCombo = now - xpLastAt <= XP_COMBO_WINDOW ? Math.min(XP_COMBO_MAX, xpCombo + 1) : 0;
      xpLastAt = now;
      if (!pickupTb()) return;
      const ratio = Math.pow(XP_PITCH_STEP, xpCombo);
      xpRecipe.freq = XP_BASE_FREQ * ratio;
      xpRecipe.freqEnd = XP_BASE_FREQ_END * ratio;
      play(xpRecipe);
      return;
    }
    if (!pickupTb()) return;
    playSfx(t.indexOf('coin') !== -1 || t === 'gold' ? 'pickup_coin' : 'pickup_xp');
  });
  bus.on('player:levelup', () => playSfx('levelup'));
  bus.on('achievement:unlock', () => playSfx('levelup')); // levelup-ish chime

  // -- shop / UI --------------------------------------------------------
  bus.on('shop:buy', () => playSfx('buy'));
  bus.on('shop:reroll', () => playSfx('reroll'));
  bus.on('ui:click', () => playSfx('ui_click'));
  bus.on('ui:deny', () => playSfx('ui_deny'));

  // -- run flow: stings + track switches -------------------------------------
  bus.on('wave:start', (p) => {
    const w = Number(p && p.wave) || 0;
    playSfx('wave_start');
    setTrack('wave', { wave: w });
    setIntensity(w / 20);
  });
  bus.on('wave:end', () => playSfx('wave_end'));
  bus.on('boss:spawn', () => {
    playSfx('boss_roar');
    setTrack('boss');
  });
  bus.on('boss:death', () => playSfx('boss_die'));
  bus.on('shop:open', () => setTrack('shop'));
  bus.on('run:end', (p) => {
    const won = !!(p && p.victory);
    playSfx(won ? 'victory_sting' : 'death_sting');
    setTrack(won ? 'victory' : 'death');
  });
  bus.on('state:change', (p) => {
    if (p && p.to === 'MENU') setTrack('menu');
  });
}
