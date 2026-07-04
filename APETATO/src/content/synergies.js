// APETATO weapon-class synergy set bonuses.
// One SynergyDef per weapon class. Bonuses trigger at 2 / 4 / 6 weapons of
// that class: tier 2 is a small core-stat bump, tier 4 is medium plus a
// minor effect, tier 6 is big plus a signature effect.
// Pure frozen data; effects use the DSL from src/game/effects.js.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

/** The 15 weapon class ids. Content and validation both key off this list. */
export const WEAPON_CLASSES = Object.freeze([
  'melee',
  'ranged',
  'explosive',
  'magic',
  'tech',
  'poison',
  'fire',
  'pet',
  'turret',
  'support',
  'crit',
  'lifesteal',
  'speed',
  'chaos',
  'precision',
]);

export const SYNERGIES = deepFreeze([
  {
    classId: 'melee',
    name: 'Peel Brawlers',
    bonuses: {
      2: { statMods: { meleeDamage: 4 } },
      4: {
        statMods: { meleeDamage: 8, knockback: 5 },
        effects: [
          { trigger: 'onKill', chance: 10, do: [{ op: 'heal', amount: 1 }] },
        ],
      },
      6: {
        statMods: { meleeDamage: 15, damagePct: 10 },
        effects: [
          { trigger: 'onHit', chance: 20, do: [{ op: 'status', status: 'bleed', dps: 3, duration: 2, target: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'ranged',
    name: 'Seed Spitters',
    bonuses: {
      2: { statMods: { rangedDamage: 4 } },
      4: {
        statMods: { rangedDamage: 8, projectileSpeed: 10 },
        effects: [
          { trigger: 'onKill', chance: 10, do: [{ op: 'projectile', visual: 'seed', damage: 6, count: 1, speed: 14, scaled: true }] },
        ],
      },
      6: {
        statMods: { rangedDamage: 15, range: 10 },
        effects: [
          { trigger: 'onKill', chance: 20, do: [{ op: 'projectile', visual: 'seed', damage: 8, count: 2, speed: 14, scaled: true }] },
        ],
      },
    },
  },
  {
    classId: 'explosive',
    name: 'Boom Bunch',
    bonuses: {
      2: { statMods: { explosionSize: 5 } },
      4: {
        statMods: { explosionSize: 10, damagePct: 5 },
        effects: [
          { trigger: 'onKill', chance: 10, do: [{ op: 'explode', damage: 6, radius: 2, scaled: true, at: 'target' }] },
        ],
      },
      6: {
        statMods: { explosionSize: 20, damagePct: 10 },
        effects: [
          { trigger: 'onKill', chance: 30, do: [{ op: 'explode', damage: 10, radius: 3, scaled: true, at: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'magic',
    name: 'Peel Wizards',
    bonuses: {
      2: { statMods: { elementalDamage: 4 } },
      4: {
        statMods: { elementalDamage: 8, effectDuration: 10 },
        effects: [
          { trigger: 'interval', interval: 6, do: [{ op: 'damageNearest', damage: 8, radius: 5, scaled: true }] },
        ],
      },
      6: {
        statMods: { elementalDamage: 15, effectDuration: 20 },
        effects: [
          { trigger: 'onHit', chance: 15, do: [{ op: 'status', status: 'shock', dps: 4, duration: 1.5, target: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'tech',
    name: 'Gizmo Gang',
    bonuses: {
      2: { statMods: { engineering: 4 } },
      4: {
        statMods: { engineering: 8, attackSpeed: 5 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'shield', amount: 5 }] },
        ],
      },
      6: {
        statMods: { engineering: 15 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'summon', what: 'scrap_bot', max: 1 }] },
        ],
      },
    },
  },
  {
    classId: 'poison',
    name: 'Venom Vines',
    bonuses: {
      2: { statMods: { elementalDamage: 3 } },
      4: {
        statMods: { elementalDamage: 6, effectDuration: 10 },
        effects: [
          { trigger: 'onKill', chance: 20, do: [{ op: 'status', status: 'poison', dps: 2, duration: 3, target: 'area', radius: 2 }] },
        ],
      },
      6: {
        statMods: { elementalDamage: 12, effectDuration: 20 },
        effects: [
          { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'poison', dps: 2, duration: 3, target: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'fire',
    name: 'Flame Fronds',
    bonuses: {
      2: { statMods: { elementalDamage: 3 } },
      4: {
        statMods: { elementalDamage: 6, explosionSize: 8 },
        effects: [
          { trigger: 'onKill', chance: 15, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'area', radius: 2 }] },
        ],
      },
      6: {
        statMods: { elementalDamage: 12, explosionSize: 15 },
        effects: [
          { trigger: 'onHit', chance: 100, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'pet',
    name: 'Banana Buddies',
    bonuses: {
      2: { statMods: { maxHp: 4 } },
      4: {
        statMods: { maxHp: 8, hpRegen: 2 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'heal', amount: 3 }] },
        ],
      },
      6: {
        statMods: { maxHp: 12, damagePct: 8 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'summon', what: 'monkey_pal', max: 2 }] },
        ],
      },
    },
  },
  {
    classId: 'turret',
    name: 'Turret Troop',
    bonuses: {
      2: { statMods: { engineering: 3 } },
      4: {
        statMods: { engineering: 6, range: 5 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'shield', amount: 4 }] },
        ],
      },
      6: {
        statMods: { engineering: 12, range: 10 },
        effects: [
          { trigger: 'onWaveStart', do: [{ op: 'summon', what: 'banana_turret', max: 2 }] },
        ],
      },
    },
  },
  {
    classId: 'support',
    name: 'Smoothie Circle',
    bonuses: {
      2: { statMods: { hpRegen: 3 } },
      4: {
        statMods: { hpRegen: 5, luck: 5 },
        effects: [
          { trigger: 'onWaveEnd', do: [{ op: 'heal', amount: 5 }] },
        ],
      },
      6: {
        statMods: { hpRegen: 8, effectDuration: 20 },
        effects: [
          {
            trigger: 'interval',
            interval: 4,
            do: [
              { op: 'heal', amount: 2 },
              { op: 'shield', amount: 2 },
            ],
          },
        ],
      },
    },
  },
  {
    classId: 'crit',
    name: 'Banana Splitters',
    bonuses: {
      2: { statMods: { critChance: 3 } },
      4: {
        statMods: { critChance: 5, critDamage: 10 },
        effects: [
          { trigger: 'onCrit', chance: 15, do: [{ op: 'buff', stat: 'attackSpeed', add: 10, duration: 2 }] },
        ],
      },
      6: {
        statMods: { critChance: 8, critDamage: 25 },
        effects: [
          { trigger: 'onCrit', chance: 25, do: [{ op: 'explode', damage: 8, radius: 2.5, scaled: true, at: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'lifesteal',
    name: 'Juice Drinkers',
    bonuses: {
      2: { statMods: { lifesteal: 3 } },
      4: {
        statMods: { lifesteal: 5, maxHp: 5 },
        effects: [
          { trigger: 'onKill', chance: 15, do: [{ op: 'heal', amount: 1 }] },
        ],
      },
      6: {
        statMods: { lifesteal: 10, maxHp: 10 },
        effects: [
          {
            trigger: 'onLowHp',
            do: [
              { op: 'heal', amount: 10 },
              { op: 'buff', stat: 'lifesteal', add: 15, duration: 4 },
            ],
          },
        ],
      },
    },
  },
  {
    classId: 'speed',
    name: 'Zoom Troop',
    bonuses: {
      2: { statMods: { speed: 3 } },
      4: {
        statMods: { speed: 6, dodge: 3 },
        effects: [
          { trigger: 'onDodge', do: [{ op: 'buff', stat: 'speed', add: 10, duration: 2 }] },
        ],
      },
      6: {
        statMods: { speed: 12, attackSpeed: 10 },
        effects: [
          { trigger: 'onDodge', chance: 50, do: [{ op: 'damageNearest', damage: 8, radius: 3, scaled: true }] },
        ],
      },
    },
  },
  {
    classId: 'chaos',
    name: 'Barrel of Chaos',
    bonuses: {
      2: { statMods: { luck: 4 } },
      4: {
        statMods: { luck: 6, damagePct: 5, curse: 1 },
        effects: [
          { trigger: 'onKill', chance: 5, do: [{ op: 'explode', damage: 8, radius: 2.5, scaled: true, at: 'target' }] },
        ],
      },
      6: {
        statMods: { luck: 10, damagePct: 10, curse: 2 },
        effects: [
          { trigger: 'interval', interval: 5, do: [{ op: 'projectile', visual: 'chaos_peel', damage: 10, count: 5, speed: 12, scaled: true }] },
          { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'burn', dps: 3, duration: 2, target: 'target' }] },
          { trigger: 'onHit', chance: 5, do: [{ op: 'status', status: 'freeze', dps: 0, duration: 0.8, target: 'target' }] },
        ],
      },
    },
  },
  {
    classId: 'precision',
    name: 'One Peel, One Kill',
    bonuses: {
      2: { statMods: { range: 4 } },
      4: {
        statMods: { range: 8, critChance: 3 },
        effects: [
          { trigger: 'onCrit', chance: 20, do: [{ op: 'status', status: 'slow', dps: 0, duration: 1.5, target: 'target' }] },
        ],
      },
      6: {
        statMods: { range: 12, critChance: 6, critDamage: 20 },
        effects: [
          { trigger: 'onHit', chance: 10, do: [{ op: 'status', status: 'stun', dps: 0, duration: 0.5, target: 'target' }] },
        ],
      },
    },
  },
]);
