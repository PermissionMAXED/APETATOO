// APETATO persistence.
// One localStorage blob at 'apetato_save_v1'. Corrupt saves are quarantined
// to 'apetato_save_corrupt' rather than destroyed, and a fresh save is
// started. Writes are debounced (500ms) but flushed on beforeunload.

const SAVE_KEY = 'apetato_save_v1';
const CORRUPT_KEY = 'apetato_save_corrupt';
const DEBOUNCE_MS = 500;
const RUNS_HISTORY_MAX = 50;

/** Fresh default save data (the schema, v1). */
function defaultData() {
  return {
    v: 1,
    goldenBananas: 0,
    unlocked: {
      characters: ['kong_grunt', 'peel_gunner', 'chimp_zap'],
      weapons: [],
      arenas: ['banana_grove'],
      modes: ['classic'],
    },
    achievements: {},
    stats: {
      totalKills: 0,
      totalRuns: 0,
      wins: 0,
      playtimeSec: 0,
      bestWave: {},
      coinsEarned: 0,
    },
    daily: {},
    runsHistory: [],
    settings: {
      sfxVol: 0.8,
      musicVol: 0.5,
      screenShake: 1,
      damageNumbers: true,
      showTimer: true,
    },
  };
}

/**
 * Merge loaded data over defaults, in place on `base`. Plain objects merge
 * recursively; arrays and scalars are taken from `loaded` wholesale. This
 * lets old saves survive schema additions.
 */
function mergeInto(base, loaded) {
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return base;
  for (const k of Object.keys(loaded)) {
    const bv = base[k];
    const lv = loaded[k];
    if (
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv) &&
      lv &&
      typeof lv === 'object' &&
      !Array.isArray(lv)
    ) {
      mergeInto(bv, lv);
    } else if (lv !== undefined) {
      base[k] = lv;
    }
  }
  return base;
}

/**
 * Initialize the save system: load (or recover) data, hook beforeunload.
 * @returns {{
 *   data: object,
 *   persist: () => void,
 *   persistNow: () => void,
 *   recordRun: (summary: object) => void,
 *   reset: () => void,
 * }}
 */
export function initSave() {
  const storage = globalThis.localStorage;
  let data = defaultData();

  if (storage) {
    let raw = null;
    try {
      raw = storage.getItem(SAVE_KEY);
    } catch (err) {
      console.error('[save] localStorage unavailable:', err);
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        data = mergeInto(defaultData(), parsed);
      } catch (err) {
        console.error('[save] corrupt save detected — quarantining and starting fresh:', err);
        try {
          storage.setItem(CORRUPT_KEY, raw);
        } catch (_) {
          /* quota exceeded etc. — nothing more we can do */
        }
        data = defaultData();
      }
    }
  }

  let debounceTimer = null;

  const save = {
    data,

    /** Schedule a write, coalescing bursts (levelups, shop sprees...). */
    persist() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        save.persistNow();
      }, DEBOUNCE_MS);
    },

    /** Write synchronously, cancelling any pending debounce. */
    persistNow() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (!storage) return;
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(save.data));
      } catch (err) {
        console.error('[save] persist failed:', err);
      }
    },

    /**
     * Record a completed run and roll its numbers into lifetime stats.
     * Expected summary shape (all optional, extra fields are kept):
     *   { win, wave, kills, coins, timeSec, characterId, mode, arena,
     *     goldenBananas }
     * bestWave is tracked per characterId. goldenBananas earned during the
     * run should be included here — recordRun is the single point that
     * credits them (meta/progression must not double-add).
     */
    recordRun(summary = {}) {
      const s = save.data.stats;
      s.totalRuns += 1;
      s.totalKills += Number(summary.kills) || 0;
      if (summary.win) s.wins += 1;
      s.playtimeSec += Number(summary.timeSec) || 0;
      s.coinsEarned += Number(summary.coins) || 0;

      const charKey = summary.characterId || 'unknown';
      const wave = Number(summary.wave) || 0;
      if (wave > (s.bestWave[charKey] || 0)) s.bestWave[charKey] = wave;

      save.data.goldenBananas += Number(summary.goldenBananas) || 0;

      save.data.runsHistory.push({ at: Date.now(), ...summary });
      if (save.data.runsHistory.length > RUNS_HISTORY_MAX) {
        save.data.runsHistory.splice(0, save.data.runsHistory.length - RUNS_HISTORY_MAX);
      }

      save.persist();
    },

    /** Wipe everything back to a fresh save (settings included). */
    reset() {
      save.data = defaultData();
      save.persistNow();
    },
  };

  // Flush pending writes when the tab closes.
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('beforeunload', () => save.persistNow());
  }

  return save;
}
