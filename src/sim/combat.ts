// ============================================================================
// KRUNKEDFALL — Combat Physics, Swept Projectiles, Statuses, Gore & Loot
// ============================================================================
// Handles swept projectile stepping, all 6 elemental status effects, crits,
// overkill sprite-split detection, micro-hitstop, XP/leveling, and drops.

import {
  TileKind,
  type AmmoType,
  type ElementType,
  type EnemyState,
  type InputFrame,
  type PickupState,
  type ProjectileState,
  type SimState,
  type StatusEffects,
} from '../contracts/index.js';
import {
  ENEMY_BY_ID,
  MODS,
  WEAPONS,
  getEnemyDef,
  getLokiComment,
  getOverworldNode,
  getWeaponDef,
  type LokiCommentTrigger,
} from '../data/index.js';
import {
  resolveCircleVsTilemap,
  sweepProjectileVsTilemap,
  sweepSegmentVsCircle,
} from './collision.js';
import {
  computeEffectiveWeaponStats,
  computeRunModifiers,
  getSkillEffectValue,
} from './modGraph.js';
import { chance, nextInt, nextRange, pick } from './rng.js';
import {
  damageTile,
  damageTilesInRadius,
  findNearestWalkablePos,
} from './tilemap.js';
import { onBossDefeated, transitionBossToPhase2 } from './bosses.js';

export const MAX_PROJECTILES = 300;
export const MAX_ENEMIES = 64;
export const MAX_PICKUPS = 96;

// Pure per-instance tracking (GC'd automatically, deterministic per run)
const projectileHitSets = new WeakMap<ProjectileState, Set<number>>();
const secondChanceUsed = new WeakSet<SimState>();

function getHitSet(p: ProjectileState): Set<number> {
  let set = projectileHitSets.get(p);
  if (!set) {
    set = new Set<number>();
    projectileHitSets.set(p, set);
  }
  return set;
}

export function createEmptyStatus(): StatusEffects {
  return {
    burnTicks: 0,
    burnTier: 0,
    freezeTicks: 0,
    freezeTier: 0,
    acidTicks: 0,
    acidTier: 0,
    radTicks: 0,
    radTier: 0,
    shockTicks: 0,
  };
}

export function addCameraTrauma(
  state: SimState,
  amount: number,
  dirX = 0,
  dirY = 0,
): void {
  if (amount <= 0) return;
  const clamped = Math.min(1, state.camera.shakeTrauma + amount);
  state.camera.shakeTrauma = clamped;
  const len = Math.hypot(dirX, dirY);
  if (len > 1e-4) {
    state.camera.shakeDirX = dirX / len;
    state.camera.shakeDirY = dirY / len;
  }
  state.events.push({
    type: 'screen_shake',
    trauma: Math.min(1, amount),
    dirX: len > 1e-4 ? dirX / len : 0,
    dirY: len > 1e-4 ? dirY / len : 0,
  });
}

export function triggerHitstop(state: SimState, ticks: number): void {
  const clamped = Math.max(1, Math.min(6, Math.round(ticks)));
  if (clamped > state.hitstopTicks) {
    state.hitstopTicks = clamped;
    state.events.push({ type: 'hitstop', ticks: clamped });
  }
}

export function emitLokiComment(state: SimState, trigger: LokiCommentTrigger): void {
  const text = getLokiComment(trigger, state.tick + state.rngState);
  state.lokiToast = { text, ticksLeft: 240 };
  state.events.push({ type: 'loki_comment', text });
}

export function markNodeCleared(state: SimState, nodeId: string): void {
  if (!state.clearedNodeIds.includes(nodeId)) {
    state.clearedNodeIds.push(nodeId);
  }
  const node = getOverworldNode(nodeId);
  for (let i = 0; i < node.connections.length; i++) {
    const connId = node.connections[i];
    if (!state.unlockedNodeIds.includes(connId)) {
      state.unlockedNodeIds.push(connId);
    }
  }
}

