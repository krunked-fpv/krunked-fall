// ============================================================================
// KRUNKEDFALL — 100% Original Heavy-Metal Built-In Krunked Pixel-Art Pack
// ============================================================================
// Assembles our studio-grade 2048x2048 packed RGBA atlases from:
//   - biomeTilesets.ts  (8 biome families, 16-state autotiled walls, 3D faces,
//                        organic seamless floors, hazards, blast craters & props)
//   - actorsArt.ts      (8 chunky 34x34 Outcasts, 22 enemy archetypes 30..54px,
//                        22 oversized heavy-metal weapons + gold, comic VFX)
//   - bossesAndHubArt.ts (6 colossal 104..116px 2-phase Norse bosses, 128x128
//                        Bifrost Rune Amphitheater, 8 Hub shrines, 320x180 title vista)
// 100% DOM-free & deterministic: runs identically in Node (Gate A) and WebGL2.

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type PackManifest,
  type SpriteFrameMeta,
  type SpriteMeta,
} from '../contracts/index';
import {
  AtlasPacker,
  INK_OUTLINE,
  PixelSurface,
  RAMPS,
  hexToRgba,
  type PackedAtlasPage,
  type RGBA,
} from './pixelArtGen';
import {
  BIOME_ART_FAMILIES,
  drawBiomeBedrockTile,
  drawBiomeFloorTile,
  drawBiomeWallCapAutotile,
  drawBiomeWallFaceTile,
  drawBlastCraterDecal,
  drawEnhancedCrate,
  drawEnhancedLavaTile,
  drawEnhancedWaterTile,
  drawRichBloodSplat,
  drawWorldProp,
  type WorldPropKind,
} from './biomeTilesets';
import {
  ENEMY_VISUAL_KINDS,
  OUTCAST_ART_SPECS,
  WEAPON_ARCHETYPE_KEYS,
  WEAPON_ART_BLUEPRINTS,
  drawCasingHQ,
  drawCompanionSpriteHQ,
  drawEnemyFrameHQ,
  drawExplosionFrameHQ,
  drawFrostCrystalHQ,
  drawGibChunkHQ,
  drawMuzzleFlashHQ,
  drawOutcastFrameHQ,
  drawPickupSpriteHQ,
  drawProjectileSpriteHQ,
  drawWeaponSpriteHQ,
  selectWeaponArchetypeKey,
  type WeaponArchetypeKey,
} from './actorsArt';
import {
  drawBifrostAmphitheaterHQ,
  drawBifrostCombatPortalHQ,
  drawBossFrameHQ,
  drawHubLandmarkHQ,
  drawTitleVista320x180,
  type BossKind,
  type HubLandmarkKind,
} from './bossesAndHubArt';

export { WEAPON_ARCHETYPE_KEYS, selectWeaponArchetypeKey, type WeaponArchetypeKey };

export interface BuiltinPackData {
  manifest: PackManifest;
  pages: PackedAtlasPage[];
}

function drawWallCrackOverlay(heavy: boolean): PixelSurface {
  const s = new PixelSurface(16, 16);
  const dark: RGBA = [12, 9, 18, 240];
  const edge: RGBA = [245, 226, 196, 175];
  s.drawLine(2, 2, 7, 7, dark);
  s.drawLine(7, 7, 13, 12, dark);
  s.drawLine(7, 7, 4, 13, dark);
  s.setPx(3, 2, edge);
  s.setPx(8, 7, edge);
  if (heavy) {
    s.drawLine(13, 2, 7, 7, dark);
    s.drawLine(2, 9, 7, 8, dark);
    s.drawLine(11, 14, 7, 7, dark);
    s.fillRect(5, 5, 4, 4, [16, 11, 22, 248]);
    s.setPx(7, 7, [255, 198, 92, 230]);
  }
  return s;
}

