// APETATO game/levelup — XP curve + level-up choice flow.
//
// xpNeeded(l) = floor((l+3)^2 * 0.62). Each level: +1 maxHp,
// pendingLevelups++, 'player:levelup' { level, player }.
//
// getChoices(): 4 distinct UpgradeDefs rolled by weight; when
// rng < luck/200 one low-rarity (common) choice is rerolled hoping for
// something shinier. choose(idx) applies statMods permanently as an upgrade
// source, decrements pendingLevelups; when 0 the run returns to the state it
// interrupted (PLAYING or SHOP) via state.resumeAfterLevelups.

import { Content } from '../content/registry.js';
import { recomputeStats, pushBuildLog } from './player.js';
import { fireTriggerFast } from './effects.js';

const LEVEL_EV = { level: 0, player: null };
const XP_EV = { amount: 0 };

/** XP required to go from level l to l+1. */
export function xpNeeded(l) {
  return Math.floor((l + 3) * (l + 3) * 0.62);
}

/**
 * Grant XP (xpGain / mode / chaos multipliers applied here — pass RAW
 * amounts). Levels up as many times as the total allows.
 */
export function grantXp(state, player, amount) {
  if (!player || !player.alive || !(amount > 0)) return;
  let mult = 1 + (player.stats.xpGain || 0) / 100;
  mult *= state.modeRules.xpMult || 1;
  if (state.chaosMod && state.chaosMod.xpMult) mult *= state.chaosMod.xpMult;
  const gained = amount * mult;
  player.xp += gained;
  XP_EV.amount = gained;
  state.bus.emit('xp:gain', XP_EV);

  let leveled = false;
  while (player.xp >= xpNeeded(player.level)) {
    player.xp -= xpNeeded(player.level);
    player.level++;
    player._levelSource.mods.maxHp = player.level - 1; // +1 maxHp per level
    if (state.modeRules.levelups !== false) player.pendingLevelups++;
    leveled = true;
    LEVEL_EV.level = player.level;
    LEVEL_EV.player = player;
    state.bus.emit('player:levelup', LEVEL_EV);
    LEVEL_EV.player = null;
  }
  player.xpNext = xpNeeded(player.level);
  if (leveled) {
    recomputeStats(state, player);
    fireTriggerFast('onLevelUp', player, state, null, 0, null);
  }
}

// ---------------------------------------------------------------------------
// Choice rolling
// ---------------------------------------------------------------------------

function rollOne(state, player, exclude, count) {
  const upgrades = Content.upgrades;
  return state.rng.weightedPick(upgrades, (u) => {
    for (let i = 0; i < count; i++) {
      if (exclude[i] === u) return 0;
    }
    return u.weight || 1;
  });
}

/**
 * Level-up API factory. `getState` returns the live GameState (or null);
 * `states` is the app state machine (run.js hands both in).
 */
export function createLevelupApi(getState, states) {
  let choices = [];
  let rolledFor = -1; // level "generation" the current roll belongs to

  function rollChoices(state, player) {
    choices.length = 0;
    for (let i = 0; i < 4; i++) {
      const pick = rollOne(state, player, choices, choices.length);
      if (!pick) break;
      choices.push(pick);
    }
    // Luck: one shot to reroll a common into (hopefully) something better.
    const luck = player.stats.luck || 0;
    if (luck > 0 && state.rng.next() < luck / 200) {
      for (let i = 0; i < choices.length; i++) {
        if ((choices[i].rarity | 0) === 0) {
          const re = rollOne(state, player, choices, choices.length);
          if (re && (re.rarity | 0) > 0) choices[i] = re;
          break;
        }
      }
    }
  }

  return {
    getChoices() {
      const state = getState();
      if (!state) return [];
      const player = state.players[0];
      if (!player) return [];
      const gen = player.level * 100 + player.pendingLevelups;
      if (rolledFor !== gen) {
        rollChoices(state, player);
        rolledFor = gen;
      }
      return choices;
    },

    choose(idx) {
      const state = getState();
      if (!state) return;
      const player = state.players[0];
      if (!player || player.pendingLevelups <= 0) return;
      const pick = choices[idx] || choices[0];
      if (pick && pick.statMods) {
        // Fold into the single accumulated upgrade source (endless-safe).
        const acc = player._upgradeSources.mods;
        for (const k in pick.statMods) acc[k] = (acc[k] || 0) + pick.statMods[k];
        player._sourcesDirty = true;
        pushBuildLog(state, { wave: state.wave, kind: 'upgrade', id: pick.id });
        recomputeStats(state, player);
      }
      player.pendingLevelups--;
      rolledFor = -1;
      if (player.pendingLevelups > 0) {
        // Re-enter LEVELUP so the modal remounts with fresh choices.
        states.set('LEVELUP', { queued: player.pendingLevelups - 1 });
      } else {
        states.set(state.resumeAfterLevelups || 'PLAYING');
      }
    },

    getQueued() {
      const state = getState();
      const player = state && state.players[0];
      return player ? Math.max(0, player.pendingLevelups - 1) : 0;
    },
  };
}
