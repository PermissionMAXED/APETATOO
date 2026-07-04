// APETATO daily runs.
// One globally-shared seeded run per UTC day. Scores live in
// save.data.daily[YYYY-MM-DD] = { scores: [...top 20 by score desc],
// attempted: true }. Emits 'daily:submitted' {score, rank, entry} after a
// score lands (achievements listens for daily_played / daily_top).

import { hashString } from '../core/rng.js';

const MAX_SCORES = 20;

/** Today's UTC date key, 'YYYY-MM-DD'. */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic seed shared by every player for today's daily run. */
export function dailySeed() {
  return hashString('APETATO-' + todayKey());
}

/** Daily score formula. */
export function computeDailyScore({ wave = 0, kills = 0, coinsEarned = 0 } = {}) {
  return (Number(wave) || 0) * 1000 + (Number(kills) || 0) + Math.floor((Number(coinsEarned) || 0) / 2);
}

function dayEntry(save, key = todayKey()) {
  const daily = save.data.daily;
  if (!daily[key] || typeof daily[key] !== 'object') daily[key] = { scores: [], attempted: false };
  if (!Array.isArray(daily[key].scores)) daily[key].scores = [];
  return daily[key];
}

/** Best (highest-score) entry for today, or null if none. */
export function getDailyBest(save) {
  const day = save.data.daily[todayKey()];
  if (!day || !Array.isArray(day.scores) || day.scores.length === 0) return null;
  return day.scores[0];
}

/** True once today's daily has been attempted (started or scored). */
export function isDailyAttempted(save) {
  const day = save.data.daily[todayKey()];
  return !!(day && day.attempted);
}

/**
 * Submit a daily result. Keeps the top 20 sorted by score desc and marks the
 * day attempted. Returns { score, rank (1-based), entry }.
 * @param {{data:object, persist:Function}} save
 * @param {{score?:number, wave?:number, characterId?:string, timeSec?:number,
 *          buildSummary?:object, kills?:number, coinsEarned?:number}} result
 *   Pass `score` directly, or wave/kills/coinsEarned to have it computed.
 */
export function submitDaily(save, result = {}) {
  const day = dayEntry(save);
  const score = typeof result.score === 'number' ? result.score : computeDailyScore(result);

  const entry = {
    score,
    wave: Number(result.wave) || 0,
    characterId: result.characterId || 'unknown',
    timeSec: Number(result.timeSec) || 0,
    buildSummary: result.buildSummary || null,
    at: new Date().toISOString(),
  };

  day.scores.push(entry);
  day.scores.sort((a, b) => b.score - a.score);
  if (day.scores.length > MAX_SCORES) day.scores.length = MAX_SCORES;
  day.attempted = true;
  save.persist();

  const rank = day.scores.indexOf(entry) + 1; // 0 => pushed off the board
  return { score, rank, entry };
}

/**
 * Wire daily-run submission. Call once at boot (from initMeta).
 * Listens to run:start/run:end; when the run's mode is 'daily' (and not a
 * practice run — customRules.practice true opts out), computes the score from
 * runStats and submits it.
 * @param {{on:Function, emit:Function}} bus
 * @param {{data:object, persist:Function}} save
 */
export function initDaily(bus, save) {
  let lastRunStart = null;

  bus.on('run:start', (p) => {
    lastRunStart = p || {};
    if (lastRunStart.modeId === 'daily') {
      const practice = !!(lastRunStart.customRules && lastRunStart.customRules.practice);
      if (!practice) {
        dayEntry(save).attempted = true;
        save.persist();
      }
    }
  });

  bus.on('run:end', (p = {}) => {
    if (!lastRunStart || lastRunStart.modeId !== 'daily') return;
    if (lastRunStart.customRules && lastRunStart.customRules.practice) return;

    const runStats = p.runStats || {};
    const wave = Number(p.wave ?? runStats.wave) || 0;
    const submitted = submitDaily(save, {
      wave,
      kills: Number(runStats.kills) || 0,
      coinsEarned: Number(runStats.coinsEarned ?? runStats.coins) || 0,
      characterId: lastRunStart.characterId || runStats.characterId || 'unknown',
      timeSec: Number(runStats.timeSec) || 0,
      buildSummary: runStats.buildSummary || null,
    });
    bus.emit('daily:submitted', submitted);
  });

  return { todayKey, dailySeed, getDailyBest, isDailyAttempted, submitDaily };
}
