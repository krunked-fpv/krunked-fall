// ============================================================================
// KRUNKEDFALL — Canonical Shared Contracts (Single Source of Truth)
// ============================================================================
// Imported by src/data, src/sim, src/render, src/assets, src/audio, src/input,
// src/ui, src/app, tools/, scripts/, and tests/.
// ZERO DOM / browser globals allowed here so src/sim stays 100% pure & headless.

export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
export const TILE_SIZE = 16;
export const SAVE_STORAGE_KEY = 'krunked_krunkedfall_save_v1';
export const SAVE_SCHEMA_VERSION = 1;

export type AmmoType = 0 | 1 | 2 | 3 | 4 | 5;
export const AMMO_NAMES: readonly [string, string, string, string, string, string] = [
  'MELEE',
  'BULLETS',
  'SHELLS',
  'BOLTS',
  'ENERGY',
  'EXPLOSIVES',
];

export type WeaponClass = 0 | 1; // 0 = Ranged/Heavy, 1 = Melee
export type WeaponTier = 1 | 2 | 3 | 4 | 5 | 6;
export type FiringMode = 0 | 1; // 0 = Standard/Auto, 1 = Burst/Spin-up/Charge
export type SpreadType = 0 | 1; // 0 = Random Cone, 1 = Even Fan
export type DamageType = 0 | 1 | 2 | 3; // 0 = Kinetic, 1 = Explosive, 2 = Energy, 3 = Melee Cleave

export type ElementType =
  | 'none'
  | 'burn'
  | 'freeze'
  | 'acid'
  | 'explosive'
  | 'radioactive'
  | 'lightning';

export type OutcastId =
  | 'britta'
  | 'leifi'
  | 'gustaf'
  | 'einar'
  | 'gunilla'
  | 'trulls'
  | 'stellan'
  | 'hilda';

export type SkinId =
  | 'original'
  | 'wastelander'
  | 'frost_walker'
  | 'warlord'
  | 'fire_walker'
  | 'snakecharmer'
  | 'ascended'
  | 'champion'
  | 'overlord'
  | 'krunkedslayer';

export type BossId = 'fenrir' | 'skadi' | 'loki_body' | 'hel' | 'surtur' | 'krunked';
export type ActId = 0 | 1 | 2 | 3;

export type NodeType =
  | 'hub'
  | 'training'
  | 'combat'
  | 'arena'
  | 'boss'
  | 'shop'
  | 'campfire'
  | 'stash'
  | 'infinite'
  | 'shrine';

export type ScreenMode =
  | 'title'
  | 'hub'
  | 'overworld'
  | 'combat'
  | 'workbench'
  | 'shop'
  | 'campfire'
  | 'victory'
  | 'gameover';

export type HubPanel =
  | 'none'
  | 'loki'
  | 'jotunn_matic'
  | 'skill_tree'
  | 'modifiers'
  | 'weapondex'
  | 'enemydex'
  | 'challenges';

export type TargetFps = 30 | 60 | 120;
export type AssetPackMode = 'builtin' | 'custom';

export const enum TileKind {
  Floor = 0,
  WallDestructible = 1,
  WallBedrock = 2,
  PitOrWater = 3,
  Lava = 4,
  Rubble = 5,
  CoverCrate = 6,
}

// ============================================================================
// DECLARATIVE DATA CONTRACTS (src/data/*)
// ============================================================================

export interface WeaponSoundRef {
  soundId: number | null;
  soundKey: string | null;
  volume: number;
  pitch: number;
}

