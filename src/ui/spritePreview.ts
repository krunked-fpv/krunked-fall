// ============================================================================
// KRUNKEDFALL — Cached Crisp Pixel-Art Sprite Preview Renderer for UI
// ============================================================================
// Renders sprites directly from the Built-In pixel-art atlas onto crisp
// nearest-neighbor canvases or cached PNG data URLs for Outcasts (with 3-stop
// Skin palette remapping!), Loki's Head, all 221 Weapons (+ Golden shimmer),
// all 129 Enemies, all 6 Two-Phase Bosses, and Mod/Pickup runes.
// 100% safe in headless/mock DOM environments (graceful null fallback).

import type {
  AmmoType,
  OutcastId,
  SkinId,
  WeaponClass,
} from '../contracts/index.js';
import {
  buildBuiltinPackPages,
  getBuiltinPackManifest,
  selectWeaponArchetypeKey,
} from '../assets/index.js';
import { getOutcastDef, getSkinDef } from '../data/index.js';

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [
      Number.isNaN(r) ? 255 : r,
      Number.isNaN(g) ? 255 : g,
      Number.isNaN(b) ? 255 : b,
    ];
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [
    Number.isNaN(r) ? 255 : r,
    Number.isNaN(g) ? 255 : g,
    Number.isNaN(b) ? 255 : b,
  ];
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

let sharedOffscreen: HTMLCanvasElement | null = null;
const dataUrlCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 600;

function canUse2dCanvas(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function getOffscreen(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (!canUse2dCanvas()) return null;
  if (!sharedOffscreen) {
    sharedOffscreen = document.createElement('canvas');
  }
  if (sharedOffscreen.width !== w || sharedOffscreen.height !== h) {
    sharedOffscreen.width = w;
    sharedOffscreen.height = h;
  }
  const ctx = sharedOffscreen.getContext('2d');
  if (!ctx) return null;
  return { canvas: sharedOffscreen, ctx };
}

function resolveBuiltinFrame(rawKey: string, frameIndex = 0) {
  const manifest = getBuiltinPackManifest();
  const { pages } = buildBuiltinPackPages();
  const resolvedKey = manifest.logicalAliases[rawKey] ?? rawKey;
  const meta = manifest.sprites[resolvedKey] ?? manifest.sprites[rawKey];
  if (!meta || meta.frames.length === 0) return null;
  const frame = meta.frames[Math.abs(frameIndex) % meta.frames.length];
  const page = pages[frame.page];
  if (!page) return null;
  return { frame, page };
}

export interface SpriteDrawOptions {
  frameIndex?: number;
  skinId?: SkinId;
  tintHex?: string;
  padding?: number;
  fixedScale?: number;
}

/**
 * Draws any Built-In sprite crisp nearest-neighbor centered inside `canvas`,
 * optionally applying Outcast 3-stop skin palette remapping or enemy tint.
 */
export function drawSpriteToCanvas(
  canvas: HTMLCanvasElement,
  spriteKey: string,
  opts: SpriteDrawOptions = {},
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const resolved = resolveBuiltinFrame(spriteKey, opts.frameIndex ?? 0);
  if (!resolved) return false;

  const { frame, page } = resolved;
  const fw = frame.srcW;
  const fh = frame.srcH;
  const off = getOffscreen(fw, fh);
  if (!off) return false;

  const imgData = off.ctx.createImageData(fw, fh);
  const dst = imgData.data;
  const src = page.rgba;
  const pageW = page.width;

  const applySkinSwap = opts.skinId !== undefined && opts.skinId !== 'original';
  const skin = applySkinSwap ? getSkinDef(opts.skinId!) : null;
  const p0 = skin ? parseHexColor(skin.paletteSwap[0]) : ([255, 255, 255] as const);
  const p1 = skin ? parseHexColor(skin.paletteSwap[1]) : ([255, 255, 255] as const);
  const p2 = skin ? parseHexColor(skin.paletteSwap[2]) : ([255, 255, 255] as const);

  const hasTint = Boolean(opts.tintHex && opts.tintHex.toLowerCase() !== '#ffffff');
  const tint = hasTint ? parseHexColor(opts.tintHex!) : ([255, 255, 255] as const);

  for (let y = 0; y < fh; y++) {
    const srcRowOffset = ((frame.srcY + y) * pageW + frame.srcX) * 4;
    const dstRowOffset = y * fw * 4;
    for (let x = 0; x < fw; x++) {
      const sIdx = srcRowOffset + x * 4;
      const dIdx = dstRowOffset + x * 4;
      const r = src[sIdx];
      const g = src[sIdx + 1];
      const b = src[sIdx + 2];
      const a = src[sIdx + 3];

      if (a === 0) {
        dst[dIdx] = 0;
        dst[dIdx + 1] = 0;
        dst[dIdx + 2] = 0;
        dst[dIdx + 3] = 0;
        continue;
      }

      if (applySkinSwap) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const chroma = (maxC - minC) / 255;

        if (lum < 0.11) {
          dst[dIdx] = r;
          dst[dIdx + 1] = g;
          dst[dIdx + 2] = b;
          dst[dIdx + 3] = a;
          continue;
        }
        if (lum > 0.94 && chroma < 0.08) {
          dst[dIdx] = clampByte(r * 0.78 + p0[0] * 0.22);
          dst[dIdx + 1] = clampByte(g * 0.78 + p0[1] * 0.22);
          dst[dIdx + 2] = clampByte(b * 0.78 + p0[2] * 0.22);
          dst[dIdx + 3] = a;
          continue;
        }
        if (chroma > 0.3 && lum > 0.22) {
          const target = lum > 0.52 ? p0 : p1;
          dst[dIdx] = clampByte(r * 0.24 + target[0] * 0.76);
          dst[dIdx + 1] = clampByte(g * 0.24 + target[1] * 0.76);
          dst[dIdx + 2] = clampByte(b * 0.24 + target[2] * 0.76);
          dst[dIdx + 3] = a;
          continue;
        }

        let sr: number;
        let sg: number;
        let sb: number;
        if (lum < 0.38) {
          const t = Math.max(0, Math.min(1, (lum - 0.11) / 0.27));
          sr = p2[0] + (p1[0] - p2[0]) * t;
          sg = p2[1] + (p1[1] - p2[1]) * t;
          sb = p2[2] + (p1[2] - p2[2]) * t;
        } else {
          const t = Math.max(0, Math.min(1, (lum - 0.38) / 0.56));
          sr = p1[0] + (p0[0] - p1[0]) * t;
          sg = p1[1] + (p0[1] - p1[1]) * t;
          sb = p1[2] + (p0[2] - p1[2]) * t;
        }
        const shadeBoost = 0.52 + lum * 0.62;
        dst[dIdx] = clampByte(r * 0.36 + sr * shadeBoost * 0.64);
        dst[dIdx + 1] = clampByte(g * 0.36 + sg * shadeBoost * 0.64);
        dst[dIdx + 2] = clampByte(b * 0.36 + sb * shadeBoost * 0.64);
        dst[dIdx + 3] = a;
      } else if (hasTint) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum < 0.12) {
          dst[dIdx] = r;
          dst[dIdx + 1] = g;
          dst[dIdx + 2] = b;
          dst[dIdx + 3] = a;
        } else {
          dst[dIdx] = clampByte((r * (0.58 + (tint[0] / 255) * 0.42)));
          dst[dIdx + 1] = clampByte((g * (0.58 + (tint[1] / 255) * 0.42)));
          dst[dIdx + 2] = clampByte((b * (0.58 + (tint[2] / 255) * 0.42)));
          dst[dIdx + 3] = a;
        }
      } else {
        dst[dIdx] = r;
        dst[dIdx + 1] = g;
        dst[dIdx + 2] = b;
        dst[dIdx + 3] = a;
      }
    }
  }

  off.ctx.putImageData(imgData, 0, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const pad = opts.padding ?? 4;
  const availW = Math.max(8, canvas.width - pad * 2);
  const availH = Math.max(8, canvas.height - pad * 2);
  const autoScale = Math.max(1, Math.floor(Math.min(availW / fw, availH / fh)));
  const scale = opts.fixedScale ?? autoScale;
  const drawW = fw * scale;
  const drawH = fh * scale;
  const dx = Math.floor((canvas.width - drawW) * 0.5);
  const dy = Math.floor((canvas.height - drawH) * 0.5);
  ctx.drawImage(off.canvas, 0, 0, fw, fh, dx, dy, drawW, drawH);
  return true;
}

