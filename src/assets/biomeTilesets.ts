// ============================================================================
// KRUNKEDFALL — Rich Biome Tilesets, 16-State Seamless Autotiling & World Props
// ============================================================================
// Replaces generic grid-tiled floors/walls with 8 handcrafted biome art packs:
//   - canyon (sun-baked ochre mesa dirt, stratified red-rock cliffs, scrub)
//   - jotunheim (frozen slate + sweeping snowdrifts, faceted glacial ice cliffs)
//   - darkcity (cracked urban asphalt, road dashes, grates, brutalist concrete)
//   - forest (carved emerald temple wave-stone, lush moss/vines, jade ruins)
//   - sewer (toxic ochre swamp mud, iron drains, moss-rimmed brick, acid sludge)
//   - helheim (skull-etched catacomb stone, dark obsidian monoliths & runes)
//   - muspelheim (charred volcanic basalt, ember veins, obsidian magma cliffs)
//   - hub (Three-Rock Nordic mossy stone + drifting snow + timber workshop decks)
//
// Each biome generates:
//   - 8 organic, low-contrast seamless floor tiles (ZERO harsh 16x16 grid seams!)
//   - 16-state cardinal autotile wall tops (mask 0..15: seamless roof interiors,
//     crisp lit outer rims & weathered edges ONLY on exposed boundaries!)
//   - 4 rich 16x12 vertical 3D south wall faces
//   - Seamless dark outer bedrock cliffs
//   - Destructible 2.5D biome crates/barrels, blast craters, rubble & props

import {
  INK_OUTLINE,
  PixelSurface,
  RAMPS,
  bayer4,
  hexToRgba,
  mixColor,
  pixelHash,
  sampleRamp,
  tileableNoise2D,
  type ColorRamp,
  type RGBA,
} from './pixelArtGen';

export type BiomeArtFamily =
  | 'canyon'
  | 'jotunheim'
  | 'darkcity'
  | 'forest'
  | 'sewer'
  | 'helheim'
  | 'muspelheim'
  | 'hub';

export const BIOME_ART_FAMILIES: readonly BiomeArtFamily[] = [
  'canyon',
  'jotunheim',
  'darkcity',
  'forest',
  'sewer',
  'helheim',
  'muspelheim',
  'hub',
];

export function resolveBiomeArtFamily(biomeId: string): BiomeArtFamily {
  const k = (biomeId || 'canyon').toLowerCase();
  if (k === 'hub') return 'hub';
  if (k === 'jotunheim' || k === 'saltpan' || k === 'sandcave' || k.includes('ice') || k.includes('snow')) {
    return 'jotunheim';
  }
  if (k === 'darkcity' || k === 'lab' || k === 'training' || k.includes('city') || k.includes('mil') || k.includes('sub')) {
    return 'darkcity';
  }
  if (k === 'forest' || k === 'losttemple' || k === 'lost_temple' || k === 'mushroom' || k.includes('pine') || k.includes('moss')) {
    return 'forest';
  }
  if (k === 'sewer' || k.includes('maggot') || k.includes('swamp')) {
    return 'sewer';
  }
  if (k === 'helheim' || k === 'shrine' || k.includes('dead') || k.includes('hel')) {
    return 'helheim';
  }
  if (
    k === 'muspelheim' ||
    k === 'lavaland' ||
    k === 'ashwastes' ||
    k === 'ash_wastes' ||
    k === 'keep' ||
    k.includes('lava') ||
    k.includes('cinder') ||
    k.includes('sulfur')
  ) {
    return 'muspelheim';
  }
  return 'canyon';
}

interface BiomeThemePalette {
  floorDeep: RGBA;
  floorBase: RGBA;
  floorMid: RGBA;
  floorLight: RGBA;
  floorAccent: RGBA;
  wallVoid: RGBA;      // deep interior cap of thick wall masses
  wallCapDark: RGBA;   // inner roof shadow
  wallCapMid: RGBA;    // inner roof midtone
  wallRim: RGBA;       // bright crisp outer lip on exposed edges
  wallRimHi: RGBA;     // razor-sharp top-left specular bevel
  faceTop: RGBA;       // upper south wall face
  faceMid: RGBA;       // mid south wall face
  faceLow: RGBA;       // shadowed base of south wall face
  faceCrevice: RGBA;   // brick/rock fissure lines
  accentGlow: RGBA;    // glowing moss / rune / lava / neon detail
  bedrockCore: RGBA;   // seamless outer cliff void
}