export function createEnemyState(
  state: SimState,
  defId: string,
  x: number,
  y: number,
): EnemyState {
  const def = ENEMY_BY_ID.get(defId) ?? getEnemyDef(defId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const loopHpMult = 1 + state.loopCount * 0.55;
  const scaledMaxHp = Math.max(
    1,
    Math.round(def.maxHp * (def.id === 'training_dummy' ? 1 : runMods.enemyHpMult * loopHpMult)),
  );
  const safe = findNearestWalkablePos(state.map, x, y);

  return {
    id: state.nextEntityId++,
    defId: def.id,
    x: safe.x,
    y: safe.y,
    prevX: safe.x,
    prevY: safe.y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    hp: scaledMaxHp,
    maxHp: scaledMaxHp,
    armor: def.archetype === 'giant' ? 2 : def.isBoss ? 1 : 0,
    aimAngle: 0,
    facing: 1,
    aiState: def.archetype === 'mimic' ? 'idle' : 'chase',
    stateTimer: nextInt(state, 15, 45),
    attackCooldown: Math.max(20, Math.round(def.fireCooldownTicks * nextRange(state, 0.5, 1.0))),
    hitFlashTicks: 0,
    status: createEmptyStatus(),
    isBoss: Boolean(def.isBoss),
    bossId: def.bossId,
    bossPhase: def.bossPhase ?? 1,
    bossPatternIndex: 0,
    bossTelegraph: null,
    animFrame: 0,
    animTimer: 0,
    tintColor: def.tintColor,
  };
}

export function spawnPickup(
  state: SimState,
  kind: PickupState['kind'],
  x: number,
  y: number,
  opts: {
    value?: number;
    ammoType?: AmmoType;
    weaponUniqueId?: number;
    modId?: string;
    vx?: number;
    vy?: number;
  } = {},
): PickupState | null {
  if (state.pickups.length >= MAX_PICKUPS) {
    // Evict oldest minor pickup (xp/gold) so important drops always spawn
    const evictIdx = state.pickups.findIndex(
      (pk) => pk.kind === 'xp' || pk.kind === 'gold' || pk.kind === 'ammo',
    );
    if (evictIdx >= 0) {
      state.pickups.splice(evictIdx, 1);
    } else {
      return null;
    }
  }

  const safe = findNearestWalkablePos(state.map, x, y);
  const angle = nextRange(state, 0, Math.PI * 2);
  const burst = kind.startsWith('chest_') ? 0 : nextRange(state, 0.8, 2.2);

  const pickup: PickupState = {
    id: state.nextEntityId++,
    kind,
    x: safe.x,
    y: safe.y,
    vx: opts.vx ?? Math.cos(angle) * burst,
    vy: opts.vy ?? Math.sin(angle) * burst,
    value: opts.value ?? 10,
    ammoType: opts.ammoType,
    weaponUniqueId: opts.weaponUniqueId,
    modId: opts.modId,
    opened: false,
    lifeTicks: kind.startsWith('chest_') || kind === 'weapon' || kind === 'mod' ? 36000 : 1800,
  };

  state.pickups.push(pickup);
  return pickup;
}

export function pickRandomWeaponForNode(state: SimState): number {
  const node = getOverworldNode(state.currentNodeId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const connoisseur = getSkillEffectValue(state.skillRanks, 'loot_quality_bonus', 0);
  const qualityShift = runMods.dropQualityBonus + connoisseur + state.loopCount * 0.4;

  const baseTier = Math.max(1, Math.min(6, Math.ceil((node.difficultyTier || 1) * 0.6)));
  const maxTier = Math.max(baseTier, Math.min(6, Math.round(baseTier + 1 + qualityShift * 2)));
  const minTier = Math.max(1, Math.min(maxTier, Math.floor(baseTier - 0.5 + qualityShift)));

  const pool = WEAPONS.filter(
    (w) => w.weaponTier >= minTier && w.weaponTier <= maxTier,
  );
  const chosen = pool.length > 0 ? pick(state, pool) : pick(state, WEAPONS);
  return chosen.uniqueId;
}

export function pickRandomModForNode(state: SimState): string {
  const node = getOverworldNode(state.currentNodeId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const connoisseur = getSkillEffectValue(state.skillRanks, 'loot_quality_bonus', 0);
  const maxTier =
    node.act >= 3 || state.loopCount > 0 || runMods.dropQualityBonus + connoisseur >= 0.45
      ? 3
      : node.act >= 2
        ? 3
        : 2;
  const pool = MODS.filter((m) => m.tier <= maxTier);
  return (pool.length > 0 ? pick(state, pool) : pick(state, MODS)).id;
}

export function grantPlayerXp(state: SimState, amount: number): void {
  const p = state.player;
  p.xp += Math.max(0, Math.round(amount));
  while (p.xp >= p.xpToNext) {
    p.xp -= p.xpToNext;
    p.level += 1;
    p.skillPoints += 1;
    p.maxHp += 5;
    p.hp = Math.min(p.maxHp, p.hp + 15);
    p.xpToNext = Math.round(p.xpToNext * 1.28 + 30);

    state.events.push({ type: 'level_up', level: p.level, x: p.x, y: p.y });
    state.events.push({
      type: 'floating_text',
      x: p.x,
      y: p.y - 16,
      text: `LEVEL ${p.level}! +1 SP`,
      color: '#ffd700',
      scale: 1.25,
    });
    emitLokiComment(state, 'level_up');
  }
}

export interface EnemyDamageOpts {
  element?: ElementType;
  dirX?: number;
  dirY?: number;
  knockback?: number;
  isMelee?: boolean;
  fromProjectile?: boolean;
  lifestealChance?: number;
  critChanceBonus?: number;
  forceCrit?: boolean;
  critMultOverride?: number;
  burnTier?: number;
  freezeTier?: number;
  acidTier?: number;
  radioactiveTier?: number;
  lightningTier?: number;
  goldDropBonus?: boolean;
  weaponUniqueId?: number;
}

function resolvePrimaryElement(opts: EnemyDamageOpts): ElementType {
  if (opts.element && opts.element !== 'none') return opts.element;
  if ((opts.lightningTier ?? 0) > 0) return 'lightning';
  if ((opts.burnTier ?? 0) > 0) return 'burn';
  if ((opts.freezeTier ?? 0) > 0) return 'freeze';
  if ((opts.acidTier ?? 0) > 0) return 'acid';
  if ((opts.radioactiveTier ?? 0) > 0) return 'radioactive';
  return 'none';
}

export function applyDamageToEnemy(
  state: SimState,
  enemy: EnemyState,
  rawDamage: number,
  opts: EnemyDamageOpts = {},
): number {
  if (enemy.hp <= 0 || rawDamage <= 0) return 0;
  // Invulnerable during boss Phase 1 -> Phase 2 transformation
  if (enemy.aiState === 'phase_shift') return 0;

  const p = state.player;
  const def = getEnemyDef(enemy.defId);
  const element = resolvePrimaryElement(opts);

  let dmg = rawDamage;

  // Elemental resistance check
  if (element !== 'none' && def.elementResist === element) {
    dmg *= 0.6;
  }

  // Acid armor shred: increases incoming damage by 25% and ignores armor
  const effectiveArmor = enemy.status.acidTicks > 0 ? 0 : enemy.armor;
  if (enemy.status.acidTicks > 0) {
    dmg *= 1.25;
  }

  // Britta Metal Berserk damage amplification
  if (p.outcastId === 'britta' && p.powerActiveTicks > 0) {
    const berserkMult = getSkillEffectValue(state.skillRanks, 'berserk_damage_mult', 1.25);
    dmg *= berserkMult;
  }

  // Crit calculation (base 5% + Crit King + Gustaf Shadow Execution guaranteed 4x)
  let isCrit = Boolean(opts.forceCrit);
  let critMult = opts.critMultOverride ?? 1.75;

  if (p.outcastId === 'gustaf' && p.powerActiveTicks > 0 && p.isInvisible) {
    isCrit = true;
    const shadowSkill = getSkillEffectValue(state.skillRanks, 'shadow_strike_mult', 1);
    critMult = Math.max(4.0, 4.0 * (shadowSkill > 1 ? shadowSkill * 0.55 : 1));
    p.isInvisible = false; // Shadow strike breaks stealth on huge hit
  } else if (!isCrit) {
    const baseCrit = 0.05 + (opts.critChanceBonus ?? getSkillEffectValue(state.skillRanks, 'crit_chance_add', 0));
    if (chance(state, baseCrit)) {
      isCrit = true;
    }
  }

  if (isCrit) {
    dmg *= critMult;
  }

  // Freeze shatter bonus (+30% on crits, explosives, or melee hits)
  if (
    enemy.status.freezeTicks > 0 &&
    (isCrit || element === 'explosive' || opts.isMelee)
  ) {
    dmg *= 1.3;
  }

  const finalDamage = Math.max(1, Math.round(dmg - effectiveArmor));
  enemy.hp -= finalDamage;
  enemy.hitFlashTicks = 4;

  // Mimics wake up immediately when damaged
  if (enemy.aiState === 'idle') {
    enemy.aiState = 'chase';
  }

  p.damageDealt += finalDamage;
  if (opts.fromProjectile) {
    p.shotsHit += 1;
  }

  // Build Power ultimate charge
  if (p.powerActiveTicks <= 0) {
    const chargeGain = Math.max(1, finalDamage * 0.14);
    p.powerCharge = Math.min(p.powerChargeRequired, p.powerCharge + chargeGain);
  }

  // Lifesteal & Britta Invigorating Berserk healing
  if ((opts.lifestealChance ?? 0) > 0 && chance(state, opts.lifestealChance!)) {
    const heal = Math.max(2, Math.round(finalDamage * 0.12));
    p.hp = Math.min(p.maxHp, p.hp + heal);
    state.events.push({
      type: 'floating_text',
      x: p.x,
      y: p.y - 12,
      text: `+${heal}`,
      color: '#52b788',
    });
  }
  if (p.outcastId === 'britta' && p.powerActiveTicks > 0) {
    const healOnHit = getSkillEffectValue(state.skillRanks, 'berserk_heal_on_hit', 2);
    if (healOnHit > 0 && chance(state, 0.35)) {
      p.hp = Math.min(p.maxHp, p.hp + healOnHit);
    }
  }

  // Apply knockback impulse
  const dirX = opts.dirX ?? 0;
  const dirY = opts.dirY ?? 0;
  const kbForce = opts.knockback ?? 0;
  if (kbForce > 0 && (dirX !== 0 || dirY !== 0)) {
    const kbResist = enemy.isBoss ? 0.08 : def.archetype === 'giant' || def.archetype === 'turret' ? 0.25 : 1.0;
    enemy.vx += dirX * kbForce * kbResist;
    enemy.vy += dirY * kbForce * kbResist;
  }

  // Apply elemental status effects
  if ((opts.burnTier ?? 0) > 0 && def.elementResist !== 'burn') {
    enemy.status.burnTicks = Math.max(enemy.status.burnTicks, 180);
    enemy.status.burnTier = Math.max(enemy.status.burnTier, opts.burnTier!);
  }
  if ((opts.freezeTier ?? 0) > 0 && def.elementResist !== 'freeze') {
    enemy.status.freezeTicks = Math.max(enemy.status.freezeTicks, 150);
    enemy.status.freezeTier = Math.max(enemy.status.freezeTier, opts.freezeTier!);
  }
  if ((opts.acidTier ?? 0) > 0 && def.elementResist !== 'acid') {
    enemy.status.acidTicks = Math.max(enemy.status.acidTicks, 210);
    enemy.status.acidTier = Math.max(enemy.status.acidTier, opts.acidTier!);
  }
  if ((opts.radioactiveTier ?? 0) > 0 && def.elementResist !== 'radioactive') {
    enemy.status.radTicks = Math.max(enemy.status.radTicks, 210);
    enemy.status.radTier = Math.max(enemy.status.radTier, opts.radioactiveTier!);
  }
  if ((opts.lightningTier ?? 0) > 0 && def.elementResist !== 'lightning') {
    enemy.status.shockTicks = Math.max(enemy.status.shockTicks, 45 + opts.lightningTier! * 20);
  }

  state.events.push({
    type: 'enemy_hit',
    enemyId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    damage: finalDamage,
    isCrit,
    element,
    dirX,
    dirY,
  });

  state.events.push({
    type: 'floating_text',
    x: enemy.x + nextRange(state, -5, 5),
    y: enemy.y - enemy.radius - 4,
    text: isCrit ? `${finalDamage}!` : `${finalDamage}`,
    color: isCrit ? '#ffd700' : element === 'burn' ? '#ff6d00' : element === 'freeze' ? '#72efdd' : element === 'acid' ? '#80ed99' : '#ffffff',
    scale: isCrit ? 1.25 : 0.9,
  });

  // Heavy crit micro-hitstop
  if (isCrit && (finalDamage >= 45 || opts.isMelee)) {
    triggerHitstop(state, 2);
  }

  // Hub training dummy regenerates instead of permanently dying
  if (enemy.defId === 'training_dummy' && state.screenMode === 'hub') {
    if (enemy.hp <= 0) {
      enemy.hp = enemy.maxHp;
      state.events.push({
        type: 'floating_text',
        x: enemy.x,
        y: enemy.y - 18,
        text: 'DUMMY RESET',
        color: '#fee440',
      });
    }
    return finalDamage;
  }

  // Handle death or Boss Phase 1 -> Phase 2 transition
  if (enemy.hp <= 0) {
    if (enemy.isBoss && enemy.bossPhase === 1 && enemy.bossId) {
      transitionBossToPhase2(state, enemy);
    } else {
      handleEnemyDeath(state, enemy, finalDamage, dirX, dirY, element, Boolean(opts.goldDropBonus));
    }
  }

  return finalDamage;
}

function handleEnemyDeath(
  state: SimState,
  enemy: EnemyState,
  killingDamage: number,
  dirX: number,
  dirY: number,
  element: ElementType,
  goldDropBonus: boolean,
): void {
  const p = state.player;
  const def = getEnemyDef(enemy.defId);
  const runMods = computeRunModifiers(state.activeModifiers);
  const overkill = !enemy.isBoss && killingDamage >= enemy.maxHp * 0.45;

  p.kills += 1;
  const activeWeapon = p.weapons[p.activeSlot];
  if (activeWeapon) {
    activeWeapon.kills += 1;
    // Killing Spree skill shaves cooldown on kill
    const killCdr = getSkillEffectValue(state.skillRanks, 'kill_cooldown_refund', 0);
    if (killCdr > 0 && activeWeapon.cooldownTicks > 0) {
      activeWeapon.cooldownTicks = Math.max(
        0,
        Math.floor(activeWeapon.cooldownTicks * (1 - killCdr)),
      );
    }
  }

  // Bonus Power charge on kill
  if (p.powerActiveTicks <= 0) {
    p.powerCharge = Math.min(p.powerChargeRequired, p.powerCharge + (enemy.isBoss ? 50 : 8));
  }

  state.runStats.score += Math.round(def.scoreValue * runMods.scoreMult * (1 + state.loopCount * 0.35));

  const bloodColor =
    def.archetype === 'turret' || def.spriteKey === 'enemy_robot'
      ? '#4cc9f0'
      : def.elementResist === 'acid'
        ? '#70e000'
        : def.elementResist === 'freeze'
          ? '#90e0ef'
          : '#d90429';

  state.events.push({
    type: 'enemy_death',
    enemyId: enemy.id,
    defId: enemy.defId,
    x: enemy.x,
    y: enemy.y,
    overkill,
    dirX,
    dirY,
    bloodColor,
    isBoss: enemy.isBoss,
  });

  if (overkill) {
    triggerHitstop(state, 2);
    addCameraTrauma(state, 0.16, dirX, dirY);
    if (chance(state, 0.2)) {
      emitLokiComment(state, 'overkill');
    }
  } else if (element === 'explosive') {
    triggerHitstop(state, 2);
  }

  // Handle split-on-death enemies (e.g., Draug -> Draug Limbs, Roach Eggs -> Roaches)
  if (def.splitsOnDeath && (def.splitCount ?? 0) > 0 && state.enemies.length < MAX_ENEMIES - 4) {
    const count = Math.min(def.splitCount!, 4);
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + nextRange(state, -0.3, 0.3);
      const child = createEnemyState(
        state,
        def.splitsOnDeath,
        enemy.x + Math.cos(a) * 14,
        enemy.y + Math.sin(a) * 14,
      );
      state.enemies.push(child);
    }
  }

  // Drops: XP, Gold, Ammo, HP, Weapons, Mods
  const goldMult = getSkillEffectValue(state.skillRanks, 'gold_gain_mult', 1) * (goldDropBonus ? 1.85 : 1);
  const goldAmount = Math.max(1, Math.round(def.goldValue * goldMult));
  spawnPickup(state, 'gold', enemy.x, enemy.y, { value: goldAmount });
  spawnPickup(state, 'xp', enemy.x, enemy.y, { value: def.xpValue });

  const ammoDropMult = getSkillEffectValue(state.skillRanks, 'ammo_drop_mult', 1);
  if (chance(state, Math.min(0.85, 0.32 * ammoDropMult))) {
    const activeDef = activeWeapon ? getWeaponDef(activeWeapon.uniqueId) : null;
    const ammoType: AmmoType =
      activeDef && activeDef.ammoType !== 0
        ? activeDef.ammoType
        : (nextInt(state, 1, 5) as AmmoType);
    spawnPickup(state, 'ammo', enemy.x, enemy.y, { value: 18, ammoType });
  }

  if (chance(state, p.hp < p.maxHp * 0.45 ? 0.36 : 0.16)) {
    spawnPickup(state, 'hp', enemy.x, enemy.y, { value: 18 });
  }

  const wepDropMult = getSkillEffectValue(state.skillRanks, 'weapon_drop_mult', 1);
  if (def.archetype === 'mimic' || chance(state, Math.min(0.45, 0.08 * wepDropMult))) {
    spawnPickup(state, 'weapon', enemy.x, enemy.y, {
      weaponUniqueId: pickRandomWeaponForNode(state),
    });
  }

  if (def.archetype === 'mimic' || chance(state, 0.09)) {
    spawnPickup(state, 'mod', enemy.x, enemy.y, {
      modId: pickRandomModForNode(state),
    });
  }

  if (enemy.isBoss && enemy.bossId) {
    onBossDefeated(state, enemy);
  }
}

export function pruneDeadEnemies(state: SimState): void {
  let writeIdx = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].hp > 0) {
      state.enemies[writeIdx++] = state.enemies[i];
    }
  }
  state.enemies.length = writeIdx;
}

