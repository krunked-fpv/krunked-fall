// ============================================================================
// KRUNKEDFALL — 108-Playtester Adversarial Persona Gauntlet (playtest-100.ts)
// ============================================================================
// Executes 108 distinct playtester profiles (12 distinct AI behavioral personas
// x 9 seeds/outcast pairings) across all 8 Outcasts, all 3 Acts, all 6 Bosses,
// Loop 1-2, ALL 221 weapons, ALL 76 mods, Run Modifiers, Shops, Campfires,
// Freeze Storm stress, and chaotic wall-slamming edge-case inputs.
//
// Usage:
//   npx tsx scripts/verify/playtest-100.ts
//   npx tsx scripts/verify/playtest-100.ts --out report.json

import fs from 'node:fs';
import path from 'node:path';
import {
  TileKind,
  type BossId,
  type InputFrame,
  type OutcastId,
  type SimState,
} from '../../src/contracts/index.js';
import {
  BOSSES,
  MODS,
  OUTCASTS,
  OVERWORLD_NODE_BY_ID,
  RUN_MODIFIERS,
  WEAPONS,
  getWeaponDef,
} from '../../src/data/index.js';
import {
  MAX_COMPANIONS,
  MAX_ENEMIES,
  MAX_PICKUPS,
  MAX_PROJECTILES,
  attachModToWeapon,
  buyShopOffer,
  computeReachableMask,
  createInitialSimState,
  createNeutralInput,
  detachModFromWeapon,
  drainSimEvents,
  enterNode,
  equipWeaponByUniqueId,
  getTileAt,
  isWalkableTile,
  setPlayerOutcast,
  startNextLoop,
  stepSim,
  sweepProjectileVsTilemap,
  upgradeWeaponGolden,
  useCampfireAction,
  verifyMapConnectivity,
  worldToTile,
} from '../../src/sim/index.js';

type TicketSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

interface FeedbackTicket {
  severity: TicketSeverity;
  code: string;
  persona: string;
  testerId: number;
  seed: number;
  outcast: OutcastId;
  nodeId: string;
  tick: number;
  message: string;
}

type PersonaId =
  | 'aggressive_melee_berserker'
  | 'long_range_sniper_kiter'
  | 'explosive_wall_demolitionist'
  | 'turret_companion_engineer'
  | 'dual_wield_bullet_hose'
  | 'mod_stacking_alchemist'
  | 'boss_rush_speedrunner'
  | 'freeze_storm_camper'
  | 'oob_wall_hugger_fuzzer'
  | 'low_ammo_scavenger'
  | 'loop_escalation_glass_cannon'
  | 'high_overheat_minigun_maniac';

interface PersonaConfig {
  id: PersonaId;
  label: string;
  sessionTicks: number;
  route: string[];
  preferredOutcasts: OutcastId[];
  runModifiers: string[];
  loopLevel: number;
}

interface TesterTelemetry {
  testerId: number;
  persona: PersonaId;
  personaLabel: string;
  seed: number;
  outcast: OutcastId;
  ticksSimulated: number;
  kills: number;
  damageDealt: number;
  dps: number;
  shotsFired: number;
  shotsHit: number;
  wallsDestroyed: number;
  bossesCleared: BossId[];
  weaponsTested: number[];
  modsTested: string[];
  deaths: number;
  freezeStormTriggered: boolean;
  overheatTriggered: boolean;
  passed: boolean;
  tickets: FeedbackTicket[];
}

