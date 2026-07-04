// APETATO SFX — a tiny synth interpreter. Zero audio files; every sound is
// described by a plain-data "recipe" and rendered live through WebAudio.
//
// Recipe shape:
//   {
//     type: 'sine'|'square'|'saw'|'triangle'|'noise'|'fm',
//     freq: number,            // Hz (fm: carrier freq; noise: bandpass center)
//     freqEnd?: number,        // pitch slide target
//     dur: number,             // seconds
//     attack?: number,         // seconds (default 0.005)
//     decay?: number,          // seconds (default dur - attack)
//     vol?: number,            // 0..1 peak (default 0.5)
//     filterType?: string,     // 'lowpass'|'highpass'|'bandpass'|...
//     filterFreq?: number,     // Hz
//     filterFreqEnd?: number,  // filter sweep target (whoosh/explosions)
//     q?: number,              // filter resonance (default 1)
//     detune?: number,         // cents
//     slide?: 'exp'|'lin',     // pitch slide curve (default 'exp')
//     freqJitter?: number,     // random pitch spread, e.g. 0.1 = ±10%
//     fmRatio?: number,        // fm only: modulator freq = freq * fmRatio
//     fmDepth?: number,        // fm only: modulation depth in Hz
//     at?: number,             // playSeq only: start offset in seconds
//   }
//
// All entry points are silent no-ops until audio.js has created the context
// (first user gesture) — they NEVER throw.

let getAudio = null;

/** Wired by initAudio(): receives audio.js's getAudio accessor. */
export function initSfx(getAudioFn) {
  getAudio = getAudioFn;
}

// Voice cap: under event storms (200/sec) the throttles in audioEvents.js do
// most of the work; this is the hard backstop against crackle/overload.
const MAX_VOICES = 24;
let activeVoices = 0;

const OSC_TYPE = {
  sine: 'sine',
  square: 'square',
  saw: 'sawtooth',
  triangle: 'triangle',
};

let noiseBuf = null;
function noiseBuffer(ctx) {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 1.0);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function voiceEnded() {
  if (activeVoices > 0) activeVoices--;
}

