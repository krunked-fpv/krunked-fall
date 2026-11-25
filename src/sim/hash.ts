// ============================================================================
// KRUNKEDFALL — Deterministic State Digest (FNV-1a 32-bit)
// ============================================================================
// Produces a stable 8-character lowercase hex digest covering all gameplay-
// relevant fields in SimState while excluding transient `events`.

import type { SimState, WeaponInstance } from '../contracts/index.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const f64Buf = new ArrayBuffer(8);
const f64View = new Float64Array(f64Buf);
const u32View = new Uint32Array(f64Buf);

function mixByte(h: number, b: number): number {
  return Math.imul((h ^ (b & 0xff)) >>> 0, FNV_PRIME) >>> 0;
}

function mixU32(h: number, v: number): number {
  const u = v >>> 0;
  h = mixByte(h, u & 0xff);
  h = mixByte(h, (u >>> 8) & 0xff);
  h = mixByte(h, (u >>> 16) & 0xff);
  h = mixByte(h, (u >>> 24) & 0xff);
  return h;
}

function mixFloat(h: number, v: number): number {
  // Normalize -0 to +0 and NaN to canonical sentinel for cross-engine stability.
  const norm = Number.isNaN(v) ? 0x7ff80000 : v === 0 ? 0 : v;
  f64View[0] = norm;
  h = mixU32(h, u32View[0]);
  h = mixU32(h, u32View[1]);
  return h;
}

function mixString(h: number, s: string): number {
  h = mixU32(h, s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    h = mixByte(h, code & 0xff);
    if (code > 0xff) {
      h = mixByte(h, (code >>> 8) & 0xff);
    }
  }
  return h;
}

function mixStringList(h: number, list: readonly string[]): number {
  h = mixU32(h, list.length);
  for (let i = 0; i < list.length; i++) {
    h = mixString(h, list[i]);
  }
  return h;
}

function mixWeapon(h: number, w: WeaponInstance | null): number {
  if (!w) return mixByte(h, 0);
  h = mixByte(h, 1);
  h = mixU32(h, w.instanceId);
  h = mixU32(h, w.uniqueId);
  h = mixByte(h, w.golden ? 1 : 0);
  h = mixStringList(h, w.mods);
  h = mixFloat(h, w.overheat);
  h = mixU32(h, w.overheatedLockTicks);
  h = mixFloat(h, w.windup);
  h = mixU32(h, w.cooldownTicks);
  h = mixU32(h, w.burstRemaining);
  h = mixU32(h, w.burstTicks);
  h = mixU32(h, w.kills);
  return h;
}

/**
 * Computes a deterministic 32-bit FNV-1a hex digest over all authoritative
 * fields of `SimState` (excluding transient `state.events`).
 */
