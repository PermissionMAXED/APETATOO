// APETATO render/models — the ModelSpec interpreter.
//
// A ModelSpec is pure data:
//   { base: 'ape'|'blob'|'crab'|'snake'|'drone'|'totem'|'golem'|'bug'|'custom',
//     scale, primary, secondary, accent,
//     parts: [{ shape:'sphere'|'box'|'cone'|'cylinder'|'torus',
//               size:[x,y,z], pos:[x,y,z], rot:[x,y,z],
//               color:'primary'|'secondary'|'accent'|'#hex' }],
//     animation: 'bob'|'hop'|'slither'|'spin'|'hover'|'stomp'|'none' }
//
// Two build paths:
//   buildGroup(spec)          -> animatable THREE.Group (players, boss,
//                                companions, previews). Exposes
//                                group.userData.animate(t, speed).
//   buildMergedGeometry(spec) -> single vertex-colored BufferGeometry for
//                                InstancedMesh use (enemies, projectiles,
//                                pickups).
//
// Size semantics per shape (matches content data conventions):
//   sphere   size = [rx, ry, rz]         (radii)
//   box      size = [w, h, d]            (full extents)
//   cone     size = [r, h, r]
//   cylinder size = [r, h, r]
//   torus    size = [ringRadius, tubeRadius, ringRadius]

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HALF_PI = Math.PI / 2;
const ZERO3 = [0, 0, 0];
const SHADOW_COLOR = '#161310';

const DEFAULT_PRIMARY = '#8a8a8a';
const DEFAULT_SECONDARY = '#555555';
const DEFAULT_ACCENT = '#ffd93b';

// ---------------------------------------------------------------------------
// Shared unit geometries (scaled per-part; built once, never disposed).
// ---------------------------------------------------------------------------

const unitGeoms = new Map();

function unitGeom(shape) {
  let g = unitGeoms.get(shape);
  if (g) return g;
  switch (shape) {
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, 10, 8);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(0.5, 1, 10);
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
      break;
    case 'shadow':
      // Flat ground-hugging disc; radius baked at 1, scaled per part.
      g = new THREE.CircleGeometry(1, 14).rotateX(-HALF_PI);
      break;
    case 'box':
    default:
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
  }
  unitGeoms.set(shape, g);
  return g;
}

// Torus radii can't be expressed by scaling a unit torus without distorting
// the tube, so cache per (ring, tube) pair. Build-time only; bounded by
// content variety.
const torusGeoms = new Map();

function torusGeom(ring, tube) {
  const key = ring.toFixed(3) + '_' + tube.toFixed(3);
  let g = torusGeoms.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(ring, tube, 7, 14);
    torusGeoms.set(key, g);
  }
  return g;
}

function partGeom(part) {
  if (part.shape === 'torus') {
    const s = part.size || ZERO3;
    return torusGeom(s[0] || 0.1, s[1] || 0.03);
  }
  return unitGeom(part.shape);
}

/** Writes the mesh-space scale for a part into `out` (a THREE.Vector3). */
function partScale(part, out) {
  const s = part.size || ZERO3;
  const sx = s[0] || 0.1;
  const sy = s[1] !== undefined ? s[1] : sx;
  const sz = s[2] !== undefined ? s[2] : sx;
  switch (part.shape) {
    case 'sphere':
      out.set(sx * 2, sy * 2, sz * 2);
      break;
    case 'cone':
    case 'cylinder':
      out.set(sx * 2, sy, sz * 2);
      break;
    case 'torus':
      out.set(1, 1, 1); // radii baked into the geometry
      break;
    case 'shadow':
      out.set(sx, 1, sx);
      break;
    case 'box':
    default:
      out.set(sx, sy, sz);
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materials (shared cache keyed by resolved hex; Lambert, no shadows).
// ---------------------------------------------------------------------------

const matCache = new Map();

function materialFor(hex) {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex });
    matCache.set(hex, m);
  }
  return m;
}

function resolveColor(token, spec) {
  if (token === 'secondary') return spec.secondary || DEFAULT_SECONDARY;
  if (token === 'accent') return spec.accent || DEFAULT_ACCENT;
  if (token === '@shadow') return SHADOW_COLOR;
  if (typeof token === 'string' && token.charCodeAt(0) === 35 /* '#' */) return token;
  return spec.primary || DEFAULT_PRIMARY; // 'primary' and anything unknown
}

