// APETATO render/instanced — archetype-keyed InstancedMesh manager.
//
// One InstancedMesh per archetype (vertex-colored merged geometry from
// models.buildMergedGeometry + MeshLambertMaterial, instanceColor for tints).
// Entities carry entity.archetype (string); this module owns
// entity.instanceSlot and nothing else.
//
// Frame protocol (driven by renderer.syncState):
//   beginFrame() -> syncList(enemies, KIND_ENEMY, t)
//                -> syncList(projectiles, KIND_PROJECTILE, t)
//                -> syncList(pickups, KIND_PICKUP, t)
//                -> endFrame()   (frees untouched slots, flushes GPU buffers)
//
// Slots for entities that disappeared (death, pooling) are zero-scaled and
// recycled in endFrame. Archetypes never seen before are lazily registered
// from entity.def.model when present, else a built-in/generated spec keyed
// by the archetype string. Zero per-frame allocations on the sync path.

import * as THREE from 'three';
import { buildMergedGeometry, specForKey } from './models.js';

export const KIND_ENEMY = 0;
export const KIND_PROJECTILE = 1;
export const KIND_PICKUP = 2;

// Default capacities per kind for lazily-registered archetypes.
// Enemy total budget is 512; projectile pools go up to 1024+256.
const DEFAULT_CAPS = [512, 1024, 512];

const HALF_PI = Math.PI / 2;
const PROJECTILE_Y = 0.55;

/**
 * Create the instancing manager. All InstancedMeshes are added to `scene`.
 */
