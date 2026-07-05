// APETATO render/lights — the fixed scene lighting rig.
// Hemisphere (sky #bbddee / ground #665533, 0.9) + one directional (1.1)
// from (10, 20, 6). No shadow maps by design (perf contract); grounding
// comes from the models' baked shadow discs instead.

import * as THREE from 'three';

/** Build the light rig as a single group ready to add to the scene. */
export function createLights() {
  const group = new THREE.Group();
  group.name = 'lights';

  const hemi = new THREE.HemisphereLight(0xbbddee, 0x665533, 0.9);
  group.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(10, 20, 6);
  dir.castShadow = false;
  group.add(dir);
  // Aim at the origin; the ortho camera follows the player but light
  // direction is what matters for Lambert shading, not position.
  group.add(dir.target);

  return group;
}
