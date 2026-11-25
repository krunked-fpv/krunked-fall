// ============================================================================
// KRUNKEDFALL — Gate B Deterministic Headless Campaign Soak (verify-sim.ts)
// ============================================================================
// Exercises the full campaign arc:
//   Hub -> Overworld -> Shop/Workbench/SkillTree ->
//   Act 1 (Canyon, Fenrir P1->P2, Skadi P1->P2) ->
//   Act 2 (Forest, Loki's Body P1->P2, Hel P1->P2) ->
//   Act 3 (Ash Wastes, Surtur P1->P2, Krunked P1->P2 -> Victory) ->
//   Loop 1+ Scaling
// across ALL 8 Outcasts, proving BFS connectivity on every visited room,
// bounded entity/projectile/pickup/companion counts, zero NaN/OOB violations,
// and bit-for-bit identical FNV-1a hashSimState() across twin replays.

import {
  TileKind,
  type BossId,
  type InputFrame,
  type OutcastId,
  type SimState,
} from '../../src/contracts/index.js';
import { BOSSES, OUTCASTS } from '../../src/data/index.js';
import {
  MAX_COMPANIONS,
  MAX_ENEMIES,
  MAX_PICKUPS,
  MAX_PROJECTILES,
  allocateSkillNode,
  attachModToWeapon,
  buyShopOffer,
  createInitialSimState,
  createNeutralInput,
  drainSimEvents,
  enterHub,
  enterNode,
  enterOverworld,
  equipWeaponByUniqueId,
  getTileAt,
  hashSimState,
  setPlayerOutcast,
  startNextLoop,
  stepSim,
  upgradeWeaponGolden,
  verifyMapConnectivity,
} from '../../src/sim/index.js';

interface SoakResult {
  finalHash: string;
  checkpoints: Array<{ stage: string; hash: string; tick: number }>;
  roomsVisited: number;
  bossesDefeated: BossId[];
  outcastsTested: OutcastId[];
  totalTicks: number;
  totalKills: number;
  wallsDestroyed: number;
  peakEnemies: number;
  peakProjectiles: number;
  peakPickups: number;
  peakCompanions: number;
  errors: string[];
}

function assertInvariants(state: SimState, context: string, errors: string[]): void {
  const p = state.player;
  const ts = state.map.tileSize;
  const minBound = ts * 0.5;
  const maxBoundX = (state.map.width - 0.5) * ts;
  const maxBoundY = (state.map.height - 0.5) * ts;

  if (
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    !Number.isFinite(p.vx) ||
    !Number.isFinite(p.vy) ||
    !Number.isFinite(p.hp) ||
    !Number.isFinite(p.maxHp)
  ) {
    errors.push(`[${context} t=${state.tick}] Non-finite player state: x=${p.x}, y=${p.y}, hp=${p.hp}`);
  }

  if (p.x < minBound || p.x > maxBoundX || p.y < minBound || p.y > maxBoundY) {
    errors.push(`[${context} t=${state.tick}] Player OOB: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  }

  if (state.enemies.length > MAX_ENEMIES) {
    errors.push(`[${context} t=${state.tick}] Enemy leak: ${state.enemies.length} > ${MAX_ENEMIES}`);
  }
  if (state.projectiles.length > MAX_PROJECTILES) {
    errors.push(`[${context} t=${state.tick}] Projectile leak: ${state.projectiles.length} > ${MAX_PROJECTILES}`);
  }
  if (state.pickups.length > MAX_PICKUPS) {
    errors.push(`[${context} t=${state.tick}] Pickup leak: ${state.pickups.length} > ${MAX_PICKUPS}`);
  }
  if (state.companions.length > MAX_COMPANIONS) {
    errors.push(`[${context} t=${state.tick}] Companion leak: ${state.companions.length} > ${MAX_COMPANIONS}`);
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) {
      errors.push(`[${context} t=${state.tick}] Non-finite enemy ${e.defId}#${e.id}`);
      break;
    }
  }
  for (let i = 0; i < state.projectiles.length; i++) {
    const pr = state.projectiles[i];
    if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y) || !Number.isFinite(pr.vx) || !Number.isFinite(pr.vy)) {
      errors.push(`[${context} t=${state.tick}] Non-finite projectile #${pr.id}`);
      break;
    }
  }
}