// ---------------------------------------------------------------------------
// Base templates (parts arrays in the same shape as spec.parts). All bases
// except 'custom' include a dark ground shadow disc at y ~= 0.02.
// ---------------------------------------------------------------------------

const SH = (r) => ({ shape: 'shadow', size: [r], pos: [0, 0.02, 0], color: '@shadow' });

const TEMPLATES = {
  ape: [
    SH(0.5),
    { shape: 'sphere', size: [0.3, 0.28, 0.26], pos: [0, 0.32, 0], color: 'primary' }, // body
    { shape: 'sphere', size: [0.17, 0.15, 0.12], pos: [0, 0.3, 0.16], color: 'accent' }, // belly
    { shape: 'sphere', size: [0.19, 0.18, 0.18], pos: [0, 0.66, 0.04], color: 'primary' }, // head
    { shape: 'sphere', size: [0.12, 0.1, 0.07], pos: [0, 0.62, 0.2], color: 'accent' }, // muzzle
    { shape: 'sphere', size: [0.06, 0.06, 0.04], pos: [-0.18, 0.73, 0.02], color: 'secondary' }, // ear L
    { shape: 'sphere', size: [0.06, 0.06, 0.04], pos: [0.18, 0.73, 0.02], color: 'secondary' }, // ear R
    { shape: 'cylinder', size: [0.06, 0.28, 0.06], pos: [-0.32, 0.3, 0.02], rot: [0, 0, 0.45], color: 'primary' }, // arm L
    { shape: 'cylinder', size: [0.06, 0.28, 0.06], pos: [0.32, 0.3, 0.02], rot: [0, 0, -0.45], color: 'primary' }, // arm R
    { shape: 'sphere', size: [0.09, 0.05, 0.11], pos: [-0.13, 0.05, 0.04], color: 'secondary' }, // foot L
    { shape: 'sphere', size: [0.09, 0.05, 0.11], pos: [0.13, 0.05, 0.04], color: 'secondary' }, // foot R
    { shape: 'torus', size: [0.11, 0.03, 0.11], pos: [0, 0.28, -0.27], rot: [0.5, 0, 0], color: 'secondary' }, // tail
  ],
  blob: [
    SH(0.45),
    { shape: 'sphere', size: [0.34, 0.26, 0.34], pos: [0, 0.26, 0], color: 'primary' },
    { shape: 'sphere', size: [0.16, 0.12, 0.16], pos: [0.1, 0.48, 0], color: 'primary' },
    { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [-0.11, 0.3, 0.28], color: 'accent' },
    { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0.11, 0.3, 0.28], color: 'accent' },
    { shape: 'box', size: [0.12, 0.025, 0.02], pos: [0, 0.18, 0.32], color: 'secondary' },
  ],
  crab: [
    SH(0.52),
    { shape: 'sphere', size: [0.3, 0.14, 0.22], pos: [0, 0.18, 0], color: 'primary' },
    { shape: 'sphere', size: [0.11, 0.09, 0.09], pos: [-0.36, 0.16, 0.14], color: 'secondary' }, // claw L
    { shape: 'sphere', size: [0.11, 0.09, 0.09], pos: [0.36, 0.16, 0.14], color: 'secondary' }, // claw R
    { shape: 'cone', size: [0.05, 0.12, 0.05], pos: [-0.42, 0.16, 0.24], rot: [1.2, 0, 0], color: 'secondary' },
    { shape: 'cone', size: [0.05, 0.12, 0.05], pos: [0.42, 0.16, 0.24], rot: [1.2, 0, 0], color: 'secondary' },
    { shape: 'cone', size: [0.035, 0.16, 0.035], pos: [-0.25, 0.09, -0.08], rot: [0, 0, 0.9], color: 'secondary' },
    { shape: 'cone', size: [0.035, 0.16, 0.035], pos: [0.25, 0.09, -0.08], rot: [0, 0, -0.9], color: 'secondary' },
    { shape: 'cone', size: [0.035, 0.16, 0.035], pos: [-0.24, 0.09, 0.06], rot: [0, 0, 0.9], color: 'secondary' },
    { shape: 'cone', size: [0.035, 0.16, 0.035], pos: [0.24, 0.09, 0.06], rot: [0, 0, -0.9], color: 'secondary' },
    { shape: 'cylinder', size: [0.018, 0.12, 0.018], pos: [-0.08, 0.32, 0.12], color: 'accent' },
    { shape: 'cylinder', size: [0.018, 0.12, 0.018], pos: [0.08, 0.32, 0.12], color: 'accent' },
    { shape: 'sphere', size: [0.038, 0.038, 0.038], pos: [-0.08, 0.4, 0.12], color: 'accent' },
    { shape: 'sphere', size: [0.038, 0.038, 0.038], pos: [0.08, 0.4, 0.12], color: 'accent' },
  ],
  snake: [
    SH(0.42),
    { shape: 'sphere', size: [0.15, 0.13, 0.16], pos: [0, 0.15, 0.28], color: 'primary' }, // head
    { shape: 'sphere', size: [0.13, 0.13, 0.14], pos: [0, 0.13, 0.05], color: 'primary' },
    { shape: 'sphere', size: [0.115, 0.115, 0.125], pos: [-0.05, 0.115, -0.16], color: 'secondary' },
    { shape: 'sphere', size: [0.095, 0.095, 0.105], pos: [0.02, 0.095, -0.34], color: 'primary' },
    { shape: 'cone', size: [0.06, 0.18, 0.06], pos: [0.07, 0.08, -0.47], rot: [1.3, 0, 0.3], color: 'secondary' }, // tail tip
    { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [-0.07, 0.2, 0.38], color: 'accent' },
    { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [0.07, 0.2, 0.38], color: 'accent' },
    { shape: 'cone', size: [0.015, 0.09, 0.015], pos: [0, 0.13, 0.44], rot: [1.35, 0, 0], color: 'accent' }, // tongue
  ],
  drone: [
    SH(0.3),
    { shape: 'sphere', size: [0.16, 0.13, 0.16], pos: [0, 0.5, 0], color: 'primary' },
    { shape: 'torus', size: [0.24, 0.035, 0.24], pos: [0, 0.5, 0], rot: [HALF_PI, 0, 0], color: 'secondary' },
    { shape: 'sphere', size: [0.055, 0.055, 0.055], pos: [0, 0.5, 0.15], color: 'accent' }, // eye
    { shape: 'cylinder', size: [0.02, 0.1, 0.02], pos: [0, 0.62, 0], color: 'secondary' },
    { shape: 'box', size: [0.34, 0.015, 0.05], pos: [0, 0.68, 0], color: 'accent' }, // rotor
    { shape: 'box', size: [0.05, 0.015, 0.34], pos: [0, 0.685, 0], color: 'accent' },
  ],
  totem: [
    SH(0.42),
    { shape: 'cylinder', size: [0.24, 0.2, 0.24], pos: [0, 0.1, 0], color: 'secondary' },
    { shape: 'box', size: [0.38, 0.3, 0.32], pos: [0, 0.4, 0], color: 'primary' },
    { shape: 'box', size: [0.3, 0.24, 0.26], pos: [0, 0.68, 0], color: 'secondary' },
    { shape: 'box', size: [0.32, 0.05, 0.05], pos: [0, 0.52, 0.17], color: 'accent' }, // brow
    { shape: 'box', size: [0.06, 0.05, 0.03], pos: [-0.09, 0.42, 0.17], color: 'accent' },
    { shape: 'box', size: [0.06, 0.05, 0.03], pos: [0.09, 0.42, 0.17], color: 'accent' },
    { shape: 'box', size: [0.14, 0.04, 0.03], pos: [0, 0.3, 0.17], color: 'accent' }, // mouth
    { shape: 'cone', size: [0.06, 0.2, 0.06], pos: [-0.24, 0.72, 0], rot: [0, 0, 1.2], color: 'accent' }, // wing L
    { shape: 'cone', size: [0.06, 0.2, 0.06], pos: [0.24, 0.72, 0], rot: [0, 0, -1.2], color: 'accent' }, // wing R
  ],
  golem: [
    SH(0.55),
    { shape: 'box', size: [0.46, 0.4, 0.32], pos: [0, 0.4, 0], color: 'primary' },
    { shape: 'box', size: [0.16, 0.14, 0.18], pos: [-0.34, 0.56, 0], color: 'primary' },
    { shape: 'box', size: [0.16, 0.14, 0.18], pos: [0.34, 0.56, 0], color: 'primary' },
    { shape: 'box', size: [0.13, 0.34, 0.15], pos: [-0.36, 0.3, 0], rot: [0, 0, 0.12], color: 'secondary' },
    { shape: 'box', size: [0.13, 0.34, 0.15], pos: [0.36, 0.3, 0], rot: [0, 0, -0.12], color: 'secondary' },
    { shape: 'box', size: [0.24, 0.18, 0.2], pos: [0, 0.72, 0.02], color: 'secondary' },
    { shape: 'box', size: [0.14, 0.035, 0.02], pos: [0, 0.74, 0.13], color: 'accent' }, // eye slit
    { shape: 'box', size: [0.15, 0.18, 0.17], pos: [-0.13, 0.09, 0], color: 'secondary' },
    { shape: 'box', size: [0.15, 0.18, 0.17], pos: [0.13, 0.09, 0], color: 'secondary' },
    { shape: 'box', size: [0.05, 0.2, 0.02], pos: [0.08, 0.42, 0.165], color: 'accent' }, // crack glow
  ],
  bug: [
    SH(0.32),
    { shape: 'sphere', size: [0.16, 0.11, 0.2], pos: [0, 0.13, -0.06], color: 'primary' }, // abdomen
    { shape: 'sphere', size: [0.09, 0.08, 0.09], pos: [0, 0.14, 0.18], color: 'secondary' }, // head
    { shape: 'sphere', size: [0.025, 0.025, 0.025], pos: [-0.05, 0.18, 0.24], color: 'accent' },
    { shape: 'sphere', size: [0.025, 0.025, 0.025], pos: [0.05, 0.18, 0.24], color: 'accent' },
    { shape: 'cylinder', size: [0.012, 0.14, 0.012], pos: [-0.04, 0.26, 0.22], rot: [0.5, 0, 0.3], color: 'accent' },
    { shape: 'cylinder', size: [0.012, 0.14, 0.012], pos: [0.04, 0.26, 0.22], rot: [0.5, 0, -0.3], color: 'accent' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [-0.14, 0.07, -0.12], rot: [0, 0, 1.0], color: 'secondary' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [0.14, 0.07, -0.12], rot: [0, 0, -1.0], color: 'secondary' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [-0.15, 0.07, 0], rot: [0, 0, 1.0], color: 'secondary' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [0.15, 0.07, 0], rot: [0, 0, -1.0], color: 'secondary' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [-0.13, 0.07, 0.1], rot: [0, 0, 1.0], color: 'secondary' },
    { shape: 'cone', size: [0.015, 0.1, 0.015], pos: [0.13, 0.07, 0.1], rot: [0, 0, -1.0], color: 'secondary' },
    { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [0.05, 0.22, -0.05], color: 'accent' },
    { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [-0.06, 0.21, -0.12], color: 'accent' },
  ],
  custom: [],
};

