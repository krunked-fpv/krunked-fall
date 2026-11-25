// ============================================================================
// KRUNKEDFALL — Master 60 Hz Deterministic Simulation Step & State Transitions
// ============================================================================
// Pure, DOM-free 60 Hz fixed-timestep loop, smooth look-ahead camera, Hub &
// Overworld transitions, Workbench modding, Shop, Campfire, Skill Tree, and
// infinite Loop Mode scaling.

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type AmmoType,
  type HubPanel,
  type InputFrame,
  type OutcastId,
  type PlayerState,
  type SimEvent,
  type SimState,
  type SkinId,
  type WeaponInstance,
} from '../contracts/index.js';
import {
  MOD_BY_ID,
  SKILL_NODE_BY_ID,
  getModDef,
  getOutcastDef,
  getOverworldNode,
  getWeaponDef,
} from '../data/index.js';
import {
  stepOutcastAbilities,
  updateCompanions,
  updateInputBuffers,
} from './abilities.js';
import { stepEnemies } from './ai.js';
import { spawnBossById } from './bosses.js';
import { resolveCircleVsTilemap } from './collision.js';
import {
  MAX_ENEMIES,
  checkPlayerLavaHazard,
  createEnemyState,
  emitLokiComment,
  markNodeCleared,
  pickRandomModForNode,
  spawnPickup,
  stepPickups,
  stepProjectiles,
  stepStatusEffects,
} from './combat.js';
import {
  createInitialFreezeStormState,
  resetFreezeStorm,
  stepFreezeStorm,
} from './freezeStorm.js';
import {
  computeEffectiveWeaponStats,
  getSkillEffectValue,
  getWeaponModLimit,
  syncPlayerDerivedStats,
} from './modGraph.js';
import { nextInt, normalizeSeed, pick } from './rng.js';
import { createWeaponInstance, stepWeapons } from './weaponExec.js';
import {
  generateHubLayout,
  generateNodeMap,
  generateShopOffers,
} from './worldgen.js';

const BASE_MAX_AMMO: readonly [number, number, number, number, number, number] = [
  0, // 0: Melee (infinite)
  240, // 1: Bullets
  72, // 2: Shells
  96, // 3: Bolts
  180, // 4: Energy
  36, // 5: Explosives
];

export function createNeutralInput(): InputFrame {
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
  };
}

function buildMaxAmmoTuple(
  skillRanks: Record<string, number>,
): [number, number, number, number, number, number] {
  const mult = getSkillEffectValue(skillRanks, 'max_ammo_mult', 1);
  return [
    0,
    Math.round(BASE_MAX_AMMO[1] * mult),
    Math.round(BASE_MAX_AMMO[2] * mult),
    Math.round(BASE_MAX_AMMO[3] * mult),
    Math.round(BASE_MAX_AMMO[4] * mult),
    Math.round(BASE_MAX_AMMO[5] * mult),
  ];
}

function snapCameraToPlayer(state: SimState): void {
  const mapW = state.map.width * state.map.tileSize;
  const mapH = state.map.height * state.map.tileSize;
  const halfW = LOGICAL_WIDTH * 0.5;
  const halfH = LOGICAL_HEIGHT * 0.5;

  const cx =
    mapW <= LOGICAL_WIDTH
      ? mapW * 0.5
      : Math.max(halfW, Math.min(mapW - halfW, state.player.x));
  const cy =
    mapH <= LOGICAL_HEIGHT
      ? mapH * 0.5
      : Math.max(halfH, Math.min(mapH - halfH, state.player.y));

  state.camera.x = cx;
  state.camera.y = cy;
  state.camera.prevX = cx;
  state.camera.prevY = cy;
  state.camera.shakeTrauma = 0;
}

function updateCamera(state: SimState, input: InputFrame): void {
  const cam = state.camera;
  const p = state.player;
  cam.prevX = cam.x;
  cam.prevY = cam.y;

  // 20% weighted look-ahead toward aimed world cursor (clamped to keep player framed)
  const rawDx = input.aimWorldX - p.x;
  const rawDy = input.aimWorldY - p.y;
  const lookAheadX = Math.max(-88, Math.min(88, rawDx * 0.2));
  const lookAheadY = Math.max(-56, Math.min(56, rawDy * 0.2));

  const mapW = state.map.width * state.map.tileSize;
  const mapH = state.map.height * state.map.tileSize;
  const halfW = LOGICAL_WIDTH * 0.5;
  const halfH = LOGICAL_HEIGHT * 0.5;

  let targetX = p.x + lookAheadX;
  let targetY = p.y + lookAheadY;

  if (mapW <= LOGICAL_WIDTH) {
    targetX = mapW * 0.5;
  } else {
    targetX = Math.max(halfW, Math.min(mapW - halfW, targetX));
  }

  if (mapH <= LOGICAL_HEIGHT) {
    targetY = mapH * 0.5;
  } else {
    targetY = Math.max(halfH, Math.min(mapH - halfH, targetY));
  }

  cam.x += (targetX - cam.x) * 0.16;
  cam.y += (targetY - cam.y) * 0.16;

  // Smooth exponential trauma decay
  if (cam.shakeTrauma > 0) {
    cam.shakeTrauma = Math.max(0, cam.shakeTrauma - 0.045);
  }

  // Smooth weapon zoomFactor blending
  const activeWep = p.weapons[p.activeSlot];
  const targetZoom = activeWep ? Math.max(0.85, Math.min(1.25, getWeaponDef(activeWep.uniqueId).zoomFactor || 1)) : 1;
  cam.zoom += (targetZoom - cam.zoom) * 0.12;
}