function checkMapBedrockAndBfs(state: SimState, label: string, errors: string[]): void {
  if (!verifyMapConnectivity(state.map)) {
    errors.push(`[${label}] BFS map connectivity FAILED on node ${state.currentNodeId}`);
  }
  const { width, height } = state.map;
  for (let x = 0; x < width; x++) {
    if (getTileAt(state.map, x, 0) !== TileKind.WallBedrock) {
      errors.push(`[${label}] Top bedrock breached at (${x}, 0)`);
      return;
    }
    if (getTileAt(state.map, x, height - 1) !== TileKind.WallBedrock) {
      errors.push(`[${label}] Bottom bedrock breached at (${x}, ${height - 1})`);
      return;
    }
  }
  for (let y = 0; y < height; y++) {
    if (getTileAt(state.map, 0, y) !== TileKind.WallBedrock) {
      errors.push(`[${label}] Left bedrock breached at (0, ${y})`);
      return;
    }
    if (getTileAt(state.map, width - 1, y) !== TileKind.WallBedrock) {
      errors.push(`[${label}] Right bedrock breached at (${width - 1}, ${y})`);
      return;
    }
  }
}

function buildCombatInput(state: SimState, localTick: number): InputFrame {
  const inp = createNeutralInput();
  const p = state.player;

  // Target nearest alive enemy or room center
  let targetX = state.map.exitX;
  let targetY = state.map.exitY;
  let bestDist = Infinity;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestDist) {
      bestDist = d;
      targetX = e.x;
      targetY = e.y;
    }
  }

  const dx = targetX - p.x;
  const dy = targetY - p.y;
  const dist = Math.hypot(dx, dy) || 1;
  const orbitSign = Math.floor(localTick / 90) % 2 === 0 ? 1 : -1;

  if (bestDist < Infinity) {
    // Strafe around target at ideal combat distance
    const idealDist = 110;
    const radial = dist > idealDist + 20 ? 0.75 : dist < idealDist - 25 ? -0.65 : 0;
    inp.moveX = (dx / dist) * radial + (-dy / dist) * 0.75 * orbitSign;
    inp.moveY = (dy / dist) * radial + (dx / dist) * 0.75 * orbitSign;
  } else {
    inp.moveX = dx / dist;
    inp.moveY = dy / dist;
  }

  inp.aimWorldX = targetX;
  inp.aimWorldY = targetY;
  inp.firePrimary = true;
  inp.firePrimaryPressed = localTick % 4 === 0;
  inp.abilityPressed = localTick % 85 === 10;
  inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
  inp.swapWeaponPressed = localTick % 180 === 120;
  inp.interactPressed = localTick % 40 === 20;
  return inp;
}

