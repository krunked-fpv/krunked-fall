// ============================================================================
// KRUNKEDFALL — Declarative Data Barrel & Asset Key Collector
// ============================================================================
// Pure TypeScript exports — zero DOM globals, deterministic, zero raw retail paths.

export * from './weapons.js';
export * from './mods.js';
export * from './outcasts.js';
export * from './skillTrees.js';
export * from './enemies.js';
export * from './bosses.js';
export * from './biomes.js';
export * from './overworld.js';
export * from './localization.js';

import { WEAPONS } from './weapons.js';
import { MODS } from './mods.js';
import { OUTCASTS } from './outcasts.js';
import { ENEMIES } from './enemies.js';
import { BOSSES } from './bosses.js';
import { OVERWORLD_NODES } from './overworld.js';

export interface LogicalAssetKeyInventory {
  sprites: string[];
  sounds: string[];
  music: string[];
}

const CORE_SPRITE_KEYS: readonly string[] = [
  'tile_floor',
  'tile_wall',
  'tile_wall_broken',
  'tile_bedrock',
  'tile_rubble',
  'tile_crate',
  'tile_lava',
  'tile_water',
  'fx_muzzle_flash',
  'fx_explosion',
  'fx_bifrost',
  'fx_frost_crystal',
  'fx_turret',
  'fx_drill',
  'fx_seedling',
  'fx_whirlpool',
  'fx_doom_ball',
  'hud_crosshair',
  'hud_heart',
  'pickup_hp',
  'pickup_ammo',
  'pickup_gold',
  'pickup_xp',
  'pickup_weapon',
  'pickup_mod',
  'pickup_chest',
  'hub_loki',
  'hub_jotunn',
  'hub_yggdrasil',
  'hub_dummy',
  'proj_bullet',
  'proj_shell',
  'proj_bolt',
  'proj_energy',
  'proj_rocket',
  'proj_frost',
  'proj_enemy',
];

const CORE_MUSIC_KEYS: readonly string[] = [
  'music_menu',
  'music_hub',
  'music_worldmap',
];

/**
 * Collects every logical sprite, sound, and music key referenced across
 * all declarative registries in src/data/** for Gate A asset verification.
 */
export function collectAllLogicalAssetKeys(): LogicalAssetKeyInventory {
  const sprites = new Set<string>(CORE_SPRITE_KEYS);
  const sounds = new Set<string>();
  const music = new Set<string>(CORE_MUSIC_KEYS);

  for (const w of WEAPONS) {
    sprites.add(w.spriteKey);
    sprites.add(w.flashSpriteKey);
    sprites.add(w.crosshairSpriteKey);
    if (w.soundFire.soundKey) sounds.add(w.soundFire.soundKey);
    if (w.soundEquip.soundKey) sounds.add(w.soundEquip.soundKey);
    if (w.soundReload.soundKey) sounds.add(w.soundReload.soundKey);
  }

  for (const m of MODS) {
    sprites.add(m.iconKey);
  }

  for (const o of OUTCASTS) {
    sprites.add(o.spriteKey);
  }

  for (const e of ENEMIES) {
    sprites.add(e.spriteKey);
  }

  for (const b of BOSSES) {
    sprites.add(b.spritePhase1Key);
    sprites.add(b.spritePhase2Key);
    music.add(b.musicKeyIntro);
    music.add(b.musicKeyA);
    music.add(b.musicKeyB);
    music.add(b.musicKeyOutro);
  }

  for (const n of OVERWORLD_NODES) {
    music.add(n.musicKey);
  }

  return {
    sprites: [...sprites].sort(),
    sounds: [...sounds].sort(),
    music: [...music].sort(),
  };
}
