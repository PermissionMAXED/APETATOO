// APETATO game/hazards — arena hazard interpreter.
//
// Types (per ArenaDef.hazards entries):
//   lava_pool        { x, z, r, dps }           burn-style damage in a circle
//   poison_puddle    { x, z, r, dps }           poison-style damage in a circle
//   conveyor         { x, z, w, h, dirX, dirZ, speed }  pushes players (rect)
//   banana_storm     { interval, damage, radius }       random telegraphed strikes
//   collapsing_stone { interval, damage, radius }       falling debris, telegraphed
//   geyser           { x, z, r, interval, knockback }   periodic launch + knockback
//   thorn_patch      { x, z, r, dps, slowPct }          damage + slow in a circle
//   dark_zone        { x, z, r }                        aim/vision debuff zone
//
// Hazard damage BYPASSES dodge but respects armor + shield
// (combat.hazardDamagePlayer). Damage-over-area ticks at 2/s per hazard.

import { hazardDamagePlayer } from './combat.js';

const TICK_PERIOD = 0.5; // area hazards damage twice per second
const DARK_RANGE_MULT = 0.6; // weapon range multiplier inside a dark zone

/** Build per-run hazard state from the arena def. Small one-time allocs. */
export function initHazards(state) {
  const defs = (state.arena && state.arena.hazards) || [];
  const list = [];
  for (let i = 0; i < defs.length; i++) {
    const h = defs[i];
    if (!h || !h.type) continue;
    list.push({
      def: h,
      type: h.type,
      timer: (h.interval || 2) * (0.5 + 0.5 * (i % 3)), // desync periodic hazards
      tickAcc: 0,
      // pending strike (banana_storm / collapsing_stone)
      strikeArmed: false,
      strikeT: 0,
      strikeX: 0,
      strikeZ: 0,
    });
  }
  return { list };
}

function inCircle(px, pz, h) {
  const dx = px - (h.x || 0);
  const dz = pz - (h.z || 0);
  const r = h.r || 1;
  return dx * dx + dz * dz <= r * r;
}

function areaDamage(state, hz, dps, dt) {
  hz.tickAcc += dt;
  if (hz.tickAcc < TICK_PERIOD) return false;
  hz.tickAcc -= TICK_PERIOD;
  const dmg = Math.max(1, Math.round(dps * TICK_PERIOD));
  const players = state.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.alive && inCircle(p.x, p.z, hz.def)) hazardDamagePlayer(state, p, dmg);
  }
  return true;
}

const EXPL_EV = { x: 0, z: 0, radius: 0 };

function resolveStrike(state, hz, damage, radius) {
  EXPL_EV.x = hz.strikeX;
  EXPL_EV.z = hz.strikeZ;
  EXPL_EV.radius = radius;
  state.bus.emit('explosion', EXPL_EV);
  const players = state.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive) continue;
    const dx = p.x - hz.strikeX;
    const dz = p.z - hz.strikeZ;
    const rr = radius + p.radius;
    if (dx * dx + dz * dz <= rr * rr) hazardDamagePlayer(state, p, damage);
  }
}

/** Per-step hazard tick. Also refreshes player._hazardSlow / _darkMult. */
export function updateHazards(state, dt) {
  const hzState = state.hazardsState;
  if (!hzState || hzState.list.length === 0) {
    return;
  }
  const players = state.players;
  // Reset per-step hazard debuffs before re-applying.
  for (let i = 0; i < players.length; i++) {
    players[i]._hazardSlow = 0;
    players[i]._darkMult = 1;
  }

  const list = hzState.list;
  for (let i = 0; i < list.length; i++) {
    const hz = list[i];
    const def = hz.def;
    switch (hz.type) {
      case 'lava_pool':
        areaDamage(state, hz, def.dps || 8, dt);
        break;

      case 'poison_puddle':
        areaDamage(state, hz, def.dps || 4, dt);
        break;

      case 'thorn_patch': {
        areaDamage(state, hz, def.dps || 2, dt);
        for (let j = 0; j < players.length; j++) {
          const p = players[j];
          if (p.alive && inCircle(p.x, p.z, def)) {
            // Stored as a PERCENT — statuses.playerSpeedMult divides by 100.
            const slow = def.slowPct || 40;
            if (slow > p._hazardSlow) p._hazardSlow = slow;
          }
        }
        break;
      }

      case 'dark_zone': {
        for (let j = 0; j < players.length; j++) {
          const p = players[j];
          if (p.alive && inCircle(p.x, p.z, def)) p._darkMult = DARK_RANGE_MULT;
        }
        break;
      }

      case 'conveyor': {
        const hw = (def.w || 4) / 2;
        const hh = (def.h || 2) / 2;
        for (let j = 0; j < players.length; j++) {
          const p = players[j];
          if (!p.alive) continue;
          if (Math.abs(p.x - (def.x || 0)) <= hw && Math.abs(p.z - (def.z || 0)) <= hh) {
            p.x += (def.dirX || 0) * (def.speed || 3) * dt;
            p.z += (def.dirZ || 0) * (def.speed || 3) * dt;
          }
        }
        break;
      }

      case 'geyser': {
        hz.timer -= dt;
        if (hz.timer <= -0.6) {
          // Eruption resolved 0.6s after the telegraph fired.
          hz.timer = def.interval || 5;
          const kb = def.knockback || 8;
          for (let j = 0; j < players.length; j++) {
            const p = players[j];
            if (!p.alive || !inCircle(p.x, p.z, def)) continue;
            const dx = p.x - (def.x || 0);
            const dz = p.z - (def.z || 0);
            const d = Math.sqrt(dx * dx + dz * dz) || 1;
            p.kbX += (dx / d) * kb;
            p.kbZ += (dz / d) * kb;
            hazardDamagePlayer(state, p, 2);
          }
          state.renderApi.vfx('nova', def.x || 0, def.z || 0, { radius: def.r || 1.2 });
        } else if (hz.timer <= 0 && !hz.strikeArmed) {
          hz.strikeArmed = true;
          state.renderApi.vfx('telegraph', def.x || 0, def.z || 0, { radius: def.r || 1.2, duration: 0.6 });
        }
        if (hz.timer > 0) hz.strikeArmed = false;
        break;
      }

      case 'banana_storm':
      case 'collapsing_stone': {
        if (hz.strikeArmed) {
          hz.strikeT -= dt;
          if (hz.strikeT <= 0) {
            hz.strikeArmed = false;
            hz.timer = def.interval || 6;
            resolveStrike(state, hz, def.damage || 6, def.radius || 2);
          }
        } else {
          hz.timer -= dt;
          if (hz.timer <= 0) {
            // Aim near a random player (keeps pressure on movement).
            const p = players[state.rng.int(0, players.length - 1)] || players[0];
            hz.strikeArmed = true;
            hz.strikeT = 0.9;
            hz.strikeX = (p ? p.x : 0) + (state.rng.next() - 0.5) * 5;
            hz.strikeZ = (p ? p.z : 0) + (state.rng.next() - 0.5) * 5;
            state.renderApi.vfx('telegraph', hz.strikeX, hz.strikeZ, {
              radius: def.radius || 2,
              duration: hz.strikeT,
            });
          }
        }
        break;
      }

      default:
        break;
    }
  }
}
