// ============================================================================
// KRUNKEDFALL — Deterministic 60 Hz Simulation Core Verification Suite
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  TileKind,
  type BossId,
  type InputFrame,
  type OutcastId,
  type ProjectileState,
} from '../src/contracts/index.js';
import {
  BOSSES,
  MODS,
  OUTCASTS,
  OVERWORLD_NODES,
  SKILL_NODES,
  WEAPONS,
  getOverworldNode,
  getWeaponDef,
} from '../src/data/index.js';
import {
  DEFAULT_FREEZE_THRESHOLD_TICKS,
  MAX_FROST_CRYSTALS,
  allocateSkillNode,
  applyDamageToEnemy,
  attachModToWeapon,
  buyShopOffer,
  computeEffectiveWeaponStats,
  createEmptyTileMap,
  createEnemyState,
  createInitialSimState,
  createRngState,
  damageTile,
  damageTilesInRadius,
  detachModFromWeapon,
  drainSimEvents,
  enterHub,
  enterNode,
  equipWeaponByUniqueId,
  generateNodeMap,
  getTileAt,
  getWeaponModLimit,
  hashSimState,
  setFreezeStormIntensity,
  setPlayerOutcast,
  setTileAt,
  spawnBossById,
  startNextLoop,
  stepProjectiles,
  stepSim,
  sweepProjectileVsTilemap,
  sweepSegmentVsCircle,
  tileToWorldCenter,
  triggerExplosion,
  upgradeWeaponGolden,
  useCampfireAction,
  verifyMapConnectivity,
} from '../src/sim/index.js';

function makeInput(partial: Partial<InputFrame> = {}): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimWorldX: 0,
    aimWorldY: 0,
    firePrimary: false,
    firePrimaryPressed: false,
    abilityPressed: false,
    powerPressed: false,
    swapWeaponPressed: false,
    interactPressed: false,
    reloadOrVentPressed: false,
    pausePressed: false,
    ...partial,
  };
}

function makeTestProjectile(
  id: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  overrides: Partial<ProjectileState> = {},
): ProjectileState {
  const speed = Math.hypot(vx, vy);
  return {
    id,
    owner: 'player',
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    radius: 3.5,
    damage: 25,
    damageType: 0,
    speed,
    lifeTicks: 30,
    maxLifeTicks: 30,
    scale: 1,
    bouncesLeft: 0,
    pierceLeft: 0,
    heatseekingRate: 0,
    isMelee: false,
    burnTier: 0,
    freezeTier: 0,
    acidTier: 0,
    explosiveTier: 0,
    radioactiveTier: 0,
    lightningTier: 0,
    lifestealChance: 0,
    chainJump: false,
    ethereal: false,
    teleportOwner: false,
    goldDropBonus: false,
    ragnarokNova: false,
    color: '#ffbe0b',
    spriteKey: 'proj_bullet',
    ...overrides,
  };
}