export function hashSimState(state: SimState): string {
  let h = FNV_OFFSET_BASIS;

  // Core simulation & progression counters
  h = mixU32(h, state.seed);
  h = mixU32(h, state.rngState);
  h = mixU32(h, state.tick);
  h = mixU32(h, state.hitstopTicks);
  h = mixString(h, state.screenMode);
  h = mixString(h, state.hubPanel);
  h = mixByte(h, state.paused ? 1 : 0);
  h = mixU32(h, state.act);
  h = mixU32(h, state.loopCount);
  h = mixString(h, state.currentNodeId);
  h = mixStringList(h, state.clearedNodeIds);
  h = mixStringList(h, state.unlockedNodeIds);
  h = mixStringList(h, state.activeModifiers);
  h = mixString(h, state.activeBossId ?? '');
  h = mixByte(h, state.godMode ? 1 : 0);
  h = mixU32(h, state.nextEntityId);

  // Skill ranks (sorted keys for map insertion-order independence)
  const skillKeys = Object.keys(state.skillRanks).sort();
  h = mixU32(h, skillKeys.length);
  for (let i = 0; i < skillKeys.length; i++) {
    const k = skillKeys[i];
    h = mixString(h, k);
    h = mixU32(h, state.skillRanks[k] ?? 0);
  }

  // Player state
  const p = state.player;
  h = mixFloat(h, p.x);
  h = mixFloat(h, p.y);
  h = mixFloat(h, p.vx);
  h = mixFloat(h, p.vy);
  h = mixFloat(h, p.aimAngle);
  h = mixByte(h, p.facing === 1 ? 1 : 0);
  h = mixFloat(h, p.hp);
  h = mixFloat(h, p.maxHp);
  h = mixFloat(h, p.shield);
  h = mixFloat(h, p.maxShield);
  h = mixFloat(h, p.armor);
  h = mixString(h, p.outcastId);
  h = mixString(h, p.skinId);
  h = mixU32(h, p.xp);
  h = mixU32(h, p.xpToNext);
  h = mixU32(h, p.level);
  h = mixU32(h, p.gold);
  h = mixU32(h, p.skillPoints);
  for (let i = 0; i < 6; i++) {
    h = mixU32(h, p.ammo[i]);
    h = mixU32(h, p.maxAmmo[i]);
  }
  h = mixByte(h, p.activeSlot);
  h = mixWeapon(h, p.weapons[0]);
  h = mixWeapon(h, p.weapons[1]);
  h = mixStringList(h, p.backpackMods);
  h = mixU32(h, p.abilityCooldown);
  h = mixU32(h, p.abilityCharges);
  h = mixU32(h, p.abilityMaxCharges);
  h = mixU32(h, p.abilityActiveTicks);
  h = mixFloat(h, p.powerCharge);
  h = mixU32(h, p.powerChargeRequired);
  h = mixU32(h, p.powerActiveTicks);
  h = mixU32(h, p.iframes);
  h = mixU32(h, p.dashTicks);
  h = mixByte(h, p.isInvisible ? 1 : 0);
  h = mixByte(h, p.isInvulnerable ? 1 : 0);
  h = mixU32(h, p.kills);
  h = mixU32(h, p.shotsFired);
  h = mixU32(h, p.shotsHit);
  h = mixFloat(h, p.damageDealt);

  // Enemies
  const enemies = state.enemies;
  h = mixU32(h, enemies.length);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    h = mixU32(h, e.id);
    h = mixString(h, e.defId);
    h = mixFloat(h, e.x);
    h = mixFloat(h, e.y);
    h = mixFloat(h, e.vx);
    h = mixFloat(h, e.vy);
    h = mixFloat(h, e.hp);
    h = mixFloat(h, e.maxHp);
    h = mixString(h, e.aiState);
    h = mixU32(h, e.stateTimer);
    h = mixU32(h, e.attackCooldown);
    h = mixByte(h, e.isBoss ? 1 : 0);
    h = mixByte(h, e.bossPhase);
    h = mixU32(h, e.bossPatternIndex);
    h = mixU32(h, e.status.burnTicks);
    h = mixU32(h, e.status.freezeTicks);
    h = mixU32(h, e.status.acidTicks);
    h = mixU32(h, e.status.radTicks);
    h = mixU32(h, e.status.shockTicks);
  }

  // Projectiles
  const projs = state.projectiles;
  h = mixU32(h, projs.length);
  for (let i = 0; i < projs.length; i++) {
    const pr = projs[i];
    h = mixU32(h, pr.id);
    h = mixString(h, pr.owner);
    h = mixFloat(h, pr.x);
    h = mixFloat(h, pr.y);
    h = mixFloat(h, pr.vx);
    h = mixFloat(h, pr.vy);
    h = mixFloat(h, pr.damage);
    h = mixU32(h, pr.lifeTicks);
    h = mixU32(h, pr.bouncesLeft);
    h = mixU32(h, pr.pierceLeft);
  }

  // Pickups
  const pickups = state.pickups;
  h = mixU32(h, pickups.length);
  for (let i = 0; i < pickups.length; i++) {
    const pk = pickups[i];
    h = mixU32(h, pk.id);
    h = mixString(h, pk.kind);
    h = mixFloat(h, pk.x);
    h = mixFloat(h, pk.y);
    h = mixU32(h, pk.value);
    h = mixByte(h, pk.opened ? 1 : 0);
  }

  // Companions
  const comps = state.companions;
  h = mixU32(h, comps.length);
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    h = mixU32(h, c.id);
    h = mixString(h, c.kind);
    h = mixFloat(h, c.x);
    h = mixFloat(h, c.y);
    h = mixU32(h, c.lifeTicks);
  }

  // Map tilemap & destructible tile HP checksum
  const m = state.map;
  h = mixU32(h, m.width);
  h = mixU32(h, m.height);
  h = mixU32(h, m.tileSize);
  h = mixString(h, m.biomeId);
  h = mixFloat(h, m.spawnX);
  h = mixFloat(h, m.spawnY);
  h = mixFloat(h, m.exitX);
  h = mixFloat(h, m.exitY);
  h = mixByte(h, m.exitUnlocked ? 1 : 0);
  const tileCount = m.tiles.length;
  h = mixU32(h, tileCount);
  for (let i = 0; i < tileCount; i++) {
    h = mixByte(h, m.tiles[i]);
    if (m.tileHp[i] !== 0) {
      h = mixU32(h, (i << 16) ^ m.tileHp[i]);
    }
  }

  // Freeze storm state
  const fs = state.freezeStorm;
  h = mixFloat(h, fs.timerTicks);
  h = mixU32(h, fs.thresholdTicks);
  h = mixFloat(h, fs.intensity);
  h = mixByte(h, fs.active ? 1 : 0);
  h = mixByte(h, fs.warningShown ? 1 : 0);
  h = mixU32(h, fs.crystals.length);
  for (let i = 0; i < fs.crystals.length; i++) {
    const cr = fs.crystals[i];
    h = mixU32(h, cr.id);
    h = mixFloat(h, cr.x);
    h = mixFloat(h, cr.y);
    h = mixU32(h, cr.fireCooldown);
  }

  // Run stats
  const rs = state.runStats;
  h = mixU32(h, rs.elapsedTicks);
  h = mixU32(h, rs.roomsCleared);
  h = mixStringList(h, rs.bossesDefeated);
  h = mixU32(h, rs.wallsDestroyed);
  h = mixU32(h, rs.modsAttached);
  h = mixU32(h, rs.score);

  return (h >>> 0).toString(16).padStart(8, '0');
}