const BIOME_THEMES: Record<BiomeArtFamily, BiomeThemePalette> = {
  canyon: {
    floorDeep: hexToRgba('#573726'),
    floorBase: hexToRgba('#6e4630'),
    floorMid: hexToRgba('#7f5339'),
    floorLight: hexToRgba('#946546'),
    floorAccent: hexToRgba('#a87a54'),
    wallVoid: hexToRgba('#291512'),
    wallCapDark: hexToRgba('#3d2018'),
    wallCapMid: hexToRgba('#572e1f'),
    wallRim: hexToRgba('#9c5933'),
    wallRimHi: hexToRgba('#cc8449'),
    faceTop: hexToRgba('#7a4326'),
    faceMid: hexToRgba('#542b19'),
    faceLow: hexToRgba('#33170e'),
    faceCrevice: hexToRgba('#1f0d0a'),
    accentGlow: hexToRgba('#d9944e'),
    bedrockCore: hexToRgba('#1c0e0c'),
  },
  jotunheim: {
    floorDeep: hexToRgba('#2f4459'),
    floorBase: hexToRgba('#3c566e'),
    floorMid: hexToRgba('#496882'),
    floorLight: hexToRgba('#6488a3'),
    floorAccent: hexToRgba('#c7e6f5'), // crisp snowdrift patches!
    wallVoid: hexToRgba('#162438'),
    wallCapDark: hexToRgba('#243d59'),
    wallCapMid: hexToRgba('#385e82'),
    wallRim: hexToRgba('#7cc6e8'),
    wallRimHi: hexToRgba('#d9f7ff'),
    faceTop: hexToRgba('#4a7fa3'),
    faceMid: hexToRgba('#2f5778'),
    faceLow: hexToRgba('#1c3652'),
    faceCrevice: hexToRgba('#101f33'),
    accentGlow: hexToRgba('#54f0ff'),
    bedrockCore: hexToRgba('#0e1929'),
  },
  darkcity: {
    floorDeep: hexToRgba('#282b29'),
    floorBase: hexToRgba('#343834'),
    floorMid: hexToRgba('#3f443e'),
    floorLight: hexToRgba('#4d534b'),
    floorAccent: hexToRgba('#8f8446'), // faded road dashes & oil/rust
    wallVoid: hexToRgba('#16191a'),
    wallCapDark: hexToRgba('#252a2b'),
    wallCapMid: hexToRgba('#384040'),
    wallRim: hexToRgba('#6c7a73'),
    wallRimHi: hexToRgba('#a8b8aa'),
    faceTop: hexToRgba('#4c5752'),
    faceMid: hexToRgba('#323a37'),
    faceLow: hexToRgba('#1e2422'),
    faceCrevice: hexToRgba('#101414'),
    accentGlow: hexToRgba('#a8ff2e'),
    bedrockCore: hexToRgba('#101214'),
  },
  forest: {
    // Inspired by lush emerald carved Norse temple ruins (low-contrast jade floor + bright mint rims!)
    floorDeep: hexToRgba('#163d30'),
    floorBase: hexToRgba('#1d4f3d'),
    floorMid: hexToRgba('#245e47'),
    floorLight: hexToRgba('#2f7556'),
    floorAccent: hexToRgba('#489c5e'),
    wallVoid: hexToRgba('#0c211d'),
    wallCapDark: hexToRgba('#183d33'),
    wallCapMid: hexToRgba('#26614a'),
    wallRim: hexToRgba('#5cd685'),
    wallRimHi: hexToRgba('#a6ffba'),
    faceTop: hexToRgba('#2d7856'),
    faceMid: hexToRgba('#1b4f3a'),
    faceLow: hexToRgba('#0f2e24'),
    faceCrevice: hexToRgba('#081a16'),
    accentGlow: hexToRgba('#78ff8c'),
    bedrockCore: hexToRgba('#091715'),
  },
  sewer: {
    // Grimy toxic ochre-olive mud & mossy crumbling yellow-ochre masonry!
    floorDeep: hexToRgba('#3b3f1e'),
    floorBase: hexToRgba('#4d5226'),
    floorMid: hexToRgba('#5c612e'),
    floorLight: hexToRgba('#707538'),
    floorAccent: hexToRgba('#90b832'),
    wallVoid: hexToRgba('#1b1f10'),
    wallCapDark: hexToRgba('#333616'),
    wallCapMid: hexToRgba('#52521e'),
    wallRim: hexToRgba('#b8a42c'),
    wallRimHi: hexToRgba('#ebd959'),
    faceTop: hexToRgba('#786c22'),
    faceMid: hexToRgba('#4f4616'),
    faceLow: hexToRgba('#2e280d'),
    faceCrevice: hexToRgba('#171408'),
    accentGlow: hexToRgba('#b8ff28'),
    bedrockCore: hexToRgba('#14170c'),
  },
  helheim: {
    // Desaturated skull-paved slate-violet catacombs + obsidian rune monoliths
    floorDeep: hexToRgba('#292638'),
    floorBase: hexToRgba('#363347'),
    floorMid: hexToRgba('#434057'),
    floorLight: hexToRgba('#57536e'),
    floorAccent: hexToRgba('#77718f'),
    wallVoid: hexToRgba('#120e1c'),
    wallCapDark: hexToRgba('#211a33'),
    wallCapMid: hexToRgba('#352a4f'),
    wallRim: hexToRgba('#7a62a6'),
    wallRimHi: hexToRgba('#bba3e8'),
    faceTop: hexToRgba('#4c3d6e'),
    faceMid: hexToRgba('#30254a'),
    faceLow: hexToRgba('#1c142e'),
    faceCrevice: hexToRgba('#0d0917'),
    accentGlow: hexToRgba('#c26eff'),
    bedrockCore: hexToRgba('#0d0a17'),
  },
  muspelheim: {
    // Charred basalt & ash with subtle molten cracks + volcanic obsidian cliffs
    floorDeep: hexToRgba('#26181a'),
    floorBase: hexToRgba('#332022'),
    floorMid: hexToRgba('#40292a'),
    floorLight: hexToRgba('#543736'),
    floorAccent: hexToRgba('#94351c'),
    wallVoid: hexToRgba('#140b0e'),
    wallCapDark: hexToRgba('#261316'),
    wallCapMid: hexToRgba('#401f20'),
    wallRim: hexToRgba('#9c4128'),
    wallRimHi: hexToRgba('#e67b39'),
    faceTop: hexToRgba('#662b1f'),
    faceMid: hexToRgba('#421a15'),
    faceLow: hexToRgba('#260e0d'),
    faceCrevice: hexToRgba('#140708'),
    accentGlow: hexToRgba('#ff8824'),
    bedrockCore: hexToRgba('#12080a'),
  },
  hub: {
    // Three-Rock Outpost: mossy slate Viking flagstones + organic snowdrifts
    floorDeep: hexToRgba('#314039'),
    floorBase: hexToRgba('#3e5248'),
    floorMid: hexToRgba('#4a6154'),
    floorLight: hexToRgba('#5c7566'),
    floorAccent: hexToRgba('#dcebd4'), // organic snowdrift ribbon!
    wallVoid: hexToRgba('#171e24'),
    wallCapDark: hexToRgba('#27333d'),
    wallCapMid: hexToRgba('#3b4c59'),
    wallRim: hexToRgba('#7a96a8'),
    wallRimHi: hexToRgba('#c5e0eb'),
    faceTop: hexToRgba('#4f6573'),
    faceMid: hexToRgba('#32424d'),
    faceLow: hexToRgba('#1e2830'),
    faceCrevice: hexToRgba('#10151c'),
    accentGlow: hexToRgba('#38f2d8'),
    bedrockCore: hexToRgba('#11171d'),
  },
};

// ============================================================================
// 1. ORGANIC LOW-CONTRAST BIOME FLOOR TILES (8 SEAMLESS VARIANTS PER BIOME)
// ============================================================================