export interface WeaponDef {
  id: number;
  uniqueId: number;
  name: string; // Krunked-sanitized display name
  spriteId: number;
  spriteKey: string;
  flashSpriteKey: string;
  crosshairSpriteKey: string;
  crosshairColor: string;
  weaponTier: WeaponTier;
  weaponPool: number;
  class: WeaponClass;
  price: number;
  firingMode: FiringMode;
  ammoType: AmmoType;
  ammoCost: number;
  cooldown: number; // ticks at 60 Hz
  burstCooldown: number;
  burstCount: number;
  projectileObject: number;
  projectileAmount: number;
  projectileSpeed: number; // px/tick at 60 Hz
  projectileSpread: number; // degrees
  spreadType: SpreadType;
  projectileOffset: number;
  projectileOffsetIgnoreWall: boolean;
  damageType: DamageType;
  baseDamage: number;
  damageFactor: number;
  projectileScale: number;
  heatseekingRate: number;
  animationStyle: number;
  firingAnimationStyle: number;
  animationSpeed: number;
  spriteRecoil: number;
  spriteRecoilAngle: number;
  userKnockback: number;
  knockbackOnlyWhenStill: boolean;
  screenshakeAmount: number;
  spriteFlashFrames: number;
  overheat: number;
  overheatFactor: number;
  ejectionType: number;
  ejectionAmount: number;
  ejectionTiming: number;
  windupMax: number;
  extraProjectileBounces: number;
  zoomFactor: number;
  laserSight: boolean;
  refundChance: number;
  lifestealChance: number;
  burnTier: number;
  freezeTier: number;
  explosiveTier: number;
  acidTier: number;
  radioactiveTier: number;
  golden: number;
  goldenCost: number;
  stashedOffset: { x: number; y: number };
  isLocked: boolean;
  killsUnlock: number;
  soundFire: WeaponSoundRef;
  soundEquip: WeaponSoundRef;
  soundReload: WeaponSoundRef;
}

export interface ModStatDelta {
  cooldownMult?: number;
  burstCountAdd?: number;
  projectileAmountAdd?: number;
  projectileAmountMult?: number;
  projectileSpeedMult?: number;
  projectileSpreadAdd?: number;
  projectileSpreadMult?: number;
  damageMult?: number;
  projectileScaleMult?: number;
  extraBouncesAdd?: number;
  heatseekingAdd?: number;
  overheatMult?: number;
  lifestealAdd?: number;
  refundChanceAdd?: number;
  burnTierAdd?: number;
  freezeTierAdd?: number;
  acidTierAdd?: number;
  explosiveTierAdd?: number;
  radioactiveTierAdd?: number;
  lightningTierAdd?: number;
  laserSight?: boolean;
  pierceAdd?: number;
  chainJump?: boolean;
  magnetPull?: boolean;
  sentientTurret?: boolean;
  armorAdd?: number;
  shieldAdd?: number;
  speedMult?: number;
  pickupRangeMult?: number;
  passiveAmmoRegen?: number;
  meleeExtraAttack?: boolean;
  meleeAutoAttack?: boolean;
  selfDamageImmune?: boolean;
  elementImmune?: ElementType;
  knockbackMult?: number;
  goldBullet?: boolean;
  teleportShot?: boolean;
  etherealShot?: boolean;
  ragnarokNova?: boolean;
  ammoCostMult?: number;
  lifeTicksMult?: number;
}

export interface ModDef {
  id: string;
  sourceKey: string;
  name: string;
  description: string;
  tier: 1 | 2 | 3;
  category: 'barrel' | 'trigger' | 'mag' | 'rune' | 'utility' | 'defense';
  price: number;
  iconKey: string;
  accentColor: string;
  modifiers: ModStatDelta;
}

export interface SkillNodeDef {
  id: string;
  outcastId: OutcastId | 'shared';
  name: string;
  description: string;
  branch: 'left' | 'center' | 'right';
  tier: 1 | 2 | 3 | 4;
  maxRank: number;
  costPerRank: number;
  requires: string[];
  x: number; // normalized 0..1 tree coordinate
  y: number;
  effectKey: string;
  valuesPerRank: number[];
}

export interface OutcastDef {
  id: OutcastId;
  sourceKey: string;
  name: string;
  title: string;
  spriteKey: string;
  maxHp: number;
  moveSpeed: number; // px/tick at 60 Hz
  startingWeaponUniqueId: number;
  secondaryWeaponUniqueId?: number;
  abilityName: string;
  abilityDesc: string;
  abilityCooldownTicks: number;
  abilityMaxCharges: number;
  powerName: string;
  powerDesc: string;
  powerChargeRequired: number;
  powerDurationTicks: number;
  accentColor: string;
  skillNodeIds: string[];
}

