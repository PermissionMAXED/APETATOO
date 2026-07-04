// APETATO weapons — ELEMENTAL (fire & poison).
// Burn it down or make it queasy. Sometimes both, if the wind cooperates.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const ELEMENTAL_WEAPONS = deepFreeze([
  {
    id: 'ember_peel_tosser',
    name: 'Ember Peel Tosser',
    description: 'Bananas flambé, to go. Tips not included, fires definitely are.',
    classes: ['fire'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 3, cooldown: 0.6, range: 7.5, knockback: 1, critChance: 3, critMult: 1.5, projectileSpeed: 11 },
    scaling: { elementalDamage: 1.0, damagePct: 1.0 },
    behavior: 'projectile',
    behaviorParams: { trail: 'ember' },
    onHit: [
      { trigger: 'onHit', chance: 40, do: [{ op: 'status', status: 'burn', dps: 2, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'ember_peel',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.5, primary: '#ff9a3b', secondary: '#d9302b', accent: '#ffd93b',
        parts: [
          { shape: 'cone', size: [0.1, 0.2, 0.1], pos: [0, 0.08, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.09, 0.09, 0.09], pos: [0, -0.06, 0], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'sizzle',
    unlock: { type: 'default' },
  },
  {
    id: 'bog_sludge_sprayer',
    name: 'Bog Sludge Sprayer',
    description: 'Pressurized swamp in a squeeze bottle. Smells like victory. And bog.',
    classes: ['poison'],
    tier: 1,
    basePrice: 14,
    stats: { damage: 1.5, cooldown: 0.6, range: 6, knockback: 1, critChance: 3, critMult: 1.5, projectileSpeed: 9, count: 3, spread: 25 },
    scaling: { elementalDamage: 0.9 },
    behavior: 'shotgun',
    behaviorParams: { droplets: true },
    onHit: [
      { trigger: 'onHit', chance: 50, do: [{ op: 'status', status: 'poison', dps: 2, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'sludge_glob',
      muzzle: 'green_spray',
      model: {
        base: 'custom', scale: 0.5, primary: '#5a7d2c', secondary: '#8f9aa3', accent: '#a5d64a',
        parts: [
          { shape: 'cylinder', size: [0.1, 0.22, 0.1], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cone', size: [0.05, 0.12, 0.05], pos: [0, 0.14, 0.06], rot: [0.8, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0, 0.24, 0.12], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'squirt',
    unlock: { type: 'default' },
  },
  {
    id: 'swamp_gas_censer',
    name: 'Swamp Gas Censer',
    description: 'A swinging incense ball of pure marsh. Aromatherapy for your enemies\' last moments.',
    classes: ['poison'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 2, cooldown: 0.5, range: 2.8, knockback: 0, critChance: 3, critMult: 1.5, radius: 2.8, duration: 1 },
    scaling: { elementalDamage: 0.9, effectDuration: 0.5 },
    behavior: 'aura',
    behaviorParams: { tick: 0.5 },
    onHit: [
      { trigger: 'onHit', chance: 30, do: [{ op: 'status', status: 'poison', dps: 1, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'gas_wisp',
      muzzle: 'green_spray',
      model: {
        base: 'custom', scale: 0.5, primary: '#5a7d2c', secondary: '#c9b458', accent: '#a5d64a',
        parts: [
          { shape: 'sphere', size: [0.13, 0.13, 0.13], pos: [0, -0.05, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.015, 0.25, 0.015], pos: [0, 0.15, 0], rot: [0, 0, 0.2], color: 'secondary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0.08, 0.02, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'hiss',
    unlock: { type: 'default' },
  },
  {
    id: 'banana_flamethrower',
    name: 'Banana Flamethrower',
    description: 'Potassium is flammable. This is the fruit industry\'s darkest secret.',
    classes: ['fire'],
    tier: 2,
    basePrice: 33,
    stats: { damage: 3, cooldown: 0.25, range: 6, knockback: 0, critChance: 3, critMult: 1.5, duration: 0.3, spread: 20 },
    scaling: { elementalDamage: 1.1 },
    behavior: 'beam',
    behaviorParams: { width: 1.2, cone: true, flicker: true },
    onHit: [
      { trigger: 'onHit', chance: 35, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'flame_cone',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.65, primary: '#ffd93b', secondary: '#d9302b', accent: '#2b2b2b',
        parts: [
          { shape: 'box', size: [0.09, 0.11, 0.4], pos: [0, 0, 0.1], rot: [0.12, 0, 0], color: 'primary' },
          { shape: 'cone', size: [0.08, 0.12, 0.08], pos: [0, 0.02, 0.35], rot: [-1.57, 0, 0], color: 'secondary' },
          { shape: 'cylinder', size: [0.06, 0.14, 0.06], pos: [0, -0.1, -0.1], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'whoosh_fire',
    unlock: { type: 'default' },
  },
  {
    id: 'wildfire_whip',
    name: 'Wildfire Whip',
    description: 'A whip of woven cinders. Crack it once and the lawn files for divorce.',
    classes: ['fire', 'melee'],
    tier: 2,
    basePrice: 30,
    stats: { damage: 6, cooldown: 0.6, range: 3.2, knockback: 3, critChance: 3, critMult: 1.5 },
    scaling: { meleeDamage: 0.6, elementalDamage: 0.7 },
    behavior: 'melee_swing',
    behaviorParams: { arc: 90, whip: true, emberTrail: true },
    onHit: [
      { trigger: 'onHit', chance: 45, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'none',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.55, primary: '#d9302b', secondary: '#ff9a3b', accent: '#2b2b2b',
        parts: [
          { shape: 'cylinder', size: [0.04, 0.5, 0.04], pos: [0, 0, 0], rot: [0, 0, 0.5], color: 'primary' },
          { shape: 'sphere', size: [0.07, 0.07, 0.07], pos: [0, 0.28, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'box', size: [0.06, 0.1, 0.06], pos: [0, -0.28, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'crack_fire',
    unlock: { type: 'default' },
  },
  {
    id: 'toxic_toad_tongue',
    name: 'Toxic Toad Tongue',
    description: 'A retired toad\'s tongue on a stick. Still fast. Still bitter.',
    classes: ['poison', 'melee'],
    tier: 2,
    basePrice: 28,
    stats: { damage: 7, cooldown: 0.7, range: 3.4, knockback: 2, critChance: 3, critMult: 1.5 },
    scaling: { meleeDamage: 0.6, elementalDamage: 0.7 },
    behavior: 'melee_thrust',
    behaviorParams: { lunge: 0.4, sticky: true },
    onHit: [
      { trigger: 'onHit', chance: 55, do: [{ op: 'status', status: 'poison', dps: 3, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'none',
      muzzle: 'green_spray',
      model: {
        base: 'custom', scale: 0.55, primary: '#d97ba6', secondary: '#5a7d2c', accent: '#a5d64a',
        parts: [
          { shape: 'cylinder', size: [0.05, 0.45, 0.05], pos: [0, 0, 0.1], rot: [1.57, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.09, 0.07, 0.09], pos: [0, 0, 0.35], rot: [0, 0, 0], color: 'primary' },
          { shape: 'box', size: [0.06, 0.08, 0.1], pos: [0, 0, -0.15], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'slurp',
    unlock: { type: 'default' },
  },
  {
    id: 'venom_fang_duals',
    name: 'Venom Fang Duals',
    description: 'Two snake fangs, zero snakes consulted. Strike where it hurts, then keep hurting.',
    classes: ['poison', 'crit'],
    tier: 2,
    basePrice: 32,
    stats: { damage: 4, cooldown: 0.45, range: 1.8, knockback: 1, critChance: 22, critMult: 2.2 },
    scaling: { meleeDamage: 0.6, elementalDamage: 0.5, critChance: 0.3 },
    behavior: 'melee_swing',
    behaviorParams: { arc: 70, alternate: true },
    onHit: [
      { trigger: 'onCrit', chance: 100, do: [{ op: 'status', status: 'poison', dps: 4, duration: 2, target: 'target' }] },
    ],
    visual: {
      projectile: 'none',
      muzzle: 'green_glint',
      model: {
        base: 'custom', scale: 0.5, primary: '#e8e0d0', secondary: '#5a7d2c', accent: '#a5d64a',
        parts: [
          { shape: 'cone', size: [0.05, 0.25, 0.05], pos: [-0.07, 0, 0.1], rot: [1.57, 0, 0], color: 'primary' },
          { shape: 'cone', size: [0.05, 0.25, 0.05], pos: [0.07, 0, 0.1], rot: [1.57, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, 0, -0.05], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'shink',
    unlock: { type: 'default' },
  },
  {
    id: 'magma_coconut',
    name: 'Magma Coconut',
    description: 'Cracked open over a volcano and never quite sealed back up.',
    classes: ['fire', 'explosive'],
    tier: 3,
    basePrice: 56,
    stats: { damage: 12, cooldown: 1.2, range: 8.5, knockback: 6, critChance: 3, critMult: 1.5, projectileSpeed: 10, radius: 2.5, duration: 2.5 },
    scaling: { elementalDamage: 1.0, explosionSize: 0.6 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.2, arcHeight: 3, leaveFirePatch: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'burn', dps: 4, duration: 2.5, target: 'area', radius: 2.5 }] },
    ],
    visual: {
      projectile: 'lava_glob',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.55, primary: '#5d3d1e', secondary: '#ff9a3b', accent: '#d9302b',
        parts: [
          { shape: 'sphere', size: [0.2, 0.2, 0.2], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'torus', size: [0.14, 0.03, 0.14], pos: [0, 0.05, 0], rot: [0.5, 0, 0.3], color: 'secondary' },
          { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [0.1, 0.12, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'eruption',
    unlock: { type: 'default' },
  },
  {
    id: 'plague_gourd',
    name: 'Plague Gourd',
    description: 'A fermented gourd of concentrated jungle grudges. Shake before ruining lives.',
    classes: ['poison', 'explosive'],
    tier: 3,
    basePrice: 52,
    stats: { damage: 13, cooldown: 1.3, range: 8, knockback: 3, critChance: 3, critMult: 1.5, projectileSpeed: 9, radius: 3, duration: 3.5 },
    scaling: { elementalDamage: 1.1, effectDuration: 0.6 },
    behavior: 'lobbed',
    behaviorParams: { fuse: 0.2, arcHeight: 3, leaveCloud: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'poison', dps: 4, duration: 3.5, target: 'area', radius: 3 }] },
    ],
    visual: {
      projectile: 'gourd',
      muzzle: 'green_spray',
      model: {
        base: 'custom', scale: 0.55, primary: '#c9b458', secondary: '#5a7d2c', accent: '#a5d64a',
        parts: [
          { shape: 'sphere', size: [0.18, 0.16, 0.18], pos: [0, -0.04, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.1, 0.12, 0.1], pos: [0, 0.14, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cylinder', size: [0.02, 0.08, 0.02], pos: [0, 0.26, 0], rot: [0, 0, 0.3], color: 'accent' },
        ],
        animation: 'none',
      },
    },
    sfx: 'glug_boom',
    unlock: { type: 'default' },
  },
  {
    id: 'phoenix_plume_bow',
    name: 'Phoenix Plume Bow',
    description: 'Strung with a phoenix tail feather. Every arrow is a tiny sunrise with a vendetta.',
    classes: ['fire', 'precision'],
    tier: 4,
    basePrice: 102,
    stats: { damage: 26, cooldown: 1.2, range: 13, knockback: 5, critChance: 5, critMult: 1.5, projectileSpeed: 22, pierce: 3 },
    scaling: { elementalDamage: 1.2, rangedDamage: 0.5, range: 0.3 },
    behavior: 'projectile',
    behaviorParams: { chargeUp: 0.25, trail: 'flame', explodeOnLastPierce: { radius: 2, damageMult: 0.5 } },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'burn', dps: 5, duration: 3, target: 'target' }] },
    ],
    visual: {
      projectile: 'flame_arrow',
      muzzle: 'ember_burst',
      model: {
        base: 'custom', scale: 0.7, primary: '#d9302b', secondary: '#ff9a3b', accent: '#ffd93b',
        parts: [
          { shape: 'torus', size: [0.28, 0.025, 0.28], pos: [0, 0, 0], rot: [0, 1.57, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.02, 0.55, 0.02], pos: [0, 0, 0.05], rot: [1.57, 0, 0], color: 'accent' },
          { shape: 'cone', size: [0.06, 0.14, 0.06], pos: [0, 0.28, 0], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'hover',
      },
    },
    sfx: 'phoenix_cry',
    unlock: { type: 'buy', cost: 145 },
  },
]);
