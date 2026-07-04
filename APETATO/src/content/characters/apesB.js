// APETATO characters — TROOP B.
// The weird cousins: specialists, gamblers with fate, and one very holy ape.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const APES_B = deepFreeze([
  {
    id: 'count_fangula',
    name: 'Count Fangula',
    description: 'Allergic to sunlight, garlic and salads. Prescribes himself a strictly liquid diet.',
    statMods: { lifesteal: 12, meleeDamage: 4, curse: 1, hpRegen: -3, harvesting: -4 },
    passives: [
      { trigger: 'onKill', chance: 25, do: [{ op: 'heal', amount: 1 }] },
    ],
    startingWeaponId: 'fossil_femur',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.95, primary: '#2b2b3a', secondary: '#7a1f2b', accent: '#e8e0d0',
      parts: [
        { shape: 'box', size: [0.5, 0.4, 0.05], pos: [0, 0.35, -0.28], rot: [0.1, 0, 0], color: 'secondary' },
        { shape: 'cone', size: [0.04, 0.1, 0.04], pos: [-0.06, 0.45, 0.28], rot: [3.14, 0, 0], color: 'accent' },
        { shape: 'cone', size: [0.04, 0.1, 0.04], pos: [0.06, 0.45, 0.28], rot: [3.14, 0, 0], color: 'accent' },
        { shape: 'torus', size: [0.14, 0.03, 0.14], pos: [0, 0.15, 0.2], rot: [0.4, 0, 0], color: 'secondary' },
      ],
      animation: 'hover',
    },
    unlock: { type: 'buy', cost: 40 },
  },
  {
    id: 'one_arm_orangutan',
    name: 'One-Arm Orangutan',
    description: 'Lost an arm arm-wrestling a river. Kept the good one. It carries everything.',
    statMods: { damagePct: 35, attackSpeed: 20, range: 10, luck: 5 },
    passives: [
      { trigger: 'onWaveStart', do: [{ op: 'buff', stat: 'attackSpeed', add: 20, duration: 4 }] },
    ],
    startingWeaponId: 'ape_katana',
    weaponSlots: 1,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.05, primary: '#c96a2b', secondary: '#8a4a1f', accent: '#e8d5a8',
      parts: [
        { shape: 'sphere', size: [0.24, 0.24, 0.24], pos: [0.35, 0.4, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'box', size: [0.18, 0.06, 0.24], pos: [-0.3, 0.45, 0], rot: [0, 0, 0.3], color: 'secondary' },
        { shape: 'box', size: [0.3, 0.08, 0.14], pos: [0, 0.05, 0.26], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'wins', count: 1 },
  },
  {
    id: 'pet_papa_baboon',
    name: 'Pet Papa Baboon',
    description: 'Adopts anything with a heartbeat and several things without. The troop grows nightly.',
    statMods: { maxHp: 6, harvesting: 4, engineering: 3, damagePct: -10, speed: -3 },
    passives: [
      { trigger: 'onWaveStart', chance: 35, do: [{ op: 'summon', what: 'stray_chimp', max: 2 }] },
    ],
    startingWeaponId: 'pocket_chimp',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.05, primary: '#8a6a4a', secondary: '#c9a86a', accent: '#d9302b',
      parts: [
        { shape: 'sphere', size: [0.14, 0.14, 0.12], pos: [0.3, 0.75, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.1, 0.1, 0.09], pos: [-0.32, 0.68, 0.05], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'box', size: [0.4, 0.1, 0.2], pos: [0, 0.15, -0.3], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 45 },
  },
  {
    id: 'dizzy_monk',
    name: 'Dizzy the Chaos Monk',
    description: 'Achieved enlightenment by spinning until the universe agreed to hold still instead.',
    statMods: { luck: 15, dodge: 8, damagePct: 5, curse: 2, armor: -3 },
    passives: [
      { trigger: 'onLevelUp', do: [{ op: 'buff', stat: 'luck', add: 30, duration: 10 }] },
      { trigger: 'onTakeDamage', chance: 10, do: [{ op: 'explode', damage: 8, radius: 2.5, scaled: true, at: 'self' }] },
    ],
    startingWeaponId: 'schrodingers_crate',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.9, primary: '#d9822b', secondary: '#7a4a8a', accent: '#ffd93b',
      parts: [
        { shape: 'torus', size: [0.22, 0.03, 0.22], pos: [0, 0.9, 0], rot: [0.2, 0, 0.2], color: 'accent' },
        { shape: 'box', size: [0.44, 0.1, 0.05], pos: [0, 0.35, 0.05], rot: [0, 0, 0.785], color: 'secondary' },
      ],
      animation: 'spin',
    },
    unlock: { type: 'buy', cost: 45 },
  },
  {
    id: 'shiv_capuchin',
    name: 'Shiv Capuchin',
    description: 'Nobody has seen her attack. They only see the receipts: itemized, precise, fatal.',
    statMods: { critChance: 10, critDamage: 50, speed: 8, maxHp: -6, knockback: -3 },
    passives: [
      { trigger: 'onCrit', chance: 15, do: [{ op: 'buff', stat: 'speed', add: 15, duration: 2 }] },
    ],
    startingWeaponId: 'banana_shiv',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.8, primary: '#3a3a4a', secondary: '#1c1c24', accent: '#d9302b',
      parts: [
        { shape: 'box', size: [0.34, 0.14, 0.3], pos: [0, 0.68, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'box', size: [0.3, 0.05, 0.05], pos: [0, 0.5, 0.24], rot: [0, 0, 0], color: 'accent' },
        { shape: 'cone', size: [0.05, 0.14, 0.05], pos: [0.2, 0.1, -0.2], rot: [0.5, 0, 0], color: 'secondary' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'buy', cost: 40 },
  },
  {
    id: 'shell_gorilla',
    name: 'Shell Gorilla',
    description: 'Found a giant tortoise shell at a yard sale. The tortoise drives a hard bargain; so does he.',
    statMods: { shieldMax: 12, armor: 5, thorns: 3, speed: -15, dodge: -5 },
    passives: [
      { trigger: 'onWaveStart', do: [{ op: 'shield', amount: 8 }] },
    ],
    startingWeaponId: 'peel_parasol',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.15, primary: '#5a6a4a', secondary: '#8a9a6a', accent: '#c9b458',
      parts: [
        { shape: 'sphere', size: [0.5, 0.35, 0.45], pos: [0, 0.4, -0.25], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'torus', size: [0.3, 0.05, 0.3], pos: [0, 0.4, -0.25], rot: [1.2, 0, 0], color: 'primary' },
        { shape: 'box', size: [0.2, 0.2, 0.06], pos: [0, 0.35, 0.32], rot: [0, 0, 0.785], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 40 },
  },
  {
    id: 'hexed_howler',
    name: 'Hexed Howler',
    description: 'Read the forbidden peel out loud. Now everything he loves explodes, which he loves.',
    statMods: { curse: 8, damagePct: 15, elementalDamage: 4, luck: -5, maxHp: -4 },
    passives: [
      { trigger: 'onKill', chance: 10, do: [{ op: 'explode', damage: 10, radius: 2.5, scaled: true, at: 'target' }] },
      { trigger: 'onWaveStart', cond: { waveGte: 6 }, do: [{ op: 'buff', stat: 'damagePct', add: 10, duration: 6 }] },
    ],
    startingWeaponId: 'voodoo_banana_doll',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.95, primary: '#4a2b5a', secondary: '#b04aff', accent: '#a5d64a',
      parts: [
        { shape: 'cone', size: [0.09, 0.35, 0.09], pos: [-0.15, 0.85, 0], rot: [0, 0, 0.5], color: 'secondary' },
        { shape: 'cone', size: [0.09, 0.35, 0.09], pos: [0.15, 0.85, 0], rot: [0, 0, -0.5], color: 'secondary' },
        { shape: 'sphere', size: [0.08, 0.08, 0.08], pos: [0, 0.55, 0.28], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'hover',
    },
    unlock: { type: 'buy', cost: 50 },
  },
  {
    id: 'professor_bananas',
    name: 'Professor Bananas',
    description: 'PhD in Applied Peelology. Publishes his enemies in the journal of past tense.',
    statMods: { xpGain: 25, luck: 5, pickupRange: 10, damagePct: -10, speed: -5 },
    passives: [
      { trigger: 'onLevelUp', do: [{ op: 'explode', damage: 12, radius: 3.5, scaled: true, at: 'self' }] },
      { trigger: 'onPickupXp', chance: 5, do: [{ op: 'xp', amount: 1 }] },
    ],
    startingWeaponId: 'spirit_bubble_wand',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.95, primary: '#6a5a3a', secondary: '#2b2b2b', accent: '#dfe6ec',
      parts: [
        { shape: 'cylinder', size: [0.26, 0.05, 0.26], pos: [0, 0.78, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'box', size: [0.3, 0.04, 0.3], pos: [0, 0.83, 0], rot: [0, 0.4, 0], color: 'secondary' },
        { shape: 'torus', size: [0.08, 0.02, 0.08], pos: [-0.1, 0.55, 0.26], rot: [0.2, 0, 0], color: 'accent' },
        { shape: 'torus', size: [0.08, 0.02, 0.08], pos: [0.1, 0.55, 0.26], rot: [0.2, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 30 },
  },
  {
    id: 'boomer_gibbon',
    name: 'Boomer Gibbon',
    description: 'Hearing: gone. Eyebrows: seasonal. Enthusiasm for large numbers: fully intact.',
    statMods: { explosionSize: 25, damagePct: 8, knockback: 5, dodge: -5, range: -5 },
    passives: [
      { trigger: 'onKill', chance: 6, do: [{ op: 'explode', damage: 8, radius: 2, scaled: true, at: 'target' }] },
    ],
    startingWeaponId: 'cherry_bomb_pouch',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.0, primary: '#5d666e', secondary: '#d9302b', accent: '#ff9a3b',
      parts: [
        { shape: 'cylinder', size: [0.24, 0.14, 0.24], pos: [0, 0.78, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.14, 0.14, 0.14], pos: [0.3, 0.35, -0.2], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'cylinder', size: [0.015, 0.1, 0.015], pos: [0.3, 0.48, -0.2], rot: [0, 0, 0.3], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 35 },
  },
  {
    id: 'banana_priest',
    name: 'Banana Priest',
    description: 'Preaches the Gospel of the Great Peel: "Blessed are the ripe, for they shall be split."',
    statMods: { hpRegen: 3, maxHp: 8, harvesting: 5, luck: 5, damagePct: -15 },
    passives: [
      { trigger: 'interval', interval: 8, do: [{ op: 'heal', amount: 2 }] },
      { trigger: 'onWaveStart', do: [{ op: 'buff', stat: 'hpRegen', add: 4, duration: 6 }] },
    ],
    startingWeaponId: 'banana_hymn_horn',
    weaponSlots: 6,
    shopPriceMult: 0.95,
    model: {
      base: 'ape', scale: 1.0, primary: '#e8d5a8', secondary: '#c9861d', accent: '#ffcf40',
      parts: [
        { shape: 'cone', size: [0.16, 0.4, 0.16], pos: [0, 0.9, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.07, 0.09, 0.05], pos: [0, 1.12, 0], rot: [0, 0, 0.4], color: 'accent' },
        { shape: 'box', size: [0.16, 0.4, 0.04], pos: [0, 0.25, 0.28], rot: [0, 0, 0], color: 'secondary' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 30 },
  },
  {
    id: 'trophy_tarsier',
    name: 'Trophy Tarsier',
    description: 'Tiny body, enormous eyes, wall full of very large mounted regrets. Hunts up the food chain.',
    statMods: { damagePct: 10, critDamage: 30, range: 10, harvesting: -5, maxHp: -3 },
    passives: [
      { trigger: 'onWaveStart', cond: { waveGte: 5 }, do: [{ op: 'buff', stat: 'damagePct', add: 15, duration: 8 }] },
      { trigger: 'onKill', chance: 3, do: [{ op: 'coins', amount: 3 }] },
    ],
    startingWeaponId: 'coconut_crossbow',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.75, primary: '#b8a888', secondary: '#5d3d1e', accent: '#ffd93b',
      parts: [
        { shape: 'sphere', size: [0.14, 0.14, 0.1], pos: [-0.12, 0.62, 0.2], rot: [0, 0, 0], color: 'accent' },
        { shape: 'sphere', size: [0.14, 0.14, 0.1], pos: [0.12, 0.62, 0.2], rot: [0, 0, 0], color: 'accent' },
        { shape: 'cone', size: [0.1, 0.2, 0.1], pos: [0, 0.85, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.09, 0.09, 0.09], pos: [0, 1.0, 0], rot: [0, 0, 0], color: 'primary' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'wins', count: 2 },
  },
]);
