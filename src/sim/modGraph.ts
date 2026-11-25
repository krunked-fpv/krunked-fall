// ============================================================================
// KRUNKEDFALL — Weapon Mod Composition & Yggdrasil Skill Graph
// ============================================================================
// Composes ALL 76 mods from `src/data/mods.ts`, Golden Upgrades, and Yggdrasil
// Skill Tree passive nodes into deterministic effective weapon & player stats.

import type {
  ElementType,
  SimState,
  WeaponDef,
} from '../contracts/index.js';
import {
  MOD_BY_ID,
  RUN_MODIFIER_BY_ID,
  SKILL_NODES,
} from '../data/index.js';

export const BASE_WEAPON_MOD_LIMIT = 4;

export interface EffectiveWeaponStats {
  cooldown: number;
  burstCount: number;
  burstCooldown: number;
  projectileAmount: number;
  projectileSpeed: number;
  projectileSpread: number; // degrees
  damage: number;
  projectileScale: number;
  extraBounces: number;
  pierce: number;
  heatseekingRate: number;
  overheatPerShot: number;
  ammoCost: number;
  lifeTicks: number;
  lifestealChance: number;
  refundChance: number;
  knockbackMult: number;
  critChanceBonus: number;
  burnTier: number;
  freezeTier: number;
  acidTier: number;
  explosiveTier: number;
  radioactiveTier: number;
  lightningTier: number;
  laserSight: boolean;
  chainJump: boolean;
  magnetPull: boolean;
  sentientTurret: boolean;
  meleeExtraAttack: boolean;
  meleeAutoAttack: boolean;
  selfDamageImmune: boolean;
  elementImmunities: ElementType[];
  goldBullet: boolean;
  teleportShot: boolean;
  etherealShot: boolean;
  ragnarokNova: boolean;
  // Passive bonuses granted to the player while wielding this weapon
  armorAdd: number;
  shieldAdd: number;
  speedMult: number;
  pickupRangeMult: number;
  passiveAmmoRegen: number;
}

export interface RunModifierSummary {
  enemyHpMult: number;
  enemySpeedMult: number;
  dropQualityBonus: number;
  freezeRateMult: number;
  scoreMult: number;
}

/**
 * Computes the effective value for a Yggdrasil skill `effectKey` given current
 * `skillRanks`. If unallocated, returns `defaultValue`.
 */
export function getSkillEffectValue(
  skillRanks: Record<string, number>,
  effectKey: string,
  defaultValue: number,
): number {
  for (let i = 0; i < SKILL_NODES.length; i++) {
    const node = SKILL_NODES[i];
    if (node.effectKey !== effectKey) continue;
    const rank = skillRanks[node.id] ?? 0;
    if (rank <= 0) return defaultValue;
    const clampedRank = Math.min(rank, node.valuesPerRank.length);
    return node.valuesPerRank[clampedRank - 1] ?? defaultValue;
  }
  return defaultValue;
}

/**
 * Returns the maximum number of mods attachable to a single weapon.
 */
export function getWeaponModLimit(skillRanks: Record<string, number>): number {
  return BASE_WEAPON_MOD_LIMIT + Math.floor(getSkillEffectValue(skillRanks, 'weapon_mod_limit_add', 0));
}

/**
 * Aggregates all active Run Modifiers from the Run Modifier Stone.
 */
export function computeRunModifiers(activeModifierIds: readonly string[]): RunModifierSummary {
  let enemyHpMult = 1;
  let enemySpeedMult = 1;
  let dropQualityBonus = 0;
  let freezeRateMult = 1;
  let scoreMult = 1;

  for (let i = 0; i < activeModifierIds.length; i++) {
    const mod = RUN_MODIFIER_BY_ID.get(activeModifierIds[i]);
    if (!mod) continue;
    enemyHpMult *= mod.enemyHpMult;
    enemySpeedMult *= mod.enemySpeedMult;
    dropQualityBonus += mod.dropQualityBonus;
    freezeRateMult *= mod.freezeRateMult;
    scoreMult *= mod.scoreMult;
  }

  return {
    enemyHpMult,
    enemySpeedMult,
    dropQualityBonus,
    freezeRateMult,
    scoreMult,
  };
}

