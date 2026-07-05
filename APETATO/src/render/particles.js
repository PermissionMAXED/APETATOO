// APETATO render/particles — one InstancedMesh of 4096 tetrahedra,
// CPU-simulated {pos, vel, life, color, size, gravity}.
//
// Everything is preallocated in flat Float32Arrays; the update loop
// swap-removes dead particles so live ones stay packed in [0, alive) and
// mesh.count draws exactly that many. Zero per-frame allocations.

import * as THREE from 'three';

export const PARTICLE_CAP = 4096;

const TAU = Math.PI * 2;
const GROUND_Y = 0.03;

/**
 * Create the particle system (adds its InstancedMesh to `scene`).
 * Emitter presets: burst, spark, smoke, ring, confetti.
 */
export function createParticles(scene) {
  const geo = new THREE.TetrahedronGeometry(0.5);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.name = 'particles';

  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < PARTICLE_CAP; i++) mesh.setColorAt(i, white);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  // Simulation state (struct-of-arrays).
  const px = new Float32Array(PARTICLE_CAP);
  const py = new Float32Array(PARTICLE_CAP);
  const pz = new Float32Array(PARTICLE_CAP);
  const vx = new Float32Array(PARTICLE_CAP);
  const vy = new Float32Array(PARTICLE_CAP);
  const vz = new Float32Array(PARTICLE_CAP);
  const life = new Float32Array(PARTICLE_CAP);
  const maxLife = new Float32Array(PARTICLE_CAP);
  const size = new Float32Array(PARTICLE_CAP);
  const grav = new Float32Array(PARTICLE_CAP);
  const seed = new Float32Array(PARTICLE_CAP);
  let alive = 0;

  const colorArr = mesh.instanceColor.array;

  // Reused temps.
  const tPos = new THREE.Vector3();
  const tQuat = new THREE.Quaternion();
  const tEuler = new THREE.Euler();
  const tScale = new THREE.Vector3();
  const tMat = new THREE.Matrix4();
  const tColor = new THREE.Color();

  /** Spawn one particle with tColor as its color. Silently drops when full. */
  function spawnOne(x, y, z, dx, dy, dz, lifeS, sz, gravity) {
    if (alive >= PARTICLE_CAP) return;
    const i = alive++;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = dx;
    vy[i] = dy;
    vz[i] = dz;
    life[i] = lifeS;
    maxLife[i] = lifeS;
    size[i] = sz;
    grav[i] = gravity;
    seed[i] = (i * 0.61803) % 1 * 100;
    colorArr[i * 3] = tColor.r;
    colorArr[i * 3 + 1] = tColor.g;
    colorArr[i * 3 + 2] = tColor.b;
  }

  // --- Emitter presets -------------------------------------------------------
  // Math.random here is cosmetic-only (allowed; never touches game RNG).

  /** Omni-directional debris burst (deaths, explosions). */
  function burst(x, z, color, count = 16, speed = 6) {
    tColor.set(color || '#ffcf6a');
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.4 + Math.random() * 0.8);
      spawnOne(
        x, 0.4, z,
        Math.cos(a) * sp, 1.5 + Math.random() * speed * 0.5, Math.sin(a) * sp,
        0.35 + Math.random() * 0.3,
        0.07 + Math.random() * 0.07,
        9
      );
    }
  }

  /** Fast, tiny, short-lived sparks (hits, muzzle flashes). */
  function spark(x, z, color, count = 8, speed = 8) {
    tColor.set(color || '#ffe08a');
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const sp = speed * (0.5 + Math.random() * 0.7);
      spawnOne(
        x, 0.5, z,
        Math.cos(a) * sp, (Math.random() - 0.2) * speed * 0.5, Math.sin(a) * sp,
        0.12 + Math.random() * 0.18,
        0.035 + Math.random() * 0.03,
        4
      );
    }
  }

  /** Slow rising puffs (explosions, geysers). Negative gravity = buoyant. */
  function smoke(x, z, color, count = 6) {
    tColor.set(color || '#6b6259');
    for (let n = 0; n < count; n++) {
      const a = Math.random() * TAU;
      const sp = 0.4 + Math.random() * 0.8;
      spawnOne(
        x, 0.5 + Math.random() * 0.4, z,
        Math.cos(a) * sp, 1 + Math.random() * 1.2, Math.sin(a) * sp,
        0.7 + Math.random() * 0.7,
        0.13 + Math.random() * 0.1,
        -0.8
      );
    }
  }

  /** Flat horizontal ring wave (novas, shockwaves). */
  function ring(x, z, color, count = 24, speed = 7) {
    tColor.set(color || '#7ec8e3');
    for (let n = 0; n < count; n++) {
      const a = (n / count) * TAU;
      const sp = speed * (0.9 + Math.random() * 0.2);
      spawnOne(
        x, 0.3, z,
        Math.cos(a) * sp, 0.5, Math.sin(a) * sp,
        0.3 + Math.random() * 0.2,
        0.05 + Math.random() * 0.04,
        1.5
      );
    }
  }

  /** Celebration confetti — random bright hues unless a color is given. */
  function confetti(x, z, count = 36, color = null) {
    for (let n = 0; n < count; n++) {
      if (color) tColor.set(color);
      else tColor.setHSL(Math.random(), 0.85, 0.6);
      const a = Math.random() * TAU;
      const sp = 1 + Math.random() * 3;
      spawnOne(
        x, 0.6, z,
        Math.cos(a) * sp, 4 + Math.random() * 4.5, Math.sin(a) * sp,
        0.8 + Math.random() * 0.6,
        0.05 + Math.random() * 0.04,
        7
      );
    }
  }

  /** Advance the simulation and rewrite instance matrices. */
  function update(dt) {
    let i = 0;
    while (i < alive) {
      life[i] -= dt;
      if (life[i] <= 0) {
        // Swap-remove: keep live particles packed at the front.
        const j = --alive;
        if (i !== j) {
          px[i] = px[j];
          py[i] = py[j];
          pz[i] = pz[j];
          vx[i] = vx[j];
          vy[i] = vy[j];
          vz[i] = vz[j];
          life[i] = life[j];
          maxLife[i] = maxLife[j];
          size[i] = size[j];
          grav[i] = grav[j];
          seed[i] = seed[j];
          colorArr[i * 3] = colorArr[j * 3];
          colorArr[i * 3 + 1] = colorArr[j * 3 + 1];
          colorArr[i * 3 + 2] = colorArr[j * 3 + 2];
        }
        continue; // re-process the swapped-in particle at index i
      }
      vy[i] -= grav[i] * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      if (py[i] < GROUND_Y && grav[i] > 0) {
        py[i] = GROUND_Y;
        vy[i] *= -0.25; // soft bounce
        vx[i] *= 0.7;
        vz[i] *= 0.7;
      }
      const k = life[i] / maxLife[i];
      const sc = size[i] * (0.3 + 0.7 * k); // shrink out instead of alpha-fade
      tEuler.set(seed[i] + life[i] * 5, seed[i] * 1.3, seed[i] * 2.1 + life[i] * 7);
      tQuat.setFromEuler(tEuler);
      tPos.set(px[i], py[i], pz[i]);
      tScale.set(sc, sc, sc);
      tMat.compose(tPos, tQuat, tScale);
      mesh.setMatrixAt(i, tMat);
      i++;
    }
    mesh.count = alive;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Kill every particle instantly. */
  function reset() {
    alive = 0;
    mesh.count = 0;
  }

  return {
    mesh,
    burst,
    spark,
    smoke,
    ring,
    confetti,
    update,
    reset,
    get alive() {
      return alive;
    },
  };
}
