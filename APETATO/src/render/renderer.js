// APETATO render/renderer — the ONE public rendering API.
//
// Game logic calls into renderApi; the renderer never mutates game state
// except entity.instanceSlot (via instanced.js) and player.mesh (owned here).
//
//   const renderApi = initRenderer(gameCanvas, fxCanvas);
//   renderApi = {
//     beginRun(arenaDef), endRun(),
//     syncState(state),                    // every rAF while a run is live
//     vfx(type, x, z, opts),
//     damageNumber(x, z, amount, kind),
//     shake(intensity),                    // 0..1 additive, decays ~6/s
//     buildPreview(modelSpec, domElement) -> dispose(),
//     resize(),
//     cameraRig,                           // exposes screenToWorld(sx,sy,out)
//   }
//
// Bus subscriptions (auto feedback): enemy:hit, enemy:death, explosion, crit,
// player:hit, player:levelup, pickup:collect, weapon:fire, boss:spawn,
// boss:death, boss:phase, settings:changed. The bus import is dynamic +
// guarded so this module still loads standalone.

import * as THREE from 'three';
import { createCameraRig } from './cameraRig.js';
import { createLights } from './lights.js';
import { createInstancedManager, KIND_ENEMY, KIND_PROJECTILE, KIND_PICKUP } from './instanced.js';
import { createParticles } from './particles.js';
import { createVfx } from './vfx.js';
import { createDamageNumbers } from './damageNumbers.js';
import { buildArena } from './arenaBuilder.js';
import { buildGroup } from './models.js';

const HALF_PI = Math.PI / 2;
const MAX_FRAME_DT = 0.1;
const BACKGROUND = 0x0b0e12; // matches the page background

/**
 * Initialize the rendering layer on the two full-screen canvases.
 * @param {HTMLCanvasElement} gameCanvas #game-canvas (WebGL)
 * @param {HTMLCanvasElement} fxCanvas #fx-canvas (2D overlay)
 */
