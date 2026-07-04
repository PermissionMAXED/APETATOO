// APETATO enemies — ELITE MODIFIERS.
// Slap one of these on an eliteAllowed enemy and it gets a paint job, a
// power trip, and a guaranteed loot crate. Baseline elite treatment is
// hp x6, damage x2, radius x1.35, xp x8 — each mod tweaks from there.
// Pure frozen data; interpreted by the wave/combat systems.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const ELITE_MODS = deepFreeze([
  // Ate one spicy banana too many. Dies the way it lived: dramatically, and on fire.
  {
    id: 'volcanic',
    name: 'Volcanic',
    tint: '#ff5a1f',
    statMult: { hp: 6, damage: 2, speed: 1.0, radius: 1.35, xp: 8 },
    effects: [
      { trigger: 'onDeath', do: [{ op: 'explode', damage: 14, radius: 3.2 }] },
    ],
    dropCrate: true,
  },
  // Never washes its paws. Every scratch comes with a complimentary stomach ache.
  {
    id: 'plagued',
    name: 'Plagued',
    tint: '#7dc92e',
    statMult: { hp: 6, damage: 2, speed: 1.0, radius: 1.35, xp: 8 },
    effects: [
      { trigger: 'onHit', do: [{ op: 'status', status: 'poison', dps: 3, duration: 4, target: 'target' }] },
    ],
    dropCrate: true,
  },
  // Got struck by lightning and took it as a compliment. Shares the feeling on a schedule.
  {
    id: 'stormcharged',
    name: 'Stormcharged',
    tint: '#5ab8ff',
    statMult: { hp: 6, damage: 2, speed: 1.0, radius: 1.35, xp: 8 },
    effects: [
      { trigger: 'interval', interval: 4, do: [{ op: 'status', status: 'shock', dps: 5, duration: 1, target: 'area', radius: 3.5 }] },
    ],
    dropCrate: true,
  },
  // Believes personal growth means literal volume. Slow, vast, extremely committed.
  {
    id: 'colossal',
    name: 'Colossal',
    tint: '#b06be0',
    statMult: { hp: 9, damage: 2, speed: 0.7, radius: 1.7, xp: 8 },
    effects: [
      { trigger: 'onDeath', do: [{ op: 'explode', damage: 8, radius: 2.5 }] },
    ],
    dropCrate: true,
  },
  // Late for a very important banana. Refuses to elaborate. Refuses to slow down.
  {
    id: 'swift',
    name: 'Swift',
    tint: '#ffe14d',
    statMult: { hp: 6, damage: 2, speed: 1.6, radius: 1.35, xp: 8 },
    effects: [
      { trigger: 'onHit', do: [{ op: 'damageNearest', damage: 3, count: 1, radius: 4 }] },
    ],
    dropCrate: true,
  },
  // Plated in solid banana gold. Worth a fortune in XP; spends it all on funeral confetti.
  {
    id: 'gilded',
    name: 'Gilded',
    tint: '#ffc832',
    statMult: { hp: 6, damage: 2, speed: 1.0, radius: 1.35, xp: 14 },
    effects: [
      { trigger: 'interval', interval: 6, do: [{ op: 'damageNearest', damage: 4, count: 2, radius: 5 }] },
    ],
    dropCrate: true,
  },
]);