export function drawBiomeFloorTile(family: BiomeArtFamily, variant: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const t = BIOME_THEMES[family];
  const seed = 900 + BIOME_ART_FAMILIES.indexOf(family) * 197 + variant * 53;

  // Base organic textured ground (ZERO harsh outer tile grid lines!)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n1 = tileableNoise2D(x * 0.25 + variant * 2.1, y * 0.25 + variant * 1.3, 4, seed);
      const n2 = tileableNoise2D(x * 0.5, y * 0.5, 8, seed + 17);
      const n = n1 * 0.65 + n2 * 0.35 + bayer4(x, y) * 0.08;
      let col = t.floorBase;
      if (n < 0.30) col = t.floorDeep;
      else if (n > 0.68) col = t.floorMid;
      s.setPx(x, y, col);
    }
  }

  // Biome-specific material craft (low contrast, organic, visually distinct!)
  if (family === 'forest') {
    // Carved Norse temple wave-scroll flagstones (just subtle value shift!)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const wave = Math.sin((x + y * 0.6) * 0.39 + (variant & 1) * 1.57);
        if (wave > 0.58) {
          s.setPx(x, y, t.floorMid);
        } else if (wave < -0.72) {
          s.setPx(x, y, t.floorDeep);
        }
      }
    }
    // Soft stone seam on alternating tiles
    if (variant % 2 === 0) {
      for (let x = 1; x < 15; x++) {
        if (pixelHash(x, 0, seed) > 0.25) s.setPx(x, 0, t.floorDeep);
      }
      for (let y = 1; y < 15; y++) {
        if (pixelHash(0, y, seed) > 0.25) s.setPx(0, y, t.floorDeep);
      }
    }
    // Variant 5-7: Crawling moss patches
    if (variant >= 5) {
      s.fillEllipse(5 + (variant % 3) * 3, 6 + (variant % 2) * 4, 3.5, 2.5, t.floorLight);
      s.setPx(5 + (variant % 3) * 3, 5 + (variant % 2) * 4, t.floorAccent);
      s.setPx(6 + (variant % 3) * 3, 6 + (variant % 2) * 4, t.floorAccent);
    }
  } else if (family === 'canyon') {
    // Wind-swept mesa dust strata & cracked red earth
    for (let y = 0; y < 16; y++) {
      const streak = Math.sin(y * 0.55 + variant * 1.7);
      if (streak > 0.62) {
        for (let x = 0; x < 16; x++) {
          if (pixelHash(x, y, seed + 9) > 0.42) s.setPx(x, y, t.floorLight);
        }
      }
    }
    if (variant === 2 || variant === 6) {
      // Subtle sun-baked earth crack
      s.drawLine(3, 4, 7, 7, t.floorDeep);
      s.drawLine(7, 7, 11, 6, t.floorDeep);
      s.drawLine(7, 7, 9, 11, t.floorDeep);
    } else if (variant === 4 || variant === 7) {
      // Scattered warm pebbles
      s.fillRect(4, 5, 2, 2, t.floorAccent);
      s.setPx(4, 6, t.floorDeep);
      s.fillRect(11, 10, 2, 1, t.floorLight);
      s.setPx(12, 11, t.floorDeep);
    }
  } else if (family === 'darkcity') {
    // Cracked post-apocalyptic asphalt with subtle roadwear, holes & storm grates
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const g = pixelHash(x, y, seed + 3);
        if (g > 0.91) s.setPx(x, y, t.floorLight);
        else if (g < 0.08) s.setPx(x, y, t.floorDeep);
      }
    }
    if (variant === 3) {
      // Cracked asphalt fissure
      s.drawLine(2, 3, 6, 8, t.floorDeep);
      s.drawLine(6, 8, 12, 10, t.floorDeep);
      s.drawLine(6, 8, 4, 13, t.floorDeep);
    } else if (variant === 5) {
      // Subtle weathered yellow road stripe fragment
      s.fillRect(4, 7, 8, 2, mixColor(t.floorMid, t.floorAccent, 0.55));
      s.setPx(6, 7, t.floorMid);
      s.setPx(9, 8, t.floorMid);
    } else if (variant === 7) {
      // Sunken iron drainage grate
      s.drawRectOutline(4, 4, 8, 8, t.floorDeep);
      for (let gx = 5; gx <= 10; gx += 2) {
        s.fillRect(gx, 5, 1, 6, t.floorDeep);
      }
      s.fillRect(5, 4, 6, 1, t.floorLight);
    }
  } else if (family === 'jotunheim') {
    // Smooth continuous glacial slate with subtle hairline frost fractures (ZERO polka-dot grid!)
    if (variant === 2 || variant === 6) {
      s.drawLine(1, 11, 6, 7, t.floorLight);
      s.drawLine(6, 7, 13, 4, t.floorLight);
      s.drawLine(2, 12, 7, 8, t.floorDeep);
    } else if (variant === 4) {
      // Subtle low-contrast wind-swept frost sheen band
      for (let x = 0; x < 16; x++) {
        const yy = 6 + Math.round(Math.sin(x * 0.4) * 1.5);
        s.setPx(x, yy, t.floorLight);
        if (x % 2 === 0) s.setPx(x, yy + 1, t.floorMid);
      }
    }
  } else if (family === 'sewer') {
    // Grimy olive mud with subtle damp puddles & dark drainage creases
    if (variant === 3) {
      s.fillEllipse(8, 8, 3.0, 2.0, t.floorDeep);
      s.fillEllipse(8, 8, 1.8, 1.1, mixColor(t.floorMid, t.accentGlow, 0.25));
    } else if (variant === 5) {
      s.fillRect(3, 5, 3, 2, t.floorMid);
      s.fillRect(10, 11, 3, 2, t.floorDeep);
    }
  } else if (family === 'helheim') {
    // Weathered dark catacomb flagstones (muted low-contrast joints, rare skull relief)
    const stones: readonly [number, number, number, number][] = [
      [0, 0, 7, 7],
      [8, 0, 8, 6],
      [0, 8, 8, 8],
      [9, 7, 7, 9],
    ];
    for (let i = 0; i < stones.length; i++) {
      const [bx, by, bw, bh] = stones[i];
      if ((i + variant) % 3 === 0) {
        s.fillRect(bx, by, bw, bh, t.floorMid);
      }
      if (pixelHash(bx, by, seed + 19) > 0.35) {
        s.fillRect(bx, Math.min(15, by + bh - 1), bw, 1, t.floorDeep);
      }
    }
    if (variant === 7) {
      // Rare subtle relief skull etched into catacomb stone
      s.fillRect(6, 5, 4, 4, t.floorLight);
      s.setPx(7, 6, t.floorDeep);
      s.setPx(9, 6, t.floorDeep);
    }
  } else if (family === 'muspelheim') {
    // Volcanic charred basalt slabs + rare subtle glowing ember fissures
    if (variant === 2 || variant === 6) {
      s.drawLine(3, 3, 8, 8, t.floorDeep);
      s.drawLine(8, 8, 13, 12, t.floorDeep);
      if (variant === 6) {
        s.setPx(7, 7, t.floorAccent);
        s.setPx(8, 8, t.accentGlow);
      }
    } else if (variant === 4) {
      s.fillRect(4, 4, 6, 5, t.floorMid);
      s.fillRect(4, 9, 6, 1, t.floorDeep);
    }
  } else {
    // hub: Broad weathered Nordic stone flagstones (organic low-contrast sanctuary paving!)
    if (variant % 2 === 0) {
      // Softly broken flagstone joint lines (never a harsh noisy brick grid)
      for (let x = 0; x < 16; x++) {
        if (pixelHash(x, 7, seed + 7) > 0.32) s.setPx(x, 7, t.floorDeep);
        if (pixelHash(x, 8, seed + 11) > 0.68) s.setPx(x, 8, t.floorLight);
      }
      const jx = (variant * 5 + 4) % 12 + 2;
      for (let y = 0; y < 7; y++) {
        if (pixelHash(jx, y, seed + 13) > 0.3) s.setPx(jx, y, t.floorDeep);
      }
      const jx2 = (jx + 7) % 13 + 1;
      for (let y = 8; y < 16; y++) {
        if (pixelHash(jx2, y, seed + 17) > 0.3) s.setPx(jx2, y, t.floorDeep);
      }
    } else {
      // Subtle weathered mossy patch inside stone slab
      if (variant === 5 || variant === 7) {
        s.fillEllipse(8, 8, 4.5, 3.2, t.floorMid);
        s.setPx(7, 7, t.floorLight);
      }
    }
  }

  return s;
}

