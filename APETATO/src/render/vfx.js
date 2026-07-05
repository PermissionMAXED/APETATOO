// APETATO render/vfx — pooled mesh effects (rings, discs, beams, flashes)
// plus particle accents. All meshes are preallocated at init and toggled
// via .visible; spawning/updating allocates nothing.
//
// Types handled: 'hit', 'explosion', 'muzzle', 'flash', 'telegraph',
// 'levelup', 'pickup', 'nova', 'beam' (opts:{x2,z2}), 'aura'.

import * as THREE from 'three';

const HALF_PI = Math.PI / 2;

const RING_COUNT = 24;
const DISC_COUNT = 12;
const BEAM_COUNT = 8;
const FLASH_COUNT = 12;

// Ring/disc animation modes.
const MODE_EXPAND = 0;
const MODE_TELEGRAPH = 1;
const MODE_AURA = 2;

const EMPTY = {};

function easeOutCubic(k) {
  const p = 1 - k;
  return 1 - p * p * p;
}

/**
 * Create the VFX system. `particles` is the object from createParticles.
 */
export function createVfx(scene, particles) {
  const root = new THREE.Group();
  root.name = 'vfx';
  scene.add(root);

  // Shared geometries (unit-sized; scaled per effect).
  const ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-HALF_PI);
  const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-HALF_PI);
  const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0); // origin at start
  const flashGeo = new THREE.SphereGeometry(1, 10, 8);

  function makePool(count, geo, yBase) {
    const pool = [];
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      // Stagger ground decals a hair in y to dodge z-fighting.
      mesh.position.y = yBase + (i % 8) * 0.005;
      root.add(mesh);
      pool.push({
        mesh,
        active: false,
        age: 0,
        dur: 1,
        r0: 0,
        r1: 1,
        alpha: 1,
        mode: MODE_EXPAND,
        yBase: mesh.position.y,
      });
    }
    return pool;
  }

  const rings = makePool(RING_COUNT, ringGeo, 0.05);
  const discs = makePool(DISC_COUNT, discGeo, 0.04);
  const beams = makePool(BEAM_COUNT, beamGeo, 0.6);
  const flashes = makePool(FLASH_COUNT, flashGeo, 0.6);

  function grab(pool) {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) return pool[i];
    }
    return null; // pool exhausted — drop the effect
  }

  function spawnRing(x, z, r0, r1, dur, color, alpha, mode) {
    const fx = grab(rings);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.dur = dur;
    fx.r0 = r0;
    fx.r1 = r1;
    fx.alpha = alpha;
    fx.mode = mode;
    fx.mesh.visible = true;
    fx.mesh.position.set(x, fx.yBase, z);
    fx.mesh.scale.setScalar(Math.max(0.001, r0));
    fx.mesh.material.color.set(color);
    fx.mesh.material.opacity = alpha;
  }

  function spawnDisc(x, z, r, dur, color, alpha, mode) {
    const fx = grab(discs);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.dur = dur;
    fx.r0 = r;
    fx.r1 = r;
    fx.alpha = alpha;
    fx.mode = mode;
    fx.mesh.visible = true;
    fx.mesh.position.set(x, fx.yBase, z);
    fx.mesh.scale.setScalar(Math.max(0.001, r));
    fx.mesh.material.color.set(color);
    fx.mesh.material.opacity = alpha;
  }

  function spawnBeam(x, z, x2, z2, width, dur, color) {
    const fx = grab(beams);
    if (!fx) return;
    const dx = x2 - x;
    const dz = z2 - z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-4) return;
    fx.active = true;
    fx.age = 0;
    fx.dur = dur;
    fx.r0 = width;
    fx.alpha = 0.9;
    fx.mesh.visible = true;
    fx.mesh.position.set(x, fx.yBase, z);
    fx.mesh.rotation.y = Math.atan2(-dz, dx); // +X local axis points at target
    fx.mesh.scale.set(len, width, width);
    fx.mesh.material.color.set(color);
    fx.mesh.material.opacity = fx.alpha;
  }

  function spawnFlash(x, z, r, dur, color) {
    const fx = grab(flashes);
    if (!fx) return;
    fx.active = true;
    fx.age = 0;
    fx.dur = dur;
    fx.r0 = r;
    fx.alpha = 0.9;
    fx.mesh.visible = true;
    fx.mesh.position.set(x, fx.yBase, z);
    fx.mesh.scale.setScalar(r * 0.6);
    fx.mesh.material.color.set(color);
    fx.mesh.material.opacity = fx.alpha;
  }

  // --- public spawn ----------------------------------------------------------

  /**
   * Fire a one-shot effect at (x, z).
   * @param {string} type
   * @param {number} x
   * @param {number} z
   * @param {object} [opts] {color, radius, duration, x2, z2, width, count}
   */
  function spawn(type, x, z, opts) {
    const o = opts || EMPTY;
    switch (type) {
      case 'hit':
        particles.spark(x, z, o.color || '#ffe08a', o.count || 6, 7);
        break;
      case 'muzzle':
        spawnFlash(x, z, o.radius || 0.22, 0.07, o.color || '#fff2b0');
        break;
      case 'flash':
        // Generic brief pop (death punch, boss phase transitions).
        spawnFlash(x, z, o.radius || 0.5, o.duration || 0.1, o.color || '#ffffff');
        break;
      case 'explosion': {
        const r = o.radius || 1.6;
        spawnFlash(x, z, r * 0.55, 0.14, o.color || '#ffb14d');
        spawnRing(x, z, r * 0.25, r * 1.25, 0.35, o.color || '#ff9a3d', 0.9, MODE_EXPAND);
        particles.burst(x, z, o.color || '#ff9a3d', 22, 7);
        particles.smoke(x, z, '#5a5048', 5);
        break;
      }
      case 'telegraph': {
        const r = o.radius || 1.4;
        const dur = o.duration || 0.8;
        const col = o.color || '#ff4444';
        spawnRing(x, z, r, r, dur, col, 0.85, MODE_TELEGRAPH);
        spawnDisc(x, z, r, dur, col, 0.14, MODE_TELEGRAPH);
        break;
      }
      case 'levelup':
        spawnRing(x, z, 0.3, 3.4, 0.55, '#ffd23f', 0.95, MODE_EXPAND);
        spawnFlash(x, z, 0.8, 0.2, '#ffd23f');
        particles.confetti(x, z, 36);
        break;
      case 'pickup':
        particles.spark(x, z, o.color || '#9fffb0', 5, 4);
        break;
      case 'nova':
        spawnRing(x, z, 0.3, o.radius || 6, 0.5, o.color || '#7ec8e3', 0.85, MODE_EXPAND);
        particles.ring(x, z, o.color || '#7ec8e3', 24, 8);
        break;
      case 'beam':
        spawnBeam(
          x, z,
          o.x2 !== undefined ? o.x2 : x,
          o.z2 !== undefined ? o.z2 : z,
          o.width || 0.18,
          o.duration || 0.12,
          o.color || '#9fe8ff'
        );
        break;
      case 'aura':
        spawnDisc(x, z, o.radius || 1.6, o.duration || 0.8, o.color || '#b18cff', 0.25, MODE_AURA);
        break;
      default:
        particles.spark(x, z, '#ffffff', 4, 5);
        break;
    }
  }

  // --- update ------------------------------------------------------------------

  function updateRingLike(pool, dt) {
    for (let i = 0; i < pool.length; i++) {
      const fx = pool[i];
      if (!fx.active) continue;
      fx.age += dt;
      const k = fx.age / fx.dur;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        fx.mesh.material.opacity = 0;
        continue;
      }
      if (fx.mode === MODE_EXPAND) {
        const s = fx.r0 + (fx.r1 - fx.r0) * easeOutCubic(k);
        fx.mesh.scale.setScalar(Math.max(0.001, s));
        fx.mesh.material.opacity = fx.alpha * (1 - k);
      } else if (fx.mode === MODE_TELEGRAPH) {
        const grow = Math.min(1, k * 3);
        fx.mesh.scale.setScalar(Math.max(0.001, fx.r1 * grow));
        // pulse, ramping up urgency near the end
        const pulse = 0.55 + 0.45 * Math.sin(fx.age * 18);
        fx.mesh.material.opacity = fx.alpha * pulse * (0.6 + 0.4 * k);
      } else {
        // MODE_AURA — gentle breathing, slow fade
        fx.mesh.scale.setScalar(Math.max(0.001, fx.r1 * (1 + 0.06 * Math.sin(fx.age * 6))));
        fx.mesh.material.opacity = fx.alpha * (1 - k * k);
      }
    }
  }

  /** Advance all live effects. */
  function update(dt) {
    updateRingLike(rings, dt);
    updateRingLike(discs, dt);
    for (let i = 0; i < beams.length; i++) {
      const fx = beams[i];
      if (!fx.active) continue;
      fx.age += dt;
      const k = fx.age / fx.dur;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        continue;
      }
      fx.mesh.material.opacity = fx.alpha * (1 - k);
      fx.mesh.scale.y = fx.r0 * (1 - k * 0.7);
      fx.mesh.scale.z = fx.r0 * (1 - k * 0.7);
    }
    for (let i = 0; i < flashes.length; i++) {
      const fx = flashes[i];
      if (!fx.active) continue;
      fx.age += dt;
      const k = fx.age / fx.dur;
      if (k >= 1) {
        fx.active = false;
        fx.mesh.visible = false;
        continue;
      }
      fx.mesh.scale.setScalar(Math.max(0.001, fx.r0 * (0.6 + 1.6 * k)));
      fx.mesh.material.opacity = fx.alpha * (1 - k) * (1 - k);
    }
  }

  /** Kill all live effects instantly. */
  function reset() {
    const pools = [rings, discs, beams, flashes];
    for (let p = 0; p < pools.length; p++) {
      for (let i = 0; i < pools[p].length; i++) {
        pools[p][i].active = false;
        pools[p][i].mesh.visible = false;
      }
    }
  }

  return { spawn, update, reset };
}