function drawRubbleTile(variant: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  s.drawPart((p) => {
    const ox = variant === 0 ? 0 : 2;
    p.drawRampPolygon([[2 + ox, 4], [7 + ox, 3], [8 + ox, 7], [3 + ox, 8]], RAMPS.iron);
    p.drawRampPolygon([[9 - ox, 9], [14 - ox, 8], [15 - ox, 13], [8 - ox, 14]], RAMPS.steel);
    p.drawRampPolygon([[2, 11], [6, 10], [7, 14], [3, 14]], RAMPS.iron);
    p.drawLine(3, 13, 12, 5, RAMPS.rust[3]); // protruding bent rebar
  });
  return s;
}

function drawSoftShadow(): PixelSurface {
  const s = new PixelSurface(28, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 28; x++) {
      const nx = (x - 13.5) / 13;
      const ny = (y - 7.5) / 7;
      const d = Math.hypot(nx, ny);
      if (d <= 1.0) {
        const a = d < 0.78 ? 255 : Math.round((1 - (d - 0.78) / 0.22) * 255);
        s.setPx(x, y, [8, 6, 16, a]);
      }
    }
  }
  return s;
}

function drawHudCrosshair(): PixelSurface {
  const s = new PixelSurface(18, 18);
  const w: RGBA = [255, 255, 255, 255];
  const cyan = hexToRgba('#48f0ff');
  s.fillRect(8, 1, 2, 5, w);
  s.fillRect(8, 12, 2, 5, w);
  s.fillRect(1, 8, 5, 2, w);
  s.fillRect(12, 8, 5, 2, w);
  s.fillRect(8, 8, 2, 2, cyan);
  s.applyOutline(INK_OUTLINE);
  return s;
}

function drawHudHeart(full: boolean): PixelSurface {
  const s = new PixelSurface(16, 16);
  const ramp = full ? RAMPS.crimson : RAMPS.iron;
  s.drawPart((p) => {
    p.drawRampEllipse(5.5, 6, 3.6, 3.6, ramp, full);
    p.drawRampEllipse(10.5, 6, 3.6, 3.6, ramp, full);
    p.drawRampPolygon([[2, 7], [14, 7], [8, 14]], ramp);
    if (full) p.fillRect(4, 4, 2, 2, [255, 255, 255, 255]);
  });
  return s;
}

// ============================================================================
// ATLAS ASSEMBLY & CACHING (2048x2048 SHELF PACKED PAGES)
// ============================================================================

let cachedBuiltinPack: BuiltinPackData | null = null;

