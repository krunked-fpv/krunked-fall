// ============================================================================
// KRUNKEDFALL — Render Module Barrel
// ============================================================================

export {
  FX_MODE_NORMAL,
  FX_MODE_GOLDEN,
  FX_MODE_BIFROST,
  FX_MODE_LAVA,
  FX_MODE_WATER,
  FX_MODE_OVERDRIVE,
  FX_MODE_SHADOW,
  FX_MODE_GIB_GLOW,
  createShaderSuite,
  type CompiledProgram,
  type ShaderSuite,
} from './shaders';

export { SpriteBatch, makeOrthoMatrix, type BlendMode } from './spriteBatch';

export {
  PackManager,
  getBuiltinPackManifest,
  type ResolvedSprite,
  type CustomPackImportResult,
} from './packManager';

export {
  WebGL2Renderer,
  type ViewportRect,
  type RendererDataResolvers,
} from './webglRenderer';
