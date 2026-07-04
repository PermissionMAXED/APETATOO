// APETATO render/cameraRig — angled orthographic camera on a follow rig.
//
// Frustum height fixed at 26 world units (width from aspect). Camera sits at
// target + (0, +34, +14) looking at the target, lerp-follows the player at
// 8/s, and clamps so the visible ground footprint stays inside the arena.
// Also owns screen shake (additive intensity, ~6/s decay) and
// screenToWorld(sx, sy, out) — the mouse-aim unprojector consumed by
// core/input via input.setCamera(rig).

import * as THREE from 'three';

const FRUSTUM_HEIGHT = 26;
const HALF_H = FRUSTUM_HEIGHT / 2;
const OFFSET_Y = 34;
const OFFSET_Z = 14;
const FOLLOW_RATE = 8; // 1/s
const SHAKE_DECAY = 6; // 1/s
const SHAKE_WORLD = 0.5; // world units of jitter at intensity 1

export function createCameraRig() {
  const camera = new THREE.OrthographicCamera(-HALF_H, HALF_H, HALF_H, -HALF_H, 0.1, 200);

  // The tilted view stretches the ground footprint along z by 1/sin(elev).
  const offsetLen = Math.sqrt(OFFSET_Y * OFFSET_Y + OFFSET_Z * OFFSET_Z);
  const sinElev = OFFSET_Y / offsetLen;

  let cssW = 2;
  let cssH = 1;
  let aspect = 2;
  let boundW = Infinity; // arena width (x extent)
  let boundH = Infinity; // arena height (z extent)

  const cur = { x: 0, z: 0 };
  const goal = { x: 0, z: 0 };
  let shakeAmp = 0;
  let time = 0;

  const lookTarget = new THREE.Vector3();
  const vTmp = new THREE.Vector3();
  const dirTmp = new THREE.Vector3();

  function setSize(w, h) {
    cssW = Math.max(1, w);
    cssH = Math.max(1, h);
    aspect = cssW / cssH;
    camera.left = -HALF_H * aspect;
    camera.right = HALF_H * aspect;
    camera.top = HALF_H;
    camera.bottom = -HALF_H;
    camera.updateProjectionMatrix();
  }

  /** Arena bounds from beginRun (world units, centered on origin). */
  function setBounds(w, h) {
    boundW = w || Infinity;
    boundH = h || Infinity;
  }

  /** Set the follow goal (the player position). */
  function follow(x, z) {
    goal.x = x;
    goal.z = z;
  }

  /** Jump instantly (run start). */
  function snap(x, z) {
    goal.x = x;
    goal.z = z;
    cur.x = x;
    cur.z = z;
    update(0);
  }

  /** Additive shake; intensity 0..1 per impulse, decays ~6/s. */
  function addShake(intensity) {
    shakeAmp = Math.min(1.5, shakeAmp + (intensity || 0));
  }

  function clampAxis(value, halfBound, halfView) {
    const m = halfBound - halfView;
    if (!(m > 0)) return 0; // arena smaller than the view: stay centered
    return value < -m ? -m : value > m ? m : value;
  }

  /** Advance follow + shake and recompute camera matrices. */
  function update(dt) {
    time += dt;
    const k = dt > 0 ? 1 - Math.exp(-FOLLOW_RATE * dt) : 1;
    cur.x += (goal.x - cur.x) * k;
    cur.z += (goal.z - cur.z) * k;

    if (dt > 0) shakeAmp *= Math.exp(-SHAKE_DECAY * dt);
    if (shakeAmp < 0.001) shakeAmp = 0;

    const viewHalfW = HALF_H * aspect;
    const viewHalfZ = HALF_H / sinElev;
    const cx = clampAxis(cur.x, boundW / 2, viewHalfW);
    const cz = clampAxis(cur.z, boundH / 2, viewHalfZ);

    // Smooth two-axis wobble (cheaper + steadier than per-frame random).
    const j = shakeAmp * SHAKE_WORLD;
    const sx = Math.sin(time * 41.7) * j;
    const sz = Math.cos(time * 47.3) * j;

    camera.position.set(cx + sx, OFFSET_Y, cz + OFFSET_Z + sz);
    lookTarget.set(cx + sx, 0, cz + sz);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();
  }

  /**
   * Unproject screen CSS pixels onto the y=0 gameplay plane.
   * @param {number} sx screen x (CSS px)
   * @param {number} sy screen y (CSS px)
   * @param {{x:number, z:number}} [out] reused output object
   * @returns {{x:number, z:number}}
   */
  function screenToWorld(sx, sy, out) {
    out = out || { x: 0, z: 0 };
    const ndcX = (sx / cssW) * 2 - 1;
    const ndcY = -(sy / cssH) * 2 + 1;
    vTmp.set(ndcX, ndcY, -1).unproject(camera); // point on the near plane
    camera.getWorldDirection(dirTmp);
    if (Math.abs(dirTmp.y) < 1e-6) {
      out.x = vTmp.x;
      out.z = vTmp.z;
      return out;
    }
    const t = -vTmp.y / dirTmp.y;
    out.x = vTmp.x + dirTmp.x * t;
    out.z = vTmp.z + dirTmp.z * t;
    return out;
  }

  setSize(2, 1);
  update(0);

  return {
    camera,
    setSize,
    setBounds,
    follow,
    snap,
    addShake,
    update,
    screenToWorld,
    /** current shake amplitude (debug/testing) */
    get shake() {
      return shakeAmp;
    },
  };
}
