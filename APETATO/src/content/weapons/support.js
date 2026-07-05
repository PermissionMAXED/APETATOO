// APETATO weapons — SUPPORT.
// Holy horns, hype drums and parasols. Somebody has to keep the troop peeled.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const SUPPORT_WEAPONS = deepFreeze([
  {
    id: 'banana_hymn_horn',
    name: 'Banana Hymn Horn',
    description: 'Toot the sacred note. HP goes up, morale goes bananas.',
    classes: ['support'],
    tier: 1,
    basePrice: 14,
    stats: { damage: 2, cooldown: 2.0, range: 4, knockback: 2, critChance: 3, critMult: 1.5, radius: 4, duration: 2 },
    scaling: { effectDuration: 0.5, elementalDamage: 0.4 },
    behavior: 'support_buff',
    behaviorParams: { alsoNova: true, buff: { stat: 'hpRegen', add: 3, duration: 2 } },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'heal', amount: 1 }] },
    ],
    visual: {
      projectile: 'note_ring',
      muzzle: 'gold_note',
      model: {
        base: 'custom', scale: 0.55, primary: '#ffcf40', secondary: '#8a5a2b', accent: '#fff2b0',
        parts: [
          { shape: 'cone', size: [0.14, 0.3, 0.14], pos: [0, 0, 0.15], rot: [-1.57, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.04, 0.2, 0.04], pos: [0, 0, -0.12], rot: [1.57, 0, 0], color: 'secondary' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'horn',
    unlock: { type: 'default' },
  },
  {
    id: 'pocket_shrine',
    name: 'Pocket Shrine',
    description: 'A tiny altar to the Great Peel. Radiates approval and mild healing.',
    classes: ['support'],
    tier: 1,
    basePrice: 15,
    stats: { damage: 1.5, cooldown: 0.8, range: 3, knockback: 0, critChance: 3, critMult: 1.5, radius: 3, duration: 1 },
    scaling: { elementalDamage: 0.5, effectDuration: 0.4 },
    behavior: 'aura',
    behaviorParams: { tick: 0.8, healSelfPerTick: 0.2 },
    onHit: [],
    visual: {
      projectile: 'holy_ring',
      muzzle: 'sparkle',
      model: {
        base: 'custom', scale: 0.5, primary: '#c9b458', secondary: '#ffcf40', accent: '#fff2b0',
        parts: [
          { shape: 'box', size: [0.2, 0.06, 0.14], pos: [0, -0.08, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'box', size: [0.14, 0.12, 0.1], pos: [0, 0.02, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.06, 0.09, 0.04], pos: [0, 0.15, 0], rot: [0, 0, 0.4], color: 'secondary' },
        ],
        animation: 'hover',
      },
    },
    sfx: 'chime',
    unlock: { type: 'default' },
  },
  {
    id: 'war_drum_of_oook',
    name: 'War Drum of OOOK',
    description: 'Every beat is a pep talk. Every pep talk is a threat.',
    classes: ['support'],
    tier: 2,
    basePrice: 29,
    stats: { damage: 4, cooldown: 1.8, range: 3.5, knockback: 6, critChance: 3, critMult: 1.5, radius: 3.5, duration: 2.5 },
    scaling: { effectDuration: 0.5, knockback: 0.4 },
    behavior: 'support_buff',
    behaviorParams: { alsoNova: true, buff: { stat: 'attackSpeed', add: 15, duration: 2.5 } },
    onHit: [],
    visual: {
      projectile: 'shock_ring',
      muzzle: 'drum_ring',
      model: {
        base: 'custom', scale: 0.6, primary: '#a33a2b', secondary: '#d9b38c', accent: '#ffd93b',
        parts: [
          { shape: 'cylinder', size: [0.18, 0.14, 0.18], pos: [0, 0, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.19, 0.02, 0.19], pos: [0, 0.08, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0.12, 0.18, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'drum',
    unlock: { type: 'default' },
  },
  {
    id: 'peel_parasol',
    name: 'Peel Parasol',
    description: 'An umbrella woven from blessed peels. Rain, meteors, insults — all deflected.',
    classes: ['support'],
    tier: 2,
    basePrice: 31,
    stats: { damage: 3, cooldown: 2.5, range: 2.5, knockback: 4, critChance: 3, critMult: 1.5, radius: 2.5, duration: 3 },
    scaling: { shieldMax: 0.5, effectDuration: 0.4 },
    behavior: 'support_buff',
    behaviorParams: { alsoNova: true, buff: { stat: 'armor', add: 5, duration: 3 } },
    onHit: [
      { trigger: 'onHit', chance: 100, do: [{ op: 'shield', amount: 2 }] },
    ],
    visual: {
      projectile: 'holy_ring',
      muzzle: 'sparkle',
      model: {
        base: 'custom', scale: 0.6, primary: '#ffd93b', secondary: '#8a5a2b', accent: '#d9534f',
        parts: [
          { shape: 'cone', size: [0.24, 0.14, 0.24], pos: [0, 0.14, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.02, 0.35, 0.02], pos: [0, -0.05, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.04, 0.04, 0.04], pos: [0, 0.22, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'fwump',
    unlock: { type: 'default' },
  },
  {
    id: 'maracas_of_mayhem',
    name: 'Maracas of Mayhem',
    description: 'Shake shake shake. Nobody knows what buff comes out. That is the dance.',
    classes: ['support', 'chaos'],
    tier: 2,
    basePrice: 27,
    stats: { damage: 3, cooldown: 2.2, range: 3, knockback: 3, critChance: 3, critMult: 1.5, radius: 3, duration: 2.5 },
    scaling: { luck: 0.6, effectDuration: 0.5 },
    behavior: 'support_buff',
    behaviorParams: {
      alsoNova: true,
      randomBuff: [
        { stat: 'speed', add: 20, duration: 2.5 },
        { stat: 'damagePct', add: 15, duration: 2.5 },
        { stat: 'dodge', add: 15, duration: 2.5 },
        { stat: 'luck', add: 25, duration: 2.5 },
      ],
    },
    onHit: [],
    visual: {
      projectile: 'confetti',
      muzzle: 'confetti_pop',
      model: {
        base: 'custom', scale: 0.5, primary: '#d9534f', secondary: '#3fa7d6', accent: '#ffd93b',
        parts: [
          { shape: 'sphere', size: [0.1, 0.12, 0.1], pos: [-0.08, 0.1, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'sphere', size: [0.1, 0.12, 0.1], pos: [0.08, 0.1, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'cylinder', size: [0.025, 0.18, 0.025], pos: [-0.08, -0.06, 0], rot: [0, 0, 0.1], color: 'accent' },
          { shape: 'cylinder', size: [0.025, 0.18, 0.025], pos: [0.08, -0.06, 0], rot: [0, 0, -0.1], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'shaka',
    unlock: { type: 'default' },
  },
  {
    id: 'golden_gong_of_dawn',
    name: 'Golden Gong of Dawn',
    description: 'One clean strike and the whole arena remembers who brought the sunrise.',
    classes: ['support'],
    tier: 3,
    basePrice: 50,
    stats: { damage: 10, cooldown: 2.5, range: 4, knockback: 10, critChance: 3, critMult: 1.5, radius: 4.5, duration: 3 },
    scaling: { elementalDamage: 0.6, effectDuration: 0.6, knockback: 0.4 },
    behavior: 'support_buff',
    behaviorParams: { alsoNova: true, buff: { stat: 'damagePct', add: 12, duration: 3 } },
    onHit: [
      { trigger: 'onHit', chance: 30, do: [{ op: 'status', status: 'stun', dps: 0, duration: 0.6, target: 'target' }] },
    ],
    visual: {
      projectile: 'gold_ring',
      muzzle: 'gold_flash',
      model: {
        base: 'custom', scale: 0.65, primary: '#ffcf40', secondary: '#8a5a2b', accent: '#fff2b0',
        parts: [
          { shape: 'torus', size: [0.24, 0.03, 0.24], pos: [0, 0.05, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.18, 0.02, 0.18], pos: [0, 0.05, 0], rot: [1.57, 0, 0], color: 'accent' },
          { shape: 'cylinder', size: [0.03, 0.3, 0.03], pos: [0.2, -0.1, 0], rot: [0, 0, -0.3], color: 'secondary' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'gong',
    unlock: { type: 'default' },
  },
  {
    id: 'blood_petal_censer',
    name: 'Blood Petal Censer',
    description: 'Swings incense that smells like victory and tastes like other people\'s HP.',
    classes: ['support', 'lifesteal'],
    tier: 2,
    basePrice: 30,
    stats: { damage: 3, cooldown: 0.9, range: 3, knockback: 0, critChance: 3, critMult: 1.5, radius: 3, duration: 1 },
    scaling: { elementalDamage: 0.5, lifesteal: 0.4 },
    behavior: 'aura',
    behaviorParams: { tick: 0.9, healSelfPerTick: 0.3 },
    onHit: [
      { trigger: 'onHit', chance: 15, do: [{ op: 'heal', amount: 1 }] },
    ],
    visual: {
      projectile: 'holy_ring',
      muzzle: 'red_drip',
      model: {
        base: 'custom', scale: 0.55, primary: '#7d2c3f', secondary: '#ffcf40', accent: '#d64a5a',
        parts: [
          { shape: 'sphere', size: [0.12, 0.14, 0.12], pos: [0, -0.05, 0], rot: [0, 0, 0], color: 'primary' },
          { shape: 'cylinder', size: [0.02, 0.25, 0.02], pos: [0, 0.14, 0], rot: [0, 0, 0], color: 'secondary' },
          { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [0, -0.14, 0], rot: [0, 0, 0], color: 'accent' },
        ],
        animation: 'bob',
      },
    },
    sfx: 'chime',
    unlock: { type: 'default' },
  },
]);
