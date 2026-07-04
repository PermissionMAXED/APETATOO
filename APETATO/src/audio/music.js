// APETATO procedural music — a 16-step sequencer with a lookahead scheduler
// (25ms wakeup, 0.1s schedule-ahead horizon) driving 3 voices per track:
//   1. bass oscillator   → track lowpass filter (LFO-wobbled)
//   2. lead oscillator   → track lowpass filter
//   3. noise percussion  → kick (sine drop) + hat (highpass noise), post-filter
//
// Tracks crossfade over 0.8s via per-track output gains; the outgoing track
// keeps sequencing under its fade so handoffs are seamless. The 'wave' track
// varies its lead melody per wave number via a seeded pentatonic pattern and
// exposes an intensity knob (0..1) that gates extra hats/lead notes.
//
// Every entry point is a silent no-op (and never throws) until audio.js has
// created the shared context on the first user gesture; setTrack() calls made
// before then are remembered and started by onAudioReady().

const STEPS = 16;
const TICK_MS = 25; // scheduler wakeup interval
const HORIZON = 0.1; // schedule-ahead window (seconds)
const XFADE = 0.8; // crossfade time between tracks (seconds)

let getAudio = null;
let timer = null;
let intensity = 0;
let pending = null; // { name, opts } requested before the ctx existed
let current = null; // live track instance
let fading = []; // track instances ramping out

/** Wired by initAudio(): receives audio.js's getAudio accessor. */
export function initMusic(getAudioFn) {
  getAudio = getAudioFn;
}

/** Called by audio.js once the context exists: start sequencing. */
export function onAudioReady() {
  ensureScheduler();
  if (pending) {
    const p = pending;
    pending = null;
    setTrack(p.name, p.opts);
  }
}