function collectParts(spec) {
  const base = TEMPLATES[spec.base] || TEMPLATES.custom;
  const extra = spec.parts || [];
  return extra.length ? base.concat(extra) : base;
}

// ---------------------------------------------------------------------------
// Built-in tiny specs for projectile / pickup visual keys.
// ---------------------------------------------------------------------------

function tiny(parts, animation) {
  return { base: 'custom', scale: 1, primary: '#ffffff', parts, animation: animation || 'none' };
}

const BANANA_PARTS = [
  { shape: 'cylinder', size: [0.045, 0.13, 0.045], pos: [-0.07, -0.02, 0], rot: [0, 0, 0.6], color: '#ffd93b' },
  { shape: 'cylinder', size: [0.05, 0.11, 0.05], pos: [0, 0.03, 0], rot: [0, 0, HALF_PI], color: '#ffd93b' },
  { shape: 'cylinder', size: [0.045, 0.13, 0.045], pos: [0.07, -0.02, 0], rot: [0, 0, -0.6], color: '#ffd93b' },
  { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [-0.12, -0.07, 0], color: '#7a5a2b' },
  { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [0.12, -0.07, 0], color: '#7a5a2b' },
];

export const BUILTIN_SPECS = {
  banana: tiny(BANANA_PARTS),
  coconut: tiny([
    { shape: 'sphere', size: [0.13, 0.13, 0.13], pos: [0, 0, 0], color: '#6b4a2b' },
    { shape: 'sphere', size: [0.022, 0.022, 0.022], pos: [-0.04, 0.05, 0.11], color: '#3d2a17' },
    { shape: 'sphere', size: [0.022, 0.022, 0.022], pos: [0.04, 0.05, 0.11], color: '#3d2a17' },
    { shape: 'sphere', size: [0.022, 0.022, 0.022], pos: [0, -0.02, 0.125], color: '#3d2a17' },
  ]),
  seed: tiny([
    { shape: 'cone', size: [0.05, 0.16, 0.05], pos: [0, 0, 0.02], rot: [HALF_PI, 0, 0], color: '#a5d64a' },
    { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0, 0, -0.06], color: '#5a7d2c' },
  ]),
  rock: tiny([
    { shape: 'box', size: [0.15, 0.12, 0.14], pos: [0, 0, 0], rot: [0.5, 0.7, 0.2], color: '#8f9aa3' },
    { shape: 'box', size: [0.1, 0.08, 0.09], pos: [0.05, 0.04, 0], rot: [0.2, 0.4, 0.9], color: '#77828c' },
  ]),
  laser: tiny([
    { shape: 'box', size: [0.05, 0.05, 0.55], pos: [0, 0, 0], color: '#7ef3ff' },
    { shape: 'box', size: [0.022, 0.022, 0.65], pos: [0, 0, 0], color: '#ffffff' },
  ]),
  fireball: tiny([
    { shape: 'sphere', size: [0.11, 0.11, 0.11], pos: [0, 0, 0.02], color: '#ff9a3d' },
    { shape: 'sphere', size: [0.075, 0.075, 0.075], pos: [0, 0, -0.11], color: '#ffd23f' },
    { shape: 'sphere', size: [0.045, 0.045, 0.045], pos: [0, 0, -0.2], color: '#ff5a2b' },
  ]),
  gooball: tiny([
    { shape: 'sphere', size: [0.1, 0.085, 0.1], pos: [0, 0, 0], color: '#79d94a' },
    { shape: 'sphere', size: [0.05, 0.045, 0.05], pos: [0.06, -0.03, 0.04], color: '#a5f36a' },
  ]),
  gear: tiny([
    { shape: 'torus', size: [0.1, 0.035, 0.1], pos: [0, 0, 0], color: '#8f9aa3' },
    { shape: 'box', size: [0.035, 0.06, 0.03], pos: [0, 0.13, 0], color: '#c9ced4' },
    { shape: 'box', size: [0.035, 0.06, 0.03], pos: [0, -0.13, 0], color: '#c9ced4' },
    { shape: 'box', size: [0.06, 0.035, 0.03], pos: [0.13, 0, 0], color: '#c9ced4' },
    { shape: 'box', size: [0.06, 0.035, 0.03], pos: [-0.13, 0, 0], color: '#c9ced4' },
    { shape: 'cylinder', size: [0.04, 0.035, 0.04], pos: [0, 0, 0], rot: [HALF_PI, 0, 0], color: '#5d666e' },
  ]),
  bone: tiny([
    { shape: 'cylinder', size: [0.026, 0.22, 0.026], pos: [0, 0, 0], rot: [0, 0, HALF_PI], color: '#f0e6d0' },
    { shape: 'sphere', size: [0.045, 0.045, 0.045], pos: [-0.11, 0.028, 0], color: '#f0e6d0' },
    { shape: 'sphere', size: [0.045, 0.045, 0.045], pos: [-0.11, -0.028, 0], color: '#f0e6d0' },
    { shape: 'sphere', size: [0.045, 0.045, 0.045], pos: [0.11, 0.028, 0], color: '#f0e6d0' },
    { shape: 'sphere', size: [0.045, 0.045, 0.045], pos: [0.11, -0.028, 0], color: '#f0e6d0' },
  ]),
  star: tiny([
    { shape: 'box', size: [0.26, 0.06, 0.035], pos: [0, 0, 0], color: '#ffd23f' },
    { shape: 'box', size: [0.26, 0.06, 0.035], pos: [0, 0, 0], rot: [0, 0, 1.047], color: '#ffd23f' },
    { shape: 'box', size: [0.26, 0.06, 0.035], pos: [0, 0, 0], rot: [0, 0, 2.094], color: '#ffd23f' },
    { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, 0, 0.02], color: '#fff6cf' },
  ]),
  xp_banana: tiny(
    BANANA_PARTS.concat([
      { shape: 'sphere', size: [0.032, 0.032, 0.032], pos: [0, 0.11, 0], color: '#d6ff8a' },
    ])
  ),
  coin: tiny([
    { shape: 'cylinder', size: [0.1, 0.03, 0.1], pos: [0, 0, 0], rot: [HALF_PI, 0, 0], color: '#ffcf40' },
    { shape: 'cylinder', size: [0.07, 0.035, 0.07], pos: [0, 0, 0], rot: [HALF_PI, 0, 0], color: '#e0a92b' },
  ]),
  crate: tiny([
    { shape: 'box', size: [0.26, 0.26, 0.26], pos: [0, 0, 0], color: '#a8743d' },
    { shape: 'box', size: [0.29, 0.045, 0.29], pos: [0, 0.11, 0], color: '#7a5426' },
    { shape: 'box', size: [0.29, 0.045, 0.29], pos: [0, -0.11, 0], color: '#7a5426' },
    { shape: 'box', size: [0.34, 0.05, 0.02], pos: [0, 0, 0.135], rot: [0, 0, 0.785], color: '#7a5426' },
  ]),
  heal_fruit: tiny([
    { shape: 'sphere', size: [0.11, 0.12, 0.11], pos: [0, 0, 0], color: '#ff5a5a' },
    { shape: 'cylinder', size: [0.015, 0.07, 0.015], pos: [0, 0.14, 0], color: '#7a5a2b' },
    { shape: 'sphere', size: [0.055, 0.02, 0.032], pos: [0.05, 0.15, 0], color: '#3f9d2c' },
  ]),
};