const PERSONAS: readonly PersonaConfig[] = [
  {
    id: 'aggressive_melee_berserker',
    label: '1. Aggressive Melee Berserker',
    sessionTicks: 2200,
    route: ['act1_canyon', 'act1_sandcity', 'act1_darkcity'],
    preferredOutcasts: ['britta', 'leifi', 'gustaf', 'trulls', 'stellan', 'einar', 'gunilla', 'hilda', 'britta'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'long_range_sniper_kiter',
    label: '2. Long-Range Sniper Kiter',
    sessionTicks: 2200,
    route: ['act1_saltpan', 'act2_stonyfield', 'act1_jotunheim'],
    preferredOutcasts: ['gustaf', 'gunilla', 'hilda', 'einar', 'britta', 'leifi', 'trulls', 'stellan', 'gustaf'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'explosive_wall_demolitionist',
    label: '3. Explosive Wall-Demolitionist',
    sessionTicks: 2200,
    route: ['act1_sewer', 'act2_milbase', 'act3_trenches'],
    preferredOutcasts: ['einar', 'stellan', 'britta', 'leifi', 'gunilla', 'trulls', 'hilda', 'gustaf', 'einar'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'turret_companion_engineer',
    label: '4. Turret & Companion Engineer',
    sessionTicks: 2200,
    route: ['act1_sandcave', 'act2_mosslab', 'act2_losttemple'],
    preferredOutcasts: ['einar', 'hilda', 'trulls', 'stellan', 'britta', 'leifi', 'gustaf', 'gunilla', 'hilda'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'dual_wield_bullet_hose',
    label: '5. Dual-Wield Bullet Hose',
    sessionTicks: 2200,
    route: ['act1_arena', 'act2_wildcity', 'act2_helheim'],
    preferredOutcasts: ['gunilla', 'britta', 'stellan', 'einar', 'gustaf', 'leifi', 'trulls', 'hilda', 'gunilla'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'mod_stacking_alchemist',
    label: '6. Mod-Stacking Elemental Alchemist',
    sessionTicks: 2400,
    route: ['act0_weaponshop', 'act2_mushroomcave', 'act3_sulfurlake', 'act3_muspelheim'],
    preferredOutcasts: ['trulls', 'hilda', 'gustaf', 'gunilla', 'einar', 'stellan', 'britta', 'leifi', 'trulls'],
    runModifiers: ['mod_ragnarok_tide'],
    loopLevel: 0,
  },
  {
    id: 'boss_rush_speedrunner',
    label: '7. Boss-Rush Speedrunner',
    sessionTicks: 3000,
    route: ['act1_darkcity', 'act1_jotunheim', 'act2_losttemple', 'act2_helheim', 'act3_muspelheim', 'act3_shrine'],
    preferredOutcasts: ['britta', 'leifi', 'gustaf', 'einar', 'gunilla', 'trulls', 'stellan', 'hilda', 'britta'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'freeze_storm_camper',
    label: '8. Freeze-Storm Camper Stress-Tester',
    sessionTicks: 3000,
    route: ['act1_canyon', 'act2_forest'],
    preferredOutcasts: ['leifi', 'trulls', 'hilda', 'einar', 'britta', 'gustaf', 'gunilla', 'stellan', 'leifi'],
    runModifiers: ['mod_fimbulwinter_surge', 'mod_blizzard_rush'],
    loopLevel: 0,
  },
  {
    id: 'oob_wall_hugger_fuzzer',
    label: '9. Out-of-Bounds Wall-Hugger Fuzz Tester',
    sessionTicks: 2100,
    route: ['act1_subway', 'act2_garage', 'act3_redhall'],
    preferredOutcasts: ['stellan', 'britta', 'leifi', 'gustaf', 'einar', 'gunilla', 'trulls', 'hilda', 'stellan'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'low_ammo_scavenger',
    label: '10. Low-Ammo Scavenger',
    sessionTicks: 2400,
    route: ['act1_supplystash', 'act1_campfire', 'act0_weaponshop', 'act2_deadlands'],
    preferredOutcasts: ['gunilla', 'einar', 'gustaf', 'hilda', 'britta', 'leifi', 'trulls', 'stellan', 'einar'],
    runModifiers: [],
    loopLevel: 0,
  },
  {
    id: 'loop_escalation_glass_cannon',
    label: '11. Loop-Escalation Glass Cannon',
    sessionTicks: 2400,
    route: ['act1_canyon', 'act2_milbase', 'act3_cindercity', 'act3_shrine'],
    preferredOutcasts: ['gustaf', 'gunilla', 'stellan', 'britta', 'hilda', 'einar', 'trulls', 'leifi', 'gustaf'],
    runModifiers: ['mod_valhalla_gauntlet', 'mod_hyper_tempo'],
    loopLevel: 1,
  },
  {
    id: 'high_overheat_minigun_maniac',
    label: '12. High-Overheat Minigun Maniac',
    sessionTicks: 2400,
    route: ['act1_keep', 'act2_keep', 'act3_keep'],
    preferredOutcasts: ['britta', 'gunilla', 'einar', 'leifi', 'stellan', 'trulls', 'hilda', 'gustaf', 'gunilla'],
    runModifiers: ['mod_berserker_frenzy'],
    loopLevel: 0,
  },
];

// Categorized weapon pools for authentic persona loadouts
const MELEE_WEAPONS = WEAPONS.filter((w) => w.class === 1 || w.ammoType === 0);
const SNIPER_WEAPONS = WEAPONS.filter((w) => w.class === 0 && w.projectileSpeed >= 12);
const EXPLOSIVE_WEAPONS = WEAPONS.filter((w) => w.ammoType === 5 || w.explosiveTier > 0 || w.damageType === 1);
const RAPID_WEAPONS = WEAPONS.filter((w) => w.class === 0 && w.cooldown <= 12);
const OVERHEAT_WEAPONS = WEAPONS.filter((w) => w.class === 0 && (w.overheat >= 0.12 || w.windupMax > 0));
const HIGH_TIER_WEAPONS = WEAPONS.filter((w) => w.weaponTier >= 4 && w.class === 0);

function selectLoadoutForTester(
  testerIndex: number,
  persona: PersonaConfig,
): { primaryId: number; secondaryId: number; swapMidRunId: number; extraSweepId?: number; mods: string[] } {
  // Deterministic 100% sweeping across all 221 weapons (108*2 = 216 + 5 tail weapons = 221) and all 76 mods
  const sweepWeaponA = WEAPONS[testerIndex % WEAPONS.length].uniqueId;
  const sweepWeaponB = WEAPONS[(testerIndex + 108) % WEAPONS.length].uniqueId;
  const extraSweepId = testerIndex < WEAPONS.length - 216 ? WEAPONS[216 + testerIndex].uniqueId : undefined;

  const sweepModA = MODS[testerIndex % MODS.length].id;
  const sweepModB = MODS[(testerIndex + 37) % MODS.length].id;

  switch (persona.id) {
    case 'aggressive_melee_berserker':
      return {
        primaryId: MELEE_WEAPONS[testerIndex % MELEE_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_extra_melee', 'mod_bigger_attack', sweepModA, sweepModB],
      };
    case 'long_range_sniper_kiter':
      return {
        primaryId: SNIPER_WEAPONS[testerIndex % SNIPER_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_scope', 'mod_choke', sweepModA, sweepModB],
      };
    case 'explosive_wall_demolitionist':
      return {
        primaryId: EXPLOSIVE_WEAPONS[testerIndex % EXPLOSIVE_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_fragrune', 'mod_blast_shield', sweepModA, sweepModB],
      };
    case 'turret_companion_engineer':
      return {
        primaryId: sweepWeaponA,
        secondaryId: sweepWeaponB,
        swapMidRunId: WEAPONS[(testerIndex * 3 + 7) % WEAPONS.length].uniqueId,
        extraSweepId,
        mods: ['mod_gun_drone', 'rune_soul', sweepModA, sweepModB],
      };
    case 'dual_wield_bullet_hose':
      return {
        primaryId: RAPID_WEAPONS[testerIndex % RAPID_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_turborune', 'mod_burst', sweepModA, sweepModB],
      };
    case 'mod_stacking_alchemist':
      return {
        primaryId: sweepWeaponA,
        secondaryId: sweepWeaponB,
        swapMidRunId: WEAPONS[(testerIndex * 5 + 13) % WEAPONS.length].uniqueId,
        extraSweepId,
        mods: [sweepModA, sweepModB, MODS[(testerIndex * 5 + 11) % MODS.length].id, 'rune_ragnarok'],
      };
    case 'boss_rush_speedrunner':
      return {
        primaryId: HIGH_TIER_WEAPONS[testerIndex % HIGH_TIER_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_overloader', 'rune_quad', 'mod_turborune', 'rune_ragnarok'],
      };
    case 'freeze_storm_camper':
      return {
        primaryId: sweepWeaponA,
        secondaryId: sweepWeaponB,
        swapMidRunId: WEAPONS[(testerIndex * 7 + 3) % WEAPONS.length].uniqueId,
        extraSweepId,
        mods: ['mod_immunity_ice', 'rune_shield', sweepModA, sweepModB],
      };
    case 'oob_wall_hugger_fuzzer':
      return {
        primaryId: sweepWeaponA,
        secondaryId: sweepWeaponB,
        swapMidRunId: WEAPONS[(testerIndex * 11 + 5) % WEAPONS.length].uniqueId,
        extraSweepId,
        mods: ['rune_bounce', 'mod_teleporter', sweepModA, sweepModB],
      };
    case 'low_ammo_scavenger':
      return {
        primaryId: RAPID_WEAPONS[(testerIndex + 3) % RAPID_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_bigmag', 'rune_endless', 'mod_ammo_recycler', sweepModA],
      };
    case 'loop_escalation_glass_cannon':
      return {
        primaryId: HIGH_TIER_WEAPONS[(testerIndex + 5) % HIGH_TIER_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_overloader', 'rune_ragnarok', sweepModA, sweepModB],
      };
    case 'high_overheat_minigun_maniac':
      return {
        primaryId: OVERHEAT_WEAPONS[testerIndex % OVERHEAT_WEAPONS.length].uniqueId,
        secondaryId: sweepWeaponA,
        swapMidRunId: sweepWeaponB,
        extraSweepId,
        mods: ['mod_overloader', 'mod_crazyreloader', 'mod_turborune', sweepModA],
      };
  }
}

function generatePersonaInput(
  state: SimState,
  persona: PersonaConfig,
  tick: number,
  seed: number,
): InputFrame {
  const inp = createNeutralInput();
  const p = state.player;

  // Find nearest live enemy
  let nearest: { x: number; y: number; dist: number; isBoss: boolean } | null = null;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!nearest || d < nearest.dist) {
      nearest = { x: e.x, y: e.y, dist: d, isBoss: e.isBoss };
    }
  }

  const targetX = nearest ? nearest.x : state.map.exitX;
  const targetY = nearest ? nearest.y : state.map.exitY;
  const dx = targetX - p.x;
  const dy = targetY - p.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Default aiming
  inp.aimWorldX = targetX;
  inp.aimWorldY = targetY;

  switch (persona.id) {
    case 'aggressive_melee_berserker': {
      // Rush straight into close range
      inp.moveX = dx / dist;
      inp.moveY = dy / dist;
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 3 === 0;
      inp.abilityPressed = tick % 65 === 5;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'long_range_sniper_kiter': {
      // Maintain 170-230px range
      const strafe = Math.floor(tick / 75) % 2 === 0 ? 1 : -1;
      const radial = dist < 165 ? -0.85 : dist > 235 ? 0.75 : 0;
      inp.moveX = (dx / dist) * radial + (-dy / dist) * 0.75 * strafe;
      inp.moveY = (dy / dist) * radial + (dx / dist) * 0.75 * strafe;
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 6 === 0;
      inp.abilityPressed = dist < 80 || tick % 110 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'explosive_wall_demolitionist': {
      // Alternately aim at interior destructible walls and enemies
      const sweepAng = (tick * 0.13 + seed) % (Math.PI * 2);
      const aimAtWall = tick % 5 < 2;
      inp.aimWorldX = aimAtWall ? p.x + Math.cos(sweepAng) * 90 : targetX;
      inp.aimWorldY = aimAtWall ? p.y + Math.sin(sweepAng) * 90 : targetY;
      inp.moveX = Math.cos(tick * 0.04);
      inp.moveY = Math.sin(tick * 0.05);
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 5 === 0;
      inp.abilityPressed = tick % 90 === 15;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'turret_companion_engineer': {
      const orbit = Math.floor(tick / 90) % 2 === 0 ? 1 : -1;
      inp.moveX = (-dy / dist) * 0.8 * orbit + (dist > 140 ? (dx / dist) * 0.4 : 0);
      inp.moveY = (dx / dist) * 0.8 * orbit + (dist > 140 ? (dy / dist) * 0.4 : 0);
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 5 === 0;
      inp.abilityPressed = tick % 40 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'dual_wield_bullet_hose': {
      const orbit = Math.floor(tick / 60) % 2 === 0 ? 1 : -1;
      inp.moveX = (dx / dist) * (dist > 110 ? 0.6 : -0.4) + (-dy / dist) * 0.8 * orbit;
      inp.moveY = (dy / dist) * (dist > 110 ? 0.6 : -0.4) + (dx / dist) * 0.8 * orbit;
      inp.firePrimary = true;
      inp.firePrimaryPressed = true;
      inp.abilityPressed = tick % 45 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      inp.swapWeaponPressed = tick % 240 === 120;
      break;
    }

    case 'mod_stacking_alchemist': {
      inp.moveX = (dx / dist) * (dist > 120 ? 0.55 : -0.45) + (-dy / dist) * 0.65;
      inp.moveY = (dy / dist) * (dist > 120 ? 0.55 : -0.45) + (dx / dist) * 0.65;
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 4 === 0;
      inp.abilityPressed = tick % 95 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      inp.interactPressed = tick % 45 === 0;
      break;
    }

    case 'boss_rush_speedrunner': {
      const strafe = Math.floor(tick / 70) % 2 === 0 ? 1 : -1;
      const radial = dist > 135 ? 0.65 : dist < 85 ? -0.7 : 0;
      inp.moveX = (dx / dist) * radial + (-dy / dist) * 0.85 * strafe;
      inp.moveY = (dy / dist) * radial + (dx / dist) * 0.85 * strafe;
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 3 === 0;
      inp.abilityPressed = tick % 75 === 5;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'freeze_storm_camper': {
      // Intentionally linger near spawn until freeze storm activates, then dodge frost shards!
      if (!state.freezeStorm.active) {
        inp.moveX = Math.sin(tick * 0.05) * 0.2;
        inp.moveY = Math.cos(tick * 0.05) * 0.2;
        inp.firePrimary = false;
      } else {
        const dodge = Math.floor(tick / 45) % 2 === 0 ? 1 : -1;
        inp.moveX = (-dy / dist) * dodge;
        inp.moveY = (dx / dist) * dodge;
        inp.firePrimary = true;
        inp.firePrimaryPressed = tick % 5 === 0;
        inp.abilityPressed = tick % 80 === 0;
        inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      }
      break;
    }

    case 'oob_wall_hugger_fuzzer': {
      // Slam violently into all 4 corners, diagonal walls, spam dash/swap/interact/vent
      const phase = Math.floor(tick / 140) % 6;
      const dirs: Array<[number, number]> = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [Math.cos(tick * 0.7), Math.sin(tick * 0.9)],
        [0, -1],
      ];
      inp.moveX = dirs[phase][0];
      inp.moveY = dirs[phase][1];
      inp.aimWorldX = p.x + Math.cos(tick * 0.5) * 400;
      inp.aimWorldY = p.y + Math.sin(tick * 0.5) * 400;
      inp.firePrimary = tick % 2 === 0;
      inp.firePrimaryPressed = tick % 3 === 0;
      inp.abilityPressed = tick % 20 === 0;
      inp.powerPressed = tick % 50 === 0;
      inp.swapWeaponPressed = tick % 35 === 0;
      inp.interactPressed = tick % 15 === 0;
      inp.reloadOrVentPressed = tick % 18 === 0;
      break;
    }

    case 'low_ammo_scavenger': {
      // Chase nearest pickup or chest first, otherwise fight conservatively
      if (state.pickups.length > 0) {
        const pk = state.pickups[0];
        const pdx = pk.x - p.x;
        const pdy = pk.y - p.y;
        const pd = Math.hypot(pdx, pdy) || 1;
        inp.moveX = pdx / pd;
        inp.moveY = pdy / pd;
      } else {
        inp.moveX = (dx / dist) * 0.65;
        inp.moveY = (dy / dist) * 0.65;
      }
      inp.firePrimary = nearest !== null && nearest.dist < 180;
      inp.firePrimaryPressed = tick % 8 === 0;
      inp.interactPressed = tick % 20 === 0;
      inp.abilityPressed = tick % 100 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'loop_escalation_glass_cannon': {
      const strafe = Math.floor(tick / 55) % 2 === 0 ? 1 : -1;
      inp.moveX = (dx / dist) * (dist > 140 ? 0.6 : -0.6) + (-dy / dist) * 0.85 * strafe;
      inp.moveY = (dy / dist) * (dist > 140 ? 0.6 : -0.6) + (dx / dist) * 0.85 * strafe;
      inp.firePrimary = true;
      inp.firePrimaryPressed = tick % 3 === 0;
      inp.abilityPressed = tick % 60 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }

    case 'high_overheat_minigun_maniac': {
      const active = p.weapons[p.activeSlot];
      const locked = Boolean(active && active.overheatedLockTicks > 0);
      inp.moveX = (-dy / dist) * 0.7 + (dist > 130 ? (dx / dist) * 0.5 : 0);
      inp.moveY = (dx / dist) * 0.7 + (dist > 130 ? (dy / dist) * 0.5 : 0);
      // Hold fire straight through overheat, then vent once locked/cooling
      inp.firePrimary = !locked;
      inp.firePrimaryPressed = !locked && tick % 4 === 0;
      inp.reloadOrVentPressed = locked || (active !== null && active.overheat > 0.85 && tick % 3 === 0);
      inp.abilityPressed = tick % 90 === 0;
      inp.powerPressed = p.powerCharge >= p.powerChargeRequired;
      break;
    }
  }

  return inp;
}

function runPlaytesterSession(
  testerId: number,
  persona: PersonaConfig,
  pairingIndex: number,
): TesterTelemetry {
  const seed = 50000 + testerId * 1009 + pairingIndex * 37;
  const outcast = persona.preferredOutcasts[pairingIndex % persona.preferredOutcasts.length];
  const tickets: FeedbackTicket[] = [];
  const ticketDedup = new Set<string>();
  const weaponsTested = new Set<number>();
  const modsTested = new Set<string>();

  const pushTicket = (
    severity: TicketSeverity,
    code: string,
    nodeId: string,
    tick: number,
    message: string,
  ): void => {
    const dedupKey = `${code}:${nodeId}`;
    if (ticketDedup.has(dedupKey)) return;
    ticketDedup.add(dedupKey);
    tickets.push({
      severity,
      code,
      persona: persona.id,
      testerId,
      seed,
      outcast,
      nodeId,
      tick,
      message,
    });
  };

  let state: SimState;
  let deaths = 0;
  let freezeStormTriggered = false;
  let overheatTriggered = false;
  let totalTicksSimulated = 0;

  try {
    state = createInitialSimState(seed, outcast);
    state.activeModifiers = [...persona.runModifiers];
    if (persona.loopLevel > 0) {
      state.loopCount = persona.loopLevel + (pairingIndex % 2); // Loop 1 & Loop 2 coverage
    }

    const loadout = selectLoadoutForTester(testerId - 1, persona);
    equipWeaponByUniqueId(state, loadout.primaryId, 0);
    equipWeaponByUniqueId(state, loadout.secondaryId, 1);
    weaponsTested.add(loadout.primaryId);
    weaponsTested.add(loadout.secondaryId);

    for (const mId of loadout.mods) {
      if (attachModToWeapon(state, mId, 0)) {
        modsTested.add(mId);
      }
    }

    // Workbench detach/reattach & golden upgrade test for alchemist/boss-rush
    if (persona.id === 'mod_stacking_alchemist' || persona.id === 'boss_rush_speedrunner') {
      if (state.player.weapons[0]!.mods.length > 0) {
        const firstMod = state.player.weapons[0]!.mods[0];
        detachModFromWeapon(state, firstMod, 0);
        attachModToWeapon(state, firstMod, 0);
      }
      upgradeWeaponGolden(state, 0, true);
    }

    // Low-ammo scavenger deliberately enters combat with tight ammo reserves
    if (persona.id === 'low_ammo_scavenger') {
      state.player.ammo = [0, 22, 10, 12, 18, 6];
    }

    // Determine route for this tester
    const route =
      persona.id === 'boss_rush_speedrunner'
        ? [
            persona.route[pairingIndex % persona.route.length],
            persona.route[(pairingIndex + 1) % persona.route.length],
          ]
        : persona.route;

    const ticksPerRoom = Math.max(520, Math.floor((persona.sessionTicks * 1.15) / route.length));
    let combatRoomIdx = 0;

    for (let rIdx = 0; rIdx < route.length; rIdx++) {
      const nodeId = route[rIdx];
      if (!OVERWORLD_NODE_BY_ID.has(nodeId)) {
        pushTicket('CRITICAL', 'INVALID_ROUTE_NODE', nodeId, state.tick, `Unknown overworld node '${nodeId}'`);
        continue;
      }
      enterNode(state, nodeId);

      // Verify BFS connectivity on every entered node
      if (!verifyMapConnectivity(state.map)) {
        pushTicket('CRITICAL', 'BFS_DISCONNECTED', nodeId, state.tick, `Map failed BFS connectivity on ${nodeId}`);
      }

      // Check whether any spawned combat enemy is in a BFS-unreachable pocket from spawn
      if (state.screenMode === 'combat' && state.enemies.length > 0) {
        const reachable = computeReachableMask(state.map);
        for (const e of state.enemies) {
          const etx = worldToTile(e.x, state.map.tileSize);
          const ety = worldToTile(e.y, state.map.tileSize);
          const idx = ety * state.map.width + etx;
          if (idx >= 0 && idx < reachable.length && reachable[idx] === 0) {
            pushTicket(
              'MAJOR',
              'UNREACHABLE_ENEMY_SPAWN',
              nodeId,
              state.tick,
              `Enemy ${e.defId}#${e.id} spawned on BFS-unreachable tile (${etx},${ety})`,
            );
            break;
          }
        }
      }

      // Handle Shop / Campfire nodes realistically
      if (state.screenMode === 'shop') {
        state.player.gold = Math.max(state.player.gold, 800);
        for (const offer of state.shopOffers) {
          if (!offer.purchased && state.player.gold >= offer.price && (offer.kind === 'mod' || offer.kind === 'ammo' || offer.kind === 'heal')) {
            buyShopOffer(state, offer.id);
          }
        }
        continue;
      }

      if (state.screenMode === 'campfire') {
        const actions: Array<'heal' | 'ammo' | 'upgrade' | 'skill'> = ['heal', 'ammo', 'upgrade', 'skill'];
        useCampfireAction(state, actions[(testerId + rIdx) % actions.length]);
        continue;
      }

      // Mid-run weapon swap across combat rooms to guarantee 221/221 weapon live firing coverage
      if (combatRoomIdx === 1) {
        equipWeaponByUniqueId(state, loadout.swapMidRunId, 1);
        weaponsTested.add(loadout.swapMidRunId);
        state.player.activeSlot = 1;
      } else if (combatRoomIdx === 2 && loadout.extraSweepId !== undefined) {
        equipWeaponByUniqueId(state, loadout.extraSweepId, 1);
        weaponsTested.add(loadout.extraSweepId);
        state.player.activeSlot = 1;
      } else {
        state.player.activeSlot = 0;
      }
      combatRoomIdx += 1;

      // Track per-room anomaly counters
      let stuckTicks = 0;
      let zeroAmmoTicks = 0;
      let deadFireTicks = 0;
      let phaseShiftTicks = 0;
      let sawBossPhase1DeadNoShift = false;
      const prevBounceByProjId = new Map<number, number>();

      for (let t = 0; t < ticksPerRoom; t++) {
        // Handle respawn / victory recovery cleanly so full tick budget is simulated
        if (state.screenMode === 'gameover') {
          deaths += 1;
          state.screenMode = 'combat';
          state.player.hp = state.player.maxHp;
          state.player.iframes = 60;
        } else if (state.screenMode === 'victory') {
          startNextLoop(state);
          if (!verifyMapConnectivity(state.map)) {
            pushTicket('CRITICAL', 'LOOP_BFS_DISCONNECTED', state.currentNodeId, state.tick, 'Loop 1 map failed BFS');
          }
          break;
        } else if (state.screenMode === 'overworld') {
          // Player exited room portal cleanly -> advance to next route node
          break;
        }

        // Snapshot before tick for spike & tunneling checks
        const hpBefore = state.player.hp;
        const pxBefore = state.player.x;
        const pyBefore = state.player.y;
        const shotsBefore = state.player.shotsFired;
        prevBounceByProjId.clear();
        for (let i = 0; i < state.projectiles.length; i++) {
          prevBounceByProjId.set(state.projectiles[i].id, state.projectiles[i].bouncesLeft);
        }

        const inp = generatePersonaInput(state, persona, t, seed);
        stepSim(state, inp);
        totalTicksSimulated += 1;

        const events = drainSimEvents(state);
        for (const ev of events) {
          if (ev.type === 'freeze_crystal_spawn') freezeStormTriggered = true;
          if (ev.type === 'floating_text' && ev.text === 'OVERHEAT!') overheatTriggered = true;
        }

        const p = state.player;
        const ts = state.map.tileSize;
        const minIn = ts - 0.5;
        const maxInX = (state.map.width - 1) * ts + 0.5;
        const maxInY = (state.map.height - 1) * ts + 0.5;

        // 1. CRITICAL: NaN / Infinity check
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          !Number.isFinite(p.vx) ||
          !Number.isFinite(p.vy) ||
          !Number.isFinite(p.hp) ||
          !Number.isFinite(p.shield) ||
          !Number.isFinite(state.camera.x) ||
          !Number.isFinite(state.camera.y)
        ) {
          pushTicket('CRITICAL', 'NAN_PLAYER', nodeId, state.tick, `Non-finite player/camera value: x=${p.x}, y=${p.y}, hp=${p.hp}`);
          break;
        }

        // 2. CRITICAL: Out-of-bounds escape past outer bedrock ring
        if (p.x < minIn || p.x > maxInX || p.y < minIn || p.y > maxInY) {
          pushTicket(
            'CRITICAL',
            'OOB_PLAYER',
            nodeId,
            state.tick,
            `Player escaped outer bedrock bounds: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) vs [${minIn}..${maxInX}, ${minIn}..${maxInY}]`,
          );
        }

        // 3. CRITICAL: Entity / projectile / pickup / companion leak caps
        if (state.enemies.length > MAX_ENEMIES) {
          pushTicket('CRITICAL', 'ENEMY_LEAK', nodeId, state.tick, `Enemies ${state.enemies.length} > ${MAX_ENEMIES}`);
        }
        if (state.projectiles.length > MAX_PROJECTILES) {
          pushTicket('CRITICAL', 'PROJ_LEAK', nodeId, state.tick, `Projectiles ${state.projectiles.length} > ${MAX_PROJECTILES}`);
        }
        if (state.pickups.length > MAX_PICKUPS) {
          pushTicket('CRITICAL', 'PICKUP_LEAK', nodeId, state.tick, `Pickups ${state.pickups.length} > ${MAX_PICKUPS}`);
        }
        if (state.companions.length > MAX_COMPANIONS) {
          pushTicket('CRITICAL', 'COMPANION_LEAK', nodeId, state.tick, `Companions ${state.companions.length} > ${MAX_COMPANIONS}`);
        }

        // 4. CRITICAL: Projectile wall-tunneling & NaN check
        for (let i = 0; i < state.projectiles.length; i++) {
          const pr = state.projectiles[i];
          if (!Number.isFinite(pr.x) || !Number.isFinite(pr.y) || !Number.isFinite(pr.vx) || !Number.isFinite(pr.vy)) {
            pushTicket('CRITICAL', 'NAN_PROJECTILE', nodeId, state.tick, `Non-finite projectile #${pr.id}`);
            break;
          }
          const prevBounces = prevBounceByProjId.get(pr.id);
          if (
            prevBounces !== undefined &&
            prevBounces === pr.bouncesLeft &&
            !pr.isMelee &&
            !pr.ethereal &&
            !pr.teleportOwner
          ) {
            const segLen = Math.hypot(pr.x - pr.prevX, pr.y - pr.prevY);
            if (segLen > ts * 0.85) {
              const startKind = getTileAt(state.map, worldToTile(pr.prevX, ts), worldToTile(pr.prevY, ts));
              const endKind = getTileAt(state.map, worldToTile(pr.x, ts), worldToTile(pr.y, ts));
              if (isWalkableTile(startKind) && isWalkableTile(endKind)) {
                const hit = sweepProjectileVsTilemap(state.map, pr.prevX, pr.prevY, pr.x, pr.y, 0, false);
                if (hit && hit.t > 0.05 && hit.t < 0.95) {
                  pushTicket(
                    'CRITICAL',
                    'PROJECTILE_TUNNEL',
                    nodeId,
                    state.tick,
                    `Projectile #${pr.id} (spd=${pr.speed.toFixed(1)}) tunneled across solid tile (${hit.tileX},${hit.tileY})`,
                  );
                }
              }
            }
          }
        }

        // 5. CRITICAL: Enemy NaN / OOB / Boss Phase Softlock checks
        for (let i = 0; i < state.enemies.length; i++) {
          const e = state.enemies[i];
          if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.hp)) {
            pushTicket('CRITICAL', 'NAN_ENEMY', nodeId, state.tick, `Non-finite enemy ${e.defId}#${e.id}`);
            break;
          }
          if (e.x < minIn || e.x > maxInX || e.y < minIn || e.y > maxInY) {
            pushTicket('CRITICAL', 'OOB_ENEMY', nodeId, state.tick, `Enemy ${e.defId}#${e.id} escaped bedrock bounds`);
          }
          if (e.isBoss) {
            if (e.aiState === 'phase_shift') {
              phaseShiftTicks += 1;
              if (phaseShiftTicks > 90) {
                pushTicket('CRITICAL', 'BOSS_PHASE_SOFTLOCK', nodeId, state.tick, `Boss ${e.bossId} stuck in phase_shift for ${phaseShiftTicks} ticks`);
              }
            } else {
              phaseShiftTicks = 0;
            }
            if (e.bossPhase === 1 && e.hp <= 0 && !sawBossPhase1DeadNoShift) {
              sawBossPhase1DeadNoShift = true;
              pushTicket('CRITICAL', 'BOSS_NO_PHASE2', nodeId, state.tick, `Boss ${e.bossId} hit 0 HP in Phase 1 without transitioning to Phase 2`);
            }
          }
        }

        // 6. CRITICAL: Periodic outer bedrock integrity audit
        if (t % 150 === 0) {
          for (let x = 0; x < state.map.width; x++) {
            if (
              getTileAt(state.map, x, 0) !== TileKind.WallBedrock ||
              getTileAt(state.map, x, state.map.height - 1) !== TileKind.WallBedrock
            ) {
              pushTicket('CRITICAL', 'BEDROCK_BREACHED', nodeId, state.tick, `Outer horizontal bedrock breached at col ${x}`);
              break;
            }
          }
        }

        // 7. MAJOR: Stuck player check (truly clear walkable space along requested axes, yet zero displacement)
        if (
          state.screenMode === 'combat' &&
          persona.id !== 'oob_wall_hugger_fuzzer' &&
          persona.id !== 'freeze_storm_camper'
        ) {
          const moveMag = Math.hypot(inp.moveX, inp.moveY);
          if (moveMag > 0.5 && state.hitstopTicks === 0) {
            const nx = inp.moveX / moveMag;
            const ny = inp.moveY / moveMag;
            const probe = p.radius + 3;
            const clearX =
              Math.abs(nx) < 0.25 ||
              isWalkableTile(getTileAt(state.map, worldToTile(p.x + Math.sign(nx) * probe, ts), worldToTile(p.y, ts)));
            const clearY =
              Math.abs(ny) < 0.25 ||
              isWalkableTile(getTileAt(state.map, worldToTile(p.x, ts), worldToTile(p.y + Math.sign(ny) * probe, ts)));
            const clearDiag = isWalkableTile(
              getTileAt(state.map, worldToTile(p.x + nx * probe, ts), worldToTile(p.y + ny * probe, ts)),
            );
            const moved = Math.hypot(p.x - pxBefore, p.y - pyBefore);
            if (clearX && clearY && clearDiag && moved < 0.05) {
              stuckTicks += 1;
              if (stuckTicks >= 90) {
                pushTicket(
                  'MAJOR',
                  'PLAYER_STUCK',
                  nodeId,
                  state.tick,
                  `Player stuck for ${stuckTicks} ticks at (${p.x.toFixed(1)},${p.y.toFixed(1)}) despite clear walkable space`,
                );
                stuckTicks = 0;
              }
            } else {
              stuckTicks = 0;
            }
          } else {
            stuckTicks = 0;
          }
        }

        // 8. MAJOR: Dead weapon combo check (wants to fire, unlocked, has ammo, zero shots over 120 ticks)
        const activeW = p.weapons[p.activeSlot];
        if (
          state.screenMode === 'combat' &&
          activeW &&
          inp.firePrimary &&
          activeW.overheatedLockTicks === 0 &&
          state.hitstopTicks === 0
        ) {
          const def = getWeaponDef(activeW.uniqueId);
          const hasAmmo = def.ammoType === 0 || p.ammo[def.ammoType] >= Math.max(1, def.ammoCost);
          if (hasAmmo && p.shotsFired === shotsBefore) {
            deadFireTicks += 1;
            if (deadFireTicks >= Math.max(120, Math.ceil(def.cooldown * 3) + 20)) {
              pushTicket(
                'MAJOR',
                'DEAD_WEAPON_COMBO',
                nodeId,
                state.tick,
                `Weapon ${def.uniqueId} (${def.name}) with mods [${activeW.mods.join(',')}] failed to fire for ${deadFireTicks} ticks`,
              );
              deadFireTicks = 0;
            }
          } else {
            deadFireTicks = 0;
          }
        } else {
          deadFireTicks = 0;
        }

        // 9. MAJOR: Ammo softlock check (both slots out of ammo for > 480 ticks in combat)
        if (state.screenMode === 'combat' && state.enemies.length > 0) {
          const canUseSlot = (slot: 0 | 1): boolean => {
            const w = p.weapons[slot];
            if (!w) return false;
            const d = getWeaponDef(w.uniqueId);
            return d.ammoType === 0 || p.ammo[d.ammoType] >= Math.max(1, d.ammoCost);
          };
          if (!canUseSlot(0) && !canUseSlot(1)) {
            zeroAmmoTicks += 1;
            if (zeroAmmoTicks === 480) {
              pushTicket(
                'MAJOR',
                'AMMO_SOFTLOCK',
                nodeId,
                state.tick,
                `Both equipped weapons dry for 480+ ticks in combat (slots: ${p.weapons[0]?.uniqueId}/${p.weapons[1]?.uniqueId})`,
              );
            }
          } else {
            zeroAmmoTicks = 0;
          }
        }

        // 10. MINOR: Instant-kill balance spike check (single tick drops >= 65% maxHp in Loop 0 standard difficulty)
        if (state.loopCount === 0 && persona.runModifiers.length === 0 && hpBefore > 0) {
          const singleTickLoss = hpBefore - p.hp;
          if (singleTickLoss >= p.maxHp * 0.65) {
            pushTicket(
              'MINOR',
              'INSTANT_KILL_SPIKE',
              nodeId,
              state.tick,
              `Single-tick damage spike of ${singleTickLoss} HP (${Math.round((singleTickLoss / p.maxHp) * 100)}% of maxHp=${p.maxHp})`,
            );
          }
        }
      }
    }

    const seconds = Math.max(1 / 60, totalTicksSimulated / 60);
    const hasCritical = tickets.some((tk) => tk.severity === 'CRITICAL');

    return {
      testerId,
      persona: persona.id,
      personaLabel: persona.label,
      seed,
      outcast,
      ticksSimulated: totalTicksSimulated,
      kills: state.player.kills,
      damageDealt: state.player.damageDealt,
      dps: Number((state.player.damageDealt / seconds).toFixed(1)),
      shotsFired: state.player.shotsFired,
      shotsHit: state.player.shotsHit,
      wallsDestroyed: state.runStats.wallsDestroyed,
      bossesCleared: [...state.runStats.bossesDefeated],
      weaponsTested: [...weaponsTested],
      modsTested: [...modsTested],
      deaths,
      freezeStormTriggered,
      overheatTriggered,
      passed: !hasCritical,
      tickets,
    };
  } catch (err) {
    pushTicket(
      'CRITICAL',
      'UNCAUGHT_EXCEPTION',
      'unknown',
      totalTicksSimulated,
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return {
      testerId,
      persona: persona.id,
      personaLabel: persona.label,
      seed,
      outcast,
      ticksSimulated: totalTicksSimulated,
      kills: 0,
      damageDealt: 0,
      dps: 0,
      shotsFired: 0,
      shotsHit: 0,
      wallsDestroyed: 0,
      bossesCleared: [],
      weaponsTested: [...weaponsTested],
      modsTested: [...modsTested],
      deaths,
      freezeStormTriggered,
      overheatTriggered,
      passed: false,
      tickets,
    };
  }
}

function parseOutArg(): string | null {
  const idx = process.argv.indexOf('--out');
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

function main(): void {
  const outPath = parseOutArg();
  const startMs = Date.now();
  const pairingsPerPersona = 9; // 12 personas x 9 pairings = 108 distinct playtesters!
  const results: TesterTelemetry[] = [];

  let testerId = 1;
  for (const persona of PERSONAS) {
    for (let p = 0; p < pairingsPerPersona; p++) {
      results.push(runPlaytesterSession(testerId++, persona, p));
    }
  }

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
  const totalTesters = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = totalTesters - passedCount;
  const totalTicks = results.reduce((s, r) => s + r.ticksSimulated, 0);
  const totalKills = results.reduce((s, r) => s + r.kills, 0);
  const totalDamage = results.reduce((s, r) => s + r.damageDealt, 0);
  const totalWalls = results.reduce((s, r) => s + r.wallsDestroyed, 0);
  const totalDeaths = results.reduce((s, r) => s + r.deaths, 0);
  const avgDps = Number((results.reduce((s, r) => s + r.dps, 0) / totalTesters).toFixed(1));

  const uniqueWeapons = new Set<number>();
  const uniqueMods = new Set<string>();
  const uniqueOutcasts = new Set<OutcastId>();
  const bossesClearedCount = new Map<BossId, number>();
  let totalBossClears = 0;
  let freezeStormTriggers = 0;
  let overheatTriggers = 0;

  const allTickets: FeedbackTicket[] = [];
  for (const r of results) {
    for (const w of r.weaponsTested) uniqueWeapons.add(w);
    for (const m of r.modsTested) uniqueMods.add(m);
    uniqueOutcasts.add(r.outcast);
    for (const b of r.bossesCleared) {
      bossesClearedCount.set(b, (bossesClearedCount.get(b) ?? 0) + 1);
      totalBossClears += 1;
    }
    if (r.freezeStormTriggered) freezeStormTriggers += 1;
    if (r.overheatTriggered) overheatTriggers += 1;
    allTickets.push(...r.tickets);
  }

  const criticalTickets = allTickets.filter((t) => t.severity === 'CRITICAL');
  const majorTickets = allTickets.filter((t) => t.severity === 'MAJOR');
  const minorTickets = allTickets.filter((t) => t.severity === 'MINOR');

  console.log('========================================================================');
  console.log('KRUNKEDFALL — 108-PLAYTESTER ADVERSARIAL PERSONA GAUNTLET REPORT');
  console.log('========================================================================');
  console.log(`  Playtesters Executed : ${totalTesters} (12 Personas x ${pairingsPerPersona} Pairings)`);
  console.log(`  Pass / Fail (Crit)   : ${passedCount} PASSED / ${failedCount} FAILED (${elapsedSec}s wall time)`);
  console.log(`  Total Simulated Ticks: ${totalTicks.toLocaleString()} (${(totalTicks / 60 / 60).toFixed(1)} simulated minutes @ 60 Hz)`);
  console.log(`  Aggregate Telemetry  : ${totalKills.toLocaleString()} kills | ${totalDamage.toLocaleString()} dmg | ${avgDps} avg DPS | ${totalWalls.toLocaleString()} walls shattered`);
  console.log(`  Bosses Cleared       : ${totalBossClears} total (${[...bossesClearedCount.entries()].map(([k, v]) => `${k}:${v}`).join(', ') || 'none'})`);
  console.log(`  Coverage Matrix      : Weapons ${uniqueWeapons.size}/${WEAPONS.length} | Mods ${uniqueMods.size}/${MODS.length} | Outcasts ${uniqueOutcasts.size}/${OUTCASTS.length} | Bosses ${bossesClearedCount.size}/${BOSSES.length} | RunMods ${RUN_MODIFIERS.length}`);
  console.log(`  Stress Events        : Deaths=${totalDeaths} | FreezeStormTriggers=${freezeStormTriggers} | OverheatLockouts=${overheatTriggers}`);
  console.log('------------------------------------------------------------------------');
  console.log('  PER-PERSONA SUMMARY:');
  for (const persona of PERSONAS) {
    const group = results.filter((r) => r.persona === persona.id);
    const gPass = group.filter((r) => r.passed).length;
    const gKills = group.reduce((s, r) => s + r.kills, 0);
    const gWalls = group.reduce((s, r) => s + r.wallsDestroyed, 0);
    const gDeaths = group.reduce((s, r) => s + r.deaths, 0);
    const gDps = (group.reduce((s, r) => s + r.dps, 0) / group.length).toFixed(1);
    const gCrit = group.reduce((s, r) => s + r.tickets.filter((t) => t.severity === 'CRITICAL').length, 0);
    const gMaj = group.reduce((s, r) => s + r.tickets.filter((t) => t.severity === 'MAJOR').length, 0);
    const gMin = group.reduce((s, r) => s + r.tickets.filter((t) => t.severity === 'MINOR').length, 0);
    console.log(
      `    ${persona.label.padEnd(42)} | ${gPass}/9 pass | DPS ${gDps.padStart(6)} | kills ${String(gKills).padStart(4)} | walls ${String(gWalls).padStart(4)} | deaths ${String(gDeaths).padStart(3)} | C:${gCrit} M:${gMaj} m:${gMin}`,
    );
  }

  console.log('------------------------------------------------------------------------');
  console.log(
    `  FEEDBACK TICKETS: CRITICAL=${criticalTickets.length} | MAJOR=${majorTickets.length} | MINOR=${minorTickets.length}`,
  );

  const printTicketGroup = (title: string, list: FeedbackTicket[]): void => {
    if (list.length === 0) return;
    console.log(`\n  [${title}] (${list.length} ticket(s)):`);
    // Group by code for crisp readability while preserving exact first 5 repros
    const byCode = new Map<string, FeedbackTicket[]>();
    for (const tk of list) {
      const arr = byCode.get(tk.code) ?? [];
      arr.push(tk);
      byCode.set(tk.code, arr);
    }
    for (const [code, group] of byCode.entries()) {
      console.log(`    * ${code} (${group.length} occurrence(s)):`);
      for (const sample of group.slice(0, 5)) {
        console.log(
          `      - [tester=#${sample.testerId} seed=${sample.seed} persona=${sample.persona} outcast=${sample.outcast} node=${sample.nodeId} tick=${sample.tick}] ${sample.message}`,
        );
      }
      if (group.length > 5) {
        console.log(`      ... (+${group.length - 5} more occurrences)`);
      }
    }
  };

  printTicketGroup('CRITICAL', criticalTickets);
  printTicketGroup('MAJOR', majorTickets);
  printTicketGroup('MINOR', minorTickets);
  console.log('========================================================================');

  if (outPath) {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(
      resolved,
      JSON.stringify(
        {
          summary: {
            totalTesters,
            passedCount,
            failedCount,
            totalTicks,
            totalKills,
            totalDamage,
            avgDps,
            totalWalls,
            totalDeaths,
            totalBossClears,
            weaponsCovered: uniqueWeapons.size,
            weaponsTotal: WEAPONS.length,
            modsCovered: uniqueMods.size,
            modsTotal: MODS.length,
            outcastsCovered: uniqueOutcasts.size,
            bossesCovered: bossesClearedCount.size,
            freezeStormTriggers,
            overheatTriggers,
            tickets: {
              critical: criticalTickets.length,
              major: majorTickets.length,
              minor: minorTickets.length,
            },
          },
          tickets: allTickets,
          testers: results,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log(`  [INFO] JSON telemetry written to ${resolved}`);
  }

  if (criticalTickets.length > 0) {
    process.exit(1);
  }
}

main();
