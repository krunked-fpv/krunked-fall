# KRUNKEDFALL — Technical Specification & Parity Contract

## 1. Retail Engine Oracle Ground Truth (Verified Read-Only)

- **Engine**: GameMaker Studio 2 (YYC bytecode v17, `data.win` = 229,234,224 bytes, `FORM` IFF container).
- **Display & Timing**: Logical resolution `640 × 360` (16:9), fixed simulation cadence `60.0 Hz` (`TILE_SIZE = 16`).
- **Asset Inventory in `data.win`**:
  - `TXTR`: 127 texture pages (28-byte header per entry, `[6]` = `dataOffset`). Format: 4B magic `"2zoq"` + `uint16LE width` + `uint16LE height` + `uint32LE uncompressedQoiSize` + raw BZip2 stream (`"BZh..."`) decompressing to standard QOI (`"qoif"`) RGBA image.
  - `SPRT`: 6,200 sprites with exact `width` (+4), `height` (+8), `bboxLeft/Right/Bottom/Top` (+12..+24), `originX` (+48), `originY` (+52), GMS2 header (+56..+80), `tpagCount` (+84), and `tpagPtr[]` (+88).
  - `TPAG`: 35,495 entries (11 `uint16LE` values: `srcX, srcY, srcW, srcH, tgtX, tgtY, tgtW, tgtH, boundW, boundH, txtrIndex`).
  - `SOND`: 518 definitions (40 bytes each; `[0]=namePtr`, `[1]=flags`, `[5]=volume f32`, `[6]=pitch f32`, `[8]=audioId` into `AUDO`, `-1` for external `.ogg`).
  - `AUDO`: 435 embedded RIFF WAV buffers (`uint32LE byteLength` + `RIFF...`).
  - External `.ogg`: 83 tracks (69 music tracks including multi-part boss stems `Intro/A/B/Outro` for Fenrir, Skadi, Body, Hel, Surtur, and the Act 3 Final Boss, plus 14 biome/hub ambience tracks).
  - `SHDR`: 76 shaders defining the target lighting, shadow, blood, trail fade, shockwave, frost, snow, Bifrost, aurora, sprite-break, sprite-split, lava, water, and skill-tree glow stack.
  - `FONT`: 8 GMS2 fonts + `fonts/` TTF files.

## 2. Core Content & Roguelite Parity Specifications

### 2.1 Playable Outcasts (8) + Skins (10)
1. **Britta — The Cyberserker** (`britta`, source `Cyberserker`): Ability **Pneumatic Dash** (invulnerable burst dash dealing contact damage); Power **Metal Berserk** (extended melee/fire-rate rampage with metal arm).
2. **Leifi — The Moose** (`leifi`, source `Moose`): Ability **Horn Shield** (invulnerability at reduced movement speed); Power **Trample Charge** (unstoppable wall-crushing horn stampede).
3. **Gustaf — The Ghost** (`gustaf`, source `Darkelf`): Ability **Ghost Walk** (phase unseen through enemies); Power **Shadow Execution** (stealth cloak + massive empowered melee/crit strike).
4. **Einar — The Miner** (`einar`, source `Dwarf`): Ability **Turretmouth** (deploy autonomous tracking turret); Power **Drillnose** (send wall-carving drill companion that harvests pickups and shreds enemies).
5. **Gunilla — The Gunrunner** (`gunilla`, source `Gnome`): Ability **Dual Wield** (synchronized offhand weapon fire); Power **Magic Leaf** (heal HP + temporary speed & ammo-generation frenzy).
6. **Trulls — The Trapper** (`trulls`, source `Troll`): Ability **Whirlpool** (vortex pulling enemies inward + damage); Power **Snare Overload** (shattering electro-trap detonation wave).
7. **Stellan — The Screwball** (`stellan`, source `Goblin`): Ability **Ball of Doom** (orbiting/thrown spiked wrecking ball destroying enemies, walls, and incoming projectiles); Power **Wrecking Frenzy** (oversized hyper-speed multi-ball rampage).
8. **Hilda — The Druid** (`hilda`, source `Dryad`): Ability **Summon Seedling** (autonomous seedling companion following and attacking enemies); Power **Overgrowth** (burst healing + enraged thorn-shooting seedling swarm).