export function initRenderer(gameCanvas, fxCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.add(createLights());

  const cameraRig = createCameraRig();
  const instanced = createInstancedManager(scene);
  const particles = createParticles(scene);
  const vfxSys = createVfx(scene, particles);
  const dmg = createDamageNumbers(fxCanvas);

  // --- run-scoped state -------------------------------------------------------
  let arena = null; // { group, dispose }
  let runLive = false;
  let shakeMult = 1; // save settings 'screenShake' multiplier

  // Animated groups for players / boss / companions.
  /** @type {Set<object>} player objects whose .mesh we created */
  const playerRefs = new Set();
  /** @type {Map<object, {group: THREE.Group, stamp: number}>} entity -> group */
  const groupTracker = new Map();
  let frameStamp = 0;

  // Render clock (independent of the fixed-step sim clock).
  let lastNow = -1;
  let elapsed = 0;

  // Last known player position — fallback anchor for bus-driven vfx.
  let lastPX = 0;
  let lastPZ = 0;

  // Last known boss position — anchor for boss:phase feedback (the phase
  // payload carries no coordinates).
  let lastBossX = 0;
  let lastBossZ = 0;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function syncPlayer(p, t) {
    if (!p) return;
    if (!p.mesh || !p.mesh.parent) {
      // (Re)build on first sight (or when a stale detached mesh survived an
      // endRun) — player.mesh is ours to manage.
      p.mesh = buildGroup((p.character && p.character.model) || null);
      scene.add(p.mesh);
      playerRefs.add(p);
    }
    p.mesh.position.set(p.x || 0, 0, p.z || 0);
    p.mesh.rotation.y = HALF_PI - (p.facing || 0);
    if (p.mesh.userData.animate) p.mesh.userData.animate(t, 1);
  }

  function syncGroupEntity(e, model, t) {
    let rec = groupTracker.get(e);
    if (!rec) {
      rec = { group: buildGroup(model || (e.def && e.def.model) || null), stamp: 0 };
      scene.add(rec.group);
      groupTracker.set(e, rec);
    }
    rec.stamp = frameStamp;
    rec.group.position.set(e.x || 0, 0, e.z || 0);
    rec.group.rotation.y = HALF_PI - (e.facing || 0);
    if (rec.group.userData.animate) rec.group.userData.animate(t, 1);
  }

  function sweepGroups() {
    for (const [e, rec] of groupTracker) {
      if (rec.stamp !== frameStamp) {
        scene.remove(rec.group);
        groupTracker.delete(e);
      }
    }
  }

  function clearRunVisuals() {
    for (const p of playerRefs) {
      if (p.mesh) {
        scene.remove(p.mesh);
        p.mesh = null;
      }
    }
    playerRefs.clear();
    for (const [, rec] of groupTracker) scene.remove(rec.group);
    groupTracker.clear();
    instanced.reset();
    particles.reset();
    vfxSys.reset();
    dmg.clear();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Build arena visuals and reset all dynamic pools for a fresh run. */
  function beginRun(arenaDef) {
    if (arena) {
      arena.dispose();
      arena = null;
    }
    clearRunVisuals();
    arena = buildArena(arenaDef);
    scene.add(arena.group);
    const w = (arenaDef && (arenaDef.w || arenaDef.width)) || 44;
    const h = (arenaDef && (arenaDef.h || arenaDef.height)) || 28;
    cameraRig.setBounds(w, h);
    cameraRig.snap(0, 0);
    lastNow = -1;
    runLive = true;
  }

  /** Tear down arena + all run-scoped visuals. */
  function endRun() {
    runLive = false;
    if (arena) {
      arena.dispose();
      arena = null;
    }
    clearRunVisuals();
    renderer.render(scene, cameraRig.camera); // leave a clean frame behind
  }

  /**
   * Mirror the (read-only) game state into the scene and render one frame.
   * Called every rAF while a run is live.
   */
  function syncState(state) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    let dt = lastNow < 0 ? 1 / 60 : now - lastNow;
    lastNow = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (dt < 0) dt = 0;
    elapsed += dt;
    const t = elapsed;
    frameStamp++;

    if (state) {
      // Players (animated groups; player.mesh is ours).
      const players = state.players;
      if (players) {
        for (let i = 0; i < players.length; i++) syncPlayer(players[i], t);
        const p0 = players[0];
        if (p0) {
          cameraRig.follow(p0.x || 0, p0.z || 0);
          lastPX = p0.x || 0;
          lastPZ = p0.z || 0;
        }
      }

      // Enemies / projectiles / pickups via instancing.
      instanced.beginFrame();
      instanced.syncList(state.enemies, KIND_ENEMY, t);
      instanced.syncList(state.projectiles, KIND_PROJECTILE, t);
      instanced.syncList(state.pickups, KIND_PICKUP, t);
      instanced.endFrame();

      // Boss + companions as animated groups.
      if (state.boss && state.boss.ent && state.boss.ent.active !== false) {
        syncGroupEntity(state.boss.ent, state.boss.def && state.boss.def.model, t);
        lastBossX = state.boss.ent.x || 0;
        lastBossZ = state.boss.ent.z || 0;
      }
      const comps = state.companions;
      if (comps) {
        for (let i = 0; i < comps.length; i++) {
          const c = comps[i];
          if (c && c.active !== false) syncGroupEntity(c, null, t);
        }
      }
      sweepGroups();
    }

    if (arena && arena.group.userData.update) arena.group.userData.update(t, dt);
    particles.update(dt);
    vfxSys.update(dt);
    cameraRig.update(dt);
    dmg.update(dt, cameraRig.camera);
    renderer.render(scene, cameraRig.camera);
  }

  /** One-shot effect. Types: hit, explosion, muzzle, flash, telegraph,
   *  levelup, pickup, nova, beam (opts:{x2,z2}), aura. */
  function vfx(type, x, z, opts) {
    vfxSys.spawn(type, x, z, opts);
  }

  /** Floating combat number. kind: normal|crit|player|heal|poison|burn. */
  function damageNumber(x, z, amount, kind) {
    dmg.spawn(x, z, amount, kind);
  }

  /** Additive screen shake, 0..1 per impulse (settings multiplier applied). */
  function shake(intensity) {
    cameraRig.addShake((intensity || 0) * shakeMult);
  }

  /** Match the canvases + camera to the current viewport. */
  function resize() {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    renderer.setSize(w, h, false); // CSS handles display size
    cameraRig.setSize(w, h);
    dmg.resize();
  }

  /**
   * Standalone spinning model preview (character select, shop, etc.).
   * Appends its own small canvas to domElement; returns a dispose() that
   * removes it and frees the GL context.
   */
  function buildPreview(modelSpec, domElement) {
    const w = Math.max(64, domElement.clientWidth || 220);
    const h = Math.max(64, domElement.clientHeight || 220);
    const prevRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    prevRenderer.outputColorSpace = THREE.SRGBColorSpace;
    prevRenderer.setPixelRatio(dpr);
    prevRenderer.setSize(w, h);
    prevRenderer.domElement.style.display = 'block';
    domElement.appendChild(prevRenderer.domElement);

    const prevScene = new THREE.Scene();
    prevScene.add(createLights());
    const group = buildGroup(modelSpec);
    prevScene.add(group);

    // Frame the model with a little headroom.
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.72;
    const cam = new THREE.OrthographicCamera(
      -radius * (w / h), radius * (w / h), radius, -radius, 0.1, 100
    );
    cam.position.set(center.x + 2.2, center.y + 1.9, center.z + 2.2);
    cam.lookAt(center);

    let disposed = false;
    let raf = 0;
    let pt = 0;
    let prevLast = -1;

    function loop(nowMs) {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const nowS = nowMs / 1000;
      const pdt = prevLast < 0 ? 1 / 60 : Math.min(0.1, nowS - prevLast);
      prevLast = nowS;
      pt += pdt;
      group.rotation.y = pt * 0.9;
      if (group.userData.animate) group.userData.animate(pt, 1);
      prevRenderer.render(prevScene, cam);
    }
    if (typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop);

    return function dispose() {
      if (disposed) return;
      disposed = true;
      if (raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      if (prevRenderer.domElement.parentNode === domElement) {
        domElement.removeChild(prevRenderer.domElement);
      }
      // Model geometries/materials are shared caches (models.js) — only the
      // GL context itself belongs to this preview.
      prevRenderer.dispose();
    };
  }

  const renderApi = {
    beginRun,
    endRun,
    syncState,
    vfx,
    damageNumber,
    shake,
    buildPreview,
    resize,
    cameraRig,
  };

  // --- bus wiring (guarded: renderer must load standalone) ---------------------

  // Reused opts objects — bus handlers fire in hot paths; never allocate.
  const PICKUP_COLORS = {
    xp: '#4da6ff', // blue
    coin: '#ffe14d', // yellow
    heal: '#66ff88', // green
    crate: '#ffb830', // gold
  };
  const PICKUP_OPTS = { color: '#4da6ff' };
  const MUZZLE_OPTS = { color: '#fff2b0', radius: 0.24 };
  const DEATH_FLASH_OPTS = { color: '#ffffff', radius: 0.45, duration: 0.08 };
  const PHASE_FLASH_OPTS = { color: '#ff8a5a', radius: 1.4, duration: 0.18 };
  // Weapon behaviors that read as a "shot" from the player — these get a
  // muzzle flash. Melee/orbit/aura/pet families do not.
  const MUZZLE_BEHAVIORS = {
    projectile: true,
    burst: true,
    shotgun: true,
    lobbed: true,
    rail: true,
    beam: true,
  };

  import('../core/bus.js')
    .then(({ bus }) => {
      if (!bus) return;
      const evX = (e) => (e && typeof e.x === 'number' ? e.x : e && e.ent && typeof e.ent.x === 'number' ? e.ent.x : lastPX);
      const evZ = (e) => (e && typeof e.z === 'number' ? e.z : e && e.ent && typeof e.ent.z === 'number' ? e.ent.z : lastPZ);

      bus.on('enemy:hit', (e) => {
        const x = evX(e);
        const z = evZ(e);
        vfx('hit', x, z, e);
        const amount = e && (e.damage !== undefined ? e.damage : e.amount);
        if (amount !== undefined) {
          const kind = e && e.kind && e.kind !== 'normal' ? e.kind : e && e.crit ? 'crit' : 'normal';
          damageNumber(x, z, amount, kind);
        }
      });
      const onDeath = (e) => {
        const c = (e && (e.color || (e.def && e.def.model && e.def.model.primary))) || '#c9c2b8';
        const x = evX(e);
        const z = evZ(e);
        const elite = !!(e && e.elite);
        particles.burst(x, z, c, elite ? 30 : 18, elite ? 7.5 : 6);
        DEATH_FLASH_OPTS.color = c;
        DEATH_FLASH_OPTS.radius = elite ? 0.85 : 0.45;
        DEATH_FLASH_OPTS.duration = elite ? 0.12 : 0.08;
        vfx('flash', x, z, DEATH_FLASH_OPTS);
        if (elite) shake(0.08);
      };
      bus.on('enemy:death', onDeath);
      bus.on('enemy:died', onDeath); // alias used by some kernel docs
      bus.on('explosion', (e) => {
        vfx('explosion', evX(e), evZ(e), e);
        shake(0.25);
      });
      bus.on('crit', () => shake(0.18));
      bus.on('player:hit', () => {
        dmg.vignette(0.85);
        shake(0.35);
      });
      bus.on('player:levelup', (e) => {
        vfx('levelup', evX(e), evZ(e));
      });
      bus.on('pickup:collect', (e) => {
        PICKUP_OPTS.color = PICKUP_COLORS[e && e.ptype] || '#9fffb0';
        vfx('pickup', evX(e), evZ(e), PICKUP_OPTS);
      });
      bus.on('weapon:fire', (e) => {
        if (e && MUZZLE_BEHAVIORS[e.behavior] === true) {
          vfx('muzzle', evX(e), evZ(e), MUZZLE_OPTS);
        }
      });
      bus.on('boss:spawn', () => shake(0.5));
      bus.on('boss:death', (e) => {
        shake(0.35);
        vfx('explosion', evX(e), evZ(e));
      });
      bus.on('boss:phase', () => {
        shake(0.25);
        vfx('flash', lastBossX, lastBossZ, PHASE_FLASH_OPTS);
      });
      bus.on('settings:changed', (s) => {
        if (!s) return;
        if (typeof s.screenShake === 'number') shakeMult = s.screenShake;
        if (typeof s.damageNumbers === 'boolean') dmg.setEnabled(s.damageNumbers);
      });
    })
    .catch((err) => {
      console.warn('[render] bus unavailable — auto feedback disabled:', err && err.message);
    });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
    // Console handle for the __demo acceptance test.
    window.__APETATO_RENDER = renderApi;
  }
  resize();
  renderer.render(scene, cameraRig.camera);

  return renderApi;
}

