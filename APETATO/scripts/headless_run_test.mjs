// APETATO headless full-run test (dev tool, not shipped).
// Drives createGame() through a complete CLASSIC run (waves 1..20) with
// stubbed bus/states/input/renderApi, auto-picking level-ups, auto-shopping,
// and steering the player away from the nearest enemy. Exits 0 on VICTORY.
//
// Usage: node scripts/headless_run_test.mjs [seed] [modeId] [characterId] [--quiet]

import { createGame } from '../src/game/run.js';

// Default seed is a known-winnable one for the built-in bot; runs are fully
// deterministic (seeded RNG + scripted play), so this is a stable regression
// gate. Other seeds may legitimately lose — it is a roguelite.
const args = process.argv.slice(2).filter((a) => a !== '--quiet');
const seedArg = args[0] || 's1';
const modeId = args[1] || 'classic';
const characterId = args[2] || 'peel_gunner';
const quiet = process.argv.includes('--quiet');

// ---------------------------------------------------------------- stubs ---

function makeBus() {
  const handlers = new Map();
  return {
    on(evt, fn) {
      let l = handlers.get(evt);
      if (!l) handlers.set(evt, (l = []));
      l.push(fn);
      return () => {
        const i = l.indexOf(fn);
        if (i !== -1) l.splice(i, 1);
      };
    },
    once(evt, fn) {
      const off = this.on(evt, (p) => {
        off();
        fn(p);
      });
      return off;
    },
    emit(evt, payload) {
      const l = handlers.get(evt);
      if (!l) return;
      for (let i = 0; i < l.length; i++) l[i](payload);
    },
  };
}

function makeStates(bus) {
  let current = 'BOOT';
  return {
    set(name, payload) {
      const from = current;
      current = name;
      bus.emit('state:change', { from, to: name, payload });
    },
    get: () => current,
    is: (n) => current === n,
    on: () => () => {},
  };
}

const intent = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, firing: true, pause: false, confirm: false, cancel: false };
const input = {
  update() {},
  getIntent: () => intent,
  setAimOrigin() {},
  setCamera() {},
};

let vfxCount = 0;
const renderApi = {
  beginRun() {},
  endRun() {},
  syncState() {},
  vfx() {
    vfxCount++;
  },
  damageNumber() {},
  shake() {},
  buildPreview: () => () => {},
};

// ------------------------------------------------------------- harness ---

const bus = makeBus();
const states = makeStates(bus);
const save = { data: { settings: {} } };

const events = new Map();
for (const evt of [
  'run:start', 'wave:start', 'wave:end', 'run:end', 'enemy:hit', 'enemy:death', 'crit',
  'player:hit', 'player:dodge', 'player:levelup', 'player:death', 'coin:gain', 'xp:gain',
  'pickup:collect', 'weapon:fire', 'explosion', 'shop:open', 'shop:buy', 'shop:reroll',
  'shop:close', 'boss:spawn', 'boss:phase', 'boss:death', 'synergy:tier', 'stats:recomputed',
  'chaos:modifier',
]) {
  bus.on(evt, () => events.set(evt, (events.get(evt) || 0) + 1));
}
bus.on('wave:start', (e) => !quiet && console.log(`  wave ${e.wave} start (dur ${e.duration.toFixed(1)}s)`));
bus.on('boss:spawn', (e) => !quiet && console.log(`  BOSS: ${e.def.name}`));
bus.on('boss:phase', (e) => !quiet && console.log(`  boss phase -> ${e.phase} (${e.pattern})`));
bus.on('chaos:modifier', (e) => !quiet && console.log(`  chaos: ${e.id}`));

const game = createGame({ bus, states, save, input, renderApi });
game.startRun({ modeId, characterId, arenaId: 'banana_grove', seed: seedArg });

const STEP = 1 / 60;
const MAX_STEPS = 60 * 60 * 45; // 45 sim-minutes hard cap
let steps = 0;
let shopVisits = 0;

