// ============================================================================
// KRUNKEDFALL — Anti-Camping Fimbulwinter Freeze Storm
// ============================================================================
// Escalates during prolonged combat encounters (`thresholdTicks` scaled by
// Run Modifiers), ramps `intensity` 0 -> 1, emits `freeze_warning`, and spawns
// indestructible Frost Crystals firing aimed `owner: 'frost'` ice shards.

import type {
  FreezeStormState,
  FrostCrystalState,
  ProjectileState,
  SimState,
} from '../contracts/index.js';
import { MAX_PROJECTILES, emitLokiComment } from './combat.js';
import { computeRunModifiers } from './modGraph.js';
import { nextRange } from './rng.js';
import { findNearestWalkablePos } from './tilemap.js';

export const DEFAULT_FREEZE_THRESHOLD_TICKS = 2700; // 45s at 60 Hz before storm onset
export const FREEZE_RAMP_TICKS = 900; // 15s ramp from 0 -> 1 intensity
export const MAX_FROST_CRYSTALS = 6;

export function createInitialFreezeStormState(
  thresholdTicks = DEFAULT_FREEZE_THRESHOLD_TICKS,
): FreezeStormState {
  return {
    timerTicks: 0,
    thresholdTicks,
    intensity: 0,
    active: false,
    crystals: [],
    warningShown: false,
  };
}

export function resetFreezeStorm(
  state: SimState,
  thresholdTicks = DEFAULT_FREEZE_THRESHOLD_TICKS,
): void {
  state.freezeStorm = createInitialFreezeStormState(thresholdTicks);
}

function spawnFrostCrystal(state: SimState): FrostCrystalState | null {
  const fs = state.freezeStorm;
  if (fs.crystals.length >= MAX_FROST_CRYSTALS) return null;

  const p = state.player;
  const mapW = state.map.width * state.map.tileSize;
  const mapH = state.map.height * state.map.tileSize;
  const pad = state.map.tileSize * 2.5;

  // Choose a walkable spot at a readable menacing distance (90..175px) from player
  let chosenX = p.x + 110;
  let chosenY = p.y;

  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = nextRange(state, 0, Math.PI * 2);
    const dist = nextRange(state, 96, 175);
    const candX = Math.max(pad, Math.min(mapW - pad, p.x + Math.cos(angle) * dist));
    const candY = Math.max(pad, Math.min(mapH - pad, p.y + Math.sin(angle) * dist));
    const safe = findNearestWalkablePos(state.map, candX, candY);

    if (Math.hypot(safe.x - p.x, safe.y - p.y) >= 72) {
      chosenX = safe.x;
      chosenY = safe.y;
      break;
    }
  }

  const crystal: FrostCrystalState = {
    id: state.nextEntityId++,
    x: chosenX,
    y: chosenY,
    fireCooldown: 48,
    pulsePhase: nextRange(state, 0, Math.PI * 2),
  };

  fs.crystals.push(crystal);
  state.events.push({
    type: 'freeze_crystal_spawn',
    x: crystal.x,
    y: crystal.y,
  });
  return crystal;
}

/**
 * Forces Fimbulwinter Freeze Storm intensity directly (for F9 Playtest Drawer & tests).
 */
export function setFreezeStormIntensity(state: SimState, intensity: number): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  const fs = state.freezeStorm;
  fs.intensity = clamped;
  fs.active = clamped > 0;

  if (clamped > 0) {
    fs.timerTicks = fs.thresholdTicks + clamped * FREEZE_RAMP_TICKS;
    if (!fs.warningShown) {
      fs.warningShown = true;
      state.events.push({ type: 'freeze_warning', intensity: clamped });
      emitLokiComment(state, 'freeze_storm');
    }
    const desiredCrystals = Math.max(1, Math.min(MAX_FROST_CRYSTALS, Math.ceil(clamped * 4)));
    while (fs.crystals.length < desiredCrystals) {
      if (!spawnFrostCrystal(state)) break;
    }
  } else {
    fs.timerTicks = 0;
    fs.warningShown = false;
    fs.crystals.length = 0;
  }
}

/**
 * Advances the anti-camping Fimbulwinter Freeze Storm by one 60 Hz tick.
 */
export function stepFreezeStorm(state: SimState): void {
  const fs = state.freezeStorm;

  // Pause and dissipate cleanly outside active combat or once room is cleared
  if (state.screenMode !== 'combat' || state.map.exitUnlocked || state.enemies.length === 0) {
    if (fs.intensity > 0) {
      fs.intensity = Math.max(0, fs.intensity - 0.02);
      if (fs.intensity === 0) {
        fs.active = false;
        fs.crystals.length = 0;
        fs.timerTicks = 0;
        fs.warningShown = false;
      }
    }
    return;
  }

  const runMods = computeRunModifiers(state.activeModifiers);
  const rate = Math.max(0.25, runMods.freezeRateMult);
  fs.timerTicks += rate;

  // Early warning at 75% of threshold
  if (!fs.warningShown && fs.timerTicks >= fs.thresholdTicks * 0.75) {
    fs.warningShown = true;
    state.events.push({ type: 'freeze_warning', intensity: 0.15 });
    state.events.push({
      type: 'floating_text',
      x: state.player.x,
      y: state.player.y - 20,
      text: 'THE FIMBULWINTER APPROACHES!',
      color: '#72efdd',
      scale: 1.2,
    });
    emitLokiComment(state, 'freeze_storm');
  }

  if (fs.timerTicks >= fs.thresholdTicks) {
    if (!fs.active) {
      fs.active = true;
      state.events.push({ type: 'freeze_warning', intensity: 0.35 });
    }
    fs.intensity = Math.min(1, (fs.timerTicks - fs.thresholdTicks) / FREEZE_RAMP_TICKS);

    // Periodically materialize indestructible Frost Crystals up to target count
    const desiredCrystals = Math.min(MAX_FROST_CRYSTALS, 1 + Math.floor(fs.intensity * 5));
    if (fs.crystals.length < desiredCrystals && state.tick % 90 === 0) {
      spawnFrostCrystal(state);
    }
    if (fs.crystals.length === 0) {
      spawnFrostCrystal(state);
    }
  }

  // Update active Frost Crystals firing aimed `owner: 'frost'` ice shards
  const p = state.player;
  for (let i = 0; i < fs.crystals.length; i++) {
    const cr = fs.crystals[i];
    cr.pulsePhase += 0.08;
    if (cr.fireCooldown > 0) {
      cr.fireCooldown -= 1;
    } else if (!p.isInvisible) {
      if (state.projectiles.length < MAX_PROJECTILES) {
        const angle = Math.atan2(p.y - cr.y, p.x - cr.x);
        const speed = 5.0 + fs.intensity * 1.6;
        const proj: ProjectileState = {
          id: state.nextEntityId++,
          owner: 'frost',
          x: cr.x + Math.cos(angle) * 8,
          y: cr.y + Math.sin(angle) * 8,
          prevX: cr.x,
          prevY: cr.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 4.2,
          damage: 14 + Math.round(fs.intensity * 6),
          damageType: 2,
          speed,
          lifeTicks: 130,
          maxLifeTicks: 130,
          scale: 1.05,
          bouncesLeft: 0,
          pierceLeft: 0,
          heatseekingRate: 0,
          isMelee: false,
          burnTier: 0,
          freezeTier: 2,
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
          color: '#72efdd',
          spriteKey: 'proj_frost',
        };
        state.projectiles.push(proj);
      }
      cr.fireCooldown = Math.max(40, Math.round(92 - fs.intensity * 42));
    }
  }
}
