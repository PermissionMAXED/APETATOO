// APETATO weapons — EXPLOSIVE.
// For apes who believe every problem is a demolition permit waiting to happen.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const EXPLOSIVE_WEAPONS = deepFreeze([
  {
    id: 'cherry_bomb_pouch',
    name: 'Cherry Bomb Pouch',
    description: 'Looks like fruit. Detonates like opinions at a family dinner.',
    classes: ['explosive'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 6, cooldown: 1.2, range: 7, knockback: 5, critChance: 3, critMult: 1.5, projectileSpeed: 9, radius: 1.8 },
    scaling: { damagePct: 1.0, explosionSize: 0.5 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.5, arcHeight: 2 },
    onHit: [],
    visual: {
      projectile: 'cherry_bomb',
      muzzle: 'toss_puff',
      model: {
        base: 'custom', scale: 0.45, primary: '#d9302b', secondary: '#3f7d2c', accent: '#2b2b2b',
        parts: [
          { shape: 'sphere', size: [0.16, 0.16, 0.16], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.02, 0.12, 0.02], pos: [0, 0.14, 0], rot: [0, 0, 0.3], color: 'secondary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'boom_small',
    unlock: { type: 'default' },
  },
  {
    id: 'dung_bomb',
    name: 'Dung Bomb',
    description: 'Nature\'s grenade. Everyone within three meters files a complaint.',
    classes: ['explosive', 'poison'],
    tier: 1,
    basePrice: 14,
    stats: { damage: 5, cooldown: 1.3, range: 6.5, knockback: 3, critChance: 3, critMult: 1.5, projectileSpeed: 8, radius: 2.2, duration: 2 },
    scaling: { damagePct: 0.8, elementalDamage: 0.5 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.3, arcHeight: 2.5, leaveCloud: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'poison', dps: 2, duration: 2, target: 'area', radius: 2.2 }] },
    ],
    visual: {
      projectile: 'dung_ball',
      muzzle: 'toss_puff',
      model: {
        base: 'custom', scale: 0.45, primary: '#6b4a2b', secondary: '#4b3220', accent: '#a5d64a',
        parts: [
          { shape: 'sphere', size: [0.17, 0.15, 0.17], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [0.09, 0.09, 0], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'splat',
    unlock: { type: 'default' },
  },
  {
    id: 'coconut_grenade_launcher',
    name: 'Coconut Grenade Launcher',
    description: 'Pump-action palm tree. Serves coconuts at terminal velocity, shells included.',
    classes: ['explosive'],
    tier: 2,
    basePrice: 32,
    stats: { damage: 11, cooldown: 1.3, range: 9, knockback: 8, critChance: 3, critMult: 1.5, projectileSpeed: 11, radius: 2.4 },
    scaling: { damagePct: 1.0, explosionSize: 0.6, rangedDamage: 0.3 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.2, arcHeight: 2.5, bounce: 1 },
    onHit: [],
    visual: {
      projectile: 'coconut',
      muzzle: 'smoke_ring',
      model: {
        base: 'custom', scale: 0.65, primary: '#5d3d1e', secondary: '#8a5a2b', accent: '#3f7d2c',
        parts: [
          { shape: 'cylinder', size: [0.11, 0.5, 0.11], pos: [0, 0, 0.15], rot: [1.57, 0, 0], color: 'primary' },
          { shape: 'box', size: [0.09, 0.12, 0.2], pos: [0, -0.08, -0.12], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cone', size: [0.05, 0.12, 0.05], pos: [0, 0.1, -0.05], rot: [0.5, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'thoomp',
    unlock: { type: 'default' },
  },
  {
    id: 'proximity_peel_mine',
    name: 'Proximity Peel Mine',
    description: 'A landmine disguised as a comedy prop. The punchline is shrapnel.',
    classes: ['explosive', 'tech'],
    tier: 2,
    basePrice: 28,
    stats: { damage: 14, cooldown: 1.8, range: 7, knockback: 9, critChance: 3, critMult: 1.5, radius: 2.6, duration: 12 },
    scaling: { damagePct: 0.9, engineering: 0.7, explosionSize: 0.5 },
    behavior: 'mine',
    behaviorParams: { armTime: 0.6, maxActive: 4, triggerRadius: 1.2 },
    onHit: [],
    visual: {
      projectile: 'peel_mine',
      muzzle: 'toss_puff',
      model: {
        base: 'custom', scale: 0.5, primary: '#ffd93b', secondary: '#2b2b2b', accent: '#d9302b',
        parts: [
          { shape: 'cylinder', size: [0.16, 0.06, 0.16], pos: [0, 0, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cone', size: [0.1, 0.1, 0.1], pos: [0, 0.07, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.03, 0.03, 0.03], pos: [0, 0.14, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'beep_boom',
    unlock: { type: 'default' },
  },
  {
    id: 'war_drum_shockwave',
    name: 'War Drum Shockwave',
    description: 'One mighty BOOM on a hollow log. Physics apologizes to everyone nearby.',
    classes: ['explosive'],
    tier: 2,
    basePrice: 27,
    stats: { damage: 8, cooldown: 1.0, range: 3.5, knockback: 12, critChance: 3, critMult: 1.5, radius: 3.5 },
    scaling: { damagePct: 0.9, knockback: 0.6, maxHp: 0.1 },
    behavior: 'nova',
    behaviorParams: { ring: true },
    onHit: [
      { trigger: 'onHit', chance: 20, do: [{ op: 'status', status: 'stun', dps: 0, duration: 0.5, target: 'target' }] },
    ],
    visual: {
      projectile: 'shock_ring',
      muzzle: 'drum_ring',
      model: {
        base: 'custom', scale: 0.6, primary: '#8a5a2b', secondary: '#d9b38c', accent: '#d9302b',
        parts: [
          { shape: 'cylinder', size: [0.2, 0.18, 0.2], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.21, 0.03, 0.21], pos: [0, 0.1, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [0.15, 0.22, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'drum_boom',
    unlock: { type: 'default' },
  },
  {
    id: 'banana_split_mortar',
    name: 'Banana Split Mortar',
    description: 'Fires one dessert that becomes four regrets on impact.',
    classes: ['explosive'],
    tier: 3,
    basePrice: 55,
    stats: { damage: 16, cooldown: 1.6, range: 10, knockback: 7, critChance: 3, critMult: 1.5, projectileSpeed: 10, radius: 2.2, count: 4 },
    scaling: { damagePct: 1.1, explosionSize: 0.7 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.2, arcHeight: 4, cluster: { count: 4, damageMult: 0.35, radius: 1.4 } },
    onHit: [],
    visual: {
      projectile: 'banana_shell',
      muzzle: 'smoke_ring',
      model: {
        base: 'custom', scale: 0.7, primary: '#ffd93b', secondary: '#5d666e', accent: '#d9302b',
        parts: [
          { shape: 'cylinder', size: [0.13, 0.55, 0.13], pos: [0, 0.1, 0.1], rot: [0.9, 0, 0], color: 'secondary' },
          { shape: 'box', size: [0.24, 0.06, 0.24], pos: [0, -0.14, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cone', size: [0.07, 0.16, 0.07], pos: [0, 0.32, 0.25], rot: [0.9, 0, 0], color: 'primary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'mortar_thump',
    unlock: { type: 'default' },
  },
  {
    id: 'volcano_in_a_can',
    name: 'Volcano in a Can',
    description: 'Shake well. Open toward enemies. Contents under geological pressure.',
    classes: ['explosive', 'fire'],
    tier: 3,
    basePrice: 58,
    stats: { damage: 14, cooldown: 1.4, range: 8, knockback: 6, critChance: 3, critMult: 1.5, projectileSpeed: 9, radius: 2.8, duration: 3 },
    scaling: { damagePct: 1.0, elementalDamage: 0.6, explosionSize: 0.6 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.3, arcHeight: 3, leaveFirePatch: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'burn', dps: 4, duration: 3, target: 'area', radius: 2.8 }] },
    ],
    visual: {
      projectile: 'lava_glob',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.55, primary: '#d9302b', secondary: '#5d666e', accent: '#ff9a3b',
        parts: [
          { shape: 'cylinder', size: [0.12, 0.24, 0.12], pos: [0, 0, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cone', size: [0.1, 0.14, 0.1], pos: [0, 0.18, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.06, 0.08, 0.06], pos: [0, 0.28, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'eruption',
    unlock: { type: 'default' },
  },
  {
    id: 'megaton_coconut',
    name: 'Megaton Coconut',
    description: 'The last coconut. Palm trees whisper its name and drop their fruit in fear.',
    classes: ['explosive'],
    tier: 4,
    basePrice: 110,
    stats: { damage: 45, cooldown: 2.0, range: 10, knockback: 16, critChance: 3, critMult: 1.5, projectileSpeed: 8, radius: 4.5 },
    scaling: { damagePct: 1.3, explosionSize: 1.0 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.4, arcHeight: 5, screenShake: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'stun', dps: 0, duration: 0.6, target: 'area', radius: 3 }] },
    ],
    visual: {
      projectile: 'mega_coconut',
      muzzle: 'smoke_ring',
      model: {
        base: 'custom', scale: 0.75, primary: '#5d3d1e', secondary: '#ffd93b', accent: '#d9302b',
        parts: [
          { shape: 'sphere', size: [0.3, 0.3, 0.3], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'torus', size: [0.31, 0.03, 0.31], pos: [0, 0, 0], rot: [1.57, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, 0.3, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'kaboom',
    unlock: { type: 'wins', count: 4 },
  },
]);
