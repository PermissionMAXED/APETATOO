// APETATO game/synergy — weapon-class set bonuses.
//
// Count each weapon once per class it carries (def.classes). Thresholds
// 2 / 4 / 6 map to SYNERGIES[classId].bonuses tiers: statMods become a stat
// source on the player (player._synSources) and `effects` register with the
// effect interpreter ('syn:<classId>'). 'synergy:tier' { classId, tier }
// fires on every tier change; stats are recomputed by the caller
// (weapons.addWeapon / removeWeaponAt call updateSynergies before their own
// recomputeStats, so one recompute covers both).

import { Content } from '../content/registry.js';
import { registerOwner, unregisterOwner } from './effects.js';

const TIER_EV = { classId: '', tier: 0, count: 0 };
const COUNTS = new Map(); // classId -> live count (reused scratch)

function tierFor(count) {
  if (count >= 6) return 6;
  if (count >= 4) return 4;
  if (count >= 2) return 2;
  return 0;
}

/**
 * Recount weapon classes and (de)apply synergy bonuses for the player.
 * Call after any weapon add/remove/merge. Does NOT recompute stats itself.
 */
export function updateSynergies(state, player) {
  COUNTS.clear();
  const weapons = player.weapons;
  for (let i = 0; i < weapons.length; i++) {
    const classes = weapons[i].def.classes;
    if (!Array.isArray(classes)) continue;
    for (let c = 0; c < classes.length; c++) {
      COUNTS.set(classes[c], (COUNTS.get(classes[c]) || 0) + 1);
    }
  }

  const synergies = Content.synergies;
  for (let i = 0; i < synergies.length; i++) {
    const syn = synergies[i];
    const classId = syn.classId;
    const count = COUNTS.get(classId) || 0;
    const tier = tierFor(count);
    const prev = player._synTiers.get(classId) || 0;
    if (tier === prev) continue;

    // Tear down the previous tier.
    if (prev > 0) {
      player._synSources.delete(classId);
      unregisterOwner('syn:' + classId);
    }
    // Apply the new one.
    if (tier > 0) {
      const bonus = (syn.bonuses && syn.bonuses[tier]) || null;
      if (bonus) {
        if (bonus.statMods) player._synSources.set(classId, { mods: bonus.statMods });
        if (Array.isArray(bonus.effects) && bonus.effects.length > 0) {
          registerOwner(player, 'syn:' + classId, bonus.effects);
        }
      }
    }
    player._synTiers.set(classId, tier);
    player._sourcesDirty = true;

    TIER_EV.classId = classId;
    TIER_EV.tier = tier;
    TIER_EV.count = count;
    state.bus.emit('synergy:tier', TIER_EV);
  }
}

/** Live tier for a class (HUD/debug convenience). */
export function synergyTier(player, classId) {
  return player._synTiers.get(classId) || 0;
}
