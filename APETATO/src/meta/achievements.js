// APETATO achievements.
// Pure bus-event driven: no game internals are touched, only bus payloads and
// the save blob. Unlocked achievements are stored as ISO timestamps in
// save.data.achievements[id]; 'achievement:unlock' {id} is emitted exactly
// once per achievement per save.
//
// Lifetime progress that has no home in save.data.stats (elite kills,
// characters tried) lives under save.data.metaProgress — an additive,
// meta-owned field the core save merge preserves across reloads.

function deepFreeze(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') deepFreeze(v);
  }
  return Object.freeze(obj);
}

// Tunable thresholds (kept in one place so balance passes are easy).
const T = Object.freeze({
  killLifetime1: 1000,
  killLifetime2: 10000,
  eliteKills: 50,
  winCount: 5,
  untouchableMinWave: 5,
  pacifistMinWave: 3,
  dodgesPerRun: 50,
  coinsHeld: 500,
  synergyTier: 6,
  mythicItems: 6,
  speedrunSec: 12 * 60,
  endlessWave: 25,
  petCount: 5,
  overkillMult: 5,
  overkillFlatDamage: 1000,
  glassHpFrac: 0.1,
  shopBuysPerVisit: 5,
  thornKillsPerRun: 25,
  luckAtEnd: 100,
  curseAtEnd: 10,
});

export const ACHIEVEMENT_DEFS = deepFreeze([
  { id: 'first_blood', name: 'First Blood', description: 'Splat your very first enemy.' },
  { id: 'wave_10', name: 'Double Digits', description: 'Reach wave 10 in any mode.' },
  { id: 'first_win', name: 'Top Banana', description: 'Win your first run.' },
  { id: 'win_5', name: 'Alpha Ape', description: 'Win 5 runs.' },
  { id: 'win_hardcore', name: 'Peeled Nerves', description: 'Win a Hardcore run.' },
  { id: 'kill_1000', name: 'Banana Split', description: 'Defeat 1,000 enemies (lifetime).' },
  { id: 'kill_10000', name: 'Extinction Event', description: 'Defeat 10,000 enemies (lifetime).' },
  { id: 'elite_slayer_50', name: 'Elite Slayer', description: 'Defeat 50 elite enemies (lifetime).' },
  { id: 'boss_rush_win', name: 'Rush Hour', description: 'Win a Boss Rush run.' },
  { id: 'untouchable_wave', name: 'Untouchable', description: `Clear wave ${T.untouchableMinWave} or later without taking a single hit.` },
  { id: 'dodge_master', name: 'Dodge Master', description: `Dodge ${T.dodgesPerRun} attacks in a single run.` },
  { id: 'banana_hoarder', name: 'Banana Hoarder', description: `Hold ${T.coinsHeld} coins at once.` },
  { id: 'max_synergy', name: 'Full Set', description: `Reach synergy tier ${T.synergyTier}.` },
  { id: 'full_mythic', name: 'Mythic Wardrobe', description: `Acquire ${T.mythicItems} mythic items in one run.` },
  { id: 'speedrunner', name: 'Speedrunner', description: `Win a run in under ${T.speedrunSec / 60} minutes.` },
  { id: 'pacifist_wave', name: 'Peace Treaty', description: 'Clear a wave without killing anything.', secret: true },
  { id: 'one_weapon_win', name: 'Monogamist', description: 'Win a One Weapon run.' },
  { id: 'endless_25', name: 'Deep Jungle', description: `Reach wave ${T.endlessWave} in Endless.` },
  { id: 'chaos_win', name: 'Chaos Tamer', description: 'Win a Chaos Run.' },
  { id: 'daily_played', name: 'Daily Grind', description: 'Complete a Daily Run.' },
  { id: 'daily_top', name: 'Banana Republic Champion', description: 'Place #1 on your daily leaderboard.' },
  { id: 'pet_army', name: 'Pet Army', description: `Field ${T.petCount} pets at the same time.` },
  { id: 'overkill', name: 'Overkill', description: 'Obliterate an enemy with massively more damage than it had HP.' },
  { id: 'glass_win', name: 'Glass Cannon', description: 'Win a run after dropping below 10% HP.' },
  { id: 'all_chars_tried', name: 'Troop Leader', description: 'Play at least one run with every character.' },
  { id: 'shopaholic', name: 'Shopaholic', description: `Buy ${T.shopBuysPerVisit} items in a single shop visit.` },
  { id: 'thorn_lord', name: 'Thorn Lord', description: `Kill ${T.thornKillsPerRun} enemies with thorns in one run.` },
  { id: 'lucky_devil', name: 'Lucky Devil', description: `End a run with ${T.luckAtEnd}+ luck.` },
  { id: 'curse_flirt', name: 'Flirting with Disaster', description: `End a run with ${T.curseAtEnd}+ curse.` },
  { id: 'untouchable_run', name: 'Ghost Ape', description: 'Win a run without taking a single hit.', secret: true },
]);

/** id -> def lookup. */
export const ACHIEVEMENTS_BY_ID = Object.freeze(
  ACHIEVEMENT_DEFS.reduce((acc, a) => {
    acc[a.id] = a;
    return acc;
  }, {})
);