function buildVoice(ctx, dest, r, t0) {
  const dur = Math.max(0.01, Number(r.dur) || 0.1);
  const attack = Math.max(0.001, r.attack !== undefined ? r.attack : 0.005);
  const decay = Math.max(0.01, r.decay !== undefined ? r.decay : dur - attack);
  const vol = r.vol !== undefined ? r.vol : 0.5;
  if (vol <= 0) return;
  const tEnd = t0 + attack + decay;

  // Cosmetic random pitch spread (e.g. pickup_xp ±10%).
  let f0 = Math.max(1, Number(r.freq) || 440);
  let f1 = r.freqEnd !== undefined ? Math.max(1, Number(r.freqEnd)) : null;
  if (r.freqJitter) {
    const j = 1 + (Math.random() * 2 - 1) * r.freqJitter;
    f0 *= j;
    if (f1 !== null) f1 *= j;
  }

  // --- source ---------------------------------------------------------
  let src;
  let modOsc = null;
  let autoFilter = null;

  if (r.type === 'noise') {
    src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    // A bare freq on noise means "bandpass it around freq".
    if (r.freq && !r.filterType && !r.filterFreq) {
      autoFilter = ctx.createBiquadFilter();
      autoFilter.type = 'bandpass';
      autoFilter.frequency.setValueAtTime(f0, t0);
      autoFilter.Q.value = r.q !== undefined ? r.q : 1;
    }
  } else if (r.type === 'fm') {
    src = ctx.createOscillator();
    src.type = 'sine';
    modOsc = ctx.createOscillator();
    modOsc.type = 'sine';
    modOsc.frequency.setValueAtTime(f0 * (r.fmRatio !== undefined ? r.fmRatio : 2), t0);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(r.fmDepth !== undefined ? r.fmDepth : f0 * 1.5, t0);
    modOsc.connect(modGain);
    modGain.connect(src.frequency);
  } else {
    src = ctx.createOscillator();
    src.type = OSC_TYPE[r.type] || 'sine';
  }

  // --- pitch ------------------------------------------------------------
  if (r.type !== 'noise') {
    src.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) {
      if (r.slide === 'lin') src.frequency.linearRampToValueAtTime(f1, tEnd);
      else src.frequency.exponentialRampToValueAtTime(f1, tEnd);
    }
    if (r.detune && src.detune) src.detune.setValueAtTime(r.detune, t0);
  }

  // --- filter -----------------------------------------------------------
  let filter = autoFilter;
  if (!filter && (r.filterType || r.filterFreq)) {
    filter = ctx.createBiquadFilter();
    filter.type = r.filterType || 'lowpass';
    filter.frequency.setValueAtTime(Math.max(10, r.filterFreq || 1200), t0);
    filter.Q.value = r.q !== undefined ? r.q : 1;
  }
  if (filter && r.filterFreqEnd) {
    if (r.slide === 'lin') filter.frequency.linearRampToValueAtTime(Math.max(10, r.filterFreqEnd), tEnd);
    else filter.frequency.exponentialRampToValueAtTime(Math.max(10, r.filterFreqEnd), tEnd);
  }

  // --- envelope ---------------------------------------------------------
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(vol, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0008, tEnd);

  if (filter) {
    src.connect(filter);
    filter.connect(env);
  } else {
    src.connect(env);
  }
  env.connect(dest);

  const stopAt = tEnd + 0.03;
  activeVoices++;
  src.onended = () => {
    voiceEnded();
    try {
      env.disconnect();
    } catch (_) {
      /* already gone */
    }
  };
  src.start(t0);
  src.stop(stopAt);
  if (modOsc) {
    modOsc.start(t0);
    modOsc.stop(stopAt);
  }
}

/**
 * Render one recipe. `offset` delays the start (seconds from now).
 * Silent no-op before the first user gesture. Never throws.
 */
export function play(recipe, offset = 0) {
  const a = getAudio && getAudio();
  if (!a || !recipe) return;
  if (activeVoices >= MAX_VOICES) return;
  try {
    buildVoice(a.ctx, a.sfxGain, recipe, a.ctx.currentTime + Math.max(0, offset));
  } catch (err) {
    console.warn('[sfx] bad recipe:', err);
  }
}

/** Play a sequence of recipes; each may carry `.at` (offset seconds). */
export function playSeq(recipes) {
  if (!Array.isArray(recipes)) return;
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    if (r) play(r, r.at || 0);
  }
}

// ---------------------------------------------------------------------------
// Named recipes. A value may be a single recipe or an array (played via
// playSeq). Tuned to sit together in one mix: UI quiet, combat mid, stings hot.
// ---------------------------------------------------------------------------