// ============================================================================
// 2. TRUE 16-STATE SEAMLESS AUTOTILED WALL TOP CAPS (ZERO CHOCOLATE BARS!)
// ============================================================================
// Bitmask: N=1, E=2, S=4, W=8 (bit = 1 means that neighbor is ALSO a wall)

export function drawBiomeWallCapAutotile(family: BiomeArtFamily, mask: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const t = BIOME_THEMES[family];
  const hasN = (mask & 1) !== 0;
  const hasE = (mask & 2) !== 0;
  const hasS = (mask & 4) !== 0;
  const hasW = (mask & 8) !== 0;
  const seed = 2100 + BIOME_ART_FAMILIES.indexOf(family) * 97 + mask * 13;

  // 1. Continuous cohesive interior mass (NO internal borders on connected sides!)
  const isDeepInterior = hasN && hasE && hasS && hasW;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = tileableNoise2D(x * 0.25, y * 0.25, 4, seed);
      const grain = pixelHash(x, y, seed + 5);
      let col: RGBA;
      if (isDeepInterior) {
        col = n < 0.52 ? t.wallVoid : t.wallCapDark;
        if (grain > 0.93) col = t.wallCapMid;
      } else {
        col = n < 0.28 ? t.wallCapDark : n < 0.72 ? t.wallCapMid : t.wallCapDark;
        // Darken softly toward connected interior sides, brighten toward exposed rims!
        const distN = hasN ? 16 : y;
        const distS = hasS ? 16 : 15 - y;
        const distW = hasW ? 16 : x;
        const distE = hasE ? 16 : 15 - x;
        const minEdge = Math.min(distN, distS, distW, distE);
        if (minEdge >= 6) {
          col = n < 0.62 ? t.wallVoid : t.wallCapDark;
        } else if (minEdge >= 3) {
          col = n < 0.45 ? t.wallCapDark : t.wallCapMid;
        }
      }
      s.setPx(x, y, col);
    }
  }

  // Biome-specific roof/cliff interior details (subtle stonework, vents, moss, ice facets)
  if (family === 'forest' && !isDeepInterior) {
    // Carved emerald temple mosaic notches inside wall top
    s.fillRect(4, 4, 3, 3, t.wallCapDark);
    s.fillRect(9, 9, 3, 3, t.wallCapDark);
  } else if (family === 'darkcity' && (mask === 15 || mask === 7 || mask === 13)) {
    // Brutalist concrete roof panel seam & vent
    s.drawRectOutline(5, 5, 6, 6, t.wallCapDark);
    s.fillRect(6, 7, 4, 1, t.wallVoid);
    s.fillRect(6, 9, 4, 1, t.wallVoid);
  } else if (family === 'muspelheim' && !isDeepInterior) {
    // Glowing volcanic ember fissure on basalt cap
    if ((mask & 5) === 0 || (mask & 10) === 0) {
      s.drawLine(5, 6, 10, 9, t.faceCrevice);
      s.setPx(7, 7, t.accentGlow);
      s.setPx(8, 8, t.wallRim);
    }
  }

  // 2. Exposed Outer Rim Bevels & Razor-Sharp Ink Outlines!
  // Exposed NORTH edge (top-lit bright ridge!)
  if (!hasN) {
    for (let x = 0; x < 16; x++) {
      const notch = pixelHash(x, 0, seed + 31) > 0.82 ? 1 : 0;
      s.setPx(x, 0, INK_OUTLINE);
      s.setPx(x, 1, notch ? t.wallRim : t.wallRimHi);
      s.setPx(x, 2, t.wallRim);
      if (pixelHash(x, 3, seed + 33) > 0.45) s.setPx(x, 3, t.wallCapMid);
    }
  }
  // Exposed WEST edge (left-lit crisp bevel!)
  if (!hasW) {
    for (let y = 0; y < 16; y++) {
      const notch = pixelHash(0, y, seed + 41) > 0.84 ? 1 : 0;
      s.setPx(0, y, INK_OUTLINE);
      s.setPx(1, y, notch ? t.wallRim : t.wallRimHi);
      s.setPx(2, y, t.wallRim);
    }
  }
  // Exposed EAST edge (shadow-bevelled outer cliff lip)
  if (!hasE) {
    for (let y = 0; y < 16; y++) {
      s.setPx(15, y, INK_OUTLINE);
      s.setPx(14, y, t.wallCapDark);
      s.setPx(13, y, t.wallRim);
    }
  }
  // Exposed SOUTH edge (iconic crisp bright cliff/roof ledge right above the 3D wall face!)
  if (!hasS) {
    for (let x = 0; x < 16; x++) {
      const chip = pixelHash(x, 15, seed + 59) > 0.85;
      s.setPx(x, 15, INK_OUTLINE);
      s.setPx(x, 14, chip ? t.wallCapMid : t.wallRimHi);
      s.setPx(x, 13, t.wallRim);
      if (family === 'forest' && pixelHash(x, 12, seed + 61) > 0.72) {
        s.setPx(x, 12, t.accentGlow); // glowing jade moss overhang
      } else if (family === 'jotunheim' && pixelHash(x, 12, seed + 63) > 0.6) {
        s.setPx(x, 12, t.wallRimHi); // snow crust overhang
      }
    }
  }

  // Round/chamfer exposed outer corners for organic silhouette (instead of harsh boxes!)
  if (!hasN && !hasW) {
    s.setPx(0, 0, [0, 0, 0, 0]);
    s.setPx(1, 1, INK_OUTLINE);
    s.setPx(2, 2, t.wallRimHi);
  }
  if (!hasN && !hasE) {
    s.setPx(15, 0, [0, 0, 0, 0]);
    s.setPx(14, 1, INK_OUTLINE);
  }
  if (!hasS && !hasW) {
    s.setPx(0, 15, INK_OUTLINE);
    s.setPx(1, 14, t.wallRimHi);
  }
  if (!hasS && !hasE) {
    s.setPx(15, 15, INK_OUTLINE);
    s.setPx(14, 14, t.wallRim);
  }

  return s;
}

