// APETATO game/run — createGame(): the whole simulation behind one API.
//
// export createGame({ bus, states, save, input, renderApi }) -> game = {
//   update(dt)            fixed step (engine calls only while PLAYING)
//   render(alpha, frameDt) per rAF: input.update() + renderApi.syncState()
//   startRun({ modeId, characterId, arenaId, seed, customRules })
//   getState()            live GameState (read-only for UI)
//   shop: { getStock, buy, sell, reroll, toggleLock, close, getRerollCost }
//   levelup: { getChoices, choose, getQueued }
//   togglePause(), abandonRun()
// }
//
// Fixed-step order (contract): input intents -> player move -> companions ->
// enemyAI (+boss) -> spatial hash rebuild -> weapons -> projectiles ->
// contact damage -> statuses -> hazards -> pickups -> effect intervals ->
// spawner -> pool cleanup -> wave clock.
//
// Wave flow: waveDuration = min(60, 18 + wave*1.6). Wave 10 adds the arena
// miniboss alongside trash; the final wave (modeRules.waves) is the arena
// boss (phase 'boss', ends on boss death -> victory). Endless keeps going
// with a rotating boss every 5 waves past the final. Wave end converts
// leftover trash to XP, vacuums pickups, pays floor(harvesting) coins, then
// queued LEVELUPs, then SHOP (when the mode allows), then the next wave.

import { makeRng } from '../core/rng.js';
import { Content } from '../content/registry.js';
import { resolveRules, rollChaosModifier } from '../meta/modesLogic.js';
import { createStores, release } from './entities.js';
import { createSpatialHash } from './collision.js';
import { createPlayer, movePlayer, tickPlayer, addBuff } from './player.js';
import { updateWeapons, addWeapon } from './weapons.js';
import { updateProjectiles, clearProjectiles } from './projectiles.js';
import { updateEnemyAI, contactDamage } from './enemyAI.js';
import { tickStatuses, tickPlayerStatuses } from './statuses.js';
import { updateHazards, initHazards } from './hazards.js';
import {
  updatePickups,
  collectAllPickups,
  spawnXpOrb,
  gainCoins,
  tickBananaRain,
  clearPickups,
} from './pickups.js';
import { updateEffects, fireTriggerFast, resetEffects } from './effects.js';
import {
  createSpawnerState,
  startWaveSpawning,
  stopWaveSpawning,
  updateSpawner,
  computeEnemyScale,
} from './spawner.js';
import { spawnBoss, updateBoss } from './bosses.js';
import { updateCompanions, clearCompanions } from './companions.js';
import { createLevelupApi, xpNeeded } from './levelup.js';
import {
  createShopState,
  openShop,
  getStock,
  buy,
  sell,
  reroll,
  toggleLock,
  closeShop,
  currentRerollCost,
} from './shoplogic.js';

const WAVE_START_EV = { wave: 0, duration: 0 };
const WAVE_END_EV = { wave: 0 };