/**
 * Creates a fresh deterministic `SimState` positioned in the Outpost Hub
 * ready for Title screen -> Play -> Hub/Combat flow.
 */
export function createInitialSimState(
  seed = 1337,
  outcastId: OutcastId = 'britta',
  skinId: SkinId = 'original',
): SimState {
  const normSeed = normalizeSeed(seed);
  const outcast = getOutcastDef(outcastId);
  const hubWorld = generateHubLayout();
  const maxAmmo = buildMaxAmmoTuple({});

  const primaryWep: WeaponInstance = {
    instanceId: 1,
    uniqueId: outcast.startingWeaponUniqueId,
    golden: false,
    mods: [],
    overheat: 0,
    overheatedLockTicks: 0,
    windup: 0,
    cooldownTicks: 0,
    burstRemaining: 0,
    burstTicks: 0,
    recoilOffset: 0,
    recoilAngle: 0,
    flashTicks: 0,
    kills: 0,
  };

  const secondaryWep: WeaponInstance | null =
    outcast.secondaryWeaponUniqueId !== undefined
      ? {
          instanceId: 2,
          uniqueId: outcast.secondaryWeaponUniqueId,
          golden: false,
          mods: [],
          overheat: 0,
          overheatedLockTicks: 0,
          windup: 0,
          cooldownTicks: 0,
          burstRemaining: 0,
          burstTicks: 0,
          recoilOffset: 0,
          recoilAngle: 0,
          flashTicks: 0,
          kills: 0,
        }
      : null;

  const player: PlayerState = {
    x: hubWorld.map.spawnX,
    y: hubWorld.map.spawnY,
    prevX: hubWorld.map.spawnX,
    prevY: hubWorld.map.spawnY,
    vx: 0,
    vy: 0,
    aimAngle: 0,
    facing: 1,
    radius: 6.5,
    hp: outcast.maxHp,
    maxHp: outcast.maxHp,
    shield: 0,
    maxShield: 0,
    armor: 0,
    outcastId: outcast.id,
    skinId,
    xp: 0,
    xpToNext: 100,
    level: 1,
    gold: 150,
    skillPoints: 2,
    ammo: [...maxAmmo] as [number, number, number, number, number, number],
    maxAmmo,
    weapons: [primaryWep, secondaryWep],
    activeSlot: 0,
    backpackMods: ['mod_turbo', 'mod_firerune'],
    abilityCooldown: 0,
    abilityCharges: outcast.abilityMaxCharges,
    abilityMaxCharges: outcast.abilityMaxCharges,
    abilityActiveTicks: 0,
    powerCharge: 0,
    powerChargeRequired: outcast.powerChargeRequired,
    powerActiveTicks: 0,
    iframes: 0,
    hitFlashTicks: 0,
    dashVx: 0,
    dashVy: 0,
    dashTicks: 0,
    isInvisible: false,
    isInvulnerable: false,
    speedBonusTicks: 0,
    bufferedInput: {
      fire: 0,
      ability: 0,
      power: 0,
      swap: 0,
    },
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    animFrame: 0,
    animTimer: 0,
    stepTimer: 0,
  };

  const state: SimState = {
    seed: normSeed,
    rngState: normSeed,
    tick: 0,
    hitstopTicks: 0,
    screenMode: 'title',
    hubPanel: 'none',
    paused: false,
    act: 0,
    loopCount: 0,
    currentNodeId: 'act0_hub',
    clearedNodeIds: ['act0_hub'],
    unlockedNodeIds: ['act0_hub', 'act0_weaponshop', 'act0_easytraining', 'act1_canyon'],
    activeModifiers: [],
    skillRanks: {},
    player,
    map: hubWorld.map,
    enemies: [],
    projectiles: [],
    pickups: [],
    companions: [],
    freezeStorm: createInitialFreezeStormState(),
    hubInteractables: hubWorld.hubInteractables,
    activeBossId: null,
    shopOffers: [],
    camera: {
      x: hubWorld.map.spawnX,
      y: hubWorld.map.spawnY,
      prevX: hubWorld.map.spawnX,
      prevY: hubWorld.map.spawnY,
      shakeTrauma: 0,
      shakeDirX: 0,
      shakeDirY: 0,
      zoom: 1,
    },
    events: [],
    runStats: {
      elapsedTicks: 0,
      roomsCleared: 0,
      bossesDefeated: [],
      wallsDestroyed: 0,
      modsAttached: 0,
      score: 0,
    },
    lokiToast: null,
    godMode: false,
    nextEntityId: 10,
  };

  // Spawn hub shooting-range training dummy
  if (hubWorld.spawnPoints.length > 0) {
    const pt = hubWorld.spawnPoints[0];
    state.enemies.push(createEnemyState(state, 'training_dummy', pt.x, pt.y));
  }

  snapCameraToPlayer(state);
  return state;
}

