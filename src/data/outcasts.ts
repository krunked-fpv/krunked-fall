// ============================================================================
// KRUNKEDFALL — Playable Outcasts (8) & Skins (10) Registry
// ============================================================================
// Pure declarative data — 100% Krunked-branded, zero DOM globals, deterministic.

import type { OutcastDef, OutcastId, SkinDef, SkinId } from '../contracts/index.js';

export const OUTCASTS: readonly OutcastDef[] = [
  {
    id: 'britta',
    sourceKey: 'Cyberserker',
    name: 'BRITTA',
    title: 'THE CYBERSERKER',
    spriteKey: 'outcast_britta',
    maxHp: 110,
    moveSpeed: 2.35,
    startingWeaponUniqueId: 1015, // PISTOL
    secondaryWeaponUniqueId: 1001, // AXE
    abilityName: 'PNEUMATIC DASH',
    abilityDesc: 'Dash out of danger or into the fray, dealing crushing cybernetic impact damage.',
    abilityCooldownTicks: 75,
    abilityMaxCharges: 2,
    powerName: 'METAL BERSERK',
    powerDesc: 'Go on an extended rampage with your metal arm, slashing fire cooldown and boosting melee cleave.',
    powerChargeRequired: 100,
    powerDurationTicks: 360,
    accentColor: '#ff4d6d',
    skillNodeIds: ['britta_powerful_berserk', 'britta_invigorating_berserk', 'britta_spiky_knee'],
  },
  {
    id: 'leifi',
    sourceKey: 'Moose',
    name: 'LEIFI',
    title: 'THE MOOSE',
    spriteKey: 'outcast_leifi',
    maxHp: 145,
    moveSpeed: 2.15,
    startingWeaponUniqueId: 1047, // SHOTGUN
    secondaryWeaponUniqueId: 1001, // AXE
    abilityName: 'HORN SHIELD',
    abilityDesc: 'Become invulnerable behind interlocking horns at reduced movement speed.',
    abilityCooldownTicks: 150,
    abilityMaxCharges: 1,
    powerName: 'TRAMPLE CHARGE',
    powerDesc: 'Unleash an unstoppable wall-crushing horn stampede that obliterates everything in your path.',
    powerChargeRequired: 110,
    powerDurationTicks: 300,
    accentColor: '#ff9f1c',
    skillNodeIds: ['leifi_lasting_shield', 'leifi_reflecting_shield', 'leifi_moose_muscle'],
  },
  {
    id: 'gustaf',
    sourceKey: 'Darkelf',
    name: 'GUSTAF',
    title: 'THE GHOST',
    spriteKey: 'outcast_gustaf',
    maxHp: 90,
    moveSpeed: 2.6,
    startingWeaponUniqueId: 1114, // CROSSBOW
    secondaryWeaponUniqueId: 1000, // DAGGER
    abilityName: 'GHOST WALK',
    abilityDesc: 'Phase unseen through enemies and hazards while repositioning for a kill.',
    abilityCooldownTicks: 120,
    abilityMaxCharges: 1,
    powerName: 'SHADOW EXECUTION',
    powerDesc: 'Cloak in spectral stealth and deliver a devastating empowered critical strike.',
    powerChargeRequired: 95,
    powerDurationTicks: 300,
    accentColor: '#9b5de5',
    skillNodeIds: ['gustaf_ghost_blade', 'gustaf_quick_shadow', 'gustaf_wicked_strike'],
  },
  {
    id: 'einar',
    sourceKey: 'Dwarf',
    name: 'EINAR',
    title: 'THE MINER',
    spriteKey: 'outcast_einar',
    maxHp: 120,
    moveSpeed: 2.2,
    startingWeaponUniqueId: 1019, // REVOLVER
    secondaryWeaponUniqueId: 1004, // WRENCH
    abilityName: 'TURRETMOUTH',
    abilityDesc: 'Deploy an autonomous tracking Turretmouth that guns down nearby hostiles.',
    abilityCooldownTicks: 180,
    abilityMaxCharges: 2,
    powerName: 'DRILLNOSE',
    powerDesc: 'Dispatch a relentless wall-carving Drillnose bot that shreds enemies and vacuums pickups.',
    powerChargeRequired: 105,
    powerDurationTicks: 420,
    accentColor: '#fee440',
    skillNodeIds: ['einar_turret_endurance', 'einar_drill_march', 'einar_dash_mine'],
  },
  {
    id: 'gunilla',
    sourceKey: 'Gnome',
    name: 'GUNILLA',
    title: 'THE GUNRUNNER',
    spriteKey: 'outcast_gunilla',
    maxHp: 95,
    moveSpeed: 2.5,
    startingWeaponUniqueId: 1028, // SUBMACHINE GUN
    secondaryWeaponUniqueId: 1015, // PISTOL
    abilityName: 'DUAL WIELD',
    abilityDesc: 'Fire your offhand weapon in synchronized salvos for double bullet storm output.',
    abilityCooldownTicks: 105,
    abilityMaxCharges: 1,
    powerName: 'MAGIC LEAF',
    powerDesc: 'Restore vital HP and enter a rapid-movement ammo-generation frenzy.',
    powerChargeRequired: 100,
    powerDurationTicks: 360,
    accentColor: '#00f5d4',
    skillNodeIds: ['gunilla_bullet_storm', 'gunilla_endless_shooting', 'gunilla_gun_nut'],
  },
  {
    id: 'trulls',
    sourceKey: 'Troll',
    name: 'TRULLS',
    title: 'THE TRAPPER',
    spriteKey: 'outcast_trulls',
    maxHp: 130,
    moveSpeed: 2.2,
    startingWeaponUniqueId: 1165, // SPEAR
    secondaryWeaponUniqueId: 1021, // LEVER ACTION
    abilityName: 'WHIRLPOOL',
    abilityDesc: 'Conjure a raging vortex pulling nearby enemies inward and crushing them.',
    abilityCooldownTicks: 150,
    abilityMaxCharges: 1,
    powerName: 'SNARE OVERLOAD',
    powerDesc: 'Trigger a shattering electro-trap shockwave that stuns and detonates trapped foes.',
    powerChargeRequired: 105,
    powerDurationTicks: 300,
    accentColor: '#00bbf9',
    skillNodeIds: ['trulls_bigger_pool', 'trulls_acid_pool', 'trulls_sweeping_blow'],
  },
  {
    id: 'stellan',
    sourceKey: 'Goblin',
    name: 'STELLAN',
    title: 'THE SCREWBALL',
    spriteKey: 'outcast_stellan',
    maxHp: 95,
    moveSpeed: 2.55,
    startingWeaponUniqueId: 1060, // POP GUN
    secondaryWeaponUniqueId: 1125, // NAILGUN
    abilityName: 'BALL OF DOOM',
    abilityDesc: 'Spin a spiked wrecking ball that pulverizes enemies, walls, and incoming projectiles.',
    abilityCooldownTicks: 135,
    abilityMaxCharges: 1,
    powerName: 'WRECKING FRENZY',
    powerDesc: 'Unleash oversized hyper-speed wrecking balls orbiting at devastating velocity.',
    powerChargeRequired: 95,
    powerDurationTicks: 330,
    accentColor: '#80ed99',
    skillNodeIds: ['stellan_wrecking_hour', 'stellan_counterattack', 'stellan_overdrive'],
  },
  {
    id: 'hilda',
    sourceKey: 'Dryad',
    name: 'HILDA',
    title: 'THE DRUID',
    spriteKey: 'outcast_hilda',
    maxHp: 105,
    moveSpeed: 2.4,
    startingWeaponUniqueId: 1126, // HOMING BOLTER
    secondaryWeaponUniqueId: 1000, // DAGGER
    abilityName: 'SUMMON SEEDLING',
    abilityDesc: 'Summon an obedient seedling companion that follows you and assaults enemies.',
    abilityCooldownTicks: 140,
    abilityMaxCharges: 2,
    powerName: 'OVERGROWTH',
    powerDesc: 'Burst-heal yourself while unleashing an enraged swarm of thorn-firing seedlings.',
    powerChargeRequired: 100,
    powerDurationTicks: 390,
    accentColor: '#52b788',
    skillNodeIds: ['hilda_seedling_fervor', 'hilda_seedling_bark', 'hilda_roots'],
  },
] as const;

