// ============================================================================
// KRUNKEDFALL — 6-Pass 640x360 Multi-Pass WebGL2 Pixel-Art Renderer
// ============================================================================
// Pass 1: Scene World FBO (640x360 NEAREST) — Biome tiles, 3D walls + cracks,
//         lava/water shaders, Bifrost portal, Hub landmarks
// Pass 2: Persistent Floor Decal FBO (1024x1024 ping-pong) — Blood splatters,
//         scorch craters, acid/rad pools, spent casings, rubble, footsteps,
//         periodic smooth decay (sh_trails_fade parity)
// Pass 3: Grounded Shadow Surface FBO (640x360) — Soft unified shadows under
//         walls, entities, projectiles, pickups, companions
// Pass 4: Y-Sorted Entities, Weapons, Gore & Telegraphs — Exact (originX,Y)
//         pivots, interpAlpha / pixelSnap60, 1-tick pure-white hit flash,
//         elemental tints, held/stashed weapons, laser sights, muzzle flash,
//         slash arc ribbons, sprite-split overkill gibs, crisp pixel text
// Pass 5: Dynamic 2D Additive Lighting & Emissives FBO (640x360) — Ambient
//         biome tint + additive point lights + glowing enemy/boss eyes
// Pass 6: Screen-Space Post FX & Crisp Nearest-Neighbor Upscaler — Title Menu
//         Aurora, radial shockwave ripples, Fimbulwinter frost border & snow
//         gusts, trauma screenshake, aspect-preserving 16:9 presentation.
// ZERO per-frame GPU texture/FBO/buffer allocations.

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  TILE_SIZE,
  TileKind,
  type BiomePalette,
  type BossDef,
  type BossTelegraph,
  type CompanionState,
  type EnemyDef,
  type EnemyState,
  type PickupState,
  type RenderSettings,
  type SimEvent,
  type SimState,
  type SkinDef,
  type SkinId,
  type WeaponDef,
  type WeaponInstance,
} from '../contracts/index';
import {
  getBuiltinFontAtlas,
  measurePixelText,
  selectWeaponArchetypeKey,
} from '../assets/index';
import {
  FX_MODE_BIFROST,
  FX_MODE_GIB_GLOW,
  FX_MODE_GOLDEN,
  FX_MODE_LAVA,
  FX_MODE_NORMAL,
  FX_MODE_OVERDRIVE,
  FX_MODE_SHADOW,
  FX_MODE_WATER,
  createShaderSuite,
  type ShaderSuite,
} from './shaders';
import { SpriteBatch, makeOrthoMatrix } from './spriteBatch';
import type { PackManager, ResolvedSprite } from './packManager';

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RendererDataResolvers {
  getWeaponDef?: (uniqueId: number) => WeaponDef | undefined;
  getEnemyDef?: (defId: string) => EnemyDef | undefined;
  getBossDef?: (bossId: string) => BossDef | undefined;
  getBiomePalette?: (biomeId: string) => BiomePalette | undefined;
  getSkinDef?: (skinId: SkinId) => SkinDef | undefined;
}

interface FboTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rotation: number;
  vRot: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  a: number;
  kind: 'spark' | 'blood' | 'gib' | 'debris' | 'casing' | 'smoke' | 'rune';
  variant: number;
  stampDecalOnLand: boolean;
}

interface SlashArc {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  radius: number;
  arc: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

interface ExplosionFx {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

interface ShockwaveFx {
  active: boolean;
  worldX: number;
  worldY: number;
  radius: number;
  maxRadius: number;
  strength: number;
  life: number;
  maxLife: number;
}

interface FloatingTextFx {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  r: number;
  g: number;
  b: number;
  scale: number;
  life: number;
  maxLife: number;
}

interface FlashLightFx {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  life: number;
  maxLife: number;
}

interface DecalStamp {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  r: number;
  g: number;
  b: number;
  a: number;
  kind: 'splat' | 'scorch' | 'rubble' | 'casing' | 'step';
  variant: number;
}

interface WeatherMote {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}

interface YSortItem {
  sortY: number;
  kind: 'player' | 'enemy' | 'pickup' | 'companion' | 'crystal';
  index: number;
}

const DECAL_FBO_SIZE = 1024;
const MAX_PARTICLES = 512;
const MAX_SLASHES = 32;
const MAX_EXPLOSIONS = 32;
const MAX_SHOCKWAVES = 8;
const MAX_FLOATING_TEXTS = 64;
const MAX_FLASH_LIGHTS = 48;
const MAX_PENDING_DECALS = 256;
const WEATHER_COUNT = 110;

// ============================================================================
// COLOR & PALETTE FALLBACK HELPERS (ZERO EXTERNAL DATA DEPENDENCY REQUIRED)
// ============================================================================

const colorCache = new Map<string, [number, number, number]>();

function parseHexRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex || hex.length < 4) return fallback;
  const cached = colorCache.get(hex);
  if (cached) return cached;
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  let r = fallback[0];
  let g = fallback[1];
  let b = fallback[2];
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  }
  const out: [number, number, number] = [
    Number.isFinite(r) ? r : fallback[0],
    Number.isFinite(g) ? g : fallback[1],
    Number.isFinite(b) ? b : fallback[2],
  ];
  colorCache.set(hex, out);
  return out;
}

const DEFAULT_BIOMES: Record<string, BiomePalette> = {
  hub: {
    floorColorA: '#3e4756',
    floorColorB: '#353e4c',
    wallTopColor: '#5c697d',
    wallFaceColor: '#3a4352',
    ambientColor: [0.58, 0.62, 0.72, 1.0],
    accentGlow: [0.22, 0.92, 1.0],
    weather: 'snow',
  },
  canyon: {
    floorColorA: '#8c5f43',
    floorColorB: '#7a5138',
    wallTopColor: '#a66e49',
    wallFaceColor: '#694028',
    ambientColor: [0.68, 0.56, 0.48, 1.0],
    accentGlow: [1.0, 0.62, 0.25],
    weather: 'sand',
  },
  dunes: {
    floorColorA: '#a37b4b',
    floorColorB: '#8f6b40',
    wallTopColor: '#b88f5a',
    wallFaceColor: '#755632',
    ambientColor: [0.72, 0.64, 0.50, 1.0],
    accentGlow: [1.0, 0.78, 0.32],
    weather: 'sand',
  },
  sewer: {
    floorColorA: '#384d42',
    floorColorB: '#2e4037',
    wallTopColor: '#4c6658',
    wallFaceColor: '#293830',
    ambientColor: [0.42, 0.54, 0.46, 1.0],
    accentGlow: [0.42, 1.0, 0.35],
    weather: 'spores',
    hasWaterDistort: true,
  },
  jotunheim: {
    floorColorA: '#54738c',
    floorColorB: '#47637a',
    wallTopColor: '#7aa2bf',
    wallFaceColor: '#3d5870',
    ambientColor: [0.50, 0.64, 0.80, 1.0],
    accentGlow: [0.35, 0.92, 1.0],
    weather: 'snow',
    hasWaterDistort: true,
  },
  darkcity: {
    floorColorA: '#3b424d',
    floorColorB: '#313740',
    wallTopColor: '#566070',
    wallFaceColor: '#2d333d',
    ambientColor: [0.44, 0.52, 0.46, 1.0],
    accentGlow: [0.45, 1.0, 0.30],
    weather: 'ash',
  },
  forest: {
    floorColorA: '#3b573c',
    floorColorB: '#324a33',
    wallTopColor: '#53734f',
    wallFaceColor: '#2f452d',
    ambientColor: [0.48, 0.60, 0.50, 1.0],
    accentGlow: [0.25, 0.98, 0.60],
    weather: 'spores',
  },
  helheim: {
    floorColorA: '#3d304f',
    floorColorB: '#322642',
    wallTopColor: '#5e4878',
    wallFaceColor: '#2e203d',
    ambientColor: [0.44, 0.36, 0.60, 1.0],
    accentGlow: [0.78, 0.36, 1.0],
    weather: 'ash',
    hasWaterDistort: true,
  },
  lost_temple: {
    floorColorA: '#345448',
    floorColorB: '#2b473d',
    wallTopColor: '#667d5e',
    wallFaceColor: '#2d4034',
    ambientColor: [0.45, 0.58, 0.52, 1.0],
    accentGlow: [0.18, 1.0, 0.65],
    weather: 'spores',
  },
  muspelheim: {
    floorColorA: '#4a2b2b',
    floorColorB: '#3d2222',
    wallTopColor: '#6e3a32',
    wallFaceColor: '#381c19',
    ambientColor: [0.58, 0.38, 0.34, 1.0],
    accentGlow: [1.0, 0.42, 0.14],
    weather: 'lava',
    hasLavaLake: true,
  },
  ash_wastes: {
    floorColorA: '#4c464a',
    floorColorB: '#403b3e',
    wallTopColor: '#6b5e63',
    wallFaceColor: '#383033',
    ambientColor: [0.54, 0.46, 0.48, 1.0],
    accentGlow: [1.0, 0.52, 0.28],
    weather: 'ash',
  },
  shrine: {
    floorColorA: '#3c3e59',
    floorColorB: '#31334a',
    wallTopColor: '#7a7194',
    wallFaceColor: '#322f47',
    ambientColor: [0.48, 0.46, 0.66, 1.0],
    accentGlow: [0.30, 0.90, 1.0],
    weather: 'snow',
  },
};

const SKIN_TINTS: Record<SkinId, [number, number, number]> = {
  original: [1.0, 1.0, 1.0],
  wastelander: [1.05, 0.92, 0.78],
  frost_walker: [0.78, 0.96, 1.15],
  warlord: [1.15, 0.80, 0.78],
  fire_walker: [1.18, 0.88, 0.68],
  snakecharmer: [0.80, 1.12, 0.84],
  ascended: [1.12, 1.12, 1.25],
  champion: [1.18, 1.08, 0.74],
  overlord: [1.04, 0.78, 1.18],
  krunkedslayer: [1.22, 0.95, 1.18],
};

function resolveFallbackBiome(biomeId: string): BiomePalette {
  const key = biomeId.toLowerCase();
  if (DEFAULT_BIOMES[key]) return DEFAULT_BIOMES[key];
  if (key.includes('ice') || key.includes('cold') || key.includes('salt') || key.includes('jotun')) {
    return DEFAULT_BIOMES.jotunheim;
  }
  if (key.includes('lava') || key.includes('muspel') || key.includes('cinder') || key.includes('red') || key.includes('sulfur')) {
    return DEFAULT_BIOMES.muspelheim;
  }
  if (key.includes('hel') || key.includes('dead')) return DEFAULT_BIOMES.helheim;
  if (key.includes('forest') || key.includes('grass') || key.includes('pine') || key.includes('mush')) {
    return DEFAULT_BIOMES.forest;
  }
  if (key.includes('sewer') || key.includes('maggot')) return DEFAULT_BIOMES.sewer;
  if (key.includes('temple')) return DEFAULT_BIOMES.lost_temple;
  if (key.includes('shrine')) return DEFAULT_BIOMES.shrine;
  if (key.includes('ash') || key.includes('trench')) return DEFAULT_BIOMES.ash_wastes;
  if (key.includes('dune') || key.includes('desert') || key.includes('sand')) return DEFAULT_BIOMES.dunes;
  if (key.includes('city') || key.includes('lab') || key.includes('mil') || key.includes('sub')) {
    return DEFAULT_BIOMES.darkcity;
  }
  return DEFAULT_BIOMES.canyon;
}

function inferEnemySpriteKey(enemy: EnemyState, def?: EnemyDef): string {
  if (enemy.isBoss && enemy.bossId) {
    return `boss_${enemy.bossId}_p${enemy.bossPhase}`;
  }
  if (def?.spriteKey) return def.spriteKey;
  const id = enemy.defId.toLowerCase();
  if (id.includes('wolf') || id.includes('hound')) return 'enemy_wolf';
  if (id.includes('viking') || id.includes('berserk') || id.includes('raider')) return 'enemy_viking';
  if (id.includes('robot') || id.includes('mech') || id.includes('droid') || id.includes('drone')) return 'enemy_robot';
  if (id.includes('turret') || id.includes('cannon')) return 'enemy_turret';
  if (id.includes('giant') || id.includes('jotunn') || id.includes('brute') || id.includes('troll')) return 'enemy_giant';
  if (id.includes('spider') || id.includes('arach')) return 'enemy_spider';
  if (id.includes('roach') || id.includes('bug') || id.includes('maggot')) return 'enemy_roach';
  if (id.includes('slime') || id.includes('ooze') || id.includes('blob')) return 'enemy_slime';
  if (id.includes('rat') || id.includes('rodent') || id.includes('mouse')) return 'enemy_rat';
  if (id.includes('skel') || id.includes('draugr') || id.includes('bone')) return 'enemy_skeleton';
  if (id.includes('mimic')) return 'enemy_mimic';
  if (id.includes('bomb') || id.includes('kamikaze') || id.includes('barrel')) return 'enemy_bomber';
  if (id.includes('sniper') || id.includes('scout') || id.includes('archer')) return 'enemy_sniper';
  if (id.includes('bandit') || id.includes('scav')) return 'enemy_bandit';
  return 'enemy_default';
}

function createFbo(gl: WebGL2RenderingContext, width: number, height: number): FboTarget {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) {
    throw new Error('[Krunkedfall WebGL2] Failed to allocate FBO target');
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`[Krunkedfall WebGL2] Incomplete FBO (${width}x${height}): 0x${status.toString(16)}`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fbo, tex, width, height };
}

// ============================================================================
// MAIN WEBGL2 RENDERER CLASS
// ============================================================================

