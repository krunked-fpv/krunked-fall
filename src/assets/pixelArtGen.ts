// ============================================================================
// KRUNKEDFALL — Procedural Pixel-Art Engine (DOM-Free, Deterministic)
// ============================================================================
// Pure Uint8ClampedArray RGBA pixel buffer with crisp outlines, metallic
// bevels, Norse runes, cel-shaded volumes, Bayer dithering, and shelf atlas
// packing. Runs identically in headless Node (Gate A) and Browser WebGL2.

export type RGBA = readonly [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b, alpha];
  }
  const r = parseInt(clean.slice(0, 2), 16) & 0xff;
  const g = parseInt(clean.slice(2, 4), 16) & 0xff;
  const b = parseInt(clean.slice(4, 6), 16) & 0xff;
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) & 0xff : alpha;
  return [r, g, b, a];
}

export function shadeColor(c: RGBA, factor: number): RGBA {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * factor))),
    Math.max(0, Math.min(255, Math.round(c[1] * factor))),
    Math.max(0, Math.min(255, Math.round(c[2] * factor))),
    c[3],
  ];
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}

export const INK_OUTLINE: RGBA = [12, 10, 18, 255];
export const INK_DARK: RGBA = [22, 18, 30, 255];
export const TRANSPARENT: RGBA = [0, 0, 0, 0];

/**
 * Deterministic 32-bit xorshift hash for surface texture grain & dithering.
 */
