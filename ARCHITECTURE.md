# KRUNKEDFALL — System Architecture

## 1. High-Level Topology & Strict Module Boundaries

Krunkedfall is a standalone TypeScript + WebGL2 + Web Audio twin-stick action roguelite engineered with a clean, spliceable, strictly-decoupled architecture so every subsystem can be independently tested, hot-swapped, or mashed up into future Krunked Vault games.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         src/app/GameApp.ts                              │
│   Fixed 60 Hz Sim Accumulator  +  30/60/120 FPS Frame-Paced Renderer    │
│   SaveManager (krunked_krunkedfall_save_v1)  +  window.__KRUNKED_DEBUG__│
└──────┬───────────────────┬─────────────────────┬───────────────────┬────┘
       │ InputFrame        │ SimState + Events   │ SimEvent[]        │ UI State
       ▼                   ▼                     ▼                   ▼
┌──────────────┐   ┌───────────────┐    ┌─────────────────┐  ┌──────────────┐
│  src/input/  │   │   src/sim/    │    │   src/render/   │  │   src/ui/    │
│ KB+Mouse+Pad │   │ 100% Pure 60Hz│    │ WebGL2 640x360  │  │ Pixel-Crisp  │
│ World Aiming │   │ Deterministic │    │ 6-Pass FBO Pipe │  │ HUD & Menus  │
│ Rebindings   │   │ Zero DOM/Math │    │ Dual-Pack Mgr   │  │ Overworld UI │
└──────────────┘   └───────┬───────┘    └────────┬────────┘  └──────────────┘
                           │                     │
                           ▼                     ▼
                   ┌───────────────┐    ┌─────────────────┐  ┌──────────────┐
                   │   src/data/   │    │   src/assets/   │  │  src/audio/  │
                   │ 221 Weapons   │    │ Built-In 100%   │  │ Web Audio    │
                   │ 76 Mods/Runes │    │ Original Pixel  │  │ Dynamic A/B  │
                   │ 8 Outcasts    │    │ Atlases & Font  │  │ Synth + Pack │
                   │ 6 2-Phase Boss│    │                 │  │              │
                   └───────┬───────┘    └─────────────────┘  └──────────────┘
                           │
                           ▼
                   ┌────────────────────────────────────────────────────────┐
                   │               src/contracts/index.ts                   │
                   │    Single Source of Truth for All Types & Constants    │
                   └────────────────────────────────────────────────────────┘