export const SKINS: readonly SkinDef[] = [
  {
    id: 'original',
    sourceKey: 'skin_original',
    name: 'ORIGINAL',
    unlockCondition: 'Unlocked by default',
    paletteSwap: ['#e6edf3', '#38bdf8', '#f59e0b'],
  },
  {
    id: 'wastelander',
    sourceKey: 'skin_wastelander',
    name: 'WASTELANDER',
    unlockCondition: 'Clear Bandit Canyon in Act 1',
    paletteSwap: ['#d9a066', '#8f563b', '#ff6b35'],
  },
  {
    id: 'frost_walker',
    sourceKey: 'skin_frost_walker',
    name: 'FROST WALKER',
    unlockCondition: 'Defeat Queen Skadi in Jotunheim',
    paletteSwap: ['#caf0f8', '#00b4d8', '#03045e'],
  },
  {
    id: 'warlord',
    sourceKey: 'skin_warlord',
    name: 'WARLORD',
    unlockCondition: 'Defeat Irradiated Fenrir in Fenrir\'s Den',
    paletteSwap: ['#ff4d6d', '#590d22', '#ffd166'],
  },
  {
    id: 'fire_walker',
    sourceKey: 'skin_fire_walker',
    name: 'FIRE WALKER',
    unlockCondition: 'Defeat Surtur in Muspelheim',
    paletteSwap: ['#ff9e00', '#e01e37', '#370617'],
  },
  {
    id: 'snakecharmer',
    sourceKey: 'skin_snakecharmer',
    name: 'SNAKECHARMER',
    unlockCondition: 'Defeat Loki\'s Body in the Lost Temple',
    paletteSwap: ['#80ed99', '#22577a', '#c77dff'],
  },
  {
    id: 'ascended',
    sourceKey: 'skin_ascended',
    name: 'ASCENDED',
    unlockCondition: 'Defeat Hel in Helheim',
    paletteSwap: ['#e0aaff', '#7b2cbf', '#00f5d4'],
  },
  {
    id: 'champion',
    sourceKey: 'skin_champion',
    name: 'CHAMPION',
    unlockCondition: 'Clear the Arena or reach Loop 1',
    paletteSwap: ['#ffd700', '#b8860b', '#ffffff'],
  },
  {
    id: 'overlord',
    sourceKey: 'skin_overlord',
    name: 'OVERLORD',
    unlockCondition: 'Clear a run with 2+ Run Modifiers active',
    paletteSwap: ['#ff006e', '#240046', '#ffbe0b'],
  },
  {
    id: 'krunkedslayer',
    sourceKey: 'skin_krunkedslayer',
    name: 'KRUNKEDSLAYER',
    unlockCondition: 'Slay Corrupted Krunked at Balder\'s Shrine',
    paletteSwap: ['#00ff9f', '#ff2a85', '#120428'],
  },
] as const;

export const OUTCAST_BY_ID: ReadonlyMap<OutcastId, OutcastDef> = new Map(
  OUTCASTS.map((o) => [o.id, o]),
);

export const SKIN_BY_ID: ReadonlyMap<SkinId, SkinDef> = new Map(
  SKINS.map((s) => [s.id, s]),
);

export function getOutcastDef(id: OutcastId): OutcastDef {
  return OUTCAST_BY_ID.get(id) ?? OUTCASTS[0];
}

export function getSkinDef(id: SkinId): SkinDef {
  return SKIN_BY_ID.get(id) ?? SKINS[0];
}