/**
 * Generates and memoizes a crisp pixel-art PNG Data URL for fast repeated use
 * in card grids (Weapondex 221 cards, Enemydex 129 cards, Outcasts, Bosses, HUD).
 */
export function getSpriteDataUrl(
  spriteKey: string,
  width: number,
  height: number,
  opts: SpriteDrawOptions = {},
): string {
  const cacheKey = `${spriteKey}|${width}x${height}|${opts.frameIndex ?? 0}|${opts.skinId ?? ''}|${opts.tintHex ?? ''}|${opts.fixedScale ?? ''}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (!canUse2dCanvas()) return '';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ok = drawSpriteToCanvas(canvas, spriteKey, opts);
  if (!ok) return '';

  let url = '';
  try {
    url = canvas.toDataURL('image/png');
  } catch {
    url = '';
  }

  if (dataUrlCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = dataUrlCache.keys().next().value;
    if (firstKey !== undefined) dataUrlCache.delete(firstKey);
  }
  dataUrlCache.set(cacheKey, url);
  return url;
}

export function getOutcastPortraitUrl(
  outcastId: OutcastId,
  skinId: SkinId = 'original',
  size = 48,
  frameIndex = 0,
): string {
  const oc = getOutcastDef(outcastId);
  return getSpriteDataUrl(oc.spriteKey, size, size, {
    frameIndex,
    skinId,
    padding: 2,
  });
}

export function getWeaponThumbUrl(
  ammoType: AmmoType,
  weaponClass: WeaponClass,
  uniqueId: number,
  golden = false,
  width = 64,
  height = 36,
): string {
  const key = selectWeaponArchetypeKey(ammoType, weaponClass, uniqueId, golden);
  return getSpriteDataUrl(key, width, height, { padding: 2 });
}

export function getLokiPortraitUrl(size = 48, frameIndex = 0): string {
  return getSpriteDataUrl('hub_loki', size, size, { frameIndex, padding: 2 });
}

export function getBossPortraitUrl(
  spriteKey: string,
  size = 64,
  frameIndex = 0,
): string {
  return getSpriteDataUrl(spriteKey, size, size, { frameIndex, padding: 2 });
}

export function getEnemyPortraitUrl(
  spriteKey: string,
  tintHex?: string,
  size = 40,
): string {
  return getSpriteDataUrl(spriteKey, size, size, { tintHex, padding: 2 });
}

export function getPickupSpriteUrl(
  key: string,
  size = 32,
  tintHex?: string,
): string {
  return getSpriteDataUrl(key, size, size, { tintHex, padding: 2 });
}