- **10 Skins**: `Original`, `Wastelander`, `Frost Walker`, `Warlord`, `Fire Walker`, `Snakecharmer`, `Ascended`, `Champion`, `Overlord`, and **`Krunkedslayer`** (rebranded from retail key `skin_odinskin`).
- **Yggdrasil Branching Skill Tree**: 42 passive skill nodes (18 shared + 24 Outcast-specific) across 5 collision-free tier rows (HP from pickups, Lucky Guns, Connoisseur quality, Gold Rush, Turret Endurance, Drill March, Powerful/Invigorating Berserk, Shadow Strike, Dual Wield Frenzy, Mod Limit+, Ammo Capacity, Speed, Luck).

### 2.2 Arsenal (221 Weapons) & Mod System (76 Mods/Runes)
- **Weapons**: Exactly `221` unique weapons (`uniqueId` 1000..1220+) spanning:
  - Tiers 1–6: Tier 1 (37), Tier 2 (45), Tier 3 (49), Tier 4 (35), Tier 5 (33), Tier 6 (22).
  - Classes: `0` Ranged/Heavy (186) & `1` Melee (35).
  - Ammo Types `0..5`: Melee/None (26), Bullets (48), Shells (34), Bolts (32), Energy (34), Explosives (47).
  - Full parameter fidelity: `cooldown`, `burstCooldown`, `burstCount`, `projectileAmount`, `projectileSpeed`, `projectileSpread`, `spreadType`, `projectileOffset`, `projectileOffsetIgnoreWall`, `heatseekingRate`, `spriteRecoil`, `spriteRecoilAngle`, `userKnockback`, `knockbackOnlyWhenStill`, `screenshakeAmount`, `spriteFlashFrames`, `overheat`, `overheatFactor`, `windupMax`, `extraProjectileBounces`, `zoomFactor`, `laserSight`, `refundChance`, `lifestealChance`, elemental tiers (`burn`, `freeze`, `acid`, `explosive`, `radioactive`), and Golden Upgrade variants (`golden`, `goldenCost`).
- **Mods & Runes**: Exactly `76` distinct functional weapon mods/runes matching `Mods.csv` (Turbo Trigger, Trigger Juicer, Turbo Rune, Triple/Double Chamber, Burst/Miniburst Mag, Hyper Funnel, Slow Barrage, Big Mag, Range Rail, Choke Barrel, Laser Scope, Bounce Casing, Heavy Barrel, Overloader, Lifesteal Syringe, Blood/Homing/Ice/Fire/Acid/Frag/Speed/Hunter/Ethereal/Ragnarok/Soul/Wind/Magnet/Shield/Endless/Quad/Octuple/Flak/Haste/Lightning Runes, Teleporter, Reloader, Crazy Reloader, Armor Plating, Gun Drone, Carbon Fiber, Blast Shield, Heavy Casing, Bayonette, Golden Bullet, Sentient AI, Stick, Radioactive, etc.). Every mod composes multiplicatively/additively inside `src/sim/modGraph.ts` with zero dead/no-op mods.

