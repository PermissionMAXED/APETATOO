// APETATO meta progression — the entry point of the meta layer.
// initMeta({bus, save}) wires golden-banana rewards, unlock evaluation,
// achievements, lifetime stats, and daily runs. Everything is bus-driven;
// no game internals are touched.
//
// Golden bananas on run:end:
//   floor(wave*2 + kills/50 + bossesKilled*15) * (hardcore ? 2 : 1)
//                                              * (custom ? 0 : 1)
// hardcore/custom come from resolveRules() on the cached run:start modeId.

import { Content } from '../content/registry.js';
import { resolveRules } from './modesLogic.js';
import { initAchievements } from './achievements.js';
import { initStatsTracker } from './statsTracker.js';
import { initDaily } from './daily.js';

/** save.data.unlocked keys — identical to the Content array names. */
const KINDS = ['characters', 'arenas', 'modes', 'weapons'];

function defsOf(kind) {
  return (Content && Array.isArray(Content[kind])) ? Content[kind] : [];
}

/**
 * Wire the whole meta layer. Call exactly once at boot.
 * @param {{bus: {on:Function, emit:Function}, save: {data:object, persist:Function, persistNow:Function}}} deps
 * @returns {{
 *   buyUnlock: (kind:string, id:string) => boolean,
 *   isUnlocked: (kind:string, id:string) => boolean,
 *   evaluateUnlocks: () => void,
 * }}
 */
export function initMeta({ bus, save }) {
  // Wiring order matters: bus delivers listeners in registration order, so
  // on run:end the stats tracker rolls the run into save.data.stats FIRST,
  // then achievements check the fresh totals, then daily submits, and
  // finally progression (below) pays rewards and evaluates unlocks against
  // the fully-updated save.
  initStatsTracker(bus, save);
  initAchievements(bus, save, {
    characterIds: defsOf('characters').map((c) => c.id),
  });
  initDaily(bus, save);

  /** Cached payload of the most recent 'run:start' (modeId, customRules...). */
  let lastRunStart = null;

  function unlockedList(kind) {
    const u = save.data.unlocked;
    if (!Array.isArray(u[kind])) u[kind] = [];
    return u[kind];
  }

  /** True when the entry is usable: default-unlocked or earned. */
  function isUnlocked(kind, id) {
    const def = defsOf(kind).find((d) => d.id === id);
    if (def && def.unlock && def.unlock.type === 'default') return true;
    return unlockedList(kind).includes(id);
  }

  /** Push + emit exactly once. Returns false if it was already unlocked. */
  function unlockNow(kind, id) {
    const list = unlockedList(kind);
    if (list.includes(id)) return false;
    list.push(id);
    bus.emit('unlock:new', { kind, id });
    return true;
  }

  /**
   * Re-check every wins/achievement-gated def and unlock what's newly earned.
   * 'buy' unlocks only happen through buyUnlock(). Safe to call any time.
   */
  function evaluateUnlocks() {
    const wins = save.data.stats.wins;
    const achievements = save.data.achievements;
    let changed = false;

    for (const kind of KINDS) {
      const list = unlockedList(kind);
      for (const def of defsOf(kind)) {
        const unlock = def && def.unlock;
        if (!unlock || list.includes(def.id)) continue;
        let earned = false;
        if (unlock.type === 'wins') earned = wins >= (Number(unlock.count) || 0);
        else if (unlock.type === 'achievement') earned = !!achievements[unlock.id];
        if (earned && unlockNow(kind, def.id)) changed = true;
      }
    }
    if (changed) save.persist();
  }

  /**
   * Spend golden bananas on a {type:'buy', cost} unlock (UI entry point).
   * Returns true on success; false when unknown, not buyable, already
   * unlocked, or unaffordable.
   */
  function buyUnlock(kind, id) {
    const def = defsOf(kind).find((d) => d.id === id);
    if (!def || !def.unlock || def.unlock.type !== 'buy') return false;
    if (unlockedList(kind).includes(id)) return false;
    const cost = Number(def.unlock.cost) || 0;
    if (save.data.goldenBananas < cost) return false;

    save.data.goldenBananas -= cost;
    unlockNow(kind, id);
    save.persist();
    return true;
  }

  // --- rewards ---------------------------------------------------------------
  bus.on('run:start', (p) => {
    lastRunStart = p || {};
  });

  bus.on('run:end', (p = {}) => {
    const runStats = p.runStats || {};
    const wave = Number(p.wave ?? runStats.wave) || 0;
    const kills = Number(runStats.kills) || 0;
    const bossesKilled = Number(runStats.bossesKilled) || 0;

    const modeId = (lastRunStart && lastRunStart.modeId) || 'classic';
    const rules = resolveRules(modeId, lastRunStart && lastRunStart.customRules);

    const bananas =
      Math.floor(wave * 2 + kills / 50 + bossesKilled * 15) *
      (rules.hardcore ? 2 : 1) *
      (rules.custom ? 0 : 1);

    save.data.goldenBananas += bananas;
    save.persist();
    bus.emit('meta:reward', { bananas });

    // History entry only — recordRun never touches stats/goldenBananas
    // (this listener and statsTracker are the single accumulators).
    if (typeof save.recordRun === 'function') {
      save.recordRun({
        win: !!p.victory,
        wave,
        kills,
        coins: Number(runStats.coinsEarned) || 0,
        timeSec: Number(runStats.timeSec) || 0,
        characterId: p.characterId || (lastRunStart && lastRunStart.characterId) || 'unknown',
        mode: modeId,
        arena: p.arenaId || (lastRunStart && lastRunStart.arenaId) || '',
        goldenBananas: bananas,
      });
    }

    evaluateUnlocks();
  });

  // Achievement-gated unlocks can pop mid-run the instant they're earned.
  bus.on('achievement:unlock', () => {
    evaluateUnlocks();
  });

  // Catch up saves whose stats already satisfy unlock conditions (e.g. defs
  // added in an update after the player earned the wins).
  evaluateUnlocks();

  return { buyUnlock, isUnlocked, evaluateUnlocks };
}