// A few forgiving aliases for content keys that clearly map onto a built-in.
const SPEC_ALIASES = {
  peel_round: 'banana',
  peel: 'banana',
  pebble: 'rock',
  stone: 'rock',
  dart: 'seed',
  xp: 'xp_banana',
  xp_orb: 'xp_banana',
};

/** The last-resort spec (bright magenta blob — obviously "missing model"). */
export const FALLBACK_SPEC = Object.freeze({
  base: 'blob',
  scale: 0.9,
  primary: '#c236c9',
  secondary: '#5e1a63',
  accent: '#ffffff',
  animation: 'bob',
});

// Unknown keys get a deterministic hue so distinct archetypes stay readable.
const generatedSpecs = new Map();

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const tmpSpecColor = new THREE.Color();

/**
 * Resolve an archetype/visual key to a ModelSpec: built-in first, alias next,
 * then a stable generated fallback (unique-ish hue per key).
 */
export function specForKey(key) {
  if (!key || typeof key !== 'string') return FALLBACK_SPEC;
  const direct = BUILTIN_SPECS[key] || BUILTIN_SPECS[SPEC_ALIASES[key]];
  if (direct) return direct;
  let gen = generatedSpecs.get(key);
  if (!gen) {
    const hue = (hashStr(key) % 360) / 360;
    tmpSpecColor.setHSL(hue, 0.6, 0.55);
    const primary = '#' + tmpSpecColor.getHexString();
    tmpSpecColor.setHSL(hue, 0.55, 0.3);
    const secondary = '#' + tmpSpecColor.getHexString();
    gen = { base: 'blob', scale: 0.9, primary, secondary, accent: '#ffffff', animation: 'bob' };
    generatedSpecs.set(key, gen);
  }
  return gen;
}