export function applyDamageToPlayer(
  state: SimState,
  rawDamage: number,
  sourceX: number,
  sourceY: number,
  element: ElementType = 'none',
): boolean {
  const p = state.player;
  if (rawDamage <= 0 || state.godMode || p.isInvulnerable || p.iframes > 0 || p.dashTicks > 0) {
    return false;
  }
  if (state.screenMode === 'hub') {
    return false;
  }

  // Elemental immunity check from equipped weapon mods
  const activeWeapon = p.weapons[p.activeSlot];
  if (activeWeapon && element !== 'none') {
    const stats = computeEffectiveWeaponStats(
      getWeaponDef(activeWeapon.uniqueId),
      activeWeapon.mods,
      activeWeapon.golden,
      state.skillRanks,
    );
    if (stats.elementImmunities.includes(element)) {
      state.events.push({
        type: 'floating_text',
        x: p.x,
        y: p.y - 12,
        text: 'IMMUNE',
        color: '#72efdd',
      });
      return false;
    }
  }

  let remaining = Math.max(1, Math.round(rawDamage - p.armor));

  // Absorb with regenerative energy shield first
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, remaining);
    p.shield -= absorbed;
    remaining -= absorbed;
  }

  if (remaining > 0) {
    p.hp -= remaining;
  }

  p.iframes = 36; // Exact 36-tick hit invulnerability duration
  p.hitFlashTicks = 8;

  const dx = p.x - sourceX;
  const dy = p.y - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  p.vx += (dx / len) * 2.4;
  p.vy += (dy / len) * 2.4;

  // Stellan Counterattack skill reduces active weapon cooldown when hit
  if (p.outcastId === 'stellan' && activeWeapon) {
    const cdr = getSkillEffectValue(state.skillRanks, 'counterattack_cdr', 0);
    if (cdr > 0) {
      activeWeapon.cooldownTicks = Math.floor(activeWeapon.cooldownTicks * (1 - cdr));
    }
  }

  state.events.push({ type: 'player_hit', x: p.x, y: p.y, damage: Math.max(1, remaining) });
  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 14,
    text: `-${Math.max(1, remaining)}`,
    color: '#ff4d6d',
    scale: 1.1,
  });
  addCameraTrauma(state, 0.42, dx / len, dy / len);

  if (p.hp > 0 && p.hp <= p.maxHp * 0.25 && chance(state, 0.35)) {
    emitLokiComment(state, 'low_hp');
  }

  if (p.hp <= 0) {
    // Second Chance skill revives once per run
    const reviveRatio = getSkillEffectValue(state.skillRanks, 'second_chance_ratio', 0);
    if (reviveRatio > 0 && !secondChanceUsed.has(state)) {
      secondChanceUsed.add(state);
      p.hp = Math.max(1, Math.round(p.maxHp * reviveRatio));
      p.iframes = 90;
      triggerHitstop(state, 4);
      state.events.push({
        type: 'explosion',
        x: p.x,
        y: p.y,
        radius: 85,
        element: 'lightning',
        intensity: 0.9,
      });
      state.events.push({
        type: 'floating_text',
        x: p.x,
        y: p.y - 18,
        text: 'SECOND CHANCE!',
        color: '#ffd700',
        scale: 1.35,
      });
      return true;
    }

    p.hp = 0;
    state.screenMode = 'gameover';
    state.events.push({ type: 'player_death', x: p.x, y: p.y });
    addCameraTrauma(state, 0.85, 0, 1);
  }

  return true;
}

