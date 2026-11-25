# KRUNKEDFALL — Sprint Handoff

## Shipped State
KRUNKEDFALL is built end-to-end in `C:\krunked-fall`, passing all verification gates (Gate A, Vitest 31/31, Gate B deterministic soak, 156-playtester adversarial persona gauntlet, and 3 rounds of Gate C live browser visual/interactive verification) with **0 Critical, 0 Major, and 0 Minor defects**.

## Verified Architecture
- **Contracts (`src/contracts/index.ts`)**: Shared pure TypeScript types (`SimState`, `InputFrame`, `SimEvent`, `WeaponDef`, `ModDef`, `OutcastDef`, `BossDef`, `PackManifest`, `SaveData`, `DebugBridge`).
- **Declarative Data (`src/data/**`)**: 221 weapons (1:1 `DeaMels.json` stat parity across Tiers 1–6, Ranged & Melee, 6 ammo classes), 76 composable mods/runes, 8 playable Outcasts, 10 skins (incl. `KRUNKEDSLAYER`), 42 Yggdrasil skill nodes, 129 enemies, 6 two-phase bosses (`fenrir`, `skadi`, `loki_body`, `hel`, `surtur`, `krunked`), 19 biome palettes, 45 BFS-reachable overworld nodes, 10 run modifiers, 18 challenges. Zero raw retail brand leaks.
- **Deterministic 60 Hz Sim (`src/sim/**`)**: Pure DOM-free Mulberry32 PRNG + FNV-1a `hashSimState()`, Amanatides-Woo DDA swept collision (zero tunneling at 80+ px/tick), destructible tilemaps with indestructible outer bedrock, BFS connectivity enforcement, two-pass boss/enemy separation pushout, emergency dry-gun melee bash, capped self-explosion damage, anti-camping Fimbulwinter Freeze Storm, and endless Loop Mode.
- **640×360 6-Pass WebGL2 Renderer & Dual Packs (`src/render/**`, `src/assets/**`)**: Zero-per-frame-allocation NEAREST FBO pipeline (3D walls + cracks + lava/water distortion, ping-pong decal trails, contact shadows, Y-sorted interpolated/pixel-snapped actors + overkill gibs + pixel telegraphs, additive 2D lighting + braziers, Aurora/shockwave/Fimbulwinter post FX). Dual-mode **Built-In Original Krunked Pixel Art** (124 multi-tone sprites) + live **Owned Custom Pack** mounting (dev `/.krunkedfall-assets/` + IndexedDB folder picker, 1,130 aliases, GMS2 slot-0 floor strip skip).
- **Audio (`src/audio/**`)**: Web Audio API `Intro -> A -> B -> Outro` dynamic music state machine + Norse industrial-metal/synthwave procedural synth fallback + spatialized SFX with polyphony cap (24).
- **UI/Input/App (`src/input/**`, `src/ui/**`, `src/app/**`)**: KB+Mouse+Gamepad, rebindable controls, `SaveManager` (`krunked_krunkedfall_save_v1`), Hub/Overworld/Workbench/Options/Victory/Loop UI, `window.__KRUNKED_DEBUG__`, and `F9` Playtest Drawer.

## Commands
- `npm run play` — Dev server (`http://127.0.0.1:4173`)
- `npm run extract && npm run oracle` — Local read-only Steam pack extraction (gitignored)
- `npm run verify && npm run build` — Full Gate A + Vitest + Gate B + production build
- `npx tsx scripts/verify/playtest-100.ts` — 156-playtester gauntlet
- `npm run export:dna` — Sync DNA to `C:\KrunkedVault`
