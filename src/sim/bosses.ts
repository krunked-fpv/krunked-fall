// ============================================================================
// KRUNKEDFALL — All 6 Two-Phase Major Bosses
// ============================================================================
// Fenrir (Irradiated -> Meltdown), Skadi (Queen -> Warrior),
// Loki's Body (-> Overdrive), Hel (-> Hel Scorned),
// Surtur (-> Hate Incarnate), and Krunked (-> Corrupted Krunked).

import type {
  AmmoType,
  BossId,
  EnemyState,
  ProjectileState,
  SimState,
} from '../contracts/index.js';
import { getBossDef, getWeaponDef } from '../data/index.js';
import { resolveCircleVsTilemap } from './collision.js';
import {
  MAX_ENEMIES,
  MAX_PROJECTILES,
  addCameraTrauma,
  applyDamageToPlayer,
  createEnemyState,
  emitLokiComment,
  markNodeCleared,
  spawnPickup,
  triggerExplosion,
  triggerHitstop,
} from './combat.js';
import { computeRunModifiers } from './modGraph.js';
import { nextRange } from './rng.js';
import { damageTilesInRadius, findNearestWalkablePos } from './tilemap.js';

const BOSS_AMMO_SUPPLY_INTERVAL_TICKS = 420;

function getEquippedRangedAmmoTypes(state: SimState): AmmoType[] {
  const p = state.player;
  const types: AmmoType[] = [];
  const order: Array<0 | 1> = p.activeSlot === 0 ? [0, 1] : [1, 0];
  for (let i = 0; i < order.length; i++) {
    const wep = p.weapons[order[i]];
    if (!wep) continue;
    const def = getWeaponDef(wep.uniqueId);
    if (def.ammoType !== 0 && !types.includes(def.ammoType)) {
      types.push(def.ammoType);
    }
  }
  return types.length > 0 ? types : [1];
}

function computeBossAmmoPackValue(
  state: SimState,
  ammoType: AmmoType,
  fraction = 0.35,
): number {
  const maxVal = state.player.maxAmmo[ammoType] || 36;
  return Math.max(24, Math.round(maxVal * fraction));
}

function fireBossProjectile(
  state: SimState,
  boss: EnemyState,
  angle: number,
  speed: number,
  damage: number,
  color: string,
  opts: {
    radius?: number;
    lifeTicks?: number;
    burnTier?: number;
    freezeTier?: number;
    acidTier?: number;
    explosiveTier?: number;
    radioactiveTier?: number;
    heatseekingRate?: number;
    bouncesLeft?: number;
  } = {},
): void {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const proj: ProjectileState = {
    id: state.nextEntityId++,
    owner: 'enemy',
    x: boss.x + Math.cos(angle) * (boss.radius + 4),
    y: boss.y + Math.sin(angle) * (boss.radius + 4),
    prevX: boss.x,
    prevY: boss.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: opts.radius ?? 5,
    damage,
    damageType: opts.explosiveTier ? 1 : 2,
    speed,
    lifeTicks: opts.lifeTicks ?? 110,
    maxLifeTicks: opts.lifeTicks ?? 110,
    scale: 1.15,
    bouncesLeft: opts.bouncesLeft ?? 0,
    pierceLeft: 0,
    heatseekingRate: opts.heatseekingRate ?? 0,
    isMelee: false,
    burnTier: opts.burnTier ?? 0,
    freezeTier: opts.freezeTier ?? 0,
    acidTier: opts.acidTier ?? 0,
    explosiveTier: opts.explosiveTier ?? 0,
    radioactiveTier: opts.radioactiveTier ?? 0,
    lightningTier: 0,
    lifestealChance: 0,
    chainJump: false,
    ethereal: false,
    teleportOwner: false,
    goldDropBonus: false,
    ragnarokNova: false,
    color,
    spriteKey: 'proj_enemy',
  };
  state.projectiles.push(proj);
}

/**
 * Spawns one of the 6 Major Bosses in Phase 1, emitting `boss_spawn` and
 * boss music intro stem.
 */