/** Combat intensity 0..1 — adds hat/lead density on tracks that use it. */
export function setIntensity(v) {
  intensity = typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Switch tracks with a 0.8s crossfade.
 * @param {'menu'|'wave'|'boss'|'shop'|'victory'|'death'} name
 * @param {{wave?:number}} [opts] 'wave' uses opts.wave to seed its melody.
 */
export function setTrack(name, opts = {}) {
  const def = TRACKS[name];
  if (!def) {
    console.warn(`[music] unknown track '${name}'`);
    return;
  }
  const a = getAudio && getAudio();
  if (!a) {
    pending = { name, opts: opts || {} };
    return;
  }
  if (current && current.name === name) {
    // Same track re-request: just refresh the seeded melody (new wave number).
    if (name === 'wave') current.leadPattern = makeWavePattern(opts && opts.wave);
    return;
  }
  ensureScheduler();
  const now = a.ctx.currentTime;
  if (current) beginFade(current, now);
  current = startTrack(a, name, def, opts || {}, now);
}

/** Current (or pending) track name — handy for debugging/UI. */
export function getTrackName() {
  if (current) return current.name;
  return pending ? pending.name : null;
}

// ---------------------------------------------------------------------------
// Track lifecycle
// ---------------------------------------------------------------------------

function startTrack(a, name, def, opts, now) {
  const { ctx, musicGain } = a;

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.exponentialRampToValueAtTime(def.level || 0.85, now + XFADE);
  out.connect(musicGain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = def.filterBase || 3000;
  filter.Q.value = def.filterQ || 0.8;
  filter.connect(out);

  // LFO wobble on the track filter cutoff.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = def.lfoRate || 0.2;
  const lfoAmp = ctx.createGain();
  lfoAmp.gain.value = def.lfoDepth || 0;
  lfo.connect(lfoAmp);
  lfoAmp.connect(filter.frequency);
  lfo.start(now);

  return {
    name,
    def,
    out,
    filter,
    lfo,
    lfoAmp,
    stepDur: 60 / def.bpm / 4, // 16 steps = one 4/4 bar of 16th notes
    step: 0,
    nextTime: now + 0.06,
    killAt: 0,
    leadPattern: name === 'wave' ? makeWavePattern(opts.wave) : def.lead,
  };
}

function beginFade(tr, now) {
  tr.killAt = now + XFADE + 0.1;
  const g = tr.out.gain;
  if (typeof g.cancelScheduledValues === 'function') g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(0.0001, g.value || 0.0001), now);
  g.exponentialRampToValueAtTime(0.0001, now + XFADE);
  fading.push(tr);
}

function destroyTrack(tr) {
  try {
    tr.lfo.stop();
  } catch (_) {
    /* never started / already stopped */
  }
  try {
    tr.lfo.disconnect();
    tr.lfoAmp.disconnect();
    tr.filter.disconnect();
    tr.out.disconnect();
  } catch (_) {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

function ensureScheduler() {
  if (timer !== null) return;
  timer = setInterval(tick, TICK_MS);
}

function tick() {
  const a = getAudio && getAudio();
  if (!a) return;
  const now = a.ctx.currentTime;
  for (let i = fading.length - 1; i >= 0; i--) {
    const tr = fading[i];
    if (now >= tr.killAt) {
      destroyTrack(tr);
      fading.splice(i, 1);
      continue;
    }
    advance(a, tr, now); // keep playing under the fade
  }
  if (current) advance(a, current, now);
}

function advance(a, tr, now) {
  // If the tab slept (setInterval throttled), skip ahead instead of
  // machine-gunning every missed step at once.
  if (tr.nextTime < now - 0.25) {
    const missed = Math.ceil((now - tr.nextTime) / tr.stepDur);
    tr.step = (tr.step + missed) % STEPS;
    tr.nextTime += missed * tr.stepDur;
  }
  while (tr.nextTime < now + HORIZON) {
    try {
      scheduleStep(a, tr, tr.step, tr.nextTime);
    } catch (err) {
      console.warn('[music] step failed:', err);
    }
    tr.nextTime += tr.stepDur;
    tr.step = (tr.step + 1) % STEPS;
  }
}

function scheduleStep(a, tr, step, t) {
  const d = tr.def;
  const gate = d.useIntensity ? intensity : 1;

  // Voice 1: bass
  const b = d.bass ? d.bass[step] : null;
  if (b !== null && b !== undefined) {
    note(
      a, tr, d.bassWave,
      d.rootMidi + degToSemi(d.scale, b) + (d.bassOct || 0) * 12,
      t, tr.stepDur * (d.bassLen || 0.9), d.bassVol || 0.22
    );
  }

  // Voice 2: lead (fixed pattern, or seeded-per-wave for 'wave')
  const lp = tr.leadPattern;
  const l = lp ? lp[step] : null;
  if (l !== null && l !== undefined) {
    const deg = typeof l === 'number' ? l : l.d;
    const th = typeof l === 'number' ? 0 : l.th;
    if (th <= gate) {
      note(
        a, tr, d.leadWave,
        d.rootMidi + (d.leadOct !== undefined ? d.leadOct : 1) * 12 + degToSemi(d.scale, deg),
        t, tr.stepDur * (d.leadLen || 0.8), d.leadVol || 0.16
      );
    }
  }

  // Voice 3: percussion (post-filter so the wobble never eats the punch)
  if (gatePlays(d.kick, step, gate)) kick(a, tr, t, d.kickVol || 0.5);
  if (gatePlays(d.hat, step, gate)) hat(a, tr, t, d.hatVol || 0.09);
  if (gatePlays(d.snare, step, gate)) snare(a, tr, t, d.snareVol || 0.25);
}

// Pattern entries are "minimum intensity" thresholds: 0 = always play,
// 0.7 = only when intensity >= 0.7, null/undefined = never.
function gatePlays(pattern, step, gate) {
  if (!pattern) return false;
  const th = pattern[step];
  return th !== null && th !== undefined && th <= gate;
}

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

function midiHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// scale degree -> semitones, wrapping octaves (deg 5 on a pentatonic = root+12)
function degToSemi(scale, deg) {
  const n = scale.length;
  const idx = ((deg % n) + n) % n;
  const oct = Math.floor(deg / n);
  return scale[idx] + oct * 12;
}

function note(a, tr, wave, midi, t, dur, vol) {
  const { ctx } = a;
  const osc = ctx.createOscillator();
  osc.type = wave || 'triangle';
  osc.frequency.setValueAtTime(midiHz(midi), t);
  const env = ctx.createGain();
  const d = Math.max(0.03, dur);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vol, t + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0008, t + d);
  osc.connect(env);
  env.connect(tr.filter);
  osc.onended = () => {
    try {
      env.disconnect();
    } catch (_) {
      /* already gone */
    }
  };
  osc.start(t);
  osc.stop(t + d + 0.05);
}

function kick(a, tr, t, vol) {
  const { ctx } = a;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.0008, t + 0.13);
  osc.connect(env);
  env.connect(tr.out);
  osc.onended = () => {
    try {
      env.disconnect();
    } catch (_) {
      /* already gone */
    }
  };
  osc.start(t);
  osc.stop(t + 0.16);
}

let noiseBuf = null;
function noiseBuffer(ctx) {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function noiseHit(a, tr, t, vol, filterType, filterFreq, decay) {
  const { ctx } = a;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.0008, t + decay);
  src.connect(f);
  f.connect(env);
  env.connect(tr.out);
  src.onended = () => {
    try {
      env.disconnect();
    } catch (_) {
      /* already gone */
    }
  };
  src.start(t);
  src.stop(t + decay + 0.02);
}

function hat(a, tr, t, vol) {
  noiseHit(a, tr, t, vol, 'highpass', 6500, 0.035);
}

function snare(a, tr, t, vol) {
  noiseHit(a, tr, t, vol, 'bandpass', 1800, 0.11);
}

// ---------------------------------------------------------------------------
// Seeded per-wave melody (deterministic pentatonic pattern from wave number)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWavePattern(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const rnd = mulberry32((w * 2654435761) >>> 0);
  const ths = [0, 0, 0.25, 0.4, 0.6, 0.8]; // intensity gates for extra notes
  const pat = new Array(STEPS).fill(null);
  for (let i = 0; i < STEPS; i++) {
    if (rnd() < 0.55) {
      pat[i] = { d: (rnd() * 10) | 0, th: ths[(rnd() * ths.length) | 0] };
    }
  }
  // Anchor the loop: downbeat + midpoint always sound.
  if (!pat[0]) pat[0] = { d: 0, th: 0 };
  else pat[0].th = 0;
  if (!pat[8]) pat[8] = { d: 4, th: 0 };
  return pat;
}