export function createInstancedManager(scene) {
  /** @type {Map<string, object>} archetype key -> record */
  const registry = new Map();
  let frame = 0;

  // Reused temps — never allocated on the sync path.
  const tPos = new THREE.Vector3();
  const tQuat = new THREE.Quaternion();
  const tEuler = new THREE.Euler();
  const tScale = new THREE.Vector3();
  const tMat = new THREE.Matrix4();
  const tColor = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  /**
   * Register an archetype explicitly. Idempotent: returns the existing
   * record when the key is already known.
   * @param {string} key archetype key
   * @param {object} spec ModelSpec (or builtin key string)
   * @param {number} capacity max simultaneous instances
   */
  function registerArchetype(key, spec, capacity) {
    let arch = registry.get(key);
    if (arch) return arch;
    const cap = Math.max(1, (capacity | 0) || 64);

    let geo;
    try {
      geo = buildMergedGeometry(spec || specForKey(key));
    } catch (err) {
      console.error(`[instanced] bad spec for archetype '${key}', using fallback:`, err);
      geo = buildMergedGeometry(specForKey('__fallback__' + key));
    }

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // instances move every frame; culling per-mesh is wrong
    mesh.name = 'arch:' + key;
    for (let i = 0; i < cap; i++) {
      mesh.setMatrixAt(i, zeroMat);
      mesh.setColorAt(i, white); // also allocates instanceColor
    }
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    arch = {
      key,
      mesh,
      capacity: cap,
      animation: (spec && spec.animation) || 'none',
      slotEntity: new Array(cap).fill(null),
      touched: new Int32Array(cap),
      free: [],
      dirty: true,
    };
    for (let i = cap - 1; i >= 0; i--) arch.free.push(i);
    registry.set(key, arch);
    return arch;
  }

  function archFor(key, entity, kind) {
    let arch = registry.get(key);
    if (!arch) {
      const spec = (entity && entity.def && entity.def.model) || specForKey(key);
      arch = registerArchetype(key, spec, DEFAULT_CAPS[kind] || 256);
    }
    return arch;
  }

  /** Start a new sync frame (invalidates last frame's touch marks). */
  function beginFrame() {
    frame++;
  }

  /**
   * Write instance matrices/colors for every active entity in `list`.
   * @param {Array} list entity array (pooled; inactive entries skipped)
   * @param {number} kind KIND_ENEMY | KIND_PROJECTILE | KIND_PICKUP
   * @param {number} t elapsed render time in seconds (for procedural anim)
   */
  function syncList(list, kind, t) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.active === false) continue;

      const key = e.archetype || e.kind || e.ptype || '__fallback__';
      const arch = archFor(key, e, kind);

      // (Re)bind a slot when the entity has none or its slot was recycled.
      let slot = e.instanceSlot;
      if (!(slot >= 0 && slot < arch.capacity && arch.slotEntity[slot] === e)) {
        slot = arch.free.length > 0 ? arch.free.pop() : -1;
        if (slot < 0) continue; // archetype at capacity — skip drawing
        arch.slotEntity[slot] = e;
        e.instanceSlot = slot;
      }
      arch.touched[slot] = frame;
      arch.dirty = true;

      const ph = slot * 1.317; // per-slot phase so crowds don't move in lockstep
      let y = 0;
      let rotY = 0;
      let sy = 1;
      let s = 1;

      if (kind === KIND_ENEMY) {
        rotY = HALF_PI - (e.facing || 0); // models face +Z
        switch (arch.animation) {
          case 'bob':
            y = 0.03 + 0.03 * Math.sin(t * 5 + ph);
            break;
          case 'hop':
            y = 0.18 * Math.abs(Math.sin(t * 6 + ph));
            break;
          case 'hover':
            y = 0.35 + 0.08 * Math.sin(t * 3 + ph);
            break;
          case 'spin':
            rotY = t * 4 + ph;
            break;
          case 'slither':
            rotY += Math.sin(t * 7 + ph) * 0.3;
            y = 0.01 + 0.01 * Math.sin(t * 12 + ph);
            break;
          case 'stomp': {
            const p2 = t * 3.2 + ph;
            y = Math.max(0, Math.sin(p2)) * 0.09;
            sy = 1 - 0.08 * Math.max(0, -Math.sin(p2));
            break;
          }
          default:
            break;
        }
        if (e.elite) s = 1.35;
      } else if (kind === KIND_PROJECTILE) {
        y = PROJECTILE_Y;
        const vx = e.vx || 0;
        const vz = e.vz || 0;
        if (vx !== 0 || vz !== 0) rotY = HALF_PI - Math.atan2(vz, vx); // face velocity
        else rotY = HALF_PI - (e.facing || 0);
        if (e.ptype === 'boomerang' || e.spin) rotY = t * 14 + ph;
      } else {
        // pickups: bob + spin
        y = 0.28 + 0.07 * Math.sin(t * 3 + ph);
        rotY = t * 2.2 + ph;
      }

      // Tint: elite tint, brightened while hitFlash is active (>1 values
      // over-brighten the Lambert diffuse — reads as a white flash).
      tColor.copy(white);
      if (e.elite && e.elite.tint) tColor.set(e.elite.tint);
      const hf = e.hitFlash || 0;
      if (hf > 0) tColor.multiplyScalar(1 + Math.min(1, hf * 6) * 3);

      tEuler.set(0, rotY, 0);
      tQuat.setFromEuler(tEuler);
      tPos.set(e.x || 0, y, e.z || 0);
      tScale.set(s, s * sy, s);
      tMat.compose(tPos, tQuat, tScale);
      arch.mesh.setMatrixAt(slot, tMat);
      arch.mesh.setColorAt(slot, tColor);
    }
  }

  /** Free slots that were not written this frame, flush dirty buffers. */
  function endFrame() {
    for (const arch of registry.values()) {
      const { slotEntity, touched, mesh, capacity } = arch;
      for (let s = 0; s < capacity; s++) {
        if (slotEntity[s] !== null && touched[s] !== frame) {
          const ent = slotEntity[s];
          if (ent && ent.instanceSlot === s) ent.instanceSlot = -1;
          slotEntity[s] = null;
          arch.free.push(s);
          mesh.setMatrixAt(s, zeroMat);
          arch.dirty = true;
        }
      }
      if (arch.dirty) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        arch.dirty = false;
      }
    }
  }

  /** Release every slot and hide all instances (run start/end). */
  function reset() {
    for (const arch of registry.values()) {
      const { slotEntity, mesh, capacity } = arch;
      arch.free.length = 0;
      for (let s = capacity - 1; s >= 0; s--) {
        const ent = slotEntity[s];
        if (ent && ent.instanceSlot === s) ent.instanceSlot = -1;
        slotEntity[s] = null;
        arch.free.push(s);
        mesh.setMatrixAt(s, zeroMat);
      }
      arch.touched.fill(0);
      mesh.instanceMatrix.needsUpdate = true;
      arch.dirty = false;
    }
    frame = 0;
  }

  return {
    registerArchetype,
    beginFrame,
    syncList,
    endFrame,
    reset,
    /** debug/testing access */
    registry,
  };
}
