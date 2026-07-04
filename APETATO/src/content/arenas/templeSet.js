// APETATO arenas — TEMPLE SET (arenas 6-10).
// The stone half of the world tour: storm shelf, old temple, dark jungle,
// rusty ruins, and the big golden chair at the end.
// Pure frozen data; systems handle spawning, hazards, and unlock checks.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const TEMPLE_ARENAS = deepFreeze([
  // Weather forecast: bananas, falling, with a chance of geyser. Bring a helmet.
  {
    id: 'storm_plateau',
    name: 'Storm Plateau',
    size: { w: 44, h: 28 },
    groundColor: '#5d6b70',
    wallColor: '#3a464d',
    propDensity: 0.3,
    obstacles: [
      { shape: 'circle', x: -11, z: 6, r: 1.1, model: 'rock' },
      { shape: 'circle', x: 12, z: -7, r: 1.1, model: 'rock' },
      { shape: 'circle', x: 0, z: 9, r: 0.9, model: 'pillar' },
    ],
    hazards: [
      { type: 'banana_storm', interval: 6, damage: 6, radius: 2.0 },
      { type: 'geyser', x: -7, z: -3, r: 1.3, interval: 5, knockback: 9 },
      { type: 'geyser', x: 8, z: 5, r: 1.3, interval: 6, knockback: 9 },
    ],
    enemyPool: [
      { id: 'parrot_drone', weight: 3 },
      { id: 'shadow_ape', weight: 2 },
      { id: 'coco_thrower', weight: 3 },
      { id: 'swarm_gnat', weight: 2 },
      { id: 'leaf_sniper', weight: 2 },
      { id: 'jungle_beetle', weight: 2 },
    ],
    bossId: 'thunder_mandrill',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.05, spawnBudgetMult: 1.1 },
    music: 'storm',
    unlock: { type: 'wins', count: 5 },
  },
  // The ceiling predates gravity regulations. Mind the falling architecture.
  {
    id: 'ancient_temple',
    name: 'Ancient Temple',
    size: { w: 48, h: 32 },
    groundColor: '#8a8272',
    wallColor: '#4d473d',
    propDensity: 0.45,
    obstacles: [
      { shape: 'circle', x: -14, z: -8, r: 1.2, model: 'pillar' },
      { shape: 'circle', x: 14, z: -8, r: 1.2, model: 'pillar' },
      { shape: 'circle', x: -14, z: 8, r: 1.2, model: 'pillar' },
      { shape: 'circle', x: 14, z: 8, r: 1.2, model: 'pillar' },
      { shape: 'circle', x: 0, z: 0, r: 1.0, model: 'crate' },
    ],
    hazards: [
      { type: 'collapsing_stone', interval: 5, damage: 8, radius: 2.2 },
    ],
    enemyPool: [
      { id: 'stone_totem', weight: 2 },
      { id: 'coconut_golem', weight: 3 },
      { id: 'bark_shielder', weight: 3 },
      { id: 'root_healer', weight: 2 },
      { id: 'scuttle_crab', weight: 3 },
      { id: 'vine_snake', weight: 2 },
    ],
    bossId: 'temple_guardian',
    minibossId: 'royal_slime',
    modifiers: { enemySpeedMult: 0.95, spawnBudgetMult: 1.15 },
    music: 'temple',
    unlock: { type: 'wins', count: 6 },
  },
  // Same jungle, lights off. Everything with eyes already knows where you are.
  {
    id: 'night_jungle',
    name: 'Night Jungle',
    size: { w: 44, h: 28 },
    groundColor: '#233326',
    wallColor: '#141f17',
    propDensity: 0.55,
    obstacles: [
      { shape: 'circle', x: -12, z: 5, r: 1.3, model: 'tree' },
      { shape: 'circle', x: 11, z: -6, r: 1.3, model: 'tree' },
      { shape: 'circle', x: 4, z: 9, r: 0.9, model: 'rock' },
      { shape: 'circle', x: -6, z: -9, r: 0.8, model: 'rock' },
    ],
    hazards: [
      { type: 'dark_zone', x: -9, z: -4, r: 4 },
      { type: 'dark_zone', x: 10, z: 5, r: 4.5 },
      { type: 'thorn_patch', x: 0, z: -8, r: 1.8, dps: 2, slowPct: 35 },
    ],
    enemyPool: [
      { id: 'shadow_ape', weight: 4 },
      { id: 'vine_snake', weight: 3 },
      { id: 'leaf_sniper', weight: 2 },
      { id: 'puff_toad', weight: 2 },
      { id: 'root_healer', weight: 2 },
      { id: 'frenzy_gibbon', weight: 1 },
    ],
    bossId: 'umbral_silverback',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.0, spawnBudgetMult: 1.1 },
    music: 'night',
    unlock: { type: 'wins', count: 7 },
  },
  // An abandoned banana-processing plant. The machines still work; that's the problem.
  {
    id: 'robo_ruins',
    name: 'Robo Ruins',
    size: { w: 50, h: 32 },
    groundColor: '#5a6068',
    wallColor: '#33383f',
    propDensity: 0.4,
    obstacles: [
      { shape: 'circle', x: -15, z: 0, r: 1.2, model: 'crate' },
      { shape: 'circle', x: 15, z: 0, r: 1.2, model: 'crate' },
      { shape: 'circle', x: 0, z: 10, r: 1.0, model: 'pillar' },
      { shape: 'circle', x: 0, z: -10, r: 1.0, model: 'pillar' },
    ],
    hazards: [
      { type: 'conveyor', x: -8, z: 4, w: 12, h: 3, dirX: 1, dirZ: 0, speed: 3.5 },
      { type: 'conveyor', x: 8, z: -4, w: 12, h: 3, dirX: -1, dirZ: 0, speed: 3.5 },
      { type: 'conveyor', x: 0, z: 0, w: 3, h: 12, dirX: 0, dirZ: 1, speed: 3 },
    ],
    enemyPool: [
      { id: 'robo_ape', weight: 4 },
      { id: 'parrot_drone', weight: 3 },
      { id: 'coconut_golem', weight: 2 },
      { id: 'stone_totem', weight: 1 },
      { id: 'coco_thrower', weight: 2 },
      { id: 'scuttle_crab', weight: 2 },
    ],
    bossId: 'apex_automaton',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.05, spawnBudgetMult: 1.15 },
    music: 'temple',
    unlock: { type: 'wins', count: 8 },
  },
  // The seat of banana power. Gorillard Prime does not share the armrest.
  {
    id: 'gorillard_throne',
    name: 'Gorillard Throne',
    size: { w: 56, h: 36 },
    groundColor: '#4d3a26',
    wallColor: '#2b1f12',
    propDensity: 0.5,
    obstacles: [
      { shape: 'circle', x: -18, z: -10, r: 1.4, model: 'pillar' },
      { shape: 'circle', x: 18, z: -10, r: 1.4, model: 'pillar' },
      { shape: 'circle', x: -18, z: 10, r: 1.4, model: 'pillar' },
      { shape: 'circle', x: 18, z: 10, r: 1.4, model: 'pillar' },
      { shape: 'circle', x: 0, z: -13, r: 1.6, model: 'rock' },
    ],
    hazards: [
      { type: 'lava_pool', x: -12, z: 0, r: 2.0, dps: 8 },
      { type: 'lava_pool', x: 12, z: 0, r: 2.0, dps: 8 },
      { type: 'banana_storm', interval: 8, damage: 7, radius: 2.2 },
      { type: 'dark_zone', x: 0, z: 12, r: 4 },
      { type: 'geyser', x: 0, z: -6, r: 1.4, interval: 6, knockback: 10 },
    ],
    enemyPool: [
      { id: 'frenzy_gibbon', weight: 2 },
      { id: 'robo_ape', weight: 3 },
      { id: 'shadow_ape', weight: 3 },
      { id: 'coconut_golem', weight: 3 },
      { id: 'stone_totem', weight: 1 },
      { id: 'root_healer', weight: 2 },
      { id: 'bark_shielder', weight: 2 },
      { id: 'leaf_sniper', weight: 2 },
    ],
    bossId: 'gorillard_prime',
    minibossId: 'crab_captain',
    modifiers: { enemySpeedMult: 1.1, spawnBudgetMult: 1.25 },
    music: 'volcano',
    unlock: { type: 'wins', count: 9 },
  },
]);
