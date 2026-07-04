// APETATO characters — TROOP A.
// The founding troop: the three default apes plus the first row of unlocks.
// Pure frozen data. Interpreted by src/game systems; no logic lives here.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const APES_A = deepFreeze([
  {
    id: 'kong_grunt',
    name: 'Kong Grunt',
    description: 'A wall of muscle with a banana budget. Hits like rent day, moves like a landmark.',
    statMods: { maxHp: 15, armor: 4, knockback: 6, speed: -10, attackSpeed: -10 },
    passives: [
      { trigger: 'onTakeDamage', chance: 25, do: [{ op: 'shield', amount: 2 }] },
    ],
    startingWeaponId: 'gorilla_fists',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.2, primary: '#4a4a4a', secondary: '#2b2b2b', accent: '#d9b38c',
      parts: [
        { shape: 'box', size: [0.7, 0.25, 0.4], pos: [0, 0.55, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.22, 0.22, 0.22], pos: [-0.4, 0.35, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'sphere', size: [0.22, 0.22, 0.22], pos: [0.4, 0.35, 0], rot: [0, 0, 0], color: 'primary' },
        { shape: 'box', size: [0.3, 0.1, 0.2], pos: [0, 0.1, 0.28], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'default' },
  },
  {
    id: 'peel_gunner',
    name: 'Peel Gunner',
    description: 'Fastest peel-slinger west of the fruit stand. Draws first, apologizes with more peels.',
    statMods: { rangedDamage: 5, attackSpeed: 5, projectileSpeed: 10, meleeDamage: -3 },
    passives: [
      { trigger: 'onKill', chance: 10, do: [{ op: 'projectile', visual: 'peel_round', damage: 4, count: 1, speed: 14, scaled: true }] },
    ],
    startingWeaponId: 'banana_pistol',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.0, primary: '#8a5a2b', secondary: '#ffd93b', accent: '#5d3d1e',
      parts: [
        { shape: 'cylinder', size: [0.3, 0.08, 0.3], pos: [0, 0.75, 0], rot: [0, 0, 0], color: 'accent' },
        { shape: 'cylinder', size: [0.18, 0.14, 0.18], pos: [0, 0.85, 0], rot: [0, 0, 0], color: 'accent' },
        { shape: 'box', size: [0.34, 0.08, 0.1], pos: [0, 0.2, 0.05], rot: [0, 0, 0.5], color: 'secondary' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'default' },
  },
  {
    id: 'chimp_zap',
    name: 'Chimp Zap',
    description: 'Licked one electric eel as a kid. Now the static follows him everywhere, adoringly.',
    statMods: { elementalDamage: 6, attackSpeed: 5, maxHp: -3, armor: -1 },
    passives: [
      { trigger: 'interval', interval: 5, do: [{ op: 'status', status: 'shock', dps: 3, duration: 1, target: 'area', radius: 3 }] },
    ],
    startingWeaponId: 'banana_wand',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.95, primary: '#6b4a8a', secondary: '#7ec8e3', accent: '#fff2b0',
      parts: [
        { shape: 'cone', size: [0.08, 0.3, 0.08], pos: [-0.12, 0.8, 0], rot: [0, 0, 0.4], color: 'secondary' },
        { shape: 'cone', size: [0.08, 0.35, 0.08], pos: [0, 0.85, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'cone', size: [0.08, 0.3, 0.08], pos: [0.12, 0.8, 0], rot: [0, 0, -0.4], color: 'secondary' },
        { shape: 'sphere', size: [0.06, 0.06, 0.06], pos: [0, 1.0, 0], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'default' },
  },
  {
    id: 'berserker_bonobo',
    name: 'Berserker Bonobo',
    description: 'Skipped breakfast once in 2019 and never emotionally recovered. Swings accordingly.',
    statMods: { damagePct: 20, meleeDamage: 6, speed: 8, maxHp: -6, armor: -3, dodge: -5 },
    passives: [
      { trigger: 'onLowHp', do: [{ op: 'buff', stat: 'damagePct', add: 25, duration: 5 }] },
    ],
    startingWeaponId: 'coconut_club',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.0, primary: '#7a3b2b', secondary: '#d9302b', accent: '#ffd93b',
      parts: [
        { shape: 'box', size: [0.08, 0.35, 0.12], pos: [0, 0.85, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'box', size: [0.36, 0.08, 0.08], pos: [0, 0.6, 0.22], rot: [0, 0, 0.3], color: 'secondary' },
        { shape: 'sphere', size: [0.05, 0.05, 0.05], pos: [-0.12, 0.62, 0.26], rot: [0, 0, 0], color: 'accent' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'buy', cost: 20 },
  },
  {
    id: 'longeye_lemur',
    name: 'Longeye Lemur',
    description: 'Sees a flea sneeze at four hundred meters. Files it under "target practice".',
    statMods: { range: 25, rangedDamage: 6, projectileSpeed: 15, maxHp: -5, speed: -5 },
    passives: [
      { trigger: 'onCrit', chance: 20, do: [{ op: 'coins', amount: 1 }] },
    ],
    startingWeaponId: 'twig_bow',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.85, primary: '#8f9aa3', secondary: '#2b2b2b', accent: '#ffd93b',
      parts: [
        { shape: 'torus', size: [0.12, 0.03, 0.12], pos: [0.15, 0.65, 0.2], rot: [1.57, 0, 0], color: 'secondary' },
        { shape: 'cylinder', size: [0.16, 0.5, 0.16], pos: [0, 0.3, -0.3], rot: [0.5, 0, 0], color: 'primary' },
        { shape: 'torus', size: [0.16, 0.04, 0.16], pos: [0, 0.5, -0.42], rot: [0.9, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 25 },
  },
  {
    id: 'tinker_tamarin',
    name: 'Tinker Tamarin',
    description: 'Never met a coconut she could not motorize. Her turrets have tiny nameplates.',
    statMods: { engineering: 8, harvesting: 4, damagePct: -12, speed: -3 },
    passives: [
      { trigger: 'onWaveStart', chance: 50, do: [{ op: 'summon', what: 'scrap_turret', max: 1 }] },
    ],
    startingWeaponId: 'scrap_turret_kit',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.9, primary: '#c98a3b', secondary: '#8f9aa3', accent: '#7ec8e3',
      parts: [
        { shape: 'torus', size: [0.2, 0.05, 0.2], pos: [0, 0.72, 0], rot: [0.3, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.09, 0.09, 0.09], pos: [0.16, 0.74, 0.1], rot: [0, 0, 0], color: 'accent' },
        { shape: 'box', size: [0.3, 0.24, 0.16], pos: [0, 0.3, -0.3], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'cylinder', size: [0.03, 0.2, 0.03], pos: [0.1, 0.5, -0.3], rot: [0, 0, 0.3], color: 'primary' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 25 },
  },
  {
    id: 'pyro_gibbon',
    name: 'Pyro Gibbon',
    description: 'Discovered fire independently, twice, both times on purpose. Smells like toasted banana.',
    statMods: { elementalDamage: 6, effectDuration: 25, maxHp: -4, armor: -2 },
    passives: [
      { trigger: 'onKill', chance: 20, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'area', radius: 2 }] },
    ],
    startingWeaponId: 'ember_peel_tosser',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.95, primary: '#a33a2b', secondary: '#ff9a3b', accent: '#ffd93b',
      parts: [
        { shape: 'cone', size: [0.12, 0.3, 0.12], pos: [0, 0.85, 0], rot: [0, 0, 0.1], color: 'secondary' },
        { shape: 'cone', size: [0.07, 0.18, 0.07], pos: [0.1, 0.8, 0], rot: [0, 0, -0.3], color: 'accent' },
        { shape: 'cylinder', size: [0.06, 0.25, 0.06], pos: [-0.25, 0.35, -0.15], rot: [0.3, 0, 0.3], color: 'secondary' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'buy', cost: 30 },
  },
  {
    id: 'sludge_mandrill',
    name: 'Sludge Mandrill',
    description: 'Brews banana daiquiris nobody should drink. Everybody he fights does anyway.',
    statMods: { elementalDamage: 5, effectDuration: 40, harvesting: 3, damagePct: -8, speed: -4 },
    passives: [
      { trigger: 'onHit', chance: 10, do: [{ op: 'status', status: 'poison', dps: 2, duration: 3, target: 'target' }] },
    ],
    startingWeaponId: 'poison_dart_blowgun',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 1.0, primary: '#5a7d2c', secondary: '#a5d64a', accent: '#d97ba6',
      parts: [
        { shape: 'sphere', size: [0.1, 0.14, 0.1], pos: [0, 0.55, 0.3], rot: [0, 0, 0], color: 'accent' },
        { shape: 'cylinder', size: [0.08, 0.22, 0.08], pos: [0.28, 0.35, -0.1], rot: [0, 0, -0.3], color: 'secondary' },
        { shape: 'sphere', size: [0.06, 0.08, 0.06], pos: [0.28, 0.5, -0.1], rot: [0, 0, 0], color: 'primary' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 30 },
  },
  {
    id: 'jackpot_macaque',
    name: 'Jackpot Macaque',
    description: 'Bet his fur on a coin flip and won someone else\'s. The house fears him.',
    statMods: { luck: 25, coinGain: 10, dodge: 5, damagePct: -10, maxHp: -3 },
    passives: [
      { trigger: 'onKill', chance: 8, do: [{ op: 'coins', amount: 2 }] },
    ],
    startingWeaponId: 'hex_peel_charm',
    weaponSlots: 6,
    shopPriceMult: 1.1,
    model: {
      base: 'ape', scale: 0.9, primary: '#c9a86a', secondary: '#2f8a3e', accent: '#ffcf40',
      parts: [
        { shape: 'cylinder', size: [0.24, 0.06, 0.24], pos: [0, 0.75, 0], rot: [0, 0, 0.15], color: 'secondary' },
        { shape: 'cylinder', size: [0.16, 0.16, 0.16], pos: [0, 0.85, 0], rot: [0, 0, 0.15], color: 'secondary' },
        { shape: 'torus', size: [0.07, 0.02, 0.07], pos: [0.2, 0.5, 0.15], rot: [0, 0.5, 0], color: 'accent' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'buy', cost: 35 },
  },
  {
    id: 'peaceful_uakari',
    name: 'Peaceful Uakari',
    description: 'Took a vow of non-violence and a second vow of aggressive gardening. The garden wins wars.',
    statMods: { harvesting: 12, coinGain: 15, xpGain: 10, maxHp: 5, damagePct: -25 },
    passives: [
      { trigger: 'onWaveEnd', do: [{ op: 'coins', amount: 3 }] },
      { trigger: 'interval', interval: 6, do: [{ op: 'heal', amount: 1 }] },
    ],
    startingWeaponId: 'pocket_shrine',
    weaponSlots: 6,
    shopPriceMult: 0.95,
    model: {
      base: 'ape', scale: 0.95, primary: '#d96a4a', secondary: '#e8d5a8', accent: '#3f7d2c',
      parts: [
        { shape: 'cone', size: [0.3, 0.18, 0.3], pos: [0, 0.78, 0], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'sphere', size: [0.07, 0.07, 0.07], pos: [0, 0.9, 0], rot: [0, 0, 0], color: 'accent' },
        { shape: 'torus', size: [0.14, 0.03, 0.14], pos: [0, 0.3, 0.25], rot: [0.4, 0, 0], color: 'accent' },
      ],
      animation: 'bob',
    },
    unlock: { type: 'buy', cost: 35 },
  },
  {
    id: 'blur_spider_monkey',
    name: 'Blur the Spider Monkey',
    description: 'Once outran his own shadow. It still hasn\'t caught up. Please forward its mail.',
    statMods: { speed: 25, dodge: 12, attackSpeed: 5, maxHp: -5, armor: -2 },
    passives: [
      { trigger: 'onDodge', chance: 50, do: [{ op: 'buff', stat: 'speed', add: 20, duration: 2 }] },
    ],
    startingWeaponId: 'vine_whip',
    weaponSlots: 6,
    shopPriceMult: 1.0,
    model: {
      base: 'ape', scale: 0.8, primary: '#3fa7d6', secondary: '#dfe6ec', accent: '#ffd93b',
      parts: [
        { shape: 'box', size: [0.36, 0.06, 0.06], pos: [0, 0.6, 0.24], rot: [0, 0, 0], color: 'secondary' },
        { shape: 'cone', size: [0.06, 0.3, 0.06], pos: [-0.2, 0.5, -0.25], rot: [0.8, 0, 0.8], color: 'primary' },
        { shape: 'cone', size: [0.06, 0.3, 0.06], pos: [0.2, 0.5, -0.25], rot: [0.8, 0, -0.8], color: 'primary' },
      ],
      animation: 'hop',
    },
    unlock: { type: 'buy', cost: 20 },
  },
]);