### 2.3 World Structure, Overworld Map & Bestiary
- **4 Acts & 45 Named Nodes**:
  - **Act 0 (Hub & Training)**: Hub Outpost (Loki's Head, Jotunn-Matic 3000, Yggdrasil Skill Tree, Bifrost Portal, Run Modifiers, Weapondex, Enemydex, Training Dummy) + Weapon Shop, Easy/Medium/Hard Training Grounds.
  - **Act 1 — Land of the Wolf**: Bandit Canyon, Dunes, Squeaky Sewers, Saltpan, Cold Cave, Giant's Battlefield, Cannibal Subway, Viking Keep, Sand City, Supply Stash, Campfire, Arena, Infinite Desert, **Fenrir's Den** (Boss 1: Irradiated Fenrir → Meltdown Fenrir), **Jotunheim** (Boss 2: Queen Skadi → Warrior Skadi).
  - **Act 2 — Coils of the Serpent**: Stony Field, Grassland, Deadlands, Mushroom Cave, Wild City, Pine Forest, Maggot Garage, Viking Keep II, Research Lab, Military Base, Infinite Forest, **Lost Temple** (Boss 3: Loki's Body + Clones → Loki's Body in Overdrive), **Helheim** (Boss 4: Hel + Hands → Hel Scorned).
  - **Act 3 — Shadow of Krunked**: Ash Wastes, Trenches, Lava Land, Belly of the Beast, Cinder City, Viking Keep III, Redhall, Sulfur Lake, Infinite Magma, Ember Campfire, **Muspelheim** (Boss 5: Surtur + Crown/Limbs → Hate Incarnate), **Balder's Shrine** (Boss 6: **Krunked** → **Corrupted Krunked**).
- **Bestiary**: 129 enemy definitions across 12 archetypes mapped into Act 1–3 biome pools + 6 two-phase Major Bosses with distinct telegraphed attack patterns, Phase 1 → Phase 2 transformation bursts (switching music Stem A → Stem B), two-pass deterministic boss/enemy separation pushout, emergency dry-gun melee bash fallback, capped self-explosion safety, and infinite post-Krunked **Loop Mode** scaling (`loopCount >= 1`).

## 3. Simulation & Game-Feel Invariants

- **Swept Continuous Collision**: Projectiles step via swept segment-vs-tilemap DDA and swept segment-vs-circle entity intersection, guaranteeing **zero tunneling** even at `projectileSpeed >= 30 px/tick`.
- **Destructible Tilemaps**: Destructible interior walls (`TileKind.WallDestructible`) track per-tile HP, emit `wall_crack` at 66%/33% HP, and shatter into `TileKind.Rubble` with `wall_shatter` + explosion decals when destroyed by explosives, heavy weapons, Drillnose, Ball of Doom, or charging bosses. Outer perimeter `TileKind.WallBedrock` is indestructible.
- **Procedural Dungeon Connectivity**: Every generated combat/arena/boss map guarantees a connected walkable BFS path from `(spawnX, spawnY)` to `(exitX, exitY)` and all spawned chests/enemies.
- **Anti-Camping Fimbulwinter Freeze Storm**: Escalates when the player lingers past `thresholdTicks` (scaled by Run Modifiers). Smoothly drives `freezeStorm.intensity` `0 → 1`, renders frost borders & snow gusts, and spawns indestructible Frost Crystals firing aimed ice shards.
- **Kinetic Juice**:
  - Camera tracks player with 20% weighted look-ahead toward world aim cursor, clamped to room bounds, layered with decaying directional screenshake.
  - 6-tick input buffer on fire, ability, power, and weapon swap.
  - 36-tick hit invulnerability frames with blink feedback.
  - 2–4 tick micro-hitstop on heavy melee crits, explosive multi-kills, and boss phase shifts.

## 4. Brand Firewall ("Odin" → "Krunked")

- All player-facing text, titles, boss banners, Outcast skins, lore/Loki comments, package name (`krunked-krunkedfall`), and save key (`krunked_krunkedfall_save_v1`) replace every case-preserving occurrence of `Odin` with `Krunked`.
- Raw source asset lookup keys (`sndMusicOdinA`, `sprOdin`, `Odin`, `Odin2`) are strictly encapsulated in `logicalAliases` and `tools/` asset-extraction mappings so Custom Pack mounting works seamlessly with zero broken sprites or music while Gate A verifies zero player-facing leaks.

## 5. Triple-Gate Acceptance Criteria

- **Gate A (`npm run verify:assets`)**: Dual-pack key resolution (Built-In + `.krunkedfall-assets/` when present), Oracle parity checks (221 weapons, 6 tiers, 6 ammo types, 76 mods, 8 Outcasts, 43+ nodes, 6 bosses, 60 Hz, 640×360), zero retail files in `git ls-files` or `dist/`, zero player-facing `"Odin"` strings.
- **Gate B (`npm run test && npm run verify:sim`)**: Full Vitest suite + deterministic headless campaign soak across Acts 1–3, all 6 two-phase bosses, Loop 1+, and all 8 Outcasts, proving BFS connectivity, bounded entity counts, and identical FNV-1a `hashSimState()` across replays.
- **Gate C (Live `/browser` + Boost Red-Team)**: Visual & interactive verification of Title (Aurora + Built-In/Custom live toggle), Hub (Loki, Jotunn-Matic, Yggdrasil Skill Tree, Bifrost), Overworld Map, Act 1–3 combat, Workbench, Freeze Storm, Options (30/60/120 FPS + Pixel-Snap), F9 Playtest Drawer & all 6 bosses Phase 1 → Phase 2 → Victory/Loop, zero console/WebGL/network errors, zero Critical or Major defects.
