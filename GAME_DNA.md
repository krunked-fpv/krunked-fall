# KRUNKEDFALL — Game DNA Blueprint

## 1. Core Loop, Micro-Loop & Meta-Loop Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ META-LOOP (Hub Outpost — Act 0: Three-Rock Prison)                      │
│  Loki's Head Lore  │  Jötunn-Matic 3000 (8 Outcasts × 10 Skins)         │
│  Yggdrasil Tree (42 Skill Nodes) │ Run Modifiers (10) │ Compendiums     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼ [Bifrost Launch]
┌─────────────────────────────────────────────────────────────────────────┐
│ MACRO-LOOP (Branching Overworld Node Map — 45 Nodes across Acts 0–3)    │
│  Act I: Land of the Wolf (Fenrir, Skadi)                                │
│  Act II: Coils of the Serpent (Loki's Body, Hel)                        │
│  Act III: Shadow of Krunked (Surtur, Krunked -> Corrupted Krunked)      │
│  Interstitials: Weapon Shops, Campfires, Supply Stashes, Arenas, Trials │
│  Post-Clear: Endless Loop Mode (Loop 1, 2, ... scaling HP/density/loot) │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼ [Deploy to Node]
┌─────────────────────────────────────────────────────────────────────────┐
│ MICRO-LOOP (60 Hz Twin-Stick Destructible Combat)                       │
│  Move + Aim + Shoot/Melee -> Carve Destructible Cover -> Trigger        │
│  Outcast Ability/Power -> Chain 76 Mod & 6 Elemental Synergies ->       │
│  Beat Anti-Camping Fimbulwinter Freeze Storm -> Loot Weapons/Mods ->    │
│  Mod at Workbench -> Shatter Two-Phase Boss -> Bifrost Exit             │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Exact Game-Feel & Juice Mathematics

| Parameter | Exact Value / Formula | Implementation |
|---|---|---|
| Simulation Cadence | `SIM_HZ = 60` (`SIM_DT = 1/60s`), max frame clamp `100 ms` | `src/contracts/index.ts`, `src/app/gameApp.ts` |
| Render Frame Pacing | `30 \| 60 \| 120 FPS` (default `120 FPS`), `interpAlpha = acc / SIM_DT` + `pixelSnap60` toggle | `src/app/gameApp.ts`, `src/render/webglRenderer.ts` |
| Logical Pixel Grid | `640 × 360` (16:9), `TILE_SIZE = 16`, strict `GL_NEAREST` FBO upscaling | `src/render/webglRenderer.ts` |
| Camera Look-Ahead | `target = player + 0.20 * (aimWorld - player)`, clamped to room bounds | `src/sim/step.ts` |
| Directional Screenshake | Decaying trauma scaled by `weapon.screenshakeAmount` & explosions, offset along recoil/blast vector | `src/sim/combat.ts`, `src/render/webglRenderer.ts` |
| Input Ergonomics | 6-tick input buffer (`INPUT_BUFFER_TICKS = 6`) for fire/ability/power/swap; 36-tick hit iframes | `src/sim/abilities.ts`, `src/sim/combat.ts` |
| Micro-Hitstop | 2–4 ticks on heavy melee crits, explosive multi-kills, and boss Phase 2 transformations | `src/sim/combat.ts`, `src/sim/bosses.ts` |
| Weapon Recoil & Heat | Per-weapon `spriteRecoil`, `spriteRecoilAngle`, `userKnockback`, `burstCount/burstCooldown`, `windupMax`, `overheat` curve, `spriteFlashFrames`, shell ejection, dry-gun emergency bash (`26px`, `18 + lvl*2` dmg) | `src/sim/weaponExec.ts` |
| Self-Explosion Safety Cap | `min(22, floor(maxHp * 0.25), rawSelfDmg)` (0 with Blast Shield / self-damage immunity) | `src/sim/combat.ts` |
| Boss Separation Pushout | Two-pass deterministic circle pushout `minDist = player.r + enemy.r * (isBoss ? 0.72 : 0.65)`, tilemap-safe, skipped during Ghost Walk / Dash | `src/sim/step.ts` |
| Overkill Gore Threshold | Killing hit `damage >= enemy.maxHp * 0.45` triggers `overkill: true` -> sprite-split gibs + persistent blood splatter FBO | `src/sim/combat.ts`, `src/render/webglRenderer.ts` |
| Fimbulwinter Freeze Storm | `DEFAULT_FREEZE_THRESHOLD_TICKS = 2700` (45s, scaled by Run Modifiers), ramps `intensity 0 -> 1`, spawns indestructible Frost Crystals firing aimed ice shards | `src/sim/freezeStorm.ts` |
| WebGL2 Multi-Pass Stack | Pass 1 World/3D Walls/Cracks/Lava/Water/Bifrost/Braziers -> Pass 2 `1024×1024` Ping-Pong Decal FBO (`sh_trails_fade`) -> Pass 3 Shadow FBO -> Pass 4 Y-Sorted Actors/Weapons/Gibs/Telegraphs -> Pass 5 Additive 2D Lighting (`min ambient >= 0.54`, player lantern `r=128`, eye glows) -> Pass 6 Aurora / 8 Shockwaves / Quantized Frost & Snow Gusts / Upscaler | `src/render/shaders.ts`, `src/render/webglRenderer.ts` |
| Web Audio Mix & Crunch | `master -> DynamicsCompressorNode -> music/sfx/ambience`, +/-6–12% pitch jitter, 24-voice polyphony cap, 25–45ms per-key micro-cooldown, stereo pan + distance attenuation, 350ms `Intro -> A -> B -> Outro` crossfade | `src/audio/audioEngine.ts` |

## 3. Key State Machines, AI, Boss Patterns & Worldgen

- **Swept Continuous Collision (`src/sim/collision.ts`)**: 2D Amanatides-Woo grid DDA `sweepProjectileVsTilemap()` paired with analytical `sweepSegmentVsCircle()` guarantees zero wall or enemy tunneling even at 80+ px/tick.
- **Destructible Tilemap & BFS Connectivity (`src/sim/tilemap.ts`, `src/sim/worldgen.ts`)**: Outer perimeter locked to `TileKind.WallBedrock`; interior walls & crates track `tileHp` (`wall_crack` at 66%/33% -> `wall_shatter` into `TileKind.Rubble`). `verifyMapConnectivity()` + `ensureMapConnectivity()` carves guaranteed walkable corridors between spawn, enemies, chests, and Bifrost exit across all 45 nodes.
- **6 Two-Phase Mechanical Norse Bosses (`src/sim/bosses.ts`)**:
  1. **Irradiated Fenrir → Meltdown Fenrir** (Act 1): Wall-crushing charge telegraph (`line`), toxic radial spray, Phase 2 overdrive flame dash + scatter barrage.
  2. **Queen Skadi → Warrior Skadi** (Act 1): Glacial cone barrages, frost nova rings, Phase 2 rapid twin-scythe cross-volleys.
  3. **Loki's Body → Loki's Body in Overdrive** (Act 2): Summoned Body Clones, energy orbs, Phase 2 rapid teleport-beam telegraphs.
  4. **Hel → Hel Scorned** (Act 2): Summoned Hel Hands, necrotic spiral rings, Phase 2 relentless homing death waves.
  5. **Surtur → Hate Incarnate** (Act 3): Wall-smashing magma slam rings, lava fireballs, Phase 2 incandescent meteor nova + shockwave barrages.
  6. **Krunked → Corrupted Krunked** (Act 3): Gungnir sniper beams, spear-ring sweeps, Phase 2 glitch-telegraphed arena-wide void barrages unlocking `KRUNKEDSLAYER` and Endless Loop Mode (`loopCount >= 1`).
- **Deterministic RNG & Loot Economy (`src/sim/rng.ts`, `src/sim/modGraph.ts`)**: Single Mulberry32 `SimState.rngState` governs dungeon layout, enemy pools, weapon tier drops (boosted by Connoisseur/Lucky Guns/Run Modifiers/Loop count), mod rolls, shop stock, and critical hits; `hashSimState()` emits a stable 32-bit FNV-1a replay digest.

## 4. Spliceable Module Manifest & Mashup Hooks

Every core subsystem is cleanly bounded behind `src/contracts/index.ts` and can be spliced directly into other Krunked Vault games:

| Spliceable Module | Path | Contract Types | Reuse / Mashup Recipe |
|---|---|---|---|
| **221-Weapon + 76-Mod Composable Gunsmithing Engine** | `src/data/weapons.ts`, `src/data/mods.ts`, `src/sim/modGraph.ts`, `src/sim/weaponExec.ts` | `WeaponDef`, `ModDef`, `ModStatDelta`, `WeaponInstance`, `EffectiveWeaponStats` | Drop directly into any top-down shooter, extraction roguelite, or survival craft game for instant 221-gun + 76-rune combinatorics, overheat, windup, burst, and golden upgrades. |
| **Swept Destructible Tilemap & BFS Worldgen** | `src/sim/tilemap.ts`, `src/sim/collision.ts`, `src/sim/worldgen.ts` | `TileMapState`, `TileKind`, `TileRayHit`, `CircleSweepHit` | Splice into dungeon crawlers or tank/mech arena games for zero-tunneling high-speed projectiles, cracking/shattering cover, indestructible outer bounds, and BFS-verified procedural rooms. |
| **6-Pass 640×360 WebGL2 Pixel-Art & Lighting Engine** | `src/render/shaders.ts`, `src/render/spriteBatch.ts`, `src/render/webglRenderer.ts`, `src/render/packManager.ts` | `RenderSettings`, `PackManifest`, `SimEvent`, `BiomePalette` | Reuse as a universal crisp pixel-art renderer with persistent blood/scorch FBO trails, additive 2D lighting, explosion shockwaves, frost/aurora shaders, and Built-In + Custom Pack hot-swapping. |
| **Procedural Built-In Pixel Atlas & Outlined Font Gen** | `src/assets/pixelArtGen.ts`, `src/assets/bitmapFont.ts`, `src/assets/builtinPack.ts` | `PackManifest`, `SpriteMeta`, `BitmapFontAtlas` | Generate crisp zero-dependency DOM-free pixel art and integer-scaled outlined bitmap text in any browser or Node verification pipeline. |
| **Dynamic `Intro/A/B/Outro` Web Audio Synth Engine** | `src/audio/audioEngine.ts`, `src/audio/synthMusic.ts`, `src/audio/synthSfx.ts` | `AudioSettings`, `SimEvent`, `AssetPackMode` | Plug into any action game for intensity-reactive boss music crossfades, limiter-protected high-fire-rate SFX with pitch jitter & stereo panning, and zero-asset procedural fallback. |
| **Anti-Camping Escalation System (Fimbulwinter)** | `src/sim/freezeStorm.ts` | `FreezeStormState`, `FrostCrystalState` | Splice into roguelikes/arena shooters to force forward momentum via escalating screen hazard + hostile turret spawns. |
| **156-Playtester Persona Gauntlet Harness** | `scripts/verify/playtest-100.ts`, `src/sim/hash.ts` | `SimState`, `InputFrame` | Reuse the persona-driven deterministic soak template to catch softlocks, DPS outliers, and clipping bugs across hundreds of simulated hours in <4 seconds. |

## 5. Player Taste Signature ("Why Krunkedfall Feels Extraordinary")

- **Razor-Sharp 640×360 Neon-Lit Pixel Craft**: Crisp nearest-neighbor pixels bathed in dynamic additive muzzle/eye/brazier lighting, grounded shadows, persistent blood/oil/scorch battlefields, expanding shockwaves, and shimmering rainbow Bifrost/Aurora shaders — shining in both original Built-In pixel art and hot-swappable Custom Packs.
- **Hyper-Kinetic Weapon & Destruction Juice**: Every shot kicks with per-weapon recoil, brass casings, muzzle bloom, directional screenshake, micro-hitstop, and wall-carving explosions that turn static corridors into scarred ruins.
- **Addictive "One More Run" Roguelite Depth**: 8 distinct Outcasts with transformative Abilities/Powers, 221 weapons × 76 composable mods/runes, Yggdrasil branching progression, branching 3-Act Overworld routes, anti-camping Fimbulwinter tension, and 6 dramatic two-phase mechanical Norse bosses culminating in Corrupted Krunked and Endless Loop Mode.