export function triggerExplosion(
  state: SimState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  element: ElementType,
  owner: 'player' | 'enemy',
  selfDamageImmune = false,
): void {
  const intensity = Math.max(0.35, Math.min(1.4, radius / 64));
  state.events.push({
    type: 'explosion',
    x,
    y,
    radius,
    element,
    intensity,
  });
  addCameraTrauma(state, Math.min(0.65, 0.22 + intensity * 0.28), 0, 1);

  // Shatter destructible interior walls & crates inside blast radius (outer bedrock stays immune)
  damageTilesInRadius(state, x, y, radius, Math.max(30, damage * 1.45));

  // Damage enemies within radius
  if (owner === 'player') {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist <= radius + e.radius) {
        const falloff = Math.max(0.45, 1 - dist / (radius + e.radius + 8));
        const len = dist || 1;
        applyDamageToEnemy(state, e, damage * falloff, {
          element: element === 'none' ? 'explosive' : element,
          dirX: dx / len,
          dirY: dy / len,
          knockback: 3.2 * falloff,
          burnTier: element === 'burn' ? 2 : 0,
          lightningTier: element === 'lightning' ? 2 : 0,
          acidTier: element === 'acid' ? 2 : 0,
        });
      }
    }
    pruneDeadEnemies(state);
  }

  // Damage player if enemy blast or non-immune player self-blast
  const p = state.player;
  const distP = Math.hypot(p.x - x, p.y - y);
  if (distP <= radius + p.radius) {
    if (owner === 'enemy') {
      const falloff = Math.max(0.4, 1 - distP / (radius + p.radius + 8));
      applyDamageToPlayer(state, damage * falloff, x, y, element === 'none' ? 'explosive' : element);
    } else if (!selfDamageImmune) {
      const selfResist = getSkillEffectValue(state.skillRanks, 'self_damage_resist', 0);
      if (selfResist < 1) {
        const selfDmg = damage * 0.3 * (1 - selfResist);
        if (selfDmg >= 1) {
          applyDamageToPlayer(state, selfDmg, x, y, 'explosive');
        }
      }
    }
  }
}

