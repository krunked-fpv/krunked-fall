// ============================================================================
// KRUNKEDFALL — All 8 Playable Outcasts' Abilities, Powers & Companions
// ============================================================================
// 1. Britta:  Pneumatic Dash / Metal Berserk
// 2. Leifi:   Horn Shield / Trample Charge
// 3. Gustaf:  Ghost Walk / Shadow Execution
// 4. Einar:   Turretmouth / Drillnose
// 5. Gunilla: Dual Wield / Magic Leaf
// 6. Trulls:  Whirlpool / Snare Overload
// 7. Stellan: Ball of Doom / Wrecking Frenzy
// 8. Hilda:   Summon Seedling / Overgrowth
// Includes 6-tick input buffering for fire, ability, power, and weapon swap.

import type {
  AmmoType,
  CompanionState,
  InputFrame,
  ProjectileState,
  SimState,
} from '../contracts/index.js';
import { getOutcastDef } from '../data/index.js';
import { resolveCircleVsTilemap } from './collision.js';
import {
  MAX_PROJECTILES,
  addCameraTrauma,
  applyDamageToEnemy,
  collectPickupNow,
  pruneDeadEnemies,
  triggerExplosion,
} from './combat.js';
import { getSkillEffectValue } from './modGraph.js';
import { damageTilesInRadius, findNearestWalkablePos } from './tilemap.js';

export const INPUT_BUFFER_TICKS = 6;
export const MAX_COMPANIONS = 16;

function spawnCompanion(
  state: SimState,
  kind: CompanionState['kind'],
  x: number,
  y: number,
  opts: {
    angle?: number;
    radius?: number;
    lifeTicks: number;
    damage: number;
    fireCooldown?: number;
    vx?: number;
    vy?: number;
  },
): CompanionState {
  if (state.companions.length >= MAX_COMPANIONS) {
    // Evict oldest companion of the same kind, or oldest overall
    const sameIdx = state.companions.findIndex((c) => c.kind === kind);
    state.companions.splice(sameIdx >= 0 ? sameIdx : 0, 1);
  }
  const safe = findNearestWalkablePos(state.map, x, y);
  const comp: CompanionState = {
    id: state.nextEntityId++,
    kind,
    x: safe.x,
    y: safe.y,
    prevX: safe.x,
    prevY: safe.y,
    vx: opts.vx ?? 0,
    vy: opts.vy ?? 0,
    angle: opts.angle ?? 0,
    radius: opts.radius ?? 8,
    lifeTicks: opts.lifeTicks,
    fireCooldown: opts.fireCooldown ?? 15,
    damage: opts.damage,
  };
  state.companions.push(comp);
  return comp;
}

export function updateInputBuffers(state: SimState, input: InputFrame): void {
  const buf = state.player.bufferedInput;
  buf.fire = input.firePrimaryPressed ? INPUT_BUFFER_TICKS : Math.max(0, buf.fire - 1);
  buf.ability = input.abilityPressed ? INPUT_BUFFER_TICKS : Math.max(0, buf.ability - 1);
  buf.power = input.powerPressed ? INPUT_BUFFER_TICKS : Math.max(0, buf.power - 1);
  buf.swap = input.swapWeaponPressed ? INPUT_BUFFER_TICKS : Math.max(0, buf.swap - 1);
}

/**
 * Triggers the active Outcast's signature Ability (if a charge is ready).
 */
