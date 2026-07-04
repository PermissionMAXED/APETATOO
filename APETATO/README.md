# APETATO

A browser action-roguelite arena survivor. You are an ape. There are waves.
There are bananas. Survive, snack, ascend.

## Run it

```bash
npm i
npm run dev      # Vite dev server — open the printed URL in Chrome
npm run build    # production bundle
npm run preview  # serve the production bundle
```

## Architecture

APETATO is plain ES-module JavaScript on Vite + three.js — no TypeScript, no
frameworks, no physics libs, no external assets (everything is procedural).
Gameplay simulates in 2D on the XZ plane at a fixed 60Hz timestep
(`src/core/engine.js`) and is rendered in 3D through an angled orthographic
camera; a 2D canvas overlay handles screen-space FX and DOM handles UI. All
systems communicate over one event bus (`src/core/bus.js`) and a flat state
machine (`src/core/states.js`) drives the app (MENU → CHAR_SELECT → PLAYING →
LEVELUP/SHOP → GAME_OVER/VICTORY...). Content (characters, weapons, items,
enemies) is frozen plain-data objects with lowercase `snake_case` ids,
interpreted by systems; stats use exactly the 28 keys defined in
`src/core/statmodel.js`. Gameplay randomness is seeded (mulberry32,
`src/core/rng.js`) so runs are reproducible; performance targets 400
simultaneous enemies at 60fps via `InstancedMesh` and object pooling
(`src/core/pool.js`) with no per-frame allocations in hot loops. Progress
persists to `localStorage` (`src/core/save.js`, key `apetato_save_v1`).

## Package map

| Path | Owns |
| --- | --- |
| `src/core/` | Kernel: event bus, state machine, fixed-step engine, seeded RNG, math helpers, object pool, unified input (KB/M + gamepads), save/persistence, stat model, global config |
| `src/render/` | three.js renderer, camera rig, instanced meshes, FX overlay canvas |
| `src/game/` | The run: waves, enemies, weapons, combat, pickups, arenas, modes |
| `src/ui/` | DOM UI screens (menu, char select, shop, level-up, HUD, stats...) |
| `src/audio/` | Procedural WebAudio SFX/music |
| `src/meta/` | Meta-progression: unlocks, achievements, golden bananas |

Entry point: `index.html` → `src/main.js`, which boots save → input →
renderer → game → UI → audio → meta, then starts the engine and enters MENU.

## Debugging

- `window.APETATO_DEBUG` exposes `{ bus, states, save, input }` plus
  `runSelfTests()` which re-runs the kernel self-tests
  (bus/states/rng/pool/statmodel) in the console.
- Slow-mo: `import { engine }` from `src/core/engine.js` and set
  `engine.timeScale` (default `1`).