function steer() {
  const s = game.getState();
  if (!s) return;
  const p = s.players[0];
  // Potential-field kiting: repulsion from every nearby threat (enemies,
  // boss, walls), perpendicular strafe against incoming projectiles, gentle
  // pull toward arena center. Ranges grow when hurt.
  const scared = p.hp < p.stats.maxHp * 0.5 ? 1.5 : 1;
  let mx = 0;
  let mz = 0;
  const repel = (x, z, weight, range) => {
    const dx = p.x - x;
    const dz = p.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 > range * range) return;
    const d = Math.sqrt(d2) || 0.01;
    const f = weight / (d * d);
    mx += (dx / d) * f;
    mz += (dz / d) * f;
  };
  for (const e of s.enemies) {
    if (!e.active || e.dead) continue;
    repel(e.x, e.z, 1.2, 10 * scared);
  }
  // Incoming projectiles: strafe PERPENDICULAR to their path. This OVERRIDES
  // the flee field — running radially away from a shooter keeps you exactly
  // in the line of fire.
  let dodgeX = 0;
  let dodgeZ = 0;
  for (const pr of s.projectiles) {
    if (!pr.active || pr.owner === p) continue;
    const ox = p.x - pr.x;
    const oz = p.z - pr.z;
    const od = Math.hypot(ox, oz);
    if (od > 8) continue;
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    const towardness = (pr.vx * ox + pr.vz * oz) / (sp * od || 1);
    if (towardness < 0.65) continue;
    const cross = pr.vx * oz - pr.vz * ox;
    const side = cross >= 0 ? 1 : -1;
    const f = 4 / Math.max(1, od);
    dodgeX += (-pr.vz / sp) * side * f;
    dodgeZ += (pr.vx / sp) * side * f;
  }
  if (s.boss && s.boss.ent && s.boss.ent.active) repel(s.boss.ent.x, s.boss.ent.z, 8, 14);
  // Wall repulsion so kiting never corners us.
  const hw = s.arenaW / 2;
  const hh = s.arenaH / 2;
  repel(hw + 1, p.z, 4, 6);
  repel(-hw - 1, p.z, 4, 6);
  repel(p.x, hh + 1, 4, 6);
  repel(p.x, -hh - 1, 4, 6);
  // Center pull keeps us mobile; stronger when nothing is chasing.
  const idle = mx === 0 && mz === 0;
  mx += -p.x / (idle ? 15 : 60);
  mz += -p.z / (idle ? 15 : 60);
  // Dodge overrides: if a projectile is bearing down, strafing wins.
  const dm = Math.hypot(dodgeX, dodgeZ);
  if (dm > 0.5) {
    mx = mx * 0.3 + (dodgeX / dm) * 1.0;
    mz = mz * 0.3 + (dodgeZ / dm) * 1.0;
  }
  const m = Math.hypot(mx, mz) || 1;
  intent.moveX = mx / m;
  intent.moveZ = mz / m;
}

// Adaptive stat scoring: damage stats are weighted by what the current
// arsenal actually scales with; regen is top priority until sustain exists.
const scoreScratch = {};

function statScore() {
  const s = game.getState();
  const p = s.players[0];
  const SC = scoreScratch;
  for (const k in SC) delete SC[k];
  // Damage stats: sum of weapon scaling coefficients across the arsenal.
  for (const w of p.weapons) {
    const sc = (w.def && w.def.scaling) || {};
    for (const k in sc) SC[k] = (SC[k] || 0) + sc[k] * 3;
  }
  SC.damagePct = (SC.damagePct || 0) + 4;
  SC.attackSpeed = 3.5;
  SC.critChance = 1.5;
  SC.critDamage = 0.8;
  // Sustain: regen wins every roll until we have some, then tapers off.
  SC.hpRegen = p.stats.hpRegen < 4 ? 15 : 3;
  SC.lifesteal = 5;
  SC.maxHp = 3.5;
  SC.dodge = 3;
  SC.armor = 3;
  SC.speed = 2.5;
  SC.luck = 1.5;
  SC.coinGain = 1.5;
  SC.harvesting = 2;
  SC.xpGain = 1.5;
  SC.pickupRange = 1;
  SC.shieldMax = 2;
  return SC;
}

