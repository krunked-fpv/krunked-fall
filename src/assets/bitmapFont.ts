// ============================================================================
// KRUNKEDFALL — Crisp 5x7 Outlined Pixel Bitmap Font (DOM-Free)
// ============================================================================
// Used by WebGL2Renderer Pass 4 for razor-sharp world-space floating damage
// numbers, crit callouts, pickup labels, and hub interaction prompts.

import { PixelSurface, INK_OUTLINE, type RGBA } from './pixelArtGen';

export interface BitmapGlyphRect {
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  advance: number;
}

export interface BitmapFontAtlas {
  width: number;
  height: number;
  glyphHeight: number;
  rgba: Uint8ClampedArray;
  glyphs: Record<string, BitmapGlyphRect>;
}

const WHITE: RGBA = [255, 255, 255, 255];

// Crisp 5x7 uppercase + digit + symbol pixel bitmap patterns
const RAW_GLYPHS: Record<string, readonly string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#..##', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '%': ['##..#', '##.#.', '..#..', '.#...', '#..##', '#..##', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '#####', '.#.#.', '.....'],
  '$': ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
};

export const BITMAP_FONT_GLYPHS = RAW_GLYPHS;

let cachedFontAtlas: BitmapFontAtlas | null = null;

/**
 * Generates a crisp outlined 7x9 cell bitmap font atlas (128x128 RGBA) once.
 */
export function getBuiltinFontAtlas(): BitmapFontAtlas {
  if (cachedFontAtlas) return cachedFontAtlas;

  const cellW = 8; // 5px glyph + 1px outline each side + 1px pad
  const cellH = 10; // 7px glyph + 1px outline each side + 1px pad
  const cols = 16;
  const atlasW = 128;
  const atlasH = 128;
  const surf = new PixelSurface(atlasW, atlasH);
  const glyphs: Record<string, BitmapGlyphRect> = {};

  const keys = Object.keys(RAW_GLYPHS);
  for (let i = 0; i < keys.length; i++) {
    const ch = keys[i];
    const pat = RAW_GLYPHS[ch];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * cellW;
    const oy = row * cellH;

    // Render glyph onto small surface, apply crisp 1px dark outline, then blit
    const cell = new PixelSurface(7, 9);
    for (let gy = 0; gy < pat.length; gy++) {
      const line = pat[gy];
      for (let gx = 0; gx < line.length; gx++) {
        if (line[gx] === '#') {
          cell.setPx(gx + 1, gy + 1, WHITE);
        }
      }
    }
    if (ch !== ' ') {
      cell.applyOutline(INK_OUTLINE);
    }
    surf.blit(cell, ox, oy, false);

    glyphs[ch] = {
      char: ch,
      x: ox,
      y: oy,
      w: 7,
      h: 9,
      u0: ox / atlasW,
      v0: oy / atlasH,
      u1: (ox + 7) / atlasW,
      v1: (oy + 9) / atlasH,
      advance: ch === ' ' ? 4 : ch === '!' || ch === '.' || ch === ':' || ch === "'" ? 4 : 6,
    };
  }

  cachedFontAtlas = {
    width: atlasW,
    height: atlasH,
    glyphHeight: 9,
    rgba: surf.data,
    glyphs,
  };
  return cachedFontAtlas;
}

export function measurePixelText(text: string, scale = 1): { width: number; height: number } {
  const atlas = getBuiltinFontAtlas();
  const upper = text.toUpperCase();
  let width = 0;
  for (let i = 0; i < upper.length; i++) {
    const g = atlas.glyphs[upper[i]] ?? atlas.glyphs[' '];
    width += g.advance * scale;
  }
  return { width, height: atlas.glyphHeight * scale };
}