function runCampaignSoak(seed: number): SoakResult {
  const errors: string[] = [];
  const checkpoints: Array<{ stage: string; hash: string; tick: number }> = [];
  const outcastsTested = new Set<OutcastId>();
  let roomsVisited = 0;
  let peakEnemies = 0;
  let peakProjectiles = 0;
  let peakPickups = 0;
  let peakCompanions = 0;

  const state = createInitialSimState(seed, 'britta');
  state.godMode = true; // Headless soak proves full campaign completion deterministically

  const recordPeaks = (): void => {
    if (state.enemies.length > peakEnemies) peakEnemies = state.enemies.length;
    if (state.projectiles.length > peakProjectiles) peakProjectiles = state.projectiles.length;
    if (state.pickups.length > peakPickups) peakPickups = state.pickups.length;
    if (state.companions.length > peakCompanions) peakCompanions = state.companions.length;
  };

  const stepTicks = (count: number, stage: string, stopPredicate?: () => boolean): void => {
    for (let t = 0; t < count; t++) {
      const inp = buildCombatInput(state, t);
      // Keep ammo topped up for long sustained boss fights during soak
      if (t % 120 === 0) {
        for (let a = 1; a <= 5; a++) {
          const idx = a as 1 | 2 | 3 | 4 | 5;
          if (state.player.ammo[idx] < 20) {
            state.player.ammo[idx] = state.player.maxAmmo[idx];
          }
        }
      }
      stepSim(state, inp);
      recordPeaks();
      assertInvariants(state, stage, errors);
      if (stopPredicate && stopPredicate()) break;
    }
  };

  // 1. Hub -> Skill Tree -> Workbench -> Overworld -> Shop
  enterHub(state);
  roomsVisited++;
  checkMapBedrockAndBfs(state, 'hub', errors);
  state.player.skillPoints = 6;
  state.player.gold = 2500;
  allocateSkillNode(state, 'skill_fortitude');
  allocateSkillNode(state, 'skill_gunslinger');
  allocateSkillNode(state, 'skill_ammo_pouches');
  stepTicks(90, 'hub');
  drainSimEvents(state);
  checkpoints.push({ stage: 'hub', hash: hashSimState(state), tick: state.tick });

  enterOverworld(state);
  if (state.screenMode !== 'overworld') {
    errors.push(`Expected screenMode='overworld', got ${state.screenMode}`);
  }

  enterNode(state, 'act0_weaponshop');
  roomsVisited++;
  checkMapBedrockAndBfs(state, 'shop', errors);
  if (state.shopOffers.length > 0) {
    buyShopOffer(state, state.shopOffers[0].id);
  }
  drainSimEvents(state);

  // Equip high-impact boss-ready loadout with mods + golden upgrade
  const armOutcast = (oid: OutcastId, primaryWepId: number, mods: string[]): void => {
    setPlayerOutcast(state, oid);
    outcastsTested.add(oid);
    equipWeaponByUniqueId(state, primaryWepId, 0);
    for (const m of mods) {
      attachModToWeapon(state, m, 0);
    }
    upgradeWeaponGolden(state, 0, true);
    state.player.powerCharge = state.player.powerChargeRequired;
  };

  const fightBossStage = (
    bossId: BossId,
    nodeId: string,
    outcastId: OutcastId,
    weaponId: number,
    mods: string[],
  ): void => {
    armOutcast(outcastId, weaponId, mods);
    enterNode(state, nodeId);
    roomsVisited++;
    checkMapBedrockAndBfs(state, `boss:${bossId}`, errors);

    let sawPhase2 = false;
    let sawMusicStemB = false;
    let sawDefeated = false;

    const maxTicks = 2400;
    for (let t = 0; t < maxTicks; t++) {
      const inp = buildCombatInput(state, t);
      if (t % 90 === 0) {
        for (let a = 1; a <= 5; a++) {
          const idx = a as 1 | 2 | 3 | 4 | 5;
          if (state.player.ammo[idx] < 25) state.player.ammo[idx] = state.player.maxAmmo[idx];
        }
      }
      stepSim(state, inp);
      recordPeaks();
      assertInvariants(state, `boss:${bossId}`, errors);

      const evs = drainSimEvents(state);
      for (const ev of evs) {
        if (ev.type === 'boss_phase2' && ev.bossId === bossId) sawPhase2 = true;
        if (ev.type === 'music_change' && ev.stem === 'b') sawMusicStemB = true;
        if (ev.type === 'boss_defeated' && ev.bossId === bossId) sawDefeated = true;
      }

      if (sawDefeated) break;
    }

    if (!sawPhase2) errors.push(`[boss:${bossId}] Never observed boss_phase2 event`);
    if (!sawMusicStemB) errors.push(`[boss:${bossId}] Never observed music_change stem='b' on Phase 2`);
    if (!sawDefeated) errors.push(`[boss:${bossId}] Boss not defeated within ${maxTicks} ticks`);
    if (!state.runStats.bossesDefeated.includes(bossId)) {
      errors.push(`[boss:${bossId}] Missing from runStats.bossesDefeated`);
    }

    checkpoints.push({ stage: `boss_${bossId}`, hash: hashSimState(state), tick: state.tick });
  };

  // 2. Act 1: Canyon (Britta) -> Fenrir (Leifi) -> Skadi (Gustaf)
  armOutcast('britta', 1028, ['mod_heavy', 'mod_fragrune', 'mod_turbo', 'rune_ragnarok']);
  enterNode(state, 'act1_canyon');
  roomsVisited++;
  checkMapBedrockAndBfs(state, 'act1_canyon', errors);
  stepTicks(240, 'act1_canyon');
  drainSimEvents(state);
  checkpoints.push({ stage: 'act1_canyon', hash: hashSimState(state), tick: state.tick });

  fightBossStage('fenrir', 'act1_darkcity', 'leifi', 1047, ['mod_heavy', 'mod_tripler', 'mod_turbo', 'rune_ragnarok']);
  fightBossStage('skadi', 'act1_jotunheim', 'gustaf', 1114, ['mod_overloader', 'mod_tripler', 'mod_turborune', 'rune_lightning']);

  // 3. Act 2: Forest (Einar) -> Loki's Body (Gunilla) -> Hel (Trulls)
  armOutcast('einar', 1019, ['mod_heavy', 'mod_doubler', 'mod_firerune', 'mod_gun_drone']);
  enterNode(state, 'act2_forest');
  roomsVisited++;
  checkMapBedrockAndBfs(state, 'act2_forest', errors);
  stepTicks(240, 'act2_forest');
  drainSimEvents(state);
  checkpoints.push({ stage: 'act2_forest', hash: hashSimState(state), tick: state.tick });

  fightBossStage('loki_body', 'act2_losttemple', 'gunilla', 1028, ['mod_overloader', 'rune_quad', 'mod_turborune', 'rune_ragnarok']);
  fightBossStage('hel', 'act2_helheim', 'trulls', 1021, ['mod_overloader', 'rune_quad', 'mod_turborune', 'rune_ragnarok']);

  // 4. Act 3: Ash Wastes (Stellan) -> Surtur (Hilda) -> Krunked (Britta) -> Victory -> Loop 1
  armOutcast('stellan', 1125, ['mod_heavy', 'mod_fragrune', 'mod_turborune', 'rune_ragnarok']);
  enterNode(state, 'act3_ashwastes');
  roomsVisited++;
  checkMapBedrockAndBfs(state, 'act3_ashwastes', errors);
  stepTicks(240, 'act3_ashwastes');
  drainSimEvents(state);
  checkpoints.push({ stage: 'act3_ashwastes', hash: hashSimState(state), tick: state.tick });

  fightBossStage('surtur', 'act3_muspelheim', 'hilda', 1126, ['mod_overloader', 'rune_quad', 'mod_turborune', 'rune_ragnarok']);
  fightBossStage('krunked', 'act3_shrine', 'britta', 1028, ['mod_overloader', 'rune_octuple', 'mod_turborune', 'rune_ragnarok']);

  if (state.screenMode !== 'victory') {
    errors.push(`[victory] Expected screenMode='victory' after defeating Corrupted Krunked, got '${state.screenMode}'`);
  }

  // 5. Loop 1+ Transition & Combat Verification
  startNextLoop(state);
  roomsVisited++;
  if (state.loopCount !== 1) {
    errors.push(`[loop1] Expected loopCount=1, got ${state.loopCount}`);
  }
  checkMapBedrockAndBfs(state, 'loop1_canyon', errors);
  stepTicks(220, 'loop1_canyon');
  drainSimEvents(state);
  checkpoints.push({ stage: 'loop1_canyon', hash: hashSimState(state), tick: state.tick });

  // Verify full Outcast & Boss coverage
  if (outcastsTested.size !== OUTCASTS.length) {
    errors.push(`Expected all ${OUTCASTS.length} Outcasts exercised, got ${outcastsTested.size}`);
  }
  if (state.runStats.bossesDefeated.length !== BOSSES.length) {
    errors.push(`Expected all ${BOSSES.length} Bosses defeated, got ${state.runStats.bossesDefeated.length}`);
  }

  return {
    finalHash: hashSimState(state),
    checkpoints,
    roomsVisited,
    bossesDefeated: [...state.runStats.bossesDefeated],
    outcastsTested: [...outcastsTested],
    totalTicks: state.tick,
    totalKills: state.player.kills,
    wallsDestroyed: state.runStats.wallsDestroyed,
    peakEnemies,
    peakProjectiles,
    peakPickups,
    peakCompanions,
    errors,
  };
}