export class WebGL2Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly packManager: PackManager;
  private resolvers: RendererDataResolvers;

  private gl: WebGL2RenderingContext | null = null;
  private shaders: ShaderSuite | null = null;
  private batch: SpriteBatch | null = null;
  private emptyVao: WebGLVertexArrayObject | null = null;

  // Pre-allocated FBOs (created ONCE in init, zero per-frame allocations!)
  private sceneFbo: FboTarget | null = null;
  private decalFboA: FboTarget | null = null;
  private decalFboB: FboTarget | null = null;
  private decalActiveIndex: 0 | 1 = 0;
  private shadowFbo: FboTarget | null = null;
  private lightFbo: FboTarget | null = null;
  private litFbo: FboTarget | null = null;

  // Viewport geometry (CSS pixels for getViewportRect/screenToWorld + physical pixels for gl.viewport)
  private clientWidth = LOGICAL_WIDTH;
  private clientHeight = LOGICAL_HEIGHT;
  private dpr = 1;
  private cssViewport: ViewportRect = { x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };
  private glViewport: ViewportRect = { x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };

  // Pre-allocated matrices & uniform buffers
  private readonly worldProj = new Float32Array(16);
  private readonly decalProj = new Float32Array(16);
  private readonly shockwaveUniformData = new Float32Array(MAX_SHOCKWAVES * 4);

  // Room tracking for automatic Decal FBO clearing
  private lastRoomKey = '';
  private decalWorldW = 1024;
  private decalWorldH = 1024;
  private frameCounter = 0;
  private lastTimeSec = 0;
  private damageFlash = 0;
  private visualRng = 0x5f3759df;

  // Pre-allocated bounded FX pools (zero per-frame heap churn)
  private readonly particles: Particle[];
  private readonly slashArcs: SlashArc[];
  private readonly explosions: ExplosionFx[];
  private readonly shockwaves: ShockwaveFx[];
  private readonly floatingTexts: FloatingTextFx[];
  private readonly flashLights: FlashLightFx[];
  private readonly pendingDecals: DecalStamp[] = [];
  private readonly weather: WeatherMote[];
  private readonly ySortBuffer: YSortItem[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    packManager: PackManager,
    dataResolvers: RendererDataResolvers = {}
  ) {
    this.canvas = canvas;
    this.packManager = packManager;
    this.resolvers = dataResolvers;

    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      size: 2, rotation: 0, vRot: 0, life: 0, maxLife: 1,
      r: 1, g: 1, b: 1, a: 1, kind: 'spark', variant: 0, stampDecalOnLand: false,
    }));
    this.slashArcs = Array.from({ length: MAX_SLASHES }, () => ({
      active: false, x: 0, y: 0, angle: 0, radius: 24, arc: 1.5, life: 0, maxLife: 1, r: 1, g: 1, b: 1,
    }));
    this.explosions = Array.from({ length: MAX_EXPLOSIONS }, () => ({
      active: false, x: 0, y: 0, radius: 24, life: 0, maxLife: 1, r: 1, g: 0.6, b: 0.2,
    }));
    this.shockwaves = Array.from({ length: MAX_SHOCKWAVES }, () => ({
      active: false, worldX: 0, worldY: 0, radius: 0, maxRadius: 0.25, strength: 1, life: 0, maxLife: 1,
    }));
    this.floatingTexts = Array.from({ length: MAX_FLOATING_TEXTS }, () => ({
      active: false, x: 0, y: 0, vy: -24, text: '', r: 1, g: 1, b: 1, scale: 1, life: 0, maxLife: 1,
    }));
    this.flashLights = Array.from({ length: MAX_FLASH_LIGHTS }, () => ({
      active: false, x: 0, y: 0, radius: 48, r: 1, g: 0.8, b: 0.4, intensity: 1, life: 0, maxLife: 0.1,
    }));
    this.weather = Array.from({ length: WEATHER_COUNT }, (_, i) => ({
      x: ((i * 73) % LOGICAL_WIDTH),
      y: ((i * 137) % LOGICAL_HEIGHT),
      speed: 28 + (i % 7) * 11,
      size: i % 5 === 0 ? 2 : 1,
      phase: i * 0.61,
    }));
  }

  setDataResolvers(resolvers: RendererDataResolvers): void {
    this.resolvers = { ...this.resolvers, ...resolvers };
  }

  async init(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('[Krunkedfall WebGL2] WebGL2 context unavailable on this browser/GPU.');
    }
    this.gl = gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    this.shaders = createShaderSuite(gl);
    this.batch = new SpriteBatch(gl);
    this.emptyVao = gl.createVertexArray();

    // Allocate all 6-pass FBO targets ONCE
    this.sceneFbo = createFbo(gl, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.decalFboA = createFbo(gl, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
    this.decalFboB = createFbo(gl, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
    this.shadowFbo = createFbo(gl, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.lightFbo = createFbo(gl, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.litFbo = createFbo(gl, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    this.packManager.attachGL(gl);
    this.clearRoomDecals();

    const rect = this.canvas.getBoundingClientRect();
    const cw = rect.width > 0 ? rect.width : this.canvas.clientWidth || LOGICAL_WIDTH;
    const ch = rect.height > 0 ? rect.height : this.canvas.clientHeight || LOGICAL_HEIGHT;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.resize(cw, ch, dpr);

    this.checkGlError('init');
  }

  private checkGlError(stage: string): void {
    if (!this.gl) return;
    const err = this.gl.getError();
    if (err !== this.gl.NO_ERROR) {
      throw new Error(`[Krunkedfall WebGL2] GL error at ${stage}: 0x${err.toString(16)}`);
    }
  }

  private nextRand(): number {
    let x = this.visualRng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.visualRng = x;
    return (x >>> 0) / 4294967295;
  }

  resize(clientWidth: number, clientHeight: number, dpr: number): void {
    const cw = Math.max(1, Math.floor(clientWidth));
    const ch = Math.max(1, Math.floor(clientHeight));
    const safeDpr = Math.max(1, Math.min(4, dpr || 1));
    this.clientWidth = cw;
    this.clientHeight = ch;
    this.dpr = safeDpr;

    const backingW = Math.max(1, Math.round(cw * safeDpr));
    const backingH = Math.max(1, Math.round(ch * safeDpr));
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }

    // Aspect-preserving 16:9 letterboxed viewport (crisp integer scale when clean)
    const targetAspect = LOGICAL_WIDTH / LOGICAL_HEIGHT;
    const containerAspect = cw / ch;
    let vpW: number;
    let vpH: number;
    if (containerAspect > targetAspect) {
      vpH = ch;
      vpW = Math.round(ch * targetAspect);
    } else {
      vpW = cw;
      vpH = Math.round(cw / targetAspect);
    }
    const vpX = Math.floor((cw - vpW) * 0.5);
    const vpY = Math.floor((ch - vpH) * 0.5);

    this.cssViewport = { x: vpX, y: vpY, width: vpW, height: vpH };

    const gW = Math.max(1, Math.round(vpW * safeDpr));
    const gH = Math.max(1, Math.round(vpH * safeDpr));
    const gX = Math.floor((backingW - gW) * 0.5);
    const gY = Math.floor((backingH - gH) * 0.5);
    this.glViewport = { x: gX, y: gY, width: gW, height: gH };
  }

  getViewportRect(): ViewportRect {
    return { ...this.cssViewport };
  }

  screenToWorld(clientX: number, clientY: number, state: SimState): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const vp = this.cssViewport;
    const localX = clientX - rect.left - vp.x;
    const localY = clientY - rect.top - vp.y;
    const normX = vp.width > 0 ? localX / vp.width : 0.5;
    const normY = vp.height > 0 ? localY / vp.height : 0.5;
    const logicalX = normX * LOGICAL_WIDTH;
    const logicalY = normY * LOGICAL_HEIGHT;
    const zoom = Math.max(0.5, state.camera.zoom || 1);
    return {
      x: state.camera.x + (logicalX - LOGICAL_WIDTH * 0.5) / zoom,
      y: state.camera.y + (logicalY - LOGICAL_HEIGHT * 0.5) / zoom,
    };
  }

  clearRoomDecals(): void {
    const gl = this.gl;
    if (gl && this.decalFboA && this.decalFboB) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.decalFboA.fbo);
      gl.viewport(0, 0, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.decalFboB.fbo);
      gl.viewport(0, 0, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.decalActiveIndex = 0;
    this.pendingDecals.length = 0;
    for (let i = 0; i < this.particles.length; i++) this.particles[i].active = false;
    for (let i = 0; i < this.slashArcs.length; i++) this.slashArcs[i].active = false;
    for (let i = 0; i < this.explosions.length; i++) this.explosions[i].active = false;
    for (let i = 0; i < this.shockwaves.length; i++) this.shockwaves[i].active = false;
    for (let i = 0; i < this.flashLights.length; i++) this.flashLights[i].active = false;
    for (let i = 0; i < this.floatingTexts.length; i++) this.floatingTexts[i].active = false;
  }

  // ==========================================================================
  // EVENT INGESTION -> DECALS, GIBS, SHOCKWAVES, SLASHES, LIGHTS, FLOAT TEXT
  // ==========================================================================

  ingestEvents(events: readonly SimEvent[], _state: SimState): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'weapon_fire': {
          const muzzleX = ev.x + Math.cos(ev.angle) * 12;
          const muzzleY = ev.y + Math.sin(ev.angle) * 12;
          const col =
            ev.ammoType === 4
              ? ([0.3, 0.92, 1.0] as const)
              : ev.ammoType === 5
                ? ([1.0, 0.52, 0.18] as const)
                : ([1.0, 0.82, 0.45] as const);
          this.spawnFlashLight(muzzleX, muzzleY, 54, col[0], col[1], col[2], 1.15, 0.08);
          for (let s = 0; s < 3; s++) {
            const spread = ev.angle + (this.nextRand() - 0.5) * 0.7;
            const spd = 25 + this.nextRand() * 45;
            this.spawnParticle(
              muzzleX, muzzleY, 4,
              Math.cos(spread) * spd, Math.sin(spread) * spd, 12,
              2, 0.18, 0.75, 0.75, 0.78, 0.55, 'smoke', false
            );
          }
          break;
        }
        case 'melee_slash': {
          const rgb = parseHexRgb(ev.color, [0.95, 0.98, 1.0]);
          this.spawnSlashArc(ev.x, ev.y, ev.angle, Math.max(16, ev.radius), Math.max(0.8, ev.arc), rgb[0], rgb[1], rgb[2]);
          this.spawnFlashLight(ev.x + Math.cos(ev.angle) * 14, ev.y + Math.sin(ev.angle) * 14, 42, rgb[0], rgb[1], rgb[2], 0.85, 0.12);
          break;
        }
        case 'projectile_hit': {
          const rgb = parseHexRgb(ev.color, [1.0, 0.85, 0.4]);
          for (let p = 0; p < 5; p++) {
            const a = Math.atan2(ev.normalY, ev.normalX) + (this.nextRand() - 0.5) * 1.4;
            const spd = 40 + this.nextRand() * 90;
            this.spawnParticle(
              ev.x, ev.y, 4,
              Math.cos(a) * spd, Math.sin(a) * spd, 25 + this.nextRand() * 30,
              2, 0.22 + this.nextRand() * 0.15,
              rgb[0], rgb[1], rgb[2], 1.0, 'spark', false
            );
          }
          if (ev.isWall) {
            this.queueDecal(ev.x, ev.y, 0.45, this.nextRand() * 6.28, 0.1, 0.08, 0.1, 0.6, 'scorch', 0);
          }
          break;
        }
        case 'enemy_hit': {
          const elemCol = this.elementColor(ev.element, ev.isCrit);
          const dmgLabel = ev.isCrit ? `${Math.round(ev.damage)}!` : `${Math.round(ev.damage)}`;
          this.spawnFloatingText(
            ev.x + (this.nextRand() - 0.5) * 8,
            ev.y - 12,
            dmgLabel,
            elemCol[0], elemCol[1], elemCol[2],
            ev.isCrit ? 1.35 : 1.0,
            0.65
          );
          for (let p = 0; p < (ev.isCrit ? 8 : 4); p++) {
            const a = Math.atan2(ev.dirY, ev.dirX) + (this.nextRand() - 0.5) * 1.1;
            const spd = 45 + this.nextRand() * 85;
            this.spawnParticle(
              ev.x, ev.y, 5,
              Math.cos(a) * spd, Math.sin(a) * spd, 30 + this.nextRand() * 40,
              2, 0.35 + this.nextRand() * 0.2,
              elemCol[0], elemCol[1], elemCol[2], 0.95, 'blood', p < 2
            );
          }
          break;
        }
        case 'enemy_death': {
          const blood = parseHexRgb(ev.bloodColor, [0.82, 0.10, 0.16]);
          const splatCount = ev.isBoss ? 8 : ev.overkill ? 4 : 2;
          for (let s = 0; s < splatCount; s++) {
            this.queueDecal(
              ev.x + (this.nextRand() - 0.5) * (ev.isBoss ? 36 : 16),
              ev.y + (this.nextRand() - 0.5) * (ev.isBoss ? 28 : 12),
              (ev.isBoss ? 1.4 : 0.8) + this.nextRand() * 0.65,
              this.nextRand() * 6.28,
              blood[0], blood[1], blood[2], 0.88, 'splat',
              Math.floor(this.nextRand() * 4)
            );
          }
          // Sprite-split overkill gibs! (sh_sprite_split parity)
          const gibCount = ev.isBoss ? 20 : ev.overkill ? 12 : 4;
          const baseAng = Math.atan2(ev.dirY, ev.dirX);
          for (let g = 0; g < gibCount; g++) {
            const a = ev.overkill
              ? baseAng + (this.nextRand() - 0.5) * 2.2
              : this.nextRand() * Math.PI * 2;
            const spd = (ev.overkill ? 75 : 40) + this.nextRand() * 110;
            this.spawnParticle(
              ev.x, ev.y, 6,
              Math.cos(a) * spd, Math.sin(a) * spd, 55 + this.nextRand() * 75,
              ev.overkill ? 1.15 : 0.85,
              0.7 + this.nextRand() * 0.55,
              blood[0], blood[1], blood[2], 1.0,
              ev.overkill || ev.isBoss ? 'gib' : 'blood',
              true
            );
          }
          if (ev.overkill) {
            this.spawnShockwave(ev.x, ev.y, 0.12, 0.45, 0.25);
          }
          break;
        }
        case 'wall_crack': {
          for (let p = 0; p < 4; p++) {
            const a = this.nextRand() * Math.PI * 2;
            const spd = 20 + this.nextRand() * 45;
            this.spawnParticle(
              ev.x, ev.y, 6, Math.cos(a) * spd, Math.sin(a) * spd, 35,
              2, 0.4, 0.68, 0.66, 0.72, 0.9, 'debris', false
            );
          }
          break;
        }
        case 'wall_shatter': {
          const col = parseHexRgb(ev.color, [0.58, 0.56, 0.62]);
          this.queueDecal(ev.x, ev.y, 1.0, 0, col[0], col[1], col[2], 0.9, 'rubble', 0);
          for (let p = 0; p < 12; p++) {
            const a = this.nextRand() * Math.PI * 2;
            const spd = 35 + this.nextRand() * 85;
            this.spawnParticle(
              ev.x, ev.y, 8, Math.cos(a) * spd, Math.sin(a) * spd, 45 + this.nextRand() * 55,
              3, 0.55 + this.nextRand() * 0.3,
              col[0], col[1], col[2], 1.0, 'debris', false
            );
          }
          this.spawnShockwave(ev.x, ev.y, 0.14, 0.55, 0.28);
          break;
        }
        case 'explosion': {
          const elem = this.elementColor(ev.element, false);
          this.spawnExplosion(ev.x, ev.y, Math.max(22, ev.radius), elem[0], elem[1], elem[2]);
          this.spawnShockwave(
            ev.x,
            ev.y,
            Math.min(0.45, 0.16 + ev.radius * 0.0022),
            Math.min(1.3, 0.65 + ev.intensity * 0.5),
            0.42
          );
          this.spawnFlashLight(ev.x, ev.y, Math.max(95, ev.radius * 2.8), elem[0], elem[1], elem[2], 1.75, 0.28);
          this.queueDecal(ev.x, ev.y, Math.max(0.9, ev.radius / 18), this.nextRand() * 6.28, 1, 1, 1, 0.85, 'scorch', 0);
          if (ev.element === 'acid' || ev.element === 'radioactive') {
            this.queueDecal(ev.x, ev.y, Math.max(1.1, ev.radius / 16), this.nextRand() * 6.28, elem[0], elem[1], elem[2], 0.72, 'splat', 2);
          }
          for (let p = 0; p < 14; p++) {
            const a = this.nextRand() * Math.PI * 2;
            const spd = 50 + this.nextRand() * 130;
            this.spawnParticle(
              ev.x, ev.y, 6, Math.cos(a) * spd, Math.sin(a) * spd, 45 + this.nextRand() * 60,
              2.5, 0.35 + this.nextRand() * 0.3,
              elem[0], elem[1], elem[2], 1.0, 'spark', false
            );
          }
          break;
        }
        case 'player_hit': {
          this.damageFlash = 1.0;
          this.spawnFloatingText(ev.x, ev.y - 16, `-${Math.round(ev.damage)}`, 1.0, 0.25, 0.3, 1.2, 0.75);
          this.spawnFlashLight(ev.x, ev.y, 70, 1.0, 0.2, 0.25, 1.2, 0.18);
          break;
        }
        case 'player_death': {
          this.damageFlash = 1.0;
          this.spawnShockwave(ev.x, ev.y, 0.42, 1.2, 0.6);
          this.spawnExplosion(ev.x, ev.y, 44, 1.0, 0.2, 0.25);
          break;
        }
        case 'ability_trigger': {
          this.spawnShockwave(ev.x, ev.y, 0.16, 0.55, 0.28);
          this.spawnFlashLight(ev.x, ev.y, 72, 0.3, 0.92, 1.0, 1.1, 0.22);
          for (let p = 0; p < 10; p++) {
            const a = ev.angle + (this.nextRand() - 0.5) * 3.14;
            const spd = 40 + this.nextRand() * 75;
            this.spawnParticle(
              ev.x, ev.y, 5, Math.cos(a) * spd, Math.sin(a) * spd, 20,
              2, 0.32, 0.3, 0.92, 1.0, 0.95, 'rune', false
            );
          }
          break;
        }
        case 'power_trigger': {
          this.spawnShockwave(ev.x, ev.y, 0.34, 1.0, 0.48);
          this.spawnFlashLight(ev.x, ev.y, 120, 1.0, 0.82, 0.28, 1.6, 0.45);
          this.spawnFloatingText(ev.x, ev.y - 20, 'OVERDRIVE!', 1.0, 0.88, 0.28, 1.35, 1.0);
          break;
        }
        case 'pickup_collect': {
          const col =
            ev.kind === 'hp'
              ? ([1.0, 0.32, 0.42] as const)
              : ev.kind === 'gold'
                ? ([1.0, 0.86, 0.25] as const)
                : ev.kind === 'xp'
                  ? ([0.32, 0.92, 1.0] as const)
                  : ([0.65, 1.0, 0.55] as const);
          if (ev.label) {
            this.spawnFloatingText(ev.x, ev.y - 10, ev.label, col[0], col[1], col[2], 0.95, 0.72);
          }
          this.spawnFlashLight(ev.x, ev.y, 38, col[0], col[1], col[2], 0.75, 0.14);
          break;
        }
        case 'level_up': {
          this.spawnShockwave(ev.x, ev.y, 0.36, 0.95, 0.5);
          this.spawnFlashLight(ev.x, ev.y, 130, 1.0, 0.9, 0.35, 1.7, 0.55);
          this.spawnFloatingText(ev.x, ev.y - 22, `LEVEL ${ev.level}!`, 1.0, 0.92, 0.35, 1.45, 1.3);
          for (let p = 0; p < 16; p++) {
            const a = (p / 16) * Math.PI * 2;
            this.spawnParticle(
              ev.x, ev.y, 6, Math.cos(a) * 65, Math.sin(a) * 65, 65,
              2.5, 0.65, 1.0, 0.9, 0.3, 1.0, 'rune', false
            );
          }
          break;
        }
        case 'boss_spawn': {
          this.spawnShockwave(ev.x, ev.y, 0.42, 1.15, 0.55);
          this.spawnFlashLight(ev.x, ev.y, 160, 1.0, 0.32, 0.42, 1.6, 0.55);
          this.spawnFloatingText(ev.x, ev.y - 36, ev.name, 1.0, 0.42, 0.42, 1.35, 1.6);
          break;
        }
        case 'boss_phase2': {
          this.spawnShockwave(ev.x, ev.y, 0.48, 1.35, 0.62);
          this.spawnExplosion(ev.x, ev.y, 58, 1.0, 0.25, 0.68);
          this.spawnFlashLight(ev.x, ev.y, 190, 1.0, 0.22, 0.65, 2.0, 0.65);
          this.spawnFloatingText(ev.x, ev.y - 38, ev.name, 1.0, 0.28, 0.72, 1.45, 1.8);
          break;
        }
        case 'boss_defeated': {
          this.spawnShockwave(ev.x, ev.y, 0.52, 1.4, 0.75);
          this.spawnExplosion(ev.x, ev.y, 70, 1.0, 0.85, 0.25);
          this.spawnFlashLight(ev.x, ev.y, 210, 1.0, 0.9, 0.4, 2.2, 0.8);
          this.spawnFloatingText(ev.x, ev.y - 34, `${ev.name} SLAIN!`, 1.0, 0.92, 0.35, 1.4, 2.0);
          break;
        }
        case 'portal_open': {
          this.spawnShockwave(ev.x, ev.y, 0.32, 0.85, 0.45);
          this.spawnFlashLight(ev.x, ev.y, 120, 0.3, 0.95, 1.0, 1.6, 0.55);
          this.spawnFloatingText(ev.x, ev.y - 20, 'BIFROST OPEN', 0.42, 0.98, 1.0, 1.15, 1.4);
          break;
        }
        case 'freeze_warning': {
          this.spawnFloatingText(
            _state.player.x,
            _state.player.y - 26,
            'FIMBULWINTER!',
            0.55, 0.94, 1.0, 1.25, 1.4
          );
          break;
        }
        case 'freeze_crystal_spawn': {
          this.spawnShockwave(ev.x, ev.y, 0.16, 0.6, 0.32);
          this.spawnFlashLight(ev.x, ev.y, 84, 0.45, 0.92, 1.0, 1.35, 0.32);
          break;
        }
        case 'floating_text': {
          const col = parseHexRgb(ev.color, [1, 1, 1]);
          this.spawnFloatingText(ev.x, ev.y, ev.text, col[0], col[1], col[2], ev.scale ?? 1.0, 0.85);
          break;
        }
        case 'shell_eject': {
          this.spawnParticle(
            ev.x, ev.y, 7,
            ev.vx * 36 + (this.nextRand() - 0.5) * 18,
            ev.vy * 36 + (this.nextRand() - 0.5) * 18,
            45 + this.nextRand() * 25,
            1.0, 0.55,
            0.96, 0.78, 0.25, 1.0, 'casing', true
          );
          break;
        }
        case 'footstep': {
          this.queueDecal(ev.x, ev.y + 2, 0.32, 0, 0.08, 0.07, 0.1, 0.34, 'step', 0);
          break;
        }
        default:
          break;
      }
    }
  }

  private elementColor(elem: string, isCrit: boolean): [number, number, number] {
    if (isCrit) return [1.0, 0.92, 0.24];
    switch (elem) {
      case 'burn': return [1.0, 0.48, 0.14];
      case 'freeze': return [0.42, 0.92, 1.0];
      case 'acid': return [0.58, 1.0, 0.24];
      case 'radioactive': return [0.86, 1.0, 0.22];
      case 'explosive': return [1.0, 0.62, 0.18];
      case 'lightning': return [0.72, 0.88, 1.0];
      default: return [1.0, 1.0, 1.0];
    }
  }

  private spawnParticle(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, maxLife: number,
    r: number, g: number, b: number, a: number,
    kind: Particle['kind'], stampDecalOnLand: boolean
  ): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.size = size;
        p.rotation = this.nextRand() * 6.28;
        p.vRot = (this.nextRand() - 0.5) * 14;
        p.life = maxLife;
        p.maxLife = maxLife;
        p.r = r; p.g = g; p.b = b; p.a = a;
        p.kind = kind;
        p.variant = Math.floor(this.nextRand() * 4);
        p.stampDecalOnLand = stampDecalOnLand;
        return;
      }
    }
  }

  private spawnSlashArc(
    x: number, y: number, angle: number, radius: number, arc: number,
    r: number, g: number, b: number
  ): void {
    for (let i = 0; i < this.slashArcs.length; i++) {
      const s = this.slashArcs[i];
      if (!s.active) {
        s.active = true;
        s.x = x; s.y = y; s.angle = angle; s.radius = radius; s.arc = arc;
        s.life = 0.16; s.maxLife = 0.16;
        s.r = r; s.g = g; s.b = b;
        return;
      }
    }
  }

  private spawnExplosion(x: number, y: number, radius: number, r: number, g: number, b: number): void {
    for (let i = 0; i < this.explosions.length; i++) {
      const e = this.explosions[i];
      if (!e.active) {
        e.active = true;
        e.x = x; e.y = y; e.radius = radius;
        e.life = 0.34; e.maxLife = 0.34;
        e.r = r; e.g = g; e.b = b;
        return;
      }
    }
  }

  private spawnShockwave(
    worldX: number, worldY: number, maxRadius: number, strength: number, maxLife: number
  ): void {
    let slot = this.shockwaves[0];
    for (let i = 0; i < this.shockwaves.length; i++) {
      if (!this.shockwaves[i].active) {
        slot = this.shockwaves[i];
        break;
      }
      if (this.shockwaves[i].life < slot.life) slot = this.shockwaves[i];
    }
    slot.active = true;
    slot.worldX = worldX;
    slot.worldY = worldY;
    slot.radius = 0.01;
    slot.maxRadius = maxRadius;
    slot.strength = strength;
    slot.life = maxLife;
    slot.maxLife = maxLife;
  }

  private spawnFloatingText(
    x: number, y: number, text: string,
    r: number, g: number, b: number, scale: number, maxLife: number
  ): void {
    let slot = this.floatingTexts[0];
    for (let i = 0; i < this.floatingTexts.length; i++) {
      if (!this.floatingTexts[i].active) {
        slot = this.floatingTexts[i];
        break;
      }
      if (this.floatingTexts[i].life < slot.life) slot = this.floatingTexts[i];
    }
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vy = -26;
    slot.text = text;
    slot.r = r; slot.g = g; slot.b = b;
    slot.scale = scale;
    slot.life = maxLife;
    slot.maxLife = maxLife;
  }

  private spawnFlashLight(
    x: number, y: number, radius: number,
    r: number, g: number, b: number, intensity: number, maxLife: number
  ): void {
    for (let i = 0; i < this.flashLights.length; i++) {
      const fl = this.flashLights[i];
      if (!fl.active) {
        fl.active = true;
        fl.x = x; fl.y = y; fl.radius = radius;
        fl.r = r; fl.g = g; fl.b = b;
        fl.intensity = intensity;
        fl.life = maxLife; fl.maxLife = maxLife;
        return;
      }
    }
  }

  private queueDecal(
    x: number, y: number, scale: number, rotation: number,
    r: number, g: number, b: number, a: number,
    kind: DecalStamp['kind'], variant: number
  ): void {
    if (this.pendingDecals.length >= MAX_PENDING_DECALS) return;
    this.pendingDecals.push({ x, y, scale, rotation, r, g, b, a, kind, variant });
  }

  // ==========================================================================
  // PER-FRAME TRANSIENT FX STEP (SMOOTH AT 30 / 60 / 120 FPS)
  // ==========================================================================

  private stepVisualEffects(dt: number, weatherKind: BiomePalette['weather']): void {
    const safeDt = Math.max(0.001, Math.min(0.05, dt));
    this.damageFlash = Math.max(0, this.damageFlash - safeDt * 3.8);

    // Particles (with gravity + ground bounce + decal stamp on landing)
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= safeDt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.rotation += p.vRot * safeDt;

      if (p.kind === 'smoke') {
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.z += 12 * safeDt;
      } else {
        p.vz -= 260 * safeDt;
        p.z += p.vz * safeDt;
        if (p.z <= 0) {
          p.z = 0;
          if (Math.abs(p.vz) > 25) {
            p.vz = -p.vz * 0.42;
            p.vx *= 0.62;
            p.vy *= 0.62;
          } else {
            p.vz = 0;
            p.vx *= 0.8;
            p.vy *= 0.8;
            if (p.stampDecalOnLand) {
              p.stampDecalOnLand = false;
              if (p.kind === 'casing') {
                this.queueDecal(p.x, p.y, 1.0, p.rotation, 1, 1, 1, 0.95, 'casing', 0);
                p.active = false;
              } else if (p.kind === 'blood' || p.kind === 'gib') {
                this.queueDecal(p.x, p.y, p.kind === 'gib' ? 0.65 : 0.42, p.rotation, p.r, p.g, p.b, 0.82, 'splat', p.variant);
              }
            }
          }
        }
      }
    }

    // Slash arcs
    for (let i = 0; i < this.slashArcs.length; i++) {
      const s = this.slashArcs[i];
      if (!s.active) continue;
      s.life -= safeDt;
      if (s.life <= 0) s.active = false;
    }

    // Explosions
    for (let i = 0; i < this.explosions.length; i++) {
      const e = this.explosions[i];
      if (!e.active) continue;
      e.life -= safeDt;
      if (e.life <= 0) e.active = false;
    }

    // Shockwaves
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.life -= safeDt;
      if (sw.life <= 0) {
        sw.active = false;
      } else {
        const t = 1 - sw.life / sw.maxLife;
        sw.radius = sw.maxRadius * t;
      }
    }

    // Floating texts
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      if (!ft.active) continue;
      ft.life -= safeDt;
      if (ft.life <= 0) {
        ft.active = false;
      } else {
        ft.y += ft.vy * safeDt;
        ft.vy *= 0.92;
      }
    }

    // Transient flash lights
    for (let i = 0; i < this.flashLights.length; i++) {
      const fl = this.flashLights[i];
      if (!fl.active) continue;
      fl.life -= safeDt;
      if (fl.life <= 0) fl.active = false;
    }

    // Biome Weather particles
    if (weatherKind !== 'none') {
      for (let i = 0; i < this.weather.length; i++) {
        const w = this.weather[i];
        if (weatherKind === 'snow') {
          w.x -= w.speed * 0.65 * safeDt;
          w.y += w.speed * 0.85 * safeDt;
        } else if (weatherKind === 'rain') {
          w.x -= w.speed * 0.45 * safeDt;
          w.y += w.speed * 2.8 * safeDt;
        } else if (weatherKind === 'sand') {
          w.x -= w.speed * 2.2 * safeDt;
          w.y += Math.sin(w.phase + this.lastTimeSec * 3) * 14 * safeDt;
        } else if (weatherKind === 'lava') {
          w.x += Math.sin(w.phase + this.lastTimeSec * 2) * 18 * safeDt;
          w.y -= w.speed * 0.55 * safeDt;
        } else {
          // ash / spores
          w.x += Math.sin(w.phase + this.lastTimeSec * 1.5) * 16 * safeDt;
          w.y += w.speed * 0.35 * safeDt;
        }
        if (w.x < 0) w.x += LOGICAL_WIDTH;
        if (w.x >= LOGICAL_WIDTH) w.x -= LOGICAL_WIDTH;
        if (w.y < 0) w.y += LOGICAL_HEIGHT;
        if (w.y >= LOGICAL_HEIGHT) w.y -= LOGICAL_HEIGHT;
      }
    }
  }

  // ==========================================================================
  // MAIN 6-PASS RENDER ENTRYPOINT
  // ==========================================================================

  render(state: SimState, interpAlpha: number, settings: RenderSettings, timeSec: number): void {
    const gl = this.gl;
    const shaders = this.shaders;
    const batch = this.batch;
    if (
      !gl || !shaders || !batch ||
      !this.sceneFbo || !this.decalFboA || !this.decalFboB ||
      !this.shadowFbo || !this.lightFbo || !this.litFbo
    ) {
      return;
    }

    const dt = this.lastTimeSec > 0 ? timeSec - this.lastTimeSec : 1 / 60;
    this.lastTimeSec = timeSec;
    this.frameCounter++;

    // Detect room change and reset persistent floor decals cleanly
    const roomKey = `${state.screenMode}:${state.currentNodeId}:${state.map.width}x${state.map.height}:${state.map.spawnX},${state.map.spawnY}`;
    if (roomKey !== this.lastRoomKey) {
      this.lastRoomKey = roomKey;
      this.decalWorldW = Math.max(LOGICAL_WIDTH, state.map.width * state.map.tileSize);
      this.decalWorldH = Math.max(LOGICAL_HEIGHT, state.map.height * state.map.tileSize);
      this.clearRoomDecals();
    }

    // ------------------------------------------------------------------------
    // TITLE SCREEN FAST-PATH: Flowing 640x360 Norse Menu Aurora (shMenuAurora)
    // ------------------------------------------------------------------------
    if (state.screenMode === 'title') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.litFbo.fbo);
      gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      gl.disable(gl.BLEND);
      gl.useProgram(shaders.aurora.program);
      gl.uniform1f(shaders.aurora.uniforms.uTime, timeSec);
      gl.uniform2f(shaders.aurora.uniforms.uResolution, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Upscale 640x360 aurora crisp NEAREST to viewport
      this.renderPass6PostFx(state, settings, timeSec, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0, 0, 0, 0);
      return;
    }

    // Resolve biome palette
    const biome =
      this.resolvers.getBiomePalette?.(state.map.biomeId) ??
      resolveFallbackBiome(state.map.biomeId);

    this.stepVisualEffects(dt, biome.weather);

    // Smooth camera (120 FPS interpolation OR Classic 60 FPS Native Pixel-Snap)
    const alpha = settings.pixelSnap60 ? 1.0 : Math.max(0, Math.min(1, interpAlpha));
    let camX = state.camera.prevX + (state.camera.x - state.camera.prevX) * alpha;
    let camY = state.camera.prevY + (state.camera.y - state.camera.prevY) * alpha;
    if (settings.pixelSnap60) {
      camX = Math.round(camX);
      camY = Math.round(camY);
    }

    const shakeMag =
      Math.max(0, state.camera.shakeTrauma) *
      Math.max(0, state.camera.shakeTrauma) *
      9.0 *
      Math.max(0, settings.screenshakeScale);
    const shakeX =
      shakeMag > 0.05
        ? Math.round((state.camera.shakeDirX * 0.6 + Math.sin(timeSec * 83.0) * 0.4) * shakeMag)
        : 0;
    const shakeY =
      shakeMag > 0.05
        ? Math.round((state.camera.shakeDirY * 0.6 + Math.cos(timeSec * 97.0) * 0.4) * shakeMag)
        : 0;

    const zoom = Math.max(0.65, Math.min(1.6, state.camera.zoom || 1));
    const viewW = LOGICAL_WIDTH / zoom;
    const viewH = LOGICAL_HEIGHT / zoom;
    const viewLeft = camX - viewW * 0.5;
    const viewTop = camY - viewH * 0.5;

    makeOrthoMatrix(viewLeft, viewLeft + viewW, viewTop + viewH, viewTop, this.worldProj);
    makeOrthoMatrix(0, this.decalWorldW, this.decalWorldH, 0, this.decalProj);

    // ------------------------------------------------------------------------
    // PASS 2: PERSISTENT FLOOR DECAL FBO UPDATE (Stamp + Gentle Trail Fade)
    // ------------------------------------------------------------------------
    this.renderPass2Decals(settings, timeSec);

    // ------------------------------------------------------------------------
    // PASS 1: SCENE WORLD FBO (Floors, Decals, 3D Walls+Cracks, Portals, Hub)
    // ------------------------------------------------------------------------
    this.renderPass1World(state, biome, viewLeft, viewTop, viewW, viewH, timeSec);

    // ------------------------------------------------------------------------
    // PASS 3: GROUNDED SHADOW SURFACE FBO -> Unified Composite onto Scene FBO
    // ------------------------------------------------------------------------
    this.renderPass3Shadows(state, alpha, settings.pixelSnap60, viewLeft, viewTop, viewW, viewH, timeSec);

    // ------------------------------------------------------------------------
    // PASS 4: Y-SORTED ENTITIES, WEAPONS, GORE, TELEGRAPHS, WEATHER & TEXT
    // ------------------------------------------------------------------------
    this.renderPass4Entities(state, biome, alpha, settings.pixelSnap60, viewLeft, viewTop, viewW, viewH, timeSec);

    // ------------------------------------------------------------------------
    // PASS 5: DYNAMIC 2D ADDITIVE LIGHTING & EMISSIVES FBO -> litFbo
    // ------------------------------------------------------------------------
    this.renderPass5Lighting(state, biome, settings, alpha, viewLeft, viewTop, viewW, viewH, timeSec);

    // ------------------------------------------------------------------------
    // PASS 6: POST FX (Shockwaves, Frost, Snow Gusts, Vignette) & CRISP UPSCALE
    // ------------------------------------------------------------------------
    const frostIntensity = Math.max(0, Math.min(1, state.freezeStorm.intensity));
    const snowIntensity = Math.max(
      frostIntensity,
      biome.weather === 'snow' ? 0.28 : 0
    );
    const lowHpRatio = state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;
    const lowHpPulse = state.screenMode === 'combat' && lowHpRatio <= 0.28 ? 1 - lowHpRatio / 0.28 : 0;
    const powerGlow = state.player.powerActiveTicks > 0 ? Math.min(1, state.player.powerActiveTicks / 30) : 0;

    this.renderPass6PostFx(
      state,
      settings,
      timeSec,
      viewLeft,
      viewTop,
      viewW,
      viewH,
      shakeX,
      shakeY,
      frostIntensity,
      snowIntensity,
      lowHpPulse,
      powerGlow
    );
  }

  // --------------------------------------------------------------------------
  // PASS 2 IMPLEMENTATION
  // --------------------------------------------------------------------------

  private renderPass2Decals(settings: RenderSettings, timeSec: number): void {
    const gl = this.gl!;
    const shaders = this.shaders!;
    const batch = this.batch!;

    // Gentle periodic fade every 24 frames (sh_trails_fade parity)
    if (this.frameCounter % 24 === 0) {
      const src = this.decalActiveIndex === 0 ? this.decalFboA! : this.decalFboB!;
      const dst = this.decalActiveIndex === 0 ? this.decalFboB! : this.decalFboA!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
      gl.disable(gl.BLEND);
      gl.useProgram(shaders.decalFade.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(shaders.decalFade.uniforms.uTex, 0);
      gl.uniform1f(shaders.decalFade.uniforms.uDecay, 0.992);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.decalActiveIndex = this.decalActiveIndex === 0 ? 1 : 0;
    }

    if (this.pendingDecals.length === 0) return;

    const target = this.decalActiveIndex === 0 ? this.decalFboA! : this.decalFboB!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, DECAL_FBO_SIZE, DECAL_FBO_SIZE);
    batch.begin(shaders.sprite, this.decalProj, timeSec, 'normal');

    for (let i = 0; i < this.pendingDecals.length; i++) {
      const d = this.pendingDecals[i];
      if (!settings.bloodEnabled && d.kind === 'splat') continue;
      let sp: ResolvedSprite;
      if (d.kind === 'scorch') {
        sp = this.packManager.resolveSprite('fx_decal_scorch', 0);
      } else if (d.kind === 'rubble') {
        sp = this.packManager.resolveSprite('tile_rubble', 0);
      } else if (d.kind === 'casing') {
        sp = this.packManager.resolveSprite('fx_casing', 0);
      } else {
        sp = this.packManager.resolveSprite('fx_decal_splat', d.variant);
      }
      batch.drawSprite(
        sp.pageTexture,
        d.x,
        d.y,
        sp.width,
        sp.height,
        sp.originX,
        sp.originY,
        d.scale,
        d.scale,
        d.rotation,
        sp.u0,
        sp.v0,
        sp.u1,
        sp.v1,
        d.r,
        d.g,
        d.b,
        d.a
      );
    }

    batch.flush();
    this.pendingDecals.length = 0;
  }

  // --------------------------------------------------------------------------
  // PASS 1 IMPLEMENTATION (Tilemap + Decals + 3D Walls + Cracks + Hub + Portal)
  // --------------------------------------------------------------------------

  private renderPass1World(
    state: SimState,
    biome: BiomePalette,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    timeSec: number
  ): void {
    const gl = this.gl!;
    const shaders = this.shaders!;
    const batch = this.batch!;
    const map = state.map;
    const ts = map.tileSize || TILE_SIZE;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    gl.clearColor(0.04, 0.04, 0.07, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const floorA = parseHexRgb(biome.floorColorA, [0.35, 0.35, 0.40]);
    const floorB = parseHexRgb(biome.floorColorB, [0.28, 0.28, 0.33]);
    const wallTopCol = parseHexRgb(biome.wallTopColor, [0.52, 0.54, 0.62]);
    const wallFaceCol = parseHexRgb(biome.wallFaceColor, [0.32, 0.34, 0.40]);

    const minTx = Math.max(0, Math.floor(viewLeft / ts) - 1);
    const maxTx = Math.min(map.width - 1, Math.ceil((viewLeft + viewW) / ts) + 1);
    const minTy = Math.max(0, Math.floor(viewTop / ts) - 2);
    const maxTy = Math.min(map.height - 1, Math.ceil((viewTop + viewH) / ts) + 2);

    const animFrame4 = Math.floor(timeSec * 5) % 4;

    batch.begin(shaders.sprite, this.worldProj, timeSec, 'normal');

    // 1A. Walkable Floors, Rubble, Lava (sh_surtur_lava_lake), Water (sh_deep_water_distort)
    for (let ty = minTy; ty <= maxTy; ty++) {
      const rowOffset = ty * map.width;
      const wy = ty * ts;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const kind = map.tiles[rowOffset + tx] as TileKind;
        const wx = tx * ts;
        const hash = ((tx * 73856093) ^ (ty * 19349663)) & 3;

        if (kind === TileKind.Lava) {
          const sp = this.packManager.resolveSprite('tile_lava', (animFrame4 + hash) % 4);
          batch.drawQuad(
            sp.pageTexture, wx, wy, ts, ts,
            sp.u0, sp.v0, sp.u1, sp.v1,
            1, 1, 1, 1, 0, FX_MODE_LAVA
          );
          continue;
        }
        if (kind === TileKind.PitOrWater) {
          const sp = this.packManager.resolveSprite('tile_water', (animFrame4 + hash) % 4);
          batch.drawQuad(
            sp.pageTexture, wx, wy, ts, ts,
            sp.u0, sp.v0, sp.u1, sp.v1,
            1, 1, 1, 1, 0, FX_MODE_WATER
          );
          continue;
        }

        // Draw floor underneath walkable / rubble / crate tiles
        if (kind !== TileKind.WallDestructible && kind !== TileKind.WallBedrock) {
          const sp = this.packManager.resolveSprite('tile_floor', hash);
          const col = (tx + ty) % 2 === 0 ? floorA : floorB;
          batch.drawQuad(
            sp.pageTexture, wx, wy, ts, ts,
            sp.u0, sp.v0, sp.u1, sp.v1,
            col[0] * 1.18, col[1] * 1.18, col[2] * 1.18, 1
          );
          if (kind === TileKind.Rubble) {
            const rub = this.packManager.resolveSprite('tile_rubble', 0);
            batch.drawQuad(
              rub.pageTexture, wx, wy, ts, ts,
              rub.u0, rub.v0, rub.u1, rub.v1,
              wallTopCol[0] * 1.1, wallTopCol[1] * 1.1, wallTopCol[2] * 1.1, 1
            );
          }
        }
      }
    }

    // 1B. Composite Persistent Floor Decals (Pass 2 output) OVER floors & UNDER walls/actors!
    const decalFbo = this.decalActiveIndex === 0 ? this.decalFboA! : this.decalFboB!;
    batch.drawQuad(
      decalFbo.tex,
      0,
      0,
      this.decalWorldW,
      this.decalWorldH,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1
    );

    // 1C. 3D-Extruded Walls (Top Cap + South Front Face + Progressive Crack Overlays) & Crates
    const wallDepth = 6;
    for (let ty = minTy; ty <= maxTy; ty++) {
      const rowOffset = ty * map.width;
      const wy = ty * ts;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const idx = rowOffset + tx;
        const kind = map.tiles[idx] as TileKind;
        const wx = tx * ts;

        if (kind === TileKind.CoverCrate) {
          const crate = this.packManager.resolveSprite('tile_crate', 0);
          batch.drawQuad(
            crate.pageTexture, wx, wy - 2, ts, ts,
            crate.u0, crate.v0, crate.u1, crate.v1,
            1, 1, 1, 1
          );
          continue;
        }

        if (kind === TileKind.WallDestructible || kind === TileKind.WallBedrock) {
          const belowWall =
            ty + 1 < map.height &&
            (map.tiles[(ty + 1) * map.width + tx] === TileKind.WallDestructible ||
              map.tiles[(ty + 1) * map.width + tx] === TileKind.WallBedrock);

          // South 3D front face when exposed above walkable ground
          if (!belowWall) {
            const face = this.packManager.resolveSprite('tile_wall_face', 0);
            const fCol = kind === TileKind.WallBedrock ? ([0.45, 0.45, 0.56] as const) : wallFaceCol;
            batch.drawQuad(
              face.pageTexture,
              wx,
              wy + ts - wallDepth,
              ts,
              wallDepth,
              face.u0,
              face.v0,
              face.u1,
              face.v1,
              fCol[0] * 1.15,
              fCol[1] * 1.15,
              fCol[2] * 1.15,
              1
            );
          }

          // Top cap raised slightly for crisp 2.5D top-down depth
          const topSp = this.packManager.resolveSprite(
            kind === TileKind.WallBedrock ? 'tile_bedrock' : 'tile_wall',
            0
          );
          const tCol = kind === TileKind.WallBedrock ? ([0.95, 0.95, 1.05] as const) : wallTopCol;
          batch.drawQuad(
            topSp.pageTexture,
            wx,
            wy - wallDepth,
            ts,
            ts,
            topSp.u0,
            topSp.v0,
            topSp.u1,
            topSp.v1,
            tCol[0] * 1.25,
            tCol[1] * 1.25,
            tCol[2] * 1.25,
            1
          );

          // Progressive crack overlays at <66% and <33% HP
          if (kind === TileKind.WallDestructible) {
            const maxHp = map.tileMaxHp[idx];
            const hp = map.tileHp[idx];
            if (maxHp > 0 && hp < maxHp) {
              const ratio = hp / maxHp;
              if (ratio < 0.66) {
                const crackSp = this.packManager.resolveSprite('tile_wall_broken', ratio < 0.33 ? 1 : 0);
                batch.drawQuad(
                  crackSp.pageTexture,
                  wx,
                  wy - wallDepth,
                  ts,
                  ts,
                  crackSp.u0,
                  crackSp.v0,
                  crackSp.u1,
                  crackSp.v1,
                  1,
                  1,
                  1,
                  1
                );
              }
            }
          }
        }
      }
    }

    // 1D. Bifrost Exit Portal (sh_bifrost rainbow vortex)
    if (map.exitUnlocked && state.screenMode === 'combat') {
      const bifrost = this.packManager.resolveSprite('fx_bifrost', animFrame4);
      const pulse = 1.0 + Math.sin(timeSec * 5) * 0.08;
      batch.drawSprite(
        bifrost.pageTexture,
        map.exitX,
        map.exitY,
        bifrost.width,
        bifrost.height,
        bifrost.originX,
        bifrost.originY,
        pulse,
        pulse,
        timeSec * 1.2,
        bifrost.u0,
        bifrost.v0,
        bifrost.u1,
        bifrost.v1,
        1, 1, 1, 1, 0, FX_MODE_BIFROST
      );
    }

    // 1E. Hub Outpost Landmarks
    if (state.screenMode === 'hub' && state.hubInteractables.length > 0) {
      const white = this.packManager.getWhitePixel();
      for (let i = 0; i < state.hubInteractables.length; i++) {
        const item = state.hubInteractables[i];
        const dist = Math.hypot(state.player.x - item.x, state.player.y - item.y);
        const near = dist <= item.radius + 18;

        // Subtle Norse ground rune ring under each station
        batch.drawArcRibbon(
          white.pageTexture,
          (white.u0 + white.u1) * 0.5,
          (white.v0 + white.v1) * 0.5,
          item.x,
          item.y + 4,
          item.radius * 0.68,
          item.radius * 0.78,
          0,
          Math.PI * 2,
          20,
          near ? 0.35 : 0.22,
          near ? 0.98 : 0.68,
          near ? 1.0 : 0.78,
          near ? 0.8 : 0.35
        );

        let key = 'hub_jotunn';
        let fxMode = FX_MODE_NORMAL;
        if (item.id === 'loki') key = 'hub_loki';
        else if (item.id === 'jotunn_matic') key = 'hub_jotunn';
        else if (item.id === 'skill_tree') key = 'hub_yggdrasil';
        else if (item.id === 'training_dummy') key = 'hub_dummy';
        else if (item.id === 'bifrost') {
          key = 'fx_bifrost';
          fxMode = FX_MODE_BIFROST;
        }
        const sp = this.packManager.resolveSprite(key, Math.floor(timeSec * 3) % 4);
        batch.drawSprite(
          sp.pageTexture,
          item.x,
          item.y,
          sp.width,
          sp.height,
          sp.originX,
          sp.originY,
          1,
          1,
          item.id === 'bifrost' ? timeSec * 0.9 : 0,
          sp.u0,
          sp.v0,
          sp.u1,
          sp.v1,
          1, 1, 1, 1, near ? 0.12 : 0, fxMode
        );
      }
    }

    batch.flush();
  }

  // --------------------------------------------------------------------------
  // PASS 3 IMPLEMENTATION (Unified Grounded Shadow Surface FBO)
  // --------------------------------------------------------------------------

  private renderPass3Shadows(
    state: SimState,
    alpha: number,
    pixelSnap: boolean,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    timeSec: number
  ): void {
    const gl = this.gl!;
    const shaders = this.shaders!;
    const batch = this.batch!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const shadowSp = this.packManager.resolveSprite('fx_shadow', 0);
    const white = this.packManager.getWhitePixel();
    const map = state.map;
    const ts = map.tileSize || TILE_SIZE;

    batch.begin(shaders.sprite, this.worldProj, timeSec, 'normal');

    // Cast wall drop shadows along south edges
    const minTx = Math.max(0, Math.floor(viewLeft / ts) - 1);
    const maxTx = Math.min(map.width - 1, Math.ceil((viewLeft + viewW) / ts) + 1);
    const minTy = Math.max(0, Math.floor(viewTop / ts) - 1);
    const maxTy = Math.min(map.height - 1, Math.ceil((viewTop + viewH) / ts) + 1);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const k = map.tiles[ty * map.width + tx] as TileKind;
        if (k === TileKind.WallDestructible || k === TileKind.WallBedrock) {
          if (ty + 1 < map.height) {
            const below = map.tiles[(ty + 1) * map.width + tx] as TileKind;
            if (below !== TileKind.WallDestructible && below !== TileKind.WallBedrock) {
              batch.drawQuad(
                white.pageTexture,
                tx * ts + 2,
                (ty + 1) * ts,
                ts,
                5,
                white.u0,
                white.v0,
                white.u1,
                white.v1,
                0.04, 0.03, 0.08, 1.0, 0, FX_MODE_SHADOW
              );
            }
          }
        }
      }
    }

    const drawOvalShadow = (x: number, y: number, scaleX: number, scaleY: number) => {
      batch.drawSprite(
        shadowSp.pageTexture,
        x + 2,
        y + 2,
        shadowSp.width,
        shadowSp.height,
        shadowSp.originX,
        shadowSp.originY,
        scaleX,
        scaleY,
        0,
        shadowSp.u0,
        shadowSp.v0,
        shadowSp.u1,
        shadowSp.v1,
        0.04, 0.03, 0.08, 1.0, 0, FX_MODE_SHADOW
      );
    };

    // Player shadow
    const px = this.interpCoord(state.player.prevX, state.player.x, alpha, pixelSnap);
    const py = this.interpCoord(state.player.prevY, state.player.y, alpha, pixelSnap);
    drawOvalShadow(px, py + 2, 0.85, 0.72);

    // Enemies & Bosses
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      const ex = this.interpCoord(e.prevX, e.x, alpha, pixelSnap);
      const ey = this.interpCoord(e.prevY, e.y, alpha, pixelSnap);
      const sc = e.isBoss ? Math.max(1.8, e.radius / 11) : Math.max(0.65, e.radius / 10);
      drawOvalShadow(ex, ey + 2, sc, sc * 0.75);
    }

    // Pickups, Companions, Frost Crystals, Projectiles
    for (let i = 0; i < state.pickups.length; i++) {
      const p = state.pickups[i];
      drawOvalShadow(p.x, p.y + 3, 0.55, 0.5);
    }
    for (let i = 0; i < state.companions.length; i++) {
      const c = state.companions[i];
      const cx = this.interpCoord(c.prevX, c.x, alpha, pixelSnap);
      const cy = this.interpCoord(c.prevY, c.y, alpha, pixelSnap);
      drawOvalShadow(cx, cy + 3, 0.7, 0.6);
    }
    for (let i = 0; i < state.freezeStorm.crystals.length; i++) {
      const cr = state.freezeStorm.crystals[i];
      drawOvalShadow(cr.x, cr.y + 5, 0.85, 0.7);
    }
    for (let i = 0; i < state.projectiles.length; i++) {
      const pr = state.projectiles[i];
      if (!pr.isMelee) {
        drawOvalShadow(pr.x, pr.y + 5, 0.35 * pr.scale, 0.28 * pr.scale);
      }
    }

    batch.flush();

    // Composite unified Shadow Surface cleanly onto Scene FBO (single uniform alpha!)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    batch.begin(shaders.sprite, this.worldProj, timeSec, 'normal');
    batch.drawQuad(
      this.shadowFbo!.tex,
      viewLeft,
      viewTop,
      viewW,
      viewH,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      0.42
    );
    batch.flush();
  }

  // --------------------------------------------------------------------------
  // PASS 4 IMPLEMENTATION (Telegraphs, Y-Sorted Actors, Weapons, Gore & Text)
  // --------------------------------------------------------------------------

  private renderPass4Entities(
    state: SimState,
    biome: BiomePalette,
    alpha: number,
    pixelSnap: boolean,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    timeSec: number
  ): void {
    const gl = this.gl!;
    const shaders = this.shaders!;
    const batch = this.batch!;
    const white = this.packManager.getWhitePixel();
    const wu = (white.u0 + white.u1) * 0.5;
    const wv = (white.v0 + white.v1) * 0.5;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    batch.begin(shaders.sprite, this.worldProj, timeSec, 'normal');

    // 4A. Boss Ground Telegraphs (below characters so silhouettes read cleanly)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.bossTelegraph) {
        this.drawBossTelegraph(batch, white.pageTexture, wu, wv, e.bossTelegraph, timeSec);
      }
    }

    // 4B. Build Y-Sorted Entity Draw Queue (zero allocations via reused buffer)
    let count = 0;
    const pushSort = (sortY: number, kind: YSortItem['kind'], index: number) => {
      if (count < this.ySortBuffer.length) {
        const slot = this.ySortBuffer[count];
        slot.sortY = sortY;
        slot.kind = kind;
        slot.index = index;
      } else {
        this.ySortBuffer.push({ sortY, kind, index });
      }
      count++;
    };

    const playerY = this.interpCoord(state.player.prevY, state.player.y, alpha, pixelSnap);
    pushSort(playerY, 'player', 0);

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      pushSort(this.interpCoord(e.prevY, e.y, alpha, pixelSnap), 'enemy', i);
    }
    for (let i = 0; i < state.pickups.length; i++) {
      pushSort(state.pickups[i].y, 'pickup', i);
    }
    for (let i = 0; i < state.companions.length; i++) {
      const c = state.companions[i];
      pushSort(this.interpCoord(c.prevY, c.y, alpha, pixelSnap), 'companion', i);
    }
    for (let i = 0; i < state.freezeStorm.crystals.length; i++) {
      pushSort(state.freezeStorm.crystals[i].y, 'crystal', i);
    }

    // Insertion sort on active slice (near-sorted every frame -> O(N), zero allocations!)
    for (let i = 1; i < count; i++) {
      const curSortY = this.ySortBuffer[i].sortY;
      const curKind = this.ySortBuffer[i].kind;
      const curIdx = this.ySortBuffer[i].index;
      let j = i - 1;
      while (j >= 0 && this.ySortBuffer[j].sortY > curSortY) {
        this.ySortBuffer[j + 1].sortY = this.ySortBuffer[j].sortY;
        this.ySortBuffer[j + 1].kind = this.ySortBuffer[j].kind;
        this.ySortBuffer[j + 1].index = this.ySortBuffer[j].index;
        j--;
      }
      this.ySortBuffer[j + 1].sortY = curSortY;
      this.ySortBuffer[j + 1].kind = curKind;
      this.ySortBuffer[j + 1].index = curIdx;
    }

    // 4C. Render Y-Sorted Entities
    for (let i = 0; i < count; i++) {
      const item = this.ySortBuffer[i];
      if (item.kind === 'pickup') {
        this.drawPickup(batch, state.pickups[item.index], timeSec);
      } else if (item.kind === 'companion') {
        this.drawCompanion(batch, state.companions[item.index], state, alpha, pixelSnap, timeSec);
      } else if (item.kind === 'crystal') {
        const cr = state.freezeStorm.crystals[item.index];
        const sp = this.packManager.resolveSprite('fx_frost_crystal', Math.floor(timeSec * 6) % 4);
        const bob = Math.sin(timeSec * 4 + cr.pulsePhase) * 2.5;
        batch.drawSprite(
          sp.pageTexture, cr.x, cr.y + bob, sp.width, sp.height,
          sp.originX, sp.originY, 1, 1, 0,
          sp.u0, sp.v0, sp.u1, sp.v1, 1, 1, 1, 1
        );
      } else if (item.kind === 'enemy') {
        this.drawEnemy(batch, state.enemies[item.index], alpha, pixelSnap, timeSec);
      } else {
        this.drawPlayerAndWeapons(batch, state, alpha, pixelSnap, timeSec);
      }
    }

    // 4D. Projectiles + Glowing Trails
    for (let i = 0; i < state.projectiles.length; i++) {
      const pr = state.projectiles[i];
      if (pr.isMelee) continue;
      const px = this.interpCoord(pr.prevX, pr.x, alpha, pixelSnap);
      const py = this.interpCoord(pr.prevY, pr.y, alpha, pixelSnap);
      const ang = Math.atan2(pr.vy, pr.vx);
      const col = parseHexRgb(pr.color, [1, 0.9, 0.4]);

      // Velocity streak trail behind fast projectiles
      const trailX = px - Math.cos(ang) * Math.min(18, pr.speed * 1.4);
      const trailY = py - Math.sin(ang) * Math.min(18, pr.speed * 1.4);
      batch.drawLine(
        white.pageTexture, wu, wv,
        trailX, trailY, px, py,
        Math.max(1.5, pr.radius * 0.65),
        col[0], col[1], col[2], 0.55
      );

      const spKey = pr.spriteKey || (pr.owner === 'enemy' ? 'proj_enemy' : pr.owner === 'frost' ? 'proj_frost' : 'proj_bullet');
      const sp = this.packManager.resolveSprite(spKey, 0);
      batch.drawSprite(
        sp.pageTexture,
        px, py, sp.width, sp.height,
        sp.originX, sp.originY,
        pr.scale, pr.scale,
        ang,
        sp.u0, sp.v0, sp.u1, sp.v1,
        col[0] * 0.4 + 0.6, col[1] * 0.4 + 0.6, col[2] * 0.4 + 0.6,
        pr.ethereal ? 0.68 : 1.0
      );
    }

    // 4E. Directional Melee Slash Arc Ribbons (Additive bright crescent)
    batch.setBlend('additive');
    for (let i = 0; i < this.slashArcs.length; i++) {
      const sl = this.slashArcs[i];
      if (!sl.active) continue;
      const t = sl.life / sl.maxLife;
      const half = sl.arc * 0.5;
      batch.drawArcRibbon(
        white.pageTexture, wu, wv,
        sl.x, sl.y,
        sl.radius * (0.35 + (1 - t) * 0.35),
        sl.radius,
        sl.angle - half,
        sl.angle + half,
        12,
        sl.r, sl.g, sl.b, t * 0.9,
        true
      );
      batch.drawArcRibbon(
        white.pageTexture, wu, wv,
        sl.x, sl.y,
        sl.radius * 0.78,
        sl.radius,
        sl.angle - half * 0.85,
        sl.angle + half * 0.85,
        10,
        1, 1, 1, t * 0.85,
        true
      );
    }
    batch.setBlend('normal');

    // 4F. Particles & Sprite-Split Overkill Gibs & Animated Explosions
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      const t = Math.max(0, p.life / p.maxLife);
      const drawY = p.y - p.z;
      if (p.kind === 'gib') {
        const gib = this.packManager.resolveSprite('fx_gib_chunk', p.variant);
        batch.drawSprite(
          gib.pageTexture, p.x, drawY, gib.width, gib.height,
          gib.originX, gib.originY, p.size, p.size, p.rotation,
          gib.u0, gib.v0, gib.u1, gib.v1,
          p.r, p.g, p.b, Math.min(1, t * 2), 0, FX_MODE_GIB_GLOW
        );
      } else if (p.kind === 'casing') {
        const cas = this.packManager.resolveSprite('fx_casing', 0);
        batch.drawSprite(
          cas.pageTexture, p.x, drawY, cas.width, cas.height,
          cas.originX, cas.originY, 1, 1, p.rotation,
          cas.u0, cas.v0, cas.u1, cas.v1, 1, 1, 1, 1
        );
      } else {
        const s = p.size * (p.kind === 'smoke' ? 1.8 - t : Math.min(1, t * 1.6));
        batch.drawQuad(
          white.pageTexture, p.x - s * 0.5, drawY - s * 0.5, s, s,
          white.u0, white.v0, white.u1, white.v1,
          p.r, p.g, p.b, p.a * Math.min(1, t * 1.5)
        );
      }
    }

    for (let i = 0; i < this.explosions.length; i++) {
      const ex = this.explosions[i];
      if (!ex.active) continue;
      const progress = 1 - ex.life / ex.maxLife;
      const frame = Math.min(4, Math.floor(progress * 5));
      const sp = this.packManager.resolveSprite('fx_explosion', frame);
      const scale = (ex.radius * 2.1) / Math.max(16, sp.width);
      batch.drawSprite(
        sp.pageTexture, ex.x, ex.y, sp.width, sp.height,
        sp.originX, sp.originY, scale, scale, 0,
        sp.u0, sp.v0, sp.u1, sp.v1,
        ex.r * 0.45 + 0.55, ex.g * 0.45 + 0.55, ex.b * 0.45 + 0.55, 1
      );
    }

    // 4G. Biome Weather Motes (screen-space anchored to current camera view)
    if (biome.weather !== 'none') {
      const wCol =
        biome.weather === 'snow'
          ? ([0.9, 0.96, 1.0, 0.72] as const)
          : biome.weather === 'lava'
            ? ([1.0, 0.55, 0.16, 0.85] as const)
            : biome.weather === 'spores'
              ? ([0.5, 1.0, 0.45, 0.62] as const)
              : biome.weather === 'sand'
                ? ([0.92, 0.78, 0.52, 0.48] as const)
                : biome.weather === 'rain'
                  ? ([0.55, 0.85, 1.0, 0.58] as const)
                  : ([0.72, 0.68, 0.74, 0.5] as const);

      for (let i = 0; i < this.weather.length; i++) {
        const m = this.weather[i];
        const wx = viewLeft + (m.x / LOGICAL_WIDTH) * viewW;
        const wy = viewTop + (m.y / LOGICAL_HEIGHT) * viewH;
        const mw = biome.weather === 'rain' ? 1 : m.size;
        const mh = biome.weather === 'rain' ? 5 : m.size;
        batch.drawQuad(
          white.pageTexture, wx, wy, mw, mh,
          white.u0, white.v0, white.u1, white.v1,
          wCol[0], wCol[1], wCol[2], wCol[3]
        );
      }
    }

    // 4H. Hub Proximity Interaction Labels + Crisp World Floating Damage Numbers
    if (state.screenMode === 'hub') {
      for (let i = 0; i < state.hubInteractables.length; i++) {
        const item = state.hubInteractables[i];
        const dist = Math.hypot(state.player.x - item.x, state.player.y - item.y);
        if (dist <= item.radius + 32) {
          const prompt = `[E] ${item.label}`;
          this.drawPixelText(batch, prompt, item.x, item.y - 36, 0.9, 0.45, 0.98, 1.0, 1.0, true);
        }
      }
    }

    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      if (!ft.active) continue;
      const a = Math.min(1, (ft.life / ft.maxLife) * 2.2);
      this.drawPixelText(batch, ft.text, ft.x, ft.y, ft.scale, ft.r, ft.g, ft.b, a, true);
    }

    batch.flush();
  }

  private drawBossTelegraph(
    batch: SpriteBatch,
    whiteTex: WebGLTexture,
    wu: number,
    wv: number,
    tg: BossTelegraph,
    timeSec: number
  ): void {
    const col = parseHexRgb(tg.color, [1.0, 0.22, 0.28]);
    const pulse = 0.65 + 0.35 * Math.sin(timeSec * 18);
    const prog = Math.max(0, Math.min(1, tg.progress));

    if (tg.kind === 'line') {
      batch.drawLine(whiteTex, wu, wv, tg.x, tg.y, tg.targetX, tg.targetY, Math.max(4, tg.radius * 2), col[0], col[1], col[2], 0.24 * pulse);
      batch.drawLine(whiteTex, wu, wv, tg.x, tg.y, tg.targetX, tg.targetY, Math.max(1.5, tg.radius * 2 * prog), col[0], col[1], col[2], 0.72);
    } else if (tg.kind === 'circle') {
      batch.drawArcRibbon(whiteTex, wu, wv, tg.targetX, tg.targetY, Math.max(1, tg.radius - 2), tg.radius, 0, Math.PI * 2, 24, col[0], col[1], col[2], 0.85 * pulse);
      batch.drawArcRibbon(whiteTex, wu, wv, tg.targetX, tg.targetY, 0, tg.radius * prog, 0, Math.PI * 2, 20, col[0], col[1], col[2], 0.26 + prog * 0.2);
    } else if (tg.kind === 'ring') {
      const inner = Math.max(6, tg.radius * 0.65);
      batch.drawArcRibbon(whiteTex, wu, wv, tg.x, tg.y, inner, tg.radius, 0, Math.PI * 2, 28, col[0], col[1], col[2], (0.25 + prog * 0.45) * pulse);
      batch.drawArcRibbon(whiteTex, wu, wv, tg.x, tg.y, tg.radius - 1.5, tg.radius, 0, Math.PI * 2, 28, 1, 0.85, 0.85, 0.85);
    } else {
      // cone
      const baseAng = Math.atan2(tg.targetY - tg.y, tg.targetX - tg.x);
      const halfCone = 0.45;
      batch.drawArcRibbon(whiteTex, wu, wv, tg.x, tg.y, 4, tg.radius, baseAng - halfCone, baseAng + halfCone, 14, col[0], col[1], col[2], 0.22 * pulse);
      batch.drawArcRibbon(whiteTex, wu, wv, tg.x, tg.y, 4, tg.radius * prog, baseAng - halfCone, baseAng + halfCone, 14, col[0], col[1], col[2], 0.55);
    }
  }

  private drawPickup(batch: SpriteBatch, p: PickupState, timeSec: number): void {
    const bob = Math.sin(timeSec * 5 + p.id * 1.7) * 2.0;
    let key = 'pickup_gold';
    let frame = 0;
    if (p.kind === 'hp') key = 'pickup_hp';
    else if (p.kind === 'ammo') key = 'pickup_ammo';
    else if (p.kind === 'gold') key = 'pickup_gold';
    else if (p.kind === 'xp') key = 'pickup_xp';
    else if (p.kind === 'weapon') key = p.weaponUniqueId ? `wep_${p.weaponUniqueId}` : 'pickup_weapon';
    else if (p.kind === 'mod') key = 'pickup_mod';
    else {
      key = 'pickup_chest';
      frame = p.opened ? 1 : 0;
    }
    const sp = this.packManager.resolveSprite(key, frame);
    const scale = p.kind === 'weapon' ? 0.9 : 1.0;
    batch.drawSprite(
      sp.pageTexture,
      p.x,
      p.y + (key === 'pickup_chest' ? 0 : bob),
      sp.width,
      sp.height,
      sp.originX,
      sp.originY,
      scale,
      scale,
      0,
      sp.u0,
      sp.v0,
      sp.u1,
      sp.v1,
      1, 1, 1, 1
    );
  }

  private drawCompanion(
    batch: SpriteBatch,
    c: CompanionState,
    state: SimState,
    alpha: number,
    pixelSnap: boolean,
    timeSec: number
  ): void {
    const cx = this.interpCoord(c.prevX, c.x, alpha, pixelSnap);
    const cy = this.interpCoord(c.prevY, c.y, alpha, pixelSnap);
    const key = `fx_${c.kind}`;
    const sp = this.packManager.resolveSprite(key, Math.floor(timeSec * 8) % 4);

    // Draw iron chain linking Stellan's Ball of Doom to player
    if (c.kind === 'doom_ball') {
      const white = this.packManager.getWhitePixel();
      const px = this.interpCoord(state.player.prevX, state.player.x, alpha, pixelSnap);
      const py = this.interpCoord(state.player.prevY, state.player.y, alpha, pixelSnap) - 6;
      batch.drawLine(
        white.pageTexture,
        (white.u0 + white.u1) * 0.5,
        (white.v0 + white.v1) * 0.5,
        px, py, cx, cy, 1.5, 0.65, 0.7, 0.78, 0.85
      );
    }

    const rot = c.kind === 'drill' ? c.angle : c.kind === 'whirlpool' || c.kind === 'doom_ball' ? timeSec * 7 : 0;
    batch.drawSprite(
      sp.pageTexture, cx, cy, sp.width, sp.height,
      sp.originX, sp.originY, 1, 1, rot,
      sp.u0, sp.v0, sp.u1, sp.v1, 1, 1, 1, c.kind === 'whirlpool' ? 0.82 : 1
    );
  }

  private drawEnemy(
    batch: SpriteBatch,
    e: EnemyState,
    alpha: number,
    pixelSnap: boolean,
    timeSec: number
  ): void {
    const ex = this.interpCoord(e.prevX, e.x, alpha, pixelSnap);
    const ey = this.interpCoord(e.prevY, e.y, alpha, pixelSnap);
    const enemyDef = this.resolvers.getEnemyDef?.(e.defId);
    const bossDef = e.isBoss && e.bossId ? this.resolvers.getBossDef?.(e.bossId) : undefined;
    const spriteKey =
      e.isBoss && bossDef
        ? e.bossPhase === 2
          ? bossDef.spritePhase2Key
          : bossDef.spritePhase1Key
        : inferEnemySpriteKey(e, enemyDef);

    const sp = this.packManager.resolveSprite(spriteKey, e.animFrame);

    // Base tint + elemental status tinting
    let r = 1.0;
    let g = 1.0;
    let b = 1.0;
    if (e.tintColor && e.tintColor !== '#ffffff' && !e.isBoss) {
      const tint = parseHexRgb(e.tintColor, [1, 1, 1]);
      r = 0.55 + tint[0] * 0.45;
      g = 0.55 + tint[1] * 0.45;
      b = 0.55 + tint[2] * 0.45;
    }

    if (e.status.freezeTicks > 0) {
      r *= 0.62; g *= 0.94; b = Math.min(1.25, b * 1.25);
    } else if (e.status.burnTicks > 0) {
      const fl = 0.85 + 0.15 * Math.sin(timeSec * 24);
      r = Math.min(1.3, r * 1.25 * fl); g *= 0.68; b *= 0.48;
    } else if (e.status.acidTicks > 0) {
      r *= 0.72; g = Math.min(1.3, g * 1.22); b *= 0.55;
    } else if (e.status.radTicks > 0) {
      r = Math.min(1.25, r * 1.15); g = Math.min(1.28, g * 1.22); b *= 0.45;
    }

    const flash = e.hitFlashTicks > 0 ? 1.0 : 0.0;
    const fxMode = e.isBoss && e.bossPhase === 2 ? FX_MODE_OVERDRIVE : FX_MODE_NORMAL;
    const scaleX = e.facing < 0 ? -1 : 1;

    batch.drawSprite(
      sp.pageTexture,
      ex,
      ey,
      sp.width,
      sp.height,
      sp.originX,
      sp.originY,
      scaleX,
      1,
      0,
      sp.u0,
      sp.v0,
      sp.u1,
      sp.v1,
      r,
      g,
      b,
      1,
      flash,
      fxMode
    );

    // Crisp overhead HP bar for damaged non-boss enemies
    if (!e.isBoss && e.hp < e.maxHp && e.maxHp > 0) {
      const white = this.packManager.getWhitePixel();
      const ratio = Math.max(0, Math.min(1, e.hp / e.maxHp));
      const bw = Math.max(14, Math.min(26, e.radius * 2));
      const bx = Math.round(ex - bw * 0.5);
      const by = Math.round(ey - sp.height - 2);
      batch.drawQuad(white.pageTexture, bx - 1, by - 1, bw + 2, 4, white.u0, white.v0, white.u1, white.v1, 0.06, 0.05, 0.09, 0.85);
      batch.drawQuad(white.pageTexture, bx, by, bw * ratio, 2, white.u0, white.v0, white.u1, white.v1, 0.96, 0.22, 0.28, 1.0);
    }
  }

  private drawPlayerAndWeapons(
    batch: SpriteBatch,
    state: SimState,
    alpha: number,
    pixelSnap: boolean,
    timeSec: number
  ): void {
    const p = state.player;
    const px = this.interpCoord(p.prevX, p.x, alpha, pixelSnap);
    const py = this.interpCoord(p.prevY, p.y, alpha, pixelSnap);
    const white = this.packManager.getWhitePixel();
    const wu = (white.u0 + white.u1) * 0.5;
    const wv = (white.v0 + white.v1) * 0.5;

    const activeWeapon = p.weapons[p.activeSlot] ?? p.weapons[0];
    const secondaryWeapon = p.weapons[p.activeSlot === 0 ? 1 : 0];
    const activeDef = this.resolvers.getWeaponDef?.(activeWeapon.uniqueId);
    const secondaryDef = secondaryWeapon ? this.resolvers.getWeaponDef?.(secondaryWeapon.uniqueId) : undefined;

    // 1. Stashed Secondary Weapon on Outcast's Back (using stashedOffset)
    if (secondaryWeapon) {
      const offX = (secondaryDef?.stashedOffset?.x ?? -4) * p.facing;
      const offY = (secondaryDef?.stashedOffset?.y ?? -9);
      const stashSp = this.resolveWeaponSprite(secondaryWeapon, secondaryDef);
      batch.drawSprite(
        stashSp.pageTexture,
        px + offX,
        py + offY,
        stashSp.width,
        stashSp.height,
        stashSp.originX,
        stashSp.originY,
        p.facing * 0.85,
        0.85,
        p.facing > 0 ? -2.25 : 2.25,
        stashSp.u0,
        stashSp.v0,
        stashSp.u1,
        stashSp.v1,
        0.82,
        0.82,
        0.88,
        p.isInvisible ? 0.35 : 0.95,
        0,
        secondaryWeapon.golden ? FX_MODE_GOLDEN : FX_MODE_NORMAL
      );
    }

    // 2. Outcast Sprite with Skin Tint, Ghost Walk Stealth Alpha, Hit Flash & I-Frame Blink
    const outcastKey = `outcast_${p.outcastId}`;
    const sp = this.packManager.resolveSprite(outcastKey, p.animFrame);
    const skinDef = this.resolvers.getSkinDef?.(p.skinId);
    const skinTint = skinDef?.paletteSwap?.[0]
      ? parseHexRgb(skinDef.paletteSwap[0], SKIN_TINTS[p.skinId] ?? [1, 1, 1])
      : (SKIN_TINTS[p.skinId] ?? [1, 1, 1]);

    const blinkAlpha = p.iframes > 0 && Math.floor(p.iframes / 3) % 2 === 0 ? 0.55 : 1.0;
    const alphaOut = p.isInvisible ? 0.38 : blinkAlpha;
    const flash = p.hitFlashTicks > 0 ? 1.0 : 0.0;
    const fxMode = p.powerActiveTicks > 0 ? FX_MODE_OVERDRIVE : FX_MODE_NORMAL;

    // Power overdrive ground aura ring
    if (p.powerActiveTicks > 0) {
      batch.drawArcRibbon(
        white.pageTexture, wu, wv,
        px, py - 4, 12, 14.5, 0, Math.PI * 2, 20,
        1.0, 0.85, 0.28, 0.65 + 0.25 * Math.sin(timeSec * 16)
      );
    }

    batch.drawSprite(
      sp.pageTexture,
      px,
      py,
      sp.width,
      sp.height,
      sp.originX,
      sp.originY,
      p.facing < 0 ? -1 : 1,
      1,
      0,
      sp.u0,
      sp.v0,
      sp.u1,
      sp.v1,
      0.5 + skinTint[0] * 0.5,
      0.5 + skinTint[1] * 0.5,
      0.5 + skinTint[2] * 0.5,
      alphaOut,
      flash,
      fxMode
    );

    // Leifi Horn Shield / Invulnerability energy bubble
    if (p.isInvulnerable || p.shield > 0) {
      const col = p.isInvulnerable ? ([0.35, 0.95, 1.0] as const) : ([0.45, 0.75, 1.0] as const);
      batch.drawArcRibbon(
        white.pageTexture, wu, wv,
        px, py - 8, 12.5, 14.2, 0, Math.PI * 2, 22,
        col[0], col[1], col[2], p.isInvulnerable ? 0.82 : 0.38
      );
    }

    // 3. Active Held Weapon (aim rotated, flipped upright left/right, recoil kick, laser sight & muzzle flash)
    const handX = px + Math.cos(p.aimAngle) * 4;
    const handY = py - 8 + Math.sin(p.aimAngle) * 2;
    const aimLeft = Math.cos(p.aimAngle) < 0;
    const kick = activeWeapon.recoilOffset || 0;
    const recAng = (activeWeapon.recoilAngle || 0) * (aimLeft ? 1 : -1) * (Math.PI / 180);
    const drawAngle = p.aimAngle + recAng;
    const wx = handX - Math.cos(p.aimAngle) * kick;
    const wy = handY - Math.sin(p.aimAngle) * kick;

    // Laser Sight beam when enabled on weapon or mod
    if (activeDef?.laserSight) {
      const hit = this.raycastLaser(state, wx, wy, p.aimAngle, 260);
      batch.drawLine(white.pageTexture, wu, wv, wx, wy, hit.x, hit.y, 1.0, 1.0, 0.14, 0.22, 0.62);
      batch.drawQuad(white.pageTexture, hit.x - 1.5, hit.y - 1.5, 3, 3, white.u0, white.v0, white.u1, white.v1, 1.0, 0.45, 0.5, 0.95);
    }

    const wepSp = this.resolveWeaponSprite(activeWeapon, activeDef);
    batch.drawSprite(
      wepSp.pageTexture,
      wx,
      wy,
      wepSp.width,
      wepSp.height,
      wepSp.originX,
      wepSp.originY,
      1,
      aimLeft ? -1 : 1,
      drawAngle,
      wepSp.u0,
      wepSp.v0,
      wepSp.u1,
      wepSp.v1,
      1,
      1,
      1,
      alphaOut,
      0,
      activeWeapon.golden ? FX_MODE_GOLDEN : FX_MODE_NORMAL
    );

    // Muzzle Flash sprite when flashTicks > 0
    if (activeWeapon.flashTicks > 0) {
      const muzzleDist = Math.max(10, wepSp.width - wepSp.originX + 2);
      const mx = wx + Math.cos(drawAngle) * muzzleDist;
      const my = wy + Math.sin(drawAngle) * muzzleDist;
      const mf = this.packManager.resolveSprite('fx_muzzle_flash', activeWeapon.flashTicks % 3);
      batch.setBlend('additive');
      batch.drawSprite(
        mf.pageTexture,
        mx, my, mf.width, mf.height,
        mf.originX, mf.originY,
        1.1, 1.1, drawAngle,
        mf.u0, mf.v0, mf.u1, mf.v1,
        1, 0.92, 0.72, 1
      );
      batch.setBlend('normal');
    }
  }

  private resolveWeaponSprite(wep: WeaponInstance, def?: WeaponDef): ResolvedSprite {
    // In Custom Pack mode, resolve exact weapon uniqueId / spriteId directly first
    if (this.packManager.getMode() === 'custom') {
      return this.packManager.resolveSprite(
        def?.spriteKey ?? `wep_${wep.uniqueId}`,
        0,
        def?.spriteId
      );
    }
    // In Built-In mode, match exact class/ammo archetype + golden tint variant
    if (def) {
      const archKey = selectWeaponArchetypeKey(def.ammoType, def.class, def.uniqueId, wep.golden);
      return this.packManager.resolveSprite(archKey, 0);
    }
    return this.packManager.resolveSprite(`wep_${wep.uniqueId}`, 0);
  }

  private raycastLaser(
    state: SimState,
    ox: number,
    oy: number,
    angle: number,
    maxDist: number
  ): { x: number; y: number } {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const map = state.map;
    const ts = map.tileSize || TILE_SIZE;
    const step = 4;
    for (let d = 8; d <= maxDist; d += step) {
      const x = ox + dx * d;
      const y = oy + dy * d;
      const tx = Math.floor(x / ts);
      const ty = Math.floor(y / ts);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
        return { x, y };
      }
      const k = map.tiles[ty * map.width + tx] as TileKind;
      if (k === TileKind.WallDestructible || k === TileKind.WallBedrock) {
        return { x, y };
      }
    }
    return { x: ox + dx * maxDist, y: oy + dy * maxDist };
  }

  private drawPixelText(
    batch: SpriteBatch,
    text: string,
    cx: number,
    y: number,
    scale: number,
    r: number,
    g: number,
    b: number,
    a: number,
    centered = true
  ): void {
    const fontTex = this.packManager.getFontTexture();
    if (!fontTex) return;
    const atlas = getBuiltinFontAtlas();
    const upper = text.toUpperCase();
    const measured = centered ? measurePixelText(upper, scale) : { width: 0, height: 0 };
    let cursorX = Math.round(centered ? cx - measured.width * 0.5 : cx);
    const drawY = Math.round(y);

    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      const glp = atlas.glyphs[ch] ?? atlas.glyphs[' '];
      if (ch !== ' ') {
        batch.drawQuad(
          fontTex,
          cursorX,
          drawY,
          glp.w * scale,
          glp.h * scale,
          glp.u0,
          glp.v0,
          glp.u1,
          glp.v1,
          r,
          g,
          b,
          a
        );
      }
      cursorX += glp.advance * scale;
    }
  }

  // --------------------------------------------------------------------------
  // PASS 5 IMPLEMENTATION (Dynamic 2D Additive Lighting & Emissives FBO)
  // --------------------------------------------------------------------------

  private renderPass5Lighting(
    state: SimState,
    biome: BiomePalette,
    settings: RenderSettings,
    alpha: number,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    timeSec: number
  ): void {
    const gl = this.gl!;
    const shaders = this.shaders!;
    const batch = this.batch!;

    if (!settings.lightingEnabled) {
      // Direct pass-through blit sceneFbo -> litFbo
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.litFbo!.fbo);
      gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      gl.disable(gl.BLEND);
      gl.useProgram(shaders.lightingComposite.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.tex);
      gl.uniform1i(shaders.lightingComposite.uniforms.uSceneTex, 0);
      // Bind white ambient fallback via lightFbo cleared to 1.0
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo!.fbo);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.litFbo!.fbo);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lightFbo!.tex);
      gl.uniform1i(shaders.lightingComposite.uniforms.uLightTex, 1);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }

    // 5A. Render additive point lights into lightFbo cleared to biome ambientColor
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const amb = biome.ambientColor;
    gl.clearColor(
      Math.max(0.32, amb[0]),
      Math.max(0.32, amb[1]),
      Math.max(0.36, amb[2]),
      1.0
    );
    gl.clear(gl.COLOR_BUFFER_BIT);

    batch.begin(shaders.light, this.worldProj, timeSec, 'additive');

    // Player visibility lantern halo + subtle Outcast visor glow
    const px = this.interpCoord(state.player.prevX, state.player.x, alpha, settings.pixelSnap60);
    const py = this.interpCoord(state.player.prevY, state.player.y, alpha, settings.pixelSnap60);
    batch.drawLight(px, py - 6, 138, 0.72, 0.76, 0.85, 0.85, 1.75, 0);
    if (state.player.powerActiveTicks > 0) {
      batch.drawLight(px, py - 6, 95, 1.0, 0.78, 0.26, 0.95, 1.6, 2.2);
    }

    // Active projectiles glowing light pools
    for (let i = 0; i < state.projectiles.length; i++) {
      const pr = state.projectiles[i];
      const col = parseHexRgb(pr.color, [1.0, 0.85, 0.4]);
      const rad = pr.owner === 'enemy' ? 32 : pr.explosiveTier > 0 ? 52 : 36;
      batch.drawLight(pr.x, pr.y, rad, col[0], col[1], col[2], 0.78, 2.0, pr.id * 0.37);
    }

    // Glowing Enemy & Boss Eyes + Phase 2 Reactor Aura (sh_eyeglow parity)
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.isBoss) {
        const isP2 = e.bossPhase === 2;
        const bc = isP2 ? ([1.0, 0.26, 0.62] as const) : ([0.35, 0.92, 1.0] as const);
        batch.drawLight(e.x, e.y - 16, isP2 ? 128 : 96, bc[0], bc[1], bc[2], isP2 ? 1.1 : 0.72, 1.8, e.id);
        // Pinpoint glowing boss eye glare
        batch.drawLight(e.x, e.y - 26, 28, 1.0, isP2 ? 0.45 : 0.92, isP2 ? 0.75 : 1.0, 0.85, 2.2, e.id + 1);
      } else {
        // Enemy glowing eye pinpoint + elemental burn/freeze/acid aura
        batch.drawLight(e.x, e.y - 10, 20, 1.0, 0.25, 0.28, 0.48, 2.4, e.id * 0.5);
        if (e.status.burnTicks > 0) batch.drawLight(e.x, e.y - 6, 36, 1.0, 0.45, 0.12, 0.75, 2.0, e.id);
        if (e.status.freezeTicks > 0) batch.drawLight(e.x, e.y - 6, 34, 0.35, 0.9, 1.0, 0.7, 2.0, 0);
        if (e.status.acidTicks > 0 || e.status.radTicks > 0) {
          batch.drawLight(e.x, e.y - 6, 34, 0.55, 1.0, 0.25, 0.68, 2.0, 0);
        }
      }
    }

    // Pickups & Chests subtle jewel glint
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i];
      const c =
        pk.kind === 'hp'
          ? ([1.0, 0.25, 0.35] as const)
          : pk.kind === 'gold'
            ? ([1.0, 0.82, 0.25] as const)
            : pk.kind === 'xp'
              ? ([0.28, 0.92, 1.0] as const)
              : ([0.75, 0.45, 1.0] as const);
      batch.drawLight(pk.x, pk.y, 26, c[0], c[1], c[2], 0.45, 2.2, pk.id * 0.4);
    }

    // Frost Crystals icy glare
    for (let i = 0; i < state.freezeStorm.crystals.length; i++) {
      const cr = state.freezeStorm.crystals[i];
      batch.drawLight(cr.x, cr.y - 8, 62, 0.35, 0.92, 1.0, 0.95, 1.8, cr.id);
    }

    // Bifrost Exit Portal rainbow glow
    if (state.map.exitUnlocked && state.screenMode === 'combat') {
      const r = 0.5 + 0.5 * Math.sin(timeSec * 3.0);
      const g = 0.5 + 0.5 * Math.sin(timeSec * 3.0 + 2.1);
      const b = 0.5 + 0.5 * Math.sin(timeSec * 3.0 + 4.2);
      batch.drawLight(state.map.exitX, state.map.exitY, 108, r, g, b, 1.15, 1.7, 1.0);
    }

    // Hub Landmarks ambient neon glows
    if (state.screenMode === 'hub') {
      for (let i = 0; i < state.hubInteractables.length; i++) {
        const it = state.hubInteractables[i];
        const hc =
          it.id === 'loki'
            ? ([0.2, 1.0, 0.62] as const)
            : it.id === 'skill_tree'
              ? ([0.35, 1.0, 0.55] as const)
              : it.id === 'bifrost'
                ? ([0.35, 0.92, 1.0] as const)
                : ([0.95, 0.68, 0.32] as const);
        batch.drawLight(it.x, it.y - 12, 86, hc[0], hc[1], hc[2], 0.82, 1.75, i + 1);
      }
    }

    // Sampled glowing Lava tiles within visible viewport
    if (biome.hasLavaLake || state.act === 3) {
      const map = state.map;
      const ts = map.tileSize || TILE_SIZE;
      const minTx = Math.max(0, Math.floor(viewLeft / ts));
      const maxTx = Math.min(map.width - 1, Math.ceil((viewLeft + viewW) / ts));
      const minTy = Math.max(0, Math.floor(viewTop / ts));
      const maxTy = Math.min(map.height - 1, Math.ceil((viewTop + viewH) / ts));
      for (let ty = minTy; ty <= maxTy; ty += 2) {
        for (let tx = minTx; tx <= maxTx; tx += 2) {
          if (map.tiles[ty * map.width + tx] === TileKind.Lava) {
            batch.drawLight(tx * ts + 8, ty * ts + 8, 46, 1.0, 0.42, 0.12, 0.55, 2.0, tx + ty);
          }
        }
      }
    }

    // Transient Muzzle Flashes, Explosions, Level-Ups, Boss Phase Shifts
    for (let i = 0; i < this.flashLights.length; i++) {
      const fl = this.flashLights[i];
      if (!fl.active) continue;
      const t = fl.life / fl.maxLife;
      batch.drawLight(fl.x, fl.y, fl.radius * (0.7 + 0.3 * t), fl.r, fl.g, fl.b, fl.intensity * t, 1.6, 0);
    }

    batch.flush();

    // 5B. Composite sceneFbo * lightFbo + emissive overbright -> litFbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.litFbo!.fbo);
    gl.viewport(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    gl.disable(gl.BLEND);
    gl.useProgram(shaders.lightingComposite.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.tex);
    gl.uniform1i(shaders.lightingComposite.uniforms.uSceneTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightFbo!.tex);
    gl.uniform1i(shaders.lightingComposite.uniforms.uLightTex, 1);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // --------------------------------------------------------------------------
  // PASS 6 IMPLEMENTATION (Post FX + Crisp Nearest-Neighbor Aspect Upscaler)
  // --------------------------------------------------------------------------

  private renderPass6PostFx(
    _state: SimState,
    _settings: RenderSettings,
    timeSec: number,
    viewLeft: number,
    viewTop: number,
    viewW: number,
    viewH: number,
    shakeX: number,
    shakeY: number,
    frostIntensity: number,
    snowIntensity: number,
    lowHpPulse = 0,
    powerGlow = 0
  ): void {
    const gl = this.gl!;
    const shaders = this.shaders!;

    // Clear full backing canvas to dark letterbox bars
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.02, 0.02, 0.035, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Draw crisp 16:9 aspect-preserving upscaled viewport
    const vp = this.glViewport;
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    gl.disable(gl.BLEND);
    gl.useProgram(shaders.postFx.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.litFbo!.tex);
    gl.uniform1i(shaders.postFx.uniforms.uTex, 0);
    gl.uniform2f(shaders.postFx.uniforms.uResolution, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    gl.uniform1f(shaders.postFx.uniforms.uTime, timeSec);
    gl.uniform2f(shaders.postFx.uniforms.uShakeOffset, shakeX, shakeY);
    gl.uniform1f(shaders.postFx.uniforms.uFrostIntensity, frostIntensity);
    gl.uniform1f(shaders.postFx.uniforms.uSnowIntensity, snowIntensity);
    gl.uniform1f(shaders.postFx.uniforms.uDamageFlash, this.damageFlash);
    gl.uniform1f(shaders.postFx.uniforms.uLowHpPulse, lowHpPulse);
    gl.uniform1f(shaders.postFx.uniforms.uPowerGlow, powerGlow);

    // Pack active radial shockwaves converted to FBO UV space (Y inverted for GL UV)
    let swCount = 0;
    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      const uvX = (sw.worldX - viewLeft) / viewW;
      const uvY = 1.0 - (sw.worldY - viewTop) / viewH;
      const fade = sw.life / sw.maxLife;
      const base = swCount * 4;
      this.shockwaveUniformData[base] = uvX;
      this.shockwaveUniformData[base + 1] = uvY;
      this.shockwaveUniformData[base + 2] = sw.radius;
      this.shockwaveUniformData[base + 3] = sw.strength * fade;
      swCount++;
    }
    gl.uniform1i(shaders.postFx.uniforms.uShockwaveCount, swCount);
    gl.uniform4fv(shaders.postFx.uniforms.uShockwaves, this.shockwaveUniformData);

    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private interpCoord(prev: number, curr: number, alpha: number, pixelSnap: boolean): number {
    const val = prev + (curr - prev) * alpha;
    return pixelSnap ? Math.round(val) : val;
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    const freeFbo = (t: FboTarget | null) => {
      if (!t) return;
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    };
    freeFbo(this.sceneFbo);
    freeFbo(this.decalFboA);
    freeFbo(this.decalFboB);
    freeFbo(this.shadowFbo);
    freeFbo(this.lightFbo);
    freeFbo(this.litFbo);
    this.sceneFbo = null;
    this.decalFboA = null;
    this.decalFboB = null;
    this.shadowFbo = null;
    this.lightFbo = null;
    this.litFbo = null;

    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    this.emptyVao = null;
    this.batch?.dispose();
    this.batch = null;
    this.shaders?.dispose(gl);
    this.shaders = null;
    this.gl = null;
  }
}