// ============================================================================
// 3. TALL 3D SOUTH WALL FACES (16x16, RENDERED 12-14PX TALL, 4 VARIANTS)
// ============================================================================

export function drawBiomeWallFaceTile(family: BiomeArtFamily, variant: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const t = BIOME_THEMES[family];
  const seed = 3300 + BIOME_ART_FAMILIES.indexOf(family) * 131 + variant * 29;

  // Vertical gradient from sunlit top under-ledge to dark ground occlusion
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = pixelHash(x, y, seed);
      let col = y < 4 ? t.faceTop : y < 11 ? t.faceMid : t.faceLow;
      if (n > 0.86 && y < 12) col = t.faceTop;
      else if (n < 0.14 && y > 2) col = t.faceLow;
      s.setPx(x, y, col);
    }
  }

  // Crisp 1px shadow lip right under overhanging cap + pitch-black base contact line
  s.fillRect(0, 0, 16, 1, t.faceCrevice);
  s.fillRect(0, 1, 16, 1, t.faceTop);
  s.fillRect(0, 14, 16, 1, t.faceLow);
  s.fillRect(0, 15, 16, 1, INK_OUTLINE);

  if (family === 'canyon') {
    // Stratified jagged mesa sandstone bands & vertical rock clefts
    s.fillRect(0, 5, 16, 1, t.faceCrevice);
    s.fillRect(0, 6, 16, 1, t.faceTop);
    s.fillRect(0, 10, 16, 1, t.faceCrevice);
    const vx = 3 + (variant * 4) % 10;
    s.drawLine(vx, 1, vx + 1, 14, t.faceCrevice);
    s.drawLine(vx + 1, 2, vx + 2, 13, t.faceTop);
  } else if (family === 'jotunheim') {
    // Faceted glacier ice wall with gleaming cyan crystal ridges & hanging icicles!
    for (let ix = 2; ix < 15; ix += 4) {
      const ih = 3 + ((ix + variant * 3) % 5);
      s.fillRect(ix, 1, 2, ih, t.wallRimHi);
      s.setPx(ix, ih + 1, t.wallRim);
    }
    s.drawLine(4 + variant * 2, 3, 2 + variant * 2, 13, t.wallRim);
    s.drawLine(5 + variant * 2, 3, 3 + variant * 2, 13, t.faceCrevice);
  } else if (family === 'darkcity') {
    // Brutalist concrete facade with rusted girders, shuttered windows & vents
    s.fillRect(0, 6, 16, 1, t.faceCrevice);
    if (variant === 0 || variant === 2) {
      // Recessed dark concrete window/vent alcove
      s.fillRect(3, 3, 10, 8, t.faceCrevice);
      s.fillRect(4, 4, 8, 6, t.faceLow);
      s.fillRect(4, 4, 8, 1, t.faceTop);
      s.fillRect(7, 4, 2, 6, t.faceCrevice);
    } else if (variant === 1) {
      // Exposed steel girder & caution stripe
      s.fillRect(2, 2, 2, 12, t.wallRim);
      s.fillRect(4, 2, 1, 12, t.faceCrevice);
      s.fillRect(8, 9, 6, 2, t.floorAccent);
      s.setPx(10, 9, INK_OUTLINE);
      s.setPx(12, 10, INK_OUTLINE);
    }
  } else if (family === 'forest' || family === 'sewer') {
    // Weathered temple stone courses with hanging moss vines!
    s.fillRect(0, 5, 16, 1, t.faceCrevice);
    s.fillRect(0, 10, 16, 1, t.faceCrevice);
    s.fillRect(5 + (variant % 3) * 2, 1, 1, 5, t.faceCrevice);
    s.fillRect(10 - (variant % 3) * 2, 6, 1, 5, t.faceCrevice);
    // Hanging emerald/moss vine tendrils
    const vineX = 2 + (variant * 4) % 11;
    s.fillRect(vineX, 0, 2, 6 + (variant % 4), t.wallRim);
    s.setPx(vineX, 2, t.wallRimHi);
    s.setPx(vineX + 1, 6 + (variant % 4), t.accentGlow);
  } else if (family === 'helheim') {
    // Carved obsidian Norse shrine stone with glowing violet runes
    s.fillRect(0, 7, 16, 1, t.faceCrevice);
    s.fillRect(7, 1, 1, 14, t.faceCrevice);
    if (variant === 1 || variant === 3) {
      s.drawNorseRune(6, 4, variant, t.accentGlow);
    }
  } else if (family === 'muspelheim') {
    // Cracked volcanic cliff face with glowing molten lava seams!
    s.drawLine(3, 2, 7, 7, t.faceCrevice);
    s.drawLine(7, 7, 12, 12, t.faceCrevice);
    if (variant % 2 === 0) {
      s.setPx(6, 6, t.accentGlow);
      s.setPx(7, 7, hexToRgba('#fff3a6'));
      s.setPx(8, 8, t.accentGlow);
    }
  } else {
    // hub: Carved fortress stone blocks with iron brackets
    s.fillRect(0, 6, 16, 1, t.faceCrevice);
    s.fillRect(0, 11, 16, 1, t.faceCrevice);
    s.fillRect(7, 1, 1, 5, t.faceCrevice);
    s.fillRect(3, 7, 1, 4, t.faceCrevice);
    s.fillRect(12, 7, 1, 4, t.faceCrevice);
    if (variant === 2) {
      s.drawNorseRune(6, 3, 0, t.accentGlow);
    }
  }

  return s;
}