```

## 2. Core Architectural Invariants

1. **Zero-DOM Deterministic Simulation (`src/sim/`)**:
   - Fixed timestep `SIM_HZ = 60` (`SIM_DT = 1/60s`). Frame accumulator clamps delta to `100 ms` max to avoid spiral-of-death.
   - All randomness flows strictly through `SimState.rngState` (seeded deterministic PRNG). `Math.random()` is banned across `src/sim/`.
   - `hashSimState(state)` produces a stable FNV-1a 32-bit hex digest over all simulation state fields so replay verification proves bit-for-bit determinism.
   - Side effects (SFX, music transitions, floor blood decals, shockwaves, floating text, screenshake) are emitted as typed `SimEvent[]` in `SimState.events` and drained by `GameApp` into `Renderer` and `AudioEngine`.

2. **640×360 Multi-Pass WebGL2 Pixel-Art Pipeline (`src/render/`)**:
   - Renders internally at native `640×360` into nearest-neighbor FBOs (`TEXTURE_MIN_FILTER = NEAREST`, `TEXTURE_MAG_FILTER = NEAREST`) and upscales cleanly to the viewport with pixel-crisp aspect-preserving letterboxing.
   - **Pass 1 (World Tilemap & Biome FX)**: Floor tiles, wall-top depth, progressive wall-crack overlays, lava/water distortion.
   - **Pass 2 (Persistent Floor Decal FBO)**: Persistent blood splatters, acid/radioactive puddles, explosion scorch marks, brass casings, footsteps, and shattered wall rubble fading smoothly via decay shader (`sh_trails_fade` parity), zero per-frame allocations.
   - **Pass 3 (Grounded Shadow Surface FBO)**: Angled soft contact shadows under player, enemies, bosses, projectiles, pickups, and wall edges.
   - **Pass 4 (Y-Sorted Entities, Weapons & Gore)**: Exact `(originX, originY)` pivot placement, weapon aim + recoil kick + stashed back-weapon rendering, muzzle flash bloom, 1-frame pure-white hit flash, melee slash arcs, laser sights, and sprite-split overkill gibs.
   - **Pass 5 (Dynamic 2D Additive Lighting & Emissives)**: Biome ambient tint multiplied with an additive point-light FBO driven by muzzle flashes, projectiles, glowing robot eyes, campfires, Bifrost portals, elemental DoTs, and boss telegraphs.
   - **Pass 6 (Screen-Space Post FX & Upscaler)**: Expanding radial explosion shockwave distortion rings (`sh_shockwave`), progressive Fimbulwinter frost border (`sh_frost`) + snowstorm gusts (`sh_snow_gusts`), shimmering Bifrost rainbow & Title Menu Aurora (`sh_bifrost` / `shMenuAurora`), directional trauma screenshake, and nearest-neighbor upscale.
   - **Frame Pacing**: Supports `30 | 60 | 120 FPS` (default `120 FPS` with `interpAlpha` transform smoothing between `prevX/prevY` and `x/y`, plus `Classic 60 FPS Native Pixel-Snap` toggle).

3. **Dual-Mode Asset Pack Architecture & IP Firewall**:
   - **Built-In Mode (`src/assets/`)**: 100% original Krunked procedural pixel-art atlases (multi-frame animations for all 8 Outcasts, biome tilesets, weapons by class/tier, enemies, 6 multi-phase mechanical Norse bosses, FX, HUD icons, and crisp pixel bitmap font) + Built-In Krunked Synth Soundtrack & SFX (`src/audio/`). Runs anywhere (including GitHub Pages) with zero external downloads.
   - **Owned Custom Pack Mode (`.krunkedfall-assets/` + IndexedDB Folder Picker)**:
     - `tools/extract-assets.ts` reads the operator's locally installed Steam copy strictly read-only, decodes all 127 `2zoq` (BZip2 + QOI) texture pages to PNGs, preserves exact `SPRT`/`TPAG` frame rects & `(originX, originY)` pivots, extracts `AUDO` RIFF WAVs and external `.ogg` tracks, parses `DeaMels.json`, `node_data.json`, and Krunked-sanitized `locale/*.csv` into gitignored `.krunkedfall-assets/` with `1,130` validated logical aliases (including per-biome floor/wall/face/rubble tile sets with GMS2 reserved slot-0 stripping).
     - In `vite` dev mode, `vite.config.ts` serves `/.krunkedfall-assets/*` read-only without ever bundling or copying retail assets into `dist/`.
     - In production/browser, the operator can click **LOAD CUSTOM PACK** on the Title Screen to mount an extracted folder into IndexedDB and toggle live between **USE CUSTOM PACK** and **USE BUILT-IN ART** with zero restarts or pivot drift.

4. **Global Brand Rebrand Firewall ("Odin" → "Krunked")**:
   - Every player-facing title, UI string, boss name (`KRUNKED` / `CORRUPTED KRUNKED`), Act title (`SHADOW OF KRUNKED`), skin (`KRUNKEDSLAYER`), dialogue, challenge, save key (`krunked_krunkedfall_save_v1`), and package name (`krunked-krunkedfall`) uses **Krunked**.
   - Internal retail lookup aliases (e.g., `sndMusicOdinIntro/A/B/Outro`, sprite keys in `logicalAliases`) live strictly inside asset-pack mapping tables and never surface in UI text.

## 3. Directory Ownership Matrix

| Directory / File | Specialist Owner |
|---|---|
| `ARCHITECTURE.md`, `SPEC.md`, `HANDOFF.md`, `GAME_DNA.md`, `dna/**`, `src/contracts/**`, `scripts/export-dna.ts`, `.agents/**`, root config | `@architect` |
| `tools/**`, `scripts/verify/verify-assets.ts` | `@extractor` |
| `src/data/**` | `@gameplay` |
| `src/render/**`, `src/assets/**` | `@renderer` |
| `src/audio/**` | `@audio` |
| `src/sim/**` | `@simcore` |
| `src/input/**`, `src/ui/**`, `src/app/**`, `src/main.ts`, `src/styles/**` | `@uiinput` |
| `tests/**`, `scripts/verify/verify-sim.ts`, `scripts/verify/verify-all.ts` | `@playtester` |
