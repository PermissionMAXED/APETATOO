// APETATO render/damageNumbers — 2D canvas overlay on #fx-canvas.
//
// Pooled 128 records, DPR-aware, projected world->screen every frame with the
// game camera. Also owns the full-screen vignette flash (player damage) since
// it holds the only 2D context on the overlay canvas.
//
// Feel contract:
//   fontSize = 13 + 9 * log10(1 + amount) px
//   rise 28px over 0.7s, pop-in scale 1.3 -> 1 in 80ms
//   colors: normal #fff, crit #ffd23f (x1.5 size + 'CRIT' sparkle),
//           player #ff5544, heal #66ff88, poison #9be352, burn #ff9a3d
//   merge hits on the same target within 60ms; cap 128 (drop smallest).

import * as THREE from 'three';

const POOL = 128;
const LIFE = 0.7;
const RISE_PX = 28;
const POP_T = 0.08;
const MERGE_WINDOW = 0.06;
const MERGE_DIST2 = 0.45 * 0.45; // "same target" proxy: within 0.45 world units
const WORLD_Y = 1.35; // numbers float above heads

const COLORS = {
  normal: '#ffffff',
  crit: '#ffd23f',
  player: '#ff5544',
  heal: '#66ff88',
  poison: '#9be352',
  burn: '#ff9a3d',
};

/**
 * Create the damage-number overlay bound to the #fx-canvas element.
 * Safe to construct without a canvas/DOM (all methods no-op).
 */
export function createDamageNumbers(canvas) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  const recs = [];
  for (let i = 0; i < POOL; i++) {
    recs.push({ active: false, x: 0, z: 0, amount: 0, kind: 'normal', age: 0 });
  }

  let cssW = 1;
  let cssH = 1;
  let dpr = 1;
  let enabled = true;

  // Vignette flash state (red damage flash by default).
  let vigAlpha = 0;
  let vigGrad = null;

  const v = new THREE.Vector3();

  function resize() {
    if (!canvas || typeof window === 'undefined') return;
    cssW = window.innerWidth || 1;
    cssH = window.innerHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    vigGrad = null; // rebuild lazily at the new size
  }

  function buildVignette() {
    const cx = cssW / 2;
    const cy = cssH / 2;
    const rOut = Math.sqrt(cx * cx + cy * cy);
    const g = ctx.createRadialGradient(cx, cy, rOut * 0.45, cx, cy, rOut);
    g.addColorStop(0, 'rgba(255, 40, 30, 0)');
    g.addColorStop(1, 'rgba(255, 30, 20, 0.6)');
    return g;
  }

  /**
   * Queue a floating number at world (x, z).
   * @param {'normal'|'crit'|'player'|'heal'|'poison'|'burn'} kind
   */
  function spawn(x, z, amount, kind) {
    if (!enabled || !ctx) return;
    if (!COLORS[kind]) kind = 'normal';
    amount = Number(amount) || 0;

    // Merge into a fresh number on (approximately) the same target.
    for (let i = 0; i < POOL; i++) {
      const r = recs[i];
      if (!r.active || r.kind !== kind || r.age > MERGE_WINDOW) continue;
      const dx = r.x - x;
      const dz = r.z - z;
      if (dx * dx + dz * dz <= MERGE_DIST2) {
        r.amount += amount;
        r.age = 0; // re-pop with the bigger total
        return;
      }
    }

    // Grab a free slot; when the pool is saturated, evict the smallest
    // visible amount (but never for something even smaller).
    let idx = -1;
    for (let i = 0; i < POOL; i++) {
      if (!recs[i].active) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      let minAmt = Infinity;
      for (let i = 0; i < POOL; i++) {
        if (recs[i].amount < minAmt) {
          minAmt = recs[i].amount;
          idx = i;
        }
      }
      if (amount < minAmt) return; // new one is the smallest — drop it
    }
    const r = recs[idx];
    r.active = true;
    r.x = x;
    r.z = z;
    r.amount = amount;
    r.kind = kind;
    r.age = 0;
  }

  /** Flash the red damage vignette (strength 0..1). */
  function vignette(strength) {
    vigAlpha = Math.min(1, Math.max(vigAlpha, strength || 0));
  }

  /**
   * Age, project, and draw everything. Call once per rAF with the render dt
   * and the current game camera.
   */
  function update(dt, camera) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (vigAlpha > 0.004) {
      if (!vigGrad) vigGrad = buildVignette();
      ctx.globalAlpha = vigAlpha;
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.globalAlpha = 1;
      vigAlpha *= Math.exp(-dt * 4.5);
      if (vigAlpha < 0.004) vigAlpha = 0;
    }

    if (!camera) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < POOL; i++) {
      const r = recs[i];
      if (!r.active) continue;
      r.age += dt;
      if (r.age >= LIFE) {
        r.active = false;
        continue;
      }

      v.set(r.x, WORLD_Y, r.z).project(camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) continue;
      const sx = (v.x * 0.5 + 0.5) * cssW;
      const sy = (0.5 - v.y * 0.5) * cssH - RISE_PX * (r.age / LIFE);

      const isCrit = r.kind === 'crit';
      const pop = r.age < POP_T ? 1.3 - 0.3 * (r.age / POP_T) : 1;
      let px = (13 + 9 * Math.log10(1 + Math.abs(r.amount))) * pop;
      if (isCrit) px *= 1.5;
      const alpha = r.age < LIFE * 0.6 ? 1 : 1 - (r.age - LIFE * 0.6) / (LIFE * 0.4);

      const text = r.amount >= 10 ? Math.round(r.amount) : Math.round(r.amount * 10) / 10;
      ctx.globalAlpha = alpha;
      ctx.font = '700 ' + px.toFixed(1) + 'px system-ui, sans-serif';
      ctx.lineWidth = Math.max(2, px / 9);
      ctx.strokeStyle = 'rgba(10, 8, 4, 0.75)';
      ctx.fillStyle = COLORS[r.kind];
      ctx.strokeText(text, sx, sy);
      ctx.fillText(text, sx, sy);

      if (isCrit) {
        // 'CRIT' sparkle riding above the number.
        const cy2 = sy - px * 0.75;
        ctx.font = '800 ' + (px * 0.42).toFixed(1) + 'px system-ui, sans-serif';
        ctx.strokeText('CRIT', sx, cy2);
        ctx.fillStyle = '#fff6cf';
        ctx.fillText('CRIT', sx, cy2);
        const tw = px * 0.9;
        ctx.fillText('\u2726', sx - tw, cy2); // ✦
        ctx.fillText('\u2726', sx + tw, cy2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Drop all live numbers and any vignette flash. */
  function clear() {
    for (let i = 0; i < POOL; i++) recs[i].active = false;
    vigAlpha = 0;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
    }
  }

  /** Honor the save-settings damageNumbers toggle. */
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) clear();
  }

  resize();

  return { spawn, vignette, update, resize, clear, setEnabled };
}