/**
 * Drains and returns all queued `SimEvent`s since the previous drain.
 */
export function drainSimEvents(state: SimState): SimEvent[] {
  if (state.events.length === 0) return [];
  const drained = state.events.slice();
  state.events.length = 0;
  return drained;
}

/**
 * Enters the Three-Rock Outpost Hub, restoring HP & ammo and resetting room entities.
 */
export function enterHub(state: SimState): SimState {
  const hubWorld = generateHubLayout();
  state.screenMode = 'hub';
  state.hubPanel = 'none';
  state.paused = false;
  state.act = 0;
  state.currentNodeId = 'act0_hub';
  state.activeBossId = null;
  state.map = hubWorld.map;
  state.hubInteractables = hubWorld.hubInteractables;
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.companions = [];
  state.shopOffers = [];
  resetFreezeStorm(state);

  const p = state.player;
  p.x = hubWorld.map.spawnX;
  p.y = hubWorld.map.spawnY;
  p.prevX = p.x;
  p.prevY = p.y;
  p.vx = 0;
  p.vy = 0;
  p.hp = p.maxHp;
  p.shield = p.maxShield;
  p.iframes = 0;
  p.dashTicks = 0;
  p.isInvisible = false;
  p.isInvulnerable = false;
  p.abilityCharges = p.abilityMaxCharges;
  p.abilityCooldown = 0;
  p.abilityActiveTicks = 0;
  p.powerActiveTicks = 0;
  for (let a = 1; a <= 5; a++) {
    const idx = a as AmmoType;
    p.ammo[idx] = p.maxAmmo[idx];
  }

  if (hubWorld.spawnPoints.length > 0) {
    const pt = hubWorld.spawnPoints[0];
    state.enemies.push(createEnemyState(state, 'training_dummy', pt.x, pt.y));
  }

  snapCameraToPlayer(state);
  state.events.push({
    type: 'music_change',
    trackKey: 'music_hub',
    stem: 'a',
    ambienceKey: 'ambience_hub',
  });
  return state;
}

/**
 * Transitions cleanly to the Bifrost Overworld Map screen.
 */
export function enterOverworld(state: SimState): SimState {
  state.screenMode = 'overworld';
  state.hubPanel = 'none';
  state.paused = false;
  state.activeBossId = null;
  state.projectiles.length = 0;
  state.companions.length = 0;
  resetFreezeStorm(state);

  state.events.push({
    type: 'music_change',
    trackKey: 'music_worldmap',
    stem: 'a',
  });
  return state;
}

/**
 * Enters any named Overworld node (`act0_hub`, `act1_canyon`, `act1_darkcity`,
 * `act3_shrine`, shops, campfires, arenas, training grounds, etc.).
 */