export function stepProjectiles(state: SimState): void {
  const projs = state.projectiles;
  const enemies = state.enemies;
  const player = state.player;

  // Enforce hard upper bound to guarantee bounded memory & frame time
  if (projs.length > MAX_PROJECTILES) {
    projs.splice(0, projs.length - MAX_PROJECTILES);
  }

  let writeIdx = 0;

  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    p.prevX = p.x;
    p.prevY = p.y;
    p.lifeTicks -= 1;

    if (p.lifeTicks <= 0) {
      continue;
    }

    // Heatseeking / homing steering
    if (p.heatseekingRate > 0) {
      let targetX: number | null = null;
      let targetY: number | null = null;

      if (p.owner === 'player') {
        let bestDistSq = 280 * 280;
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (e.hp <= 0 || e.aiState === 'phase_shift') continue;
          const dSq = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            targetX = e.x;
            targetY = e.y;
          }
        }
      } else if (!player.isInvisible) {
        targetX = player.x;
        targetY = player.y;
      }

      if (targetX !== null && targetY !== null) {
        const curSpeed = Math.hypot(p.vx, p.vy) || p.speed || 4;
        const curAngle = Math.atan2(p.vy, p.vx);
        const desiredAngle = Math.atan2(targetY - p.y, targetX - p.x);
        let diff = desiredAngle - curAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = Math.min(0.32, p.heatseekingRate * 0.014);
        const nextAngle = curAngle + Math.max(-maxTurn, Math.min(maxTurn, diff));
        p.vx = Math.cos(nextAngle) * curSpeed;
        p.vy = Math.sin(nextAngle) * curSpeed;
      }
    }

    const nx = p.x + p.vx;
    const ny = p.y + p.vy;

    // 1. Continuous swept DDA tilemap intersection (zero wall tunneling at any speed)
    const wallHit = p.isMelee
      ? null
      : sweepProjectileVsTilemap(state.map, p.x, p.y, nx, ny, p.radius, p.ethereal);
    const maxEntityT = wallHit ? wallHit.t : 1.0;

    let alive = true;
    let consumedByEntity = false;

    // 2. Continuous swept segment-vs-circle entity intersection
    if (p.owner === 'player') {
      const hitSet = getHitSet(p);

      // Melee cleave also damages destructible crates/walls along its reach
      if (p.isMelee) {
        damageTilesInRadius(state, nx, ny, Math.max(10, p.radius), Math.max(8, p.damage * 0.45));
      }

      // Collect all intersected enemies in parametric order along segment
      const hits: Array<{ enemy: EnemyState; t: number; hx: number; hy: number }> = [];
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.hp <= 0 || hitSet.has(e.id)) continue;
        const hit = sweepSegmentVsCircle(p.x, p.y, nx, ny, e.x, e.y, p.radius + e.radius);
        if (hit && hit.t <= maxEntityT + 1e-6) {
          hits.push({ enemy: e, t: hit.t, hx: hit.x, hy: hit.y });
        }
      }

      if (hits.length > 1) {
        hits.sort((a, b) => a.t - b.t);
      }

      const speedLen = Math.hypot(p.vx, p.vy) || 1;
      const dirX = p.vx / speedLen;
      const dirY = p.vy / speedLen;

      for (let hIdx = 0; hIdx < hits.length; hIdx++) {
        const h = hits[hIdx];
        hitSet.add(h.enemy.id);

        state.events.push({
          type: 'projectile_hit',
          x: h.hx,
          y: h.hy,
          normalX: -dirX,
          normalY: -dirY,
          color: p.color,
          isWall: false,
        });

        applyDamageToEnemy(state, h.enemy, p.damage, {
          dirX,
          dirY,
          knockback: p.isMelee ? 3.0 : 1.4,
          isMelee: p.isMelee,
          fromProjectile: true,
          lifestealChance: p.lifestealChance,
          burnTier: p.burnTier,
          freezeTier: p.freezeTier,
          acidTier: p.acidTier,
          radioactiveTier: p.radioactiveTier,
          lightningTier: p.lightningTier,
          goldDropBonus: p.goldDropBonus,
          weaponUniqueId: p.weaponUniqueId,
        });

        // Explosive or Ragnarok Nova impact detonation
        if (p.explosiveTier > 0 || p.ragnarokNova) {
          const blastR = (p.ragnarokNova ? 68 : 34 + p.explosiveTier * 12) * Math.min(1.6, Math.max(0.8, p.scale));
          const blastDmg = p.ragnarokNova ? p.damage * 1.15 : p.damage * (0.55 + p.explosiveTier * 0.2);
          const activeWep = player.weapons[player.activeSlot];
          const activeStats = activeWep
            ? computeEffectiveWeaponStats(getWeaponDef(activeWep.uniqueId), activeWep.mods, activeWep.golden, state.skillRanks)
            : null;
          triggerExplosion(
            state,
            h.hx,
            h.hy,
            blastR,
            blastDmg,
            p.ragnarokNova ? 'burn' : p.lightningTier > 0 ? 'lightning' : 'explosive',
            'player',
            Boolean(activeStats?.selfDamageImmune),
          );
        }

        // Chain-jump lightning/hunter redirection onto another nearby target
        if (p.chainJump) {
          let nextTarget: EnemyState | null = null;
          let bestDSq = 145 * 145;
          for (let k = 0; k < enemies.length; k++) {
            const cand = enemies[k];
            if (cand.hp <= 0 || hitSet.has(cand.id) || cand.id === h.enemy.id) continue;
            const dSq = (cand.x - h.hx) * (cand.x - h.hx) + (cand.y - h.hy) * (cand.y - h.hy);
            if (dSq < bestDSq) {
              bestDSq = dSq;
              nextTarget = cand;
            }
          }
          if (nextTarget) {
            const spd = Math.hypot(p.vx, p.vy) || p.speed || 8;
            const ang = Math.atan2(nextTarget.y - h.hy, nextTarget.x - h.hx);
            p.x = h.hx;
            p.y = h.hy;
            p.vx = Math.cos(ang) * spd;
            p.vy = Math.sin(ang) * spd;
            p.chainJump = false; // jump once cleanly per shot unless pierce remains
            p.lifeTicks = Math.max(p.lifeTicks, 24);
            consumedByEntity = true;
            break;
          }
        }

        if (p.pierceLeft > 0) {
          p.pierceLeft -= 1;
        } else {
          alive = false;
          consumedByEntity = true;
          break;
        }
      }
    } else {
      // Enemy or Frost Crystal projectile vs Player
      const hitP = sweepSegmentVsCircle(p.x, p.y, nx, ny, player.x, player.y, p.radius + player.radius);
      if (hitP && hitP.t <= maxEntityT + 1e-6) {
        // Leifi Horn Shield reflects incoming enemy projectiles back!
        if (player.outcastId === 'leifi' && player.abilityActiveTicks > 0) {
          const reflectMult = getSkillEffectValue(state.skillRanks, 'horn_shield_reflect_mult', 1.5);
          p.owner = 'player';
          p.vx = -p.vx * 1.25;
          p.vy = -p.vy * 1.25;
          p.x = hitP.x + Math.sign(p.vx) * 2;
          p.y = hitP.y + Math.sign(p.vy) * 2;
          p.damage = Math.round(p.damage * reflectMult);
          p.lifeTicks = Math.max(p.lifeTicks, 60);
          p.color = '#ff9f1c';
          state.events.push({
            type: 'floating_text',
            x: player.x,
            y: player.y - 14,
            text: 'REFLECT!',
            color: '#ff9f1c',
          });
          consumedByEntity = true;
        } else if (!player.isInvisible) {
          const elem: ElementType =
            p.freezeTier > 0
              ? 'freeze'
              : p.burnTier > 0
                ? 'burn'
                : p.acidTier > 0
                  ? 'acid'
                  : p.radioactiveTier > 0
                    ? 'radioactive'
                    : p.explosiveTier > 0
                      ? 'explosive'
                      : 'none';
          applyDamageToPlayer(state, p.damage, p.x, p.y, elem);
          if (p.explosiveTier > 0) {
            triggerExplosion(state, hitP.x, hitP.y, 38, p.damage * 0.7, 'explosive', 'enemy', false);
          }
          state.events.push({
            type: 'projectile_hit',
            x: hitP.x,
            y: hitP.y,
            normalX: 0,
            normalY: -1,
            color: p.color,
            isWall: false,
          });
          alive = false;
          consumedByEntity = true;
        }
      }
    }

    // 3. Wall impact / ricochet handling
    if (alive && !consumedByEntity && wallHit) {
      state.events.push({
        type: 'projectile_hit',
        x: wallHit.x,
        y: wallHit.y,
        normalX: wallHit.normalX,
        normalY: wallHit.normalY,
        color: p.color,
        isWall: true,
      });

      // Damage destructible interior walls & crates
      const wallDmg =
        p.explosiveTier > 0 || p.damageType === 1
          ? Math.max(35, p.damage * 1.4)
          : Math.max(8, p.damage * 0.65);
      damageTile(state, wallHit.tileX, wallHit.tileY, wallDmg);

      if (p.explosiveTier > 0 || p.ragnarokNova) {
        const blastR = p.ragnarokNova ? 64 : 36 + p.explosiveTier * 12;
        const activeWep = player.weapons[player.activeSlot];
        const activeStats = activeWep
          ? computeEffectiveWeaponStats(getWeaponDef(activeWep.uniqueId), activeWep.mods, activeWep.golden, state.skillRanks)
          : null;
        triggerExplosion(
          state,
          wallHit.x,
          wallHit.y,
          blastR,
          p.damage * 0.8,
          p.ragnarokNova ? 'burn' : 'explosive',
          p.owner === 'player' ? 'player' : 'enemy',
          Boolean(activeStats?.selfDamageImmune),
        );
      }

      if (p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        // Reflect velocity across hit surface normal
        const dot = p.vx * wallHit.normalX + p.vy * wallHit.normalY;
        p.vx = p.vx - 2 * dot * wallHit.normalX;
        p.vy = p.vy - 2 * dot * wallHit.normalY;
        p.x = wallHit.x + wallHit.normalX * 1.5;
        p.y = wallHit.y + wallHit.normalY * 1.5;
      } else {
        alive = false;
      }
    } else if (alive && !consumedByEntity) {
      p.x = nx;
      p.y = ny;
    }

    if (alive) {
      projs[writeIdx++] = p;
    }
  }

  projs.length = writeIdx;
  pruneDeadEnemies(state);
}