describe('KRUNKEDFALL Deterministic 60 Hz Simulation Core', () => {
  it('replays bit-for-bit deterministically across identical seed and 1,200-tick input tape', () => {
    const runReplay = (seed: number): string[] => {
      const state = createInitialSimState(seed, 'britta');
      enterNode(state, 'act1_canyon');
      state.godMode = true;
      const checkpoints: string[] = [];

      for (let t = 0; t < 1200; t++) {
        const angle = (t * 0.07) % (Math.PI * 2);
        const inp = makeInput({
          moveX: Math.cos(t * 0.045),
          moveY: Math.sin(t * 0.037),
          aimWorldX: state.player.x + Math.cos(angle) * 120,
          aimWorldY: state.player.y + Math.sin(angle) * 120,
          firePrimary: t % 5 !== 0,
          firePrimaryPressed: t % 5 === 1,
          abilityPressed: t % 110 === 20,
          powerPressed: t % 240 === 180,
          swapWeaponPressed: t % 300 === 150,
          interactPressed: t % 90 === 45,
          reloadOrVentPressed: t % 200 === 100,
        });
        stepSim(state, inp);
        drainSimEvents(state);
        if (t === 99 || t === 299 || t === 599 || t === 899 || t === 1199) {
          checkpoints.push(hashSimState(state));
        }
      }
      return checkpoints;
    };

    const runA = runReplay(424242);
    const runB = runReplay(424242);
    const runDiffSeed = runReplay(987654);

    expect(runA).toEqual(runB);
    expect(runA[4]).not.toBe(runDiffSeed[4]);
    expect(runA[4]).toMatch(/^[0-9a-f]{8}$/);
  });

  it('prevents wall and enemy tunneling via swept continuous collision at speeds 35, 50, and 80 px/tick', () => {
    const speeds = [35, 50, 80];

    for (const speed of speeds) {
      // 1. Direct wall sweep + live stepProjectiles test against 1-tile-thick wall
      const map = createEmptyTileMap(24, 16, 'canyon', TileKind.Floor);
      // Place a single 1-tile vertical barrier at tile x = 10
      for (let ty = 1; ty < 15; ty++) {
        setTileAt(map, 10, ty, TileKind.WallDestructible, 500);
      }

      const startX = tileToWorldCenter(8, map.tileSize); // 136px; wall spans [160, 176]
      const startY = tileToWorldCenter(8, map.tileSize); // 136px
      const hit = sweepProjectileVsTilemap(map, startX, startY, startX + speed, startY, 3, false);
      expect(hit, `Wall raycast missed at speed ${speed}`).not.toBeNull();
      expect(hit!.tileX).toBe(10);
      expect(hit!.x).toBeLessThanOrEqual(10 * map.tileSize + 0.01);

      // Diagonal sweep through 1-tile barrier
      const diagHit = sweepProjectileVsTilemap(
        map,
        startX,
        startY,
        startX + speed * 0.85,
        startY + speed * 0.52,
        3,
        false,
      );
      expect(diagHit, `Diagonal wall raycast missed at speed ${speed}`).not.toBeNull();
      expect(diagHit!.tileX).toBe(10);

      // Full stepProjectiles integration: projectile must NOT end up on far side (x > 176)
      const state = createInitialSimState(100 + speed, 'britta');
      enterNode(state, 'act1_canyon');
      state.map = map;
      state.enemies = [];
      state.projectiles = [makeTestProjectile(9001, startX, startY, speed, 0, { damage: 20 })];
      drainSimEvents(state);
      stepProjectiles(state);

      // Projectile must be consumed on wall hit (never surviving past wall x=176)
      expect(state.projectiles).toHaveLength(0);
      const events = drainSimEvents(state);
      expect(events.some((e) => e.type === 'projectile_hit' && e.isWall)).toBe(true);

      // 2. Enemy swept segment-vs-circle test at speed 35, 50, 80 against tiny radius=5 enemy
      const enemyX = startX + speed * 0.55;
      const enemyY = startY;
      const circleHit = sweepSegmentVsCircle(startX, startY, startX + speed, startY, enemyX, enemyY, 8.5);
      expect(circleHit, `Enemy sweep missed at speed ${speed}`).not.toBeNull();
      expect(circleHit!.t).toBeGreaterThan(0);
      expect(circleHit!.t).toBeLessThan(1);

      // Full stepProjectiles enemy hit test with open floor
      const openMap = createEmptyTileMap(30, 16, 'canyon', TileKind.Floor);
      state.map = openMap;
      const target = createEnemyState(state, 'rat', enemyX, enemyY);
      target.x = enemyX;
      target.y = enemyY;
      target.hp = 100;
      target.maxHp = 100;
      state.enemies = [target];
      state.projectiles = [makeTestProjectile(9002, startX, startY, speed, 0, { damage: 30 })];
      drainSimEvents(state);
      stepProjectiles(state);

      expect(target.hp, `Projectile tunneled past enemy at speed ${speed}`).toBeLessThan(100);
      expect(state.projectiles).toHaveLength(0);
    }
  });

  it('carves destructible interior walls (wall_crack -> wall_shatter -> Rubble) while keeping outer WallBedrock 100% indestructible', () => {
    const state = createInitialSimState(2025, 'britta');
    enterNode(state, 'act1_canyon');
    const map = createEmptyTileMap(20, 14, 'canyon', TileKind.Floor);
    setTileAt(map, 6, 6, TileKind.WallDestructible, 90);
    state.map = map;
    drainSimEvents(state);

    // Hit 1: 90 -> 55 (ratio 0.611 <= 0.66 -> emits wall_crack)
    expect(damageTile(state, 6, 6, 35)).toBe(false);
    expect(getTileAt(state.map, 6, 6)).toBe(TileKind.WallDestructible);
    let evs = drainSimEvents(state);
    expect(evs.some((e) => e.type === 'wall_crack' && e.tileX === 6 && e.tileY === 6)).toBe(true);

    // Hit 2: 55 -> 25 (ratio 0.278 <= 0.33 -> emits second wall_crack)
    expect(damageTile(state, 6, 6, 30)).toBe(false);
    evs = drainSimEvents(state);
    expect(evs.some((e) => e.type === 'wall_crack' && e.tileX === 6 && e.tileY === 6)).toBe(true);

    // Hit 3: 25 -> 0 -> shatters to Rubble & increments wallsDestroyed
    const prevDestroyed = state.runStats.wallsDestroyed;
    expect(damageTile(state, 6, 6, 30)).toBe(true);
    expect(getTileAt(state.map, 6, 6)).toBe(TileKind.Rubble);
    expect(state.runStats.wallsDestroyed).toBe(prevDestroyed + 1);
    evs = drainSimEvents(state);
    expect(evs.some((e) => e.type === 'wall_shatter' && e.tileX === 6 && e.tileY === 6)).toBe(true);

    // Outer bedrock perimeter immunity against damageTile, damageTilesInRadius, triggerExplosion, setTileAt
    const perimeterCoords: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [map.width - 1, 0],
      [0, 6],
      [map.width - 1, 6],
      [0, map.height - 1],
      [10, map.height - 1],
      [map.width - 1, map.height - 1],
    ];
    for (const [bx, by] of perimeterCoords) {
      expect(damageTile(state, bx, by, 9999)).toBe(false);
      setTileAt(state.map, bx, by, TileKind.Floor);
      expect(getTileAt(state.map, bx, by)).toBe(TileKind.WallBedrock);
    }

    damageTilesInRadius(state, 8, 8, 64, 9999);
    triggerExplosion(state, 8, 8, 80, 9999, 'explosive', 'player', true);
    for (let x = 0; x < map.width; x++) {
      expect(getTileAt(state.map, x, 0)).toBe(TileKind.WallBedrock);
      expect(getTileAt(state.map, x, map.height - 1)).toBe(TileKind.WallBedrock);
    }
    for (let y = 0; y < map.height; y++) {
      expect(getTileAt(state.map, 0, y)).toBe(TileKind.WallBedrock);
      expect(getTileAt(state.map, map.width - 1, y)).toBe(TileKind.WallBedrock);
    }
  });

  it('verifies BFS connectivity across 36 random seeds and all 45 overworld nodes', () => {
    // 1. All 45 overworld nodes
    for (let i = 0; i < OVERWORLD_NODES.length; i++) {
      const node = OVERWORLD_NODES[i];
      const rng = createRngState(7000 + i * 31);
      const world = generateNodeMap(rng, node);
      expect(
        verifyMapConnectivity(world.map),
        `Overworld node ${node.id} failed BFS connectivity`,
      ).toBe(true);

      // Verify outer perimeter is intact WallBedrock
      for (let x = 0; x < world.map.width; x++) {
        expect(getTileAt(world.map, x, 0)).toBe(TileKind.WallBedrock);
        expect(getTileAt(world.map, x, world.map.height - 1)).toBe(TileKind.WallBedrock);
      }
      for (let y = 0; y < world.map.height; y++) {
        expect(getTileAt(world.map, 0, y)).toBe(TileKind.WallBedrock);
        expect(getTileAt(world.map, world.map.width - 1, y)).toBe(TileKind.WallBedrock);
      }
    }

    // 2. 36 random seeds across varied procedural combat/arena/boss nodes
    const sampleNodes = [
      'act1_canyon',
      'act1_sandcity',
      'act1_arena',
      'act2_forest',
      'act2_milbase',
      'act3_redhall',
    ];
    for (let s = 0; s < 36; s++) {
      const node = getOverworldNode(sampleNodes[s % sampleNodes.length]);
      const rng = createRngState(100001 + s * 7919);
      const world = generateNodeMap(rng, node);
      expect(
        verifyMapConnectivity(world.map),
        `Seed ${100001 + s * 7919} on ${node.id} failed BFS connectivity`,
      ).toBe(true);
    }
  });

  it('executes ranged, melee, burst, windup, overheat lockout, ammo refund, and Gunilla Dual Wield weapons', () => {
    const state = createInitialSimState(555, 'britta');
    enterHub(state);
    state.godMode = true;

    // 1. Ranged weapon (Pistol 1015) consumes ammo and spawns projectile
    equipWeaponByUniqueId(state, 1015, 0);
    const startBullets = state.player.ammo[1];
    drainSimEvents(state);
    stepSim(
      state,
      makeInput({
        aimWorldX: state.player.x + 100,
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    expect(state.player.ammo[1]).toBeLessThan(startBullets);
    expect(state.projectiles.length).toBeGreaterThanOrEqual(1);
    expect(drainSimEvents(state).some((e) => e.type === 'weapon_fire')).toBe(true);

    // 2. Melee weapon (Axe 1001) consumes zero ammo and emits melee_slash
    equipWeaponByUniqueId(state, 1001, 0);
    state.projectiles = [];
    const ammoBeforeMelee = [...state.player.ammo];
    drainSimEvents(state);
    stepSim(
      state,
      makeInput({
        aimWorldX: state.player.x + 60,
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    expect(state.player.ammo).toEqual(ammoBeforeMelee);
    expect(drainSimEvents(state).some((e) => e.type === 'melee_slash')).toBe(true);

    // 3. Burst weapon (find any weapon with burstCount > 1 or attach mod_burst)
    const burstWep = WEAPONS.find((w) => w.burstCount > 1 && w.class === 0) ?? WEAPONS[0];
    equipWeaponByUniqueId(state, burstWep.uniqueId, 0);
    if (burstWep.burstCount <= 1) {
      attachModToWeapon(state, 'mod_burst', 0);
    }
    const firedBeforeBurst = state.player.shotsFired;
    stepSim(
      state,
      makeInput({
        aimWorldX: state.player.x + 120,
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    // Release trigger and step forward so queued burst shots fire autonomously
    for (let t = 0; t < 25; t++) {
      stepSim(state, makeInput({ aimWorldX: state.player.x + 120, aimWorldY: state.player.y }));
    }
    expect(state.player.shotsFired).toBeGreaterThan(firedBeforeBurst + 1);

    // 4. Windup weapon (find weapon with windupMax > 0)
    const windupWep = WEAPONS.find((w) => w.windupMax > 0);
    expect(windupWep).toBeDefined();
    equipWeaponByUniqueId(state, windupWep!.uniqueId, 0);
    const wInst = state.player.weapons[0]!;
    expect(wInst.windup).toBe(0);
    for (let t = 0; t < windupWep!.windupMax + 10; t++) {
      stepSim(
        state,
        makeInput({
          aimWorldX: state.player.x + 120,
          aimWorldY: state.player.y,
          firePrimary: true,
        }),
      );
    }
    expect(wInst.windup).toBeGreaterThan(0.5);

    // 5. Overheat lockout & active venting (find weapon with high overheat)
    const overheatWep =
      WEAPONS.find((w) => w.overheat > 0.25 && w.class === 0 && w.cooldown <= 12) ??
      WEAPONS.find((w) => w.overheat > 0 && w.class === 0)!;
    equipWeaponByUniqueId(state, overheatWep.uniqueId, 0);
    attachModToWeapon(state, 'mod_overloader', 0);
    attachModToWeapon(state, 'mod_turborune', 0);
    state.player.ammo = [0, 999, 999, 999, 999, 999];
    state.player.maxAmmo = [0, 999, 999, 999, 999, 999];
    let hitOverheat = false;
    let sawOverheatEvent = false;
    for (let t = 0; t < 400; t++) {
      stepSim(
        state,
        makeInput({
          aimWorldX: state.player.x + 120,
          aimWorldY: state.player.y,
          firePrimary: true,
        }),
      );
      const evs = drainSimEvents(state);
      if (evs.some((e) => e.type === 'floating_text' && e.text === 'OVERHEAT!')) {
        sawOverheatEvent = true;
      }
      if (state.player.weapons[0]!.overheatedLockTicks > 0) {
        hitOverheat = true;
        break;
      }
    }
    expect(hitOverheat).toBe(true);
    expect(sawOverheatEvent).toBe(true);

    // Verify locked weapon cannot fire until lockout finishes
    const shotsDuringLock = state.player.shotsFired;
    stepSim(
      state,
      makeInput({
        aimWorldX: state.player.x + 120,
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    expect(state.player.shotsFired).toBe(shotsDuringLock);

    // 6. Ammo refund (stack Endless Rune + Ammo Recycler -> 65% refund chance)
    const refundState = createInitialSimState(999, 'britta');
    enterHub(refundState);
    equipWeaponByUniqueId(refundState, 1015, 0);
    attachModToWeapon(refundState, 'rune_endless', 0);
    attachModToWeapon(refundState, 'mod_ammo_recycler', 0);
    refundState.player.ammo[1] = 200;
    const initialBullets = refundState.player.ammo[1];
    const startShots = refundState.player.shotsFired;
    for (let t = 0; t < 400; t++) {
      stepSim(
        refundState,
        makeInput({
          aimWorldX: refundState.player.x + 100,
          aimWorldY: refundState.player.y,
          firePrimary: true,
        }),
      );
    }
    const totalFired = refundState.player.shotsFired - startShots;
    const bulletsSpent = initialBullets - refundState.player.ammo[1];
    expect(totalFired).toBeGreaterThan(20);
    expect(bulletsSpent).toBeLessThan(totalFired);

    // 7. Gunilla Dual Wield fires both primary and offhand weapons simultaneously
    const gunillaState = createInitialSimState(777, 'gunilla');
    enterHub(gunillaState);
    expect(gunillaState.player.weapons[0]).not.toBeNull();
    expect(gunillaState.player.weapons[1]).not.toBeNull();
    drainSimEvents(gunillaState);
    stepSim(
      gunillaState,
      makeInput({
        aimWorldX: gunillaState.player.x + 120,
        aimWorldY: gunillaState.player.y,
        abilityPressed: true,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    expect(gunillaState.player.abilityActiveTicks).toBeGreaterThan(0);
    const fireEvents = drainSimEvents(gunillaState).filter((e) => e.type === 'weapon_fire');
    expect(fireEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('stacks and verifies EVERY ONE of the 76 mods measurably alters stats/behavior', () => {
    // Use a test weapon with nonzero spread, overheat > 0, and ammoCost >= 2 so EVERY mod delta is observable
    const baseWeapon = getWeaponDef(1015);
    const probeWeapon = {
      ...baseWeapon,
      ammoType: 1 as const,
      ammoCost: 2,
      cooldown: 18,
      projectileSpread: 12,
      overheat: 0.25,
      overheatFactor: 1,
      laserSight: false,
      burnTier: 0,
      freezeTier: 0,
      acidTier: 0,
      explosiveTier: 0,
      radioactiveTier: 0,
    };

    const baseline = computeEffectiveWeaponStats(probeWeapon, [], false, {});

    for (const mod of MODS) {
      const modded = computeEffectiveWeaponStats(probeWeapon, [mod.id], false, {});
      expect(
        JSON.stringify(modded),
        `Mod ${mod.id} (${mod.name}) produced zero measurable stat delta`,
      ).not.toBe(JSON.stringify(baseline));
    }

    // Verify multiplicative & additive multi-mod stacking
    const stacked = computeEffectiveWeaponStats(
      probeWeapon,
      ['mod_turbo', 'mod_heavy', 'mod_tripler', 'rune_ragnarok'],
      true,
      {},
    );
    expect(stacked.damage).toBeGreaterThan(baseline.damage * 2.2);
    expect(stacked.projectileAmount).toBe(baseline.projectileAmount + 2);
    expect(stacked.burnTier).toBeGreaterThanOrEqual(2);
    expect(stacked.explosiveTier).toBeGreaterThanOrEqual(2);
    expect(stacked.ragnarokNova).toBe(true);

    // Runtime behavioral checks for special mod mechanics
    const state = createInitialSimState(31415, 'britta');
    enterNode(state, 'act1_canyon');
    state.godMode = true;
    state.map = createEmptyTileMap(28, 18, 'canyon', TileKind.Floor);
    setTileAt(state.map, 12, 9, TileKind.WallDestructible, 500);
    state.player.x = tileToWorldCenter(8, state.map.tileSize);
    state.player.y = tileToWorldCenter(9, state.map.tileSize);
    state.enemies = [];

    // Ethereal shot passes through interior destructible wall!
    equipWeaponByUniqueId(state, 1015, 0);
    attachModToWeapon(state, 'rune_ethereal', 0);
    state.projectiles = [];
    stepSim(
      state,
      makeInput({
        aimWorldX: tileToWorldCenter(20, state.map.tileSize),
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    const ethProj = state.projectiles[0];
    expect(ethProj?.ethereal).toBe(true);
    let passedWall = false;
    for (let t = 0; t < 20; t++) {
      stepProjectiles(state);
      if (state.projectiles.some((pr) => pr.x > tileToWorldCenter(13, state.map.tileSize))) {
        passedWall = true;
        break;
      }
    }
    expect(passedWall).toBe(true);

    // Bounce ricochet reflects velocity off interior wall
    equipWeaponByUniqueId(state, 1015, 0);
    attachModToWeapon(state, 'rune_bounce', 0);
    state.projectiles = [];
    stepSim(
      state,
      makeInput({
        aimWorldX: tileToWorldCenter(12, state.map.tileSize),
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    const initBounces = state.projectiles[0]!.bouncesLeft;
    expect(initBounces).toBeGreaterThanOrEqual(4);
    let bounced = false;
    for (let t = 0; t < 25; t++) {
      stepProjectiles(state);
      if (state.projectiles.some((pr) => pr.bouncesLeft < initBounces && pr.vx < 0)) {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);

    // Homing steers projectile toward off-axis enemy
    state.map = createEmptyTileMap(28, 18, 'canyon', TileKind.Floor);
    const offAxisEnemy = createEnemyState(state, 'bandit', state.player.x + 110, state.player.y + 45);
    offAxisEnemy.x = state.player.x + 110;
    offAxisEnemy.y = state.player.y + 45;
    state.enemies = [offAxisEnemy];
    equipWeaponByUniqueId(state, 1015, 0);
    attachModToWeapon(state, 'mod_homingrune', 0);
    state.projectiles = [];
    stepSim(
      state,
      makeInput({
        aimWorldX: state.player.x + 120,
        aimWorldY: state.player.y,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    const homingProj = state.projectiles[0]!;
    const initVy = homingProj.vy;
    for (let t = 0; t < 6; t++) stepProjectiles(state);
    expect(homingProj.vy).toBeGreaterThan(initVy);

    // Chain jump redirects from enemy 1 to enemy 2
    const e1 = createEnemyState(state, 'bandit', state.player.x + 50, state.player.y);
    e1.x = state.player.x + 50;
    e1.y = state.player.y;
    e1.hp = 500;
    const e2 = createEnemyState(state, 'bandit', state.player.x + 50, state.player.y + 60);
    e2.x = state.player.x + 50;
    e2.y = state.player.y + 60;
    e2.hp = 500;
    state.enemies = [e1, e2];
    state.projectiles = [
      makeTestProjectile(8801, state.player.x + 10, state.player.y, 12, 0, {
        damage: 20,
        chainJump: true,
        lightningTier: 2,
      }),
    ];
    for (let t = 0; t < 20; t++) stepProjectiles(state);
    expect(e1.hp).toBeLessThan(500);
    expect(e2.hp).toBeLessThan(500);

    // Teleporter spawns shot near aimed cursor
    equipWeaponByUniqueId(state, 1015, 0);
    attachModToWeapon(state, 'mod_teleporter', 0);
    state.projectiles = [];
    const targetX = state.player.x + 150;
    const targetY = state.player.y;
    stepSim(
      state,
      makeInput({
        aimWorldX: targetX,
        aimWorldY: targetY,
        firePrimary: true,
        firePrimaryPressed: true,
      }),
    );
    expect(state.projectiles[0]!.x).toBeGreaterThan(state.player.x + 100);

    // Lifesteal heals wounded player & Ragnarok Nova emits explosion
    state.player.hp = 50;
    const dummy = createEnemyState(state, 'bandit', state.player.x + 40, state.player.y);
    dummy.x = state.player.x + 40;
    dummy.y = state.player.y;
    dummy.hp = 500;
    state.enemies = [dummy];
    drainSimEvents(state);
    state.projectiles = [
      makeTestProjectile(8802, state.player.x + 10, state.player.y, 10, 0, {
        damage: 40,
        lifestealChance: 1.0,
        ragnarokNova: true,
        burnTier: 2,
        explosiveTier: 2,
      }),
    ];
    for (let t = 0; t < 10; t++) stepProjectiles(state);
    expect(state.player.hp).toBeGreaterThan(50);
    expect(drainSimEvents(state).some((e) => e.type === 'explosion')).toBe(true);

    // Shield & Armor passive mod sync + Sentient Gun Drone spawning
    equipWeaponByUniqueId(state, 1015, 0);
    attachModToWeapon(state, 'rune_shield', 0);
    attachModToWeapon(state, 'mod_gun_drone', 0);
    stepSim(state, makeInput({ aimWorldX: state.player.x + 60, aimWorldY: state.player.y }));
    expect(state.player.maxShield).toBeGreaterThanOrEqual(25);
    expect(state.player.armor).toBeGreaterThanOrEqual(1);
    expect(state.companions.some((c) => c.kind === 'gun_drone')).toBe(true);
  });

  it('executes all 8 Outcasts Abilities and Powers cleanly without NaN or undefined errors', () => {
    const outcastIds: OutcastId[] = OUTCASTS.map((o) => o.id);

    for (const oid of outcastIds) {
      const state = createInitialSimState(4000 + outcastIds.indexOf(oid), oid);
      enterNode(state, 'act1_canyon');
      state.godMode = true;
      drainSimEvents(state);

      // Trigger Signature Ability
      stepSim(
        state,
        makeInput({
          moveX: 1,
          moveY: 0,
          aimWorldX: state.player.x + 90,
          aimWorldY: state.player.y,
          abilityPressed: true,
        }),
      );
      let evs = drainSimEvents(state);
      expect(
        evs.some((e) => e.type === 'ability_trigger' && e.outcastId === oid),
        `Ability did not trigger for ${oid}`,
      ).toBe(true);

      for (let t = 0; t < 45; t++) {
        stepSim(
          state,
          makeInput({
            moveX: Math.cos(t * 0.1),
            moveY: Math.sin(t * 0.1),
            aimWorldX: state.player.x + 100,
            aimWorldY: state.player.y,
            firePrimary: true,
          }),
        );
      }

      // Charge and trigger Ultimate Power
      state.player.powerCharge = state.player.powerChargeRequired;
      drainSimEvents(state);
      stepSim(
        state,
        makeInput({
          moveX: 1,
          moveY: 0,
          aimWorldX: state.player.x + 90,
          aimWorldY: state.player.y,
          powerPressed: true,
        }),
      );
      evs = drainSimEvents(state);
      expect(
        evs.some((e) => e.type === 'power_trigger' && e.outcastId === oid),
        `Power did not trigger for ${oid}`,
      ).toBe(true);

      for (let t = 0; t < 45; t++) {
        stepSim(
          state,
          makeInput({
            moveX: 0.6,
            moveY: -0.4,
            aimWorldX: state.player.x + 80,
            aimWorldY: state.player.y - 20,
            firePrimary: true,
          }),
        );
      }

      // Finite / non-NaN invariants across all entities
      expect(Number.isFinite(state.player.x)).toBe(true);
      expect(Number.isFinite(state.player.y)).toBe(true);
      expect(Number.isFinite(state.player.hp)).toBe(true);
      for (const e of state.enemies) {
        expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp)).toBe(true);
      }
      for (const pr of state.projectiles) {
        expect(Number.isFinite(pr.x) && Number.isFinite(pr.y)).toBe(true);
      }
      for (const c of state.companions) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
      }
    }
  });

  it('spawns, transitions Phase 1 -> Phase 2, and defeats all 6 Two-Phase Bosses plus Krunked Victory & Loop scaling', () => {
    const bossIds: BossId[] = BOSSES.map((b) => b.id);

    for (const bossId of bossIds) {
      const bossDef = BOSSES.find((b) => b.id === bossId)!;
      const state = createInitialSimState(8000 + bossIds.indexOf(bossId), 'britta');
      enterNode(state, bossDef.nodeId);
      state.godMode = true;

      let evs = drainSimEvents(state);
      expect(evs.some((e) => e.type === 'boss_spawn' && e.bossId === bossId)).toBe(true);
      expect(state.activeBossId).toBe(bossId);

      const boss = state.enemies.find((e) => e.isBoss && e.bossId === bossId)!;
      expect(boss).toBeDefined();
      expect(boss.bossPhase).toBe(1);

      // Step enough ticks so boss executes at least one telegraphed attack pattern
      let sawTelegraph = false;
      for (let t = 0; t < 160; t++) {
        stepSim(state, makeInput({ aimWorldX: boss.x, aimWorldY: boss.y }));
        if (boss.bossTelegraph !== null) sawTelegraph = true;
      }
      expect(sawTelegraph, `Boss ${bossId} never displayed a telegraph`).toBe(true);

      // Force lethal Phase 1 damage -> must transition cleanly to Phase 2
      drainSimEvents(state);
      applyDamageToEnemy(state, boss, boss.hp + 500, { forceCrit: true });
      evs = drainSimEvents(state);
      expect(boss.bossPhase).toBe(2);
      expect(boss.hp).toBeGreaterThan(0);
      expect(evs.some((e) => e.type === 'boss_phase2' && e.bossId === bossId)).toBe(true);
      expect(evs.some((e) => e.type === 'music_change' && e.stem === 'b')).toBe(true);

      // Step out of invulnerable phase_shift (54 ticks + hitstop)
      for (let t = 0; t < 75; t++) {
        stepSim(state, makeInput({ aimWorldX: boss.x, aimWorldY: boss.y }));
      }
      expect(boss.aiState).not.toBe('phase_shift');

      // Defeat Phase 2
      drainSimEvents(state);
      applyDamageToEnemy(state, boss, boss.hp + 500, { forceCrit: true });
      evs = drainSimEvents(state);
      expect(evs.some((e) => e.type === 'boss_defeated' && e.bossId === bossId)).toBe(true);
      expect(evs.some((e) => e.type === 'music_change' && e.stem === 'outro')).toBe(true);
      expect(state.runStats.bossesDefeated).toContain(bossId);
      expect(state.map.exitUnlocked).toBe(true);

      if (bossId === 'krunked') {
        expect(state.screenMode).toBe('victory');
        // Test Loop Mode scaling
        const loop0Canyon = createInitialSimState(9191, 'britta');
        enterNode(loop0Canyon, 'act1_canyon');
        const loop0AvgHp =
          loop0Canyon.enemies.reduce((s, e) => s + e.maxHp, 0) / Math.max(1, loop0Canyon.enemies.length);

        startNextLoop(state);
        expect(state.loopCount).toBe(1);
        expect(state.screenMode).toBe('combat');
        expect(state.currentNodeId).toBe('act1_canyon');
        const loop1AvgHp =
          state.enemies.reduce((s, e) => s + e.maxHp, 0) / Math.max(1, state.enemies.length);
        expect(loop1AvgHp).toBeGreaterThan(loop0AvgHp * 1.25);

        // Verify spawnBossById helper also works cleanly in Loop 1
        const loopFenrir = spawnBossById(state, 'fenrir');
        expect(loopFenrir.maxHp).toBeGreaterThan(BOSSES[0].phase1Hp);
      }
    }
  });

  it('escalates anti-camping Fimbulwinter Freeze Storm and spawns Frost Crystals', () => {
    const state = createInitialSimState(6060, 'britta');
    state.activeModifiers = ['mod_fimbulwinter_surge']; // 2.0x freeze rate
    enterNode(state, 'act1_canyon');
    state.godMode = true;
    // Place a single far-away passive training dummy so combat stays active without ending
    state.enemies = [createEnemyState(state, 'training_dummy', state.map.exitX, state.map.exitY)];
    state.map.exitUnlocked = false;
    drainSimEvents(state);

    let sawWarning = false;
    let sawCrystalSpawn = false;
    let sawFrostProj = false;

    // With 2x rate, thresholdTicks (2700) is crossed around tick 1350; run 1700 ticks
    for (let t = 0; t < Math.ceil(DEFAULT_FREEZE_THRESHOLD_TICKS / 2) + 350; t++) {
      stepSim(state, makeInput({ aimWorldX: state.player.x + 50, aimWorldY: state.player.y }));
      const evs = drainSimEvents(state);
      if (evs.some((e) => e.type === 'freeze_warning')) sawWarning = true;
      if (evs.some((e) => e.type === 'freeze_crystal_spawn')) sawCrystalSpawn = true;
      if (state.projectiles.some((pr) => pr.owner === 'frost')) sawFrostProj = true;
    }

    expect(sawWarning).toBe(true);
    expect(sawCrystalSpawn).toBe(true);
    expect(sawFrostProj).toBe(true);
    expect(state.freezeStorm.active).toBe(true);
    expect(state.freezeStorm.intensity).toBeGreaterThan(0);
    expect(state.freezeStorm.crystals.length).toBeGreaterThan(0);
    expect(state.freezeStorm.crystals.length).toBeLessThanOrEqual(MAX_FROST_CRYSTALS);

    // Direct setter & room-clear dissipation
    setFreezeStormIntensity(state, 1);
    expect(state.freezeStorm.intensity).toBe(1);
    state.enemies = [];
    for (let t = 0; t < 80; t++) {
      stepSim(state, makeInput());
    }
    expect(state.freezeStorm.intensity).toBe(0);
    expect(state.freezeStorm.active).toBe(false);
    expect(state.freezeStorm.crystals).toHaveLength(0);
  });

  it('supports Shop purchases, Campfire actions, Workbench attach/detach/golden, and Skill Tree allocation', () => {
    const state = createInitialSimState(7777, 'einar');
    enterHub(state);

    // 1. Skill Tree allocation (prereqs, Outcast restriction, maxRank, derived stats)
    state.player.skillPoints = 10;
    // Cannot allocate dependent skill before prerequisite
    expect(allocateSkillNode(state, 'skill_first_aid')).toBe(false);
    // Cannot allocate another Outcast's exclusive skill
    expect(allocateSkillNode(state, 'britta_powerful_berserk')).toBe(false);

    const prevMaxHp = state.player.maxHp;
    expect(allocateSkillNode(state, 'skill_fortitude')).toBe(true);
    expect(state.player.maxHp).toBe(prevMaxHp + 15);
    expect(allocateSkillNode(state, 'skill_ammo_pouches')).toBe(true);
    expect(allocateSkillNode(state, 'einar_turret_endurance')).toBe(true);

    // Verify all 42 skill nodes exist and prerequisite chain works
    expect(SKILL_NODES.length).toBe(42);
    expect(getWeaponModLimit(state.skillRanks)).toBe(4);

    // 2. Workbench: attach, mod-limit enforcement, detach, golden upgrade
    state.player.backpackMods = ['mod_turbo', 'mod_heavy', 'mod_firerune', 'mod_bounce', 'mod_scope'];
    expect(attachModToWeapon(state, 'mod_turbo', 0)).toBe(true);
    expect(attachModToWeapon(state, 'mod_heavy', 0)).toBe(true);
    expect(attachModToWeapon(state, 'mod_firerune', 0)).toBe(true);
    expect(attachModToWeapon(state, 'mod_bounce', 0)).toBe(true);
    // Exceeds mod limit (4)
    expect(attachModToWeapon(state, 'mod_scope', 0)).toBe(false);
    expect(state.player.weapons[0]!.mods).toHaveLength(4);

    // Detach returns mod to backpack
    expect(detachModFromWeapon(state, 'mod_heavy', 0)).toBe(true);
    expect(state.player.weapons[0]!.mods).toHaveLength(3);
    expect(state.player.backpackMods).toContain('mod_heavy');

    // Golden upgrade checks gold and boosts stats
    state.player.gold = 0;
    expect(upgradeWeaponGolden(state, 0, false)).toBe(false);
    state.player.gold = 2000;
    const preGoldenStats = computeEffectiveWeaponStats(
      getWeaponDef(state.player.weapons[0]!.uniqueId),
      state.player.weapons[0]!.mods,
      false,
      state.skillRanks,
    );
    expect(upgradeWeaponGolden(state, 0, false)).toBe(true);
    expect(state.player.weapons[0]!.golden).toBe(true);
    expect(upgradeWeaponGolden(state, 0, false)).toBe(false); // Cannot double-upgrade
    const postGoldenStats = computeEffectiveWeaponStats(
      getWeaponDef(state.player.weapons[0]!.uniqueId),
      state.player.weapons[0]!.mods,
      true,
      state.skillRanks,
    );
    expect(postGoldenStats.damage).toBeGreaterThan(preGoldenStats.damage * 1.3);
    expect(postGoldenStats.cooldown).toBeLessThan(preGoldenStats.cooldown);

    // 3. Shop node & purchases
    enterNode(state, 'act0_weaponshop');
    expect(state.screenMode).toBe('shop');
    expect(state.shopOffers.length).toBeGreaterThanOrEqual(5);
    const modOffer = state.shopOffers.find((o) => o.kind === 'mod')!;
    const goldBefore = state.player.gold;
    expect(buyShopOffer(state, modOffer.id)).toBe(true);
    expect(state.player.gold).toBe(goldBefore - modOffer.price);
    expect(buyShopOffer(state, modOffer.id)).toBe(false); // Already purchased

    // 4. Campfire node & rest actions
    enterNode(state, 'act1_campfire');
    expect(state.screenMode).toBe('campfire');
    state.player.hp = 20;
    expect(useCampfireAction(state, 'heal')).toBe(true);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.screenMode).toBe('overworld');

    enterNode(state, 'act1_campfire');
    state.player.ammo[1] = 0;
    expect(useCampfireAction(state, 'ammo')).toBe(true);
    expect(state.player.ammo[1]).toBe(state.player.maxAmmo[1]);

    enterNode(state, 'act1_campfire');
    const spBefore = state.player.skillPoints;
    expect(useCampfireAction(state, 'skill')).toBe(true);
    expect(state.player.skillPoints).toBe(spBefore + 1);

    // Campfire upgrade falls back to forging a bonus mod if active weapon is already golden
    enterNode(state, 'act1_campfire');
    const bpBefore = state.player.backpackMods.length;
    expect(useCampfireAction(state, 'upgrade')).toBe(true);
    expect(state.player.backpackMods.length).toBe(bpBefore + 1);

    // Outcast switch cleanly swaps loadout & stats
    setPlayerOutcast(state, 'hilda', 'krunkedslayer');
    expect(state.player.outcastId).toBe('hilda');
    expect(state.player.skinId).toBe('krunkedslayer');
  });
});