export function pixelHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  clone(): PixelSurface {
    const copy = new PixelSurface(this.width, this.height);
    copy.data.set(this.data);
    return copy;
  }

  getPx(x: number, y: number): RGBA {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return TRANSPARENT;
    }
    const idx = (iy * this.width + ix) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  setPx(x: number, y: number, c: RGBA, blend = false): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return;
    const idx = (iy * this.width + ix) * 4;
    if (!blend || c[3] === 255 || this.data[idx + 3] === 0) {
      if (c[3] === 0 && blend) return;
      this.data[idx] = c[0];
      this.data[idx + 1] = c[1];
      this.data[idx + 2] = c[2];
      this.data[idx + 3] = c[3];
      return;
    }
    const sa = c[3] / 255;
    const da = this.data[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[idx] = Math.round((c[0] * sa + this.data[idx] * da * (1 - sa)) / outA);
    this.data[idx + 1] = Math.round((c[1] * sa + this.data[idx + 1] * da * (1 - sa)) / outA);
    this.data[idx + 2] = Math.round((c[2] * sa + this.data[idx + 2] * da * (1 - sa)) / outA);
    this.data[idx + 3] = Math.round(outA * 255);
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGBA, blend = false): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPx(px, py, c, blend);
      }
    }
  }

  drawBevelRect(x: number, y: number, w: number, h: number, base: RGBA, outline?: RGBA): void {
    const hi = shadeColor(base, 1.32);
    const lo = shadeColor(base, 0.68);
    this.fillRect(x, y, w, h, base);
    this.fillRect(x, y, w, 1, hi);
    this.fillRect(x, y, 1, h, hi);
    this.fillRect(x, y + h - 1, w, 1, lo);
    this.fillRect(x + w - 1, y, 1, h, lo);
    if (outline) {
      this.drawRectOutline(x - 1, y - 1, w + 2, h + 2, outline);
    }
  }

  drawRectOutline(x: number, y: number, w: number, h: number, c: RGBA): void {
    this.fillRect(x, y, w, 1, c);
    this.fillRect(x, y + h - 1, w, 1, c);
    this.fillRect(x, y, 1, h, c);
    this.fillRect(x + w - 1, y, 1, h, c);
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, c: RGBA, blend = false): void {
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const dx = Math.abs(ix1 - ix0);
    const dy = -Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.setPx(ix0, iy0, c, blend);
      if (ix0 === ix1 && iy0 === iy1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ix0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        iy0 += sy;
      }
    }
  }

  /**
   * Draws a thick crisp pixel-art line with rounded pixel caps.
   */
  drawThickLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number,
    c: RGBA,
    blend = false
  ): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      if (radius <= 0.6) {
        this.setPx(Math.round(px), Math.round(py), c, blend);
      } else {
        this.fillEllipse(px, py, radius, radius, c, blend);
      }
    }
  }

  /**
   * Scanline-fills a crisp pixel-art polygon (for organic silhouettes, wings, capes, horns).
   */
  fillPolygon(points: readonly (readonly [number, number])[], c: RGBA, blend = false): void {
    if (points.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      if (points[i][1] < minY) minY = points[i][1];
      if (points[i][1] > maxY) maxY = points[i][1];
    }
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY));
    const xs: number[] = [];
    for (let y = yStart; y <= yEnd; y++) {
      xs.length = 0;
      const sy = y + 0.5;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const y0 = points[j][1];
        const y1 = points[i][1];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
          const x0 = points[j][0];
          const x1 = points[i][0];
          xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.floor(xs[k]));
        const x1 = Math.min(this.width - 1, Math.floor(xs[k + 1]));
        for (let x = x0; x <= x1; x++) {
          this.setPx(x, y, c, blend);
        }
      }
    }
  }

  /**
   * Cel-shaded pixel-art polygon with automatic top-left highlight & bottom-right shadow bevels.
   */
  drawShadedPolygon(
    points: readonly (readonly [number, number])[],
    base: RGBA,
    seed = 17
  ): void {
    if (points.length < 3) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i++) {
      if (points[i][0] < minX) minX = points[i][0];
      if (points[i][0] > maxX) maxX = points[i][0];
      if (points[i][1] < minY) minY = points[i][1];
      if (points[i][1] > maxY) maxY = points[i][1];
    }
    const xStart = Math.max(0, Math.floor(minX));
    const xEnd = Math.min(this.width - 1, Math.ceil(maxX));
    const yStart = Math.max(0, Math.floor(minY));
    const yEnd = Math.min(this.height - 1, Math.ceil(maxY));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    const hi = shadeColor(base, 1.32);
    const lo = shadeColor(base, 0.72);
    const deep = shadeColor(base, 0.5);

    const xs: number[] = [];
    for (let y = yStart; y <= yEnd; y++) {
      xs.length = 0;
      const sy = y + 0.5;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const y0 = points[j][1];
        const y1 = points[i][1];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
          const x0 = points[j][0];
          const x1 = points[i][0];
          xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const lx0 = Math.max(xStart, Math.floor(xs[k]));
        const lx1 = Math.min(xEnd, Math.floor(xs[k + 1]));
        for (let x = lx0; x <= lx1; x++) {
          const nx = (x - minX) / spanX;
          const ny = (y - minY) / spanY;
          const dither = (pixelHash(x, y, seed) - 0.5) * 0.14;
          const shade = (1 - ny) * 0.65 + (1 - nx) * 0.35 + dither;
          let col = base;
          if (y === yStart || x === lx0) col = hi;
          else if (y === yEnd || x === lx1) col = deep;
          else if (shade > 0.72) col = hi;
          else if (shade < 0.24) col = deep;
          else if (shade < 0.44) col = lo;
          this.setPx(x, y, col);
        }
      }
    }
  }

  /**
   * Draws a crisp layered pixel-art glowing orb (eyes, reactor cores, runes).
   */
  drawGlowOrb(cx: number, cy: number, radius: number, core: RGBA, mid: RGBA, halo?: RGBA): void {
    if (halo) {
      this.fillEllipse(cx, cy, radius + 1.5, radius + 1.5, halo, true);
    }
    this.fillEllipse(cx, cy, radius, radius, mid, mid[3] < 255);
    this.fillEllipse(cx, cy, Math.max(1, radius * 0.5), Math.max(1, radius * 0.5), core, false);
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGBA, blend = false): void {
    if (rx <= 0 || ry <= 0) return;
    const minX = Math.max(0, Math.floor(cx - rx - 1));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + rx + 1));
    const minY = Math.max(0, Math.floor(cy - ry - 1));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + ry + 1));
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    for (let y = minY; y <= maxY; y++) {
      const dy = y + 0.5 - cy;
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1.0) {
          this.setPx(x, y, c, blend);
        }
      }
    }
  }

  /**
   * 3-tone cel-shaded pixel sphere/dome with top-left light source and specular pixel glint.
   */
  drawShadedEllipse(cx: number, cy: number, rx: number, ry: number, base: RGBA, specular = true): void {
    if (rx <= 0 || ry <= 0) return;
    const hi = shadeColor(base, 1.35);
    const mid = base;
    const lo = shadeColor(base, 0.65);
    const deep = shadeColor(base, 0.45);
    const spec = mixColor(hi, [255, 255, 255, base[3]], 0.55);

    const minX = Math.max(0, Math.floor(cx - rx - 1));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + rx + 1));
    const minY = Math.max(0, Math.floor(cy - ry - 1));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + ry + 1));
    for (let y = minY; y <= maxY; y++) {
      const ny = (y + 0.5 - cy) / ry;
      for (let x = minX; x <= maxX; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1.0) continue;
        const nz = Math.sqrt(Math.max(0, 1.0 - d2));
        const light = nx * -0.45 + ny * -0.58 + nz * 0.68;
        let col = mid;
        if (specular && light > 0.86) col = spec;
        else if (light > 0.55) col = hi;
        else if (light > 0.14) col = mid;
        else if (light > -0.25) col = lo;
        else col = deep;
        this.setPx(x, y, col);
      }
    }
  }

  /**
   * Draws an iconic Elder Futhark Norse rune etched in pixel art (3x5 or 5x7).
   */
  drawNorseRune(x: number, y: number, kind: number, c: RGBA): void {
    const patterns: readonly (readonly string[])[] = [
      // Algiz (protection)
      ['#.#', '###', '.#.', '.#.', '.#.'],
      // Sowilo (sun / lightning)
      ['.##', '.#.', '###', '.#.', '##.'],
      // Tiwaz (warrior spear)
      ['.#.', '###', '.#.', '.#.', '.#.'],
      // Othala (heritage diamond)
      ['.#.', '#.#', '.#.', '#.#', '#.#'],
      // Ansuz (rune)
      ['##.', '#.#', '##.', '#.#', '#..'],
      // Thurisaz (thorn)
      ['#..', '##.', '#.#', '##.', '#..'],
    ];
    const pat = patterns[Math.abs(kind) % patterns.length];
    for (let ry = 0; ry < pat.length; ry++) {
      const row = pat[ry];
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') {
          this.setPx(x + rx, y + ry, c, true);
        }
      }
    }
  }

  /**
   * Stamps a character-mapped pixel art pattern with crisp palette lookup.
   */
  stampPattern(
    ox: number,
    oy: number,
    rows: readonly string[],
    palette: Record<string, RGBA>,
    mirrorHorizontal = false
  ): void {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const len = row.length;
      for (let c = 0; c < len; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue;
        const px = mirrorHorizontal ? ox + (len - 1 - c) : ox + c;
        this.setPx(px, oy + r, col, col[3] < 255);
      }
    }
  }

  /**
   * Draws a symmetric pixel silhouette: each row describes the left half and
   * automatically mirrors across the vertical center axis for ultra-crisp armor & bosses.
   */
  stampSymmetric(
    centerX: number,
    oy: number,
    leftHalfRows: readonly string[],
    palette: Record<string, RGBA>,
    evenWidth = true
  ): void {
    for (let r = 0; r < leftHalfRows.length; r++) {
      const row = leftHalfRows[r];
      const half = row.length;
      for (let c = 0; c < half; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue;
        const lx = centerX - half + c;
        const rx = evenWidth ? centerX + (half - 1 - c) : centerX + (half - 1 - c) - 1;
        this.setPx(lx, oy + r, col, col[3] < 255);
        this.setPx(rx, oy + r, col, col[3] < 255);
      }
    }
  }

  /**
   * Adds a crisp 1px dark silhouette outline around all opaque pixels (4-neighbor).
   */
  applyOutline(outlineColor: RGBA = INK_OUTLINE): void {
    const src = new Uint8ClampedArray(this.data);
    const w = this.width;
    const h = this.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (src[idx + 3] > 20) continue;
        let touchesOpaque = false;
        if (x > 0 && src[(y * w + x - 1) * 4 + 3] > 128) touchesOpaque = true;
        else if (x + 1 < w && src[(y * w + x + 1) * 4 + 3] > 128) touchesOpaque = true;
        else if (y > 0 && src[((y - 1) * w + x) * 4 + 3] > 128) touchesOpaque = true;
        else if (y + 1 < h && src[((y + 1) * w + x) * 4 + 3] > 128) touchesOpaque = true;
        if (touchesOpaque) {
          this.data[idx] = outlineColor[0];
          this.data[idx + 1] = outlineColor[1];
          this.data[idx + 2] = outlineColor[2];
          this.data[idx + 3] = outlineColor[3];
        }
      }
    }
  }

  /**
   * Adds subtle outer neon aura around bright emissive pixels matching predicate.
   */
  addEmissiveHalo(haloColor: RGBA, radius = 1): void {
    const src = new Uint8ClampedArray(this.data);
    const w = this.width;
    const h = this.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (src[idx + 3] > 180) continue;
        let nearBright = false;
        for (let dy = -radius; dy <= radius && !nearBright; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
            const nIdx = (ny * w + nx) * 4;
            if (src[nIdx + 3] > 200) {
              const lum = src[nIdx] + src[nIdx + 1] + src[nIdx + 2];
              if (lum > 560) {
                nearBright = true;
                break;
              }
            }
          }
        }
        if (nearBright) {
          this.setPx(x, y, haloColor, true);
        }
      }
    }
  }

  /**
   * Blits another PixelSurface onto this surface at (dx, dy).
   */
  blit(src: PixelSurface, dx: number, dy: number, blend = false): void {
    for (let sy = 0; sy < src.height; sy++) {
      const ty = dy + sy;
      if (ty < 0 || ty >= this.height) continue;
      for (let sx = 0; sx < src.width; sx++) {
        const tx = dx + sx;
        if (tx < 0 || tx >= this.width) continue;
        const sIdx = (sy * src.width + sx) * 4;
        const a = src.data[sIdx + 3];
        if (a === 0 && blend) continue;
        if (!blend) {
          const dIdx = (ty * this.width + tx) * 4;
          this.data[dIdx] = src.data[sIdx];
          this.data[dIdx + 1] = src.data[sIdx + 1];
          this.data[dIdx + 2] = src.data[sIdx + 2];
          this.data[dIdx + 3] = a;
        } else {
          this.setPx(tx, ty, [src.data[sIdx], src.data[sIdx + 1], src.data[sIdx + 2], a], true);
        }
      }
    }
  }

  /**
   * Returns a re-tinted copy (useful for golden weapon upgrades, Phase 2 overdrive, etc.).
   */
  recolor(fn: (r: number, g: number, b: number, a: number) => RGBA): PixelSurface {
    const out = new PixelSurface(this.width, this.height);
    for (let i = 0; i < this.data.length; i += 4) {
      const a = this.data[i + 3];
      if (a === 0) continue;
      const [nr, ng, nb, na] = fn(this.data[i], this.data[i + 1], this.data[i + 2], a);
      out.data[i] = nr;
      out.data[i + 1] = ng;
      out.data[i + 2] = nb;
      out.data[i + 3] = na;
    }
    return out;
  }
}