export interface SkinDef {
  id: SkinId;
  sourceKey: string;
  name: string;
  unlockCondition: string;
  paletteSwap: [string, string, string];
}

export type EnemyArchetype =
  | 'rusher'
  | 'shooter'
  | 'sniper'
  | 'bomber'
  | 'charger'
  | 'turret'
  | 'spawner'
  | 'summoner'
  | 'mimic'
  | 'giant'
  | 'flier'
  | 'boss';

export interface EnemyDef {
  id: string;
  sourceKey: string;
  name: string;
  spriteKey: string;
  archetype: EnemyArchetype;
  actMin: ActId;
  actMax: ActId;
  maxHp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  projectileDamage: number;
  projectileSpeed: number;
  fireCooldownTicks: number;
  xpValue: number;
  goldValue: number;
  scoreValue: number;
  elementResist?: ElementType;
  isBoss?: boolean;
  bossId?: BossId;
  bossPhase?: 1 | 2;
  splitsOnDeath?: string;
  splitCount?: number;
  tintColor: string;
}

export interface BossDef {
  id: BossId;
  act: ActId;
  nodeId: string;
  phase1Name: string;
  phase2Name: string;
  phase1SourceKey: string;
  phase2SourceKey: string;
  phase1Hp: number;
  phase2Hp: number;
  radius: number;
  musicKeyIntro: string;
  musicKeyA: string;
  musicKeyB: string;
  musicKeyOutro: string;
  spritePhase1Key: string;
  spritePhase2Key: string;
  accentColor: string;
  phase2Color: string;
  arenaBiomeId: string;
  phase1Patterns: string[];
  phase2Patterns: string[];
}

export interface BiomePalette {
  floorColorA: string;
  floorColorB: string;
  wallTopColor: string;
  wallFaceColor: string;
  ambientColor: [number, number, number, number];
  accentGlow: [number, number, number];
  weather: 'none' | 'snow' | 'ash' | 'sand' | 'spores' | 'lava' | 'rain';
  hasWaterDistort?: boolean;
  hasLavaLake?: boolean;
}

export interface BiomeNodeDef {
  id: string;
  act: ActId;
  sourceName: string;
  displayName: string;
  nodeType: NodeType;
  mapX: number; // world overworld coordinate
  mapY: number;
  tileX: number;
  tileY: number;
  connections: string[];
  biomeId: string;
  musicKey: string;
  ambienceKey?: string;
  palette: BiomePalette;
  enemyPool: string[];
  bossId?: BossId;
  difficultyTier: number;
  roomCount: number;
  destructibleRatio: number;
}

export interface RunModifierDef {
  id: string;
  name: string;
  description: string;
  enemyHpMult: number;
  enemySpeedMult: number;
  dropQualityBonus: number;
  freezeRateMult: number;
  scoreMult: number;
}

export interface ChallengeDef {
  id: string;
  description: string;
  targetType: 'kills' | 'mod' | 'node' | 'boss' | 'loop';
  targetValue: number | string;
  rewardGold: number;
  rewardSkillPoints: number;
}

// ============================================================================
// SIMULATION STATE CONTRACTS (src/sim/*)
// ============================================================================

export interface InputFrame {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimWorldX: number;
  aimWorldY: number;
  firePrimary: boolean;
  firePrimaryPressed: boolean;
  abilityPressed: boolean;
  powerPressed: boolean;
  swapWeaponPressed: boolean;
  interactPressed: boolean;
  reloadOrVentPressed: boolean;
  pausePressed: boolean;
}

export interface WeaponInstance {
  instanceId: number;
  uniqueId: number;
  golden: boolean;
  mods: string[]; // ModDef.id[]
  overheat: number; // 0..1
  overheatedLockTicks: number;
  windup: number; // 0..1
  cooldownTicks: number;
  burstRemaining: number;
  burstTicks: number;
  recoilOffset: number;
  recoilAngle: number;
  flashTicks: number;
  kills: number;
}

export interface StatusEffects {
  burnTicks: number;
  burnTier: number;
  freezeTicks: number;
  freezeTier: number;
  acidTicks: number;
  acidTier: number;
  radTicks: number;
  radTier: number;
  shockTicks: number;
}