export function triggerOutcastAbility(state: SimState, input: InputFrame): boolean {
  const p = state.player;
  if (p.abilityCharges <= 0) return false;

  const outcast = getOutcastDef(p.outcastId);
  const cdMult = getSkillEffectValue(state.skillRanks, 'ability_cooldown_mult', 1);
  const effectiveCd = Math.max(20, Math.round(outcast.abilityCooldownTicks * cdMult));

  p.abilityCharges -= 1;
  if (p.abilityCooldown <= 0) {
    p.abilityCooldown = effectiveCd;
  }

  const moveLen = Math.hypot(input.moveX, input.moveY);
  const dirAngle = moveLen > 0.1 ? Math.atan2(input.moveY, input.moveX) : p.aimAngle;

  switch (p.outcastId) {
    case 'britta': {
      // Pneumatic Dash: invulnerable burst dash + contact impact + wall smash
      const dashSpd = 8.4;
      p.dashTicks = 14;
      p.dashVx = Math.cos(dirAngle) * dashSpd;
      p.dashVy = Math.sin(dirAngle) * dashSpd;
      p.iframes = Math.max(p.iframes, 20);
      p.abilityActiveTicks = 14;
      addCameraTrauma(state, 0.22, Math.cos(dirAngle), Math.sin(dirAngle));
      break;
    }

    case 'leifi': {
      // Horn Shield: full invulnerability at reduced movement speed + reflection
      const extraTicks = getSkillEffectValue(state.skillRanks, 'horn_shield_ticks_add', 0);
      p.abilityActiveTicks = 120 + Math.round(extraTicks);
      p.isInvulnerable = true;
      break;
    }

    case 'gustaf': {
      // Ghost Walk: invisibility, enemy phasing, and speed surge
      const bonus = getSkillEffectValue(state.skillRanks, 'ghost_walk_bonus', 1);
      const dur = Math.round(150 * bonus);
      p.abilityActiveTicks = dur;
      p.isInvisible = true;
      p.speedBonusTicks = Math.max(p.speedBonusTicks, dur);
      break;
    }

    case 'einar': {
      // Turretmouth: autonomous tracking turret companion (+ optional Drill March / Dash Mine)
      const durMult = getSkillEffectValue(state.skillRanks, 'turret_duration_mult', 1);
      spawnCompanion(state, 'turret', p.x + Math.cos(p.aimAngle) * 14, p.y + Math.sin(p.aimAngle) * 14, {
        angle: p.aimAngle,
        radius: 8,
        lifeTicks: Math.round(480 * durMult),
        damage: 14 + state.act * 3,
        fireCooldown: 12,
      });
      const drillCount = Math.floor(getSkillEffectValue(state.skillRanks, 'turret_spawns_drill', 0));
      for (let d = 0; d < drillCount; d++) {
        spawnCompanion(state, 'drill', p.x, p.y, {
          angle: p.aimAngle + d * 0.4,
          radius: 10,
          lifeTicks: 240,
          damage: 18 + state.act * 4,
        });
      }
      const mineDmg = getSkillEffectValue(state.skillRanks, 'mine_blast_damage', 0);
      if (mineDmg > 0) {
        triggerExplosion(state, p.x, p.y, 58, mineDmg, 'explosive', 'player', true);
      }
      p.abilityActiveTicks = 24;
      break;
    }

    case 'gunilla': {
      // Dual Wield: synchronized offhand weapon firing
      p.abilityActiveTicks = 240;
      break;
    }

    case 'trulls': {
      // Whirlpool: enemy-pulling vortex companion
      const radiusMult = getSkillEffectValue(state.skillRanks, 'whirlpool_radius_mult', 1);
      const acidDps = getSkillEffectValue(state.skillRanks, 'whirlpool_acid_dps', 0);
      const aimDist = Math.min(110, Math.hypot(input.aimWorldX - p.x, input.aimWorldY - p.y));
      const wx = p.x + Math.cos(p.aimAngle) * aimDist;
      const wy = p.y + Math.sin(p.aimAngle) * aimDist;
      spawnCompanion(state, 'whirlpool', wx, wy, {
        angle: 0,
        radius: Math.round(54 * radiusMult),
        lifeTicks: 240,
        damage: 7 + Math.round(acidDps / 6) + state.act * 2,
        fireCooldown: 12,
      });
      p.abilityActiveTicks = 24;
      break;
    }

    case 'stellan': {
      // Ball of Doom: orbiting spiked wrecking ball destroying enemies, walls, & enemy shots
      const extraTicks = getSkillEffectValue(state.skillRanks, 'doom_ball_ticks_add', 0);
      const dur = 270 + Math.round(extraTicks);
      spawnCompanion(state, 'doom_ball', p.x + 36, p.y, {
        angle: p.aimAngle,
        radius: 15,
        lifeTicks: dur,
        damage: 28 + state.act * 6,
        fireCooldown: 0,
      });
      const overdrive = getSkillEffectValue(state.skillRanks, 'overdrive_speed_mult', 1);
      if (overdrive > 1) {
        p.speedBonusTicks = Math.max(p.speedBonusTicks, 240);
      }
      p.abilityActiveTicks = 30;
      break;
    }

    case 'hilda': {
      // Summon Seedling: autonomous chasing/attacking seedling companion (+ optional Entangling Roots)
      const powerMult = getSkillEffectValue(state.skillRanks, 'seedling_power_mult', 1);
      spawnCompanion(state, 'seedling', p.x + Math.cos(p.aimAngle) * 16, p.y + Math.sin(p.aimAngle) * 16, {
        angle: p.aimAngle,
        radius: 7,
        lifeTicks: Math.round(540 * powerMult),
        damage: Math.round((13 + state.act * 3) * powerMult),
        fireCooldown: 20,
      });
      const rootSlow = getSkillEffectValue(state.skillRanks, 'roots_slow_ticks', 0);
      if (rootSlow > 0) {
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= 104) {
            e.status.freezeTicks = Math.max(e.status.freezeTicks, rootSlow);
          }
        }
      }
      p.abilityActiveTicks = 24;
      break;
    }
  }

  state.events.push({
    type: 'ability_trigger',
    outcastId: p.outcastId,
    x: p.x,
    y: p.y,
    angle: dirAngle,
  });
  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 16,
    text: outcast.abilityName,
    color: outcast.accentColor,
    scale: 0.9,
  });

  return true;
}

