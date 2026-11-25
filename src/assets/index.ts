// ============================================================================
// KRUNKEDFALL — Assets Module Barrel
// ============================================================================

export {
  PixelSurface,
  AtlasPacker,
  INK_OUTLINE,
  INK_DARK,
  TRANSPARENT,
  hexToRgba,
  shadeColor,
  mixColor,
  pixelHash,
  type RGBA,
  type PackedAtlasPage,
  type PackedFramePlacement,
} from './pixelArtGen';

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