export function drawBiomeBedrockTile(family: BiomeArtFamily): PixelSurface {
  const s = new PixelSurface(16, 16);
  const t = BIOME_THEMES[family];
  const seed = 4100 + BIOME_ART_FAMILIES.indexOf(family) * 53;
  // Seamless deep dark outer rock/void — NEVER an ugly repeating metal padlock!
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = tileableNoise2D(x * 0.25, y * 0.25, 4, seed);
      const col = n > 0.72 ? t.wallVoid : t.bedrockCore;
      s.setPx(x, y, col);
    }
  }
  return s;
}

// ============================================================================
// 4. ENHANCED HAZARDS (CHURNING LAVA, BUBBLING ACID, GLACIAL WATER), CRATES & PROPS
// ============================================================================

export function drawEnhancedLavaTile(frame: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const shift = frame * 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = tileableNoise2D((x + shift) * 0.25, (y - frame * 2) * 0.25, 4, 5101);
      const wave =
        Math.sin(((x + shift) * Math.PI) / 8) * 0.45 +
        Math.cos(((y - shift * 0.5) * Math.PI) / 8) * 0.35 +
        (n - 0.5) * 0.9;
      let col: RGBA;
      if (wave > 0.72) col = RAMPS.fire[5]; // blazing white-yellow
      else if (wave > 0.32) col = RAMPS.fire[4]; // molten gold
      else if (wave > -0.15) col = RAMPS.fire[3]; // bright orange
      else if (wave > -0.52) col = RAMPS.fire[2]; // deep magma red
      else col = RAMPS.fire[1]; // cooled volcanic crust island
      s.setPx(x, y, col);
    }
  }
  return s;
}

export function drawEnhancedWaterTile(frame: number, toxic = false): PixelSurface {
  const s = new PixelSurface(16, 16);
  const ramp = toxic ? RAMPS.toxic : RAMPS.ice;
  const shift = frame * 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = tileableNoise2D((x + shift) * 0.25, (y + frame * 2) * 0.25, 4, toxic ? 5201 : 5251);
      const wave = Math.sin(((x + shift) * Math.PI) / 8) * Math.cos(((y + frame * 2) * Math.PI) / 8) + (n - 0.5) * 0.85;
      let col = ramp[1];
      if (wave > 0.65) col = ramp[5];
      else if (wave > 0.28) col = ramp[4];
      else if (wave > -0.18) col = ramp[3];
      else if (wave > -0.55) col = ramp[2];
      s.setPx(x, y, col);
    }
  }
  // Animated rising acid bubble / water shimmer ring
  const bx = (4 + frame * 3) % 12 + 2;
  const by = (11 - frame * 2 + 12) % 12 + 2;
  s.drawRectOutline(bx - 1, by - 1, 3, 3, ramp[4]);
  s.setPx(bx, by, ramp[5]);
  return s;
}

/**
 * 2.5D Heavy-Metal Destructible Crate / Supply Chest / Explosive Barrel (20x22)
 */
export function drawEnhancedCrate(variant: number): PixelSurface {
  const s = new PixelSurface(20, 22);
  if (variant === 1) {
    // Rusted Red/Yellow Explosive Wasteland Barrel!
    s.drawPart((p) => {
      p.drawRampEllipse(10, 6, 6, 3.2, RAMPS.rust, false);
      for (let y = 6; y < 18; y++) {
        for (let x = 4; x <= 15; x++) {
          const nx = (x - 10) / 6;
          const light = 0.72 - Math.abs(nx + 0.2) * 0.68 - (y - 6) * 0.015;
          const ramp = y >= 10 && y <= 13 ? RAMPS.gold : RAMPS.crimson;
          p.setPx(x, y, sampleRamp(ramp, light, x, y, 0.14));
        }
      }
      // Barrel iron ribs
      p.fillRect(4, 9, 12, 1, RAMPS.iron[1]);
      p.fillRect(4, 14, 12, 1, RAMPS.iron[1]);
      // Top lid rim
      p.drawRampEllipse(10, 6, 5.8, 2.8, RAMPS.iron, true);
      p.setPx(12, 5, RAMPS.fire[4]);
    });
    return s;
  }

  // Chunky 2.5D Iron-Bound Norse Timber Supply Crate
  s.drawPart((p) => {
    // Top cap (lit timber planks)
    p.drawRampPlate(2, 2, 16, 10, RAMPS.wood, false, false);
    p.fillRect(2, 5, 16, 1, RAMPS.wood[1]);
    p.fillRect(2, 9, 16, 1, RAMPS.wood[1]);
    // Diagonal brace on top
    p.drawLine(3, 3, 16, 10, RAMPS.wood[1]);
    p.drawLine(4, 3, 16, 9, RAMPS.wood[4]);
    // Front 3D vertical face (darker)
    p.fillRect(2, 12, 16, 8, RAMPS.wood[2]);
    p.fillRect(2, 12, 16, 1, RAMPS.wood[4]);
    p.fillRect(2, 16, 16, 1, RAMPS.wood[1]);
    p.fillRect(2, 19, 16, 1, RAMPS.wood[1]);
    // Riveted steel corner bands
    p.fillRect(2, 2, 3, 18, RAMPS.iron[3]);
    p.fillRect(2, 2, 1, 18, RAMPS.iron[4]);
    p.fillRect(15, 2, 3, 18, RAMPS.iron[2]);
    p.fillRect(17, 2, 1, 18, RAMPS.iron[1]);
    p.fillRect(2, 11, 16, 2, RAMPS.iron[3]);
    p.fillRect(2, 11, 16, 1, RAMPS.iron[4]);
    // Glowing amber Norse supply stencil on front face
    p.drawNorseRune(8, 13, 2, RAMPS.gold[4]);
  });
  return s;
}