/** Read a numeric field from runStats, checking both flat and nested stats. */
function statOf(runStats, key) {
  if (!runStats) return 0;
  if (typeof runStats[key] === 'number') return runStats[key];
  if (runStats.stats && typeof runStats.stats[key] === 'number') return runStats.stats[key];
  return 0;
}

/**
 * Wire all achievement listeners. Call once at boot (from initMeta).
 * @param {{on:Function, emit:Function}} bus
 * @param {{data:object, persist:Function}} save
 * @param {{characterIds?: string[]}} [opts] full roster ids for all_chars_tried
 *   (progression passes Content.characters ids; omit to disable that check).
 */
export function initAchievements(bus, save, opts = {}) {
  const characterIds = Array.isArray(opts.characterIds) && opts.characterIds.length > 0
    ? opts.characterIds
    : null;

  // Persistent cross-run progress (see file header note).
  if (!save.data.metaProgress || typeof save.data.metaProgress !== 'object') {
    save.data.metaProgress = {};
  }
  const progress = save.data.metaProgress;
  if (!Array.isArray(progress.charsTried)) progress.charsTried = [];
  if (typeof progress.eliteKills !== 'number') progress.eliteKills = 0;

  function grant(id) {
    if (save.data.achievements[id]) return false; // once, ever
    if (!ACHIEVEMENTS_BY_ID[id]) {
      console.warn(`[achievements] unknown id '${id}' (ignored)`);
      return false;
    }
    save.data.achievements[id] = new Date().toISOString();
    save.persist();
    bus.emit('achievement:unlock', { id });
    return true;
  }

  // --- per-run volatile state -----------------------------------------------
  let run = null;
  function freshRun(startPayload) {
    return {
      modeId: (startPayload && startPayload.modeId) || 'classic',
      hitsThisRun: 0,
      hitsThisWave: 0,
      killsThisWave: 0,
      dodges: 0,
      coinsHeld: 0,
      mythicItems: 0,
      thornKills: 0,
      petCount: 0,
      shopBuysThisVisit: 0,
      droppedBelowGlassHp: false,
    };
  }

  // --- lifetime checks (also run once at init so old saves catch up) -------
  function checkLifetime() {
    const s = save.data.stats;
    if (s.totalKills >= 1) grant('first_blood');
    if (s.totalKills >= T.killLifetime1) grant('kill_1000');
    if (s.totalKills >= T.killLifetime2) grant('kill_10000');
    if (s.wins >= 1) grant('first_win');
    if (s.wins >= T.winCount) grant('win_5');
    if (progress.eliteKills >= T.eliteKills) grant('elite_slayer_50');
    if (characterIds && characterIds.every((id) => progress.charsTried.includes(id))) {
      grant('all_chars_tried');
    }
  }

  // --- run lifecycle --------------------------------------------------------
  bus.on('run:start', (p) => {
    run = freshRun(p);
    const charId = p && p.characterId;
    if (charId && !progress.charsTried.includes(charId)) {
      progress.charsTried.push(charId);
      save.persist();
      if (characterIds && characterIds.every((id) => progress.charsTried.includes(id))) {
        grant('all_chars_tried');
      }
    }
  });

  bus.on('run:end', (p = {}) => {
    const { victory, runStats = {} } = p;
    const wave = Number(p.wave ?? runStats.wave) || 0;
    const modeId = run ? run.modeId : 'classic';

    if (wave >= 10) grant('wave_10');
    checkLifetime(); // statsTracker (registered first) already rolled in this run

    if (victory) {
      if (modeId === 'hardcore') grant('win_hardcore');
      if (modeId === 'boss_rush') grant('boss_rush_win');
      if (modeId === 'one_weapon') grant('one_weapon_win');
      if (modeId === 'chaos_run') grant('chaos_win');
      const timeSec = Number(runStats.timeSec) || 0;
      if (timeSec > 0 && timeSec < T.speedrunSec) grant('speedrunner');
      if (run && run.hitsThisRun === 0) grant('untouchable_run');
      if (run && run.droppedBelowGlassHp) grant('glass_win');
      if (typeof runStats.lowestHpFrac === 'number' && runStats.lowestHpFrac <= T.glassHpFrac) {
        grant('glass_win');
      }
    }
    if (modeId === 'endless' && wave >= T.endlessWave) grant('endless_25');
    // Abandoned dailies never submit a score (see daily.js) — don't count
    // them as "completed" either. 'daily:submitted' below also grants this.
    if (modeId === 'daily' && !p.abandoned) grant('daily_played');

    // luck/curse arrive nested as runStats.stats.{luck,curse} (statOf checks
    // both flat and nested shapes).
    if (statOf(runStats, 'luck') >= T.luckAtEnd) grant('lucky_devil');
    if (statOf(runStats, 'curse') >= T.curseAtEnd) grant('curse_flirt');

    run = null;
  });

  // --- combat ---------------------------------------------------------------
  bus.on('enemy:death', (e) => {
    if (run) run.killsThisWave += 1;
    // save.data.stats.totalKills is already bumped by statsTracker (it is
    // wired before achievements in initMeta, and bus delivers in order).
    const kills = save.data.stats.totalKills;
    if (kills >= 1) grant('first_blood');
    if (kills >= T.killLifetime1) grant('kill_1000');
    if (kills >= T.killLifetime2) grant('kill_10000');

    if (e && (e.elite === true || e.isElite === true || e.tier === 'elite' || (e.enemy && e.enemy.elite))) {
      progress.eliteKills += 1;
      save.persist();
      if (progress.eliteKills >= T.eliteKills) grant('elite_slayer_50');
    }

    const cause = e && (e.cause || e.source || e.killedBy);
    if (run && cause === 'thorns') {
      run.thornKills += 1;
      if (run.thornKills >= T.thornKillsPerRun) grant('thorn_lord');
    }

    const dmg = e && Number(e.damage);
    const maxHp = e && Number(e.maxHp);
    if ((e && e.overkill === true) ||
        (dmg > 0 && maxHp > 0 && dmg >= maxHp * T.overkillMult) ||
        dmg >= T.overkillFlatDamage) {
      grant('overkill');
    }
  });

  // --- waves (untouchable / pacifist) --------------------------------------
  bus.on('wave:start', () => {
    if (!run) return;
    run.hitsThisWave = 0;
    run.killsThisWave = 0;
    run.shopBuysThisVisit = 0; // safety: a visit never spans a wave
  });

  bus.on('wave:end', (p) => {
    if (!run) return;
    const wave = Number(p && (p.wave ?? p)) || 0;
    if (run.hitsThisWave === 0 && wave >= T.untouchableMinWave) grant('untouchable_wave');
    if (run.killsThisWave === 0 && wave >= T.pacifistMinWave) grant('pacifist_wave');
  });

  bus.on('player:hit', (p) => {
    if (!run) return;
    run.hitsThisRun += 1;
    run.hitsThisWave += 1;
    const hp = p && Number(p.hp);
    const maxHp = p && Number(p.maxHp);
    const frac = p && typeof p.hpFrac === 'number'
      ? p.hpFrac
      : (hp >= 0 && maxHp > 0 ? hp / maxHp : NaN);
    if (frac <= T.glassHpFrac) run.droppedBelowGlassHp = true;
  });

  bus.on('player:dodge', () => {
    if (!run) return;
    run.dodges += 1;
    if (run.dodges >= T.dodgesPerRun) grant('dodge_master');
  });

  // --- economy / items ------------------------------------------------------
  bus.on('coin:gain', (p) => {
    if (!run) return;
    if (p && typeof p.total === 'number') run.coinsHeld = p.total;
    else run.coinsHeld += (p && Number(p.amount)) || 0;
    if (run.coinsHeld >= T.coinsHeld) grant('banana_hoarder');
  });

  bus.on('coin:spend', (p) => {
    if (!run) return;
    if (p && typeof p.total === 'number') run.coinsHeld = p.total;
    else run.coinsHeld = Math.max(0, run.coinsHeld - ((p && Number(p.amount)) || 0));
  });

  bus.on('item:gain', (p) => {
    if (!run) return;
    const rarity = p && (p.rarity || (p.item && p.item.rarity));
    if (rarity === 'mythic') {
      run.mythicItems += 1;
      if (run.mythicItems >= T.mythicItems) grant('full_mythic');
    }
  });

  bus.on('synergy:tier', (p) => {
    const tier = typeof p === 'number' ? p : p && Number(p.tier ?? p.count);
    if (tier >= T.synergyTier) grant('max_synergy');
  });

  // --- pets -----------------------------------------------------------------
  bus.on('pet:spawn', (p) => {
    if (!run) return;
    if (p && typeof p.count === 'number') run.petCount = p.count;
    else run.petCount += 1;
    if (run.petCount >= T.petCount) grant('pet_army');
  });

  bus.on('pet:death', (p) => {
    if (!run) return;
    if (p && typeof p.count === 'number') run.petCount = p.count;
    else run.petCount = Math.max(0, run.petCount - 1);
  });

  // --- shop -----------------------------------------------------------------
  bus.on('shop:open', () => {
    if (run) run.shopBuysThisVisit = 0;
  });

  bus.on('shop:buy', (p) => {
    if (!run) return;
    run.shopBuysThisVisit += 1;
    if (run.shopBuysThisVisit >= T.shopBuysPerVisit) grant('shopaholic');
    // Coin balance drops too when a buy carries a cost and no explicit total.
    const cost = p && Number(p.cost);
    if (cost > 0 && !(p && typeof p.total === 'number')) {
      run.coinsHeld = Math.max(0, run.coinsHeld - cost);
    }
  });

  // --- daily (emitted by meta/daily.js) -------------------------------------
  bus.on('daily:submitted', (p) => {
    grant('daily_played');
    if (p && p.rank === 1) grant('daily_top');
  });

  // Retroactive catch-up for saves that predate an achievement's listener.
  checkLifetime();

  return { grant, defs: ACHIEVEMENT_DEFS };
}