// ---------------------------------------------------------------------------
// Track definitions
// ---------------------------------------------------------------------------

const _ = null;

const SCALES = {
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const TRACKS = Object.freeze({
  // Warm, slow, major-pentatonic noodling.
  menu: {
    bpm: 92, rootMidi: 48, scale: SCALES.majPent, level: 0.9,
    bassWave: 'triangle', bassVol: 0.26, bassLen: 3.6,
    bass: [0, _, _, _, _, _, _, _, 3, _, _, _, 2, _, _, _],
    leadWave: 'sine', leadVol: 0.17, leadLen: 2.2, leadOct: 2,
    lead: [_, _, 2, _, 4, _, _, _, 5, _, 4, _, 2, _, 1, _],
    kick: [0, _, _, _, _, _, _, _, 0, _, _, _, _, _, _, _], kickVol: 0.28,
    hat: [_, _, _, _, 0, _, _, _, _, _, _, _, 0, _, _, _], hatVol: 0.05,
    filterBase: 1700, lfoRate: 0.18, lfoDepth: 500,
  },

  // Driving minor-pentatonic combat; intensity adds hats + lead density,
  // lead melody is reseeded from the wave number (setTrack('wave',{wave})).
  wave: {
    bpm: 128, rootMidi: 45, scale: SCALES.minPent, level: 0.9, useIntensity: true,
    bassWave: 'sawtooth', bassVol: 0.24, bassLen: 0.85,
    bass: [0, _, 0, _, 0, _, 0, 3, 0, _, 0, _, 0, 5, 0, 3],
    leadWave: 'square', leadVol: 0.13, leadLen: 0.8, leadOct: 2,
    lead: null, // seeded per wave — see makeWavePattern()
    kick: [0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _, 0.75, _], kickVol: 0.55,
    hat: [0.4, 0.7, 0, 0.7, 0.4, 0.7, 0, 0.7, 0.4, 0.7, 0, 0.7, 0.4, 0.7, 0, 0.7], hatVol: 0.09,
    filterBase: 1500, lfoRate: 2.4, lfoDepth: 700,
  },

  // Fast, minor/phrygian, syncopated kicks, deep fast wobble.
  boss: {
    bpm: 140, rootMidi: 43, scale: SCALES.phrygian, level: 0.95,
    bassWave: 'square', bassVol: 0.24, bassLen: 0.85,
    bass: [0, 0, _, 1, 0, 0, _, 3, 0, 0, _, 1, 5, _, 4, _],
    leadWave: 'sawtooth', leadVol: 0.14, leadLen: 0.85, leadOct: 1,
    lead: [7, _, 7, 6, _, 5, _, 3, 7, _, 7, 8, _, 5, 3, 1],
    kick: [0, _, _, _, 0, _, _, 0, 0, _, _, _, 0, _, 0, _], kickVol: 0.6,
    hat: [0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, 0], hatVol: 0.1,
    snare: [_, _, _, _, 0, _, _, _, _, _, _, _, 0, _, _, _], snareVol: 0.3,
    filterBase: 1200, lfoRate: 5.5, lfoDepth: 900,
  },

  // Chill slow plucks for browsing bananas.
  shop: {
    bpm: 72, rootMidi: 48, scale: SCALES.majPent, level: 0.85,
    bassWave: 'triangle', bassVol: 0.22, bassLen: 6,
    bass: [0, _, _, _, _, _, _, _, 3, _, _, _, _, _, _, _],
    leadWave: 'triangle', leadVol: 0.18, leadLen: 0.5, leadOct: 2, // short = pluck
    lead: [4, _, 2, _, 5, _, _, 4, _, 2, _, 0, _, _, 2, _],
    kick: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _], kickVol: 0.2,
    hat: [_, _, _, _, 0, _, _, _, _, _, _, _, 0, _, _, _], hatVol: 0.04,
    filterBase: 2200, lfoRate: 0.12, lfoDepth: 300,
  },

  // Bright major fanfare arps (I → IV).
  victory: {
    bpm: 132, rootMidi: 48, scale: SCALES.major, level: 0.95,
    bassWave: 'triangle', bassVol: 0.24, bassLen: 3.5,
    bass: [0, _, _, _, 0, _, _, _, 3, _, _, _, 4, _, _, _],
    leadWave: 'square', leadVol: 0.16, leadLen: 0.9, leadOct: 1,
    lead: [0, 2, 4, 7, _, 7, _, 7, 3, 5, 7, 10, _, 9, _, 11],
    kick: [0, _, _, _, _, _, _, _, 0, _, _, _, _, _, _, _], kickVol: 0.4,
    hat: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _], hatVol: 0.08,
    filterBase: 5000, lfoRate: 0.3, lfoDepth: 400,
  },

  // Slow sad minor descent with a heartbeat kick.
  death: {
    bpm: 56, rootMidi: 45, scale: SCALES.minor, level: 0.85,
    bassWave: 'triangle', bassVol: 0.22, bassLen: 14,
    bass: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    leadWave: 'sine', leadVol: 0.18, leadLen: 3.4, leadOct: 1,
    lead: [4, _, _, _, 2, _, _, _, 1, _, _, _, 0, _, _, _],
    kick: [0, _, 0, _, _, _, _, _, _, _, _, _, _, _, _, _], kickVol: 0.24,
    hat: null,
    filterBase: 1000, lfoRate: 0.1, lfoDepth: 200,
  },
});