export interface PackedFramePlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackedAtlasPage {
  index: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * Deterministic shelf bin-packer with 2px transparent padding between sprites.
 */
export class AtlasPacker {
  private readonly pageSize: number;
  private readonly pad = 2;
  private pages: PixelSurface[] = [];
  private cursorX = 2;
  private cursorY = 2;
  private shelfH = 0;

  constructor(pageSize = 1024) {
    this.pageSize = pageSize;
    this.pages.push(new PixelSurface(pageSize, pageSize));
  }

  pack(surface: PixelSurface): PackedFramePlacement {
    const w = surface.width;
    const h = surface.height;
    if (this.cursorX + w + this.pad > this.pageSize) {
      this.cursorX = this.pad;
      this.cursorY += this.shelfH + this.pad;
      this.shelfH = 0;
    }
    if (this.cursorY + h + this.pad > this.pageSize) {
      this.pages.push(new PixelSurface(this.pageSize, this.pageSize));
      this.cursorX = this.pad;
      this.cursorY = this.pad;
      this.shelfH = 0;
    }
    const pageIndex = this.pages.length - 1;
    const px = this.cursorX;
    const py = this.cursorY;
    this.pages[pageIndex].blit(surface, px, py, false);
    this.cursorX += w + this.pad;
    if (h > this.shelfH) this.shelfH = h;
    return { page: pageIndex, x: px, y: py, width: w, height: h };
  }

  finalize(): PackedAtlasPage[] {
    return this.pages.map((surf, index) => ({
      index,
      width: surf.width,
      height: surf.height,
      rgba: surf.data,
    }));
  }
}
