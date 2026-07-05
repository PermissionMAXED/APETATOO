// APETATO content registry — the single aggregation point for all game data.
// Static imports (paths are part of the package contract). Everything is
// re-exported through the frozen `Content` object with id->def Maps so game
// systems never touch the raw content files directly.
//
// Defensive by design: every list defaults to [] and validate() only WARNS
// (dev only) so a broken or missing content entry can never brick the game.

import { CHARACTERS } from './characters/index.js';
import { WEAPONS } from './weapons/index.js';
import { ITEMS } from './items/index.js';
import { ENEMIES, ELITE_MODS } from './enemies/index.js';
import { BOSSES } from './enemies/bosses.js';
import { ARENAS } from './arenas/index.js';
import { SYNERGIES } from './synergies.js';
import { UPGRADES } from './upgrades.js';
import { MODES } from './modes.js';

/** Coerce anything that isn't an array into an empty array. */
function arr(a) {
  return Array.isArray(a) ? a : [];
}

/** Build a Map keyed on `key` (skipping malformed entries). */
function toMap(list, key = 'id') {
  const m = new Map();
  for (const it of arr(list)) {
    if (it && typeof it[key] === 'string') m.set(it[key], it);
  }
  return m;
}

const characters = arr(CHARACTERS);
const weapons = arr(WEAPONS);
const items = arr(ITEMS);
const enemies = arr(ENEMIES);
const eliteMods = arr(ELITE_MODS);
const bosses = arr(BOSSES);
const arenas = arr(ARENAS);
const synergies = arr(SYNERGIES);
const upgrades = arr(UPGRADES);
const modes = arr(MODES);

const byId = {
  characters: toMap(characters),
  weapons: toMap(weapons),
  items: toMap(items),
  enemies: toMap(enemies),
  bosses: toMap(bosses),
  arenas: toMap(arenas),
  eliteMods: toMap(eliteMods),
  synergies: toMap(synergies, 'classId'),
  upgrades: toMap(upgrades),
  modes: toMap(modes),
};

/**
 * Cross-reference integrity check. Warns on dangling ids; never throws.
 * Intended for dev builds only. Returns the number of problems found.
 */
function validate() {
  let problems = 0;
  const warn = (msg) => {
    problems++;
    console.warn(`[registry] ${msg}`);
  };

  for (const c of characters) {
    if (!byId.weapons.has(c.startingWeaponId)) {
      warn(`character '${c.id}': startingWeaponId '${c.startingWeaponId}' not in WEAPONS`);
    }
  }
  for (const a of arenas) {
    for (const p of arr(a.enemyPool)) {
      if (!byId.enemies.has(p.id)) warn(`arena '${a.id}': enemyPool id '${p.id}' not in ENEMIES`);
    }
    if (a.bossId && !byId.bosses.has(a.bossId)) warn(`arena '${a.id}': bossId '${a.bossId}' not in BOSSES`);
    if (a.minibossId && !byId.bosses.has(a.minibossId)) {
      warn(`arena '${a.id}': minibossId '${a.minibossId}' not in BOSSES`);
    }
  }
  for (const e of enemies) {
    if (e.behavior === 'splitter' && e.behaviorParams && !byId.enemies.has(e.behaviorParams.splitInto)) {
      warn(`enemy '${e.id}': splitInto '${e.behaviorParams.splitInto}' not in ENEMIES`);
    }
  }
  for (const b of bosses) {
    for (const ph of arr(b.phases)) {
      if (ph.pattern === 'summon_adds' && ph.params && !byId.enemies.has(ph.params.addId)) {
        warn(`boss '${b.id}': summon_adds addId '${ph.params.addId}' not in ENEMIES`);
      }
    }
    if (b.behavior === 'splitter' && b.behaviorParams && !byId.enemies.has(b.behaviorParams.splitInto)) {
      warn(`boss '${b.id}': splitInto '${b.behaviorParams.splitInto}' not in ENEMIES`);
    }
  }
  for (const m of modes) {
    if (typeof m.id !== 'string') warn(`mode without a string id: ${JSON.stringify(m)}`);
  }
  if (modes.length === 0) warn('MODES is empty — game will fall back to built-in classic rules');
  if (characters.length === 0) warn('CHARACTERS is empty');
  if (weapons.length === 0) warn('WEAPONS is empty');
  if (arenas.length === 0) warn('ARENAS is empty');

  if (problems === 0) {
    console.log(
      `[registry] validate OK — ${characters.length} characters, ${weapons.length} weapons, ` +
        `${items.length} items, ${enemies.length} enemies, ${bosses.length} bosses, ` +
        `${eliteMods.length} elite mods, ${arenas.length} arenas, ${synergies.length} synergies, ` +
        `${upgrades.length} upgrades, ${modes.length} modes`
    );
  }
  return problems;
}

export const Content = Object.freeze({
  characters,
  weapons,
  items,
  enemies,
  eliteMods,
  bosses,
  arenas,
  synergies,
  upgrades,
  modes,
  byId,
  validate,
});

// Dev-only self-check (guarded so this module also loads under plain node).
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  validate();
}