export function createGame({ bus, states, save, input, renderApi }) {
  /** @type {object|null} live GameState */
  let state = null;

  // Dev-only content integrity check (warns, never throws).
  if (typeof Content.validate === 'function') {
    try {
      if (import.meta.env && import.meta.env.DEV) Content.validate();
    } catch (err) {
      console.warn('[run] content validate failed:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Run construction
  // ---------------------------------------------------------------------

  function buildState({ modeId, modeRules, seed, character, arena }) {
    const stores = createStores();
    const s = {
      // --- contract shape --------------------------------------------------
      modeId,
      modeRules,
      seed,
      rng: makeRng(seed),
      arena,
      wave: 0,
      waveTime: 0,
      waveDuration: 0,
      phase: 'combat',
      coins: modeRules.startCoins || 0,
      players: [],
      enemies: stores.enemies.all,
      projectiles: stores.projectiles.all,
      pickups: stores.pickups.all,
      companions: stores.companions.all,
      boss: null,
      hazardsState: null,
      runStats: {
        kills: 0,
        damageDealt: 0,
        damageTaken: 0,
        coinsEarned: 0,
        elitesKilled: 0,
        bossesKilled: 0,
        timeSec: 0,
        dpsLog: new Map(),
        buildLog: [],
      },
      speedrunSec: 0,
      paused: false,
      over: false,
      victory: false,
      // --- sim internals -----------------------------------------------------
      bus,
      renderApi,
      input,
      stores,
      hash: createSpatialHash(2.0),
      arenaW: (arena.size && arena.size.w) || 44,
      arenaH: (arena.size && arena.size.h) || 28,
      arenaObstacles: arena.obstacles || [],
      spawner: createSpawnerState(),
      shop: createShopState(),
      enemyScale: { hp: 1, dmg: 1, spd: 1 },
      chaosMod: null,
      timeSec: 0,
      bossJustDied: false,
      resumeAfterLevelups: 'PLAYING',
      _rainAcc: 0,
    };
    return s;
  }

  /** Flatten an ArenaDef into the shape renderApi.beginRun expects. */
  function renderArenaDef(arena) {
    const obstacles = [];
    const src = arena.obstacles || [];
    for (let i = 0; i < src.length; i++) {
      const o = src[i];
      obstacles.push({ type: o.model || 'rock', x: o.x, z: o.z, r: o.r });
    }
    return {
      w: (arena.size && arena.size.w) || 44,
      h: (arena.size && arena.size.h) || 28,
      groundColor: arena.groundColor,
      wallColor: arena.wallColor,
      theme: arena.music,
      propDensity: arena.propDensity,
      seed: arena.id,
      obstacles,
      hazards: arena.hazards || [],
    };
  }

  function startRun(opts) {
    const cfg = opts || {};
    const modeId = cfg.modeId || 'classic';
    const modeRules = resolveRules(modeId, cfg.customRules);
    const seed =
      cfg.seed !== undefined && cfg.seed !== null && cfg.seed !== ''
        ? cfg.seed
        : ((Math.random() * 0xffffffff) >>> 0);

    const character =
      Content.byId.characters.get(cfg.characterId) || Content.characters[0] || { id: 'ape', statMods: {} };
    const arena = Content.byId.arenas.get(cfg.arenaId) || Content.arenas[0] || {
      id: 'fallback',
      size: { w: 44, h: 28 },
      obstacles: [],
      hazards: [],
      enemyPool: [],
      modifiers: { enemySpeedMult: 1, spawnBudgetMult: 1 },
    };

    resetEffects();
    state = buildState({ modeId, modeRules, seed, character, arena });
    state.hazardsState = initHazards(state);

    const player = createPlayer(state, 0, character);
    state.players.push(player);
    player.xpNext = xpNeeded(player.level);

    // Starting weapon (free — sells for 70% of its base price).
    const startWeapon = Content.byId.weapons.get(character.startingWeaponId) || Content.weapons[0];
    if (startWeapon) addWeapon(state, player, startWeapon);

    renderApi.beginRun(renderArenaDef(arena));
    bus.emit('run:start', { modeId, character, seed, arena });

    beginWave(1);
    states.set('PLAYING');
  }

  // ---------------------------------------------------------------------
  // Wave flow
  // ---------------------------------------------------------------------

  function rollChaosForWave() {
    if (!state.modeRules.chaosWaveModifiers) {
      state.chaosMod = null;
      return;
    }
    const mod = rollChaosModifier(state.rng, state.wave);
    state.chaosMod = mod.apply || null;
    bus.emit('chaos:modifier', {
      id: mod.id,
      name: mod.name,
      description: mod.description,
      wave: state.wave,
    });
    // Player stat deltas last for the whole wave.
    if (mod.apply && mod.apply.playerStatMods) {
      const mods = mod.apply.playerStatMods;
      for (const k in mods) addBuff(state, state.players[0], k, mods[k], state.waveDuration);
    }
  }

  function pickEndlessBoss() {
    const bosses = Content.bosses;
    if (!bosses || bosses.length === 0) return null;
    const idx = (state.wave / 5) | 0;
    return bosses[idx % bosses.length];
  }

  function beginWave(waveNum) {
    state.wave = waveNum;
    state.waveTime = 0;
    state.waveDuration = Math.min(60, 18 + waveNum * 1.6);
    state.phase = 'combat';
    state.bossJustDied = false;
    state.boss = null;
    computeEnemyScale(state);
    rollChaosForWave();

    const rules = state.modeRules;
    const finalWave = rules.waves || 20;

    if (rules.bossRush) {
      // Every wave is a boss, no trash.
      state.phase = 'boss';
      const def = state.rng.pick(Content.bosses) || null;
      state.boss = spawnBoss(state, def, false);
      stopWaveSpawning(state);
    } else if (waveNum === finalWave || (rules.endless && waveNum > finalWave && waveNum % 5 === 0)) {
      // Final wave (arena boss) / endless rotating boss every 5 waves.
      state.phase = 'boss';
      const def =
        waveNum === finalWave
          ? Content.byId.bosses.get(state.arena.bossId) || Content.bosses[0]
          : pickEndlessBoss();
      state.boss = spawnBoss(state, def, false);
      startWaveSpawning(state); // light trash keeps the pressure up
    } else {
      startWaveSpawning(state);
      if (waveNum === 10) {
        // Miniboss cameo alongside the trash (does not gate the wave).
        const mini = Content.byId.bosses.get(state.arena.minibossId);
        if (mini) state.boss = spawnBoss(state, mini, true);
      }
    }

    WAVE_START_EV.wave = waveNum;
    WAVE_START_EV.duration = state.waveDuration;
    bus.emit('wave:start', WAVE_START_EV);
    const player = state.players[0];
    if (player && player.alive) fireTriggerFast('onWaveStart', player, state, null, 0, null);
  }

  function convertTrashToXp() {
    const all = state.stores.enemies.all;
    for (let i = 0; i < all.length; i++) {
      const ent = all[i];
      if (!ent.active || ent.dead) continue;
      ent.dead = true;
      spawnXpOrb(state, ent.x, ent.z, ent.xpValue || 1);
      release(state.stores.enemies, ent);
    }
    // A surviving miniboss leaves as one fat orb.
    if (state.boss && state.boss.ent.active && !state.boss.ent.dead) {
      const ent = state.boss.ent;
      ent.dead = true;
      ent.active = false;
      spawnXpOrb(state, ent.x, ent.z, ent.xpValue || 20);
      bus.emit('boss:death', { ent });
    }
    state.boss = null;
  }

  function endWave() {
    stopWaveSpawning(state);
    convertTrashToXp();
    clearProjectiles(state);
    const player = state.players[0];
    collectAllPickups(state);

    // Harvest payout.
    const harvest = Math.floor((player && player.stats.harvesting) || 0);
    if (harvest > 0) gainCoins(state, harvest, player.x, player.z);

    WAVE_END_EV.wave = state.wave;
    bus.emit('wave:end', WAVE_END_EV);
    if (player && player.alive) fireTriggerFast('onWaveEnd', player, state, null, 0, null);

    const rules = state.modeRules;
    const finalWave = rules.waves || 20;
    const finishedFinal = state.phase === 'boss' && state.wave >= finalWave && !rules.endless;
    if (finishedFinal) {
      endRun(true);
      return;
    }

    state.phase = 'intermission';
    const shopEnabled = rules.shop !== false;

    if (shopEnabled) {
      openShop(state);
      if (player) fireTriggerFast('onShopEnter', player, state, null, 0, null);
      if (player && player.pendingLevelups > 0) {
        state.resumeAfterLevelups = 'SHOP';
        states.set('LEVELUP', { queued: player.pendingLevelups - 1 });
      } else {
        states.set('SHOP');
      }
    } else {
      // No shop: line the next wave up first so LEVELUP can resume into it.
      beginWave(state.wave + 1);
      if (player && player.pendingLevelups > 0) {
        state.resumeAfterLevelups = 'PLAYING';
        states.set('LEVELUP', { queued: player.pendingLevelups - 1 });
      } else {
        states.set('PLAYING');
      }
    }
  }

  function shopClose() {
    if (!state || state.over) return;
    closeShop(state);
    const player = state.players[0];
    if (player && player.pendingLevelups > 0) {
      // Levelups earned from shop purchases (xp items) queue here too.
      state.resumeAfterLevelups = 'SHOP';
      states.set('LEVELUP', { queued: player.pendingLevelups - 1 });
      return;
    }
    beginWave(state.wave + 1);
    states.set('PLAYING');
  }

  function endRun(victory) {
    if (!state || state.over) return;
    state.over = true;
    state.victory = !!victory;
    stopWaveSpawning(state);
    bus.emit('run:end', { victory: state.victory, runStats: state.runStats, wave: state.wave });
    states.set(victory ? 'VICTORY' : 'GAME_OVER');
  }

  bus.on('player:death', () => {
    if (state && !state.over) endRun(false);
  });

  // ---------------------------------------------------------------------
  // Fixed-step update (contract order)
  // ---------------------------------------------------------------------

  function update(dt) {
    if (!state || state.over || state.paused) return;
    const s = state;
    s.timeSec += dt;
    s.speedrunSec += dt;
    s.runStats.timeSec = s.timeSec;
    s.waveTime += dt;

    const player = s.players[0];

    // 1. input intents -> player movement + timers.
    const intent = input.getIntent(0);
    if (typeof input.setAimOrigin === 'function' && player) {
      input.setAimOrigin(player.x, player.z);
    }
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const it = input.getIntent(i);
      movePlayer(s, p, it || intent, dt);
      tickPlayer(s, p, dt);
    }

    // 2. companions.
    updateCompanions(s, dt);

    // 3. enemy AI (+ boss patterns).
    updateEnemyAI(s, dt);
    if (s.boss) updateBoss(s, dt);

    // 4. spatial hash rebuild (enemies + boss; queried by everything after).
    const hash = s.hash;
    hash.clear();
    const enemies = s.stores.enemies.all;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.active && !e.dead) hash.insert(e);
    }
    if (s.boss && s.boss.ent.active && !s.boss.ent.dead) hash.insert(s.boss.ent);

    // 5. weapons (auto-aim + fire + continuous behaviors).
    updateWeapons(s, dt);

    // 6. projectiles (move, home, chain, hit).
    updateProjectiles(s, dt);

    // 7. contact damage (attack.cooldown gated).
    contactDamage(s, dt);

    // 8. statuses.
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.active && !e.dead) tickStatuses(s, e, dt);
    }
    if (s.boss && s.boss.ent.active && !s.boss.ent.dead) tickStatuses(s, s.boss.ent, dt);
    for (let i = 0; i < s.players.length; i++) {
      if (s.players[i].alive) tickPlayerStatuses(s, s.players[i], dt);
    }

    // 9. hazards.
    updateHazards(s, dt);

    // 10. pickups (magnet + collect) and banana rain.
    updatePickups(s, dt);
    if (s.modeRules.bananaRain || (s.chaosMod && s.chaosMod.bananaRain)) {
      tickBananaRain(s, dt);
    }

    // 11. effect interval triggers.
    updateEffects(s, dt);

    // 12. spawner (packet trickle + telegraphed spawns).
    updateSpawner(s, dt);

    // 13. pool cleanup: sweep anything that slipped past inline releases.
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.active && e.hp <= 0 && !e.dead) {
        e.dead = true;
        release(s.stores.enemies, e);
      }
    }

    if (s.over) return; // player died mid-step

    // 14. wave clock / boss death.
    if (s.phase === 'boss') {
      if (s.bossJustDied) {
        s.bossJustDied = false;
        s.boss = null;
        endWave();
      }
    } else {
      if (s.bossJustDied) {
        // Miniboss down — the wave keeps running.
        s.bossJustDied = false;
        s.boss = null;
      }
      if (s.waveTime >= s.waveDuration) endWave();
    }
    // Level-ups earned mid-wave stay queued until the wave ends (endWave
    // routes through LEVELUP before SHOP / the next wave).
  }

  // ---------------------------------------------------------------------
  // Per-frame render hook
  // ---------------------------------------------------------------------

  function render(alpha, frameDt) {
    input.update();
    // Pause edge (keyboard Esc / pad start) toggles in and out.
    const it = input.getIntent(0);
    if (it && it.pause) {
      if (states.is('PLAYING') || states.is('PAUSED')) togglePause();
    }
    if (state) renderApi.syncState(state);
  }

  // ---------------------------------------------------------------------
  // Pause / abandon
  // ---------------------------------------------------------------------

  function togglePause() {
    if (!state || state.over) return;
    if (states.is('PLAYING')) {
      state.paused = true;
      states.set('PAUSED');
    } else if (states.is('PAUSED')) {
      state.paused = false;
      states.set('PLAYING');
    }
  }

  function abandonRun() {
    if (!state) {
      states.set('MENU');
      return;
    }
    if (!state.over) {
      state.over = true;
      state.victory = false;
      stopWaveSpawning(state);
      bus.emit('run:end', {
        victory: false,
        runStats: state.runStats,
        wave: state.wave,
        abandoned: true,
      });
    }
    clearProjectiles(state);
    clearPickups(state);
    clearCompanions(state);
    renderApi.endRun();
    state = null; // stop syncState from resurrecting run visuals in MENU
    states.set('MENU');
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  const levelup = createLevelupApi(() => state, states);

  const game = {
    update,
    render,
    startRun,
    getState() {
      return state;
    },
    shop: {
      getStock: () => (state ? getStock(state) : []),
      buy: (slotIdx) => (state ? buy(state, slotIdx) : false),
      sell: (kind, idx) => (state ? sell(state, kind, idx) : false),
      reroll: () => (state ? reroll(state) : false),
      toggleLock: (slotIdx) => (state ? toggleLock(state, slotIdx) : false),
      close: shopClose,
      getRerollCost: () => (state ? currentRerollCost(state) : 0),
    },
    levelup,
    togglePause,
    abandonRun,
  };

  return game;
}