function buildPackInternal(): BuiltinPackData {
  const packer = new AtlasPacker(2048);
  const sprites: Record<string, SpriteMeta> = {};
  const spriteIdToName: Record<string, string> = {};
  const logicalAliases: Record<string, string> = {};
  let nextId = 1;

  const registerSprite = (
    name: string,
    frames: PixelSurface[],
    originX: number,
    originY: number,
  ): void => {
    const id = nextId++;
    const w = frames[0].width;
    const h = frames[0].height;
    const frameMetas: SpriteFrameMeta[] = frames.map((surf) => {
      const placed = packer.pack(surf);
      return {
        page: placed.page,
        srcX: placed.x,
        srcY: placed.y,
        srcW: placed.width,
        srcH: placed.height,
        tgtX: 0,
        tgtY: 0,
        tgtW: placed.width,
        tgtH: placed.height,
        boundW: w,
        boundH: h,
      };
    });
    sprites[name] = {
      id,
      name,
      width: w,
      height: h,
      originX,
      originY,
      bbox: [0, w, h, 0],
      frames: frameMetas,
    };
    spriteIdToName[String(id)] = name;
  };

  // 1. Utility white pixel, shadow, rich decals, blast craters, casings, gibs
  const whitePx = new PixelSurface(4, 4);
  whitePx.fillRect(0, 0, 4, 4, [255, 255, 255, 255]);
  registerSprite('fx_white_1x1', [whitePx], 2, 2);
  registerSprite('fx_shadow', [drawSoftShadow()], 14, 8);
  registerSprite(
    'fx_decal_splat',
    [0, 1, 2, 3].map((v) => drawRichBloodSplat(v)),
    12,
    12,
  );
  registerSprite('fx_decal_scorch', [drawBlastCraterDecal()], 16, 16);
  registerSprite('fx_casing', [drawCasingHQ()], 5, 3);
  registerSprite(
    'fx_gib_chunk',
    [0, 1, 2, 3].map((v) => drawGibChunkHQ(v)),
    6,
    6,
  );

  // 2. All 8 Outcasts (34x34 chunky heavy-metal heroes, 4 frames each)
  for (const spec of OUTCAST_ART_SPECS) {
    registerSprite(
      spec.key,
      [0, 1, 2, 3].map((f) => drawOutcastFrameHQ(spec, f)),
      17,
      31,
    );
    logicalAliases[spec.key] = spec.key;
  }

  // 3. All 6 Two-Phase Colossal Mechanical Norse Bosses (104x104 .. 116x112, 4 frames each!)
  const bossKinds: readonly BossKind[] = ['fenrir', 'skadi', 'loki_body', 'hel', 'surtur', 'krunked'];
  for (const b of bossKinds) {
    const p1Frames = [0, 1, 2, 3].map((f) => drawBossFrameHQ(b, false, f));
    const p2Frames = [0, 1, 2, 3].map((f) => drawBossFrameHQ(b, true, f));
    const bw = p1Frames[0].width;
    const bh = p1Frames[0].height;
    const p1Key = `boss_${b}_p1`;
    const p2Key = `boss_${b}_p2`;
    registerSprite(p1Key, p1Frames, Math.floor(bw / 2), bh - 8);
    registerSprite(p2Key, p2Frames, Math.floor(bw / 2), bh - 8);
    logicalAliases[p1Key] = p1Key;
    logicalAliases[p2Key] = p2Key;
  }

  // 4. All 22 Enemy Archetypes (30x30 .. 54x54, 4 frames each!)
  for (const ek of ENEMY_VISUAL_KINDS) {
    const frames = [0, 1, 2, 3].map((f) => drawEnemyFrameHQ(ek, f));
    const ew = frames[0].width;
    const eh = frames[0].height;
    registerSprite(ek, frames, Math.floor(ew / 2), eh - 4);
    logicalAliases[ek] = ek;
  }

  // 5. Weapons (22 chunky heavy-metal archetypes + golden variants + wep_1000..wep_1300 aliases)
  for (const bp of WEAPON_ART_BLUEPRINTS) {
    registerSprite(bp.key, [drawWeaponSpriteHQ(bp, false)], bp.originX, bp.originY);
    registerSprite(`${bp.key}_gold`, [drawWeaponSpriteHQ(bp, true)], bp.originX, bp.originY);
    logicalAliases[bp.key] = bp.key;
  }
  for (let uid = 1000; uid <= 1300; uid++) {
    const archKey = WEAPON_ARCHETYPE_KEYS[(uid - 1000) % WEAPON_ARCHETYPE_KEYS.length];
    logicalAliases[`wep_${uid}`] = archKey;
  }

  // 6. All 8 Biome Tileset Packs (8 floor variants + 16 autotile wall masks + 4 wall faces + bedrock!)
  for (const fam of BIOME_ART_FAMILIES) {
    const floorKey = `tile_floor_${fam}`;
    registerSprite(
      floorKey,
      [0, 1, 2, 3, 4, 5, 6, 7].map((v) => drawBiomeFloorTile(fam, v)),
      0,
      0,
    );
    logicalAliases[floorKey] = floorKey;

    // 16-state cardinal autotile wall caps (0..15) stored as 16 frames on `tile_wall_auto_<fam>`!
    const wallAutoKey = `tile_wall_auto_${fam}`;
    registerSprite(
      wallAutoKey,
      Array.from({ length: 16 }, (_, mask) => drawBiomeWallCapAutotile(fam, mask)),
      0,
      0,
    );
    logicalAliases[wallAutoKey] = wallAutoKey;
    logicalAliases[`tile_wall_${fam}`] = wallAutoKey;

    const faceKey = `tile_wall_face_${fam}`;
    registerSprite(
      faceKey,
      [0, 1, 2, 3].map((v) => drawBiomeWallFaceTile(fam, v)),
      0,
      0,
    );
    logicalAliases[faceKey] = faceKey;

    const bedrockKey = `tile_bedrock_${fam}`;
    registerSprite(bedrockKey, [drawBiomeBedrockTile(fam)], 0, 0);
    logicalAliases[bedrockKey] = bedrockKey;
  }

  // Generic default tile keys (used by Gate A & fallbacks)
  logicalAliases.tile_floor = 'tile_floor_canyon';
  logicalAliases.tile_wall = 'tile_wall_auto_canyon';
  logicalAliases.tile_wall_face = 'tile_wall_face_canyon';
  logicalAliases.tile_bedrock = 'tile_bedrock_canyon';

  registerSprite('tile_wall_broken', [drawWallCrackOverlay(false), drawWallCrackOverlay(true)], 0, 0);
  registerSprite('tile_rubble', [drawRubbleTile(0), drawRubbleTile(1)], 8, 8);
  registerSprite('tile_crate', [drawEnhancedCrate(0), drawEnhancedCrate(1)], 10, 18);
  registerSprite(
    'tile_lava',
    [0, 1, 2, 3].map((f) => drawEnhancedLavaTile(f)),
    0,
    0,
  );
  registerSprite(
    'tile_water',
    [0, 1, 2, 3].map((f) => drawEnhancedWaterTile(f, false)),
    0,
    0,
  );
  registerSprite(
    'tile_acid',
    [0, 1, 2, 3].map((f) => drawEnhancedWaterTile(f, true)),
    0,
    0,
  );
  for (const tk of ['tile_wall_broken', 'tile_rubble', 'tile_crate', 'tile_lava', 'tile_water', 'tile_acid']) {
    logicalAliases[tk] = tk;
  }

  // 7. Cosmetic World Storytelling Props & Animated Fire Braziers!
  registerSprite(
    'prop_brazier',
    [0, 1, 2, 3].map((f) => drawWorldProp('prop_brazier', f)),
    11,
    25,
  );
  const staticProps: readonly WorldPropKind[] = [
    'prop_rusted_car',
    'prop_tech_pad',
    'prop_snow_drift',
    'prop_skull_pile',
    'prop_moss_cluster',
    'prop_sewer_grate',
    'prop_ember_vent',
    'prop_broken_pillar',
    'prop_bone_fragments',
  ];
  for (const pk of staticProps) {
    const surf = drawWorldProp(pk, 0);
    registerSprite(pk, [surf], Math.floor(surf.width / 2), Math.floor(surf.height / 2));
    logicalAliases[pk] = pk;
  }
  logicalAliases.prop_brazier = 'prop_brazier';

  // 8. FX, Companions & Monumental Bifrost Portals!
  registerSprite('fx_muzzle_flash', [0, 1, 2].map((f) => drawMuzzleFlashHQ(f)), 3, 12);
  registerSprite('fx_explosion', [0, 1, 2, 3, 4, 5].map((f) => drawExplosionFrameHQ(f)), 36, 36);
  registerSprite('fx_bifrost', [0, 1, 2, 3].map((f) => drawBifrostCombatPortalHQ(f)), 22, 22);
  registerSprite('hub_bifrost_ring', [0, 1, 2, 3].map((f) => drawBifrostAmphitheaterHQ(f)), 64, 64);
  registerSprite('fx_frost_crystal', [0, 1, 2, 3].map((f) => drawFrostCrystalHQ(f)), 14, 30);
  registerSprite('fx_turret', [0, 1].map((f) => drawCompanionSpriteHQ('turret', f)), 12, 20);
  registerSprite('fx_drill', [0, 1, 2].map((f) => drawCompanionSpriteHQ('drill', f)), 13, 9);
  registerSprite('fx_seedling', [0, 1, 2, 3].map((f) => drawCompanionSpriteHQ('seedling', f)), 11, 19);
  registerSprite('fx_whirlpool', [0, 1, 2, 3].map((f) => drawCompanionSpriteHQ('whirlpool', f)), 18, 18);
  registerSprite('fx_doom_ball', [0, 1].map((f) => drawCompanionSpriteHQ('doom_ball', f)), 13, 13);
  registerSprite('fx_gun_drone', [0, 1].map((f) => drawCompanionSpriteHQ('gun_drone', f)), 11, 13);

  // 9. Pickups & HUD Icons
  registerSprite('hud_crosshair', [drawHudCrosshair()], 9, 9);
  registerSprite('hud_heart', [drawHudHeart(true), drawHudHeart(false)], 8, 8);
  registerSprite('pickup_hp', [drawPickupSpriteHQ('hp', 0)], 10, 15);
  registerSprite('pickup_ammo', [drawPickupSpriteHQ('ammo', 0)], 10, 15);
  registerSprite('pickup_gold', [drawPickupSpriteHQ('gold', 0)], 10, 15);
  registerSprite('pickup_xp', [drawPickupSpriteHQ('xp', 0)], 10, 15);
  registerSprite('pickup_weapon', [drawPickupSpriteHQ('weapon', 0)], 10, 15);
  registerSprite('pickup_mod', [drawPickupSpriteHQ('mod', 0)], 10, 15);
  registerSprite('pickup_chest', [drawPickupSpriteHQ('chest', 0), drawPickupSpriteHQ('chest', 1)], 10, 16);

  // 10. Monumental Hub Landmarks (All 8 distinct Outpost shrines!)
  const hubKinds: readonly [string, HubLandmarkKind][] = [
    ['hub_loki', 'loki'],
    ['hub_jotunn', 'jotunn'],
    ['hub_yggdrasil', 'yggdrasil'],
    ['hub_modifiers', 'modifiers'],
    ['hub_weapondex', 'weapondex'],
    ['hub_enemydex', 'enemydex'],
    ['hub_challenges', 'challenges'],
    ['hub_dummy', 'dummy'],
  ];
  for (const [key, kind] of hubKinds) {
    const frames = [0, 1].map((f) => drawHubLandmarkHQ(kind, f));
    registerSprite(key, frames, Math.floor(frames[0].width / 2), frames[0].height - 4);
    logicalAliases[key] = key;
  }

  // 11. Bold Comic-Book Projectiles
  registerSprite('proj_bullet', [drawProjectileSpriteHQ('bullet')], 14, 7);
  registerSprite('proj_shell', [drawProjectileSpriteHQ('shell')], 13, 7);
  registerSprite('proj_bolt', [drawProjectileSpriteHQ('bolt')], 14, 7);
  registerSprite('proj_energy', [drawProjectileSpriteHQ('energy')], 12, 7);
  registerSprite('proj_rocket', [drawProjectileSpriteHQ('rocket')], 14, 7);
  registerSprite('proj_frost', [drawProjectileSpriteHQ('frost')], 14, 7);
  registerSprite('proj_enemy', [drawProjectileSpriteHQ('enemy')], 8, 8);

  // 12. Epic 320x180 Hand-Crafted Pixel-Art Title Screen Panorama!
  registerSprite('title_vista_px', [drawTitleVista320x180()], 0, 0);
  logicalAliases.title_vista_px = 'title_vista_px';

  for (const k of [
    'fx_muzzle_flash',
    'fx_explosion',
    'fx_bifrost',
    'hub_bifrost_ring',
    'fx_frost_crystal',
    'fx_turret',
    'fx_drill',
    'fx_seedling',
    'fx_whirlpool',
    'fx_doom_ball',
    'fx_gun_drone',
    'hud_crosshair',
    'hud_heart',
    'pickup_hp',
    'pickup_ammo',
    'pickup_gold',
    'pickup_xp',
    'pickup_weapon',
    'pickup_mod',
    'pickup_chest',
    'proj_bullet',
    'proj_shell',
    'proj_bolt',
    'proj_energy',
    'proj_rocket',
    'proj_frost',
    'proj_enemy',
  ]) {
    logicalAliases[k] = k;
  }

  // Register logical built-in synth music, ambience & sound keys so Gate A resolves 100% cleanly
  const musicKeys = [
    'music_menu', 'music_hub', 'music_worldmap', 'music_arena', 'music_canyon',
    'music_ashwastes', 'music_bladeyard', 'music_darkcity', 'music_deadlands',
    'music_garage', 'music_jotunheim', 'music_helheim', 'music_militarybase',
    'music_mosslab', 'music_mushroomcave', 'music_muspelheim', 'music_lavaland',
    'music_forest', 'music_pineforest', 'music_safespace', 'music_saltpan',
    'music_sandcave', 'music_sandcity', 'music_secretshop', 'music_sewer',
    'music_losttemple', 'music_shrine', 'music_stonyfield', 'music_subway',
    'music_cindercity', 'music_redhall', 'music_sulfurlake', 'music_trenches',
    'music_vikingdungeon', 'music_wildcity', 'music_snowstorm_heavy',
    'music_snowstorm_light', 'music_shop', 'ambience_city', 'ambience_desert',
    'ambience_hub', 'ambience_jotunheim', 'ambience_sewer',
    'music_fenrir_intro', 'music_fenrir_a', 'music_fenrir_b', 'music_fenrir_outro',
    'music_skadi_intro', 'music_skadi_a', 'music_skadi_b', 'music_skadi_outro',
    'music_loki_body_intro', 'music_loki_body_a', 'music_loki_body_b', 'music_loki_body_outro',
    'music_hel_intro', 'music_hel_a', 'music_hel_b', 'music_hel_outro',
    'music_surtur_intro', 'music_surtur_a', 'music_surtur_b', 'music_surtur_outro',
    'music_krunked_intro', 'music_krunked_a', 'music_krunked_b', 'music_krunked_outro',
  ];
  const music: Record<string, string> = {};
  for (const mk of musicKeys) {
    music[mk] = `synth://${mk}`;
    logicalAliases[mk] = mk;
  }

  const sounds: Record<string, { file: string; volume: number; pitch: number }> = {};
  const soundIdToName: Record<string, string> = {};
  for (let uid = 1000; uid <= 1300; uid++) {
    for (const suffix of ['fire', 'equip', 'reload'] as const) {
      const sk = `sfx_wep_${uid}_${suffix}`;
      sounds[sk] = { file: `synth://${sk}`, volume: suffix === 'fire' ? 0.85 : 0.65, pitch: 1.0 };
      logicalAliases[sk] = sk;
    }
  }

  const pages = packer.finalize();
  const manifest: PackManifest = {
    version: 1,
    packType: 'builtin',
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    pageCount: pages.length,
    pages: pages.map((p) => ({
      index: p.index,
      file: `builtin://page_${String(p.index).padStart(3, '0')}`,
      width: p.width,
      height: p.height,
    })),
    sprites,
    spriteIdToName,
    sounds,
    soundIdToName,
    music,
    fonts: {
      krunked_pixel: 'builtin://bitmap_font_5x7',
    },
    logicalAliases,
  };

  return { manifest, pages };
}

export function buildBuiltinPackPages(): BuiltinPackData {
  if (!cachedBuiltinPack) {
    cachedBuiltinPack = buildPackInternal();
  }
  return cachedBuiltinPack;
}

export function getBuiltinPackManifest(): PackManifest {
  return buildBuiltinPackPages().manifest;
}
