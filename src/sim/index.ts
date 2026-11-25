// ============================================================================
// KRUNKEDFALL — Deterministic Simulation Public Barrel (src/sim/index.ts)
// ============================================================================
// 100% pure, DOM-free, deterministic 60 Hz simulation engine.

export {
  createRngState,
  normalizeSeed,
  nextUint32,
  nextFloat,
  nextInt,
  nextRange,
  pick,
  chance,
  type RngCarrier,
} from './rng.js';

export { hashSimState } from './hash.js';

export {
  DEFAULT_DESTRUCTIBLE_WALL_HP,
  DEFAULT_COVER_CRATE_HP,
  createEmptyTileMap,
  enforceOuterBedrock,
  isOuterPerimeter,
  isSolidTile,
  isBlockingForMover,
  isWalkableTile,
  isDestructibleTile,
  worldToTile,
  tileToWorldCenter,
  getTileAt,
  setTileAt,
  damageTile,
  damageTilesInRadius,
  verifyMapConnectivity,
  computeReachableMask,
  ensureMapConnectivity,
  findNearestWalkablePos,
} from './tilemap.js';

export {
  sweepProjectileVsTilemap,
  sweepSegmentVsCircle,
  hasLineOfSight,
  resolveCircleVsTilemap,
  type TileRayHit,
  type CircleSweepHit,
  type SlideResolution,
} from './collision.js';

export {
  BASE_WEAPON_MOD_LIMIT,
  getSkillEffectValue,
  getWeaponModLimit,
  computeRunModifiers,
  computeEffectiveWeaponStats,
  syncPlayerDerivedStats,
  type EffectiveWeaponStats,
  type RunModifierSummary,
} from './modGraph.js';

export {
  createWeaponInstance,
  updateWeaponTimers,
  tryFireWeapon,
  stepWeapons,
} from './weaponExec.js';

export {
  INPUT_BUFFER_TICKS,
  MAX_COMPANIONS,
  updateInputBuffers,
  triggerOutcastAbility,
  triggerOutcastPower,
  stepOutcastAbilities,
  updateCompanions,
} from './abilities.js';

export {
  MAX_PROJECTILES,
  MAX_ENEMIES,
  MAX_PICKUPS,
  createEmptyStatus,
  addCameraTrauma,
  triggerHitstop,
  emitLokiComment,
  markNodeCleared,
  createEnemyState,
  spawnPickup,
  pickRandomWeaponForNode,
  pickRandomModForNode,
  grantPlayerXp,
  applyDamageToEnemy,
  pruneDeadEnemies,
  applyDamageToPlayer,
  triggerExplosion,
  stepProjectiles,
  stepStatusEffects,
  collectPickupNow,
  stepPickups,
  checkPlayerLavaHazard,
  type EnemyDamageOpts,
} from './combat.js';

export { stepEnemies } from './ai.js';

export {
  spawnBossById,
  transitionBossToPhase2,
  triggerActiveBossPhase2,
  onBossDefeated,
  stepBossAI,
} from './bosses.js';

export {
  DEFAULT_FREEZE_THRESHOLD_TICKS,
  FREEZE_RAMP_TICKS,
  MAX_FROST_CRYSTALS,
  createInitialFreezeStormState,
  resetFreezeStorm,
  setFreezeStormIntensity,
  stepFreezeStorm,
} from './freezeStorm.js';

export {
  generateHubLayout,
  generateNodeMap,
  generateShopOffers,
  type GeneratedWorld,
} from './worldgen.js';

export {
  createNeutralInput,
  createInitialSimState,
  drainSimEvents,
  enterHub,
  enterOverworld,
  enterNode,
  setPlayerOutcast,
  equipWeaponByUniqueId,
  attachModToWeapon,
  detachModFromWeapon,
  upgradeWeaponGolden,
  buyShopOffer,
  useCampfireAction,
  startNextLoop,
  allocateSkillNode,
  stepSim,
} from './step.js';
