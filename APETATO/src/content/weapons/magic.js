// APETATO weapons — MAGIC.
// Mystic fruit sorcery. The jungle spirits accept payment in peels.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const MAGIC_WEAPONS = deepFreeze([
  {
    id: 'banana_wand',
    name: 'Banana Wand',
    description: 'Wave the fruit, say the word ("oook"), watch the sparkles bite.',
    classes: ['magic'],
    tier: 1,
    basePrice: 13,
    stats: { damage: 4, cooldown: 0.7, range: 8, knockback: 1, critChance: 3, critMult: 1.5, projectileSpeed: 12 },
    scaling: { elementalDamage: 1.0, damagePct: 1.0 },
    behavior: 'projectile',
    behaviorParams: { wavy: true },
    onHit: [],
    visual: {
      projectile: 'spark_bolt',
      muzzle: 'sparkle',
      model: {
        base: 'custom', scale: 0.5, primary: '#ffd93b', secondary: '#b04aff', accent: '#fff2b0',
        parts: [
          { shape: 'cylinder', size: [0.03, 0.4, 0.03], pos: [0, 0, 0], rot: [0, 0, 0.3], color: 'primary' },
          { shape: 'sphere', size: [0.08, 0.08, 0.08], pos: [0, 0.25, 0], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'zing',
    unlock: { type: 'default' },
  },
  {
    id: 'spirit_bubble_wand',
    name: 'Spirit Bubble Wand',
    description: 'Blows haunted bubbles. They pop with the sound of tiny grudges.',
    classes: ['magic'],
    tier: 1,
    basePrice: 14,
    stats: { damage: 5, cooldown: 0.9, range: 7, knockback: 2, critChance: 3, critMult: 1.5, projectileSpeed: 7 },
    scaling: { elementalDamage: 0.9, effectDuration: 0.4 },
    behavior: 'projectile',
    behaviorParams: { drift: true },
    onHit: [
      { trigger: 'onHit', chance: 30, do: [{ op: 'status', status: 'slow', dps: 0, duration: 1.5, target: 'target' }] },
    ],
    visual: {
      projectile: 'bubble',
      muzzle: 'bubble_puff',
      model: {
        base: 'custom', scale: 0.5, primary: '#7ec8e3', secondary: '#c9b458', accent: '#e8f8ff',
        parts: [
          { shape: 'cylinder', size: [0.03, 0.3, 0.03], pos: [0, -0.08, 0], rot: [0, 0, 0.2], color: 'secondary' },
          { shape: 'torus', size: [0.1, 0.02, 0.1], pos: [0, 0.15, 0], rot: [0, 0, 0], color: 'primary' },
        ],
        animation: 'none',
      },
    },
    sfx: 'blub',
    unlock: { type: 'default' },
  },
  {
    id: 'arcane_peel_halo',
    name: 'Arcane Peel Halo',
    description: 'A blessed peel that circles your head, smiting whatever leans in.',
    classes: ['magic'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 3, cooldown: 0.5, range: 2.2, knockback: 2, critChance: 3, critMult: 1.5, count: 1, radius: 2.2 },
    scaling: { elementalDamage: 0.8, attackSpeed: 0.3 },
    behavior: 'orbit',
    behaviorParams: { orbitSpeed: 3.5 },
    onHit: [],
    visual: {
      projectile: 'halo_peel',
      muzzle: 'sparkle',
      model: {
        base: 'custom', scale: 0.5, primary: '#ffd93b', secondary: '#fff2b0', accent: '#b04aff',
        parts: [
          { shape: 'torus', size: [0.18, 0.03, 0.18], pos: [0, 0.1, 0], rot: [0.3, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0.18, 0.1, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'spin',
      },
    },
    sfx: 'hum',
    unlock: { type: 'default' },
  },
  {
    id: 'hex_peel_charm',
    name: 'Hex Peel Charm',
    description: 'A shrunken banana on a string. It knows where they live.',
    classes: ['magic', 'chaos'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 4, cooldown: 0.8, range: 9, knockback: 1, critChance: 3, critMult: 1.5, projectileSpeed: 8 },
    scaling: { elementalDamage: 0.9, luck: 0.3 },
    behavior: 'homing',
    behaviorParams: { turnRate: 4 },
    onHit: [
      { trigger: 'onHit', chance: 10, do: [{ op: 'status', status: 'slow', dps: 0, duration: 1, target: 'target' }] },
    ],
    visual: {
      projectile: 'hex_skull',
      muzzle: 'purple_wisp',
      model: {
        base: 'custom', scale: 0.45, primary: '#b04aff', secondary: '#ffd93b', accent: '#2b2b2b',
        parts: [
          { shape: 'sphere', size: [0.12, 0.14, 0.12], pos: [0, 0, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cylinder', size: [0.015, 0.2, 0.015], pos: [0, 0.18, 0], rot: [0, 0, 0], color: 'accent' },
          { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0, 0.02, 0.1], rot: [0, 0, 0], color: 'primary' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'whisper',
    unlock: { type: 'default' },
  },
  {
    id: 'magic_banana_orbs',
    name: 'Magic Banana Orbs',
    description: 'Three glowing bananas orbit you like tiny, judgmental moons.',
    classes: ['magic'],
    tier: 2,
    basePrice: 30,
    stats: { damage: 5, cooldown: 0.5, range: 2.8, knockback: 3, critChance: 3, critMult: 1.5, count: 3, radius: 2.8 },
    scaling: { elementalDamage: 1.0, attackSpeed: 0.3 },
    behavior: 'orbit',
    behaviorParams: { orbitSpeed: 3, pulse: true },
    onHit: [],
    visual: {
      projectile: 'glow_banana',
      muzzle: 'sparkle',
      model: {
        base: 'custom', scale: 0.55, primary: '#ffd93b', secondary: '#b04aff', accent: '#fff2b0',
        parts: [
          { shape: 'sphere', size: [0.1, 0.1, 0.1], pos: [0, 0.15, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.08, 0.08, 0.08], pos: [0.13, -0.05, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.08, 0.08, 0.08], pos: [-0.13, -0.05, 0], rot: [0, 0, 0], color: 'primary' },
        ],
        animation: 'spin',
      },
    },
    sfx: 'hum',
    unlock: { type: 'default' },
  },
  {
    id: 'totem_lightning_staff',
    name: 'Totem Lightning Staff',
    description: 'A carved monkey totem that spits chain lightning and disappointment.',
    classes: ['magic'],
    tier: 2,
    basePrice: 33,
    stats: { damage: 7, cooldown: 0.9, range: 9, knockback: 2, critChance: 4, critMult: 1.5, count: 3 },
    scaling: { elementalDamage: 1.1 },
    behavior: 'chain',
    behaviorParams: { jumps: 3, jumpRange: 4, falloff: 0.75 },
    onHit: [
      { trigger: 'onHit', chance: 25, do: [{ op: 'status', status: 'shock', dps: 3, duration: 1, target: 'target' }] },
    ],
    visual: {
      projectile: 'lightning_arc',
      muzzle: 'spark_crackle',
      model: {
        base: 'custom', scale: 0.65, primary: '#8a5a2b', secondary: '#7ec8e3', accent: '#fff2b0',
        parts: [
          { shape: 'cylinder', size: [0.05, 0.6, 0.05], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'box', size: [0.14, 0.14, 0.12], pos: [0, 0.38, 0], rot: [0, 0.4, 0], color: 'primary' },
          { shape: 'sphere', size: [0.07, 0.07, 0.07], pos: [0, 0.5, 0], rot: [0, 0, 0], color: 'secondary' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'zap',
    unlock: { type: 'default' },
  },
  {
    id: 'voodoo_banana_doll',
    name: 'Voodoo Banana Doll',
    description: 'Poke the doll, hurt a stranger. Ethically murky, tactically superb.',
    classes: ['magic', 'chaos'],
    tier: 2,
    basePrice: 29,
    stats: { damage: 9, cooldown: 1.0, range: 10, knockback: 0, critChance: 3, critMult: 1.5, projectileSpeed: 9 },
    scaling: { elementalDamage: 1.0, luck: 0.4 },
    behavior: 'homing',
    behaviorParams: { turnRate: 6, randomTarget: true },
    onHit: [
      { trigger: 'onHit', chance: 15, do: [{ op: 'status', status: 'stun', dps: 0, duration: 0.6, target: 'target' }] },
    ],
    visual: {
      projectile: 'needle_wisp',
      muzzle: 'purple_wisp',
      model: {
        base: 'custom', scale: 0.5, primary: '#ffd93b', secondary: '#b04aff', accent: '#d9302b',
        parts: [
          { shape: 'sphere', size: [0.1, 0.12, 0.1], pos: [0, 0.1, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'box', size: [0.12, 0.16, 0.08], pos: [0, -0.08, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cylinder', size: [0.01, 0.15, 0.01], pos: [0.07, 0.02, 0], rot: [0, 0, 0.8], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'whisper',
    unlock: { type: 'default' },
  },
  {
    id: 'shadow_vine',
    name: 'Shadow Vine',
    description: 'A vine grown in total darkness. It feeds, and kindly shares the leftovers.',
    classes: ['magic', 'lifesteal'],
    tier: 3,
    basePrice: 55,
    stats: { damage: 12, cooldown: 0.8, range: 8, knockback: 1, critChance: 3, critMult: 1.5, count: 2 },
    scaling: { elementalDamage: 1.0, lifesteal: 0.5 },
    behavior: 'chain',
    behaviorParams: { jumps: 2, jumpRange: 3.5, falloff: 0.8, tendril: true },
    onHit: [
      { trigger: 'onHit', chance: 30, do: [{ op: 'heal', amount: 1 }] },
    ],
    visual: {
      projectile: 'dark_tendril',
      muzzle: 'shadow_puff',
      model: {
        base: 'custom', scale: 0.6, primary: '#2b1e3a', secondary: '#3f7d2c', accent: '#b04aff',
        parts: [
          { shape: 'cylinder', size: [0.04, 0.5, 0.04], pos: [0, 0, 0], rot: [0, 0, 0.6], color: 'primary' },
          { shape: 'cone', size: [0.05, 0.14, 0.05], pos: [0.18, 0.22, 0], rot: [0, 0, -0.8], color: 'secondary' },
          { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [-0.1, -0.2, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'slither',
    unlock: { type: 'default' },
  },
  {
    id: 'moonbeam_prism',
    name: 'Moonbeam Prism',
    description: 'Bottled moonlight, aimed with malice. The moon signed off on this.',
    classes: ['magic', 'precision'],
    tier: 3,
    basePrice: 58,
    stats: { damage: 6, cooldown: 0.4, range: 11, knockback: 0, critChance: 5, critMult: 1.5, pierce: 5, duration: 0.4 },
    scaling: { elementalDamage: 1.1, range: 0.4 },
    behavior: 'beam',
    behaviorParams: { width: 0.4, sweep: false },
    onHit: [],
    visual: {
      projectile: 'moon_beam',
      muzzle: 'prism_glow',
      model: {
        base: 'custom', scale: 0.55, primary: '#dfe6ff', secondary: '#7ec8e3', accent: '#b04aff',
        parts: [
          { shape: 'cone', size: [0.12, 0.2, 0.12], pos: [0, 0.08, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cone', size: [0.12, 0.2, 0.12], pos: [0, -0.08, 0], rot: [3.14, 0, 0], color: 'secondary' },
        ],
        animation: 'hover',
      },
    },
    sfx: 'beam_hum',
    unlock: { type: 'default' },
  },
  {
    id: 'singularity_peel',
    name: 'Singularity Peel',
    description: 'A banana peeled so hard it collapsed inward. Slips entire crowds at once.',
    classes: ['magic'],
    tier: 4,
    basePrice: 108,
    stats: { damage: 22, cooldown: 1.3, range: 9, knockback: -6, critChance: 3, critMult: 1.5, radius: 4, duration: 1.5 },
    scaling: { elementalDamage: 1.2, explosionSize: 0.8 },
    behavior: 'nova',
    behaviorParams: { atCursor: true, pullIn: true, collapseBurst: true },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'slow', dps: 0, duration: 1.5, target: 'area', radius: 4 }] },
    ],
    visual: {
      projectile: 'void_orb',
      muzzle: 'shadow_puff',
      model: {
        base: 'custom', scale: 0.6, primary: '#1c1c24', secondary: '#ffd93b', accent: '#b04aff',
        parts: [
          { shape: 'sphere', size: [0.16, 0.16, 0.16], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'torus', size: [0.24, 0.02, 0.24], pos: [0, 0, 0], rot: [1.2, 0, 0.4], color: 'secondary' },
          { shape: 'torus', size: [0.3, 0.015, 0.3], pos: [0, 0, 0], rot: [0.4, 0.8, 0], color: 'accent' },
        ],
        animation: 'spin',
      },
    },
    sfx: 'implosion',
    unlock: { type: 'buy', cost: 150 },
  },
]);