function pickLevelup() {
  const choices = game.levelup.getChoices();
  const SC = statScore();
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < choices.length; i++) {
    const mods = (choices[i] && choices[i].statMods) || {};
    let score = 0;
    for (const k in mods) score += (SC[k] || 0.25) * mods[k];
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (!quiet && choices[bestIdx]) console.log(`  levelup pick: ${choices[bestIdx].id}`);
  game.levelup.choose(bestIdx);
}

function scoreSlot(slot, weaponsOwned, SC) {
  if (!slot || slot.sold || !slot.def) return -Infinity;
  let score = 0;
  if (slot.kind === 'weapon') {
    // A new weapon roughly multiplies DPS by (n+1)/n — enormous early.
    score = weaponsOwned < 3 ? 80 : weaponsOwned < 6 ? 40 : 20;
  } else {
    const mods = slot.def.statMods || {};
    for (const k in mods) score += (SC[k] || 0.25) * mods[k];
  }
  return score / Math.max(1, slot.price);
}

function handleShop() {
  shopVisits++;
  const s = game.getState();
  const p = s.players[0];
  // Value shopping: repeatedly buy the best score-per-coin affordable slot.
  // Reroll only when rich — early coins are precious.
  for (let guard = 0; guard < 24; guard++) {
    const SC = statScore();
    const stock = game.shop.getStock();
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < stock.length; i++) {
      const slot = stock[i];
      if (!slot || slot.sold || !slot.def || s.coins < slot.price) continue;
      const sc = scoreSlot(slot, p.weapons.length, SC);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      if (s.coins >= 80 && s.coins >= game.shop.getRerollCost() + 60 && guard < 20) {
        game.shop.reroll();
        continue;
      }
      break;
    }
    game.shop.buy(bestIdx);
  }
  // Exercise lock + sell once mid-run.
  if (shopVisits === 3) {
    game.shop.toggleLock(0);
    if (p.itemsOrder.length > 2) game.shop.sell('item', p.itemsOrder.length - 1);
  }
  game.shop.close();
}

// Endless never reaches VICTORY: pass once we clearly outlive the classic run.
const endlessMode = !!game.getState().modeRules.endless;
const ENDLESS_TARGET_WAVE = 25;
let endlessPass = false;

while (steps < MAX_STEPS) {
  const st = states.get();
  if (endlessMode && game.getState() && game.getState().wave >= ENDLESS_TARGET_WAVE) {
    endlessPass = true;
    break;
  }
  if (st === 'PLAYING') {
    steer();
    game.update(STEP);
    steps++;
  } else if (st === 'LEVELUP') {
    pickLevelup();
  } else if (st === 'SHOP') {
    handleShop();
  } else if (st === 'VICTORY' || st === 'GAME_OVER') {
    break;
  } else {
    console.error(`unexpected state '${st}' — aborting`);
    process.exit(2);
  }
}

const s = game.getState();
const final = states.get();
console.log('\n=== RESULT ===');
console.log(`state: ${final}  wave: ${s.wave}  sim-time: ${s.timeSec.toFixed(1)}s  steps: ${steps}`);
console.log(
  `kills: ${s.runStats.kills}  dmgDealt: ${Math.round(s.runStats.damageDealt)}  ` +
    `dmgTaken: ${Math.round(s.runStats.damageTaken)}  coins earned: ${s.runStats.coinsEarned}  ` +
    `elites: ${s.runStats.elitesKilled}  bosses: ${s.runStats.bossesKilled}`
);
const p = s.players[0];
console.log(`player: lvl ${p.level}  hp ${p.hp}/${p.stats.maxHp}  weapons ${p.weapons.length}  items ${p.items.size}`);
console.log(`dpsLog: ${[...s.runStats.dpsLog.entries()].map(([k, v]) => `${k}:${Math.round(v)}`).join(' ')}`);
console.log(`events: ${[...events.entries()].map(([k, v]) => `${k}=${v}`).join(' ')}`);
console.log(`vfx calls: ${vfxCount}`);

if (endlessPass) {
  console.log(`\nPASS: endless run survived to wave ${s.wave}`);
} else if (final !== 'VICTORY') {
  console.error(`\nRESULT: expected VICTORY, got ${final} (roguelite loss — may be bot skill, not a sim bug)`);
  process.exit(1);
} else {
  console.log(`\nPASS: full ${modeId} run start -> victory`);
}