export function spawnBossById(state: SimState, bossId: BossId): EnemyState {
  const bossDef = getBossDef(bossId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const loopMult = 1 + state.loopCount * 0.55;

  // Remove any previous active boss instance cleanly
  state.enemies = state.enemies.filter((e) => !e.isBoss);

  const arenaMidX = state.map.width * state.map.tileSize * 0.5;
  const arenaUpperY = Math.max(
    state.map.tileSize * 4,
    state.map.height * state.map.tileSize * 0.3,
  );
  const safe = findNearestWalkablePos(state.map, arenaMidX, arenaUpperY);

  const p1DefId = `boss_${bossId}_p1`;
  const boss = createEnemyState(state, p1DefId, safe.x, safe.y);
  const scaledHp = Math.round(bossDef.phase1Hp * runMods.enemyHpMult * loopMult);
  boss.hp = scaledHp;
  boss.maxHp = scaledHp;
  boss.radius = bossDef.radius;
  boss.isBoss = true;
  boss.bossId = bossId;
  boss.bossPhase = 1;
  boss.bossPatternIndex = 0;
  boss.bossTelegraph = null;
  boss.aiState = 'chase';
  boss.stateTimer = 45;
  boss.attackCooldown = 50;
  boss.tintColor = bossDef.accentColor;

  state.enemies.push(boss);
  state.activeBossId = bossId;
  state.map.exitUnlocked = false;
  if (state.screenMode !== 'combat') {
    state.screenMode = 'combat';
  }

  state.events.push({
    type: 'boss_spawn',
    bossId,
    name: bossDef.phase1Name,
    x: boss.x,
    y: boss.y,
  });
  state.events.push({
    type: 'music_change',
    trackKey: bossDef.musicKeyIntro,
    stem: 'intro',
  });
  state.events.push({
    type: 'floating_text',
    x: boss.x,
    y: boss.y - boss.radius - 14,
    text: bossDef.phase1Name,
    color: bossDef.accentColor,
    scale: 1.4,
  });
  addCameraTrauma(state, 0.5, 0, 1);

  return boss;
}

/**
 * Mid-fight Phase 1 -> Phase 2 boss transformation:
 * Refills HP to Phase 2 pool, activates invulnerable `phase_shift` burst,
 * shatters nearby cover, emits `boss_phase2` + `music_change` stem `'b'` + hitstop.
 */
export function transitionBossToPhase2(state: SimState, boss: EnemyState): void {
  if (!boss.bossId || boss.bossPhase === 2) return;
  const bossDef = getBossDef(boss.bossId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const loopMult = 1 + state.loopCount * 0.55;

  const p2Hp = Math.round(bossDef.phase2Hp * runMods.enemyHpMult * loopMult);
  boss.bossPhase = 2;
  boss.defId = `boss_${boss.bossId}_p2`;
  boss.hp = p2Hp;
  boss.maxHp = p2Hp;
  boss.tintColor = bossDef.phase2Color;
  boss.aiState = 'phase_shift';
  boss.stateTimer = 54;
  boss.attackCooldown = 36;
  boss.bossPatternIndex = 0;
  boss.bossTelegraph = {
    kind: 'ring',
    x: boss.x,
    y: boss.y,
    targetX: boss.x,
    targetY: boss.y,
    radius: 110,
    progress: 0,
    color: bossDef.phase2Color,
  };

  // Clear incoming enemy projectiles so player gets a fair phase shift beat
  state.projectiles = state.projectiles.filter((pr) => pr.owner === 'player');

  // Dramatic shockwave burst shattering nearby walls
  damageTilesInRadius(state, boss.x, boss.y, 88, 120);
  state.events.push({
    type: 'explosion',
    x: boss.x,
    y: boss.y,
    radius: 115,
    element: boss.bossId === 'skadi' ? 'freeze' : boss.bossId === 'fenrir' ? 'radioactive' : 'explosive',
    intensity: 1.35,
  });

  triggerHitstop(state, 4);
  addCameraTrauma(state, 0.9, 0, 1);

  state.events.push({
    type: 'boss_phase2',
    bossId: boss.bossId,
    name: bossDef.phase2Name,
    x: boss.x,
    y: boss.y,
  });
  state.events.push({
    type: 'music_change',
    trackKey: bossDef.musicKeyB,
    stem: 'b',
  });
  state.events.push({
    type: 'floating_text',
    x: boss.x,
    y: boss.y - boss.radius - 16,
    text: bossDef.phase2Name,
    color: bossDef.phase2Color,
    scale: 1.5,
  });

  // Drop 3 generous ammo supply pickups matching the player's equipped ranged weapon ammo types
  const p = state.player;
  const ammoTypes = getEquippedRangedAmmoTypes(state);
  const toPlayerAngle = Math.atan2(p.y - boss.y, p.x - boss.x);
  for (let i = 0; i < 3; i++) {
    const ammoType = ammoTypes[i % ammoTypes.length];
    const value = computeBossAmmoPackValue(state, ammoType, 0.35);
    if (i === 0) {
      // Launch one supply pack toward the player's side so long-range kiters receive Phase 2 resupply
      const dropX = p.x - Math.cos(toPlayerAngle) * 32;
      const dropY = p.y - Math.sin(toPlayerAngle) * 32;
      spawnPickup(state, 'ammo', dropX, dropY, { value, ammoType, lifeTicks: 36000 });
    } else {
      const spreadAngle = toPlayerAngle + (i === 1 ? 0.95 : -0.95);
      const dropX = boss.x + Math.cos(spreadAngle) * (boss.radius + 26);
      const dropY = boss.y + Math.sin(spreadAngle) * (boss.radius + 26);
      spawnPickup(state, 'ammo', dropX, dropY, { value, ammoType, lifeTicks: 36000 });
    }
  }
}

/**
 * Debug / Playtest helper to force the currently active boss into Phase 2.
 */
export function triggerActiveBossPhase2(state: SimState): boolean {
  const boss = state.enemies.find(
    (e) => e.isBoss && (state.activeBossId ? e.bossId === state.activeBossId : true),
  );
  if (!boss || boss.bossPhase === 2) return false;
  transitionBossToPhase2(state, boss);
  return true;
}

/**
 * Handles final Phase 2 boss defeat: records kill, unlocks Bifrost exit portal,
 * plays outro stem, drops celebratory loot, and triggers Victory on Krunked defeat.
 */
export function onBossDefeated(state: SimState, boss: EnemyState): void {
  if (!boss.bossId) return;
  const bossId = boss.bossId;
  const bossDef = getBossDef(bossId);

  if (!state.runStats.bossesDefeated.includes(bossId)) {
    state.runStats.bossesDefeated.push(bossId);
  }
  state.activeBossId = null;
  state.map.exitUnlocked = true;
  state.runStats.roomsCleared += 1;

  // Clear remaining boss projectiles & summons cleanly
  state.projectiles = state.projectiles.filter((pr) => pr.owner === 'player');
  markNodeCleared(state, state.currentNodeId);

  triggerHitstop(state, 4);
  addCameraTrauma(state, 0.95, 0, 1);

  state.events.push({
    type: 'explosion',
    x: boss.x,
    y: boss.y,
    radius: 130,
    element: 'explosive',
    intensity: 1.4,
  });
  state.events.push({
    type: 'boss_defeated',
    bossId,
    name: bossDef.phase2Name,
    x: boss.x,
    y: boss.y,
  });
  state.events.push({
    type: 'music_change',
    trackKey: bossDef.musicKeyOutro,
    stem: 'outro',
  });
  state.events.push({
    type: 'portal_open',
    x: state.map.exitX,
    y: state.map.exitY,
  });
  state.events.push({
    type: 'floating_text',
    x: boss.x,
    y: boss.y - 20,
    text: `${bossDef.phase2Name} DEFEATED!`,
    color: '#ffd700',
    scale: 1.45,
  });

  // Celebratory boss treasure burst
  for (let i = 0; i < 6; i++) {
    spawnPickup(state, 'gold', boss.x, boss.y, { value: 35 + bossDef.act * 15 });
  }
  spawnPickup(state, 'chest_weapon', boss.x - 24, boss.y + 12);
  spawnPickup(state, 'chest_mod', boss.x + 24, boss.y + 12);
  spawnPickup(state, 'hp', boss.x, boss.y + 20, { value: 40 });

  if (bossId === 'krunked') {
    emitLokiComment(state, 'krunked_defeat');
    state.screenMode = 'victory';
  } else {
    emitLokiComment(state, 'boss_kill');
  }
}

function getPatternKind(pattern: string): 'charge' | 'cone' | 'ring' | 'aoe' | 'beam' | 'summon' {
  if (
    pattern.includes('charge') ||
    pattern.includes('dash') ||
    pattern.includes('wall_shatter') ||
    pattern.includes('spear_lance')
  ) {
    return 'charge';
  }
  if (
    pattern.includes('cone') ||
    pattern.includes('fan') ||
    pattern.includes('volley') ||
    pattern.includes('blade') ||
    pattern.includes('scythe')
  ) {
    return 'cone';
  }
  if (
    pattern.includes('ring') ||
    pattern.includes('spiral') ||
    pattern.includes('star') ||
    pattern.includes('nova') ||
    pattern.includes('bifrost_storm')
  ) {
    return 'ring';
  }
  if (
    pattern.includes('slam') ||
    pattern.includes('meteor') ||
    pattern.includes('eruption') ||
    pattern.includes('salvo') ||
    pattern.includes('cataclysm')
  ) {
    return 'aoe';
  }
  if (
    pattern.includes('beam') ||
    pattern.includes('laser') ||
    pattern.includes('crossfire') ||
    pattern.includes('blink')
  ) {
    return 'beam';
  }
  return 'summon';
}

function executeBossPattern(
  state: SimState,
  boss: EnemyState,
  pattern: string,
  color: string,
): void {
  const p = state.player;
  const p2 = boss.bossPhase === 2;
  const baseDmg = p2 ? 22 + (state.act * 3) : 16 + (state.act * 2);
  const baseSpd = p2 ? 5.6 : 4.6;
  const aimAngle = Math.atan2(p.y - boss.y, p.x - boss.x);
  const kind = getPatternKind(pattern);

  const isFreeze = boss.bossId === 'skadi';
  const isRad = boss.bossId === 'fenrir';
  const isBurn = boss.bossId === 'surtur' || boss.bossId === 'krunked';
  const elemOpts = {
    burnTier: isBurn ? 2 : 0,
    freezeTier: isFreeze ? 2 : 0,
    radioactiveTier: isRad ? 2 : 0,
  };

  switch (kind) {
    case 'charge': {
      // High-velocity wall-crushing boss charge
      const chargeSpeed = p2 ? 7.4 : 5.8;
      boss.vx = Math.cos(aimAngle) * chargeSpeed;
      boss.vy = Math.sin(aimAngle) * chargeSpeed;
      boss.aiState = 'charge';
      boss.stateTimer = p2 ? 32 : 26;
      boss.bossTelegraph = null;
      addCameraTrauma(state, 0.25, Math.cos(aimAngle), Math.sin(aimAngle));
      // Also fire flanking projectiles in Phase 2
      if (p2) {
        for (let k = -2; k <= 2; k++) {
          fireBossProjectile(state, boss, aimAngle + k * 0.28, baseSpd, baseDmg * 0.85, color, elemOpts);
        }
      }
      return;
    }

    case 'cone': {
      const count = p2 ? 9 : 6;
      const spread = p2 ? 1.15 : 0.85;
      for (let i = 0; i < count; i++) {
        const frac = count > 1 ? i / (count - 1) - 0.5 : 0;
        const a = aimAngle + frac * spread;
        fireBossProjectile(state, boss, a, baseSpd * (0.9 + (i % 2) * 0.18), baseDmg, color, {
          ...elemOpts,
          bouncesLeft: boss.bossId === 'skadi' ? 1 : 0,
        });
      }
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 24 : 34;
      boss.bossTelegraph = null;
      return;
    }

    case 'ring': {
      const count = p2 ? 18 : 12;
      const offset = (state.tick * 0.13) % (Math.PI * 2);
      for (let i = 0; i < count; i++) {
        const a = offset + (Math.PI * 2 * i) / count;
        fireBossProjectile(state, boss, a, baseSpd * 0.92, baseDmg, color, {
          ...elemOpts,
          radius: 5.5,
          lifeTicks: 120,
        });
      }
      if (p2) {
        // Secondary offset spiral wave
        for (let i = 0; i < count; i++) {
          const a = offset + Math.PI / count + (Math.PI * 2 * i) / count;
          fireBossProjectile(state, boss, a, baseSpd * 0.65, baseDmg * 0.85, color, elemOpts);
        }
      }
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 26 : 38;
      boss.bossTelegraph = null;
      return;
    }

    case 'aoe': {
      const tx = boss.bossTelegraph?.targetX ?? p.x;
      const ty = boss.bossTelegraph?.targetY ?? p.y;
      const blastR = p2 ? 68 : 54;
      triggerExplosion(
        state,
        tx,
        ty,
        blastR,
        baseDmg * 1.15,
        isBurn ? 'burn' : isFreeze ? 'freeze' : 'explosive',
        'enemy',
        false,
      );
      // Radial shrapnel from blast center
      const shards = p2 ? 8 : 5;
      for (let i = 0; i < shards; i++) {
        const a = (Math.PI * 2 * i) / shards;
        fireBossProjectile(state, boss, a, baseSpd * 0.9, baseDmg * 0.8, color, elemOpts);
      }
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 24 : 36;
      boss.bossTelegraph = null;
      return;
    }

    case 'beam': {
      // Optional Bifrost blink reposition for Loki's Body / Krunked
      if (pattern.includes('blink') || pattern.includes('bifrost')) {
        const angle = nextRange(state, 0, Math.PI * 2);
        const dest = findNearestWalkablePos(
          state.map,
          p.x + Math.cos(angle) * 140,
          p.y + Math.sin(angle) * 140,
        );
        boss.x = dest.x;
        boss.y = dest.y;
      }
      const arms = p2 ? 4 : 2;
      for (let arm = 0; arm < arms; arm++) {
        const a = aimAngle + (Math.PI * 2 * arm) / arms;
        for (let k = 0; k < 4; k++) {
          fireBossProjectile(state, boss, a, baseSpd * (1.05 + k * 0.22), baseDmg, color, {
            ...elemOpts,
            radius: 6,
            lifeTicks: 95,
          });
        }
      }
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 22 : 34;
      boss.bossTelegraph = null;
      return;
    }

    case 'summon': {
      // Summon boss-themed minion(s) while keeping arena count bounded
      const minionId =
        boss.bossId === 'fenrir'
          ? 'bluewolf'
          : boss.bossId === 'skadi'
            ? 'snowwolf'
            : boss.bossId === 'loki_body'
              ? 'bodyclone'
              : boss.bossId === 'hel'
                ? 'helhand'
                : boss.bossId === 'surtur'
                  ? 'surturcrown'
                  : 'whiteraven';

      const maxSummons = p2 ? 2 : 1;
      const existingNonBoss = state.enemies.filter((e) => !e.isBoss).length;
      if (existingNonBoss < 6 && state.enemies.length < MAX_ENEMIES - 2) {
        for (let s = 0; s < maxSummons; s++) {
          const a = aimAngle + (s === 0 ? 1.1 : -1.1);
          const m = createEnemyState(
            state,
            minionId,
            boss.x + Math.cos(a) * (boss.radius + 26),
            boss.y + Math.sin(a) * (boss.radius + 26),
          );
          state.enemies.push(m);
        }
      }
      // Accompany summon with a pressure volley
      for (let i = -2; i <= 2; i++) {
        fireBossProjectile(state, boss, aimAngle + i * 0.22, baseSpd, baseDmg * 0.9, color, elemOpts);
      }
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 30 : 42;
      boss.bossTelegraph = null;
      return;
    }
  }
}

/**
 * Runs 1 tick of multi-pattern two-phase Boss AI for all 6 Major Bosses.
 */
export function stepBossAI(state: SimState, boss: EnemyState): void {
  if (!boss.bossId) return;
  const bossDef = getBossDef(boss.bossId);
  const p = state.player;

  // Periodic boss-fight ammo supply pack every ~420 ticks (7s) when active weapon ammo < 25% of max
  if (state.tick > 0 && state.tick % BOSS_AMMO_SUPPLY_INTERVAL_TICKS === 0) {
    const activeWep = p.weapons[p.activeSlot];
    const activeDef = activeWep ? getWeaponDef(activeWep.uniqueId) : null;
    const secondaryWep = p.weapons[p.activeSlot === 0 ? 1 : 0];
    const secondaryDef = secondaryWep ? getWeaponDef(secondaryWep.uniqueId) : null;
    const targetDef =
      activeDef && activeDef.ammoType !== 0
        ? activeDef
        : secondaryDef && secondaryDef.ammoType !== 0
          ? secondaryDef
          : null;

    if (targetDef && targetDef.ammoType !== 0) {
      const aType = targetDef.ammoType;
      const threshold = Math.max(targetDef.ammoCost, p.maxAmmo[aType] * 0.25);
      if (p.ammo[aType] < threshold) {
        const dropAngle = Math.atan2(boss.y - p.y, boss.x - p.x) + Math.PI * 0.45;
        const dropX = p.x + Math.cos(dropAngle) * 30;
        const dropY = p.y + Math.sin(dropAngle) * 30;
        const value = Math.max(
          targetDef.ammoCost * 2,
          computeBossAmmoPackValue(state, aType, 0.35),
        );
        spawnPickup(state, 'ammo', dropX, dropY, { value, ammoType: aType, lifeTicks: 36000 });
        state.events.push({
          type: 'floating_text',
          x: dropX,
          y: dropY - 12,
          text: 'AMMO SUPPLY!',
          color: '#ffbe0b',
          scale: 0.9,
        });
      }
    }
  }

  const runMods = computeRunModifiers(state.activeModifiers);
  const p2 = boss.bossPhase === 2;
  const color = p2 ? bossDef.phase2Color : bossDef.accentColor;

  const patterns = p2 ? bossDef.phase2Patterns : bossDef.phase1Patterns;
  const pattern = patterns[boss.bossPatternIndex % patterns.length] ?? 'lunge_charge';

  const dx = p.x - boss.x;
  const dy = p.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;
  boss.aimAngle = Math.atan2(dy, dx);
  boss.facing = dx >= 0 ? 1 : -1;

  // Phase 1 -> Phase 2 transformation invulnerable interval
  if (boss.aiState === 'phase_shift') {
    boss.stateTimer -= 1;
    if (boss.bossTelegraph) {
      boss.bossTelegraph.x = boss.x;
      boss.bossTelegraph.y = boss.y;
      boss.bossTelegraph.progress = Math.min(1, 1 - boss.stateTimer / 54);
    }
    if (boss.stateTimer <= 0) {
      boss.aiState = 'chase';
      boss.bossTelegraph = null;
      boss.stateTimer = 24;
      boss.attackCooldown = 28;
    }
    return;
  }

  const freezeMult = boss.status.freezeTicks > 0 ? 0.72 : 1;
  const shockMult = boss.status.shockTicks > 0 ? 0.55 : 1;
  const speedScale = runMods.enemySpeedMult * freezeMult * shockMult;

  // Charging state: high speed, smashes interior destructible walls (Fenrir/Surtur/Krunked/Skadi)
  if (boss.aiState === 'charge') {
    boss.stateTimer -= 1;
    // Destroy interior destructible walls & cover crates in path
    damageTilesInRadius(state, boss.x + boss.vx * 2, boss.y + boss.vy * 2, boss.radius + 8, 95);

    const res = resolveCircleVsTilemap(
      state.map,
      boss.x,
      boss.y,
      boss.vx * freezeMult,
      boss.vy * freezeMult,
      boss.radius,
      false,
    );
    boss.x = res.x;
    boss.y = res.y;

    if (res.hitX || res.hitY || boss.stateTimer <= 0) {
      boss.vx *= 0.25;
      boss.vy *= 0.25;
      boss.aiState = 'chase';
      boss.stateTimer = p2 ? 22 : 34;
      boss.attackCooldown = p2 ? 34 : 48;
      if (res.hitX || res.hitY) {
        addCameraTrauma(state, 0.35, 0, 1);
      }
    }

    // Contact collision with player during charge
    if (Math.hypot(p.x - boss.x, p.y - boss.y) <= boss.radius + p.radius) {
      applyDamageToPlayer(state, p2 ? 32 : 24, boss.x, boss.y);
    }
    return;
  }

  // Telegraph windup state: clear visual warning before unleashing pattern
  if (boss.aiState === 'telegraph') {
    const windupTotal = p2 ? 28 : 38;
    boss.stateTimer -= 1;
    if (boss.bossTelegraph) {
      boss.bossTelegraph.x = boss.x;
      boss.bossTelegraph.y = boss.y;
      boss.bossTelegraph.progress = Math.max(0, Math.min(1, 1 - boss.stateTimer / windupTotal));
      // Track player slightly during first half of windup for line/cone patterns
      if (boss.bossTelegraph.progress < 0.55 && boss.bossTelegraph.kind !== 'ring') {
        boss.bossTelegraph.targetX = p.x;
        boss.bossTelegraph.targetY = p.y;
      }
    }

    if (boss.stateTimer <= 0) {
      executeBossPattern(state, boss, pattern, color);
      boss.bossPatternIndex = (boss.bossPatternIndex + 1) % patterns.length;
      boss.attackCooldown = p2 ? 42 : 58;
    }
    return;
  }

  // Default chase / reposition state
  boss.attackCooldown -= 1;
  const baseMoveSpeed = (p2 ? 2.05 : 1.55) * speedScale;
  const desiredDist = boss.bossId === 'fenrir' || boss.bossId === 'surtur' ? 95 : 145;

  let moveX = 0;
  let moveY = 0;
  if (!p.isInvisible) {
    if (dist > desiredDist + 16) {
      moveX = (dx / dist) * baseMoveSpeed;
      moveY = (dy / dist) * baseMoveSpeed;
    } else if (dist < desiredDist - 24) {
      moveX = -(dx / dist) * baseMoveSpeed * 0.6;
      moveY = -(dy / dist) * baseMoveSpeed * 0.6;
    } else {
      // Strafe menacingly
      const strafeDir = (boss.bossPatternIndex % 2 === 0 ? 1 : -1);
      moveX = (-dy / dist) * baseMoveSpeed * 0.75 * strafeDir;
      moveY = (dx / dist) * baseMoveSpeed * 0.75 * strafeDir;
    }
  }

  boss.vx = boss.vx * 0.75 + moveX * 0.25;
  boss.vy = boss.vy * 0.75 + moveY * 0.25;
  const res = resolveCircleVsTilemap(state.map, boss.x, boss.y, boss.vx, boss.vy, boss.radius, false);
  boss.x = res.x;
  boss.y = res.y;
  boss.vx = res.vx;
  boss.vy = res.vy;

  // Contact damage
  if (Math.hypot(p.x - boss.x, p.y - boss.y) <= boss.radius + p.radius) {
    applyDamageToPlayer(state, p2 ? 28 : 20, boss.x, boss.y);
  }

  // Begin telegraphed attack pattern
  if (boss.attackCooldown <= 0 && !p.isInvisible) {
    const kind = getPatternKind(pattern);
    const windupTotal = p2 ? 28 : 38;
    const telegraphKind: 'line' | 'circle' | 'cone' | 'ring' =
      kind === 'charge' || kind === 'beam'
        ? 'line'
        : kind === 'cone'
          ? 'cone'
          : kind === 'ring'
            ? 'ring'
            : 'circle';

    boss.aiState = 'telegraph';
    boss.stateTimer = windupTotal;
    boss.bossTelegraph = {
      kind: telegraphKind,
      x: boss.x,
      y: boss.y,
      targetX: p.x,
      targetY: p.y,
      radius: telegraphKind === 'ring' ? 105 : telegraphKind === 'circle' ? (p2 ? 68 : 54) : 140,
      progress: 0,
      color,
    };
  }
}