// -----------------------------------------------------------------------------
// Dev demo mode — acceptance test. From the browser console:
//   const m = await import('/src/render/renderer.js');
//   const demo = m.__demo(window.__APETATO_RENDER);   // demo.stop() to end
// Spawns 300 fake enemies + 200 projectiles (+ pickups, boss, companion,
// particles, vfx, damage numbers) and logs sustained FPS every 2 seconds.
// -----------------------------------------------------------------------------

export function __demo(renderApi) {
  const api = renderApi || (typeof window !== 'undefined' && window.__APETATO_RENDER);
  if (!api) throw new Error('__demo: pass the renderApi from initRenderer()');

  const TAU = Math.PI * 2;

  api.beginRun({
    id: 'demo_grove',
    w: 60,
    h: 40,
    groundColor: '#3f7d2c',
    propDensity: 0.5,
    obstacles: [
      { type: 'rock', x: -12, z: -6, r: 1.3 },
      { type: 'tree', x: 10, z: 8, r: 1.1 },
      { type: 'pillar', x: -8, z: 10, r: 0.9 },
      { type: 'crate', x: 14, z: -9, r: 1 },
    ],
    hazards: [
      { type: 'lava_pool', x: -18, z: 10, r: 2.2 },
      { type: 'poison_puddle', x: 18, z: -12, r: 1.8 },
      { type: 'banana_storm', x: 0, z: -14, r: 1.6, interval: 3 },
      { type: 'geyser', x: 20, z: 12, r: 1.2 },
      { type: 'thorn_patch', x: -20, z: -12, r: 1.5 },
      { type: 'dark_zone', x: 8, z: 14, r: 2.5 },
    ],
  });

  const enemyModels = [
    { key: 'demo_blob', model: { base: 'blob', scale: 1, primary: '#7ec850', secondary: '#3f6d20', accent: '#ffffff', animation: 'hop' } },
    { key: 'demo_crab', model: { base: 'crab', scale: 1, primary: '#d9534f', secondary: '#a33a2b', accent: '#fff2b0', animation: 'bob' } },
    { key: 'demo_drone', model: { base: 'drone', scale: 1, primary: '#8f9aa3', secondary: '#5d666e', accent: '#7ef3ff', animation: 'hover' } },
    { key: 'demo_bug', model: { base: 'bug', scale: 1.15, primary: '#6b4a8a', secondary: '#4a3060', accent: '#ffd23f', animation: 'bob' } },
  ];
  const projKeys = ['banana', 'laser', 'fireball', 'rock'];
  const pickKeys = ['xp_banana', 'coin', 'heal_fruit', 'crate'];

  const enemies = [];
  for (let i = 0; i < 300; i++) {
    const m = enemyModels[i % enemyModels.length];
    enemies.push({
      active: true,
      x: 0, z: 0, facing: 0, radius: 0.5,
      archetype: m.key,
      def: { model: m.model },
      elite: i % 23 === 0 ? { tint: '#ffd23f' } : null,
      hitFlash: 0,
      instanceSlot: -1,
      // demo-only motion params
      _a: (i / 300) * TAU,
      _d: 4 + (i % 60) * 0.35,
      _w: 0.25 + (i % 7) * 0.06,
    });
  }
  const projectiles = [];
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * TAU;
    projectiles.push({
      active: true,
      x: 0, z: 0, facing: a, radius: 0.2,
      archetype: projKeys[i % projKeys.length],
      ptype: i % 17 === 0 ? 'boomerang' : 'straight',
      vx: Math.cos(a) * 9,
      vz: Math.sin(a) * 9,
      instanceSlot: -1,
      _life: (i / 200) * 2,
    });
  }
  const pickups = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    pickups.push({
      active: true,
      x: Math.cos(a * 3.7) * (6 + (i % 5) * 3.2),
      z: Math.sin(a * 2.3) * (5 + (i % 4) * 3.1),
      archetype: pickKeys[i % pickKeys.length],
      kind: pickKeys[i % pickKeys.length],
      instanceSlot: -1,
    });
  }
  const players = [{
    x: 0, z: 0, facing: 0, hp: 10,
    character: {
      model: {
        base: 'ape', scale: 1.1, primary: '#4a4a4a', secondary: '#2b2b2b', accent: '#d9b38c',
        animation: 'hop',
      },
    },
    mesh: null,
  }];
  const boss = {
    ent: { active: true, x: 0, z: -10, facing: 0, id: 'demo_boss' },
    def: { model: { base: 'golem', scale: 2.2, primary: '#6e5a44', secondary: '#4a3b2c', accent: '#ff5a2b', animation: 'stomp' } },
  };
  const companions = [
    { active: true, x: 1.5, z: 1.5, facing: 0, def: { model: { base: 'drone', scale: 0.7, primary: '#c98a3b', secondary: '#8f9aa3', accent: '#7ec8e3', animation: 'hover' } } },
  ];

  const state = { players, enemies, projectiles, pickups, companions, boss, arena: null };

  let t = 0;
  let raf = 0;
  let stopped = false;
  let last = typeof performance !== 'undefined' ? performance.now() : 0;
  let frames = 0;
  let fpsWindow = 0;
  let fxTimer = 0;
  const stats = { fps: 0 };

  function loop(now) {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    t += dt;

    // Player strolls a lazy figure-8; camera follows.
    const p = players[0];
    p.x = Math.sin(t * 0.5) * 12;
    p.z = Math.sin(t * 1.0) * 7;
    p.facing = Math.atan2(Math.cos(t) * 7, Math.cos(t * 0.5) * 6);

    // Enemies orbit the player at varied radii/speeds.
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e._a += e._w * dt;
      e.x = p.x + Math.cos(e._a) * e._d;
      e.z = p.z + Math.sin(e._a) * e._d * 0.7;
      e.facing = Math.atan2(p.z - e.z, p.x - e.x);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (Math.random() < 0.004) e.hitFlash = 0.15;
    }

    // Projectiles fly out from the player and respawn.
    for (let i = 0; i < projectiles.length; i++) {
      const pr = projectiles[i];
      pr._life += dt;
      if (pr._life > 2) {
        pr._life = 0;
        const a = Math.random() * TAU;
        pr.x = p.x;
        pr.z = p.z;
        pr.vx = Math.cos(a) * (8 + Math.random() * 5);
        pr.vz = Math.sin(a) * (8 + Math.random() * 5);
      }
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
    }

    boss.ent.x = Math.cos(t * 0.23) * 14;
    boss.ent.z = -8 + Math.sin(t * 0.31) * 5;
    boss.ent.facing = Math.atan2(p.z - boss.ent.z, p.x - boss.ent.x);
    companions[0].x = p.x + Math.cos(t * 2) * 1.8;
    companions[0].z = p.z + Math.sin(t * 2) * 1.8;

    // Periodic effects exercise vfx + damage numbers + shake.
    fxTimer -= dt;
    if (fxTimer <= 0) {
      fxTimer = 0.4;
      const e = enemies[(Math.random() * enemies.length) | 0];
      const crit = Math.random() < 0.25;
      api.vfx('hit', e.x, e.z);
      api.damageNumber(e.x, e.z, 3 + Math.random() * 60, crit ? 'crit' : 'normal');
      if (Math.random() < 0.3) {
        api.vfx('explosion', e.x, e.z, { radius: 1.8 });
        api.shake(0.25);
      }
      if (Math.random() < 0.15) api.vfx('nova', p.x, p.z, { radius: 5 });
      if (Math.random() < 0.15) api.vfx('beam', p.x, p.z, { x2: e.x, z2: e.z });
      if (Math.random() < 0.1) api.vfx('telegraph', e.x, e.z, { radius: 2, duration: 0.8 });
      if (Math.random() < 0.08) api.vfx('levelup', p.x, p.z);
    }

    api.syncState(state);

    frames++;
    fpsWindow += dt;
    if (fpsWindow >= 2) {
      stats.fps = Math.round(frames / fpsWindow);
      console.log('[__demo] fps:', stats.fps, '| enemies:', enemies.length, '| projectiles:', projectiles.length);
      frames = 0;
      fpsWindow = 0;
    }
  }
  raf = requestAnimationFrame(loop);

  return {
    stats,
    state,
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      api.endRun();
    },
  };
}