export interface BossTelegraph {
  kind: 'line' | 'circle' | 'cone' | 'ring';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  radius: number;
  progress: number; // 0..1
  color: string;
}

export interface TileMapState {
  width: number;
  height: number;
  tileSize: number;
  tiles: Uint8Array;
  tileHp: Uint16Array;
  tileMaxHp: Uint16Array;
  biomeId: string;
  spawnX: number;
  spawnY: number;
  exitX: number;
  exitY: number;
  exitUnlocked: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  aimAngle: number;
  facing: -1 | 1;
  radius: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  armor: number;
  outcastId: OutcastId;
  skinId: SkinId;
  xp: number;
  xpToNext: number;
  level: number;
  gold: number;
  skillPoints: number;
  ammo: [number, number, number, number, number, number];
  maxAmmo: [number, number, number, number, number, number];
  weapons: [WeaponInstance, WeaponInstance | null];
  activeSlot: 0 | 1;
  backpackMods: string[];
  abilityCooldown: number;
  abilityCharges: number;
  abilityMaxCharges: number;
  abilityActiveTicks: number;
  powerCharge: number;
  powerChargeRequired: number;
  powerActiveTicks: number;
  iframes: number;
  hitFlashTicks: number;
  dashVx: number;
  dashVy: number;
  dashTicks: number;
  isInvisible: boolean;
  isInvulnerable: boolean;
  speedBonusTicks: number;
  bufferedInput: {
    fire: number;
    ability: number;
    power: number;
    swap: number;
  };
  kills: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  animFrame: number;
  animTimer: number;
  stepTimer: number;
}

export interface EnemyState {
  id: number;
  defId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  armor: number;
  aimAngle: number;
  facing: -1 | 1;
  aiState: 'idle' | 'chase' | 'attack' | 'charge' | 'telegraph' | 'phase_shift';
  stateTimer: number;
  attackCooldown: number;
  hitFlashTicks: number;
  status: StatusEffects;
  isBoss: boolean;
  bossId?: BossId;
  bossPhase: 1 | 2;
  bossPatternIndex: number;
  bossTelegraph: BossTelegraph | null;
  animFrame: number;
  animTimer: number;
  tintColor: string;
}

export interface ProjectileState {
  id: number;
  owner: 'player' | 'enemy' | 'frost';
  weaponUniqueId?: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  damageType: DamageType;
  speed: number;
  lifeTicks: number;
  maxLifeTicks: number;
  scale: number;
  bouncesLeft: number;
  pierceLeft: number;
  heatseekingRate: number;
  isMelee: boolean;
  meleeArc?: number;
  burnTier: number;
  freezeTier: number;
  acidTier: number;
  explosiveTier: number;
  radioactiveTier: number;
  lightningTier: number;
  lifestealChance: number;
  chainJump: boolean;
  ethereal: boolean;
  teleportOwner: boolean;
  goldDropBonus: boolean;
  ragnarokNova: boolean;
  color: string;
  spriteKey: string;
}

export interface PickupState {
  id: number;
  kind:
    | 'hp'
    | 'ammo'
    | 'gold'
    | 'xp'
    | 'weapon'
    | 'mod'
    | 'chest_weapon'
    | 'chest_mod'
    | 'chest_gold';
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  ammoType?: AmmoType;
  weaponUniqueId?: number;
  modId?: string;
  opened?: boolean;
  lifeTicks: number;
}

export interface CompanionState {
  id: number;
  kind: 'turret' | 'drill' | 'seedling' | 'whirlpool' | 'doom_ball' | 'gun_drone';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  lifeTicks: number;
  fireCooldown: number;
  damage: number;
}

export interface FrostCrystalState {
  id: number;
  x: number;
  y: number;
  fireCooldown: number;
  pulsePhase: number;
}

export interface FreezeStormState {
  timerTicks: number;
  thresholdTicks: number;
  intensity: number; // 0..1
  active: boolean;
  crystals: FrostCrystalState[];
  warningShown: boolean;
}

