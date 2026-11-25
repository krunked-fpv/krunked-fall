// ============================================================================
// KRUNKEDFALL — Enemy AI Engine (All 12 Archetypes)
// ============================================================================
// rusher, shooter, sniper (aim telegraph), bomber (self-detonate), charger,
// turret, spawner, summoner, mimic, giant, flier, and boss delegation.

import type {
  EnemyState,
  ProjectileState,
  SimState,
} from '../contracts/index.js';
import { getEnemyDef, getOverworldNode } from '../data/index.js';
import { hasLineOfSight, resolveCircleVsTilemap } from './collision.js';
import {
  MAX_ENEMIES,
  MAX_PROJECTILES,
  applyDamageToPlayer,
  createEnemyState,
  pruneDeadEnemies,
  triggerExplosion,
} from './combat.js';
import { stepBossAI } from './bosses.js';
import { computeRunModifiers } from './modGraph.js';
import { nextRange, pick } from './rng.js';
import { damageTilesInRadius } from './tilemap.js';

function fireEnemyShot(
  state: SimState,
  enemy: EnemyState,
  angle: number,
  speed: number,
  damage: number,
  color: string,
  opts: {
    radius?: number;
    burnTier?: number;
    freezeTier?: number;
    acidTier?: number;
    radioactiveTier?: number;
  } = {},
): void {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const proj: ProjectileState = {
    id: state.nextEntityId++,
    owner: 'enemy',
    x: enemy.x + Math.cos(angle) * (enemy.radius + 3),
    y: enemy.y + Math.sin(angle) * (enemy.radius + 3),
    prevX: enemy.x,
    prevY: enemy.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: opts.radius ?? 3.8,
    damage,
    damageType: 0,
    speed,
    lifeTicks: 115,
    maxLifeTicks: 115,
    scale: 1,
    bouncesLeft: 0,
    pierceLeft: 0,
    heatseekingRate: 0,
    isMelee: false,
    burnTier: opts.burnTier ?? 0,
    freezeTier: opts.freezeTier ?? 0,
    acidTier: opts.acidTier ?? 0,
    explosiveTier: 0,
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
 * Steps all active enemies and bosses in the current room for one 60 Hz tick.
 */
export function stepEnemies(state: SimState): void {
  const p = state.player;
  const runMods = computeRunModifiers(state.activeModifiers);
  const loopDmgMult = 1 + state.loopCount * 0.25;

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;

    e.prevX = e.x;
    e.prevY = e.y;
    if (e.hitFlashTicks > 0) e.hitFlashTicks -= 1;

    e.animTimer += 1;
    if (e.animTimer >= 10) {
      e.animTimer = 0;
      e.animFrame = (e.animFrame + 1) % 4;
    }

    // Delegate boss enemies to dedicated two-phase boss AI
    if (e.isBoss && e.bossId) {
      stepBossAI(state, e);
      continue;
    }

    const def = getEnemyDef(e.defId);

    // Training dummy stays stationary and docile
    if (def.id === 'training_dummy') {
      e.vx *= 0.6;
      e.vy *= 0.6;
      continue;
    }

    const freezeMult = e.status.freezeTicks > 0 ? 0.55 : 1;
    const shockMult = e.status.shockTicks > 0 ? 0.3 : 1;
    const moveSpeed = def.speed * runMods.enemySpeedMult * freezeMult * shockMult;
    const isFlier = def.archetype === 'flier';

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    if (!p.isInvisible) {
      e.aimAngle = angleToPlayer;
      e.facing = dx >= 0 ? 1 : -1;
    }

    if (e.attackCooldown > 0) e.attackCooldown -= 1;

    const elemOpts = {
      burnTier: def.elementResist === 'burn' ? 1 : 0,
      freezeTier: def.elementResist === 'freeze' ? 1 : 0,
      acidTier: def.elementResist === 'acid' ? 1 : 0,
      radioactiveTier: def.elementResist === 'radioactive' ? 1 : 0,
    };
    const projDmg = Math.round(def.projectileDamage * loopDmgMult);
    const contactDmg = Math.round(def.contactDamage * loopDmgMult);

    let desiredVx = 0;
    let desiredVy = 0;

    // Mimic waits disguised until approached or damaged
    if (def.archetype === 'mimic' && e.aiState === 'idle') {
      if (!p.isInvisible && dist < 92) {
        e.aiState = 'chase';
        state.events.push({
          type: 'floating_text',
          x: e.x,
          y: e.y - 12,
          text: 'MIMIC!',
          color: '#ff595e',
        });
      } else {
        e.vx *= 0.8;
        e.vy *= 0.8;
        continue;
      }
    }

    // Stealth handling: Gustaf Ghost Walk makes foes wander aimlessly
    if (p.isInvisible) {
      e.bossTelegraph = null;
      if (e.stateTimer <= 0) {
        e.aimAngle = nextRange(state, 0, Math.PI * 2);
        e.stateTimer = 45;
      } else {
        e.stateTimer -= 1;
      }
      desiredVx = Math.cos(e.aimAngle) * moveSpeed * 0.4;
      desiredVy = Math.sin(e.aimAngle) * moveSpeed * 0.4;
    } else {
      switch (def.archetype) {
        case 'rusher': {
          // Direct pursuit with slight flanking weave
          const weave = Math.sin((state.tick + e.id * 17) * 0.08) * 0.35;
          const a = angleToPlayer + weave;
          desiredVx = Math.cos(a) * moveSpeed;
          desiredVy = Math.sin(a) * moveSpeed;
          if (def.projectileDamage > 0 && e.attackCooldown <= 0 && dist < 150 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
            fireEnemyShot(state, e, angleToPlayer, def.projectileSpeed || 3.8, projDmg, e.tintColor, elemOpts);
            e.attackCooldown = def.fireCooldownTicks;
          }
          break;
        }

        case 'shooter':
        case 'mimic': {
          const idealDist = def.archetype === 'mimic' ? 75 : 118;
          if (dist > idealDist + 22) {
            desiredVx = (dx / dist) * moveSpeed;
            desiredVy = (dy / dist) * moveSpeed;
          } else if (dist < idealDist - 24) {
            desiredVx = -(dx / dist) * moveSpeed * 0.7;
            desiredVy = -(dy / dist) * moveSpeed * 0.7;
          } else {
            const strafeSign = (e.id % 2 === 0 ? 1 : -1) * (Math.floor(state.tick / 90) % 2 === 0 ? 1 : -1);
            desiredVx = (-dy / dist) * moveSpeed * 0.75 * strafeSign;
            desiredVy = (dx / dist) * moveSpeed * 0.75 * strafeSign;
          }

          if (e.attackCooldown <= 0 && dist < 240 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
            if (def.id === 'bandit_shotgunner' || def.archetype === 'mimic') {
              for (let s = -1; s <= 1; s++) {
                fireEnemyShot(state, e, angleToPlayer + s * 0.2, def.projectileSpeed || 4.2, projDmg, e.tintColor, elemOpts);
              }
            } else {
              fireEnemyShot(state, e, angleToPlayer, def.projectileSpeed || 4.2, projDmg, e.tintColor, elemOpts);
            }
            e.attackCooldown = Math.max(24, Math.round(def.fireCooldownTicks / runMods.enemySpeedMult));
          }
          break;
        }

        case 'sniper': {
          if (e.aiState === 'telegraph') {
            e.stateTimer -= 1;
            if (e.bossTelegraph) {
              e.bossTelegraph.x = e.x;
              e.bossTelegraph.y = e.y;
              e.bossTelegraph.progress = Math.min(1, 1 - e.stateTimer / 42);
              if (e.bossTelegraph.progress < 0.65) {
                e.bossTelegraph.targetX = p.x;
                e.bossTelegraph.targetY = p.y;
              }
            }
            if (e.stateTimer <= 0) {
              const aim = e.bossTelegraph
                ? Math.atan2(e.bossTelegraph.targetY - e.y, e.bossTelegraph.targetX - e.x)
                : angleToPlayer;
              fireEnemyShot(state, e, aim, def.projectileSpeed || 7.5, projDmg, '#ff2a85', {
                ...elemOpts,
                radius: 4,
              });
              e.bossTelegraph = null;
              e.aiState = 'chase';
              e.attackCooldown = def.fireCooldownTicks;
            }
          } else {
            // Keep long range
            if (dist < 140) {
              desiredVx = -(dx / dist) * moveSpeed;
              desiredVy = -(dy / dist) * moveSpeed;
            } else if (dist > 250) {
              desiredVx = (dx / dist) * moveSpeed;
              desiredVy = (dy / dist) * moveSpeed;
            }
            if (e.attackCooldown <= 0 && dist < 310 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
              e.aiState = 'telegraph';
              e.stateTimer = 42;
              e.bossTelegraph = {
                kind: 'line',
                x: e.x,
                y: e.y,
                targetX: p.x,
                targetY: p.y,
                radius: 260,
                progress: 0,
                color: '#ff2a85',
              };
            }
          }
          break;
        }

        case 'bomber': {
          if (e.aiState === 'telegraph') {
            e.stateTimer -= 1;
            if (e.bossTelegraph) {
              e.bossTelegraph.x = e.x;
              e.bossTelegraph.y = e.y;
              e.bossTelegraph.progress = Math.min(1, 1 - e.stateTimer / 22);
            }
            if (e.stateTimer <= 0) {
              // Self-detonate, smashing interior walls and blasting player
              triggerExplosion(
                state,
                e.x,
                e.y,
                52,
                Math.max(18, contactDmg),
                def.elementResist === 'acid' ? 'acid' : 'explosive',
                'enemy',
                false,
              );
              e.bossTelegraph = null;
              e.hp = 0;
              continue;
            }
          } else {
            desiredVx = (dx / dist) * moveSpeed * 1.1;
            desiredVy = (dy / dist) * moveSpeed * 1.1;
            if (dist <= 36 + p.radius + e.radius) {
              e.aiState = 'telegraph';
              e.stateTimer = 22;
              e.bossTelegraph = {
                kind: 'circle',
                x: e.x,
                y: e.y,
                targetX: e.x,
                targetY: e.y,
                radius: 52,
                progress: 0,
                color: '#ff4d6d',
              };
            }
          }
          break;
        }

        case 'charger': {
          if (e.aiState === 'telegraph') {
            e.stateTimer -= 1;
            if (e.bossTelegraph) {
              e.bossTelegraph.x = e.x;
              e.bossTelegraph.y = e.y;
              e.bossTelegraph.progress = Math.min(1, 1 - e.stateTimer / 26);
            }
            if (e.stateTimer <= 0) {
              const ang = e.bossTelegraph
                ? Math.atan2(e.bossTelegraph.targetY - e.y, e.bossTelegraph.targetX - e.x)
                : angleToPlayer;
              e.vx = Math.cos(ang) * moveSpeed * 2.6;
              e.vy = Math.sin(ang) * moveSpeed * 2.6;
              e.aiState = 'charge';
              e.stateTimer = 24;
              e.bossTelegraph = null;
            }
          } else if (e.aiState === 'charge') {
            e.stateTimer -= 1;
            damageTilesInRadius(state, e.x + e.vx, e.y + e.vy, e.radius + 3, 25);
            desiredVx = e.vx;
            desiredVy = e.vy;
            if (e.stateTimer <= 0) {
              e.aiState = 'chase';
              e.attackCooldown = def.fireCooldownTicks;
            }
          } else {
            desiredVx = (dx / dist) * moveSpeed;
            desiredVy = (dy / dist) * moveSpeed;
            if (e.attackCooldown <= 0 && dist < 175 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
              e.aiState = 'telegraph';
              e.stateTimer = 26;
              e.bossTelegraph = {
                kind: 'line',
                x: e.x,
                y: e.y,
                targetX: p.x,
                targetY: p.y,
                radius: 140,
                progress: 0,
                color: '#ff9f1c',
              };
            }
          }
          break;
        }

        case 'turret': {
          // Stationary or creeping emitter firing volleys
          if (moveSpeed > 0.05 && dist > 100) {
            desiredVx = (dx / dist) * moveSpeed;
            desiredVy = (dy / dist) * moveSpeed;
          }
          if (e.attackCooldown <= 0 && dist < 260 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
            if (def.id === 'mil_artillery' || def.id === 'supertorch' || def.id === 'shrine_sentinel') {
              for (let s = -1; s <= 1; s++) {
                fireEnemyShot(state, e, angleToPlayer + s * 0.22, def.projectileSpeed || 4.6, projDmg, e.tintColor, elemOpts);
              }
            } else {
              fireEnemyShot(state, e, angleToPlayer, def.projectileSpeed || 4.4, projDmg, e.tintColor, elemOpts);
            }
            e.attackCooldown = def.fireCooldownTicks;
          }
          break;
        }

        case 'spawner': {
          if (moveSpeed > 0.05 && dist > 110) {
            desiredVx = (dx / dist) * moveSpeed;
            desiredVy = (dy / dist) * moveSpeed;
          }
          if (e.attackCooldown <= 0 && state.enemies.length < Math.min(36, MAX_ENEMIES - 4) && dist < 280) {
            const childId = def.splitsOnDeath ?? 'roach';
            const a = nextRange(state, 0, Math.PI * 2);
            const spawned = createEnemyState(
              state,
              childId,
              e.x + Math.cos(a) * (e.radius + 12),
              e.y + Math.sin(a) * (e.radius + 12),
            );
            state.enemies.push(spawned);
            e.attackCooldown = Math.max(90, def.fireCooldownTicks);
          }
          break;
        }

        case 'summoner': {
          if (dist < 130) {
            desiredVx = -(dx / dist) * moveSpeed * 0.8;
            desiredVy = -(dy / dist) * moveSpeed * 0.8;
          } else if (dist > 220) {
            desiredVx = (dx / dist) * moveSpeed * 0.8;
            desiredVy = (dy / dist) * moveSpeed * 0.8;
          }
          if (e.attackCooldown <= 0 && dist < 280) {
            if (state.enemies.length < 28 && state.tick % 2 === 0) {
              const node = getOverworldNode(state.currentNodeId);
              const pool = node.enemyPool.filter((id) => id !== e.defId && id !== 'training_dummy');
              const summonId = pool.length > 0 ? pick(state, pool) : 'draug';
              const child = createEnemyState(
                state,
                summonId,
                e.x + Math.cos(angleToPlayer) * 18,
                e.y + Math.sin(angleToPlayer) * 18,
              );
              state.enemies.push(child);
            } else {
              for (let s = -1; s <= 1; s++) {
                fireEnemyShot(state, e, angleToPlayer + s * 0.25, def.projectileSpeed || 4.6, projDmg, '#c77dff', elemOpts);
              }
            }
            e.attackCooldown = def.fireCooldownTicks;
          }
          break;
        }

        case 'giant': {
          // Heavy juggernaut: lumbers forward, crushes crates, fires wide spreads
          desiredVx = (dx / dist) * moveSpeed;
          desiredVy = (dy / dist) * moveSpeed;
          damageTilesInRadius(state, e.x + desiredVx * 2, e.y + desiredVy * 2, e.radius + 3, 20);
          if (e.attackCooldown <= 0 && dist < 230 && hasLineOfSight(state.map, e.x, e.y, p.x, p.y)) {
            for (let s = -2; s <= 2; s++) {
              fireEnemyShot(state, e, angleToPlayer + s * 0.18, def.projectileSpeed || 4.6, projDmg, e.tintColor, {
                ...elemOpts,
                radius: 5,
              });
            }
            e.attackCooldown = def.fireCooldownTicks;
          }
          break;
        }

        case 'flier': {
          // Glides over pits/lava in agile sweeping sine arcs
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const sway = Math.sin((state.tick + e.id * 23) * 0.09);
          desiredVx = (dx / dist) * moveSpeed * 0.72 + perpX * moveSpeed * 0.65 * sway;
          desiredVy = (dy / dist) * moveSpeed * 0.72 + perpY * moveSpeed * 0.65 * sway;

          if (def.projectileDamage > 0 && e.attackCooldown <= 0 && dist < 240) {
            fireEnemyShot(state, e, angleToPlayer, def.projectileSpeed || 5.2, projDmg, e.tintColor, elemOpts);
            e.attackCooldown = def.fireCooldownTicks;
          }
          break;
        }
      }
    }

    // Soft enemy-vs-enemy separation so packs fan out instead of stacking
    let sepX = 0;
    let sepY = 0;
    for (let j = 0; j < state.enemies.length; j++) {
      if (i === j) continue;
      const other = state.enemies[j];
      if (other.hp <= 0) continue;
      const sdx = e.x - other.x;
      const sdy = e.y - other.y;
      const minDist = e.radius + other.radius + 2;
      const dSq = sdx * sdx + sdy * sdy;
      if (dSq > 0.01 && dSq < minDist * minDist) {
        const d = Math.sqrt(dSq);
        const push = ((minDist - d) / minDist) * 0.55;
        sepX += (sdx / d) * push;
        sepY += (sdy / d) * push;
      }
    }

    if (e.aiState === 'charge') {
      // Preserve charge momentum
      const res = resolveCircleVsTilemap(state.map, e.x, e.y, e.vx, e.vy, e.radius, isFlier);
      e.x = res.x;
      e.y = res.y;
      if (res.hitX || res.hitY) {
        e.aiState = 'chase';
        e.attackCooldown = def.fireCooldownTicks;
      }
    } else {
      e.vx = e.vx * 0.72 + (desiredVx + sepX) * 0.28;
      e.vy = e.vy * 0.72 + (desiredVy + sepY) * 0.28;
      const res = resolveCircleVsTilemap(state.map, e.x, e.y, e.vx, e.vy, e.radius, isFlier);
      e.x = res.x;
      e.y = res.y;
      e.vx = res.vx;
      e.vy = res.vy;
    }

    // Contact damage against player
    if (!p.isInvisible && contactDmg > 0 && Math.hypot(p.x - e.x, p.y - e.y) <= p.radius + e.radius) {
      applyDamageToPlayer(state, contactDmg, e.x, e.y);
    }
  }

  pruneDeadEnemies(state);
}