export function enterNode(state: SimState, nodeId: string): SimState {
  const node = getOverworldNode(nodeId);
  if (node.nodeType === 'hub') {
    return enterHub(state);
  }

  const prevAct = state.act;
  state.currentNodeId = node.id;
  state.act = node.act;
  state.hubPanel = 'none';
  state.paused = false;
  state.activeBossId = null;
  state.enemies = [];
  state.projectiles = [];
  state.pickups = [];
  state.companions = [];
  state.hubInteractables = [];
  state.shopOffers = [];
  resetFreezeStorm(state);

  if (!state.unlockedNodeIds.includes(node.id)) {
    state.unlockedNodeIds.push(node.id);
  }

  const world = generateNodeMap(state, node);
  state.map = world.map;

  const p = state.player;
  p.x = world.map.spawnX;
  p.y = world.map.spawnY;
  p.prevX = p.x;
  p.prevY = p.y;
  p.vx = 0;
  p.vy = 0;
  p.dashTicks = 0;
  p.iframes = 30;
  p.isInvisible = false;
  p.isInvulnerable = false;
  p.shield = p.maxShield;

  snapCameraToPlayer(state);

  if (node.nodeType === 'shop') {
    state.screenMode = 'shop';
    state.map.exitUnlocked = true;
    state.shopOffers = generateShopOffers(state);
    markNodeCleared(state, node.id);
    state.events.push({ type: 'music_change', trackKey: node.musicKey, stem: 'a' });
    return state;
  }

  if (node.nodeType === 'campfire') {
    state.screenMode = 'campfire';
    state.map.exitUnlocked = true;
    state.events.push({ type: 'music_change', trackKey: node.musicKey, stem: 'a' });
    return state;
  }

  state.screenMode = 'combat';

  if (node.nodeType === 'boss' && node.bossId) {
    spawnBossById(state, node.bossId);
    return state;
  }

  // Spawn chests
  for (let i = 0; i < world.chestPoints.length; i++) {
    const pt = world.chestPoints[i];
    const kind =
      i % 3 === 0 ? 'chest_weapon' : i % 3 === 1 ? 'chest_mod' : 'chest_gold';
    spawnPickup(state, kind, pt.x, pt.y);
  }

  // Spawn enemies scaled cleanly by node difficulty, room count, and loop count
  const pool = node.enemyPool.length > 0 ? node.enemyPool : ['bandit'];
  const baseCount =
    node.nodeType === 'stash'
      ? 2
      : node.nodeType === 'training'
        ? 5
        : node.nodeType === 'arena'
          ? 12 + node.difficultyTier
          : 5 + node.roomCount * 2 + Math.floor(node.difficultyTier * 0.75);
  const totalEnemies = Math.min(
    MAX_ENEMIES - 12,
    Math.round(baseCount * (1 + state.loopCount * 0.25)),
  );

  for (let i = 0; i < totalEnemies; i++) {
    const pt = world.spawnPoints[i % world.spawnPoints.length];
    const jitterX = nextInt(state, -12, 12);
    const jitterY = nextInt(state, -12, 12);
    const defId =
      node.nodeType === 'training' && i === 0 ? 'training_dummy' : pick(state, pool);
    state.enemies.push(createEnemyState(state, defId, pt.x + jitterX, pt.y + jitterY));
  }

  state.events.push({
    type: 'music_change',
    trackKey: node.musicKey,
    stem: 'a',
    ambienceKey: node.ambienceKey,
  });
  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 22,
    text: node.displayName,
    color: '#ffd700',
    scale: 1.25,
  });

  if (node.act !== prevAct && (node.act === 1 || node.act === 2 || node.act === 3)) {
    emitLokiComment(state, `act${node.act}` as 'act1' | 'act2' | 'act3');
  }

  return state;
}

/**
 * Switches the active Playable Outcast (at Jotunn-Matic 3000 or via DebugBridge),
 * updating stats, starting loadout, ability charges, and power requirements.
 */
export function setPlayerOutcast(
  state: SimState,
  outcastId: OutcastId,
  skinId?: SkinId,
): SimState {
  const outcast = getOutcastDef(outcastId);
  const p = state.player;
  const hpBonus = getSkillEffectValue(state.skillRanks, 'max_hp_add', 0);
  const powerCostMult = getSkillEffectValue(state.skillRanks, 'power_cost_mult', 1);

  p.outcastId = outcast.id;
  if (skinId) p.skinId = skinId;

  p.maxHp = outcast.maxHp + hpBonus + (p.level - 1) * 5;
  p.hp = p.maxHp;
  p.abilityMaxCharges = outcast.abilityMaxCharges;
  p.abilityCharges = outcast.abilityMaxCharges;
  p.abilityCooldown = 0;
  p.abilityActiveTicks = 0;
  p.powerChargeRequired = Math.max(30, Math.round(outcast.powerChargeRequired * powerCostMult));
  p.powerActiveTicks = 0;
  p.dashTicks = 0;
  p.isInvisible = false;
  p.isInvulnerable = false;

  p.weapons[0] = createWeaponInstance(state, outcast.startingWeaponUniqueId, false);
  p.weapons[1] =
    outcast.secondaryWeaponUniqueId !== undefined
      ? createWeaponInstance(state, outcast.secondaryWeaponUniqueId, false)
      : null;
  p.activeSlot = 0;

  state.companions.length = 0;
  const activeStats = computeEffectiveWeaponStats(
    getWeaponDef(p.weapons[0].uniqueId),
    p.weapons[0].mods,
    p.weapons[0].golden,
    state.skillRanks,
  );
  syncPlayerDerivedStats(state, activeStats);

  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 18,
    text: `${outcast.name} READY`,
    color: outcast.accentColor,
    scale: 1.15,
  });

  return state;
}

/**
 * Equips any of the 221 weapons by `uniqueId` into slot 0 or slot 1.
 */
export function equipWeaponByUniqueId(
  state: SimState,
  uniqueId: number,
  slot?: 0 | 1,
): WeaponInstance {
  const targetSlot: 0 | 1 = slot ?? state.player.activeSlot;
  const inst = createWeaponInstance(state, uniqueId, false);
  const def = getWeaponDef(inst.uniqueId);

  state.player.weapons[targetSlot] = inst;
  if (def.ammoType !== 0) {
    const idx = def.ammoType;
    state.player.ammo[idx] = Math.min(
      state.player.maxAmmo[idx],
      Math.max(state.player.ammo[idx], Math.round(state.player.maxAmmo[idx] * 0.5)),
    );
  }

  const active = state.player.weapons[state.player.activeSlot];
  if (active) {
    const stats = computeEffectiveWeaponStats(
      getWeaponDef(active.uniqueId),
      active.mods,
      active.golden,
      state.skillRanks,
    );
    syncPlayerDerivedStats(state, stats);
  }

  return inst;
}