function normalizeSpec(spec) {
  if (!spec) return FALLBACK_SPEC;
  if (typeof spec === 'string') return specForKey(spec);
  return spec;
}

// ---------------------------------------------------------------------------
// Animators — closures over the group's animRoot; zero per-frame allocation.
// ---------------------------------------------------------------------------

function makeAnimator(type, node, s) {
  const baseY = node.position.y;
  switch (type) {
    case 'bob':
      return function bob(t, speed) {
        const sp = speed || 1;
        node.position.y = baseY + (0.03 + 0.03 * Math.sin(t * 5 * sp)) * s;
        node.rotation.z = Math.sin(t * 2.5 * sp) * 0.03;
      };
    case 'hop':
      return function hop(t, speed) {
        const sp = speed || 1;
        const ph = t * 6 * sp;
        node.position.y = baseY + Math.abs(Math.sin(ph)) * 0.16 * s;
        node.scale.y = s * (1 - 0.1 * Math.max(0, Math.cos(ph * 2)));
      };
    case 'slither':
      return function slither(t, speed) {
        const sp = speed || 1;
        node.rotation.y = Math.sin(t * 6 * sp) * 0.35;
        node.position.x = Math.sin(t * 6 * sp - 1.2) * 0.05 * s;
        node.position.y = baseY + (0.01 + 0.01 * Math.sin(t * 12 * sp)) * s;
      };
    case 'spin':
      return function spin(t, speed) {
        node.rotation.y = t * 3 * (speed || 1);
      };
    case 'hover':
      return function hover(t, speed) {
        const sp = speed || 1;
        node.position.y = baseY + (0.25 + Math.sin(t * 2.5 * sp) * 0.07) * s;
        node.rotation.z = Math.sin(t * 1.7 * sp) * 0.08;
      };
    case 'stomp':
      return function stomp(t, speed) {
        const sp = speed || 1;
        const ph = t * 4 * sp;
        node.position.y = baseY + Math.max(0, Math.sin(ph)) * 0.09 * s;
        node.scale.y = s * (1 - 0.08 * Math.max(0, -Math.sin(ph)));
      };
    default:
      return function none() {};
  }
}