export function stepStatusEffects(state: SimState): void {
  const enemies = state.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.hp <= 0) continue;
    const st = e.status;

    if (st.burnTicks > 0) {
      st.burnTicks -= 1;
      if (st.burnTicks % 20 === 0) {
        applyDamageToEnemy(state, e, 4 + st.burnTier * 3, { element: 'burn' });
      }
      if (st.burnTicks === 0) st.burnTier = 0;
    }

    if (e.hp > 0 && st.acidTicks > 0) {
      st.acidTicks -= 1;
      if (st.acidTicks % 24 === 0) {
        applyDamageToEnemy(state, e, 3 + st.acidTier * 2.5, { element: 'acid' });
      }
      if (st.acidTicks === 0) st.acidTier = 0;
    }

    if (e.hp > 0 && st.radTicks > 0) {
      st.radTicks -= 1;
      if (st.radTicks % 25 === 0) {
        applyDamageToEnemy(state, e, 3 + st.radTier * 2, { element: 'radioactive' });
        // Radioactive contagion spreads to nearby foes
        for (let j = 0; j < enemies.length; j++) {
          const other = enemies[j];
          if (other.id === e.id || other.hp <= 0) continue;
          const dSq = (other.x - e.x) * (other.x - e.x) + (other.y - e.y) * (other.y - e.y);
          if (dSq <= 54 * 54 && other.status.radTicks < 60) {
            other.status.radTicks = 90;
            other.status.radTier = Math.max(other.status.radTier, 1);
          }
        }
      }
      if (st.radTicks === 0) st.radTier = 0;
    }

    if (st.freezeTicks > 0) {
      st.freezeTicks -= 1;
      if (st.freezeTicks === 0) st.freezeTier = 0;
    }

    if (e.hp > 0 && st.shockTicks > 0) {
      st.shockTicks -= 1;
      if (st.shockTicks % 30 === 0) {
        // Arc lightning to a nearby foe
        for (let j = 0; j < enemies.length; j++) {
          const other = enemies[j];
          if (other.id === e.id || other.hp <= 0) continue;
          const dSq = (other.x - e.x) * (other.x - e.x) + (other.y - e.y) * (other.y - e.y);
          if (dSq <= 68 * 68) {
            applyDamageToEnemy(state, other, 6, { element: 'lightning' });
            break;
          }
        }
      }
    }
  }
  pruneDeadEnemies(state);
}