function main(): void {
  console.log('=== KRUNKEDFALL Gate B: Deterministic Headless Campaign Soak ===');
  const seed = 20261125;
  const t0 = Date.now();
  const runA = runCampaignSoak(seed);
  const runB = runCampaignSoak(seed);
  const elapsedMs = Date.now() - t0;

  const failures: string[] = [...runA.errors];
  if (runB.errors.length > 0) {
    failures.push(...runB.errors.map((e) => `[Replay B] ${e}`));
  }

  if (runA.finalHash !== runB.finalHash) {
    failures.push(`Twin replay determinism mismatch! Run A=${runA.finalHash}, Run B=${runB.finalHash}`);
  }
  for (let i = 0; i < runA.checkpoints.length; i++) {
    const a = runA.checkpoints[i];
    const b = runB.checkpoints[i];
    if (!b || a.hash !== b.hash || a.tick !== b.tick) {
      failures.push(`Checkpoint '${a.stage}' diverged: A=${a.hash}@${a.tick} vs B=${b?.hash}@${b?.tick}`);
    }
  }

  console.log(`  [INFO] Campaign ticks simulated (per replay): ${runA.totalTicks} (${elapsedMs} ms total for twin replays)`);
  console.log(`  [INFO] Rooms visited (all BFS-verified): ${runA.roomsVisited}`);
  console.log(`  [INFO] Outcasts exercised (${runA.outcastsTested.length}/8): ${runA.outcastsTested.join(', ')}`);
  console.log(`  [INFO] Bosses defeated (${runA.bossesDefeated.length}/6): ${runA.bossesDefeated.join(', ')}`);
  console.log(`  [INFO] Kills: ${runA.totalKills} | Walls destroyed: ${runA.wallsDestroyed}`);
  console.log(
    `  [INFO] Peak counts — Enemies: ${runA.peakEnemies}/${MAX_ENEMIES}, Projectiles: ${runA.peakProjectiles}/${MAX_PROJECTILES}, Pickups: ${runA.peakPickups}/${MAX_PICKUPS}, Companions: ${runA.peakCompanions}/${MAX_COMPANIONS}`,
  );
  console.log(`  [INFO] Twin Replay FNV-1a Hash: Run A=${runA.finalHash} | Run B=${runB.finalHash}`);

  if (failures.length > 0) {
    console.error(`\n[Gate B FAILED] ${failures.length} failure(s):`);
    for (const f of failures.slice(0, 20)) {
      console.error(`  [FAIL] ${f}`);
    }
    process.exit(1);
  }

  console.log('\n[Gate B PASSED] Full campaign soak, BFS connectivity, bounds, and twin-replay determinism verified.');
}

main();
