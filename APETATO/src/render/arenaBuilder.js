// APETATO render/arenaBuilder — static arena visuals from an ArenaDef.
//
// ArenaDef (defensively read; everything optional):
//   { w, h, groundColor, wallColor, theme, propDensity, seed,
//     obstacles: [{ type:'rock'|'tree'|'pillar'|'crate', x, z, r }],
//     hazards:   [{ type, x, z, r, w, h, interval, ... }] }
//
// Hazard visual types: lava_pool, poison_puddle, conveyor, banana_storm,
// collapsing_stone, geyser, thorn_patch, dark_zone.
//
// Returns { group, dispose() }. The group exposes
// group.userData.update(t, dt) which the renderer calls each frame to drive
// hazard animation. All geometries/materials created here are tracked and
// destroyed in dispose(); nothing is shared with the model caches.

import * as THREE from 'three';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

// Deterministic tiny RNG so prop scatter is stable per arena.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build the arena visuals. Add `group` to the scene; call `dispose()` when
 * the run ends.
 */
export function buildArena(def) {
  def = def || {};
  const w = def.w || def.width || 44;
  const h = def.h || def.height || 28;
  const group = new THREE.Group();
  group.name = 'arena';

  /** @type {(THREE.BufferGeometry|THREE.Material|THREE.Texture)[]} */
  const owned = [];
  /** @type {((t:number, dt:number) => void)[]} */
  const animated = [];
  const rng = mulberry32(def.seed !== undefined ? def.seed : hashStr(def.id || def.name || 'apetato'));

  function own(res) {
    owned.push(res);
    return res;
  }

  function mat(opts) {
    return own(new THREE.MeshLambertMaterial(opts));
  }

  function basicMat(opts) {
    return own(new THREE.MeshBasicMaterial(opts));
  }

  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();

  // --- ground ----------------------------------------------------------------

  const groundColor = new THREE.Color(def.groundColor || '#4a7d3a');
  {
    const segX = Math.max(8, Math.min(64, Math.round(w)));
    const segZ = Math.max(8, Math.min(64, Math.round(h)));
    const geo = own(new THREE.PlaneGeometry(w, h, segX, segZ).rotateX(-HALF_PI));
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const pos = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      // Subtle deterministic per-vertex noise: hash the vertex grid position.
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const n = Math.sin(vx * 12.9898 + vz * 78.233) * 43758.5453;
      const f = 1 + ((n - Math.floor(n)) - 0.5) * 0.14;
      colors[i * 3] = Math.min(1, groundColor.r * f);
      colors[i * 3 + 1] = Math.min(1, groundColor.g * f);
      colors[i * 3 + 2] = Math.min(1, groundColor.b * f);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, mat({ vertexColors: true }));
    ground.name = 'ground';
    group.add(ground);
  }

  // --- low walls ---------------------------------------------------------------

  if (def.walls !== false) {
    tmpColor.copy(groundColor).multiplyScalar(0.55);
    const wallMat = mat({ color: def.wallColor || '#' + tmpColor.getHexString() });
    const thick = 0.6;
    const height = 1.0;
    const geoH = own(new THREE.BoxGeometry(w + thick * 2, height, thick));
    const geoV = own(new THREE.BoxGeometry(thick, height, h));
    const north = new THREE.Mesh(geoH, wallMat);
    north.position.set(0, height / 2, -h / 2 - thick / 2);
    const south = new THREE.Mesh(geoH, wallMat);
    south.position.set(0, height / 2, h / 2 + thick / 2);
    const west = new THREE.Mesh(geoV, wallMat);
    west.position.set(-w / 2 - thick / 2, height / 2, 0);
    const east = new THREE.Mesh(geoV, wallMat);
    east.position.set(w / 2 + thick / 2, height / 2, 0);
    group.add(north, south, west, east);
  }

  // --- obstacles -----------------------------------------------------------------

  const rockMat = mat({ color: '#8f9aa3' });
  const rockDarkMat = mat({ color: '#6e7a84' });
  const trunkMat = mat({ color: '#7a5426' });
  const leafMat = mat({ color: '#3f9d2c' });
  const leafMat2 = mat({ color: '#2f7d20' });
  const crateMat = mat({ color: '#a8743d' });
  const crateEdgeMat = mat({ color: '#6e4a1e' });
  const pillarMat = mat({ color: '#b9b2a0' });

  function addObstacle(type, x, z, r) {
    r = r || 1;
    const o = new THREE.Group();
    o.position.set(x, 0, z);
    switch (type) {
      case 'tree': {
        const trunk = new THREE.Mesh(own(new THREE.CylinderGeometry(0.16 * r, 0.22 * r, 1.2 * r, 8)), trunkMat);
        trunk.position.y = 0.6 * r;
        const c1 = new THREE.Mesh(own(new THREE.ConeGeometry(0.75 * r, 1.1 * r, 9)), leafMat);
        c1.position.y = 1.5 * r;
        const c2 = new THREE.Mesh(own(new THREE.ConeGeometry(0.55 * r, 0.9 * r, 9)), leafMat2);
        c2.position.y = 2.05 * r;
        o.add(trunk, c1, c2);
        break;
      }
      case 'pillar': {
        const shaft = new THREE.Mesh(own(new THREE.CylinderGeometry(0.35 * r, 0.42 * r, 1.9 * r, 10)), pillarMat);
        shaft.position.y = 0.95 * r;
        const cap = new THREE.Mesh(own(new THREE.BoxGeometry(1.0 * r, 0.22 * r, 1.0 * r)), rockMat);
        cap.position.y = 1.95 * r;
        o.add(shaft, cap);
        break;
      }
      case 'crate': {
        const s = 0.9 * r;
        const box = new THREE.Mesh(own(new THREE.BoxGeometry(s, s, s)), crateMat);
        box.position.y = s / 2;
        box.rotation.y = rng() * 0.6 - 0.3;
        const lid = new THREE.Mesh(own(new THREE.BoxGeometry(s * 1.06, s * 0.14, s * 1.06)), crateEdgeMat);
        lid.position.y = s;
        lid.rotation.y = box.rotation.y;
        o.add(box, lid);
        break;
      }
      case 'rock':
      default: {
        const rock = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.75 * r, 0)), rockMat);
        rock.position.y = 0.42 * r;
        rock.scale.y = 0.7;
        rock.rotation.set(rng() * 0.5, rng() * TAU, rng() * 0.5);
        const chip = new THREE.Mesh(own(new THREE.IcosahedronGeometry(0.32 * r, 0)), rockDarkMat);
        chip.position.set(0.5 * r, 0.2 * r, 0.25 * r);
        chip.rotation.y = rng() * TAU;
        o.add(rock, chip);
        break;
      }
    }
    group.add(o);
  }

  const obstacles = def.obstacles || [];
  for (let i = 0; i < obstacles.length; i++) {
    const ob = obstacles[i];
    if (ob) addObstacle(ob.type, ob.x || 0, ob.z || 0, ob.r);
  }

  // --- hazards -----------------------------------------------------------------

  function flatDisc(radius, material, y) {
    const m = new THREE.Mesh(own(new THREE.CircleGeometry(radius, 26).rotateX(-HALF_PI)), material);
    m.position.y = y;
    return m;
  }

  function addHazard(hz) {
    const x = hz.x || 0;
    const z = hz.z || 0;
    const r = hz.r || hz.radius || 1.5;
    const phase = rng() * 10;
    switch (hz.type) {
      case 'lava_pool': {
        const m = basicMat({ color: '#ff7a00' });
        const disc = flatDisc(r, m, 0.035);
        disc.position.set(x, 0.035, z);
        group.add(disc);
        const rim = flatDisc(r * 1.12, basicMat({ color: '#5a1e00', transparent: true, opacity: 0.8 }), 0.03);
        rim.position.set(x, 0.03, z);
        group.add(rim);
        animated.push((t) => {
          const k = 0.5 + 0.5 * Math.sin(t * 3 + phase);
          tmpColor.set('#ff5a00');
          tmpColor2.set('#ffb400');
          m.color.copy(tmpColor).lerp(tmpColor2, k);
          disc.scale.setScalar(1 + 0.03 * Math.sin(t * 2.2 + phase));
        });
        break;
      }
      case 'poison_puddle': {
        const m = basicMat({ color: '#5fd435', transparent: true, opacity: 0.75 });
        const disc = flatDisc(r, m, 0.035);
        disc.position.set(x, 0.035, z);
        group.add(disc);
        animated.push((t) => {
          m.opacity = 0.6 + 0.18 * Math.sin(t * 2.5 + phase);
        });
        break;
      }
      case 'conveyor': {
        const cw = hz.w || r * 2;
        const ch = hz.h || r;
        const m = basicMat({ color: '#5d666e' });
        // Striped scrolling texture, generated procedurally (no assets).
        if (typeof document !== 'undefined' && document.createElement) {
          const cnv = document.createElement('canvas');
          cnv.width = 64;
          cnv.height = 64;
          const c2 = cnv.getContext('2d');
          c2.fillStyle = '#4a525a';
          c2.fillRect(0, 0, 64, 64);
          c2.fillStyle = '#788692';
          for (let s = -1; s < 5; s++) {
            c2.beginPath();
            c2.moveTo(s * 16, 64);
            c2.lineTo(s * 16 + 16, 0);
            c2.lineTo(s * 16 + 24, 0);
            c2.lineTo(s * 16 + 8, 64);
            c2.fill();
          }
          const tex = own(new THREE.CanvasTexture(cnv));
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(Math.max(1, Math.round(cw / 2)), Math.max(1, Math.round(ch / 2)));
          m.map = tex;
          m.color.set('#ffffff');
          const dir = hz.dir !== undefined ? hz.dir : 0; // radians, scroll direction
          animated.push((t) => {
            tex.offset.x = -t * (hz.speed || 0.8) * Math.cos(dir);
            tex.offset.y = -t * (hz.speed || 0.8) * Math.sin(dir);
          });
        }
        const belt = new THREE.Mesh(own(new THREE.PlaneGeometry(cw, ch).rotateX(-HALF_PI)), m);
        belt.position.set(x, 0.04, z);
        if (hz.dir) belt.rotation.y = -hz.dir;
        group.add(belt);
        break;
      }
      case 'banana_storm':
      case 'collapsing_stone': {
        const isBanana = hz.type === 'banana_storm';
        const ringMat = basicMat({
          color: isBanana ? '#ffd93b' : '#ff6a3d',
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(own(new THREE.RingGeometry(0.82, 1, 32).rotateX(-HALF_PI)), ringMat);
        ring.position.set(x, 0.05, z);
        ring.scale.setScalar(r);
        group.add(ring);

        let falling;
        if (isBanana) {
          falling = new THREE.Mesh(
            own(new THREE.TorusGeometry(0.3, 0.11, 6, 10)),
            mat({ color: '#ffd93b' })
          );
        } else {
          falling = new THREE.Mesh(own(new THREE.BoxGeometry(0.9, 0.9, 0.9)), rockMat);
        }
        falling.position.set(x, 12, z);
        falling.visible = false;
        group.add(falling);

        const interval = hz.interval || 2.8;
        animated.push((t) => {
          const cycle = ((t + phase) % interval) / interval;
          if (cycle < 0.62) {
            // telegraph phase: pulsing ring
            ring.visible = true;
            falling.visible = false;
            ringMat.opacity = 0.35 + 0.35 * Math.sin(t * 14 + phase);
            ring.scale.setScalar(r * (0.5 + 0.5 * (cycle / 0.62)));
          } else {
            // impact phase: primitive drops in
            ring.visible = true;
            ringMat.opacity = 0.75;
            ring.scale.setScalar(r);
            falling.visible = true;
            const k = (cycle - 0.62) / 0.38;
            falling.position.y = 12 * (1 - k * k) + 0.35;
            falling.rotation.x = t * 4;
            falling.rotation.z = t * 3;
          }
        });
        break;
      }
      case 'geyser': {
        const disc = flatDisc(r, basicMat({ color: '#4aa3ff', transparent: true, opacity: 0.7 }), 0.035);
        disc.position.set(x, 0.035, z);
        group.add(disc);
        const column = new THREE.Mesh(
          own(new THREE.CylinderGeometry(r * 0.45, r * 0.6, 1, 12)),
          basicMat({ color: '#9fd6ff', transparent: true, opacity: 0.75 })
        );
        column.position.set(x, 0.5, z);
        column.visible = false;
        group.add(column);
        const interval = hz.interval || 3.2;
        animated.push((t) => {
          const cycle = ((t + phase) % interval) / interval;
          if (cycle > 0.75) {
            const k = Math.sin(((cycle - 0.75) / 0.25) * Math.PI);
            column.visible = true;
            column.scale.set(1, Math.max(0.01, k * 3.2), 1);
            column.position.y = column.scale.y / 2;
          } else {
            column.visible = false;
          }
        });
        break;
      }
      case 'thorn_patch': {
        const patch = new THREE.Group();
        patch.position.set(x, 0, z);
        const spikeGeo = own(new THREE.ConeGeometry(0.09, 0.42, 6));
        const spikes = 5 + Math.floor(r * 3);
        for (let s = 0; s < spikes; s++) {
          const spike = new THREE.Mesh(spikeGeo, trunkMat);
          const a = rng() * TAU;
          const d = Math.sqrt(rng()) * r * 0.9;
          spike.position.set(Math.cos(a) * d, 0.21, Math.sin(a) * d);
          spike.rotation.set((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
          patch.add(spike);
        }
        group.add(patch);
        break;
      }
      case 'dark_zone': {
        const m = basicMat({ color: '#000000', transparent: true, opacity: 0.55, depthWrite: false });
        const disc = flatDisc(r, m, 0.045);
        disc.position.set(x, 0.045, z);
        group.add(disc);
        animated.push((t) => {
          m.opacity = 0.5 + 0.08 * Math.sin(t * 1.3 + phase);
        });
        break;
      }
      default:
        break;
    }
  }

  const hazards = def.hazards || [];
  for (let i = 0; i < hazards.length; i++) {
    if (hazards[i]) addHazard(hazards[i]);
  }

  // --- scattered theme props -----------------------------------------------------

  {
    const density = def.propDensity !== undefined ? def.propDensity : 0.3;
    const count = Math.max(0, Math.floor((w * h * density) / 40));
    const grassGeo = own(new THREE.ConeGeometry(0.07, 0.35, 5));
    const pebbleGeo = own(new THREE.IcosahedronGeometry(0.14, 0));
    const grassMat = mat({ color: '#5fae3f' });
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * (w - 3);
      const z = (rng() - 0.5) * (h - 3);
      if (x * x + z * z < 16) continue; // keep the spawn area clean
      const roll = rng();
      if (roll < 0.45) {
        // grass tuft
        const tuft = new THREE.Group();
        tuft.position.set(x, 0, z);
        const blades = 2 + Math.floor(rng() * 3);
        for (let b = 0; b < blades; b++) {
          const blade = new THREE.Mesh(grassGeo, grassMat);
          blade.position.set((rng() - 0.5) * 0.3, 0.17, (rng() - 0.5) * 0.3);
          blade.rotation.set((rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4);
          tuft.add(blade);
        }
        group.add(tuft);
      } else if (roll < 0.7) {
        const pebble = new THREE.Mesh(pebbleGeo, rockDarkMat);
        pebble.position.set(x, 0.08, z);
        pebble.scale.setScalar(0.6 + rng() * 0.9);
        pebble.rotation.y = rng() * TAU;
        group.add(pebble);
      } else if (roll < 0.85) {
        addObstacle('tree', x, z, 0.55 + rng() * 0.4);
      } else {
        addObstacle('rock', x, z, 0.4 + rng() * 0.35);
      }
    }
  }

  // --- per-frame hazard animation hook ---------------------------------------------

  group.userData.update = function update(t, dt) {
    for (let i = 0; i < animated.length; i++) animated[i](t, dt);
  };

  function dispose() {
    if (group.parent) group.parent.remove(group);
    for (let i = 0; i < owned.length; i++) {
      if (owned[i] && owned[i].dispose) owned[i].dispose();
    }
    owned.length = 0;
    animated.length = 0;
    group.clear();
  }

  return { group, dispose };
}
