// APETATO shop items — MYTHIC (rarity 4).
// Run-warping artifacts: summon armies, kill-count engines, curse reactors,
// chaos peels. Prices ~150-180. All maxStacks 1 — the universe insists.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const MYTHIC_ITEMS = deepFreeze([
  {
    id: 'banana_singularity',
    name: 'Banana Singularity',
    description: 'All bananas are one banana. Every banana-tagged item you own feeds the yellow event horizon. Hoard. Ascend. (wink)',
    rarity: 4,
    basePrice: 175,
    maxStacks: 1,
    tags: ['banana', 'mystic', 'shiny'],
    statMods: { pickupRange: 10 },
    effects: [
      { trigger: 'passive', do: [{ op: 'statPer', stat: 'damagePct', add: 4, max: 60, per: { what: 'itemTag', tag: 'banana' } }] },
    ],
  },
  {
    id: 'infinite_monkey_theorem',
    name: 'Infinite Monkey Theorem',
    description: 'Given enough monkeys and enough typewriters, your enemies eventually stop existing. QED.',
    rarity: 4,
    basePrice: 180,
    maxStacks: 1,
    tags: ['mystic', 'jungle'],
    statMods: {},
    effects: [
      { trigger: 'interval', interval: 2, do: [{ op: 'summon', what: 'typewriter_monkey', max: 8 }] },
    ],
  },
  {
    id: 'bloodthirst_scepter',
    name: 'Bloodthirst Scepter',
    description: 'Counts every kill and compounds the interest. Occasionally celebrates a kill with fireworks made of that kill.',
    rarity: 4,
    basePrice: 170,
    maxStacks: 1,
    tags: ['cursed', 'meat'],
    statMods: {},
    effects: [
      { trigger: 'passive', do: [{ op: 'statPer', stat: 'damagePct', add: 1, max: 50, per: { what: 'kills', step: 15 } }] },
      { trigger: 'onKill', chance: 2, do: [{ op: 'explode', damage: 20, radius: 3, scaled: true, at: 'target' }] },
    ],
  },
  {
    id: 'doom_engine',
    name: 'Doom Engine',
    description: 'A machine that manufactures worse waves, then arms you for them. Deep waves detonate on arrival.',
    rarity: 4,
    basePrice: 178,
    maxStacks: 1,
    tags: ['cursed', 'tech'],
    statMods: { curse: 8 },
    effects: [
      { trigger: 'passive', do: [{ op: 'statPer', stat: 'damagePct', add: 3, max: 45, per: { what: 'wave', step: 1 } }] },
      { trigger: 'onWaveStart', cond: { waveGte: 8 }, do: [{ op: 'explode', damage: 30, radius: 5, scaled: true, at: 'self' }] },
    ],
  },
  {
    id: 'peelnado',
    name: 'Peelnado',
    description: 'A permanent tornado of banana peels with you at the calm, smug center.',
    rarity: 4,
    basePrice: 172,
    maxStacks: 1,
    tags: ['banana', 'cursed'],
    statMods: {},
    effects: [
      {
        trigger: 'interval',
        interval: 3,
        do: [
          { op: 'explode', damage: 18, radius: 5, scaled: true, at: 'self' },
          { op: 'status', status: 'slow', dps: 0, duration: 2, target: 'area', radius: 5 },
        ],
      },
    ],
  },
  {
    id: 'golden_ape_statue',
    name: 'Golden Ape Statue',
    description: 'An idol of the First Collector. Every shiny you own polishes its grin; coins occasionally teach you things. (wink)',
    rarity: 4,
    basePrice: 176,
    maxStacks: 1,
    tags: ['shiny', 'mystic'],
    statMods: { coinGain: 25 },
    effects: [
      { trigger: 'passive', do: [{ op: 'statPer', stat: 'luck', add: 2, max: 20, per: { what: 'itemTag', tag: 'shiny' } }] },
      { trigger: 'onPickupCoin', chance: 15, do: [{ op: 'xp', amount: 1 }] },
    ],
  },
  {
    id: 'heart_of_the_jungle',
    name: 'Heart of the Jungle',
    description: 'The canopy adopted you. It waters you on a schedule and panics harder than you do.',
    rarity: 4,
    basePrice: 174,
    maxStacks: 1,
    tags: ['jungle', 'mystic', 'defense'],
    statMods: { maxHp: 30, hpRegen: 5 },
    effects: [
      { trigger: 'interval', interval: 5, cond: { hpBelowPct: 90 }, do: [{ op: 'heal', amount: 3 }] },
      { trigger: 'onLowHp', do: [{ op: 'shield', amount: 15 }] },
    ],
  },
  {
    id: 'quantum_peel',
    name: 'Quantum Peel',
    description: 'Your bananas exist in three places at once. None of them is "strong". All of them is "fast".',
    rarity: 4,
    basePrice: 180,
    maxStacks: 1,
    tags: ['banana', 'tech', 'mystic'],
    statMods: { extraProjectiles: 2, damagePct: -40, attackSpeed: 20 },
    effects: [],
  },
  {
    id: 'omega_banana',
    name: 'Omega Banana',
    description: 'The last banana of the previous universe. Eating it in emergencies is on the table.',
    rarity: 4,
    basePrice: 179,
    maxStacks: 1,
    tags: ['banana', 'shiny', 'mystic'],
    statMods: { damagePct: 15, attackSpeed: 15, speed: 10, luck: 10, curse: 3 },
    effects: [
      { trigger: 'onKill', chance: 20, cond: { hpBelowPct: 50 }, do: [{ op: 'heal', amount: 2 }] },
    ],
  },
  {
    id: 'turret_uprising',
    name: 'Turret Uprising',
    description: 'The gatling bananas have unionized, and you\u2019re the union. Four demands per wave, all of them bullets.',
    rarity: 4,
    basePrice: 177,
    maxStacks: 1,
    tags: ['tech', 'banana'],
    statMods: { engineering: 10 },
    effects: [
      { trigger: 'onWaveStart', do: [{ op: 'summon', what: 'banana_gatling', max: 4 }] },
    ],
  },
  {
    id: 'vampire_god_fang',
    name: 'Vampire God Fang',
    description: 'The fang the other fangs pray to. Everything you bite becomes a beverage.',
    rarity: 4,
    basePrice: 173,
    maxStacks: 1,
    tags: ['cursed', 'meat'],
    statMods: { lifesteal: 15 },
    effects: [
      { trigger: 'onHit', chance: 10, do: [{ op: 'status', status: 'bleed', dps: 6, duration: 3, target: 'target' }] },
      { trigger: 'onKill', do: [{ op: 'heal', amount: 1 }] },
    ],
  },
  {
    id: 'pandemonium_peel',
    name: 'Pandemonium Peel',
    description: 'Nobody knows what it does next. Not even it. Especially not whoever you hit.',
    rarity: 4,
    basePrice: 180,
    maxStacks: 1,
    tags: ['banana', 'cursed', 'mystic'],
    statMods: { luck: 5 },
    effects: [
      { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'burn', dps: 4, duration: 2, target: 'target' }] },
      { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'freeze', dps: 0, duration: 0.8, target: 'target' }] },
      { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'poison', dps: 3, duration: 3, target: 'target' }] },
      { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'shock', dps: 5, duration: 1, target: 'target' }] },
    ],
  },
]);
