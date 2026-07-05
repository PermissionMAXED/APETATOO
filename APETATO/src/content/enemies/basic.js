// APETATO enemies — BASIC roster (tier 1-2, budgetCost 1-2).
// The jungle's welcoming committee: crunchy, squishy, and deeply banana-motivated.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.
// All values are BASE wave-1 numbers; wave/difficulty systems apply scaling.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const BASIC_ENEMIES = deepFreeze([
  // Standard-issue jungle floor crunch. Believes your ankles are banana stems.
  {
    id: 'jungle_beetle',
    name: 'Jungle Beetle',
    tier: 1,
    hp: 8,
    damage: 3,
    speed: 2.8,
    radius: 0.35,
    xp: 1,
    coinChance: 0.20,
    behavior: 'chaser',
    behaviorParams: {},
    attack: { type: 'contact', cooldown: 0.8 },
    budgetCost: 1,
    eliteAllowed: true,
    model: {
      base: 'bug', scale: 0.7, primary: '#3a6b2a', secondary: '#26471c', accent: '#ffd93b',
      parts: [
        { shape: 'sphere', size: [0.4, 0.28, 0.5], pos: [0, 0.25, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'cone', size: [0.06, 0.25, 0.06], pos: [-0.1, 0.35, 0.35], rot: [1.2, 0, 0.3], color: 'secondary' },
        { shape: 'cone', size: [0.06, 0.25, 0.06], pos: [0.1, 0.35, 0.35], rot: [1.2, 0, -0.3], color: 'secondary' },
        { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, 0.3, 0.42], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    sfxDeath: 'crunch',
  },
  // One gnat is a joke. Forty gnats are a weather condition with opinions.
  {
    id: 'swarm_gnat',
    name: 'Swarm Gnat',
    tier: 1,
    hp: 3,
    damage: 2,
    speed: 4.6,
    radius: 0.22,
    xp: 1,
    coinChance: 0.08,
    behavior: 'swarmer',
    behaviorParams: { packSize: 6 },
    attack: { type: 'contact', cooldown: 0.6 },
    budgetCost: 1,
    eliteAllowed: false,
    model: {
      base: 'bug', scale: 0.35, primary: '#6b7a3a', secondary: '#c9d6a3', accent: '#2b2b2b',
      parts: [
        { shape: 'sphere', size: [0.2, 0.16, 0.26], pos: [0, 0.5, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'box', size: [0.3, 0.02, 0.12], pos: [-0.18, 0.58, 0], rot: [0, 0, 0.4], color: 'secondary' },
        { shape: 'box', size: [0.3, 0.02, 0.12], pos: [0.18, 0.58, 0], rot: [0, 0, -0.4], color: 'secondary' },
      ],
      animation: 'hover',
    },
    sfxDeath: 'pop',
  },
  // A crab that lifted. Slow, rude, and armored like a coconut with a grudge.
  {
    id: 'scuttle_crab',
    name: 'Scuttle Crab',
    tier: 1,
    hp: 15,
    damage: 4,
    speed: 1.7,
    radius: 0.45,
    xp: 2,
    coinChance: 0.30,
    behavior: 'chaser',
    behaviorParams: {},
    attack: { type: 'contact', cooldown: 1.0 },
    budgetCost: 2,
    eliteAllowed: true,
    model: {
      base: 'crab', scale: 0.9, primary: '#d9543b', secondary: '#8a3222', accent: '#ffe8d0',
      parts: [
        { shape: 'box', size: [0.55, 0.25, 0.4], pos: [0, 0.25, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.16, 0.14, 0.14], pos: [-0.4, 0.25, 0.2], rot: [0, 0.4, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.16, 0.14, 0.14], pos: [0.4, 0.25, 0.2], rot: [0, -0.4, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, 0.42, 0.15], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    sfxDeath: 'crunch',
  },
  // Pretends to be scenery, then arrives all at once like an angry green invoice.
  {
    id: 'vine_snake',
    name: 'Vine Snake',
    tier: 2,
    hp: 10,
    damage: 5,
    speed: 2.4,
    radius: 0.35,
    xp: 2,
    coinChance: 0.24,
    behavior: 'charger',
    behaviorParams: { windup: 0.7, chargeSpeed: 9, chargeDuration: 0.5 },
    attack: { type: 'contact', cooldown: 1.2 },
    budgetCost: 2,
    eliteAllowed: true,
    model: {
      base: 'snake', scale: 0.8, primary: '#4a8a3b', secondary: '#2f5d26', accent: '#ffd93b',
      parts: [
        { shape: 'cylinder', size: [0.12, 0.7, 0.12], pos: [0, 0.15, -0.2], rot: [1.35, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.16, 0.14, 0.2], pos: [0, 0.3, 0.25], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [-0.06, 0.34, 0.38], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0.06, 0.34, 0.38], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'slither',
    },
    sfxDeath: 'hiss',
  },
  // A dessert that fights back. Pop it and it files for smaller, angrier subsidiaries.
  {
    id: 'banana_slime',
    name: 'Banana Slime',
    tier: 2,
    hp: 12,
    damage: 3,
    speed: 2.0,
    radius: 0.5,
    xp: 2,
    coinChance: 0.28,
    behavior: 'splitter',
    behaviorParams: { splitInto: 'banana_slimelet', count: 3 },
    attack: { type: 'contact', cooldown: 0.9 },
    budgetCost: 2,
    eliteAllowed: true,
    model: {
      base: 'blob', scale: 1.0, primary: '#ffd93b', secondary: '#c9a52b', accent: '#5d3d1e',
      parts: [
        { shape: 'sphere', size: [0.5, 0.4, 0.5], pos: [0, 0.35, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'cone', size: [0.1, 0.25, 0.1], pos: [0, 0.75, 0], rot: [0, 0, 0.35], color: 'secondary' },
        { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [-0.15, 0.45, 0.4], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [0.15, 0.45, 0.4], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'hop',
    },
    sfxDeath: 'splat',
  },
  // Never learned to share. Hoards coconuts, redistributes them at high velocity.
  {
    id: 'coco_thrower',
    name: 'Coco Thrower',
    tier: 2,
    hp: 9,
    damage: 2,
    speed: 2.2,
    radius: 0.4,
    xp: 2,
    coinChance: 0.30,
    behavior: 'shooter',
    behaviorParams: { keepDistance: 6, fireCooldown: 2.2 },
    attack: { type: 'projectile', cooldown: 2.2, projectileSpeed: 7, projDamage: 4, projVisual: 'coconut' },
    budgetCost: 2,
    eliteAllowed: true,
    model: {
      base: 'ape', scale: 0.9, primary: '#7a5a3b', secondary: '#4a3520', accent: '#8a6f4a',
      parts: [
        { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [0.3, 0.55, 0.1], rot: [0, 0, 0], color: 'accent' },
        { shape: 'box', size: [0.34, 0.14, 0.24], pos: [0, 0.15, -0.28], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.1, 0.1, 0.1], pos: [-0.08, 0.28, -0.28], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.1, 0.1, 0.1], pos: [0.1, 0.26, -0.24], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    sfxDeath: 'thud',
  },
  // Inflates with pride and questionable gases. Do not hug. It wants the hug.
  {
    id: 'puff_toad',
    name: 'Puff Toad',
    tier: 2,
    hp: 7,
    damage: 2,
    speed: 2.6,
    radius: 0.4,
    xp: 2,
    coinChance: 0.22,
    behavior: 'exploder',
    behaviorParams: { fuseRange: 1.6, explodeRadius: 2.2, explodeDamage: 9 },
    attack: { type: 'aoe', cooldown: 1.5, radius: 2.2, telegraph: 0.6 },
    budgetCost: 2,
    eliteAllowed: true,
    model: {
      base: 'blob', scale: 0.85, primary: '#8a6ba3', secondary: '#5d4a70', accent: '#d6f5a3',
      parts: [
        { shape: 'sphere', size: [0.45, 0.35, 0.42], pos: [0, 0.3, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.1, 0.1, 0.1], pos: [-0.18, 0.6, 0.15], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.1, 0.1, 0.1], pos: [0.18, 0.6, 0.15], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.08, 0.06, 0.08], pos: [0, 0.15, 0.38], rot: [0, 0, 0], color: 'secondary' },
      ],
      animation: 'hop',
    },
    sfxDeath: 'poof',
  },
  // The subsidiary. Legally distinct from its parent slime, equally banana.
  {
    id: 'banana_slimelet',
    name: 'Banana Slimelet',
    tier: 1,
    hp: 2,
    damage: 2,
    speed: 3.4,
    radius: 0.25,
    xp: 1,
    coinChance: 0.04,
    behavior: 'swarmer',
    behaviorParams: { packSize: 3 },
    attack: { type: 'contact', cooldown: 0.7 },
    budgetCost: 1,
    eliteAllowed: false,
    model: {
      base: 'blob', scale: 0.5, primary: '#ffe06b', secondary: '#c9a52b', accent: '#5d3d1e',
      parts: [
        { shape: 'sphere', size: [0.3, 0.24, 0.3], pos: [0, 0.22, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [-0.09, 0.28, 0.24], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0.09, 0.28, 0.24], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'hop',
    },
    sfxDeath: 'squish',
  },
]);