/**
 * Attaches a weapon mod / Norse rune to the chosen weapon slot.
 * Consumes one copy from `player.backpackMods` if present.
 */
export function attachModToWeapon(
  state: SimState,
  modId: string,
  slot: 0 | 1 = state.player.activeSlot,
): boolean {
  if (!MOD_BY_ID.has(modId)) return false;
  const weapon = state.player.weapons[slot];
  if (!weapon) return false;

  const limit = getWeaponModLimit(state.skillRanks);
  if (weapon.mods.length >= limit) return false;

  const bpIdx = state.player.backpackMods.indexOf(modId);
  if (bpIdx >= 0) {
    state.player.backpackMods.splice(bpIdx, 1);
  }

  weapon.mods.push(modId);
  state.runStats.modsAttached += 1;

  const active = state.player.weapons[state.player.activeSlot];
  if (active) {
    const stats = computeEffectiveWeaponStats(
      getWeaponDef(active.uniqueId),
      active.mods,
      active.golden,
      state.skillRanks,
    );
    syncPlayerDerivedStats(state, stats);
  }

  const modDef = getModDef(modId);
  state.events.push({
    type: 'floating_text',
    x: state.player.x,
    y: state.player.y - 16,
    text: `+${modDef.name}`,
    color: modDef.accentColor,
  });
  emitLokiComment(state, 'mod_attach');
  return true;
}

/**
 * Detaches a weapon mod by slot array index OR by modId, returning it to
 * `player.backpackMods`.
 */
export function detachModFromWeapon(
  state: SimState,
  modSlotOrId: number | string,
  slot: 0 | 1 = state.player.activeSlot,
): boolean {
  const weapon = state.player.weapons[slot];
  if (!weapon) return false;

  const idx =
    typeof modSlotOrId === 'number'
      ? modSlotOrId
      : weapon.mods.indexOf(modSlotOrId);
  if (idx < 0 || idx >= weapon.mods.length) return false;

  const [removed] = weapon.mods.splice(idx, 1);
  state.player.backpackMods.push(removed);

  const active = state.player.weapons[state.player.activeSlot];
  if (active) {
    const stats = computeEffectiveWeaponStats(
      getWeaponDef(active.uniqueId),
      active.mods,
      active.golden,
      state.skillRanks,
    );
    syncPlayerDerivedStats(state, stats);
  }
  return true;
}

/**
 * Upgrades a weapon to its Golden variant (+35% damage, +15% fire rate, -20% overheat).
 */
export function upgradeWeaponGolden(
  state: SimState,
  slot: 0 | 1 = state.player.activeSlot,
  free = false,
): boolean {
  const weapon = state.player.weapons[slot];
  if (!weapon || weapon.golden) return false;

  const def = getWeaponDef(weapon.uniqueId);
  const goldCost = Math.max(150, (def.goldenCost || 4) * 50);

  if (!free) {
    if (state.player.gold < goldCost) return false;
    state.player.gold -= goldCost;
  }

  weapon.golden = true;
  state.events.push({
    type: 'floating_text',
    x: state.player.x,
    y: state.player.y - 18,
    text: `GOLDEN ${def.name}!`,
    color: '#ffd700',
    scale: 1.25,
  });
  return true;
}

/**
 * Purchases a Weapon Shop offer using `player.gold`.
 */
export function buyShopOffer(state: SimState, offerId: string): boolean {
  const offer = state.shopOffers.find((o) => o.id === offerId && !o.purchased);
  if (!offer) return false;
  const p = state.player;
  if (p.gold < offer.price) return false;

  p.gold -= offer.price;
  offer.purchased = true;

  switch (offer.kind) {
    case 'weapon': {
      const targetSlot: 0 | 1 = p.weapons[1] === null ? 1 : p.activeSlot;
      if (offer.weaponUniqueId !== undefined) {
        equipWeaponByUniqueId(state, offer.weaponUniqueId, targetSlot);
      }
      state.events.push({ type: 'pickup_collect', kind: 'weapon', x: p.x, y: p.y, label: offer.name });
      break;
    }
    case 'mod': {
      if (offer.modId) {
        p.backpackMods.push(offer.modId);
      }
      state.events.push({ type: 'pickup_collect', kind: 'mod', x: p.x, y: p.y, label: offer.name });
      break;
    }
    case 'heal': {
      p.hp = p.maxHp;
      state.events.push({ type: 'pickup_collect', kind: 'hp', x: p.x, y: p.y, label: 'FULL HP' });
      break;
    }
    case 'ammo': {
      for (let a = 1; a <= 5; a++) {
        const idx = a as AmmoType;
        p.ammo[idx] = p.maxAmmo[idx];
      }
      state.events.push({ type: 'pickup_collect', kind: 'ammo', x: p.x, y: p.y, label: 'FULL AMMO' });
      break;
    }
    case 'golden_upgrade': {
      upgradeWeaponGolden(state, p.activeSlot, true);
      break;
    }
  }

  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 16,
    text: `BOUGHT ${offer.name}`,
    color: '#ffd700',
  });
  return true;
}