/**
 * Triggers the active Outcast's Ultimate Power (if fully charged).
 */
export function triggerOutcastPower(state: SimState, _input: InputFrame): boolean {
  const p = state.player;
  const outcast = getOutcastDef(p.outcastId);
  const costMult = getSkillEffectValue(state.skillRanks, 'power_cost_mult', 1);
  const required = Math.max(30, Math.round(outcast.powerChargeRequired * costMult));
  p.powerChargeRequired = required;

  if (p.powerCharge < required) return false;

  p.powerCharge = 0;
  p.powerActiveTicks = outcast.powerDurationTicks;

  switch (p.outcastId) {
    case 'britta': {
      // Metal Berserk: rapid fire + melee rampage + lifesteal + shockwave cleave
      p.speedBonusTicks = Math.max(p.speedBonusTicks, outcast.powerDurationTicks);
      state.events.push({
        type: 'melee_slash',
        x: p.x,
        y: p.y,
        angle: p.aimAngle,
        radius: 64,
        arc: Math.PI * 2,
        color: '#ff4d6d',
      });
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= 72 + e.radius) {
          applyDamageToEnemy(state, e, 45 + state.act * 10, {
            isMelee: true,
            lifestealChance: 0.4,
          });
        }
      }
      pruneDeadEnemies(state);
      break;
    }

    case 'leifi': {
      // Trample Charge: unstoppable wall-crushing invulnerable stampede
      p.isInvulnerable = true;
      p.speedBonusTicks = Math.max(p.speedBonusTicks, outcast.powerDurationTicks);
      addCameraTrauma(state, 0.45, Math.cos(p.aimAngle), Math.sin(p.aimAngle));
      break;
    }

    case 'gustaf': {
      // Shadow Execution: spectral stealth + massive 4x crit shadow cleave
      p.isInvisible = true;
      p.speedBonusTicks = Math.max(p.speedBonusTicks, 200);
      const strikeMult = getSkillEffectValue(state.skillRanks, 'shadow_strike_mult', 2.0);
      state.events.push({
        type: 'melee_slash',
        x: p.x + Math.cos(p.aimAngle) * 24,
        y: p.y + Math.sin(p.aimAngle) * 24,
        angle: p.aimAngle,
        radius: 82,
        arc: Math.PI * 1.4,
        color: '#9b5de5',
      });
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= 92 + e.radius) {
          applyDamageToEnemy(state, e, (34 + state.act * 8), {
            isMelee: true,
            forceCrit: true,
            critMultOverride: Math.max(4.0, strikeMult * 1.6),
          });
        }
      }
      pruneDeadEnemies(state);
      break;
    }

    case 'einar': {
      // Drillnose: relentless wall-carving drill companion harvesting pickups & shredding foes
      spawnCompanion(state, 'drill', p.x + Math.cos(p.aimAngle) * 18, p.y + Math.sin(p.aimAngle) * 18, {
        angle: p.aimAngle,
        radius: 14,
        lifeTicks: outcast.powerDurationTicks,
        damage: 34 + state.act * 8,
        vx: Math.cos(p.aimAngle) * 4.5,
        vy: Math.sin(p.aimAngle) * 4.5,
      });
      break;
    }

    case 'gunilla': {
      // Magic Leaf: immediate heal + speed boost + rapid ammo regeneration frenzy
      const regenMult = getSkillEffectValue(state.skillRanks, 'magic_leaf_regen_mult', 1);
      const heal = 35 + (regenMult > 1 ? 15 : 0);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      p.speedBonusTicks = Math.max(p.speedBonusTicks, outcast.powerDurationTicks);
      state.events.push({
        type: 'floating_text',
        x: p.x,
        y: p.y - 22,
        text: `+${heal} HP`,
        color: '#00f5d4',
      });
      break;
    }

    case 'trulls': {
      // Snare Overload: massive chain-lightning AoE snare burst stunning & shattering walls
      const radiusMult = getSkillEffectValue(state.skillRanks, 'snare_radius_mult', 1);
      const radius = Math.round(135 * radiusMult);
      const dmg = 68 + state.act * 16;
      triggerExplosion(state, p.x, p.y, radius, dmg, 'lightning', 'player', true);
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) <= radius + e.radius) {
          e.status.shockTicks = Math.max(e.status.shockTicks, 150);
        }
      }
      break;
    }

    case 'stellan': {
      // Wrecking Frenzy: triple oversized hyper-speed balls of doom
      for (let k = 0; k < 3; k++) {
        const ang = p.aimAngle + (Math.PI * 2 * k) / 3;
        spawnCompanion(state, 'doom_ball', p.x + Math.cos(ang) * 44, p.y + Math.sin(ang) * 44, {
          angle: ang,
          radius: 22,
          lifeTicks: outcast.powerDurationTicks,
          damage: 42 + state.act * 9,
          fireCooldown: 1, // flag >0 indicates frenzy hyper-speed ball
        });
      }
      break;
    }

    case 'hilda': {
      // Overgrowth: burst heal + 4 enraged thorn-firing seedlings
      p.hp = Math.min(p.maxHp, p.hp + 35);
      const powerMult = getSkillEffectValue(state.skillRanks, 'seedling_power_mult', 1);
      for (let k = 0; k < 4; k++) {
        const ang = (Math.PI * 2 * k) / 4;
        spawnCompanion(state, 'seedling', p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, {
          angle: ang,
          radius: 8,
          lifeTicks: outcast.powerDurationTicks,
          damage: Math.round((18 + state.act * 4) * powerMult),
          fireCooldown: 10,
        });
      }
      break;
    }
  }

  state.events.push({
    type: 'power_trigger',
    outcastId: p.outcastId,
    x: p.x,
    y: p.y,
  });
  state.events.push({
    type: 'floating_text',
    x: p.x,
    y: p.y - 20,
    text: `${outcast.powerName}!`,
    color: '#ffd700',
    scale: 1.3,
  });
  addCameraTrauma(state, 0.45, 0, -1);

  return true;
}