export interface HubInteractable {
  id:
    | 'loki'
    | 'jotunn_matic'
    | 'skill_tree'
    | 'bifrost'
    | 'modifiers'
    | 'weapondex'
    | 'enemydex'
    | 'training_dummy';
  label: string;
  x: number;
  y: number;
  radius: number;
}

export interface ShopOffer {
  id: string;
  kind: 'weapon' | 'mod' | 'heal' | 'ammo' | 'golden_upgrade';
  name: string;
  price: number;
  weaponUniqueId?: number;
  modId?: string;
  purchased: boolean;
}

export interface CameraState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  shakeTrauma: number;
  shakeDirX: number;
  shakeDirY: number;
  zoom: number;
}

export type SimEvent =
  | {
      type: 'weapon_fire';
      x: number;
      y: number;
      angle: number;
      weaponUniqueId: number;
      ammoType: AmmoType;
      soundKey: string | null;
      soundId: number | null;
      volume: number;
      pitch: number;
      flashFrames: number;
    }
  | {
      type: 'melee_slash';
      x: number;
      y: number;
      angle: number;
      radius: number;
      arc: number;
      color: string;
    }
  | {
      type: 'projectile_hit';
      x: number;
      y: number;
      normalX: number;
      normalY: number;
      color: string;
      isWall: boolean;
    }
  | {
      type: 'enemy_hit';
      enemyId: number;
      x: number;
      y: number;
      damage: number;
      isCrit: boolean;
      element: ElementType;
      dirX: number;
      dirY: number;
    }
  | {
      type: 'enemy_death';
      enemyId: number;
      defId: string;
      x: number;
      y: number;
      overkill: boolean;
      dirX: number;
      dirY: number;
      bloodColor: string;
      isBoss: boolean;
    }
  | {
      type: 'wall_crack';
      tileX: number;
      tileY: number;
      x: number;
      y: number;
      ratio: number;
    }
  | {
      type: 'wall_shatter';
      tileX: number;
      tileY: number;
      x: number;
      y: number;
      color: string;
    }
  | {
      type: 'explosion';
      x: number;
      y: number;
      radius: number;
      element: ElementType;
      intensity: number;
    }
  | { type: 'player_hit'; x: number; y: number; damage: number }
  | { type: 'player_death'; x: number; y: number }
  | { type: 'ability_trigger'; outcastId: OutcastId; x: number; y: number; angle: number }
  | { type: 'power_trigger'; outcastId: OutcastId; x: number; y: number }
  | { type: 'pickup_collect'; kind: PickupState['kind']; x: number; y: number; label: string }
  | { type: 'level_up'; level: number; x: number; y: number }
  | { type: 'boss_spawn'; bossId: BossId; name: string; x: number; y: number }
  | { type: 'boss_phase2'; bossId: BossId; name: string; x: number; y: number }
  | { type: 'boss_defeated'; bossId: BossId; name: string; x: number; y: number }
  | { type: 'portal_open'; x: number; y: number }
  | { type: 'freeze_warning'; intensity: number }
  | { type: 'freeze_crystal_spawn'; x: number; y: number }
  | { type: 'floating_text'; x: number; y: number; text: string; color: string; scale?: number }
  | { type: 'shell_eject'; x: number; y: number; vx: number; vy: number; kind: number }
  | { type: 'footstep'; x: number; y: number; biomeId: string }
  | { type: 'loki_comment'; text: string }
  | {
      type: 'music_change';
      trackKey: string;
      stem?: 'intro' | 'a' | 'b' | 'outro';
      ambienceKey?: string;
    }
  | { type: 'screen_shake'; trauma: number; dirX: number; dirY: number }
  | { type: 'hitstop'; ticks: number };

export interface RunStats {
  elapsedTicks: number;
  roomsCleared: number;
  bossesDefeated: BossId[];
  wallsDestroyed: number;
  modsAttached: number;
  score: number;
}