export function collectPickupNow(state: SimState, pk: PickupState): boolean {
  const p = state.player;
  const hpBonus = getSkillEffectValue(state.skillRanks, 'hp_pickup_bonus', 0);
  const ammoMult = getSkillEffectValue(state.skillRanks, 'ammo_pickup_mult', 1);

  switch (pk.kind) {
    case 'hp': {
      const heal = Math.round(pk.value + hpBonus);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      state.events.push({ type: 'pickup_collect', kind: 'hp', x: pk.x, y: pk.y, label: `+${heal} HP` });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 8, text: `+${heal} HP`, color: '#52b788' });
      return true;
    }
    case 'ammo': {
      const type: AmmoType = pk.ammoType ?? 1;
      const gain = Math.max(4, Math.round(pk.value * ammoMult));
      if (type > 0) {
        p.ammo[type] = Math.min(p.maxAmmo[type], p.ammo[type] + gain);
      }
      state.events.push({ type: 'pickup_collect', kind: 'ammo', x: pk.x, y: pk.y, label: `+${gain} AMMO` });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 8, text: `+${gain} AMMO`, color: '#ffbe0b' });
      return true;
    }
    case 'gold': {
      p.gold += pk.value;
      state.runStats.score += pk.value * 2;
      state.events.push({ type: 'pickup_collect', kind: 'gold', x: pk.x, y: pk.y, label: `+${pk.value}G` });
      return true;
    }
    case 'xp': {
      grantPlayerXp(state, pk.value);
      state.events.push({ type: 'pickup_collect', kind: 'xp', x: pk.x, y: pk.y, label: `+${pk.value} XP` });
      return true;
    }
    case 'mod': {
      const modId = pk.modId ?? pickRandomModForNode(state);
      p.backpackMods.push(modId);
      state.events.push({ type: 'pickup_collect', kind: 'mod', x: pk.x, y: pk.y, label: 'MOD ACQUIRED' });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 10, text: '+MOD', color: '#c77dff' });
      return true;
    }
    case 'weapon': {
      const uniqueId = pk.weaponUniqueId ?? pickRandomWeaponForNode(state);
      const def = getWeaponDef(uniqueId);
      const targetSlot: 0 | 1 = p.weapons[1] === null ? 1 : p.activeSlot;
      p.weapons[targetSlot] = {
        instanceId: state.nextEntityId++,
        uniqueId: def.uniqueId,
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
      if (def.ammoType !== 0) {
        p.ammo[def.ammoType] = Math.min(p.maxAmmo[def.ammoType], p.ammo[def.ammoType] + 24);
      }
      state.events.push({ type: 'pickup_collect', kind: 'weapon', x: pk.x, y: pk.y, label: def.name });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 12, text: def.name, color: '#00f5d4' });
      return true;
    }
    case 'chest_weapon': {
      if (pk.opened) return false;
      pk.opened = true;
      const wepId = pickRandomWeaponForNode(state);
      spawnPickup(state, 'weapon', pk.x + 8, pk.y, { weaponUniqueId: wepId });
      spawnPickup(state, 'gold', pk.x - 8, pk.y, { value: 25 });
      state.events.push({ type: 'pickup_collect', kind: 'chest_weapon', x: pk.x, y: pk.y, label: 'WEAPON CHEST' });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 14, text: 'WEAPON CHEST!', color: '#00f5d4' });
      return false;
    }
    case 'chest_mod': {
      if (pk.opened) return false;
      pk.opened = true;
      const modId = pickRandomModForNode(state);
      spawnPickup(state, 'mod', pk.x + 8, pk.y, { modId });
      spawnPickup(state, 'gold', pk.x - 8, pk.y, { value: 20 });
      state.events.push({ type: 'pickup_collect', kind: 'chest_mod', x: pk.x, y: pk.y, label: 'MOD CHEST' });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 14, text: 'MOD CHEST!', color: '#c77dff' });
      return false;
    }
    case 'chest_gold': {
      if (pk.opened) return false;
      pk.opened = true;
      for (let k = 0; k < 4; k++) {
        spawnPickup(state, 'gold', pk.x, pk.y, { value: 20 + state.act * 10 });
      }
      state.events.push({ type: 'pickup_collect', kind: 'chest_gold', x: pk.x, y: pk.y, label: 'GOLD CHEST' });
      state.events.push({ type: 'floating_text', x: pk.x, y: pk.y - 14, text: 'TREASURE!', color: '#ffd700' });
      return false;
    }
  }
}

