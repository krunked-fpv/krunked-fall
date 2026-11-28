// ============================================================================
// KRUNKEDFALL — Assets Module Barrel
// ============================================================================

export {
  PixelSurface,
  AtlasPacker,
  INK_OUTLINE,
  INK_DARK,
  TRANSPARENT,
  RAMPS,
  hexToRgba,
  makeRamp,
  sampleRamp,
  shadeColor,
  mixColor,
  bayer4,
  pixelHash,
  valueNoise2D,
  tileableNoise2D,
  type RGBA,
  type ColorRamp,
  type PackedAtlasPage,
  type PackedFramePlacement,
} from './pixelArtGen';

export {
  BIOME_ART_FAMILIES,
  resolveBiomeArtFamily,
  type BiomeArtFamily,
  type WorldPropKind,
} from './biomeTilesets';

export {
  BITMAP_FONT_GLYPHS,
  getBuiltinFontAtlas,
  measurePixelText,
  type BitmapFontAtlas,
  type BitmapGlyphRect,
} from './bitmapFont';

export {
  buildBuiltinPackPages,
  getBuiltinPackManifest,
  selectWeaponArchetypeKey,
  WEAPON_ARCHETYPE_KEYS,
  type BuiltinPackData,
  type WeaponArchetypeKey,
} from './builtinPack';