/**
 * Steps active Outcast ability/power timers, cooldown recharge, Britta dash
 * impact, Leifi Trample Charge wall-crushing, and Gunilla Magic Leaf ammo regen.
 */
export function stepOutcastAbilities(state: SimState, input: InputFrame): void {
  const p = state.player;
  const outcast = getOutcastDef(p.outcastId);
  const cdMult = getSkillEffectValue(state.skillRanks, 'ability_cooldown_mult', 1);
  const effectiveCd = Math.max(20, Math.round(outcast.abilityCooldownTicks * cdMult));

  // Ability charge recharge
  if (p.abilityCharges < p.abilityMaxCharges) {
    if (p.abilityCooldown > 0) {
      p.abilityCooldown -= 1;
    }
    if (p.abilityCooldown <= 0) {
      p.abilityCharges = Math.min(p.abilityMaxCharges, p.abilityCharges + 1);
      p.abilityCooldown = p.abilityCharges < p.abilityMaxCharges ? effectiveCd : 0;
    }
  }

  // Active ability & power duration countdowns
  if (p.abilityActiveTicks > 0) {
    p.abilityActiveTicks -= 1;
    if (p.abilityActiveTicks === 0) {
      if (p.outcastId === 'leifi' && p.powerActiveTicks <= 0) {
        p.isInvulnerable = false;
      }
      if (p.outcastId === 'gustaf' && p.powerActiveTicks <= 0) {
        p.isInvisible = false;
      }
    }
  }

  if (p.powerActiveTicks > 0) {
    p.powerActiveTicks -= 1;

    // Leifi Trample Charge: unstoppable wall-crushing contact stampede
    if (p.outcastId === 'leifi') {
      p.isInvulnerable = true;
      damageTilesInRadius(state, p.x, p.y, p.radius + 14, 100);
      for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.hp > 0 && e.hitFlashTicks <= 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.radius + e.radius + 10) {
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          applyDamageToEnemy(state, e, 48 + state.act * 10, {
            isMelee: true,
            dirX: dx / len,
            dirY: dy / len,
            knockback: 6.5,
          });
        }
      }
      pruneDeadEnemies(state);
    }

    // Gunilla Magic Leaf: rapid ammo regeneration across all ranged ammo types
    if (p.outcastId === 'gunilla') {
      const regenMult = getSkillEffectValue(state.skillRanks, 'magic_leaf_regen_mult', 1);
      const interval = Math.max(6, Math.round(14 / regenMult));
      if (state.tick % interval === 0) {
        for (let a = 1; a <= 5; a++) {
          const idx = a as AmmoType;
          const amt = idx === 5 ? 1 : 3;
          p.ammo[idx] = Math.min(p.maxAmmo[idx], p.ammo[idx] + amt);
        }
      }
    }

    if (p.powerActiveTicks === 0) {
      if (p.outcastId === 'leifi' && p.abilityActiveTicks <= 0) {
        p.isInvulnerable = false;
      }
      if (p.outcastId === 'gustaf' && p.abilityActiveTicks <= 0) {
        p.isInvisible = false;
      }
    }
  }

  // Britta Pneumatic Dash contact impact & wall crushing
  if (p.dashTicks > 0 && p.outcastId === 'britta') {
    damageTilesInRadius(state, p.x + p.dashVx, p.y + p.dashVy, p.radius + 10, 75);
    const bonusDashDmg = getSkillEffectValue(state.skillRanks, 'dash_damage_add', 0);
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp > 0 && e.hitFlashTicks <= 0 && Math.hypot(e.x - p.x, e.y - p.y) <= p.radius + e.radius + 8) {
        const len = Math.hypot(p.dashVx, p.dashVy) || 1;
        applyDamageToEnemy(state, e, 32 + bonusDashDmg + state.act * 6, {
          isMelee: true,
          dirX: p.dashVx / len,
          dirY: p.dashVy / len,
          knockback: 5.5,
        });
      }
    }
    pruneDeadEnemies(state);
  }

  // Consume buffered Ability / Power triggers
  if (p.bufferedInput.ability > 0) {
    if (triggerOutcastAbility(state, input)) {
      p.bufferedInput.ability = 0;
    }
  }
  if (p.bufferedInput.power > 0) {
    if (triggerOutcastPower(state, input)) {
      p.bufferedInput.power = 0;
    }
  }
}

