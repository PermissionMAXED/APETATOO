// APETATO game modes — pure frozen data.
// Every ModeDef carries a COMPLETE rules object (all keys present, defaults
// filled) so game systems never need to null-check individual rule fields.
// Logic that interprets these rules lives in src/meta/modesLogic.js.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

/** Default value for every rules key. Every mode fills all of these. */
export const RULE_DEFAULTS = Object.freeze({
  waves: 20,
  endless: false,
  shop: true,
  levelups: true,
  weaponSlots: null, // null = character default
  hpMult: 1,
  enemyHpMult: 1,
  enemyDmgMult: 1,
  spawnMult: 1,
  eliteMult: 1,
  xpMult: 1,
  coinMult: 1,
  startCoins: 20,
  hardcore: false,
  chaosWaveModifiers: false,
  bananaRain: false,
  bossRush: false,
  custom: false,
  daily: false,
  seeded: false,
});

/** Build a ModeDef with defaults filled into rules, deep-frozen. */
function mode(def) {
  return deepFreeze({ ...def, rules: { ...RULE_DEFAULTS, ...(def.rules || {}) } });
}

export const MODES = Object.freeze([
  mode({
    id: 'classic',
    name: 'Classic',
    description: 'The standard survivor gauntlet: 20 waves, shops between rounds, a boss at the end. Peel or be peeled.',
    rules: {},
    unlock: { type: 'default' },
  }),
  mode({
    id: 'endless',
    name: 'Endless',
    description: 'The waves never stop. How deep into the jungle can you go before the jungle goes into you?',
    rules: { endless: true },
    unlock: { type: 'wins', count: 1 },
  }),
  mode({
    id: 'boss_rush',
    name: 'Boss Rush',
    description: 'Eight waves, every one a boss. Shop fast, hit faster.',
    rules: { bossRush: true, waves: 8, shop: true },
    unlock: { type: 'wins', count: 1 },
  }),
  mode({
    id: 'chaos_run',
    name: 'Chaos Run',
    description: 'Every wave rolls a random modifier. Extra XP for putting up with the nonsense.',
    rules: { chaosWaveModifiers: true, xpMult: 1.2 },
    unlock: { type: 'wins', count: 2 },
  }),
  mode({
    id: 'one_weapon',
    name: 'One Weapon',
    description: 'A single weapon slot. Marry your pick, for better or peel worse. Extra XP as consolation.',
    rules: { weaponSlots: 1, xpMult: 1.15 },
    unlock: { type: 'wins', count: 1 },
  }),
  mode({
    id: 'banana_madness',
    name: 'Banana Madness',
    description: 'Bananas rain from the sky and enemies flood the arena. Triple coins, triple XP, triple trouble.',
    rules: { bananaRain: true, spawnMult: 2.5, coinMult: 3, xpMult: 3 },
    unlock: { type: 'wins', count: 3 },
  }),
  mode({
    id: 'hardcore',
    name: 'Hardcore',
    description: 'Tougher, meaner enemies and no room for mistakes. Doubles your golden banana payout.',
    rules: { hardcore: true, enemyHpMult: 1.3, enemyDmgMult: 1.5 },
    unlock: { type: 'wins', count: 5 },
  }),
  mode({
    id: 'custom',
    name: 'Custom',
    description: 'Your arena, your rules. Tune every dial — but tinkered runs earn no golden bananas.',
    rules: { custom: true },
    unlock: { type: 'wins', count: 1 },
  }),
  mode({
    id: 'daily',
    name: 'Daily Run',
    description: 'One seeded classic run per day, same for every ape on the planet. Climb the daily board.',
    rules: { daily: true, seeded: true },
    unlock: { type: 'default' },
  }),
]);

/** id -> ModeDef lookup, frozen. */
export const MODES_BY_ID = Object.freeze(
  MODES.reduce((acc, m) => {
    acc[m.id] = m;
    return acc;
  }, {})
);
