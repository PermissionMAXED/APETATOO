// APETATO arenas — JUNGLE SET (arenas 1-5).
// The green half of the world tour: grove, beach, marsh, canopy, caldera.
// Pure frozen data. Sizes are full extents on the XZ plane, centered on
// origin; systems handle spawning, hazards, and unlock checks.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const JUNGLE_ARENAS = deepFreeze([
  // Where every ape's story starts: soft grass, gentle beetles, free bananas.
  {
    id: 'banana_grove',
    name: 'Banana Grove',
    size: { w: 44, h: 28 },
    groundColor: '#4a7d2c',
    wallColor: '#2f5d26',
    propDensity: 0.5,
    obstacles: [
      { shape: 'circle', x: -12, z: -6, r: 1.2, model: 'tree' },
      { shape: 'circle', x: 13, z: 7, r: 1.2, model: 'tree' },
      { shape: 'circle', x: 6, z: -8, r: 0.8, model: 'rock' },
      { shape: 'circle', x: -7, z: 8, r: 0.7, model: 'crate' },
    ],
    hazards: [],
    enemyPool: [
      { id: 'jungle_beetle', weight: 5 },
      { id: 'swarm_gnat', weight: 3 },
      { id: 'banana_slime', weight: 2 },
      { id: 'banana_slimelet', weight: 1 },
      { id: 'coco_thrower', weight: 1 },
    ],
    bossId: 'king_peeler',
    minibossId: 'royal_slime',
    modifiers: { enemySpeedMult: 1.0, spawnBudgetMult: 0.9 },
    music: 'jungle',
    unlock: { type: 'default' },
  },
  // Sand in places you didn't know you had. The crabs charge rent by the pinch.
  {
    id: 'crab_beach',
    name: 'Crab Beach',
    size: { w: 40, h: 26 },
    groundColor: '#d9c28a',
    wallColor: '#3a7d8a',
    propDensity: 0.4,
    obstacles: [
      { shape: 'circle', x: -10, z: 5, r: 1.0, model: 'rock' },
      { shape: 'circle', x: 11, z: -6, r: 1.1, model: 'rock' },
      { shape: 'circle', x: 0, z: 8, r: 0.8, model: 'crate' },
      { shape: 'circle', x: -14, z: -7, r: 0.9, model: 'tree' },
    ],
    hazards: [
      { type: 'geyser', x: -6, z: 0, r: 1.2, interval: 5, knockback: 8 },
      { type: 'geyser', x: 8, z: 4, r: 1.2, interval: 7, knockback: 8 },
    ],
    enemyPool: [
      { id: 'scuttle_crab', weight: 5 },
      { id: 'jungle_beetle', weight: 3 },
      { id: 'coco_thrower', weight: 2 },
      { id: 'puff_toad', weight: 2 },
      { id: 'swarm_gnat', weight: 2 },
      { id: 'bark_shielder', weight: 1 },
    ],
    bossId: 'crab_matriarch',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.0, spawnBudgetMult: 1.0 },
    music: 'jungle',
    unlock: { type: 'wins', count: 1 },
  },
  // Smells like regret and fermented banana peels. The puddles are not lemonade.
  {
    id: 'viper_marsh',
    name: 'Viper Marsh',
    size: { w: 48, h: 30 },
    groundColor: '#3f5d33',
    wallColor: '#26401f',
    propDensity: 0.6,
    obstacles: [
      { shape: 'circle', x: -15, z: 8, r: 1.3, model: 'tree' },
      { shape: 'circle', x: 14, z: -9, r: 1.3, model: 'tree' },
      { shape: 'circle', x: 3, z: 10, r: 0.9, model: 'rock' },
      { shape: 'circle', x: -5, z: -10, r: 0.8, model: 'rock' },
    ],
    hazards: [
      { type: 'poison_puddle', x: -8, z: -4, r: 2.2, dps: 4 },
      { type: 'poison_puddle', x: 10, z: 5, r: 2.5, dps: 4 },
      { type: 'poison_puddle', x: 0, z: -9, r: 1.8, dps: 4 },
      { type: 'thorn_patch', x: 16, z: -2, r: 1.6, dps: 2, slowPct: 40 },
    ],
    enemyPool: [
      { id: 'vine_snake', weight: 5 },
      { id: 'puff_toad', weight: 3 },
      { id: 'root_healer', weight: 2 },
      { id: 'banana_slime', weight: 2 },
      { id: 'swarm_gnat', weight: 2 },
      { id: 'leaf_sniper', weight: 1 },
    ],
    bossId: 'viper_empress',
    minibossId: 'royal_slime',
    modifiers: { enemySpeedMult: 0.95, spawnBudgetMult: 1.05 },
    music: 'night',
    unlock: { type: 'wins', count: 2 },
  },
  // High enough that the ground is a rumor. The branches move; your footing negotiates.
  {
    id: 'canopy_heights',
    name: 'Canopy Heights',
    size: { w: 36, h: 24 },
    groundColor: '#5d7a3b',
    wallColor: '#3a5226',
    propDensity: 0.3,
    obstacles: [
      { shape: 'circle', x: -9, z: 0, r: 1.0, model: 'tree' },
      { shape: 'circle', x: 9, z: 3, r: 1.0, model: 'tree' },
      { shape: 'circle', x: 0, z: -7, r: 0.7, model: 'crate' },
    ],
    hazards: [
      { type: 'conveyor', x: 0, z: 5, w: 14, h: 3, dirX: 1, dirZ: 0, speed: 3 },
      { type: 'conveyor', x: -4, z: -4, w: 12, h: 3, dirX: -1, dirZ: 0, speed: 3 },
      { type: 'conveyor', x: 12, z: -2, w: 3, h: 10, dirX: 0, dirZ: 1, speed: 2.5 },
    ],
    enemyPool: [
      { id: 'parrot_drone', weight: 4 },
      { id: 'swarm_gnat', weight: 3 },
      { id: 'vine_snake', weight: 2 },
      { id: 'leaf_sniper', weight: 2 },
      { id: 'coco_thrower', weight: 2 },
      { id: 'frenzy_gibbon', weight: 1 },
    ],
    bossId: 'sky_shrieker',
    minibossId: 'royal_slime',
    modifiers: { enemySpeedMult: 1.05, spawnBudgetMult: 1.0 },
    music: 'jungle',
    unlock: { type: 'wins', count: 3 },
  },
  // The one place in the jungle where flame-grilled banana happens by accident.
  {
    id: 'volcano_rim',
    name: 'Volcano Rim',
    size: { w: 46, h: 30 },
    groundColor: '#4a3230',
    wallColor: '#2b1c1a',
    propDensity: 0.35,
    obstacles: [
      { shape: 'circle', x: -13, z: -7, r: 1.4, model: 'rock' },
      { shape: 'circle', x: 14, z: 8, r: 1.3, model: 'rock' },
      { shape: 'circle', x: 5, z: -10, r: 0.9, model: 'pillar' },
      { shape: 'circle', x: -6, z: 9, r: 0.9, model: 'pillar' },
    ],
    hazards: [
      { type: 'lava_pool', x: 0, z: 0, r: 2.8, dps: 8 },
      { type: 'lava_pool', x: -14, z: 6, r: 2.0, dps: 8 },
      { type: 'lava_pool', x: 13, z: -6, r: 2.2, dps: 8 },
    ],
    enemyPool: [
      { id: 'puff_toad', weight: 3 },
      { id: 'jungle_beetle', weight: 3 },
      { id: 'coconut_golem', weight: 2 },
      { id: 'robo_ape', weight: 2 },
      { id: 'coco_thrower', weight: 2 },
      { id: 'frenzy_gibbon', weight: 1 },
    ],
    bossId: 'cinder_kong',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.0, spawnBudgetMult: 1.1 },
    music: 'volcano',
    unlock: { type: 'wins', count: 4 },
  },
]);