// ---------------------------------------------------------------------------
// buildGroup — animatable THREE.Group (players / boss / companions / preview).
// ---------------------------------------------------------------------------

/**
 * Build an animatable group from a ModelSpec (or a builtin key string).
 * Structure: root Group -> [animRoot Group (animated parts), shadow meshes].
 * Callers own root.position / root.rotation; the animator only touches the
 * animRoot. Exposes group.userData.animate(t, speed).
 */
export function buildGroup(spec) {
  spec = normalizeSpec(spec);
  const s = spec.scale || 1;
  const group = new THREE.Group();
  const anim = new THREE.Group();
  anim.name = 'animRoot';
  anim.scale.setScalar(s);
  group.add(anim);

  const parts = collectParts(spec);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const mesh = new THREE.Mesh(partGeom(p), materialFor(resolveColor(p.color, spec)));
    const pos = p.pos || ZERO3;
    const rot = p.rot || ZERO3;
    if (p.shape === 'shadow') {
      // Shadow stays glued to the ground, outside the animated subtree.
      partScale(p, mesh.scale);
      mesh.scale.x *= s;
      mesh.scale.z *= s;
      mesh.position.set((pos[0] || 0) * s, 0.02, (pos[2] || 0) * s);
      group.add(mesh);
    } else {
      mesh.position.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      mesh.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      partScale(p, mesh.scale);
      anim.add(mesh);
    }
  }

  group.userData.animate = makeAnimator(spec.animation || 'none', anim, s);
  group.userData.spec = spec;
  return group;
}

