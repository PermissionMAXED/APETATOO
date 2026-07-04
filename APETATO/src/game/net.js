// APETATO game/net — network adapter stub (offline build).
//
// Intended online model: deterministic lockstep. Because the whole
// simulation is a pure function of (seed, fixed-step input intents), two
// clients that exchange ONLY inputs stay in sync. Planned message schema:
//
//   { t: 'hello',  v: 1, name }                       // handshake
//   { t: 'start',  seed, modeId, characterIds, arenaId, customRules }
//   { t: 'input',  step, player, intent: { moveX, moveZ, aimX, aimZ,
//                                          firing, pause, confirm, cancel } }
//   { t: 'choice', step, player, kind: 'levelup'|'shop', payload }
//   { t: 'sync',   step, hash }                       // periodic state hash
//   { t: 'bye' }
//
// Clients buffer remote intents per fixed step and only advance the sim
// once every player's intent for that step has arrived (input delay ~3
// steps hides latency). 'sync' hashes catch drift early.

export function createNetAdapter() {
  return {
    isOnline: false,

    /** Not implemented in the offline build. */
    async connect() {
      throw new Error('not implemented');
    },

    /** No-op: nothing is listening. */
    send() {},

    /** No-op: register a message handler (unused offline). */
    onMessage() {},
  };
}