/**
 * Executes a Campfire rest action (`heal`, `ammo`, `upgrade`, `skill`).
 */
export function useCampfireAction(
  state: SimState,
  action: 'heal' | 'ammo' | 'upgrade' | 'skill',
): boolean {
  const p = state.player;

  switch (action) {
    case 'heal': {
      p.hp = p.maxHp;
      p.shield = p.maxShield;
      state.events.push({ type: 'floating_text', x: p.x, y: p.y - 16, text: 'RESTED: FULL HP!', color: '#52b788' });
      break;
    }
    case 'ammo': {
      for (let a = 1; a <= 5; a++) {
        const idx = a as AmmoType;
        p.ammo[idx] = p.maxAmmo[idx];
      }
      state.events.push({ type: 'floating_text', x: p.x, y: p.y - 16, text: 'AMMO RESUPPLIED!', color: '#ffbe0b' });
      break;
    }
    case 'upgrade': {
      const upgraded = upgradeWeaponGolden(state, p.activeSlot, true);
      if (!upgraded) {
        const bonusMod = pickRandomModForNode(state);
        p.backpackMods.push(bonusMod);
        state.events.push({
          type: 'floating_text',
          x: p.x,
          y: p.y - 16,
          text: `FORGED ${getModDef(bonusMod).name}`,
          color: '#c77dff',
        });
      }
      break;
    }
    case 'skill': {
      p.skillPoints += 1;
      state.events.push({ type: 'floating_text', x: p.x, y: p.y - 16, text: '+1 SKILL POINT!', color: '#ffd700' });
      break;
    }
  }

  markNodeCleared(state, state.currentNodeId);
  state.map.exitUnlocked = true;
  if (state.screenMode === 'campfire') {
    enterOverworld(state);
  }
  return true;
}

/**
 * Launches infinite Loop Mode (`loopCount += 1`) after defeating Corrupted
 * Krunked, keeping weapons, mods, skills, and scaling enemy HP/density/loot.
 */
export function startNextLoop(state: SimState): SimState {
  state.loopCount += 1;
  state.clearedNodeIds = ['act0_hub'];
  state.unlockedNodeIds = ['act0_hub', 'act0_weaponshop', 'act0_easytraining', 'act1_canyon'];

  const p = state.player;
  p.hp = p.maxHp;
  p.shield = p.maxShield;
  for (let a = 1; a <= 5; a++) {
    const idx = a as AmmoType;
    p.ammo[idx] = p.maxAmmo[idx];
  }

  enterNode(state, 'act1_canyon');
  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 26,
    text: `LOOP ${state.loopCount} — RAGNAROK CONTINUES!`,
    color: '#ff2a85',
    scale: 1.4,
  });
  return state;
}

/**
 * Allocates one rank in a Yggdrasil Skill Tree node, verifying prerequisites,
 * Outcast eligibility, maxRank, and available `player.skillPoints`.
 */
export function allocateSkillNode(state: SimState, nodeId: string): boolean {
  const node = SKILL_NODE_BY_ID.get(nodeId);
  if (!node) return false;

  const p = state.player;
  if (node.outcastId !== 'shared' && node.outcastId !== p.outcastId) {
    return false;
  }

  const currentRank = state.skillRanks[node.id] ?? 0;
  if (currentRank >= node.maxRank) return false;
  if (p.skillPoints < node.costPerRank) return false;

  for (let i = 0; i < node.requires.length; i++) {
    if ((state.skillRanks[node.requires[i]] ?? 0) <= 0) {
      return false;
    }
  }

  const prevHpBonus = getSkillEffectValue(state.skillRanks, 'max_hp_add', 0);
  const prevMaxAmmo = [...p.maxAmmo];

  p.skillPoints -= node.costPerRank;
  state.skillRanks[node.id] = currentRank + 1;

  // Apply immediate stat recalculations
  const nextHpBonus = getSkillEffectValue(state.skillRanks, 'max_hp_add', 0);
  if (nextHpBonus > prevHpBonus) {
    const diff = nextHpBonus - prevHpBonus;
    p.maxHp += diff;
    p.hp = Math.min(p.maxHp, p.hp + diff);
  }

  const nextMaxAmmo = buildMaxAmmoTuple(state.skillRanks);
  for (let a = 1; a <= 5; a++) {
    const idx = a as AmmoType;
    const diff = nextMaxAmmo[idx] - prevMaxAmmo[idx];
    p.maxAmmo[idx] = nextMaxAmmo[idx];
    if (diff > 0) {
      p.ammo[idx] = Math.min(p.maxAmmo[idx], p.ammo[idx] + diff);
    }
  }

  const outcast = getOutcastDef(p.outcastId);
  const costMult = getSkillEffectValue(state.skillRanks, 'power_cost_mult', 1);
  p.powerChargeRequired = Math.max(30, Math.round(outcast.powerChargeRequired * costMult));

  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 16,
    text: `${node.name} RANK ${currentRank + 1}`,
    color: '#00f5d4',
  });
  return true;
}