/**
 * Jagged comic-book blast crater decal (32x32) with radiating fracture lines!
 */
export function drawBlastCraterDecal(): PixelSurface {
  const s = new PixelSurface(32, 32);
  const cx = 16;
  const cy = 16;
  // Radiating dark cracks
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + pixelHash(i, 7, 601) * 0.4;
    const len = 10 + pixelHash(i, 13, 603) * 5;
    s.drawLine(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, [14, 10, 16, 225]);
  }
  // Jagged scorched core pit
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy);
      const jag = Math.sin(ang * 7) * 1.4 + (pixelHash(x, y, 611) - 0.5) * 2.2;
      if (d + jag < 7.5) {
        s.setPx(x, y, [12, 9, 14, 240]);
      } else if (d + jag < 11.2) {
        const a = Math.round((1 - (d + jag - 7.5) / 3.7) * 185);
        s.setPx(x, y, [24, 18, 22, Math.max(0, a)]);
      }
    }
  }
  // Scattered pebble specks around rim
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63 + 0.2;
    const r = 9.5 + pixelHash(i, 3, 619) * 4;
    s.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 1, [38, 32, 36, 210]);
  }
  return s;
}

/**
 * Rich multi-splatter directional blood/acid pool decal (24x24 white-mask for runtime tinting)
 */
export function drawRichBloodSplat(variant: number): PixelSurface {
  const s = new PixelSurface(24, 24);
  const w: RGBA = [255, 255, 255, 255];
  const core: RGBA = [210, 210, 210, 255]; // slightly darker inner clot
  const cx = 12;
  const cy = 12;
  // Irregular central pool
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy);
      const lobe = Math.sin(ang * (3 + (variant % 3)) + variant * 1.7) * 1.8 + Math.cos(ang * 5 - variant) * 1.1;
      if (d < 4.8 + lobe) {
        s.setPx(x, y, d < 2.6 ? core : w);
      }
    }
  }
  // High-velocity arterial satellite droplets
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + pixelHash(i, variant, 701) * 0.55;
    const dist = 5.5 + pixelHash(variant, i, 709) * 5.2;
    const r = 0.8 + pixelHash(i, variant, 719) * 1.6;
    s.fillEllipse(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, r, r * 0.8, w);
  }
  return s;
}

// ============================================================================
// 5. COSMETIC BIOME STORYTELLING FLOOR PROPS (NO COLLISION — PURE ATMOSPHERE!)
// ============================================================================

export type WorldPropKind =
  | 'prop_skull_pile'
  | 'prop_rusted_car'
  | 'prop_moss_cluster'
  | 'prop_snow_drift'
  | 'prop_tech_pad'
  | 'prop_bone_fragments'
  | 'prop_sewer_grate'
  | 'prop_ember_vent'
  | 'prop_broken_pillar'
  | 'prop_brazier';