function findNearestEnemy(state: SimState, x: number, y: number, maxRange: number) {
  let best = null;
  let bestDSq = maxRange * maxRange;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0 || e.aiState === 'phase_shift') continue;
    const dSq = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (dSq < bestDSq) {
      bestDSq = dSq;
      best = e;
    }
  }
  return best;
}

function fireCompanionShot(
  state: SimState,
  comp: CompanionState,
  angle: number,
  speed: number,
  color: string,
): void {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const proj: ProjectileState = {
    id: state.nextEntityId++,
    owner: 'player',
    x: comp.x + Math.cos(angle) * (comp.radius + 3),
    y: comp.y + Math.sin(angle) * (comp.radius + 3),
    prevX: comp.x,
    prevY: comp.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 3.5,
    damage: comp.damage,
    damageType: 0,
    speed,
    lifeTicks: 55,
    maxLifeTicks: 55,
    scale: 0.85,
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
    color,
    spriteKey: 'proj_bullet',
  };
  state.projectiles.push(proj);
}

/**
 * Updates all 6 companion archetypes (`turret`, `drill`, `seedling`, `whirlpool`,
 * `doom_ball`, `gun_drone`) cleanly and deterministically.
 */
export function updateCompanions(state: SimState): void {
  const p = state.player;
  const comps = state.companions;
  let writeIdx = 0;

  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    c.prevX = c.x;
    c.prevY = c.y;
    c.lifeTicks -= 1;
    if (c.lifeTicks <= 0) continue;

    switch (c.kind) {
      case 'turret': {
        if (c.fireCooldown > 0) c.fireCooldown -= 1;
        const target = findNearestEnemy(state, c.x, c.y, 240);
        if (target) {
          c.angle = Math.atan2(target.y - c.y, target.x - c.x);
          if (c.fireCooldown <= 0) {
            fireCompanionShot(state, c, c.angle, 8.5, '#fee440');
            const durRank = getSkillEffectValue(state.skillRanks, 'turret_duration_mult', 1);
            c.fireCooldown = Math.max(10, Math.round(18 / durRank));
          }
        }
        break;
      }

      case 'gun_drone': {
        c.angle += 0.08;
        const desiredX = p.x + Math.cos(c.angle) * 24;
        const desiredY = p.y + Math.sin(c.angle) * 24;
        c.x += (desiredX - c.x) * 0.25;
        c.y += (desiredY - c.y) * 0.25;
        if (c.fireCooldown > 0) c.fireCooldown -= 1;
        const target = findNearestEnemy(state, c.x, c.y, 220);
        if (target && c.fireCooldown <= 0) {
          const ang = Math.atan2(target.y - c.y, target.x - c.x);
          fireCompanionShot(state, c, ang, 9.0, '#4cc9f0');
          c.fireCooldown = 20;
        }
        break;
      }

      case 'drill': {
        // Wall-carving Drillnose chases nearest enemy or pickup, smashing interior walls!
        const target = findNearestEnemy(state, c.x, c.y, 320);
        let goalX = p.x + Math.cos(c.angle) * 60;
        let goalY = p.y + Math.sin(c.angle) * 60;
        if (target) {
          goalX = target.x;
          goalY = target.y;
        } else if (state.pickups.length > 0) {
          goalX = state.pickups[0].x;
          goalY = state.pickups[0].y;
        }
        const ang = Math.atan2(goalY - c.y, goalX - c.x);
        c.angle = ang;
        c.vx = Math.cos(ang) * 3.8;
        c.vy = Math.sin(ang) * 3.8;

        // Carve through destructible walls & cover crates ahead
        damageTilesInRadius(state, c.x + c.vx * 2, c.y + c.vy * 2, c.radius + 6, 90);
        const res = resolveCircleVsTilemap(state.map, c.x, c.y, c.vx, c.vy, c.radius, false);
        c.x = res.x;
        c.y = res.y;

        // Shred enemies on contact
        for (let j = 0; j < state.enemies.length; j++) {
          const e = state.enemies[j];
          if (e.hp > 0 && e.hitFlashTicks <= 0 && Math.hypot(e.x - c.x, e.y - c.y) <= c.radius + e.radius) {
            applyDamageToEnemy(state, e, c.damage, { isMelee: true });
          }
        }

        // Vacuum nearby resources directly for player
        for (let j = state.pickups.length - 1; j >= 0; j--) {
          const pk = state.pickups[j];
          if (
            (pk.kind === 'gold' || pk.kind === 'xp' || pk.kind === 'hp' || pk.kind === 'ammo') &&
            Math.hypot(pk.x - c.x, pk.y - c.y) <= c.radius + 18
          ) {
            if (collectPickupNow(state, pk)) {
              state.pickups.splice(j, 1);
            }
          }
        }
        break;
      }

      case 'whirlpool': {
        c.angle += 0.22;
        if (c.fireCooldown > 0) c.fireCooldown -= 1;
        const acidDps = getSkillEffectValue(state.skillRanks, 'whirlpool_acid_dps', 0);
        const pullRadius = c.radius * 1.65;
        for (let j = 0; j < state.enemies.length; j++) {
          const e = state.enemies[j];
          if (e.hp <= 0) continue;
          const dx = c.x - e.x;
          const dy = c.y - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist < pullRadius && dist > 2) {
            const pullStrength = e.isBoss ? 0.25 : 1.55;
            e.vx += (dx / dist) * pullStrength;
            e.vy += (dy / dist) * pullStrength;
          }
          if (c.fireCooldown <= 0 && dist <= c.radius + e.radius) {
            applyDamageToEnemy(state, e, c.damage, {
              acidTier: acidDps > 0 ? 2 : 0,
            });
          }
        }
        if (c.fireCooldown <= 0) {
          c.fireCooldown = 14;
        }
        break;
      }

      case 'doom_ball': {
        const isFrenzy = c.fireCooldown > 0;
        const orbitRadius = isFrenzy ? 48 : 38;
        c.angle += isFrenzy ? 0.24 : 0.14;
        c.x = p.x + Math.cos(c.angle) * orbitRadius;
        c.y = p.y + Math.sin(c.angle) * orbitRadius;

        // Destroy destructible interior walls
        damageTilesInRadius(state, c.x, c.y, c.radius + 4, 80);

        // Destroy incoming enemy & frost projectiles!
        for (let j = state.projectiles.length - 1; j >= 0; j--) {
          const pr = state.projectiles[j];
          if (pr.owner === 'player') continue;
          if (Math.hypot(pr.x - c.x, pr.y - c.y) <= c.radius + pr.radius + 4) {
            state.events.push({
              type: 'projectile_hit',
              x: pr.x,
              y: pr.y,
              normalX: 0,
              normalY: -1,
              color: '#80ed99',
              isWall: false,
            });
            state.projectiles.splice(j, 1);
          }
        }

        // Crush enemies on contact
        for (let j = 0; j < state.enemies.length; j++) {
          const e = state.enemies[j];
          if (e.hp > 0 && e.hitFlashTicks <= 0 && Math.hypot(e.x - c.x, e.y - c.y) <= c.radius + e.radius) {
            const dx = e.x - c.x;
            const dy = e.y - c.y;
            const len = Math.hypot(dx, dy) || 1;
            applyDamageToEnemy(state, e, c.damage, {
              isMelee: true,
              dirX: dx / len,
              dirY: dy / len,
              knockback: 4.5,
            });
          }
        }
        break;
      }

      case 'seedling': {
        if (c.fireCooldown > 0) c.fireCooldown -= 1;
        const target = findNearestEnemy(state, c.x, c.y, 260);
        const goalX = target ? target.x : p.x + Math.cos(c.id) * 24;
        const goalY = target ? target.y : p.y + Math.sin(c.id) * 24;
        const dx = goalX - c.x;
        const dy = goalY - c.y;
        const dist = Math.hypot(dx, dy) || 1;
        c.angle = Math.atan2(dy, dx);

        const desiredRange = target ? 46 : 22;
        if (dist > desiredRange) {
          c.vx = (dx / dist) * 2.55;
          c.vy = (dy / dist) * 2.55;
          const res = resolveCircleVsTilemap(state.map, c.x, c.y, c.vx, c.vy, c.radius, false);
          c.x = res.x;
          c.y = res.y;
        }

        if (target && c.fireCooldown <= 0) {
          fireCompanionShot(state, c, c.angle, 7.2, '#52b788');
          const rateMult = getSkillEffectValue(state.skillRanks, 'seedling_firerate_mult', 1);
          c.fireCooldown = Math.max(10, Math.round(24 / rateMult));
        }
        break;
      }
    }

    comps[writeIdx++] = c;
  }

  comps.length = writeIdx;
  pruneDeadEnemies(state);
}