export interface SimState {
  seed: number;
  rngState: number;
  tick: number;
  hitstopTicks: number;
  screenMode: ScreenMode;
  hubPanel: HubPanel;
  paused: boolean;
  act: ActId;
  loopCount: number;
  currentNodeId: string;
  clearedNodeIds: string[];
  unlockedNodeIds: string[];
  activeModifiers: string[];
  skillRanks: Record<string, number>;
  player: PlayerState;
  map: TileMapState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  pickups: PickupState[];
  companions: CompanionState[];
  freezeStorm: FreezeStormState;
  hubInteractables: HubInteractable[];
  activeBossId: BossId | null;
  shopOffers: ShopOffer[];
  camera: CameraState;
  events: SimEvent[];
  runStats: RunStats;
  lokiToast: { text: string; ticksLeft: number } | null;
  godMode: boolean;
  nextEntityId: number;
}

// ============================================================================
// RENDER, PACK, AUDIO, SAVE & DEBUG CONTRACTS
// ============================================================================

export interface RenderSettings {
  targetFps: TargetFps;
  pixelSnap60: boolean;
  screenshakeScale: number;
  lightingEnabled: boolean;
  bloodEnabled: boolean;
  packMode: AssetPackMode;
}

export interface AudioSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface SpriteFrameMeta {
  page: number;
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  tgtX: number;
  tgtY: number;
  tgtW: number;
  tgtH: number;
  boundW: number;
  boundH: number;
}

export interface SpriteMeta {
  id: number;
  name: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  bbox: [number, number, number, number];
  frames: SpriteFrameMeta[];
}

export interface PackManifest {
  version: number;
  packType: AssetPackMode;
  logicalWidth: number;
  logicalHeight: number;
  pageCount: number;
  pages: Array<{ index: number; file: string; width: number; height: number }>;
  sprites: Record<string, SpriteMeta>;
  spriteIdToName: Record<string, string>;
  sounds: Record<string, { file: string; volume: number; pitch: number }>;
  soundIdToName: Record<string, string>;
  music: Record<string, string>;
  fonts: Record<string, string>;
  logicalAliases: Record<string, string>;
}

export interface SaveData {
  schemaVersion: number;
  selectedOutcast: OutcastId;
  selectedSkins: Record<OutcastId, SkinId>;
  unlockedOutcasts: OutcastId[];
  unlockedSkins: SkinId[];
  skillRanks: Record<string, number>;
  unspentSkillPoints: number;
  totalKills: number;
  totalRuns: number;
  bestLoop: number;
  discoveredWeapons: number[];
  discoveredEnemies: string[];
  defeatedBosses: BossId[];
  completedChallenges: string[];
  activeModifiers: string[];
  renderSettings: RenderSettings;
  audioSettings: AudioSettings;
  keybinds: Record<string, string>;
}

export interface RuntimeMetrics {
  fps: number;
  targetFps: TargetFps;
  simHz: number;
  tick: number;
  interpAlpha: number;
  entityCount: number;
  projectileCount: number;
  pickupCount: number;
  packMode: AssetPackMode;
  customPackAvailable: boolean;
  stateHash: string;
}

export interface DebugBridge {
  getState(): SimState;
  getHash(): string;
  getMetrics(): RuntimeMetrics;
  stepTicks(count: number, input?: Partial<InputFrame>): string;
  warpToNode(nodeId: string): void;
  spawnBoss(bossId: BossId): void;
  triggerBossPhase2(): void;
  setOutcast(outcastId: OutcastId): void;
  setSkin(skinId: SkinId): void;
  grantWeapon(uniqueId: number, slot?: 0 | 1): void;
  grantMod(modId: string, attachToActive?: boolean): void;
  grantResources(opts: { gold?: number; skillPoints?: number; ammo?: number; hp?: number }): void;
  triggerFreezeStorm(intensity?: number): void;
  setGodMode(enabled: boolean): void;
  setPackMode(mode: AssetPackMode): Promise<boolean>;
  setRenderSettings(partial: Partial<RenderSettings>): void;
  setScreenMode(mode: ScreenMode, hubPanel?: HubPanel): void;
  resetSave(): void;
  listBosses(): BossId[];
  listNodes(): string[];
}

declare global {
  interface Window {
    __KRUNKED_DEBUG__?: DebugBridge;
  }
}