export function drawWorldProp(kind: WorldPropKind, frame = 0): PixelSurface {
  if (kind === 'prop_brazier') {
    // Detailed Forged Iron Norse Fire Brazier with 4-frame animated pixel flames! (22x28)
    const s = new PixelSurface(22, 28);
    const cx = 11;
    s.drawPart((p) => {
      // Tripod iron legs
      p.drawThickLine(cx - 5, 25, cx - 3, 18, 1.0, RAMPS.iron[2]);
      p.drawThickLine(cx + 5, 25, cx + 3, 18, 1.0, RAMPS.iron[1]);
      p.fillRect(cx - 1, 19, 2, 7, RAMPS.iron[2]);
      // Heavy riveted Norse iron fire bowl
      p.drawRampPolygon(
        [
          [cx - 8, 13],
          [cx + 8, 13],
          [cx + 5, 20],
          [cx - 5, 20],
        ],
        RAMPS.iron,
      );
      p.fillRect(cx - 8, 13, 16, 2, RAMPS.bronze[4]);
      p.fillRect(cx - 4, 16, 8, 1, RAMPS.bronze[3]);
      // Glowing charcoal bed
      p.fillEllipse(cx, 13, 6, 2, RAMPS.fire[2]);
      p.fillEllipse(cx, 13, 4, 1.2, RAMPS.fire[4]);
    });
    // Animated roaring pixel flame tongues!
    s.drawFlameCluster(cx, 12, 5.5, 9 + (frame % 2) * 2, 801 + frame * 17, RAMPS.fire, true);
    // Rising spark pixel
    s.setPx(cx - 2 + (frame * 2) % 5, 2 + (frame % 3), RAMPS.fire[5]);
    return s;
  }

  if (kind === 'prop_rusted_car') {
    // Weathered rusted wasteland Norse wreck chassis (34x22, grounded with contact shadow!)
    const s = new PixelSurface(34, 22);
    // Soft grounded shadow base
    s.fillEllipse(17, 17, 15, 4, [10, 8, 14, 125]);
    s.drawPart((p) => {
      // Flat half-buried tires
      p.fillRect(5, 15, 6, 4, RAMPS.iron[1]);
      p.fillRect(22, 15, 6, 4, RAMPS.iron[1]);
      // Crushed rusted hood, roof, trunk silhouette
      p.drawRampPolygon(
        [
          [3, 12],
          [8, 6],
          [22, 5],
          [29, 10],
          [31, 16],
          [3, 16],
        ],
        RAMPS.rust,
      );
      // Shattered dark windshield + rear glass
      p.fillPolygon([[9, 7], [15, 6], [15, 11], [8, 11]], RAMPS.obsidian[1]);
      p.drawLine(10, 7, 13, 10, RAMPS.steel[4]);
      p.fillPolygon([[17, 6], [23, 6], [26, 10], [17, 10]], RAMPS.obsidian[1]);
      // Side rust streaks, door seam & bent iron bumper
      p.fillRect(16, 11, 1, 5, RAMPS.rust[0]);
      p.fillRect(3, 15, 28, 2, RAMPS.iron[2]);
      p.fillRect(4, 13, 2, 2, RAMPS.gold[3]);
    });
    return s;
  }

  if (kind === 'prop_tech_pad') {
    // Subtle recessed dark-iron Norse floor grate / runic hatch (32x32, flush with floor — ZERO neon box!)
    const s = new PixelSurface(32, 32);
    const frameDark: RGBA = [20, 26, 34, 210];
    const plateMid: RGBA = [36, 46, 56, 200];
    const plateHi: RGBA = [62, 78, 92, 190];
    const runeDim: RGBA = [58, 198, 214, 175];
    s.fillPolygon(
      [[6, 2], [26, 2], [30, 6], [30, 26], [26, 30], [6, 30], [2, 26], [2, 6]],
      frameDark,
    );
    s.fillPolygon(
      [[7, 4], [25, 4], [28, 7], [28, 25], [25, 28], [7, 28], [4, 25], [4, 7]],
      plateMid,
    );
    // Subtle top bevel & recessed inner octagon
    s.drawLine(7, 4, 25, 4, plateHi);
    s.drawLine(4, 7, 4, 25, plateHi);
    s.fillRect(8, 8, 16, 16, [18, 23, 30, 215]);
    s.drawRectOutline(8, 8, 16, 16, [52, 68, 82, 205]);
    // Faint glowing inlaid Elder Futhark sanctuary rune
    s.drawNorseRune(14, 13, 3, runeDim);
    // Subtle corner bolts
    s.setPx(6, 6, plateHi);
    s.setPx(25, 6, plateHi);
    s.setPx(6, 25, plateHi);
    s.setPx(25, 25, plateHi);
    return s;
  }

  if (kind === 'prop_snow_drift') {
    // Soft wind-swept translucent snow wisp drift (36x16, NO grey potato oval!)
    const s = new PixelSurface(36, 16);
    const snowEdge: RGBA = [175, 212, 224, 75];
    const snowMid: RGBA = [212, 235, 242, 135];
    const snowHi: RGBA = [238, 250, 255, 185];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 36; x++) {
        const nx = (x - 18) / 16;
        const ny = (y - 8 - Math.sin(x * 0.22) * 1.8) / 4.2;
        const d = nx * nx * 0.85 + ny * ny;
        const n = pixelHash(x, y, 919);
        if (d < 0.36 + n * 0.14) s.setPx(x, y, snowHi);
        else if (d < 0.62 + n * 0.18) s.setPx(x, y, snowMid);
        else if (d < 0.88 + n * 0.15) s.setPx(x, y, snowEdge);
      }
    }
    return s;
  }

  if (kind === 'prop_skull_pile') {
    // Grounded half-buried weathered skulls & bone dust (20x16, muted grounded outline!)
    const s = new PixelSurface(20, 16);
    s.fillEllipse(10, 12, 7, 3, [14, 11, 18, 105]);
    s.drawRampEllipse(7, 9, 3.6, 3.2, RAMPS.bone, false);
    s.setPx(6, 9, [26, 20, 30, 230]);
    s.setPx(8, 9, [26, 20, 30, 230]);
    s.drawRampEllipse(13, 10, 3.2, 2.8, RAMPS.bone, false);
    s.setPx(12, 10, [26, 20, 30, 230]);
    s.setPx(14, 10, [26, 20, 30, 230]);
    s.drawLine(4, 13, 15, 13, RAMPS.bone[2]);
    return s;
  }

  if (kind === 'prop_moss_cluster') {
    // Organic ground-blended moss & lichen tuft (22x14, soft edges!)
    const s = new PixelSurface(22, 14);
    s.fillEllipse(8, 8, 5.5, 3.2, [16, 46, 34, 145]);
    s.fillEllipse(14, 7, 5.0, 2.8, [16, 46, 34, 145]);
    s.fillEllipse(8, 7, 4.0, 2.2, [28, 82, 54, 185]);
    s.fillEllipse(14, 6, 3.5, 1.8, [40, 112, 68, 195]);
    s.setPx(7, 6, [82, 178, 102, 210]);
    s.setPx(13, 5, [82, 178, 102, 210]);
    s.setPx(15, 6, [120, 210, 115, 200]);
    return s;
  }

  if (kind === 'prop_sewer_grate') {
    // Flush recessed dark corroded drain grate (20x16)
    const s = new PixelSurface(20, 16);
    s.fillRect(2, 2, 16, 12, [24, 28, 32, 210]);
    s.drawRectOutline(2, 2, 16, 12, [58, 66, 70, 200]);
    s.fillRect(4, 4, 12, 8, [10, 12, 16, 235]);
    for (let x = 5; x <= 14; x += 3) {
      s.fillRect(x, 4, 1, 8, [54, 62, 66, 215]);
    }
    return s;
  }

  if (kind === 'prop_ember_vent') {
    // Cracked volcanic ground fissure with molten inner glow (22x14)
    const s = new PixelSurface(22, 14);
    s.fillEllipse(11, 7, 7.5, 3.8, [22, 12, 14, 165]);
    s.drawLine(4, 7, 18, 7, [14, 8, 10, 235]);
    s.drawLine(7, 5, 15, 9, [14, 8, 10, 225]);
    s.fillEllipse(11, 7, 4.2, 1.8, [215, 72, 22, 225]);
    s.fillEllipse(11, 7, 2.2, 1.0, [255, 186, 64, 240]);
    return s;
  }

  if (kind === 'prop_broken_pillar') {
    // Grounded weathered broken rune-stone rubble (22x16)
    const s = new PixelSurface(22, 16);
    s.fillEllipse(11, 12, 8.5, 3, [12, 10, 16, 125]);
    s.drawPart((p) => {
      p.drawRampPolygon([[3, 7], [17, 5], [19, 11], [5, 13]], RAMPS.iron);
      p.drawNorseRune(9, 7, 1, RAMPS.iron[1]);
    });
    return s;
  }

  // prop_bone_fragments (soft subtle floor bone slivers!)
  const s = new PixelSurface(16, 12);
  s.drawLine(3, 5, 11, 8, [186, 178, 162, 185]);
  s.setPx(3, 4, [220, 212, 196, 195]);
  s.setPx(11, 9, [220, 212, 196, 195]);
  s.drawLine(12, 4, 7, 10, [145, 138, 128, 170]);
  return s;
}