/**
 * Composes every attached ModDef, Golden Upgrade bonus (+35% damage, +15% fire
 * rate, -20% overheat), and Yggdrasil Skill Tree modifier into concrete weapon
 * execution parameters. Zero dead mods — all 76 mods in `src/data/mods.ts`
 * affect gameplay cleanly.
 */
export function computeEffectiveWeaponStats(
  weaponDef: WeaponDef,
  modIds: readonly string[],
  golden = false,
  skillRanks: Record<string, number> = {},
): EffectiveWeaponStats {
  const isMelee = weaponDef.class === 1 || weaponDef.damageType === 3;

  let cooldownMult = 1;
  let burstCountAdd = 0;
  let projectileAmountAdd = 0;
  let projectileAmountMult = 1;
  let projectileSpeedMult = 1;
  let projectileSpreadAdd = 0;
  let projectileSpreadMult = 1;
  let damageMult = 1;
  let projectileScaleMult = 1;
  let extraBouncesAdd = 0;
  let pierceAdd = 0;
  let heatseekingAdd = 0;
  let overheatMult = 1;
  let lifestealAdd = 0;
  let refundChanceAdd = 0;
  let knockbackMult = 1;
  let ammoCostMult = 1;
  let lifeTicksMult = 1;

  let burnTier = weaponDef.burnTier;
  let freezeTier = weaponDef.freezeTier;
  let acidTier = weaponDef.acidTier;
  let explosiveTier = weaponDef.explosiveTier;
  let radioactiveTier = weaponDef.radioactiveTier;
  let lightningTier = 0;

  let laserSight = weaponDef.laserSight;
  let chainJump = false;
  let magnetPull = false;
  let sentientTurret = false;
  let meleeExtraAttack = false;
  let meleeAutoAttack = false;
  let selfDamageImmune = false;
  const elementImmunities: ElementType[] = [];
  let goldBullet = false;
  let teleportShot = false;
  let etherealShot = false;
  let ragnarokNova = false;

  let armorAdd = 0;
  let shieldAdd = 0;
  let speedMult = 1;
  let pickupRangeMult = 1;
  let passiveAmmoRegen = 0;

  for (let i = 0; i < modIds.length; i++) {
    const mod = MOD_BY_ID.get(modIds[i]);
    if (!mod) continue;
    const d = mod.modifiers;

    if (d.cooldownMult !== undefined) cooldownMult *= d.cooldownMult;
    if (d.burstCountAdd !== undefined) burstCountAdd += d.burstCountAdd;
    if (d.projectileAmountAdd !== undefined) projectileAmountAdd += d.projectileAmountAdd;
    if (d.projectileAmountMult !== undefined) projectileAmountMult *= d.projectileAmountMult;
    if (d.projectileSpeedMult !== undefined) projectileSpeedMult *= d.projectileSpeedMult;
    if (d.projectileSpreadAdd !== undefined) projectileSpreadAdd += d.projectileSpreadAdd;
    if (d.projectileSpreadMult !== undefined) projectileSpreadMult *= d.projectileSpreadMult;
    if (d.damageMult !== undefined) damageMult *= d.damageMult;
    if (d.projectileScaleMult !== undefined) projectileScaleMult *= d.projectileScaleMult;
    if (d.extraBouncesAdd !== undefined) extraBouncesAdd += d.extraBouncesAdd;
    if (d.pierceAdd !== undefined) pierceAdd += d.pierceAdd;
    if (d.heatseekingAdd !== undefined) heatseekingAdd += d.heatseekingAdd;
    if (d.overheatMult !== undefined) overheatMult *= d.overheatMult;
    if (d.lifestealAdd !== undefined) lifestealAdd += d.lifestealAdd;
    if (d.refundChanceAdd !== undefined) refundChanceAdd += d.refundChanceAdd;
    if (d.knockbackMult !== undefined) knockbackMult *= d.knockbackMult;
    if (d.ammoCostMult !== undefined) ammoCostMult *= d.ammoCostMult;
    if (d.lifeTicksMult !== undefined) lifeTicksMult *= d.lifeTicksMult;

    if (d.burnTierAdd !== undefined) burnTier += d.burnTierAdd;
    if (d.freezeTierAdd !== undefined) freezeTier += d.freezeTierAdd;
    if (d.acidTierAdd !== undefined) acidTier += d.acidTierAdd;
    if (d.explosiveTierAdd !== undefined) explosiveTier += d.explosiveTierAdd;
    if (d.radioactiveTierAdd !== undefined) radioactiveTier += d.radioactiveTierAdd;
    if (d.lightningTierAdd !== undefined) lightningTier += d.lightningTierAdd;

    if (d.laserSight) laserSight = true;
    if (d.chainJump) chainJump = true;
    if (d.magnetPull) magnetPull = true;
    if (d.sentientTurret) sentientTurret = true;
    if (d.meleeExtraAttack) meleeExtraAttack = true;
    if (d.meleeAutoAttack) meleeAutoAttack = true;
    if (d.selfDamageImmune) selfDamageImmune = true;
    if (d.elementImmune && !elementImmunities.includes(d.elementImmune)) {
      elementImmunities.push(d.elementImmune);
    }
    if (d.goldBullet) goldBullet = true;
    if (d.teleportShot) teleportShot = true;
    if (d.etherealShot) etherealShot = true;
    if (d.ragnarokNova) ragnarokNova = true;

    if (d.armorAdd !== undefined) armorAdd += d.armorAdd;
    if (d.shieldAdd !== undefined) shieldAdd += d.shieldAdd;
    if (d.speedMult !== undefined) speedMult *= d.speedMult;
    if (d.pickupRangeMult !== undefined) pickupRangeMult *= d.pickupRangeMult;
    if (d.passiveAmmoRegen !== undefined) passiveAmmoRegen += d.passiveAmmoRegen;
  }

  // Golden Weapon Upgrade: +35% damage, +15% fire rate, -20% overheat
  if (golden) {
    damageMult *= 1.35;
    cooldownMult /= 1.15;
    overheatMult *= 0.8;
  }

  // Yggdrasil Skill Tree bonuses
  const skillCooldownMult = getSkillEffectValue(skillRanks, 'weapon_cooldown_mult', 1);
  const skillSpreadMult = getSkillEffectValue(skillRanks, 'weapon_spread_mult', 1);
  const skillCritAdd = getSkillEffectValue(skillRanks, 'crit_chance_add', 0);
  const skillSelfResist = getSkillEffectValue(skillRanks, 'self_damage_resist', 0);
  if (skillSelfResist >= 1) {
    selfDamageImmune = true;
  }

  cooldownMult *= skillCooldownMult;
  projectileSpreadMult *= skillSpreadMult;

  if (isMelee) {
    const ghostBladeMult = getSkillEffectValue(skillRanks, 'melee_size_mult', 1);
    const sweepingMult = getSkillEffectValue(skillRanks, 'snare_radius_mult', 1);
    projectileScaleMult *= ghostBladeMult * (1 + (sweepingMult - 1) * 0.5);
  }

  const baseDamageFactor = weaponDef.damageFactor > 0 ? weaponDef.damageFactor : 1;
  const rawDamage = Math.max(1, weaponDef.baseDamage * baseDamageFactor * damageMult);

  const rawProjAmount = Math.max(
    1,
    Math.round((Math.max(1, weaponDef.projectileAmount) + projectileAmountAdd) * projectileAmountMult),
  );
  // Cap per-volley projectiles so extreme mod stacks stay fast and readable
  const projectileAmount = Math.min(24, rawProjAmount);

  const baseSpeed =
    weaponDef.projectileSpeed > 0
      ? weaponDef.projectileSpeed
      : isMelee
        ? 1.5
        : 8;
  const projectileSpeed = Math.max(0.5, baseSpeed * projectileSpeedMult);

  const projectileSpread = Math.max(
    0,
    Math.min(180, (weaponDef.projectileSpread + projectileSpreadAdd) * projectileSpreadMult),
  );

  const cooldown = Math.max(1, weaponDef.cooldown * cooldownMult);
  const burstCount = Math.max(1, Math.min(12, Math.max(1, weaponDef.burstCount) + burstCountAdd));
  const burstCooldown = Math.max(1, Math.round((weaponDef.burstCooldown || 4) * Math.min(1, cooldownMult)));

  const baseOverheatPerShot =
    weaponDef.overheat > 0
      ? (weaponDef.overheat / Math.max(1, weaponDef.overheatFactor || 1)) * 0.45
      : 0;
  const overheatPerShot = Math.max(0, baseOverheatPerShot * overheatMult);

  const rawAmmoCost = weaponDef.ammoType === 0 ? 0 : Math.max(1, weaponDef.ammoCost) * ammoCostMult;
  const ammoCost = weaponDef.ammoType === 0 ? 0 : Math.max(1, Math.round(rawAmmoCost));

  const baseLifeTicks = isMelee
    ? 6
    : weaponDef.ammoType === 5
      ? 95
      : Math.max(36, Math.min(120, Math.round(420 / Math.max(2, baseSpeed))));
  const lifeTicks = Math.max(4, Math.round(baseLifeTicks * lifeTicksMult));

  return {
    cooldown,
    burstCount,
    burstCooldown,
    projectileAmount,
    projectileSpeed,
    projectileSpread,
    damage: rawDamage,
    projectileScale: Math.max(0.25, Math.min(3.5, (weaponDef.projectileScale || 1) * projectileScaleMult)),
    extraBounces: Math.max(0, weaponDef.extraProjectileBounces + extraBouncesAdd),
    pierce: Math.max(0, pierceAdd + (isMelee ? 8 : 0)),
    heatseekingRate: Math.max(0, weaponDef.heatseekingRate + heatseekingAdd),
    overheatPerShot,
    ammoCost,
    lifeTicks,
    lifestealChance: Math.max(0, Math.min(0.85, weaponDef.lifestealChance + lifestealAdd)),
    refundChance: Math.max(0, Math.min(0.95, weaponDef.refundChance + refundChanceAdd)),
    knockbackMult,
    critChanceBonus: skillCritAdd,
    burnTier,
    freezeTier,
    acidTier,
    explosiveTier,
    radioactiveTier,
    lightningTier,
    laserSight,
    chainJump,
    magnetPull,
    sentientTurret,
    meleeExtraAttack,
    meleeAutoAttack,
    selfDamageImmune,
    elementImmunities,
    goldBullet,
    teleportShot,
    etherealShot,
    ragnarokNova,
    armorAdd,
    shieldAdd,
    speedMult,
    pickupRangeMult,
    passiveAmmoRegen,
  };
}

/**
 * Re-synchronizes derived passive stats (armor, maxShield) on `state.player`
 * from equipped active weapon mods and skill tree ranks.
 */
export function syncPlayerDerivedStats(
  state: SimState,
  activeStats: EffectiveWeaponStats,
): void {
  const p = state.player;
  p.armor = Math.max(0, activeStats.armorAdd);
  const nextMaxShield = Math.max(0, activeStats.shieldAdd);
  if (nextMaxShield > p.maxShield) {
    p.shield += nextMaxShield - p.maxShield;
  }
  p.maxShield = nextMaxShield;
  if (p.shield > p.maxShield) {
    p.shield = p.maxShield;
  }
}
