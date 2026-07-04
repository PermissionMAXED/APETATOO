// APETATO lifetime stats.
// Accumulates save.data.stats purely from bus events. Writes are debounced
// via save.persist() (500ms in core/save.js), so hot events like enemy:death
// never thrash localStorage.
//
// bestWave is tracked per modeId here (the meta contract); note that
// save.recordRun (if the game also calls it) tracks bestWave per characterId
// in the same map — mode ids and character ids never collide.

/**
 * Wire lifetime stat accumulation. Call once at boot (from initMeta).
 * @param {{on:Function}} bus
 * @param {{data:object, persist:Function}} save
 * @returns {{ getLastRunStart: () => object|null }}
 */
export function initStatsTracker(bus, save) {
  const s = () => save.data.stats;

  /** Cached payload of the most recent 'run:start' (modeId etc.). */
  let lastRunStart = null;

  bus.on('run:start', (p) => {
    lastRunStart = p || {};
    s().totalRuns += 1;
    save.persist();
  });

  bus.on('enemy:death', () => {
    s().totalKills += 1;
    save.persist();
  });

  bus.on('coin:gain', (p) => {
    const amount = (p && Number(p.amount)) || 0;
    if (amount > 0) {
      s().coinsEarned += amount;
      save.persist();
    }
  });

  bus.on('run:end', (p = {}) => {
    const { victory, runStats = {} } = p;
    if (victory) s().wins += 1;

    const timeSec = Number(runStats.timeSec) || 0;
    if (timeSec > 0) s().playtimeSec += timeSec;

    const modeId = (lastRunStart && lastRunStart.modeId) || 'classic';
    const wave = Number(p.wave ?? runStats.wave) || 0;
    if (wave > (s().bestWave[modeId] || 0)) s().bestWave[modeId] = wave;

    save.persist();
  });

  return {
    getLastRunStart: () => lastRunStart,
  };
}
