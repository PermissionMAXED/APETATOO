// APETATO game/entities — pooled entity storage for the whole simulation.
//
// One factory (makeEntity) builds a fully-shaped entity carrying every field
// any kind ('enemy' | 'projectile' | 'pickup' | 'companion') will ever need,
// so the hidden class never changes and hot loops stay monomorphic.
//
// Each store exposes BOTH the pool (acquire/release/forEachActive) and the
// dense `all` array of every entity ever constructed — `all` is what the
// renderer iterates (inactive entries are skipped via `active === false`).

import { createPool } from '../core/pool.js';
import { CONFIG } from '../core/config.js';

/** Fixed per-entity status slots (see statuses.js). */
export const STATUS_SLOTS = 8;
/** Fixed per-projectile pierce/hit memory size. */
export const HIT_MEMORY = 24;

let nextId = 1;

function makeStatusSlot() {
  return { active: false, type: '', dps: 0, left: 0, duration: 0, stacks: 1, tickAcc: 0, slowPct: 0 };
}

/**
 * Build one entity. Every field is created up-front (pools never reshape
 * objects afterwards).
 */
export function makeEntity(kind) {
  const statuses = new Array(STATUS_SLOTS);
  for (let i = 0; i < STATUS_SLOTS; i++) statuses[i] = makeStatusSlot();
  return {
    // --- contract core -------------------------------------------------
    id: 0,
    kind,
    active: false,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    radius: 0.4,
    facing: 0,
    hp: 0,
    maxHp: 0,
    def: null,
    elite: null,
    statuses,
    age: 0,
    ttl: 0,
    hitFlash: 0,
    instanceSlot: -1,
    archetype: '',
    // --- projectile ------------------------------------------------------
    damage: 0,
    pierce: 0,
    owner: null, // firing player (player-side) or enemy entity (enemy-side)
    homing: false,
    chainLeft: 0,
    weaponRef: null, // WeaponInstance for damage pipeline / dpsLog
    // --- pickup ------------------------------------------------------------
    ptype: '', // pickup: 'xp'|'coin'|'crate'|'heal'; projectile: behavior key
    value: 0,
    // --- companion ----------------------------------------------------------
    ai: '', // 'pet' | 'turret' | 'buddy'
    weaponInst: null,
    ownerPlayer: null,
    // --- shared sim scratch (never read by the renderer) --------------------
    speed: 0, // scaled units/sec (enemies) or projectile speed
    dmg: 0, // scaled contact damage (enemies)
    xpValue: 0,
    attackCd: 0, // contact-attack gate (enemies) / hit gate (pets, orbiters)
    fireCd: 0, // ranged-attack gate (enemies, turrets)
    aiState: 0,
    aiTimer: 0,
    aiX: 0, // generic AI vector / lobbed target / boomerang origin
    aiZ: 0,
    shieldHp: 0, // shielder-granted absorb
    frenzyT: 0, // totem aura time left
    slowMult: 1, // cached status speed multiplier (statuses.js)
    isBoss: false,
    bossTotem: false,
    dead: false,
    spin: false, // renderer hint (spinning projectiles)
    mult: 1, // projectile damage multiplier (chain falloff, chaos jitter)
    turnRate: 0, // homing
    rangeLeft: 0, // projectile travel budget
    expRadius: 0, // lobbed/mine explosion radius (pre-scaled)
    phase: 0, // boomerang out/return, mine armed, etc.
    hitMemory: new Int32Array(HIT_MEMORY),
    hitMemCount: 0,
    eliteT0: 0, // elite interval-effect timers
    eliteT1: 0,
    targetId: 0,
    _target: null,
    _pooled: true,
  };
}

/** Reset an entity to a blank slate and stamp a fresh unique id. */
export function resetEntity(e) {
  e.id = nextId++;
  e.x = 0;
  e.z = 0;
  e.vx = 0;
  e.vz = 0;
  e.radius = 0.4;
  e.facing = 0;
  e.hp = 0;
  e.maxHp = 0;
  e.def = null;
  e.elite = null;
  e.age = 0;
  e.ttl = 0;
  e.hitFlash = 0;
  e.instanceSlot = -1;
  e.archetype = '';
  e.damage = 0;
  e.pierce = 0;
  e.owner = null;
  e.homing = false;
  e.chainLeft = 0;
  e.weaponRef = null;
  e.ptype = '';
  e.value = 0;
  e.ai = '';
  e.weaponInst = null;
  e.ownerPlayer = null;
  e.speed = 0;
  e.dmg = 0;
  e.xpValue = 0;
  e.attackCd = 0;
  e.fireCd = 0;
  e.aiState = 0;
  e.aiTimer = 0;
  e.aiX = 0;
  e.aiZ = 0;
  e.shieldHp = 0;
  e.frenzyT = 0;
  e.slowMult = 1;
  e.isBoss = false;
  e.bossTotem = false;
  e.dead = false;
  e.spin = false;
  e.mult = 1;
  e.turnRate = 0;
  e.rangeLeft = 0;
  e.expRadius = 0;
  e.phase = 0;
  e.hitMemCount = 0;
  e.eliteT0 = 0;
  e.eliteT1 = 0;
  e.targetId = 0;
  e._target = null;
  for (let i = 0; i < STATUS_SLOTS; i++) {
    const s = e.statuses[i];
    s.active = false;
    s.left = 0;
    s.stacks = 1;
    s.tickAcc = 0;
  }
  return e;
}

function makeStore(kind, size) {
  const all = [];
  const pool = createPool(() => {
    const e = makeEntity(kind);
    all.push(e);
    return e;
  }, size);
  return { kind, pool, all };
}

/**
 * Build all entity stores once per createGame(). Sizes come from CONFIG.POOL
 * (player + enemy projectiles share one store so the renderer gets a single
 * `state.projectiles` list).
 */
export function createStores() {
  const P = CONFIG.POOL || {};
  return {
    enemies: makeStore('enemy', P.enemies || 512),
    projectiles: makeStore('projectile', (P.playerProjectiles || 1024) + (P.enemyProjectiles || 256)),
    pickups: makeStore('pickup', P.pickups || 512),
    companions: makeStore('companion', 24),
  };
}

/** Acquire + reset, or null when the pool is exhausted (caller must handle). */
export function acquire(store) {
  const e = store.pool.acquire();
  if (e) resetEntity(e);
  return e;
}

/** Release back to the pool (safe on double-release). */
export function release(store, e) {
  store.pool.release(e);
}

/** Record an id in a projectile's hit memory (no-op when full). */
export function rememberHit(proj, id) {
  if (proj.hitMemCount < HIT_MEMORY) proj.hitMemory[proj.hitMemCount++] = id;
}

/** Has this projectile already hit entity `id`? */
export function hasHit(proj, id) {
  const mem = proj.hitMemory;
  for (let i = 0; i < proj.hitMemCount; i++) {
    if (mem[i] === id) return true;
  }
  return false;
}