export const SFX = Object.freeze({
  // -- weapons --------------------------------------------------------------
  shoot_pop: { type: 'square', freq: 520, freqEnd: 180, dur: 0.07, attack: 0.002, vol: 0.24, filterType: 'lowpass', filterFreq: 2600, freqJitter: 0.06 },
  shoot_heavy: { type: 'fm', freq: 150, freqEnd: 55, dur: 0.22, attack: 0.003, vol: 0.5, fmRatio: 1.4, fmDepth: 220, filterType: 'lowpass', filterFreq: 900, freqJitter: 0.05 },
  shoot_laser: { type: 'saw', freq: 1500, freqEnd: 240, dur: 0.16, attack: 0.002, vol: 0.2, filterType: 'bandpass', filterFreq: 1400, q: 2, freqJitter: 0.04 },
  shoot_pluck: { type: 'triangle', freq: 700, freqEnd: 330, dur: 0.09, attack: 0.002, vol: 0.3, freqJitter: 0.06 },
  swing: { type: 'noise', dur: 0.16, attack: 0.02, vol: 0.3, filterType: 'bandpass', filterFreq: 450, filterFreqEnd: 2400, q: 1.2 },

  // -- impacts --------------------------------------------------------------
  hit_soft: { type: 'triangle', freq: 210, freqEnd: 95, dur: 0.06, attack: 0.002, vol: 0.3, freqJitter: 0.1 },
  hit_crunch: [
    { type: 'noise', dur: 0.09, vol: 0.4, filterType: 'lowpass', filterFreq: 1100 },
    { type: 'square', freq: 160, freqEnd: 70, dur: 0.08, vol: 0.35 },
  ],
  crit: [
    { type: 'square', freq: 880, dur: 0.05, attack: 0.002, vol: 0.28 },
    { type: 'square', freq: 1320, freqEnd: 1760, dur: 0.09, vol: 0.28, at: 0.045 },
    { type: 'noise', dur: 0.06, vol: 0.18, filterType: 'highpass', filterFreq: 4000 },
  ],
  explosion: [
    { type: 'noise', dur: 0.55, attack: 0.004, vol: 0.7, filterType: 'lowpass', filterFreq: 2800, filterFreqEnd: 120 },
    { type: 'sine', freq: 110, freqEnd: 28, dur: 0.5, vol: 0.8 },
  ],

  // -- enemies / player -------------------------------------------------
  enemy_die: { type: 'square', freq: 320, freqEnd: 70, dur: 0.18, vol: 0.3, freqJitter: 0.12, filterType: 'lowpass', filterFreq: 1800 },
  squish: { type: 'fm', freq: 280, freqEnd: 60, dur: 0.14, vol: 0.34, fmRatio: 0.5, fmDepth: 180, filterType: 'lowpass', filterFreq: 800, freqJitter: 0.15 },
  player_hurt: [
    { type: 'saw', freq: 260, freqEnd: 90, dur: 0.25, vol: 0.45, filterType: 'lowpass', filterFreq: 1200 },
    { type: 'noise', dur: 0.12, vol: 0.28, filterType: 'bandpass', filterFreq: 700 },
  ],
  dodge: { type: 'triangle', freq: 300, freqEnd: 950, dur: 0.12, attack: 0.01, vol: 0.22 },

  // -- pickups / progression ----------------------------------------------
  pickup_xp: { type: 'sine', freq: 900, freqEnd: 1500, dur: 0.09, attack: 0.002, vol: 0.24, freqJitter: 0.1 }, // rising ping, random ±10%
  pickup_coin: [
    { type: 'square', freq: 988, dur: 0.06, attack: 0.002, vol: 0.2 },
    { type: 'square', freq: 1319, dur: 0.12, attack: 0.002, vol: 0.2, at: 0.06 },
  ],
  levelup: [ // 4-note major arp: C5 E5 G5 C6
    { type: 'triangle', freq: 523.25, dur: 0.12, vol: 0.32 },
    { type: 'triangle', freq: 659.25, dur: 0.12, vol: 0.32, at: 0.09 },
    { type: 'triangle', freq: 783.99, dur: 0.12, vol: 0.32, at: 0.18 },
    { type: 'triangle', freq: 1046.5, dur: 0.3, vol: 0.36, at: 0.27 },
  ],

  // -- shop / UI ---------------------------------------------------------
  buy: [
    { type: 'triangle', freq: 660, dur: 0.07, vol: 0.3 },
    { type: 'triangle', freq: 990, dur: 0.12, vol: 0.3, at: 0.07 },
  ],
  reroll: [
    { type: 'square', freq: 500, dur: 0.04, vol: 0.22 },
    { type: 'square', freq: 620, dur: 0.04, vol: 0.22, at: 0.05 },
    { type: 'square', freq: 760, dur: 0.05, vol: 0.24, at: 0.1 },
  ],
  ui_click: { type: 'square', freq: 820, freqEnd: 660, dur: 0.035, attack: 0.001, vol: 0.16 },
  ui_deny: [
    { type: 'square', freq: 220, dur: 0.08, vol: 0.24 },
    { type: 'square', freq: 175, dur: 0.12, vol: 0.24, at: 0.09 },
  ],

  // -- flow stings ---------------------------------------------------------
  wave_start: [
    { type: 'saw', freq: 220, freqEnd: 440, dur: 0.3, vol: 0.3, filterType: 'lowpass', filterFreq: 2000, slide: 'lin' },
    { type: 'fm', freq: 440, dur: 0.25, vol: 0.25, at: 0.28, fmRatio: 2, fmDepth: 120 },
  ],
  wave_end: [
    { type: 'triangle', freq: 523.25, dur: 0.12, vol: 0.3 },
    { type: 'triangle', freq: 783.99, dur: 0.28, vol: 0.3, at: 0.12 },
  ],
  boss_roar: [
    { type: 'fm', freq: 75, freqEnd: 45, dur: 0.9, attack: 0.05, vol: 0.7, fmRatio: 0.35, fmDepth: 90, filterType: 'lowpass', filterFreq: 500 },
    { type: 'noise', dur: 0.8, attack: 0.1, vol: 0.32, filterType: 'lowpass', filterFreq: 400 },
  ],
  boss_die: [
    { type: 'noise', dur: 0.7, attack: 0.004, vol: 0.7, filterType: 'lowpass', filterFreq: 3000, filterFreqEnd: 100 },
    { type: 'sine', freq: 100, freqEnd: 24, dur: 0.7, vol: 0.8 },
    { type: 'saw', freq: 420, freqEnd: 50, dur: 0.8, vol: 0.3, at: 0.15, filterType: 'lowpass', filterFreq: 1200 },
    { type: 'noise', dur: 0.5, vol: 0.5, at: 0.35, filterType: 'lowpass', filterFreq: 1500, filterFreqEnd: 80 },
  ],
  victory_sting: [ // major fanfare: C5 E5 G5 C6 + held E6
    { type: 'square', freq: 523.25, dur: 0.14, vol: 0.3 },
    { type: 'square', freq: 659.25, dur: 0.14, vol: 0.3, at: 0.12 },
    { type: 'square', freq: 783.99, dur: 0.14, vol: 0.3, at: 0.24 },
    { type: 'square', freq: 1046.5, dur: 0.4, vol: 0.32, at: 0.36 },
    { type: 'triangle', freq: 1318.5, dur: 0.7, attack: 0.02, vol: 0.26, at: 0.52 },
  ],
  death_sting: [ // slow minor descent: A4 F4 E4 A3
    { type: 'sine', freq: 440, dur: 0.4, attack: 0.02, vol: 0.32 },
    { type: 'sine', freq: 349.23, dur: 0.4, attack: 0.02, vol: 0.32, at: 0.35 },
    { type: 'sine', freq: 329.63, dur: 0.45, attack: 0.02, vol: 0.32, at: 0.7 },
    { type: 'sine', freq: 220, dur: 0.9, attack: 0.03, vol: 0.36, at: 1.1 },
  ],

  // -- statuses -----------------------------------------------------------
  status_burn: { type: 'noise', dur: 0.09, attack: 0.01, vol: 0.18, filterType: 'highpass', filterFreq: 2500 },
  status_poison: { type: 'fm', freq: 320, freqEnd: 180, dur: 0.16, vol: 0.2, fmRatio: 0.25, fmDepth: 120, freqJitter: 0.1 },
  shield_break: [
    { type: 'noise', dur: 0.25, vol: 0.38, filterType: 'highpass', filterFreq: 3000 },
    { type: 'sine', freq: 1400, freqEnd: 300, dur: 0.3, vol: 0.28 },
  ],
});

/** Play a named recipe from the SFX map (no-op for unknown names). */
export function playSfx(name) {
  const r = SFX[name];
  if (!r) return;
  if (Array.isArray(r)) playSeq(r);
  else play(r);
}