function handleHubInteractions(state: SimState, input: InputFrame): void {
  if (!input.interactPressed) return;
  const p = state.player;

  let nearest = null;
  let bestDist = Infinity;
  for (let i = 0; i < state.hubInteractables.length; i++) {
    const item = state.hubInteractables[i];
    const d = Math.hypot(item.x - p.x, item.y - p.y);
    if (d <= item.radius + p.radius + 14 && d < bestDist) {
      bestDist = d;
      nearest = item;
    }
  }
  if (!nearest) return;

  if (nearest.id === 'bifrost') {
    enterOverworld(state);
    return;
  }

  if (nearest.id === 'training_dummy') {
    state.events.push({
      type: 'floating_text',
      x: nearest.x,
      y: nearest.y - 16,
      text: 'SHOOT ME TO TEST DPS!',
      color: '#fee440',
    });
    return;
  }

  const panelMap: Record<string, HubPanel> = {
    loki: 'loki',
    jotunn_matic: 'jotunn_matic',
    skill_tree: 'skill_tree',
    modifiers: 'modifiers',
    weapondex: 'weapondex',
    enemydex: 'enemydex',
  };
  const nextPanel = panelMap[nearest.id];
  if (nextPanel) {
    state.hubPanel = nextPanel;
  }
}

/**
 * Advances the entire simulation by exactly one deterministic 60 Hz tick.
 */
