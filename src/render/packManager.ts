// ============================================================================
// KRUNKEDFALL — Dual-Mode Asset Pack Manager (Built-In + Owned Custom Pack)
// ============================================================================
// Supports:
//   1. Built-In 100% original Krunked pixel-art atlases (always loaded & ready)
//   2. Dev-mode auto-mount of gitignored `/.krunkedfall-assets/manifest.json`
//   3. Client-side Folder Picker (`<input webkitdirectory>`) cached in
//      IndexedDB (`krunkedfall_custom_pack_v1`) across reloads
//   4. Instant zero-restart live switching between `'builtin'` and `'custom'`
//      with exact GMS2 TPAG trimmed-rect pivot compensation & Built-In fallback.

import type { AssetPackMode, PackManifest, SpriteMeta } from '../contracts/index';
import {
  buildBuiltinPackPages,
  getBuiltinFontAtlas,
  getBuiltinPackManifest,
  type BuiltinPackData,
} from '../assets/index';

const IDB_NAME = 'krunkedfall_custom_pack_v1';
const IDB_STORE = 'pack';
const IDB_RECORD_KEY = 'active_custom_pack';
const DEV_PACK_BASE = '/.krunkedfall-assets/';

export interface ResolvedSprite {
  pageTexture: WebGLTexture;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  frameCount: number;
  sourcePack: AssetPackMode;
}

export interface CustomPackImportResult {
  ok: boolean;
  spriteCount: number;
  pageCount: number;
  error?: string;
}

interface StoredCustomPack {
  manifest: PackManifest;
  pages: Record<string, Blob>;
  sounds: Record<string, Blob>;
  music: Record<string, Blob>;
  savedAt: number;
}

function openPackDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readStoredPack(): Promise<StoredCustomPack | null> {
  const db = await openPackDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_RECORD_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as StoredCustomPack | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeStoredPack(record: StoredCustomPack): Promise<void> {
  const db = await openPackDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record, IDB_RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function deleteStoredPack(): Promise<void> {
  const db = await openPackDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

function createNearestTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('[Krunkedfall WebGL2] Failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function uploadRgbaTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  rgba: Uint8ClampedArray
): WebGLTexture {
  const tex = createNearestTexture(gl);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function uploadImageSourceTexture(
  gl: WebGL2RenderingContext,
  source: ImageBitmap | HTMLImageElement
): WebGLTexture {
  const tex = createNearestTexture(gl);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

async function loadBlobToImageSource(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function normalizeRelPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export class PackManager {
  private gl: WebGL2RenderingContext | null = null;
  private mode: AssetPackMode = 'builtin';
  private customPackAvailable = false;

  // Built-in pack (always resident)
  private readonly builtinData: BuiltinPackData;
  private builtinTextures: WebGLTexture[] = [];
  private fontTexture: WebGLTexture | null = null;

  // Custom pack (from dev server OR IndexedDB / Folder Picker)
  private customManifest: PackManifest | null = null;
  private customSourceKind: 'none' | 'dev' | 'blob' = 'none';
  private customPageBlobs = new Map<string, Blob>();
  private customAudioUrls = new Map<string, string>();
  private customPageTextures = new Map<number, WebGLTexture>();
  private customPagesLoading = new Set<number>();
  private customPagesFailed = new Set<number>();

  private listeners = new Set<(mode: AssetPackMode, available: boolean) => void>();

  constructor() {
    this.builtinData = buildBuiltinPackPages();
  }

  onChange(listener: (mode: AssetPackMode, available: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitChange(): void {
    for (const fn of this.listeners) {
      fn(this.mode, this.customPackAvailable);
    }
  }

  attachGL(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    // Upload Built-In pixel-art atlas pages once
    this.builtinTextures = this.builtinData.pages.map((p) =>
      uploadRgbaTexture(gl, p.width, p.height, p.rgba)
    );
    // Upload crisp outlined pixel bitmap font atlas once
    const fontAtlas = getBuiltinFontAtlas();
    this.fontTexture = uploadRgbaTexture(gl, fontAtlas.width, fontAtlas.height, fontAtlas.rgba);

    // If custom manifest is already mounted and active, warm priority pages
    if (this.customManifest && this.mode === 'custom') {
      this.warmPriorityCustomPages();
    }
  }

  getMode(): AssetPackMode {
    return this.mode;
  }

  isCustomPackAvailable(): boolean {
    return this.customPackAvailable;
  }

  getBuiltinManifest(): PackManifest {
    return this.builtinData.manifest;
  }

  getCustomManifest(): PackManifest | null {
    return this.customManifest;
  }

  getActiveManifest(): PackManifest {
    if (this.mode === 'custom' && this.customManifest) {
      return this.customManifest;
    }
    return this.builtinData.manifest;
  }

  getFontTexture(): WebGLTexture | null {
    return this.fontTexture;
  }

  /**
   * Auto-detects dev-mode `/.krunkedfall-assets/manifest.json` OR cached IndexedDB custom pack.
   * Safe to call in both browser and static production deployments (never throws on 404).
   */
  async detectCustomPack(): Promise<boolean> {
    // 1. Check dev-mode read-only middleware first (fresh extracted assets on disk)
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`${DEV_PACK_BASE}manifest.json`, { cache: 'no-store' });
        if (res.ok) {
          const contentType = res.headers.get('content-type') ?? '';
          if (contentType.includes('json') || contentType === '') {
            const manifest = (await res.json()) as PackManifest;
            if (manifest && manifest.sprites && Array.isArray(manifest.pages) && manifest.pages.length > 0) {
              this.clearCustomTextures();
              this.revokeCustomAudioUrls();
              this.customManifest = manifest;
              this.customSourceKind = 'dev';
              this.customPackAvailable = true;
              this.emitChange();
              if (this.mode === 'custom') {
                this.warmPriorityCustomPages();
              }
              return true;
            }
          }
        }
      } catch {
        // Static build or offline — silently fall through to IndexedDB check
      }
    }

    // 2. Fallback: Check IndexedDB cache from a previous Folder Picker import
    const stored = await readStoredPack();
    if (stored && stored.manifest && Array.isArray(stored.manifest.pages) && stored.manifest.pages.length > 0) {
      this.mountBlobPack(stored.manifest, stored.pages, stored.sounds, stored.music);
      return true;
    }

    return false;
  }

  /**
   * Imports an operator-owned extracted `.krunkedfall-assets` folder via `<input webkitdirectory>`,
   * caches all PNG pages & audio files into IndexedDB (`krunkedfall_custom_pack_v1`),
   * and activates Custom Pack mode immediately with zero restart.
   */
  async loadCustomPackFromFiles(files: FileList | readonly File[]): Promise<CustomPackImportResult> {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) {
      return { ok: false, spriteCount: 0, pageCount: 0, error: 'No files selected.' };
    }

    // Find manifest.json and determine optional leading directory prefix
    let manifestFile: File | null = null;
    let basePrefix = '';
    for (const f of fileArr) {
      const rel = normalizeRelPath(f.webkitRelativePath || f.name);
      if (rel === 'manifest.json' || rel.endsWith('/manifest.json')) {
        manifestFile = f;
        basePrefix = rel.slice(0, rel.length - 'manifest.json'.length);
        break;
      }
    }

    if (!manifestFile) {
      return {
        ok: false,
        spriteCount: 0,
        pageCount: 0,
        error: 'manifest.json not found in selected folder. Select your extracted .krunkedfall-assets folder.',
      };
    }

    let manifest: PackManifest;
    try {
      const text = await manifestFile.text();
      manifest = JSON.parse(text) as PackManifest;
    } catch (err) {
      return {
        ok: false,
        spriteCount: 0,
        pageCount: 0,
        error: `Invalid manifest.json: ${String(err)}`,
      };
    }

    if (!manifest.sprites || !Array.isArray(manifest.pages) || manifest.pages.length === 0) {
      return {
        ok: false,
        spriteCount: 0,
        pageCount: 0,
        error: 'manifest.json is missing sprites or pages entries.',
      };
    }

    const pages: Record<string, Blob> = {};
    const sounds: Record<string, Blob> = {};
    const music: Record<string, Blob> = {};

    for (const f of fileArr) {
      const fullRel = normalizeRelPath(f.webkitRelativePath || f.name);
      const rel = basePrefix && fullRel.startsWith(basePrefix) ? fullRel.slice(basePrefix.length) : fullRel;
      if (rel.startsWith('pages/') && rel.endsWith('.png')) {
        pages[rel] = f;
      } else if (rel.startsWith('sounds/') && (rel.endsWith('.wav') || rel.endsWith('.ogg'))) {
        sounds[rel] = f;
      } else if (rel.startsWith('music/') && (rel.endsWith('.ogg') || rel.endsWith('.wav') || rel.endsWith('.mp3'))) {
        music[rel] = f;
      }
    }

    const pageCount = Object.keys(pages).length;
    if (pageCount === 0) {
      return {
        ok: false,
        spriteCount: 0,
        pageCount: 0,
        error: 'No PNG texture pages found under pages/.',
      };
    }

    this.mountBlobPack(manifest, pages, sounds, music);
    this.mode = 'custom';
    this.warmPriorityCustomPages();
    this.emitChange();

    // Persist asynchronously to IndexedDB so reloads remember the operator's pack
    void writeStoredPack({
      manifest,
      pages,
      sounds,
      music,
      savedAt: Date.now(),
    });

    return {
      ok: true,
      spriteCount: Object.keys(manifest.sprites).length,
      pageCount,
    };
  }

  private mountBlobPack(
    manifest: PackManifest,
    pages: Record<string, Blob>,
    sounds: Record<string, Blob>,
    music: Record<string, Blob>
  ): void {
    this.clearCustomTextures();
    this.revokeCustomAudioUrls();
    this.customPageBlobs.clear();

    for (const [rel, blob] of Object.entries(pages)) {
      this.customPageBlobs.set(normalizeRelPath(rel), blob);
    }
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      for (const [rel, blob] of Object.entries(sounds)) {
        this.customAudioUrls.set(normalizeRelPath(rel), URL.createObjectURL(blob));
      }
      for (const [rel, blob] of Object.entries(music)) {
        this.customAudioUrls.set(normalizeRelPath(rel), URL.createObjectURL(blob));
      }
    }

    this.customManifest = manifest;
    this.customSourceKind = 'blob';
    this.customPackAvailable = true;
    this.emitChange();
  }

  async clearCustomPackCache(): Promise<void> {
    await deleteStoredPack();
    if (this.customSourceKind === 'blob') {
      this.clearCustomTextures();
      this.revokeCustomAudioUrls();
      this.customPageBlobs.clear();
      this.customManifest = null;
      this.customSourceKind = 'none';
      this.customPackAvailable = false;
      this.mode = 'builtin';
      this.emitChange();
    }
  }

  async setMode(nextMode: AssetPackMode): Promise<boolean> {
    if (nextMode === 'builtin') {
      this.mode = 'builtin';
      this.emitChange();
      return true;
    }
    if (!this.customPackAvailable) {
      await this.detectCustomPack();
    }
    if (!this.customPackAvailable || !this.customManifest) {
      this.mode = 'builtin';
      this.emitChange();
      return false;
    }
    this.mode = 'custom';
    this.warmPriorityCustomPages();
    this.emitChange();
    return true;
  }

  /**
   * Resolves a custom pack audio file URL (dev server or Blob URL) for AudioEngine.
   */
  resolveAudioUrl(logicalKey: string, kind: 'sfx' | 'music'): string | null {
    if (this.mode !== 'custom' || !this.customManifest) return null;
    const m = this.customManifest;
    const mapped = m.logicalAliases?.[logicalKey] ?? logicalKey;

    let relFile: string | null = null;
    if (kind === 'music') {
      relFile = m.music[mapped] ?? m.music[logicalKey] ?? null;
    } else {
      const sfxEntry = m.sounds[mapped] ?? m.sounds[logicalKey];
      relFile = sfxEntry ? sfxEntry.file : null;
    }
    if (!relFile) return null;

    const cleanRel = normalizeRelPath(relFile);
    if (this.customSourceKind === 'dev') {
      return `${DEV_PACK_BASE}${cleanRel}`;
    }
    if (this.customSourceKind === 'blob') {
      return this.customAudioUrls.get(cleanRel) ?? null;
    }
    return null;
  }

  /**
   * Preloads custom texture pages referenced by core gameplay logical keys so
   * toggling Custom Pack displays retail sprites immediately.
   */
  private warmPriorityCustomPages(): void {
    if (!this.gl || !this.customManifest) return;
    const m = this.customManifest;
    const priorityPages = new Set<number>();
    const aliases = Object.entries(m.logicalAliases ?? {});
    // Warm core world tilesets, outcasts, bosses, hub stations, and FX first
    for (const [aliasKey, targetName] of aliases) {
      if (
        aliasKey.startsWith('tile_') ||
        aliasKey.startsWith('outcast_') ||
        aliasKey.startsWith('boss_') ||
        aliasKey.startsWith('hub_') ||
        aliasKey.startsWith('fx_')
      ) {
        const sp = m.sprites[targetName];
        if (sp && sp.frames.length > 0) {
          priorityPages.add(sp.frames[0].page);
        }
      }
    }
    for (const [, targetName] of aliases) {
      const sp = m.sprites[targetName];
      if (sp && sp.frames.length > 0) {
        priorityPages.add(sp.frames[0].page);
      }
    }
    let count = 0;
    for (const pageIdx of priorityPages) {
      this.ensureCustomPageLoaded(pageIdx);
      count++;
      if (count >= 128) break;
    }
  }

  private ensureCustomPageLoaded(pageIndex: number): void {
    if (!this.gl || !this.customManifest) return;
    if (
      this.customPageTextures.has(pageIndex) ||
      this.customPagesLoading.has(pageIndex) ||
      this.customPagesFailed.has(pageIndex)
    ) {
      return;
    }
    const pageMeta =
      this.customManifest.pages.find((p) => p.index === pageIndex) ??
      this.customManifest.pages[pageIndex];
    if (!pageMeta) {
      this.customPagesFailed.add(pageIndex);
      return;
    }

    this.customPagesLoading.add(pageIndex);
    const cleanRel = normalizeRelPath(pageMeta.file);

    const loadAsync = async (): Promise<void> => {
      try {
        let blob: Blob | undefined;
        if (this.customSourceKind === 'blob') {
          blob = this.customPageBlobs.get(cleanRel);
        } else if (this.customSourceKind === 'dev' && typeof fetch === 'function') {
          const res = await fetch(`${DEV_PACK_BASE}${cleanRel}`);
          if (res.ok) {
            blob = await res.blob();
          }
        }
        if (!blob || !this.gl) {
          this.customPagesFailed.add(pageIndex);
          return;
        }
        const imgSrc = await loadBlobToImageSource(blob);
        if (!this.gl) {
          if ('close' in imgSrc && typeof imgSrc.close === 'function') imgSrc.close();
          return;
        }
        const tex = uploadImageSourceTexture(this.gl, imgSrc);
        if ('close' in imgSrc && typeof imgSrc.close === 'function') imgSrc.close();
        this.customPageTextures.set(pageIndex, tex);
      } catch {
        this.customPagesFailed.add(pageIndex);
      } finally {
        this.customPagesLoading.delete(pageIndex);
      }
    };

    void loadAsync();
  }

  /**
   * Resolves ANY logical sprite key (or optional GMS2 spriteId) to exact texture,
   * normalized UV rect, dimensions, and exact trimmed-rect pivot (originX, originY).
   * Always falls back cleanly to Built-In Krunked Art if a key or page is absent.
   */
  resolveSprite(logicalKey: string, frameIndex = 0, spriteId?: number): ResolvedSprite {
    // 1. Try Custom Pack if active
    if (this.mode === 'custom' && this.customManifest && this.gl) {
      const resolved = this.tryResolveFromCustom(logicalKey, frameIndex, spriteId);
      if (resolved) return resolved;
    }

    // 2. Built-In Original Krunked Pack (guaranteed non-null fallback)
    return this.resolveFromBuiltin(logicalKey, frameIndex);
  }

  /**
   * Resolves a specialized key (e.g. `tile_floor_darkcity`) first, falling back
   * cleanly to a generic key (e.g. `tile_floor`) in both Custom and Built-In modes.
   */
  resolveSpriteWithFallback(primaryKey: string, fallbackKey: string, frameIndex = 0): ResolvedSprite {
    if (this.mode === 'custom' && this.customManifest && this.gl) {
      const primary = this.tryResolveFromCustom(primaryKey, frameIndex);
      if (primary) return primary;
      const fallback = this.tryResolveFromCustom(fallbackKey, frameIndex);
      if (fallback) return fallback;
    }

    const m = this.builtinData.manifest;
    const primaryAlias = m.logicalAliases[primaryKey];
    if ((primaryAlias && m.sprites[primaryAlias]) || m.sprites[primaryKey]) {
      return this.resolveFromBuiltin(primaryKey, frameIndex);
    }
    return this.resolveFromBuiltin(fallbackKey, frameIndex);
  }

  getWhitePixel(): ResolvedSprite {
    return this.resolveFromBuiltin('fx_white_1x1', 0);
  }

  private tryResolveFromCustom(
    logicalKey: string,
    frameIndex: number,
    spriteId?: number
  ): ResolvedSprite | null {
    const m = this.customManifest;
    if (!m) return null;

    let meta: SpriteMeta | undefined;
    if (spriteId !== undefined && spriteId >= 0) {
      const byId = m.spriteIdToName?.[String(spriteId)];
      if (byId) meta = m.sprites[byId];
    }
    if (!meta) {
      const alias = m.logicalAliases?.[logicalKey];
      if (alias) meta = m.sprites[alias];
    }
    if (!meta) {
      meta = m.sprites[logicalKey];
    }
    if (!meta || meta.frames.length === 0) return null;

    const fi = ((Math.floor(frameIndex) % meta.frames.length) + meta.frames.length) % meta.frames.length;
    const f = meta.frames[fi];
    const tex = this.customPageTextures.get(f.page);
    if (!tex) {
      // Kick off background async load and seamlessly show Built-In sprite until ready
      this.ensureCustomPageLoaded(f.page);
      return null;
    }

    const pageInfo = m.pages.find((p) => p.index === f.page) ?? m.pages[f.page];
    const pageW = Math.max(1, pageInfo?.width ?? 2048);
    const pageH = Math.max(1, pageInfo?.height ?? 2048);

    // Exact GMS2 TPAG trimmed-rect pivot compensation:
    // Trimmed quad size is (tgtW, tgtH), placed at (tgtX, tgtY) inside logical sprite box,
    // so pivot relative to trimmed quad top-left is (originX - tgtX, originY - tgtY).
    const quadW = f.tgtW > 0 ? f.tgtW : f.srcW;
    const quadH = f.tgtH > 0 ? f.tgtH : f.srcH;

    return {
      pageTexture: tex,
      u0: f.srcX / pageW,
      v0: f.srcY / pageH,
      u1: (f.srcX + f.srcW) / pageW,
      v1: (f.srcY + f.srcH) / pageH,
      width: quadW,
      height: quadH,
      originX: meta.originX - f.tgtX,
      originY: meta.originY - f.tgtY,
      frameCount: meta.frames.length,
      sourcePack: 'custom',
    };
  }

  private resolveFromBuiltin(logicalKey: string, frameIndex: number): ResolvedSprite {
    const m = this.builtinData.manifest;
    const alias = m.logicalAliases[logicalKey];
    let meta = (alias ? m.sprites[alias] : undefined) ?? m.sprites[logicalKey];

    if (!meta) {
      // Smart prefix fallback so unknown keys NEVER render broken squares
      if (logicalKey.startsWith('wep_')) meta = m.sprites.wep_rifle;
      else if (logicalKey.startsWith('boss_')) meta = m.sprites.boss_krunked_p1;
      else if (logicalKey.startsWith('enemy_')) meta = m.sprites.enemy_default;
      else if (logicalKey.startsWith('outcast_')) meta = m.sprites.outcast_britta;
      else if (logicalKey.startsWith('pickup_')) meta = m.sprites.pickup_gold;
      else if (logicalKey.startsWith('proj_')) meta = m.sprites.proj_bullet;
      else if (logicalKey.startsWith('hub_')) meta = m.sprites.hub_jotunn;
      else if (logicalKey.startsWith('tile_wall_face')) meta = m.sprites.tile_wall_face;
      else if (logicalKey.startsWith('tile_wall_broken')) meta = m.sprites.tile_wall_broken;
      else if (logicalKey.startsWith('tile_wall')) meta = m.sprites.tile_wall;
      else if (logicalKey.startsWith('tile_rubble')) meta = m.sprites.tile_rubble;
      else if (logicalKey.startsWith('tile_')) meta = m.sprites.tile_floor;
      else meta = m.sprites.fx_white_1x1;
    }

    const fi = ((Math.floor(frameIndex) % meta.frames.length) + meta.frames.length) % meta.frames.length;
    const f = meta.frames[fi];
    const pageInfo = m.pages[f.page];
    const pageW = pageInfo.width;
    const pageH = pageInfo.height;
    const tex = this.builtinTextures[f.page];

    return {
      pageTexture: tex,
      u0: f.srcX / pageW,
      v0: f.srcY / pageH,
      u1: (f.srcX + f.srcW) / pageW,
      v1: (f.srcY + f.srcH) / pageH,
      width: f.srcW,
      height: f.srcH,
      originX: meta.originX - f.tgtX,
      originY: meta.originY - f.tgtY,
      frameCount: meta.frames.length,
      sourcePack: 'builtin',
    };
  }

  private clearCustomTextures(): void {
    if (this.gl) {
      for (const tex of this.customPageTextures.values()) {
        this.gl.deleteTexture(tex);
      }
    }
    this.customPageTextures.clear();
    this.customPagesLoading.clear();
    this.customPagesFailed.clear();
  }

  private revokeCustomAudioUrls(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      for (const url of this.customAudioUrls.values()) {
        URL.revokeObjectURL(url);
      }
    }
    this.customAudioUrls.clear();
  }

  dispose(): void {
    if (this.gl) {
      for (const tex of this.builtinTextures) {
        this.gl.deleteTexture(tex);
      }
      if (this.fontTexture) {
        this.gl.deleteTexture(this.fontTexture);
      }
    }
    this.builtinTextures = [];
    this.fontTexture = null;
    this.clearCustomTextures();
    this.revokeCustomAudioUrls();
    this.gl = null;
  }
}

export { getBuiltinPackManifest };