export function stepPickups(state: SimState, input: InputFrame): void {
  const p = state.player;
  const activeWeapon = p.weapons[p.activeSlot];
  const activeStats = activeWeapon
    ? computeEffectiveWeaponStats(getWeaponDef(activeWeapon.uniqueId), activeWeapon.mods, activeWeapon.golden, state.skillRanks)
    : null;

  const skillRange = getSkillEffectValue(state.skillRanks, 'pickup_range_mult', 1);
  const magnetRadius = 56 * skillRange * (activeStats?.pickupRangeMult ?? 1);

  let writeIdx = 0;
  for (let i = 0; i < state.pickups.length; i++) {
    const pk = state.pickups[i];
    pk.lifeTicks -= 1;
    if (pk.lifeTicks <= 0) continue;

    // Velocity damping + tilemap bounds containment
    if (Math.abs(pk.vx) > 0.05 || Math.abs(pk.vy) > 0.05) {
      const res = resolveCircleVsTilemap(state.map, pk.x, pk.y, pk.vx, pk.vy, 5, false);
      pk.x = res.x;
      pk.y = res.y;
      pk.vx = res.vx * 0.84;
      pk.vy = res.vy * 0.84;
    }

    const dx = p.x - pk.x;
    const dy = p.y - pk.y;
    const dist = Math.hypot(dx, dy);

    const isChest = pk.kind.startsWith('chest_');
    const isAutoCollect = pk.kind === 'gold' || pk.kind === 'xp' || pk.kind === 'hp' || pk.kind === 'ammo' || pk.kind === 'mod';

    // Magnet pull toward player for resources & mods
    if (isAutoCollect && dist < magnetRadius && dist > 1) {
      const pull = Math.min(5.5, 1.8 + (1 - dist / magnetRadius) * 4.2);
      pk.x += (dx / dist) * pull;
      pk.y += (dy / dist) * pull;
    }

    let remove = false;
    if (isAutoCollect && dist <= p.radius + 10) {
      remove = collectPickupNow(state, pk);
    } else if (isChest && !pk.opened && dist <= p.radius + 18) {
      collectPickupNow(state, pk);
    } else if (pk.kind === 'weapon' && dist <= p.radius + 16 && (input.interactPressed || p.weapons[1] === null)) {
      remove = collectPickupNow(state, pk);
    }

    if (!remove) {
      state.pickups[writeIdx++] = pk;
    }
  }

  state.pickups.length = writeIdx;
}

export function checkPlayerLavaHazard(state: SimState): void {
  const p = state.player;
  if (state.tick % 24 !== 0) return;
  const tx = Math.floor(p.x / state.map.tileSize);
  const ty = Math.floor(p.y / state.map.tileSize);
  if (tx > 0 && ty > 0 && tx < state.map.width - 1 && ty < state.map.height - 1) {
    const kind = state.map.tiles[ty * state.map.width + tx] as TileKind;
    if (kind === TileKind.Lava) {
      applyDamageToPlayer(state, 10, p.x, p.y, 'burn');
    }
  }
}
