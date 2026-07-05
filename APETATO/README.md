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

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrow keys | Move |
| Mouse | Aim (weapons auto-fire; facing follows the cursor, falls back to nearest enemy) |
| `Esc` / `P` | Pause / back out of menus |
| `Enter` / `Space` | Confirm |
| Gamepad (standard mapping) | Left stick move, right stick aim, Start pause, A confirm, B cancel — pad slot 1 drives player 2 |

## Modes

| Mode | Rules | Unlock |
| --- | --- | --- |
| Classic | 20 waves, arena boss on 20 | default |
| Endless | No final wave; rotating boss every 5 waves past 20, scaling forever | 1 win |
| Boss Rush | 8 waves, every wave is a boss (HP + damage ramp up over the run), shops between | 1 win |
| Chaos Run | A random wave modifier every wave, +20% XP | 2 wins |
| One Weapon | Single weapon slot, +15% XP | 1 win |
| Banana Madness | 2.5x spawns, 3x coins/XP, banana rain | 3 wins |
| Hardcore | +30% enemy HP, +50% enemy damage | 5 wins |
| Custom | Sliders: waves, enemy HP/damage, spawn/XP/coin multipliers, start coins, weapon slots, optional seed | 1 win |
| Daily | One shared seeded run per UTC day, score submits to the local leaderboard | default |

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

- `window.APETATO_DEBUG` exposes `{ bus, states, save, input, game }` plus
  `runSelfTests()` which re-runs the kernel self-tests
  (bus/states/rng/pool/statmodel) in the console. `game` is the full game API
  (`startRun`, `getState`, `shop.*`, `levelup.*`, `togglePause`, `abandonRun`)
  so complete runs can be scripted from the console.
- Slow-mo: `import { engine }` from `src/core/engine.js` and set
  `engine.timeScale` (default `1`).
- Headless regression run: `node scripts/headless_run_test.mjs` drives a full
  scripted classic run (no browser) and exits 0 on VICTORY.

## QA checklist

Verified in Chrome (headless, SwiftShader GL) against the dev server, driven
end-to-end through the real UI + `APETATO_DEBUG.game`; sim-level sweeps ran
headless through `createGame()` with stubbed IO.

| # | Check | Result |
| --- | --- | --- |
| 1 | Boot: MENU renders with zero console errors; `Content.validate()` → 0 problems | PASS |
| 2 | Classic run (kong_grunt, banana_grove) to wave-20 VICTORY in-browser: movement, auto-fire, spawns, XP/coins + HUD, level-up modal, shop buy/reroll/lock/sell, wave-10 miniboss, wave-20 boss + HP bar, victory screen | PASS |
| 3 | Death → GAME_OVER path (end screen + meta save) | PASS |
| 4 | Endless: played past wave 22 (bosses at 10/20, scaling continues) | PASS |
| 5 | Boss Rush: boss every wave, 8 waves to VICTORY, bosses ramp | PASS |
| 6 | One Weapon: weapon slots capped at 1 for the whole run | PASS |
| 7 | Daily: two same-day runs get identical wave-1 spawns; both scores submit | PASS |
| 8 | Custom run: waves 40 / 3x spawns / seed `banana` honored (spawn budget exactly 3.00x classic) | PASS |
| 9 | Perf: banana_madness wave 12–14 at 2.5x spawns — avg sim step ≤ 0.06 ms with 200+ live enemies; no allocations in `game/*` or `render/instanced.js` hot paths | PASS |
| 10 | Audio: no AudioContext before first gesture; created + running after; volume sliders live-update gain nodes | PASS |
| 11 | UX: pause freezes the sim during a boss fight and resumes cleanly; Esc spam across MENU/CHAR_SELECT/MODE_SELECT/PLAYING/PAUSED/SETTINGS never corrupts the state machine | PASS |
| 12 | Persistence: reload keeps bananas/unlocks/achievements/settings/daily; storage wipe boots a clean save (kong_grunt + peel_gunner + chimp_zap, banana_grove, classic) | PASS |
| 13 | Meta accounting: golden bananas and lifetime stats accumulate exactly once per run (meta trackers own the counters, `save.recordRun` only appends history) | PASS |
| 14 | Balance sweep (seeded bot, classic): wave-1 survival 100%; non-building median death wave 8; building win rates — peel_gunner 67%, chimp_zap 58%, kong_grunt 33%; early shop ~14 coins / late ~107 coins at open | PASS |