// ---------------------------------------------------------------------------
// buildMergedGeometry — one vertex-colored geometry for instancing.
// ---------------------------------------------------------------------------

const mgColor = new THREE.Color();
const mgMat = new THREE.Matrix4();
const mgQuat = new THREE.Quaternion();
const mgEuler = new THREE.Euler();
const mgPos = new THREE.Vector3();
const mgScale = new THREE.Vector3();

/**
 * Merge a ModelSpec into a single BufferGeometry with vertex colors
 * (for MeshLambertMaterial({ vertexColors: true }) + InstancedMesh).
 */
export function buildMergedGeometry(spec) {
  spec = normalizeSpec(spec);
  const s = spec.scale || 1;
  const parts = collectParts(spec);
  const geoms = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const g = partGeom(p).clone();
    const pos = p.pos || ZERO3;
    const rot = p.rot || ZERO3;
    mgEuler.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    mgQuat.setFromEuler(mgEuler);
    mgPos.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    partScale(p, mgScale);
    mgMat.compose(mgPos, mgQuat, mgScale);
    g.applyMatrix4(mgMat);

    mgColor.set(resolveColor(p.color, spec));
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = mgColor.r;
      colors[v * 3 + 1] = mgColor.g;
      colors[v * 3 + 2] = mgColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geoms.push(g);
  }

  if (geoms.length === 0) {
    // Empty custom spec: give it a visible placeholder cube.
    const g = unitGeom('box').clone();
    mgColor.set(spec.primary || DEFAULT_PRIMARY);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = mgColor.r;
      colors[v * 3 + 1] = mgColor.g;
      colors[v * 3 + 2] = mgColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.scale(0.3, 0.3, 0.3);
    geoms.push(g);
  }

  let merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (!merged) merged = geoms[0];
  if (s !== 1) merged.scale(s, s, s);
  merged.computeBoundingSphere();
  for (let i = 0; i < geoms.length; i++) {
    if (geoms[i] !== merged) geoms[i].dispose();
  }
  return merged;
}