export function stepSim(state: SimState, input: InputFrame): SimState {
  // Handle pause toggle
  if (input.pausePressed && (state.screenMode === 'combat' || state.screenMode === 'hub')) {
    state.paused = !state.paused;
  }

  // Tick Loki commentary toast countdown
  if (state.lokiToast) {
    state.lokiToast.ticksLeft -= 1;
    if (state.lokiToast.ticksLeft <= 0) {
      state.lokiToast = null;
    }
  }

  // Pause & non-action screens hold gameplay physics cleanly
  if (
    state.paused ||
    (state.screenMode !== 'combat' && state.screenMode !== 'hub') ||
    (state.screenMode === 'hub' && state.hubPanel !== 'none')
  ) {
    return state;
  }

  // Micro-hitstop freeze frames for heavy crits, explosive kills, & boss phase shifts
  if (state.hitstopTicks > 0) {
    state.hitstopTicks -= 1;
    state.camera.shakeTrauma = Math.max(0, state.camera.shakeTrauma - 0.02);
    return state;
  }

  state.tick += 1;
  if (state.screenMode === 'combat') {
    state.runStats.elapsedTicks += 1;
  }

  const p = state.player;
  p.prevX = p.x;
  p.prevY = p.y;

  // 1. Update 6-tick input buffers and status timers
  updateInputBuffers(state, input);
  if (p.iframes > 0) p.iframes -= 1;
  if (p.hitFlashTicks > 0) p.hitFlashTicks -= 1;
  if (p.speedBonusTicks > 0) p.speedBonusTicks -= 1;

  // 2. Buffered weapon swap
  if (p.bufferedInput.swap > 0) {
    if (p.weapons[1] !== null) {
      p.activeSlot = p.activeSlot === 0 ? 1 : 0;
    }
    p.bufferedInput.swap = 0;
  }

  // 3. Compute effective stats for active weapon & sync passive player bonuses
  const activeWeapon = p.weapons[p.activeSlot];
  const activeDef = activeWeapon ? getWeaponDef(activeWeapon.uniqueId) : getWeaponDef(1015);
  const activeStats = activeWeapon
    ? computeEffectiveWeaponStats(activeDef, activeWeapon.mods, activeWeapon.golden, state.skillRanks)
    : computeEffectiveWeaponStats(activeDef, [], false, state.skillRanks);
  syncPlayerDerivedStats(state, activeStats);

  // Passive shield regeneration & Endless/Recycler ammo regeneration
  if (p.maxShield > 0 && p.shield < p.maxShield && state.tick % 90 === 0 && p.iframes === 0) {
    p.shield = Math.min(p.maxShield, p.shield + 2);
  }
  if (activeStats.passiveAmmoRegen > 0 && activeDef.ammoType !== 0) {
    const interval = Math.max(10, Math.round(60 / activeStats.passiveAmmoRegen));
    if (state.tick % interval === 0) {
      const aType = activeDef.ammoType;
      p.ammo[aType] = Math.min(p.maxAmmo[aType], p.ammo[aType] + 1);
    }
  }

  // 4. Aim direction
  const aimDx = input.aimWorldX - p.x;
  const aimDy = input.aimWorldY - p.y;
  if (aimDx * aimDx + aimDy * aimDy > 1e-4) {
    p.aimAngle = Math.atan2(aimDy, aimDx);
    p.facing = aimDx >= 0 ? 1 : -1;
  }

  // 5. Outcast Abilities & Powers
  stepOutcastAbilities(state, input);

  // 6. Player Movement + Sliding Tilemap Collision
  const outcast = getOutcastDef(p.outcastId);
  const skillSpeedMult = getSkillEffectValue(state.skillRanks, 'move_speed_mult', 1);
  let moveSpeed = outcast.moveSpeed * skillSpeedMult * activeStats.speedMult;

  if (p.outcastId === 'leifi' && p.abilityActiveTicks > 0 && p.powerActiveTicks <= 0) {
    moveSpeed *= 0.55; // Horn Shield moves slower while invulnerable
  } else if (p.outcastId === 'leifi' && p.powerActiveTicks > 0) {
    moveSpeed *= 1.65; // Trample Charge high-speed stampede
  } else if (p.speedBonusTicks > 0) {
    const overdriveBonus =
      p.outcastId === 'stellan'
        ? getSkillEffectValue(state.skillRanks, 'overdrive_speed_mult', 1.25)
        : 1.28;
    moveSpeed *= overdriveBonus;
  }

  if (p.dashTicks > 0) {
    p.dashTicks -= 1;
    const res = resolveCircleVsTilemap(state.map, p.x, p.y, p.dashVx, p.dashVy, p.radius, false);
    p.x = res.x;
    p.y = res.y;
    p.vx = res.vx;
    p.vy = res.vy;
  } else {
    let mx = input.moveX;
    let my = input.moveY;
    const mLen = Math.hypot(mx, my);
    if (mLen > 1) {
      mx /= mLen;
      my /= mLen;
    }

    const desiredVx = mx * moveSpeed;
    const desiredVy = my * moveSpeed;
    p.vx = p.vx * 0.55 + desiredVx * 0.45;
    p.vy = p.vy * 0.55 + desiredVy * 0.45;

    if (Math.abs(p.vx) < 0.02) p.vx = 0;
    if (Math.abs(p.vy) < 0.02) p.vy = 0;

    const res = resolveCircleVsTilemap(state.map, p.x, p.y, p.vx, p.vy, p.radius, false);
    p.x = res.x;
    p.y = res.y;
    p.vx = res.vx;
    p.vy = res.vy;
  }

  // Player walk animation & footstep events
  const movedDist = Math.hypot(p.x - p.prevX, p.y - p.prevY);
  if (movedDist > 0.25) {
    p.animTimer += 1;
    if (p.animTimer >= 7) {
      p.animTimer = 0;
      p.animFrame = (p.animFrame + 1) % 4;
    }
    p.stepTimer += 1;
    if (p.stepTimer >= 16) {
      p.stepTimer = 0;
      state.events.push({ type: 'footstep', x: p.x, y: p.y, biomeId: state.map.biomeId });
    }
  } else {
    p.animFrame = 0;
    p.animTimer = 0;
  }

  // 7. Weapon execution, dual-wield, burst continuation, drones
  stepWeapons(state, input, activeStats);

  // 8. Companions (Turretmouth, Drillnose, Seedling, Whirlpool, Ball of Doom, Gun Drone)
  updateCompanions(state);

  // 9. Swept Projectile Physics & Collisions
  stepProjectiles(state);

  // 10. Enemy & Two-Phase Boss AI + Elemental Status Effects
  stepEnemies(state);
  stepStatusEffects(state);

  // 11. Pickups, Chests & Lava Hazards
  stepPickups(state, input);
  checkPlayerLavaHazard(state);

  // 12. Anti-Camping Fimbulwinter Freeze Storm (combat only)
  stepFreezeStorm(state);

  // 13. Hub Landmarks vs Combat Room Clear & Bifrost Exit Portal
  if (state.screenMode === 'hub') {
    handleHubInteractions(state, input);
  } else if (state.screenMode === 'combat') {
    if (!state.map.exitUnlocked && state.enemies.length === 0) {
      state.map.exitUnlocked = true;
      state.runStats.roomsCleared += 1;
      markNodeCleared(state, state.currentNodeId);

      // Leifi Moose Muscle skill permanently rewards room clears
      if (p.outcastId === 'leifi') {
        const stacks = getSkillEffectValue(state.skillRanks, 'moose_muscle_stacks', 0);
        if (stacks > 0) {
          const hpGain = Math.round(10 * stacks);
          p.maxHp += hpGain;
          p.hp = Math.min(p.maxHp, p.hp + hpGain);
        }
      }

      state.events.push({ type: 'portal_open', x: state.map.exitX, y: state.map.exitY });
      state.events.push({
        type: 'floating_text',
        x: p.x,
        y: p.y - 20,
        text: 'AREA CLEAR — BIFROST EXIT UNLOCKED!',
        color: '#00f5d4',
        scale: 1.15,
      });
    }

    // Entering unlocked Bifrost portal returns to Overworld Map
    if (state.map.exitUnlocked) {
      const distToExit = Math.hypot(p.x - state.map.exitX, p.y - state.map.exitY);
      if (distToExit <= 20 || (distToExit <= 34 && input.interactPressed)) {
        enterOverworld(state);
        return state;
      }
    }
  }

  // 14. Smooth 20% Look-Ahead Clamped Camera
  updateCamera(state, input);

  return state;
}
