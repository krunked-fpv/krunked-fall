// ============================================================================
// KRUNKEDFALL — Full 221-Weapon Execution Engine
// ============================================================================
// Executes cooldown, burst fire, spin-up windup, overheat + venting, ammo
// consumption + refund, spreadType (random cone / even fan), projectileOffset,
// wall-safe muzzle clamping, recoil, userKnockback, shell ejection, melee
// cleave slashes, Gunilla Dual Wield, and sentient weapon drones.

import type {
  AmmoType,
  InputFrame,
  ProjectileState,
  SimState,
  WeaponDef,
  WeaponInstance,
} from '../contracts/index.js';
import { getWeaponDef } from '../data/index.js';
import { sweepProjectileVsTilemap } from './collision.js';
import { MAX_PROJECTILES, addCameraTrauma } from './combat.js';
import {
  computeEffectiveWeaponStats,
  getSkillEffectValue,
  type EffectiveWeaponStats,
} from './modGraph.js';
import { chance, nextRange } from './rng.js';
import { findNearestWalkablePos } from './tilemap.js';

const DEG_TO_RAD = Math.PI / 180;

export function createWeaponInstance(
  state: SimState,
  uniqueId: number,
  golden = false,
): WeaponInstance {
  const def = getWeaponDef(uniqueId);
  return {
    instanceId: state.nextEntityId++,
    uniqueId: def.uniqueId,
    golden,
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
}

function getProjectileVisuals(
  def: WeaponDef,
  stats: EffectiveWeaponStats,
): { color: string; spriteKey: string } {
  if (stats.ragnarokNova) return { color: '#ff2a00', spriteKey: 'proj_rocket' };
  if (stats.lightningTier > 0) return { color: '#38b6ff', spriteKey: 'proj_energy' };
  if (stats.burnTier > 0) return { color: '#ff6d00', spriteKey: 'proj_energy' };
  if (stats.freezeTier > 0) return { color: '#72efdd', spriteKey: 'proj_frost' };
  if (stats.acidTier > 0) return { color: '#80ed99', spriteKey: 'proj_energy' };
  if (stats.radioactiveTier > 0) return { color: '#b5e48c', spriteKey: 'proj_energy' };

  const ammoSprite: Record<AmmoType, { color: string; spriteKey: string }> = {
    0: { color: '#e6edf3', spriteKey: 'proj_bullet' },
    1: { color: '#ffbe0b', spriteKey: 'proj_bullet' },
    2: { color: '#ff9f1c', spriteKey: 'proj_shell' },
    3: { color: '#a8dadc', spriteKey: 'proj_bolt' },
    4: { color: '#00f5d4', spriteKey: 'proj_energy' },
    5: { color: '#ff4d6d', spriteKey: 'proj_rocket' },
  };
  return ammoSprite[def.ammoType] ?? ammoSprite[1];
}

export function updateWeaponTimers(
  state: SimState,
  weapon: WeaponInstance,
  isFiringHeld: boolean,
  isVenting: boolean,
): void {
  const def = getWeaponDef(weapon.uniqueId);

  if (weapon.cooldownTicks > 0) weapon.cooldownTicks -= 1;
  if (weapon.burstTicks > 0) weapon.burstTicks -= 1;
  if (weapon.flashTicks > 0) weapon.flashTicks -= 1;

  // Smooth spring decay on visual recoil
  weapon.recoilOffset *= 0.72;
  if (Math.abs(weapon.recoilOffset) < 0.05) weapon.recoilOffset = 0;
  weapon.recoilAngle *= 0.72;
  if (Math.abs(weapon.recoilAngle) < 0.05) weapon.recoilAngle = 0;

  // Overheat lockout & active/passive cooling
  if (weapon.overheatedLockTicks > 0) {
    weapon.overheatedLockTicks -= 1;
    weapon.overheat = Math.max(0, weapon.overheatedLockTicks / 70);
    if (weapon.overheatedLockTicks === 0) {
      weapon.overheat = 0;
    }
  } else if (weapon.overheat > 0) {
    const coolRate = isVenting ? 0.025 : isFiringHeld ? 0.003 : 0.011;
    weapon.overheat = Math.max(0, weapon.overheat - coolRate);
  }

  // Spin-up windup for miniguns, chainsaws, and charge weapons
  if (def.windupMax > 0) {
    const step = 1 / Math.max(4, def.windupMax);
    if (isFiringHeld && weapon.overheatedLockTicks <= 0) {
      weapon.windup = Math.min(1, weapon.windup + step);
    } else {
      weapon.windup = Math.max(0, weapon.windup - step * 1.8);
    }
  } else {
    weapon.windup = 1;
  }

  // Active vent feedback
  if (isVenting && weapon.overheat > 0.15 && state.tick % 18 === 0) {
    state.events.push({
      type: 'floating_text',
      x: state.player.x,
      y: state.player.y - 14,
      text: 'VENTING',
      color: '#72efdd',
      scale: 0.75,
    });
  }
}

function executeMeleeSlash(
  state: SimState,
  originX: number,
  originY: number,
  aimAngle: number,
  damage: number,
  scale: number,
  stats: EffectiveWeaponStats,
  weaponUniqueId: number,
  color: string,
): void {
  const slashRadius = Math.max(16, Math.min(68, 28 * scale));
  const slashArc = Math.min(Math.PI * 1.3, 1.35 + scale * 0.2);

  state.events.push({
    type: 'melee_slash',
    x: originX,
    y: originY,
    angle: aimAngle,
    radius: slashRadius,
    arc: slashArc,
    color,
  });

  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const proj: ProjectileState = {
    id: state.nextEntityId++,
    owner: 'player',
    weaponUniqueId,
    x: originX,
    y: originY,
    prevX: originX,
    prevY: originY,
    vx: Math.cos(aimAngle) * 2.2,
    vy: Math.sin(aimAngle) * 2.2,
    radius: Math.max(10, slashRadius * 0.58),
    damage,
    damageType: 3,
    speed: 2.2,
    lifeTicks: 4,
    maxLifeTicks: 4,
    scale,
    bouncesLeft: 0,
    pierceLeft: Math.max(6, stats.pierce),
    heatseekingRate: 0,
    isMelee: true,
    meleeArc: slashArc,
    burnTier: stats.burnTier,
    freezeTier: stats.freezeTier,
    acidTier: stats.acidTier,
    explosiveTier: stats.explosiveTier,
    radioactiveTier: stats.radioactiveTier,
    lightningTier: stats.lightningTier,
    lifestealChance: stats.lifestealChance,
    chainJump: stats.chainJump,
    ethereal: true,
    teleportOwner: false,
    goldDropBonus: stats.goldBullet,
    ragnarokNova: stats.ragnarokNova,
    color,
    spriteKey: 'proj_bullet',
  };
  state.projectiles.push(proj);
}

function fireSingleVolley(
  state: SimState,
  weapon: WeaponInstance,
  def: WeaponDef,
  stats: EffectiveWeaponStats,
  aimAngle: number,
  aimWorldX: number,
  aimWorldY: number,
  isOffhand = false,
): void {
  const p = state.player;
  const cosA = Math.cos(aimAngle);
  const sinA = Math.sin(aimAngle);

  // Recoil, muzzle flash, screenshake, and user knockback
  weapon.recoilOffset = def.spriteRecoil;
  weapon.recoilAngle = def.spriteRecoilAngle;
  weapon.flashTicks = Math.max(weapon.flashTicks, def.spriteFlashFrames);

  const isStill = Math.abs(p.vx) < 0.25 && Math.abs(p.vy) < 0.25;
  if (def.userKnockback !== 0 && (!def.knockbackOnlyWhenStill || isStill)) {
    const kb = def.userKnockback * 0.42 * (stats.knockbackMult > 1 ? 1 + (stats.knockbackMult - 1) * 0.25 : 1);
    p.vx -= cosA * kb;
    p.vy -= sinA * kb;
  }

  if (Math.abs(def.screenshakeAmount) > 0) {
    addCameraTrauma(
      state,
      Math.min(0.45, Math.abs(def.screenshakeAmount) * 0.04),
      -cosA,
      -sinA,
    );
  }

  // Wall-safe muzzle offset computation
  const isMelee =
    def.class === 1 ||
    def.damageType === 3 ||
    (def.ammoType === 0 && def.projectileSpeed <= 3);
  const rawOffset = Math.max(8, Math.min(isMelee ? 44 : 26, def.projectileOffset || 14));
  let muzzleX = p.x + cosA * rawOffset + (isOffhand ? -sinA * 6 : 0);
  let muzzleY = p.y + sinA * rawOffset + (isOffhand ? cosA * 6 : 0);

  if (!def.projectileOffsetIgnoreWall && !stats.etherealShot) {
    const muzzleHit = sweepProjectileVsTilemap(state.map, p.x, p.y, muzzleX, muzzleY, 0, false);
    if (muzzleHit) {
      muzzleX = muzzleHit.x + muzzleHit.normalX * 2.5;
      muzzleY = muzzleHit.y + muzzleHit.normalY * 2.5;
    }
  }

  state.events.push({
    type: 'weapon_fire',
    x: muzzleX,
    y: muzzleY,
    angle: aimAngle,
    weaponUniqueId: def.uniqueId,
    ammoType: def.ammoType,
    soundKey: def.soundFire.soundKey,
    soundId: def.soundFire.soundId,
    volume: def.soundFire.volume,
    pitch: def.soundFire.pitch,
    flashFrames: def.spriteFlashFrames,
  });

  // Brass casing / shell ejection
  if (def.ejectionAmount > 0 && def.ejectionType > 0) {
    const ejectCount = Math.min(4, def.ejectionAmount);
    for (let e = 0; e < ejectCount; e++) {
      const side = p.facing >= 0 ? -1 : 1;
      const ejectAngle = aimAngle + side * (Math.PI * 0.5 + nextRange(state, -0.35, 0.35));
      const ejectSpd = nextRange(state, 1.4, 2.8);
      state.events.push({
        type: 'shell_eject',
        x: p.x + cosA * 6,
        y: p.y + sinA * 6,
        vx: Math.cos(ejectAngle) * ejectSpd,
        vy: Math.sin(ejectAngle) * ejectSpd - 0.8,
        kind: def.ejectionType,
      });
    }
  }

  const visuals = getProjectileVisuals(def, stats);

  if (isMelee) {
    executeMeleeSlash(
      state,
      muzzleX,
      muzzleY,
      aimAngle,
      stats.damage,
      stats.projectileScale,
      stats,
      def.uniqueId,
      visuals.color,
    );
    if (stats.meleeExtraAttack) {
      executeMeleeSlash(
        state,
        muzzleX + cosA * 6,
        muzzleY + sinA * 6,
        aimAngle + 0.25,
        stats.damage * 0.7,
        stats.projectileScale * 0.9,
        stats,
        def.uniqueId,
        visuals.color,
      );
    }
    p.shotsFired += 1;
  } else {
    const count = stats.projectileAmount;
    const spreadRad = stats.projectileSpread * DEG_TO_RAD;

    // Teleporter mod warps shot origin near aimed world cursor within 220px
    let spawnBaseX = muzzleX;
    let spawnBaseY = muzzleY;
    if (stats.teleportShot) {
      const dx = aimWorldX - p.x;
      const dy = aimWorldY - p.y;
      const d = Math.hypot(dx, dy);
      const clampedDist = Math.min(220, d);
      const tx = d > 1 ? p.x + (dx / d) * clampedDist : muzzleX;
      const ty = d > 1 ? p.y + (dy / d) * clampedDist : muzzleY;
      const safe = findNearestWalkablePos(state.map, tx, ty);
      spawnBaseX = safe.x;
      spawnBaseY = safe.y;
    }

    const projRadius = Math.max(2.5, Math.min(12, 3.8 * stats.projectileScale));
    const explosiveTier = stats.explosiveTier + (def.ammoType === 5 || def.damageType === 1 ? 1 : 0);

    for (let i = 0; i < count; i++) {
      if (state.projectiles.length >= MAX_PROJECTILES) break;

      let angleOffset = 0;
      if (def.spreadType === 1 && count > 1) {
        // Even fan distribution
        const frac = i / (count - 1) - 0.5;
        angleOffset = frac * Math.max(spreadRad, 0.14);
      } else if (spreadRad > 0) {
        // Random cone distribution
        angleOffset = nextRange(state, -spreadRad * 0.5, spreadRad * 0.5);
      }

      const shotAngle = aimAngle + angleOffset;
      const spd = stats.projectileSpeed;

      const proj: ProjectileState = {
        id: state.nextEntityId++,
        owner: 'player',
        weaponUniqueId: def.uniqueId,
        x: spawnBaseX,
        y: spawnBaseY,
        prevX: spawnBaseX,
        prevY: spawnBaseY,
        vx: Math.cos(shotAngle) * spd,
        vy: Math.sin(shotAngle) * spd,
        radius: projRadius,
        damage: stats.damage,
        damageType: def.damageType,
        speed: spd,
        lifeTicks: stats.lifeTicks,
        maxLifeTicks: stats.lifeTicks,
        scale: stats.projectileScale,
        bouncesLeft: stats.extraBounces,
        pierceLeft: stats.pierce,
        heatseekingRate: stats.heatseekingRate,
        isMelee: false,
        burnTier: stats.burnTier,
        freezeTier: stats.freezeTier,
        acidTier: stats.acidTier,
        explosiveTier,
        radioactiveTier: stats.radioactiveTier,
        lightningTier: stats.lightningTier,
        lifestealChance: stats.lifestealChance,
        chainJump: stats.chainJump,
        ethereal: stats.etherealShot,
        teleportOwner: stats.teleportShot,
        goldDropBonus: stats.goldBullet,
        ragnarokNova: stats.ragnarokNova,
        color: visuals.color,
        spriteKey: visuals.spriteKey,
      };
      state.projectiles.push(proj);
    }

    // Bayonette / Extra Melee Strike triggers close-range slash alongside gunfire
    if (stats.meleeExtraAttack) {
      executeMeleeSlash(
        state,
        p.x + cosA * 18,
        p.y + sinA * 18,
        aimAngle,
        Math.max(12, stats.damage * 0.65),
        0.75,
        stats,
        def.uniqueId,
        '#e5e5e5',
      );
    }

    p.shotsFired += count;
  }

  // Overheat accumulation
  if (stats.overheatPerShot > 0) {
    weapon.overheat = Math.min(1, weapon.overheat + stats.overheatPerShot);
    if (weapon.overheat >= 1) {
      weapon.overheatedLockTicks = 70;
      weapon.burstRemaining = 0;
      state.events.push({
        type: 'floating_text',
        x: p.x,
        y: p.y - 16,
        text: 'OVERHEAT!',
        color: '#ff4d6d',
      });
    }
  }
}

export function tryFireWeapon(
  state: SimState,
  weapon: WeaponInstance,
  aimAngle: number,
  aimWorldX: number,
  aimWorldY: number,
  opts: { isOffhand?: boolean; freeAmmo?: boolean } = {},
): boolean {
  const p = state.player;
  if (weapon.cooldownTicks > 0 || weapon.overheatedLockTicks > 0 || weapon.burstRemaining > 0) {
    return false;
  }

  const def = getWeaponDef(weapon.uniqueId);
  const stats = computeEffectiveWeaponStats(def, weapon.mods, weapon.golden, state.skillRanks);

  // Spin-up gating for heavy windup weapons (fires faster as windup approaches 1)
  const windupMult = def.windupMax > 0 ? 1.8 - weapon.windup * 0.8 : 1;

  // Ammo check (ammoType === 0 melee is always free)
  const isMagicLeafFree = p.outcastId === 'gunilla' && p.powerActiveTicks > 0;
  if (def.ammoType !== 0 && !opts.freeAmmo && !isMagicLeafFree) {
    if (p.ammo[def.ammoType] < stats.ammoCost) {
      if (state.tick % 30 === 0 && !opts.isOffhand) {
        state.events.push({
          type: 'floating_text',
          x: p.x,
          y: p.y - 14,
          text: 'NO AMMO',
          color: '#ff4d6d',
          scale: 0.85,
        });
      }
      return false;
    }
    if (!chance(state, stats.refundChance)) {
      p.ammo[def.ammoType] = Math.max(0, p.ammo[def.ammoType] - stats.ammoCost);
    }
  }

  // Outcast fire-rate bonuses (Britta Metal Berserk, Gunilla Dual Wield Bullet Storm)
  let outcastCdr = 1;
  if (p.outcastId === 'britta' && p.powerActiveTicks > 0) {
    outcastCdr *= 0.55;
  }
  if (p.outcastId === 'gunilla' && p.abilityActiveTicks > 0) {
    outcastCdr *= getSkillEffectValue(state.skillRanks, 'dual_wield_cooldown_mult', 0.92);
  }

  weapon.cooldownTicks = Math.max(1, Math.round(stats.cooldown * windupMult * outcastCdr));
  weapon.burstRemaining = Math.max(0, stats.burstCount - 1);
  weapon.burstTicks = stats.burstCooldown;

  fireSingleVolley(state, weapon, def, stats, aimAngle, aimWorldX, aimWorldY, Boolean(opts.isOffhand));
  return true;
}

export function stepWeapons(
  state: SimState,
  input: InputFrame,
  activeStats: EffectiveWeaponStats,
): void {
  const p = state.player;
  const activeWeapon = p.weapons[p.activeSlot];
  const offhandSlot: 0 | 1 = p.activeSlot === 0 ? 1 : 0;
  const offhandWeapon = p.weapons[offhandSlot];

  const isDualWielding = p.outcastId === 'gunilla' && p.abilityActiveTicks > 0;
  const wantsFire = input.firePrimary || p.bufferedInput.fire > 0;

  if (activeWeapon) {
    updateWeaponTimers(state, activeWeapon, wantsFire, input.reloadOrVentPressed);

    // Continue queued burst shots
    if (activeWeapon.burstRemaining > 0 && activeWeapon.burstTicks <= 0 && activeWeapon.overheatedLockTicks <= 0) {
      const def = getWeaponDef(activeWeapon.uniqueId);
      const stats = computeEffectiveWeaponStats(def, activeWeapon.mods, activeWeapon.golden, state.skillRanks);
      activeWeapon.burstRemaining -= 1;
      activeWeapon.burstTicks = stats.burstCooldown;
      fireSingleVolley(state, activeWeapon, def, stats, p.aimAngle, input.aimWorldX, input.aimWorldY, false);
    }

    // Trigger primary attack
    if (wantsFire) {
      if (tryFireWeapon(state, activeWeapon, p.aimAngle, input.aimWorldX, input.aimWorldY)) {
        p.bufferedInput.fire = 0;
        // Gunilla Dual Wield: mirror burst if no offhand equipped
        if (isDualWielding && !offhandWeapon) {
          const def = getWeaponDef(activeWeapon.uniqueId);
          fireSingleVolley(state, activeWeapon, def, activeStats, p.aimAngle + 0.06, input.aimWorldX, input.aimWorldY, true);
        }
      }
    } else if (activeStats.meleeAutoAttack && activeWeapon.cooldownTicks <= 0) {
      // Automatic Melee Rig: swings automatically when an enemy enters close range
      let nearest: { x: number; y: number } | null = null;
      let bestDSq = 58 * 58;
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp <= 0) continue;
        const dSq = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
        if (dSq < bestDSq) {
          bestDSq = dSq;
          nearest = e;
        }
      }
      if (nearest) {
        const autoAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
        tryFireWeapon(state, activeWeapon, autoAngle, nearest.x, nearest.y);
      }
    }
  }

  if (offhandWeapon) {
    updateWeaponTimers(state, offhandWeapon, isDualWielding && wantsFire, input.reloadOrVentPressed);
    if (isDualWielding) {
      if (offhandWeapon.burstRemaining > 0 && offhandWeapon.burstTicks <= 0 && offhandWeapon.overheatedLockTicks <= 0) {
        const def = getWeaponDef(offhandWeapon.uniqueId);
        const stats = computeEffectiveWeaponStats(def, offhandWeapon.mods, offhandWeapon.golden, state.skillRanks);
        offhandWeapon.burstRemaining -= 1;
        offhandWeapon.burstTicks = stats.burstCooldown;
        fireSingleVolley(state, offhandWeapon, def, stats, p.aimAngle, input.aimWorldX, input.aimWorldY, true);
      }
      if (wantsFire) {
        tryFireWeapon(state, offhandWeapon, p.aimAngle, input.aimWorldX, input.aimWorldY, {
          isOffhand: true,
        });
      }
    }
  }

  // Magnet Pull mod gently draws nearby foes & objects inward
  if (activeStats.magnetPull && state.tick % 4 === 0) {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0 || e.isBoss) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 34 && dist < 135) {
        e.vx += (dx / dist) * 0.35;
        e.vy += (dy / dist) * 0.35;
      }
    }
  }

  // Sentient Turret / Gun Drone mod keeps a hovering gun_drone companion alive
  if (activeStats.sentientTurret) {
    const existingDrone = state.companions.find((c) => c.kind === 'gun_drone');
    if (existingDrone) {
      existingDrone.lifeTicks = Math.max(existingDrone.lifeTicks, 90);
      existingDrone.damage = Math.max(8, Math.round(activeStats.damage * 0.55));
    } else if (state.companions.length < 16) {
      state.companions.push({
        id: state.nextEntityId++,
        kind: 'gun_drone',
        x: p.x + 18,
        y: p.y - 12,
        prevX: p.x + 18,
        prevY: p.y - 12,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 6,
        lifeTicks: 120,
        fireCooldown: 18,
        damage: Math.max(8, Math.round(activeStats.damage * 0.55)),
      });
    }
  }
}
