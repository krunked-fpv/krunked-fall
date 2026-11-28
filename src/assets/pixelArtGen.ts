// ============================================================================
// KRUNKEDFALL — Master Heavy-Metal Pixel-Art Sculpting Engine (DOM-Free)
// ============================================================================
// Pure Uint8ClampedArray RGBA pixel buffer engineered for indie-studio 32-bit
// comic-book pixel art:
//   - Hue-shifted 6-stop material color ramps (warm highlights, cool shadows)
//   - Ordered 4x4 Bayer dithering transitions
//   - Per-part anatomical sub-layer sculpting with crisp internal ink seams
//   - Shaded cylinders, flame plumes, fur tufts, iron chains, cracks & runes
//   - 2048x2048 deterministic shelf atlas packing (Node & Browser WebGL2)

export type RGBA = readonly [number, number, number, number];

/** 6-stop hue-shifted pixel-art ramp: [ink, deep, shadow, mid, hi, spec] */
export type ColorRamp = readonly [RGBA, RGBA, RGBA, RGBA, RGBA, RGBA];

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

export function makeRamp(
  ink: string,
  deep: string,
  shadow: string,
  mid: string,
  hi: string,
  spec: string,
): ColorRamp {
  return [
    hexToRgba(ink),
    hexToRgba(deep),
    hexToRgba(shadow),
    hexToRgba(mid),
    hexToRgba(hi),
    hexToRgba(spec),
  ] as const;
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

export const INK_OUTLINE: RGBA = [11, 8, 20, 255]; // #0b0814 deep comic ink
export const INK_DARK: RGBA = [22, 17, 34, 255]; // #161122 internal seam ink
export const TRANSPARENT: RGBA = [0, 0, 0, 0];

// Curated Hue-Shifted Heavy-Metal Cyber-Norse Material Ramps
export const RAMPS = {
  // Cool teal-tinted forged steel (iconic Norse armor)
  steel: makeRamp('#0b0814', '#182438', '#2e4561', '#5a7e9c', '#9ec9de', '#e2f7ff'),
  // Dark gunmetal / iron
  iron: makeRamp('#0b0814', '#161826', '#282d40', '#485269', '#7b8aa3', '#bfd0e3'),
  // Gleaming cyber-chrome
  chrome: makeRamp('#0b0814', '#23334a', '#456382', '#7da4bf', '#c2e4f5', '#ffffff'),
  // Warm forged Nordic gold
  gold: makeRamp('#0b0814', '#3d1c0c', '#7a3f10', '#c97e18', '#f5c238', '#fff4a8'),
  // Aged bronze / brass
  bronze: makeRamp('#0b0814', '#2e1610', '#5c2e1c', '#99552d', '#cf8948', '#f5cb82'),
  // Weathered timber / wood
  wood: makeRamp('#0b0814', '#24120c', '#452314', '#754122', '#a86938', '#d49a62'),
  // Tanned battle leather
  leather: makeRamp('#0b0814', '#211214', '#402120', '#693930', '#965d48', '#bf886b'),
  // Warm hero skin
  skin: makeRamp('#0b0814', '#4d2324', '#8a483a', '#c97e5d', '#edb18a', '#ffe0bd'),
  // Wolf / Viking pelt fur
  fur: makeRamp('#0b0814', '#1f1924', '#3b303d', '#63535c', '#948185', '#c7b8b4'),
  // Crimson / blood armor & cloaks
  crimson: makeRamp('#0b0814', '#330a18', '#6b1228', '#b52236', '#f25252', '#ffa68c'),
  // Blazing magma / fire
  fire: makeRamp('#0b0814', '#470c14', '#9e1f14', '#e85a14', '#ffba24', '#fff9b8'),
  // Glacial Jotunheim ice
  ice: makeRamp('#0b0814', '#13284a', '#1f5382', '#3a94c4', '#8ce6ff', '#f0ffff'),
  // Radioactive toxic lime
  toxic: makeRamp('#0b0814', '#103018', '#1d6624', '#45b828', '#a6f538', '#f2ffa6'),
  // Emerald rune / Yggdrasil
  emerald: makeRamp('#0b0814', '#0b2924', '#145946', '#22a36e', '#63e89c', '#ccffdc'),
  // Ancient skull & bone
  bone: makeRamp('#0b0814', '#38303b', '#695d63', '#a69994', '#dbcfc1', '#fcf7eb'),
  // Volcanic obsidian / Helheim plate
  obsidian: makeRamp('#0b0814', '#161124', '#281f3d', '#443661', '#6f5c91', '#a996c9'),
  // Void / plasma magenta-purple
  void: makeRamp('#0b0814', '#2a0d3d', '#5c187a', '#a32bc4', '#f257d8', '#ffc2f7'),
  // Cyber-cyan plasma
  cyan: makeRamp('#0b0814', '#0b2a47', '#0f5c8a', '#1aa8d9', '#61f0ff', '#e8ffff'),
  // Troll / goblin hide
  troll: makeRamp('#0b0814', '#1b2e1c', '#2e522b', '#4d823b', '#83b856', '#c6e68a'),
  // Rusted wasteland scrap
  rust: makeRamp('#0b0814', '#2e1312', '#5c2419', '#994122', '#cf6e36', '#f2a963'),
  // Wolf slate cyber-fur
  wolfSlate: makeRamp('#0b0814', '#191e2e', '#2e384f', '#51627d', '#869bb5', '#c5d8eb'),
  // Deep crimson phase-2 hellplate
  hellPlate: makeRamp('#0b0814', '#240b14', '#4a1423', '#7d2433', '#ba484b', '#f2907e'),
} as const;

// Classic 4x4 Bayer ordered dithering threshold matrix normalized to [-0.5, 0.5]
const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function bayer4(x: number, y: number): number {
  const idx = ((y & 3) << 2) | (x & 3);
  return BAYER_4X4[idx] / 16 - 0.5;
}

/**
 * Sample a 6-stop hue-shifted ColorRamp at normalized light value t in [0..1]
 * with optional ordered Bayer dithering at pixel (x, y).
 */
export function sampleRamp(ramp: ColorRamp, t: number, x = 0, y = 0, ditherAmt = 0.14): RGBA {
  const v = Math.max(0, Math.min(1, t + bayer4(x, y) * ditherAmt));
  if (v < 0.16) return ramp[1]; // deep shadow
  if (v < 0.38) return ramp[2]; // shadow
  if (v < 0.66) return ramp[3]; // midtone
  if (v < 0.88) return ramp[4]; // highlight
  return ramp[5]; // specular
}

/**
 * Deterministic 32-bit xorshift hash for surface texture grain & dithering.
 */
export function pixelHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Smooth 2D value noise (deterministic) for organic cracks, moss, snowdrifts & stone.
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = pixelHash(ix, iy, seed);
  const b = pixelHash(ix + 1, iy, seed);
  const c = pixelHash(ix, iy + 1, seed);
  const d = pixelHash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Tileable periodic value noise on a [period x period] grid so seamless tiles have zero seams!
 */
export function tileableNoise2D(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % period) + period) % period;
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = pixelHash(x0, y0, seed);
  const b = pixelHash(x1, y0, seed);
  const c = pixelHash(x0, y1, seed);
  const d = pixelHash(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
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

  /**
   * Sculpted armored plate rectangle using a full hue-shifted ColorRamp + Bayer dither + rivets.
   */
  drawRampPlate(
    x: number,
    y: number,
    w: number,
    h: number,
    ramp: ColorRamp,
    rivets = false,
    outline = true,
  ): void {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    for (let py = 0; py < ih; py++) {
      const ny = ih > 1 ? py / (ih - 1) : 0;
      for (let px = 0; px < iw; px++) {
        const nx = iw > 1 ? px / (iw - 1) : 0;
        let col: RGBA;
        if (py === 0 || px === 0) {
          col = py === 0 && px < iw - 1 ? ramp[4] : ramp[3];
        } else if (py === ih - 1 || px === iw - 1) {
          col = ramp[1];
        } else {
          const light = (1 - ny) * 0.68 + (1 - nx) * 0.25 + 0.05;
          col = sampleRamp(ramp, light, x0 + px, y0 + py, 0.13);
        }
        this.setPx(x0 + px, y0 + py, col);
      }
    }
    if (rivets && iw >= 6 && ih >= 6) {
      const pts: readonly [number, number][] = [
        [x0 + 2, y0 + 2],
        [x0 + iw - 3, y0 + 2],
        [x0 + 2, y0 + ih - 3],
        [x0 + iw - 3, y0 + ih - 3],
      ];
      for (const [rx, ry] of pts) {
        this.setPx(rx, ry, ramp[5]);
        this.setPx(rx, ry + 1, ramp[1]);
      }
    }
    if (outline) {
      this.drawRectOutline(x0 - 1, y0 - 1, iw + 2, ih + 2, ramp[0]);
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
    blend = false,
  ): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.6));
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
   * Draws a hue-shifted shaded cylinder/limb/horn/barrel from (x0,y0) to (x1,y1)
   * with tapered radius (r0 -> r1), perpendicular metallic light wrap, and optional ink outline.
   */
  drawRampLimb(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    r0: number,
    r1: number,
    ramp: ColorRamp,
    dither = 0.14,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = Math.max(0.001, dx * dx + dy * dy);
    const maxR = Math.max(r0, r1) + 2;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - maxR));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(x0, x1) + maxR));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - maxR));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(y0, y1) + maxR));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
        const cx = x0 + dx * t;
        const cy = y0 + dy * t;
        const r = r0 + (r1 - r0) * t;
        const ox = px - cx;
        const oy = py - cy;
        const dist = Math.hypot(ox, oy);
        if (dist <= r) {
          const nx = r > 0.01 ? ox / r : 0;
          const ny = r > 0.01 ? oy / r : 0;
          const nz = Math.sqrt(Math.max(0, 1 - (dist * dist) / Math.max(0.01, r * r)));
          const light = nx * -0.38 + ny * -0.58 + nz * 0.68;
          this.setPx(x, y, sampleRamp(ramp, light * 0.58 + 0.36, x, y, dither));
        }
      }
    }
  }

  /**
   * Scanline-fills a crisp pixel-art polygon.
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
   * Hue-shifted 6-tone sculpted polygon with Bayer dithering, crisp rim catchlights & shadow lip!
   */
  drawRampPolygon(
    points: readonly (readonly [number, number])[],
    ramp: ColorRamp,
    ditherAmt = 0.14,
    lightBias = 0.0,
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
          // Curved dome-like light feel across horizontal center + top-left key light
          const dome = 1 - Math.abs(nx - 0.42) * 0.55;
          const shade = (1 - ny) * 0.62 + dome * 0.34 + lightBias;
          let col: RGBA;
          if (y === yStart) col = ramp[5];
          else if (x === lx0 && ny < 0.7) col = ramp[4];
          else if (y === yEnd || (x === lx1 && ny > 0.35)) col = ramp[1];
          else col = sampleRamp(ramp, shade, x, y, ditherAmt);
          this.setPx(x, y, col);
        }
      }
    }
  }

  /**
   * Backwards-compatible cel-shaded polygon using hue-shifted highlights/shadows.
   */
  drawShadedPolygon(
    points: readonly (readonly [number, number])[],
    base: RGBA,
    seed = 17,
  ): void {
    const hi: RGBA = [
      Math.min(255, Math.round(base[0] * 1.28 + 12)),
      Math.min(255, Math.round(base[1] * 1.3 + 10)),
      Math.min(255, Math.round(base[2] * 1.22 + 4)),
      base[3],
    ];
    const spec = mixColor(hi, [255, 250, 230, base[3]], 0.45);
    const lo: RGBA = [
      Math.max(0, Math.round(base[0] * 0.66)),
      Math.max(0, Math.round(base[1] * 0.68)),
      Math.max(0, Math.round(base[2] * 0.78 + 8)),
      base[3],
    ];
    const deep: RGBA = [
      Math.max(0, Math.round(base[0] * 0.4)),
      Math.max(0, Math.round(base[1] * 0.42)),
      Math.max(0, Math.round(base[2] * 0.56 + 10)),
      base[3],
    ];
    const ramp: ColorRamp = [INK_OUTLINE, deep, lo, base, hi, spec];
    this.drawRampPolygon(points, ramp, 0.14 + (seed % 3) * 0.01);
  }

  /**
   * Sculpted hue-shifted ellipse/dome using full 6-stop ColorRamp + Bayer dithering!
   */
  drawRampEllipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    ramp: ColorRamp,
    specular = true,
    ditherAmt = 0.14,
  ): void {
    if (rx <= 0 || ry <= 0) return;
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
        const light = nx * -0.4 + ny * -0.56 + nz * 0.66;
        const t = Math.max(0, Math.min(specular ? 1.0 : 0.84, light * 0.62 + 0.36));
        this.setPx(x, y, sampleRamp(ramp, t, x, y, ditherAmt));
      }
    }
  }

  /**
   * Draws an anatomical sub-part onto a temporary layer, applies a crisp 1px dark-ink
   * internal contour around that part, and composites it onto this surface!
   * THIS IS THE SECRET TO COMIC-BOOK HEAVY-METAL PIXEL ART ARMOR READABILITY.
   */
  drawPart(
    drawFn: (part: PixelSurface) => void,
    outlineColor: RGBA = INK_OUTLINE,
    dropShadowDy = 0,
  ): void {
    const layer = new PixelSurface(this.width, this.height);
    drawFn(layer);
    if (dropShadowDy > 0) {
      // Cast subtle dark internal contact shadow under the part before outlining
      const w = this.width;
      const h = this.height;
      for (let y = 0; y < h; y++) {
        const ty = y + dropShadowDy;
        if (ty < 0 || ty >= h) continue;
        for (let x = 0; x < w; x++) {
          const sIdx = (y * w + x) * 4;
          if (layer.data[sIdx + 3] > 128) {
            const dIdx = (ty * w + x) * 4;
            if (this.data[dIdx + 3] > 128) {
              this.data[dIdx] = Math.round(this.data[dIdx] * 0.52);
              this.data[dIdx + 1] = Math.round(this.data[dIdx + 1] * 0.48);
              this.data[dIdx + 2] = Math.round(this.data[dIdx + 2] * 0.62);
            }
          }
        }
      }
    }
    layer.applyOutline(outlineColor);
    this.blit(layer, 0, 0, true);
  }

  /**
   * Draws a fierce heavy-metal pixel-art flame tongue / fire beard cluster!
   */
  drawFlameCluster(
    cx: number,
    cy: number,
    radiusX: number,
    heightY: number,
    seed: number,
    ramp: ColorRamp = RAMPS.fire,
    upward = true,
  ): void {
    const dir = upward ? -1 : 1;
    const tongues = Math.max(3, Math.round(radiusX * 0.9));
    for (let i = 0; i < tongues; i++) {
      const frac = tongues > 1 ? i / (tongues - 1) - 0.5 : 0;
      const tx = cx + frac * radiusX * 1.8;
      const len = heightY * (0.65 + pixelHash(i, seed, 41) * 0.55) * (1 - Math.abs(frac) * 0.45);
      const w = Math.max(1.5, radiusX * 0.34);
      const bend = (pixelHash(seed, i, 73) - 0.5) * 3.5;
      // Outer crimson/orange flame tongue
      this.fillPolygon(
        [
          [tx - w, cy],
          [tx + w, cy],
          [tx + bend, cy + dir * len],
        ],
        ramp[2],
      );
      // Mid orange-gold tongue
      this.fillPolygon(
        [
          [tx - w * 0.72, cy],
          [tx + w * 0.72, cy],
          [tx + bend * 0.7, cy + dir * len * 0.74],
        ],
        ramp[3],
      );
      // Hot yellow core
      this.fillPolygon(
        [
          [tx - w * 0.42, cy],
          [tx + w * 0.42, cy],
          [tx + bend * 0.4, cy + dir * len * 0.48],
        ],
        ramp[4],
      );
      // Blazing white base glint
      this.setPx(Math.round(tx), Math.round(cy + dir * 1), ramp[5]);
    }
  }

  /**
   * Draws a crisp layered pixel-art glowing orb (eyes, reactor cores, runes).
   */
  drawGlowOrb(cx: number, cy: number, radius: number, core: RGBA, mid: RGBA, halo?: RGBA): void {
    if (halo) {
      this.fillEllipse(cx, cy, radius + 1.8, radius + 1.8, halo, true);
    }
    this.fillEllipse(cx, cy, radius, radius, mid, mid[3] < 255);
    this.fillEllipse(cx, cy, Math.max(1, radius * 0.52), Math.max(1, radius * 0.52), core, false);
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
   * 5-tone hue-shifted pixel sphere/dome with top-left light source and specular pixel glint.
   */
  drawShadedEllipse(cx: number, cy: number, rx: number, ry: number, base: RGBA, specular = true): void {
    if (rx <= 0 || ry <= 0) return;
    const hi: RGBA = [
      Math.min(255, Math.round(base[0] * 1.3 + 12)),
      Math.min(255, Math.round(base[1] * 1.32 + 10)),
      Math.min(255, Math.round(base[2] * 1.24 + 4)),
      base[3],
    ];
    const lo: RGBA = [
      Math.max(0, Math.round(base[0] * 0.64)),
      Math.max(0, Math.round(base[1] * 0.66)),
      Math.max(0, Math.round(base[2] * 0.78 + 8)),
      base[3],
    ];
    const deep: RGBA = [
      Math.max(0, Math.round(base[0] * 0.42)),
      Math.max(0, Math.round(base[1] * 0.44)),
      Math.max(0, Math.round(base[2] * 0.58 + 10)),
      base[3],
    ];
    const spec = mixColor(hi, [255, 252, 235, base[3]], 0.55);
    const ramp: ColorRamp = [INK_OUTLINE, deep, lo, base, hi, spec];
    this.drawRampEllipse(cx, cy, rx, ry, ramp, specular, 0.14);
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
    mirrorHorizontal = false,
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
    evenWidth = true,
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
   * Adds subtle outer neon aura around bright emissive pixels.
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

  constructor(pageSize = 2048) {
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
