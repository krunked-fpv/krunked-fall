// ============================================================================
// KRUNKEDFALL — 100% Original Built-In Krunked Pixel-Art Pack
// ============================================================================
// Generates high-craft multi-tone shaded 16x16..64x64 pixel-art sprites,
// 4-frame animations, Norse runes, cybernetic glowing visors, destructible
// tilesets, 22+ weapon archetypes (aliased for all 221+ weapons), 15 enemy
// archetypes, all 8 Outcasts, and all 6 Two-Phase Mechanical Norse Bosses.
// 100% DOM-free: works identically in headless Node (Gate A) and WebGL2.

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type AmmoType,
  type PackManifest,
  type SpriteFrameMeta,
  type SpriteMeta,
  type WeaponClass,
} from '../contracts/index';
import {
  AtlasPacker,
  INK_OUTLINE,
  PixelSurface,
  hexToRgba,
  mixColor,
  pixelHash,
  shadeColor,
  type PackedAtlasPage,
  type RGBA,
} from './pixelArtGen';

export interface BuiltinPackData {
  manifest: PackManifest;
  pages: PackedAtlasPage[];
}

// ============================================================================
// SHARED PALETTE HELPERS
// ============================================================================

const C = {
  ink: INK_OUTLINE,
  white: hexToRgba('#ffffff'),
  ice: hexToRgba('#b8f4ff'),
  cyan: hexToRgba('#2ee6ff'),
  cyanDark: hexToRgba('#0f7b9e'),
  steelHi: hexToRgba('#cbd6e2'),
  steel: hexToRgba('#8090a4'),
  steelLo: hexToRgba('#495566'),
  steelDeep: hexToRgba('#28303d'),
  iron: hexToRgba('#545b68'),
  goldHi: hexToRgba('#fff1a6'),
  gold: hexToRgba('#f4b41b'),
  goldLo: hexToRgba('#a66810'),
  bronze: hexToRgba('#b8743b'),
  wood: hexToRgba('#7a4b2a'),
  woodLo: hexToRgba('#4e2e18'),
  leather: hexToRgba('#5c3928'),
  skin: hexToRgba('#e8b28c'),
  skinLo: hexToRgba('#b87c5a'),
  redHi: hexToRgba('#ff6b6b'),
  red: hexToRgba('#d92638'),
  redLo: hexToRgba('#7d1122'),
  orangeHi: hexToRgba('#ffbe4f'),
  orange: hexToRgba('#f26419'),
  orangeLo: hexToRgba('#942c0c'),
  yellow: hexToRgba('#ffe64d'),
  limeHi: hexToRgba('#a8ff60'),
  lime: hexToRgba('#4cd92b'),
  limeLo: hexToRgba('#1f7a18'),
  emerald: hexToRgba('#18d98c'),
  emeraldLo: hexToRgba('#0c6e4b'),
  purpleHi: hexToRgba('#d67bff'),
  purple: hexToRgba('#8f38d9'),
  purpleLo: hexToRgba('#451773'),
  magenta: hexToRgba('#ff2ea6'),
  bone: hexToRgba('#e6dec8'),
  boneLo: hexToRgba('#9c9178'),
  fur: hexToRgba('#7a6252'),
  furHi: hexToRgba('#ab917c'),
  troll: hexToRgba('#5e8f48'),
  trollLo: hexToRgba('#37592a'),
  goblin: hexToRgba('#76a838'),
  goblinLo: hexToRgba('#476b1e'),
  obsidian: hexToRgba('#23202e'),
  obsidianHi: hexToRgba('#3e3852'),
} as const;

// ============================================================================
// 1. OUTCASTS (8 PLAYABLE HEROES, 24x24, 4-FRAME WALK/IDLE ANIMATION)
// ============================================================================

interface OutcastVisualSpec {
  key: string;
  body: RGBA;
  trim: RGBA;
  head: RGBA;
  accent: RGBA;
  visor: RGBA;
  cape?: RGBA;
  style: 'britta' | 'leifi' | 'gustaf' | 'einar' | 'gunilla' | 'trulls' | 'stellan' | 'hilda';
}

const OUTCAST_SPECS: readonly OutcastVisualSpec[] = [
  {
    key: 'outcast_britta',
    body: hexToRgba('#394052'),
    trim: hexToRgba('#a4b6cc'),
    head: C.skin,
    accent: C.magenta,
    visor: C.cyan,
    style: 'britta',
  },
  {
    key: 'outcast_leifi',
    body: hexToRgba('#54463c'),
    trim: C.bronze,
    head: hexToRgba('#6d5a4b'),
    accent: C.bone,
    visor: C.orangeHi,
    cape: hexToRgba('#73262d'),
    style: 'leifi',
  },
  {
    key: 'outcast_gustaf',
    body: hexToRgba('#29223b'),
    trim: hexToRgba('#554078'),
    head: hexToRgba('#1b1629'),
    accent: C.purpleHi,
    visor: C.purpleHi,
    cape: hexToRgba('#3c2459'),
    style: 'gustaf',
  },
  {
    key: 'outcast_einar',
    body: hexToRgba('#4f5763'),
    trim: C.gold,
    head: C.skin,
    accent: C.orange,
    visor: C.yellow,
    style: 'einar',
  },
  {
    key: 'outcast_gunilla',
    body: hexToRgba('#3b5446'),
    trim: C.gold,
    head: C.skin,
    accent: C.red,
    visor: C.limeHi,
    style: 'gunilla',
  },
  {
    key: 'outcast_trulls',
    body: hexToRgba('#495057'),
    trim: C.steel,
    head: C.troll,
    accent: C.bone,
    visor: C.emerald,
    style: 'trulls',
  },
  {
    key: 'outcast_stellan',
    body: hexToRgba('#573c2d'),
    trim: C.orange,
    head: C.goblin,
    accent: C.red,
    visor: C.yellow,
    style: 'stellan',
  },
  {
    key: 'outcast_hilda',
    body: hexToRgba('#2c523c'),
    trim: hexToRgba('#6d4c33'),
    head: hexToRgba('#d8c4ad'),
    accent: C.emerald,
    visor: C.limeHi,
    cape: hexToRgba('#1f402e'),
    style: 'hilda',
  },
];

function drawOutcastFrame(spec: OutcastVisualSpec, frame: number): PixelSurface {
  const s = new PixelSurface(24, 24);
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const legL = frame === 1 ? -1 : frame === 3 ? 1 : 0;
  const legR = -legL;
  const cx = 12;

  // Back cape / cloak if present
  if (spec.cape) {
    const capeSway = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    s.fillRect(cx - 5 + capeSway, 11 + bob, 10, 9, shadeColor(spec.cape, 0.8));
    s.fillRect(cx - 4 + capeSway, 12 + bob, 8, 7, spec.cape);
  }

  // Boots / Legs
  const bootCol = shadeColor(spec.body, 0.65);
  s.fillRect(cx - 4, 18 + legL, 3, 4 - Math.max(0, legL), bootCol);
  s.fillRect(cx + 1, 18 + legR, 3, 4 - Math.max(0, legR), bootCol);
  s.setPx(cx - 3, 18 + legL, spec.trim);
  s.setPx(cx + 2, 18 + legR, spec.trim);

  // Armored Torso
  const torsoW = spec.style === 'leifi' || spec.style === 'trulls' ? 10 : spec.style === 'gunilla' || spec.style === 'stellan' ? 8 : 9;
  const tx = Math.floor(cx - torsoW / 2);
  s.drawBevelRect(tx, 11 + bob, torsoW, 7, spec.body);
  // Belt & metallic buckle
  s.fillRect(tx, 16 + bob, torsoW, 2, shadeColor(spec.body, 0.58));
  s.fillRect(cx - 1, 16 + bob, 2, 2, spec.trim);
  // Chest rune / armor core
  s.setPx(cx, 13 + bob, spec.visor);
  s.setPx(cx - 1, 14 + bob, shadeColor(spec.trim, 1.15));
  s.setPx(cx + 1, 14 + bob, shadeColor(spec.trim, 1.15));

  // Shoulders / Arms
  const armY = 12 + bob;
  if (spec.style === 'britta') {
    // Iconic gleaming chrome cybernetic right arm + cyan energy seam
    s.drawBevelRect(tx - 2, armY, 3, 6, C.steelHi);
    s.fillRect(tx - 1, armY + 1, 1, 4, C.cyan);
    s.drawBevelRect(tx + torsoW - 1, armY, 3, 5, spec.body);
  } else if (spec.style === 'trulls') {
    // Spiked shoulder pauldrons
    s.drawBevelRect(tx - 2, armY - 1, 3, 6, C.steel);
    s.drawBevelRect(tx + torsoW - 1, armY - 1, 3, 6, C.steel);
    s.setPx(tx - 2, armY - 2, C.bone);
    s.setPx(tx + torsoW + 1, armY - 2, C.bone);
  } else if (spec.style === 'stellan') {
    // Grenade bandolier on chest + explosive canisters
    s.drawBevelRect(tx - 2, armY, 2, 5, C.goblin);
    s.drawBevelRect(tx + torsoW, armY, 2, 5, C.goblin);
    s.fillRect(tx + 1, 12 + bob, 2, 3, C.red);
    s.setPx(tx + 1, 12 + bob, C.yellow);
    s.fillRect(tx + torsoW - 3, 12 + bob, 2, 3, C.red);
    s.setPx(tx + torsoW - 2, 12 + bob, C.yellow);
  } else if (spec.style === 'gunilla') {
    // Brass ammo bandolier across chest
    s.drawLine(tx, 11 + bob, tx + torsoW - 1, 16 + bob, C.gold);
    s.drawLine(tx + 1, 11 + bob, tx + torsoW - 1, 15 + bob, C.goldHi);
    s.drawBevelRect(tx - 2, armY, 2, 5, spec.body);
    s.drawBevelRect(tx + torsoW, armY, 2, 5, spec.body);
  } else {
    s.drawBevelRect(tx - 2, armY, 3, 5, spec.trim);
    s.drawBevelRect(tx + torsoW - 1, armY, 3, 5, spec.trim);
  }

  // Head + Iconic Outcast Headgear / Silhouette
  const hy = 5 + bob;
  s.drawShadedEllipse(cx, hy + 3, 3.6, 3.4, spec.head, false);

  switch (spec.style) {
    case 'britta': {
      // Spiked neon-magenta punk mohawk + cyan cyber-eye
      s.fillRect(cx - 1, hy - 3, 2, 5, C.magenta);
      s.setPx(cx, hy - 4, hexToRgba('#ff8cd6'));
      s.setPx(cx - 2, hy - 2, C.magenta);
      s.setPx(cx + 1, hy - 2, C.magenta);
      s.fillRect(cx - 2, hy + 2, 2, 1, C.steelDeep);
      s.setPx(cx - 2, hy + 2, C.cyan);
      s.setPx(cx + 1, hy + 2, C.white);
      break;
    }
    case 'leifi': {
      // Sweeping horned moose antlers + Norse iron helm
      s.drawBevelRect(cx - 4, hy, 8, 4, C.steel);
      // Left & right antlers
      s.drawLine(cx - 4, hy + 1, cx - 8, hy - 2, C.bone);
      s.drawLine(cx - 7, hy - 1, cx - 7, hy - 4, C.bone);
      s.drawLine(cx - 5, hy, cx - 6, hy - 3, C.boneLo);
      s.drawLine(cx + 3, hy + 1, cx + 7, hy - 2, C.bone);
      s.drawLine(cx + 6, hy - 1, cx + 6, hy - 4, C.bone);
      s.drawLine(cx + 4, hy, cx + 5, hy - 3, C.boneLo);
      // Glowing amber visor slit
      s.fillRect(cx - 2, hy + 3, 5, 1, C.orangeHi);
      s.setPx(cx, hy + 3, C.white);
      break;
    }
    case 'gustaf': {
      // Pointed shadow hood + piercing twin neon-violet eyes
      s.fillRect(cx - 4, hy - 1, 8, 6, hexToRgba('#2c1c42'));
      s.fillRect(cx - 3, hy - 2, 6, 2, hexToRgba('#452c69'));
      s.fillRect(cx - 1, hy - 3, 2, 2, hexToRgba('#583a82'));
      s.fillRect(cx - 3, hy + 1, 6, 4, hexToRgba('#110c1c'));
      s.setPx(cx - 2, hy + 2, C.purpleHi);
      s.setPx(cx + 1, hy + 2, C.purpleHi);
      if (frame % 2 === 0) {
        s.setPx(cx - 2, hy + 3, C.purple);
        s.setPx(cx + 1, hy + 3, C.purple);
      }
      break;
    }
    case 'einar': {
      // Riveted brass mining helmet + glowing headlamp + braided orange beard
      s.drawBevelRect(cx - 4, hy - 1, 8, 4, C.gold);
      s.fillRect(cx - 1, hy, 3, 2, C.yellow);
      s.setPx(cx, hy, C.white);
      // Thick braided fiery beard
      s.fillRect(cx - 3, hy + 4, 6, 4, C.orange);
      s.fillRect(cx - 2, hy + 5, 4, 4, C.orangeHi);
      s.setPx(cx - 1, hy + 8, C.gold);
      s.setPx(cx + 1, hy + 8, C.gold);
      s.setPx(cx - 2, hy + 3, C.ink);
      s.setPx(cx + 1, hy + 3, C.ink);
      break;
    }
    case 'gunilla': {
      // Red bandana + oversized neon-lime aviator goggles
      s.fillRect(cx - 4, hy, 8, 2, C.red);
      s.setPx(cx - 5, hy + 1, C.redHi);
      s.setPx(cx - 6, hy + 2, C.red);
      s.fillRect(cx - 3, hy + 2, 3, 2, C.limeHi);
      s.fillRect(cx + 1, hy + 2, 3, 2, C.limeHi);
      s.setPx(cx - 2, hy + 2, C.white);
      s.setPx(cx + 2, hy + 2, C.white);
      break;
    }
    case 'trulls': {
      // Rugged troll brow + tusks + glowing teal cyber-eye lens
      s.fillRect(cx - 4, hy, 8, 2, C.trollLo);
      s.setPx(cx - 2, hy + 2, C.emerald);
      s.setPx(cx - 1, hy + 2, C.white);
      s.setPx(cx + 2, hy + 2, C.yellow);
      // Lower tusks
      s.setPx(cx - 2, hy + 5, C.bone);
      s.setPx(cx + 2, hy + 5, C.bone);
      break;
    }
    case 'stellan': {
      // Long pointed goblin ears + demolition goggles + manic glowing eyes
      s.drawLine(cx - 4, hy + 2, cx - 7, hy, C.goblin);
      s.drawLine(cx - 4, hy + 3, cx - 6, hy + 1, C.goblinLo);
      s.drawLine(cx + 3, hy + 2, cx + 6, hy, C.goblin);
      s.drawLine(cx + 3, hy + 3, cx + 5, hy + 1, C.goblinLo);
      s.fillRect(cx - 3, hy, 6, 2, C.steel);
      s.setPx(cx - 2, hy + 2, C.yellow);
      s.setPx(cx + 1, hy + 2, C.yellow);
      s.setPx(cx - 1, hy + 4, C.bone);
      s.setPx(cx + 1, hy + 4, C.bone);
      break;
    }
    case 'hilda': {
      // Living wooden antlers with glowing emerald blossoms + emerald eyes
      s.drawLine(cx - 3, hy, cx - 6, hy - 4, C.wood);
      s.drawLine(cx - 5, hy - 2, cx - 7, hy - 2, C.wood);
      s.drawLine(cx + 2, hy, cx + 5, hy - 4, C.wood);
      s.drawLine(cx + 4, hy - 2, cx + 6, hy - 2, C.wood);
      s.setPx(cx - 6, hy - 4, C.emerald);
      s.setPx(cx - 7, hy - 2, C.limeHi);
      s.setPx(cx + 5, hy - 4, C.emerald);
      s.setPx(cx + 6, hy - 2, C.limeHi);
      s.setPx(cx - 2, hy + 3, C.limeHi);
      s.setPx(cx + 1, hy + 3, C.limeHi);
      break;
    }
  }

  s.applyOutline(C.ink);
  return s;
}

// ============================================================================
// 2. SIX TWO-PHASE MECHANICAL NORSE BOSSES (56x56 / 64x64, 4-FRAME ANIM)
// ============================================================================

type BossKind = 'fenrir' | 'skadi' | 'loki_body' | 'hel' | 'surtur' | 'krunked';

function drawBossFrame(kind: BossKind, phase2: boolean, frame: number): PixelSurface {
  const size = kind === 'fenrir' || kind === 'surtur' || kind === 'krunked' ? 64 : 56;
  const s = new PixelSurface(size, size);
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const pulse = frame === 1 || frame === 3 ? 1 : 0;
  const bob = frame === 1 ? -1 : frame === 3 ? 1 : 0;

  if (kind === 'fenrir') {
    // Irradiated Fenrir -> Meltdown Fenrir (Colossal Cybernetic Nuclear Wolf)
    const armor = phase2 ? hexToRgba('#45272b') : hexToRgba('#4a5566');
    const armorHi = phase2 ? hexToRgba('#7a3b3b') : hexToRgba('#8094ad');
    const core = phase2 ? (pulse ? C.yellow : C.orange) : pulse ? C.limeHi : C.lime;
    const eye = phase2 ? C.white : C.limeHi;

    // Massive mechanical wolf hindquarters & armored ribcage
    s.drawShadedEllipse(cx, cy + 8 + bob, 20, 14, armor);
    // Glowing nuclear reactor spine & ribs
    for (let i = -3; i <= 3; i++) {
      s.fillRect(cx + i * 4 - 1, cy + 2 + bob, 2, 11, core);
      s.fillRect(cx + i * 4 - 2, cy + 4 + bob, 4, 2, armorHi);
    }
    // Shredded iron chains trailing
    for (let i = 0; i < 4; i++) {
      s.drawRectOutline(cx - 24 + i * 3, cy + 16 + (i % 2), 4, 3, C.steel);
      s.drawRectOutline(cx + 16 + i * 2, cy + 16 + ((i + 1) % 2), 4, 3, C.steel);
    }
    // Heavy cyber paws
    s.drawBevelRect(cx - 20, cy + 18, 9, 8, armorHi);
    s.drawBevelRect(cx + 11, cy + 18, 9, 8, armorHi);
    s.fillRect(cx - 19, cy + 25, 2, 3, C.steelHi);
    s.fillRect(cx - 15, cy + 25, 2, 3, C.steelHi);
    s.fillRect(cx + 12, cy + 25, 2, 3, C.steelHi);
    s.fillRect(cx + 16, cy + 25, 2, 3, C.steelHi);

    // Armored wolf head & gaping steel jaws
    s.drawShadedEllipse(cx, cy - 8 + bob, 14, 11, armorHi);
    // Pointed armored wolf ears
    for (let e = 0; e < 9; e++) {
      s.fillRect(cx - 13 + Math.floor(e / 2), cy - 22 + e + bob, 5 - Math.floor(e / 3), 2, armor);
      s.fillRect(cx + 9 - Math.floor(e / 2), cy - 22 + e + bob, 5 - Math.floor(e / 3), 2, armor);
    }
    // Snout & glowing reactor maw
    s.drawBevelRect(cx - 8, cy - 4 + bob, 16, 10, armor);
    s.fillRect(cx - 6, cy + 1 + bob, 12, 4, phase2 ? C.orangeHi : C.limeLo);
    // Razor metallic fangs
    for (let f = -5; f <= 5; f += 3) {
      s.fillRect(cx + f, cy + bob, 2, 3, C.white);
      s.fillRect(cx + f, cy + 3 + bob, 2, 2, C.steelHi);
    }
    // Blazing cyber-eyes
    s.fillRect(cx - 9, cy - 10 + bob, 5, 3, core);
    s.fillRect(cx + 4, cy - 10 + bob, 5, 3, core);
    s.fillRect(cx - 8, cy - 9 + bob, 3, 1, eye);
    s.fillRect(cx + 5, cy - 9 + bob, 3, 1, eye);
    // Forehead Norse rune
    s.drawNorseRune(cx - 1, cy - 16 + bob, 1, core);

    if (phase2) {
      // Meltdown plasma arcs
      s.drawLine(cx - 22, cy - 12, cx - 15, cy - 5 + pulse * 2, C.yellow);
      s.drawLine(cx + 22, cy - 12, cx + 15, cy - 5 - pulse * 2, C.yellow);
      s.addEmissiveHalo(hexToRgba('#ff6600', 120), 1);
    }
  } else if (kind === 'skadi') {
    // Queen Skadi -> Warrior Skadi (Frost Valkyrie Mech)
    const plate = phase2 ? hexToRgba('#385778') : hexToRgba('#6284a8');
    const iceGlow = phase2 ? (pulse ? C.white : C.cyan) : C.ice;
    const accent = phase2 ? C.redHi : C.cyan;

    // Floating crystalline ice wings
    const wingSpread = phase2 ? 22 : 18;
    for (let w = 0; w < 3; w++) {
      const wy = cy - 12 + w * 8 + bob;
      s.drawLine(cx - 8, wy, cx - wingSpread - w * 2, wy - 7 + pulse, iceGlow);
      s.drawLine(cx - 8, wy + 1, cx - wingSpread - w * 2, wy - 5 + pulse, C.cyan);
      s.drawLine(cx + 8, wy, cx + wingSpread + w * 2, wy - 7 + pulse, iceGlow);
      s.drawLine(cx + 8, wy + 1, cx + wingSpread + w * 2, wy - 5 + pulse, C.cyan);
    }
    // Valkyrie armored dress & core
    s.drawShadedEllipse(cx, cy + 8 + bob, 11, 14, plate);
    s.drawBevelRect(cx - 9, cy - 4 + bob, 18, 14, plate);
    s.drawNorseRune(cx - 1, cy - 1 + bob, 0, accent);
    // Pauldrons
    s.drawShadedEllipse(cx - 11, cy - 2 + bob, 5, 4, C.steelHi);
    s.drawShadedEllipse(cx + 11, cy - 2 + bob, 5, 4, C.steelHi);
    // Cryo-spear held across side
    s.drawLine(cx + 15, cy - 20 + bob, cx + 15, cy + 20 + bob, C.steelHi);
    s.fillRect(cx + 13, cy - 24 + bob, 5, 6, iceGlow);
    // Crowned helm
    s.drawShadedEllipse(cx, cy - 13 + bob, 7, 7, C.steelHi);
    // Ice Tiara spikes
    s.fillRect(cx - 1, cy - 25 + bob, 2, 7, iceGlow);
    s.fillRect(cx - 5, cy - 23 + bob, 2, 5, C.cyan);
    s.fillRect(cx + 3, cy - 23 + bob, 2, 5, C.cyan);
    // Glowing Valkyrie Visor
    s.fillRect(cx - 5, cy - 14 + bob, 10, 3, accent);
    s.fillRect(cx - 3, cy - 13 + bob, 6, 1, C.white);
  } else if (kind === 'loki_body') {
    // Loki's Body -> Loki's Body in Overdrive (Headless Gilded Trickster Mech)
    const hull = phase2 ? hexToRgba('#291c3d') : hexToRgba('#1b4738');
    const trim = phase2 ? C.magenta : C.gold;
    const glow = phase2 ? (pulse ? C.magenta : C.emerald) : pulse ? C.limeHi : C.emerald;

    // Twin curved serpent-blades extending from mechanical arms
    s.drawLine(cx - 12, cy + 2 + bob, cx - 24, cy - 10 + bob, C.steelHi);
    s.drawLine(cx - 12, cy + 3 + bob, cx - 23, cy - 8 + bob, glow);
    s.drawLine(cx + 12, cy + 2 + bob, cx + 24, cy - 10 + bob, C.steelHi);
    s.drawLine(cx + 12, cy + 3 + bob, cx + 23, cy - 8 + bob, glow);

    // Ornate cybernetic torso & legs
    s.drawBevelRect(cx - 10, cy + 12, 7, 12, hull);
    s.drawBevelRect(cx + 3, cy + 12, 7, 12, hull);
    s.drawBevelRect(cx - 12, cy - 8 + bob, 24, 21, hull);
    s.drawRectOutline(cx - 12, cy - 8 + bob, 24, 21, trim);
    // Central trickster reactor prism
    s.drawShadedEllipse(cx, cy + 2 + bob, 6, 6, glow);
    s.drawNorseRune(cx - 1, cy - 1 + bob, 4, C.white);

    // HEADLESS NECK EMITTER + Floating Holographic Horned Glitch Crown!
    s.drawBevelRect(cx - 5, cy - 11 + bob, 10, 4, C.gold);
    // Holographic projection beams & floating twin trickster horns
    const glitchX = phase2 ? (frame % 2 === 0 ? -1 : 1) : 0;
    s.fillRect(cx - 4 + glitchX, cy - 17 + bob, 8, 5, [glow[0], glow[1], glow[2], 180]);
    s.drawLine(cx - 4 + glitchX, cy - 17 + bob, cx - 10 + glitchX, cy - 25 + bob, glow);
    s.drawLine(cx + 4 + glitchX, cy - 17 + bob, cx + 10 + glitchX, cy - 25 + bob, glow);
    s.setPx(cx - 2 + glitchX, cy - 15 + bob, C.white);
    s.setPx(cx + 2 + glitchX, cy - 15 + bob, C.white);
  } else if (kind === 'hel') {
    // Hel -> Hel Scorned (Half-Living / Half-Skeletal Cyber Necromancer + Floating Hands)
    const cloak = phase2 ? hexToRgba('#45122d') : hexToRgba('#341b4d');
    const soul = phase2 ? (pulse ? C.redHi : C.magenta) : pulse ? C.cyan : C.purpleHi;

    // Tattered hovering royal necromancer robe
    s.drawShadedEllipse(cx, cy + 8 + bob, 14, 16, cloak);
    for (let t = -12; t <= 12; t += 4) {
      s.fillRect(cx + t, cy + 20, 2, 5 + (Math.abs(t) % 3), cloak);
    }
    // Ribbed armored corset
    s.drawBevelRect(cx - 8, cy - 4 + bob, 16, 14, C.obsidianHi);
    for (let r = 0; r < 3; r++) {
      s.fillRect(cx - 6, cy - 1 + r * 4 + bob, 12, 2, C.boneLo);
    }
    s.fillRect(cx - 2, cy - 1 + bob, 4, 10, soul);

    // Dual-faced head: left half pale living cyber-valkyrie, right half iron-skull!
    s.drawShadedEllipse(cx, cy - 13 + bob, 8, 8, C.bone);
    s.fillRect(cx - 8, cy - 20 + bob, 8, 14, phase2 ? C.obsidianHi : hexToRgba('#8ec9d4'));
    // Crown of bone & soulfire
    s.fillRect(cx - 7, cy - 22 + bob, 14, 3, C.obsidian);
    s.fillRect(cx - 6, cy - 26 + bob, 2, 5, soul);
    s.fillRect(cx - 1, cy - 27 + bob, 2, 6, soul);
    s.fillRect(cx + 4, cy - 26 + bob, 2, 5, soul);
    // Asymmetric glowing eyes
    s.fillRect(cx - 5, cy - 14 + bob, 3, 2, C.cyan);
    s.fillRect(cx + 2, cy - 14 + bob, 3, 3, phase2 ? C.redHi : C.magenta);
    s.setPx(cx + 3, cy - 13 + bob, C.white);

    // Twin floating spectral mech-hands flanking Hel
    const handY = cy + (frame === 1 ? -3 : frame === 3 ? 3 : 0);
    s.drawBevelRect(cx - 25, handY - 5, 8, 10, C.boneLo);
    s.fillRect(cx - 23, handY - 2, 4, 4, soul);
    s.drawBevelRect(cx + 17, handY - 5, 8, 10, C.boneLo);
    s.fillRect(cx + 19, handY - 2, 4, 4, soul);
  } else if (kind === 'surtur') {
    // Surtur -> Hate Incarnate (Towering Volcanic Magma Giant)
    const rock = phase2 ? hexToRgba('#2b1114') : hexToRgba('#29232c');
    const magma = phase2 ? (pulse ? C.white : C.yellow) : pulse ? C.orangeHi : C.orange;
    const fire = phase2 ? C.redHi : C.red;

    if (phase2) {
      // Blazing magma inferno wings
      for (let w = 0; w < 4; w++) {
        s.drawLine(cx - 14, cy - 8 + w * 5, cx - 30, cy - 20 + w * 7 + pulse, fire);
        s.drawLine(cx - 14, cy - 7 + w * 5, cx - 28, cy - 18 + w * 7 + pulse, magma);
        s.drawLine(cx + 14, cy - 8 + w * 5, cx + 30, cy - 20 + w * 7 + pulse, fire);
        s.drawLine(cx + 14, cy - 7 + w * 5, cx + 28, cy - 18 + w * 7 + pulse, magma);
      }
    }

    // Colossal obsidian body with glowing lava fissures
    s.drawBevelRect(cx - 14, cy + 12, 10, 14, rock);
    s.drawBevelRect(cx + 4, cy + 12, 10, 14, rock);
    s.drawShadedEllipse(cx, cy + 1 + bob, 18, 16, rock);
    // Lava cracks across chest
    s.drawLine(cx - 10, cy - 8 + bob, cx, cy + 4 + bob, magma);
    s.drawLine(cx + 10, cy - 8 + bob, cx, cy + 4 + bob, magma);
    s.drawLine(cx, cy + 4 + bob, cx, cy + 14 + bob, fire);
    s.drawShadedEllipse(cx, cy + 2 + bob, 5, 5, magma);

    // Massive volcanic shoulders
    s.drawShadedEllipse(cx - 19, cy - 5 + bob, 7, 7, rock);
    s.drawShadedEllipse(cx + 19, cy - 5 + bob, 7, 7, rock);
    s.fillRect(cx - 21, cy - 7 + bob, 4, 4, magma);
    s.fillRect(cx + 17, cy - 7 + bob, 4, 4, magma);

    // Horned obsidian fire-crown head
    s.drawShadedEllipse(cx, cy - 15 + bob, 9, 8, rock);
    s.drawLine(cx - 7, cy - 19 + bob, cx - 15, cy - 29 + bob, fire);
    s.drawLine(cx - 6, cy - 18 + bob, cx - 13, cy - 27 + bob, magma);
    s.drawLine(cx + 7, cy - 19 + bob, cx + 15, cy - 29 + bob, fire);
    s.drawLine(cx + 6, cy - 18 + bob, cx + 13, cy - 27 + bob, magma);
    // Furnace eyes & roaring magma mouth
    s.fillRect(cx - 6, cy - 16 + bob, 4, 2, magma);
    s.fillRect(cx + 2, cy - 16 + bob, 4, 2, magma);
    s.fillRect(cx - 5, cy - 11 + bob, 10, 3, fire);
    s.fillRect(cx - 3, cy - 10 + bob, 6, 1, magma);
  } else {
    // KRUNKED -> CORRUPTED KRUNKED (The All-Machine Sovereign — Act 3 Final Boss)
    const plate = phase2 ? hexToRgba('#2b1829') : hexToRgba('#384457');
    const gold = phase2 ? hexToRgba('#c96a2b') : C.gold;
    const eyeGlow = phase2 ? (pulse ? C.white : C.magenta) : pulse ? C.white : C.cyan;
    const runeGlow = phase2 ? C.redHi : C.cyan;

    // Flowing runic cyber-mantle behind sovereign
    s.fillRect(cx - 20, cy - 8 + bob, 40, 32, phase2 ? hexToRgba('#4a102a') : hexToRgba('#1b2a47'));
    s.drawRectOutline(cx - 20, cy - 8 + bob, 40, 32, gold);
    s.drawNorseRune(cx - 17, cy + 12 + bob, 2, runeGlow);
    s.drawNorseRune(cx + 14, cy + 12 + bob, 2, runeGlow);

    // Twin mechanical Raven Shoulder-Turrets!
    s.drawBevelRect(cx - 26, cy - 14 + bob, 9, 9, C.obsidianHi);
    s.drawBevelRect(cx + 17, cy - 14 + bob, 9, 9, C.obsidianHi);
    s.fillRect(cx - 23, cy - 11 + bob, 3, 2, runeGlow);
    s.fillRect(cx + 20, cy - 11 + bob, 3, 2, runeGlow);
    // Raven wing crests
    s.drawLine(cx - 26, cy - 14 + bob, cx - 30, cy - 22 + bob, gold);
    s.drawLine(cx + 25, cy - 14 + bob, cx + 29, cy - 22 + bob, gold);

    // Grand armored sovereign chassis
    s.drawBevelRect(cx - 14, cy - 8 + bob, 28, 26, plate);
    s.drawRectOutline(cx - 14, cy - 8 + bob, 28, 26, gold);
    // Gilded chestplate & reactor core
    s.drawBevelRect(cx - 9, cy - 4 + bob, 18, 12, gold);
    s.drawShadedEllipse(cx, cy + 2 + bob, 5, 5, eyeGlow);
    // Armored sovereign legs
    s.drawBevelRect(cx - 11, cy + 18, 8, 11, plate);
    s.drawBevelRect(cx + 3, cy + 18, 8, 11, plate);

    // Gungnir Cyber-Lance held vertically on right side
    s.fillRect(cx + 22, cy - 28 + bob, 3, 52, C.steelHi);
    s.fillRect(cx + 20, cy - 31 + bob, 7, 7, eyeGlow);
    s.setPx(cx + 23, cy - 32 + bob, C.white);

    // Sovereign War-Helm & SINGLE BLAZING ALL-SEEING CYBER EYE
    s.drawShadedEllipse(cx, cy - 16 + bob, 10, 9, plate);
    s.drawBevelRect(cx - 9, cy - 23 + bob, 18, 5, gold);
    // Winged Valkyrie crown blades
    s.drawLine(cx - 9, cy - 20 + bob, cx - 17, cy - 28 + bob, gold);
    s.drawLine(cx - 8, cy - 18 + bob, cx - 15, cy - 25 + bob, C.goldHi);
    s.drawLine(cx + 8, cy - 20 + bob, cx + 16, cy - 28 + bob, gold);
    s.drawLine(cx + 7, cy - 18 + bob, cx + 14, cy - 25 + bob, C.goldHi);
    // Dark faceplate + Iconic Single Glowing Eye + Scarred Eyepatch
    s.fillRect(cx - 7, cy - 18 + bob, 14, 6, C.obsidian);
    s.fillRect(cx - 5, cy - 16 + bob, 4, 3, C.steelLo); // cyber eyepatch plate
    s.fillRect(cx + 1, cy - 17 + bob, 5, 4, eyeGlow); // blazing single eye
    s.fillRect(cx + 2, cy - 16 + bob, 3, 2, C.white);

    if (phase2) {
      // Shattered floating corruption rune halo & lightning cracks
      s.drawLine(cx - 12, cy - 6 + bob, cx - 3, cy + 8 + bob, C.magenta);
      s.drawLine(cx + 12, cy - 4 + bob, cx + 4, cy + 10 + bob, C.redHi);
      s.fillRect(cx - 18, cy - 28 + pulse * 2, 4, 4, C.magenta);
      s.fillRect(cx + 14, cy - 28 - pulse * 2, 4, 4, C.magenta);
      s.addEmissiveHalo(hexToRgba('#ff1e88', 110), 1);
    }
  }

  s.applyOutline(C.ink);
  return s;
}

// ============================================================================
// 3. ENEMIES (15 DISTINCT ARCHETYPES, 4-FRAME ANIMATIONS + GLOWING EYES)
// ============================================================================

type EnemyVisualKind =
  | 'enemy_bandit'
  | 'enemy_wolf'
  | 'enemy_viking'
  | 'enemy_robot'
  | 'enemy_turret'
  | 'enemy_giant'
  | 'enemy_spider'
  | 'enemy_roach'
  | 'enemy_slime'
  | 'enemy_rat'
  | 'enemy_skeleton'
  | 'enemy_default'
  | 'enemy_mimic'
  | 'enemy_bomber'
  | 'enemy_sniper';

function drawEnemyFrame(kind: EnemyVisualKind, frame: number): PixelSurface {
  const isGiant = kind === 'enemy_giant';
  const w = isGiant ? 32 : 20;
  const h = isGiant ? 32 : 20;
  const s = new PixelSurface(w, h);
  const cx = Math.floor(w / 2);
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const leg = frame === 1 ? -1 : frame === 3 ? 1 : 0;

  switch (kind) {
    case 'enemy_bandit':
    case 'enemy_default': {
      // Wasteland Raider with gas-mask, mohawk, crimson goggles
      s.fillRect(cx - 3, 14 + leg, 2, 4, C.leather);
      s.fillRect(cx + 1, 14 - leg, 2, 4, C.leather);
      s.drawBevelRect(cx - 4, 8 + bob, 8, 7, hexToRgba('#6e3a2c'));
      s.fillRect(cx - 4, 13 + bob, 8, 1, C.steel);
      s.drawShadedEllipse(cx, 6 + bob, 3.2, 3, C.steelLo);
      s.fillRect(cx - 1, 1 + bob, 2, 3, C.orange);
      s.fillRect(cx - 3, 5 + bob, 2, 2, C.redHi);
      s.fillRect(cx + 1, 5 + bob, 2, 2, C.redHi);
      s.setPx(cx - 2, 5 + bob, C.white);
      s.setPx(cx + 2, 5 + bob, C.white);
      break;
    }
    case 'enemy_wolf': {
      // Cyber-fang hound crouched in pouncing stride
      s.fillRect(cx - 6, 12 + leg, 2, 5, C.steelLo);
      s.fillRect(cx + 4, 12 - leg, 2, 5, C.steelLo);
      s.drawShadedEllipse(cx, 11 + bob, 7, 4, hexToRgba('#57606f'));
      s.drawShadedEllipse(cx + 5, 8 + bob, 4, 3.5, hexToRgba('#6d788a'));
      s.fillRect(cx + 3, 3 + bob, 2, 3, C.steel);
      s.fillRect(cx + 6, 3 + bob, 2, 3, C.steel);
      s.fillRect(cx + 6, 7 + bob, 2, 2, C.limeHi);
      s.setPx(cx + 8, 10 + bob, C.white);
      // Spine cyber-cells
      s.setPx(cx - 2, 8 + bob, C.lime);
      s.setPx(cx + 1, 8 + bob, C.lime);
      break;
    }
    case 'enemy_viking': {
      // Horned Norse Berserker with round rune shield
      s.fillRect(cx - 3, 14 + leg, 2, 4, C.wood);
      s.fillRect(cx + 1, 14 - leg, 2, 4, C.wood);
      s.drawBevelRect(cx - 5, 8 + bob, 10, 7, hexToRgba('#384d66'));
      s.drawShadedEllipse(cx - 5, 12 + bob, 3.5, 4, C.wood);
      s.setPx(cx - 5, 12 + bob, C.gold);
      s.drawShadedEllipse(cx, 6 + bob, 3.5, 3, C.steel);
      s.drawLine(cx - 3, 4 + bob, cx - 6, 1 + bob, C.bone);
      s.drawLine(cx + 3, 4 + bob, cx + 6, 1 + bob, C.bone);
      s.setPx(cx - 2, 6 + bob, C.cyan);
      s.setPx(cx + 1, 6 + bob, C.cyan);
      break;
    }
    case 'enemy_robot': {
      // Industrial Norse-Bot with cyclops laser visor & antenna
      s.fillRect(cx - 3, 14 + leg, 2, 4, C.steelLo);
      s.fillRect(cx + 1, 14 - leg, 2, 4, C.steelLo);
      s.drawBevelRect(cx - 5, 6 + bob, 10, 9, C.steel);
      s.fillRect(cx, 1 + bob, 1, 5, C.steelHi);
      s.setPx(cx, 1 + bob, frame % 2 === 0 ? C.redHi : C.orange);
      s.fillRect(cx - 4, 8 + bob, 8, 3, C.obsidian);
      s.fillRect(cx - 2 + (frame % 2), 9 + bob, 4, 1, C.redHi);
      s.setPx(cx - 1 + (frame % 2), 9 + bob, C.white);
      break;
    }
    case 'enemy_turret': {
      // Armored tripod auto-cannon
      s.drawLine(cx, 12, cx - 6, 18, C.steelLo);
      s.drawLine(cx, 12, cx + 6, 18, C.steelLo);
      s.drawLine(cx, 12, cx, 18, C.steel);
      s.drawBevelRect(cx - 5, 6 + bob, 10, 7, C.steel);
      s.fillRect(cx + 4, 8 + bob, 5, 3, C.steelDeep);
      s.fillRect(cx - 2, 8 + bob, 4, 3, C.red);
      s.setPx(cx, 9 + bob, frame % 2 === 0 ? C.yellow : C.redHi);
      break;
    }
    case 'enemy_giant': {
      // 32x32 Hulking Jotunn Brute
      s.drawBevelRect(cx - 7, 22 + leg, 5, 8, C.steelDeep);
      s.drawBevelRect(cx + 2, 22 - leg, 5, 8, C.steelDeep);
      s.drawShadedEllipse(cx, 15 + bob, 10, 9, hexToRgba('#546f85'));
      s.drawBevelRect(cx - 12, 11 + bob, 4, 11, hexToRgba('#42596b'));
      s.drawBevelRect(cx + 8, 11 + bob, 4, 11, hexToRgba('#42596b'));
      s.drawShadedEllipse(cx, 7 + bob, 5.5, 5, hexToRgba('#6d8ca6'));
      s.drawLine(cx - 5, 5 + bob, cx - 9, 1 + bob, C.ice);
      s.drawLine(cx + 5, 5 + bob, cx + 9, 1 + bob, C.ice);
      s.fillRect(cx - 4, 6 + bob, 3, 2, C.cyan);
      s.fillRect(cx + 1, 6 + bob, 3, 2, C.cyan);
      s.drawNorseRune(cx - 1, 13 + bob, 3, C.ice);
      break;
    }
    case 'enemy_spider': {
      // 8-legged Cyber-Arachnid with acid abdomen tank
      for (let i = -1; i <= 1; i++) {
        const y = 10 + i * 3;
        const wiggle = (frame + i) % 2 === 0 ? 1 : -1;
        s.drawLine(cx - 3, y, cx - 8, y + wiggle * 2, C.steelDeep);
        s.drawLine(cx + 3, y, cx + 8, y - wiggle * 2, C.steelDeep);
      }
      s.drawShadedEllipse(cx, 12 + bob, 5, 4.5, C.limeLo);
      s.fillRect(cx - 2, 11 + bob, 4, 2, C.limeHi);
      s.drawShadedEllipse(cx, 7 + bob, 3.5, 3, C.obsidianHi);
      s.setPx(cx - 2, 6 + bob, C.redHi);
      s.setPx(cx, 5 + bob, C.redHi);
      s.setPx(cx + 2, 6 + bob, C.redHi);
      break;
    }
    case 'enemy_roach': {
      // Armored Rad-Cockroach
      s.drawShadedEllipse(cx, 11 + bob, 6, 5, hexToRgba('#784c27'));
      s.drawLine(cx - 5, 10, cx - 8, 8 + leg, C.woodLo);
      s.drawLine(cx + 5, 10, cx + 8, 8 - leg, C.woodLo);
      s.drawLine(cx - 2, 6 + bob, cx - 5, 2 + bob, C.orange);
      s.drawLine(cx + 2, 6 + bob, cx + 5, 2 + bob, C.orange);
      s.fillRect(cx - 3, 9 + bob, 6, 1, C.lime);
      s.setPx(cx - 2, 7 + bob, C.orangeHi);
      s.setPx(cx + 1, 7 + bob, C.orangeHi);
      break;
    }
    case 'enemy_slime': {
      // Wobbling translucent toxic-lime bio-slime
      const squishX = frame === 1 ? 7.5 : frame === 3 ? 5.5 : 6.5;
      const squishY = frame === 1 ? 4.5 : frame === 3 ? 6.5 : 5.5;
      s.drawShadedEllipse(cx, 13, squishX, squishY, C.lime);
      s.fillEllipse(cx - 2, 11, 2, 1.5, C.limeHi);
      s.setPx(cx - 2, 12, C.white);
      s.setPx(cx + 2, 12, C.white);
      s.setPx(cx + 1, 14, C.emerald);
      break;
    }
    case 'enemy_rat': {
      // Sewer cyber-rodent with tail & glowing red eyes
      s.drawLine(cx - 5, 13, cx - 9, 15 + leg, C.redLo);
      s.drawShadedEllipse(cx, 12 + bob, 5.5, 3.8, hexToRgba('#7a6c68'));
      s.drawBevelRect(cx - 2, 9 + bob, 4, 3, C.steel);
      s.setPx(cx + 2, 7 + bob, hexToRgba('#a8948e'));
      s.setPx(cx + 4, 11 + bob, C.redHi);
      s.setPx(cx + 6, 12 + bob, hexToRgba('#e89999'));
      break;
    }
    case 'enemy_skeleton': {
      // Cyber-Draugr Skeleton
      s.fillRect(cx - 2, 14 + leg, 1, 4, C.bone);
      s.fillRect(cx + 1, 14 - leg, 1, 4, C.bone);
      s.fillRect(cx - 3, 9 + bob, 6, 5, C.obsidian);
      s.fillRect(cx - 3, 9 + bob, 6, 1, C.bone);
      s.fillRect(cx - 2, 11 + bob, 4, 1, C.bone);
      s.fillRect(cx - 2, 13 + bob, 4, 1, C.bone);
      s.drawShadedEllipse(cx, 6 + bob, 3.2, 3, C.bone);
      s.setPx(cx - 2, 6 + bob, C.cyan);
      s.setPx(cx + 1, 6 + bob, C.cyan);
      break;
    }
    case 'enemy_mimic': {
      // Fanged Iron Loot-Chest Monster
      s.drawBevelRect(cx - 6, 8 + bob, 12, 9, C.wood);
      s.drawRectOutline(cx - 6, 8 + bob, 12, 9, C.gold);
      // Gaping fanged mouth
      s.fillRect(cx - 5, 11 + bob, 10, 3, C.redLo);
      s.fillRect(cx - 2, 13 + bob, 4, 2, C.purpleHi);
      for (let t = -4; t <= 4; t += 2) {
        s.setPx(cx + t, 11 + bob, C.white);
      }
      s.setPx(cx - 3, 9 + bob, C.yellow);
      s.setPx(cx + 2, 9 + bob, C.yellow);
      break;
    }
    case 'enemy_bomber': {
      // Volatile Goblin/Drone carrying blinking warhead
      s.fillRect(cx - 3, 14 + leg, 2, 4, C.goblinLo);
      s.fillRect(cx + 1, 14 - leg, 2, 4, C.goblinLo);
      s.drawShadedEllipse(cx, 10 + bob, 5, 5, C.obsidianHi);
      // Pulsing danger core
      s.fillEllipse(cx, 10 + bob, 2.5, 2.5, frame % 2 === 0 ? C.redHi : C.yellow);
      s.setPx(cx, 4 + bob, frame % 2 === 0 ? C.yellow : C.orange);
      s.setPx(cx - 2, 6 + bob, C.yellow);
      s.setPx(cx + 2, 6 + bob, C.yellow);
      break;
    }
    case 'enemy_sniper': {
      // Cloaked Laser-Scout with glowing crimson monocle
      s.fillRect(cx - 3, 14 + leg, 2, 4, C.obsidian);
      s.fillRect(cx + 1, 14 - leg, 2, 4, C.obsidian);
      s.drawBevelRect(cx - 4, 7 + bob, 8, 8, hexToRgba('#2d3a3a'));
      s.drawShadedEllipse(cx, 5 + bob, 3.2, 3, hexToRgba('#1f2929'));
      s.fillRect(cx - 2, 5 + bob, 4, 2, C.redHi);
      s.setPx(cx, 5 + bob, C.white);
      // Long sniper silhouette across front
      s.fillRect(cx - 2, 10 + bob, 11, 2, C.steel);
      s.setPx(cx + 8, 10 + bob, C.redHi);
      break;
    }
  }

  s.applyOutline(C.ink);
  return s;
}

// ============================================================================
// 4. WEAPON ARCHETYPES (22 CRAFTED PIXEL WEAPONS + GOLDEN VARIANTS)
// ============================================================================

export type WeaponArchetypeKey =
  | 'wep_pistol'
  | 'wep_revolver'
  | 'wep_smg'
  | 'wep_rifle'
  | 'wep_assault'
  | 'wep_sniper'
  | 'wep_shotgun'
  | 'wep_double_barrel'
  | 'wep_crossbow'
  | 'wep_ballista'
  | 'wep_plasma'
  | 'wep_laser'
  | 'wep_railgun'
  | 'wep_rocket'
  | 'wep_grenade_launcher'
  | 'wep_minigun'
  | 'wep_dagger'
  | 'wep_axe'
  | 'wep_sword'
  | 'wep_greatsword'
  | 'wep_hammer'
  | 'wep_staff';

export const WEAPON_ARCHETYPE_KEYS: readonly WeaponArchetypeKey[] = [
  'wep_pistol',
  'wep_revolver',
  'wep_smg',
  'wep_rifle',
  'wep_assault',
  'wep_sniper',
  'wep_shotgun',
  'wep_double_barrel',
  'wep_crossbow',
  'wep_ballista',
  'wep_plasma',
  'wep_laser',
  'wep_railgun',
  'wep_rocket',
  'wep_grenade_launcher',
  'wep_minigun',
  'wep_dagger',
  'wep_axe',
  'wep_sword',
  'wep_greatsword',
  'wep_hammer',
  'wep_staff',
];

interface WeaponBlueprint {
  key: WeaponArchetypeKey;
  w: number;
  h: number;
  originX: number;
  originY: number;
  accent: RGBA;
  body: RGBA;
}

const WEAPON_BLUEPRINTS: readonly WeaponBlueprint[] = [
  { key: 'wep_pistol', w: 18, h: 12, originX: 5, originY: 7, accent: C.cyan, body: C.steel },
  { key: 'wep_revolver', w: 20, h: 12, originX: 5, originY: 7, accent: C.gold, body: C.steelHi },
  { key: 'wep_smg', w: 22, h: 12, originX: 6, originY: 7, accent: C.orange, body: C.steelLo },
  { key: 'wep_rifle', w: 26, h: 12, originX: 7, originY: 7, accent: C.emerald, body: C.steel },
  { key: 'wep_assault', w: 26, h: 13, originX: 7, originY: 7, accent: C.cyan, body: hexToRgba('#4f5d70') },
  { key: 'wep_sniper', w: 32, h: 12, originX: 8, originY: 7, accent: C.redHi, body: C.steelDeep },
  { key: 'wep_shotgun', w: 26, h: 12, originX: 7, originY: 7, accent: C.orangeHi, body: C.steelLo },
  { key: 'wep_double_barrel', w: 24, h: 12, originX: 6, originY: 7, accent: C.gold, body: C.wood },
  { key: 'wep_crossbow', w: 24, h: 16, originX: 6, originY: 8, accent: C.limeHi, body: C.wood },
  { key: 'wep_ballista', w: 28, h: 18, originX: 7, originY: 9, accent: C.cyan, body: C.bronze },
  { key: 'wep_plasma', w: 26, h: 14, originX: 7, originY: 8, accent: C.cyan, body: hexToRgba('#384661') },
  { key: 'wep_laser', w: 28, h: 12, originX: 7, originY: 6, accent: C.magenta, body: C.steelHi },
  { key: 'wep_railgun', w: 32, h: 14, originX: 8, originY: 7, accent: C.ice, body: hexToRgba('#2d394d') },
  { key: 'wep_rocket', w: 30, h: 14, originX: 8, originY: 8, accent: C.redHi, body: hexToRgba('#49593e') },
  { key: 'wep_grenade_launcher', w: 26, h: 14, originX: 7, originY: 8, accent: C.yellow, body: C.steelLo },
  { key: 'wep_minigun', w: 30, h: 16, originX: 8, originY: 8, accent: C.orangeHi, body: C.steelDeep },
  { key: 'wep_dagger', w: 18, h: 10, originX: 4, originY: 5, accent: C.cyan, body: C.steelHi },
  { key: 'wep_axe', w: 24, h: 16, originX: 5, originY: 8, accent: C.orange, body: C.steel },
  { key: 'wep_sword', w: 26, h: 12, originX: 5, originY: 6, accent: C.ice, body: C.steelHi },
  { key: 'wep_greatsword', w: 32, h: 14, originX: 6, originY: 7, accent: C.purpleHi, body: C.steel },
  { key: 'wep_hammer', w: 26, h: 18, originX: 5, originY: 9, accent: C.cyan, body: C.steel },
  { key: 'wep_staff', w: 28, h: 14, originX: 6, originY: 7, accent: C.emerald, body: C.bronze },
];

function drawWeaponSprite(bp: WeaponBlueprint, golden: boolean): PixelSurface {
  const s = new PixelSurface(bp.w, bp.h);
  const body = golden ? C.gold : bp.body;
  const trim = golden ? C.goldHi : C.steelHi;
  const accent = golden ? C.white : bp.accent;
  const cy = bp.originY;

  switch (bp.key) {
    case 'wep_pistol':
    case 'wep_revolver': {
      s.drawBevelRect(4, cy - 3, bp.w - 7, 4, body);
      s.fillRect(4, cy + 1, 3, 4, C.wood);
      if (bp.key === 'wep_revolver') {
        s.drawBevelRect(7, cy - 2, 4, 4, trim);
      }
      s.fillRect(bp.w - 4, cy - 2, 2, 2, accent);
      break;
    }
    case 'wep_smg': {
      s.drawBevelRect(3, cy - 3, 14, 5, body);
      s.fillRect(5, cy + 2, 3, 3, C.steelDeep);
      s.fillRect(10, cy + 2, 2, 4, C.steelLo); // extended mag
      s.fillRect(17, cy - 2, 3, 2, trim);
      s.fillRect(8, cy - 2, 4, 1, accent);
      break;
    }
    case 'wep_rifle':
    case 'wep_assault': {
      s.fillRect(2, cy - 1, 5, 4, C.woodLo); // stock
      s.drawBevelRect(6, cy - 3, 13, 5, body);
      s.fillRect(19, cy - 2, 5, 2, trim); // barrel
      s.fillRect(12, cy + 2, 3, 3, C.steelDeep); // mag
      s.fillRect(9, cy - 4, 5, 1, accent); // holographic rail
      break;
    }
    case 'wep_sniper': {
      s.fillRect(2, cy - 1, 6, 4, C.steelDeep);
      s.drawBevelRect(7, cy - 3, 11, 4, body);
      s.fillRect(18, cy - 2, 12, 2, trim); // long sniper barrel
      s.drawBevelRect(10, cy - 6, 7, 3, C.steelLo); // scope
      s.setPx(16, cy - 5, accent);
      s.setPx(29, cy - 2, accent);
      break;
    }
    case 'wep_shotgun':
    case 'wep_double_barrel': {
      s.fillRect(2, cy - 1, 6, 4, C.wood);
      s.drawBevelRect(7, cy - 3, 15, 4, body);
      s.fillRect(13, cy + 1, 6, 2, C.woodLo); // pump grip
      if (bp.key === 'wep_double_barrel') {
        s.fillRect(10, cy - 4, 12, 2, trim);
      }
      s.fillRect(9, cy - 2, 3, 1, accent);
      break;
    }
    case 'wep_crossbow':
    case 'wep_ballista': {
      s.drawBevelRect(3, cy - 2, bp.w - 8, 4, body);
      // Bow limbs
      s.drawLine(bp.w - 8, cy, bp.w - 13, 2, trim);
      s.drawLine(bp.w - 8, cy, bp.w - 13, bp.h - 3, trim);
      // Bowstring
      s.drawLine(bp.w - 13, 2, 8, cy, C.steelHi);
      s.drawLine(bp.w - 13, bp.h - 3, 8, cy, C.steelHi);
      // Loaded glowing bolt
      s.fillRect(8, cy - 1, bp.w - 10, 2, accent);
      break;
    }
    case 'wep_plasma':
    case 'wep_laser':
    case 'wep_railgun': {
      s.drawBevelRect(3, cy - 4, bp.w - 8, 7, body);
      s.fillRect(5, cy + 3, 4, 3, C.steelDeep);
      // Glowing plasma coils / rail prongs
      s.fillRect(9, cy - 2, bp.w - 14, 3, accent);
      s.fillRect(10, cy - 1, bp.w - 16, 1, C.white);
      s.fillRect(bp.w - 6, cy - 4, 4, 2, trim);
      s.fillRect(bp.w - 6, cy + 1, 4, 2, trim);
      break;
    }
    case 'wep_rocket':
    case 'wep_grenade_launcher': {
      s.drawBevelRect(3, cy - 4, bp.w - 7, 7, body);
      s.drawBevelRect(bp.w - 6, cy - 5, 4, 9, trim); // flared tube muzzle
      s.fillRect(7, cy + 3, 4, 3, C.steelDeep);
      if (bp.key === 'wep_grenade_launcher') {
        s.drawShadedEllipse(13, cy + 1, 4, 4, C.steel); // rotary drum
      }
      s.fillRect(10, cy - 2, 5, 2, accent);
      break;
    }
    case 'wep_minigun': {
      s.drawBevelRect(3, cy - 4, 12, 8, body);
      // 3 rotary barrels
      s.fillRect(15, cy - 4, 13, 2, trim);
      s.fillRect(15, cy - 1, 13, 2, C.steel);
      s.fillRect(15, cy + 2, 13, 2, trim);
      s.fillRect(23, cy - 5, 2, 10, accent); // barrel clamp
      s.drawBevelRect(6, cy + 4, 6, 4, C.goldLo); // ammo drum
      break;
    }
    case 'wep_dagger': {
      s.fillRect(2, cy - 1, 4, 2, C.leather);
      s.fillRect(6, cy - 3, 2, 6, C.gold);
      s.drawLine(8, cy - 2, 16, cy, trim);
      s.drawLine(8, cy + 1, 16, cy, body);
      s.fillRect(8, cy - 1, 7, 2, trim);
      s.setPx(10, cy, accent);
      break;
    }
    case 'wep_axe': {
      s.fillRect(2, cy - 1, 17, 2, C.wood);
      // Double-bitted Norse rune axe head
      s.drawBevelRect(14, 2, 7, bp.h - 4, body);
      s.fillRect(20, 3, 2, bp.h - 6, trim);
      s.fillRect(16, cy - 2, 2, 4, accent);
      break;
    }
    case 'wep_sword':
    case 'wep_greatsword': {
      s.fillRect(2, cy - 1, 5, 2, C.leather);
      s.fillRect(7, cy - 4, 2, 8, C.gold);
      const bladeH = bp.key === 'wep_greatsword' ? 5 : 3;
      s.drawBevelRect(9, cy - Math.floor(bladeH / 2), bp.w - 12, bladeH, trim);
      s.fillRect(11, cy, bp.w - 17, 1, accent); // glowing rune fuller
      s.setPx(bp.w - 3, cy, C.white);
      break;
    }
    case 'wep_hammer': {
      s.fillRect(2, cy - 1, 16, 2, C.wood);
      s.drawBevelRect(14, 2, 9, bp.h - 4, body);
      s.drawRectOutline(14, 2, 9, bp.h - 4, trim);
      s.drawNorseRune(17, cy - 2, 1, accent);
      break;
    }
    case 'wep_staff': {
      s.fillRect(2, cy - 1, 19, 2, body);
      s.drawShadedEllipse(22, cy, 4, 4, accent);
      s.setPx(22, cy, C.white);
      break;
    }
  }

  s.applyOutline(C.ink);
  return s;
}

/**
 * Selects the best matching Built-In weapon archetype key given weapon metadata.
 */
export function selectWeaponArchetypeKey(
  ammoType: AmmoType,
  weaponClass: WeaponClass,
  uniqueId: number,
  golden = false
): string {
  let base: WeaponArchetypeKey;
  if (weaponClass === 1 || ammoType === 0) {
    const meleeKeys: readonly WeaponArchetypeKey[] = [
      'wep_sword',
      'wep_axe',
      'wep_hammer',
      'wep_greatsword',
      'wep_dagger',
    ];
    base = meleeKeys[Math.abs(uniqueId) % meleeKeys.length];
  } else if (ammoType === 1) {
    const bulletKeys: readonly WeaponArchetypeKey[] = [
      'wep_pistol',
      'wep_smg',
      'wep_rifle',
      'wep_assault',
      'wep_revolver',
      'wep_sniper',
      'wep_minigun',
    ];
    base = bulletKeys[Math.abs(uniqueId) % bulletKeys.length];
  } else if (ammoType === 2) {
    base = uniqueId % 2 === 0 ? 'wep_shotgun' : 'wep_double_barrel';
  } else if (ammoType === 3) {
    base = uniqueId % 2 === 0 ? 'wep_crossbow' : 'wep_ballista';
  } else if (ammoType === 4) {
    const energyKeys: readonly WeaponArchetypeKey[] = [
      'wep_plasma',
      'wep_laser',
      'wep_railgun',
      'wep_staff',
    ];
    base = energyKeys[Math.abs(uniqueId) % energyKeys.length];
  } else {
    base = uniqueId % 2 === 0 ? 'wep_rocket' : 'wep_grenade_launcher';
  }
  return golden ? `${base}_gold` : base;
}

// ============================================================================
// 5. BIOME TILESETS (16x16 NEUTRAL SHADED STONE/STEEL FOR RICH BIOME TINTING)
// ============================================================================

function drawFloorTile(variant: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  // Neutral mid-bright slate so biome vertex color tinting shines crisply
  const base: RGBA = [208, 208, 214, 255];
  const hi: RGBA = [228, 228, 234, 255];
  const lo: RGBA = [172, 172, 180, 255];
  const mortar: RGBA = [138, 138, 148, 255];

  s.fillRect(0, 0, 16, 16, base);
  // Subtle pixel grain
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const h = pixelHash(x, y, 701 + variant * 31);
      if (h > 0.84) s.setPx(x, y, hi);
      else if (h < 0.14) s.setPx(x, y, lo);
    }
  }
  // Flagstone mortar seams
  s.fillRect(0, 0, 16, 1, mortar);
  s.fillRect(0, 8, 16, 1, mortar);
  const splitTop = variant % 2 === 0 ? 8 : 5;
  const splitBot = variant % 2 === 0 ? 3 : 11;
  s.fillRect(splitTop, 0, 1, 8, mortar);
  s.fillRect(splitBot, 8, 1, 8, mortar);
  // Subtle top bevel catchlight
  s.fillRect(1, 1, 14, 1, hi);
  s.fillRect(1, 9, 14, 1, hi);

  if (variant === 2) {
    // Faint worn Norse stone rune
    s.drawNorseRune(6, 2, 3, [152, 152, 166, 255]);
  } else if (variant === 3) {
    // Hairline stone crack
    s.drawLine(3, 3, 6, 6, mortar);
    s.drawLine(6, 6, 8, 5, mortar);
  }
  return s;
}

function drawWallTopTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const base: RGBA = [212, 214, 224, 255];
  const hi: RGBA = [242, 244, 252, 255];
  const lo: RGBA = [148, 152, 166, 255];
  const trim: RGBA = [110, 114, 128, 255];

  s.drawBevelRect(0, 0, 16, 16, base);
  s.drawRectOutline(2, 2, 12, 12, lo);
  s.fillRect(3, 3, 10, 10, [196, 198, 210, 255]);
  s.fillRect(3, 3, 10, 1, hi);
  // Corner rivets
  s.setPx(1, 1, trim);
  s.setPx(14, 1, trim);
  s.setPx(1, 14, trim);
  s.setPx(14, 14, trim);
  // Subtle etched Norse glyph center
  s.drawNorseRune(6, 5, 0, [168, 172, 188, 255]);
  return s;
}

function drawWallFaceTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const brick: RGBA = [182, 184, 196, 255];
  const mortar: RGBA = [104, 106, 120, 255];
  const hi: RGBA = [215, 218, 230, 255];

  s.fillRect(0, 0, 16, 16, brick);
  // Horizontal masonry bands
  s.fillRect(0, 0, 16, 2, hi);
  s.fillRect(0, 5, 16, 1, mortar);
  s.fillRect(0, 10, 16, 1, mortar);
  s.fillRect(0, 15, 16, 1, [72, 74, 86, 255]);
  // Vertical joints
  s.fillRect(7, 2, 1, 3, mortar);
  s.fillRect(3, 6, 1, 4, mortar);
  s.fillRect(12, 6, 1, 4, mortar);
  s.fillRect(8, 11, 1, 4, mortar);
  return s;
}

function drawWallCrackOverlay(heavy: boolean): PixelSurface {
  const s = new PixelSurface(16, 16);
  const dark: RGBA = [14, 10, 18, 235];
  const edge: RGBA = [245, 225, 195, 160];
  s.drawLine(3, 2, 7, 7, dark);
  s.drawLine(7, 7, 12, 11, dark);
  s.drawLine(7, 7, 4, 12, dark);
  s.setPx(4, 2, edge);
  s.setPx(8, 7, edge);
  if (heavy) {
    s.drawLine(12, 3, 7, 7, dark);
    s.drawLine(2, 9, 7, 8, dark);
    s.drawLine(10, 14, 7, 7, dark);
    s.fillRect(6, 6, 3, 3, [20, 14, 24, 245]);
    s.setPx(7, 7, [255, 190, 90, 220]); // fracture core ember highlight
  }
  return s;
}

function drawBedrockTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const base: RGBA = [72, 74, 92, 255];
  const hi: RGBA = [110, 114, 138, 255];
  const lo: RGBA = [36, 36, 48, 255];
  s.drawBevelRect(0, 0, 16, 16, base);
  s.drawRectOutline(1, 1, 14, 14, lo);
  s.drawLine(2, 2, 13, 13, lo);
  s.drawLine(13, 2, 2, 13, lo);
  s.drawBevelRect(5, 5, 6, 6, hi);
  s.setPx(2, 2, hi);
  s.setPx(13, 2, hi);
  s.setPx(2, 13, hi);
  s.setPx(13, 13, hi);
  return s;
}

function drawRubbleTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const stone: RGBA = [150, 148, 158, 255];
  const stoneHi: RGBA = [194, 192, 204, 255];
  const stoneLo: RGBA = [92, 90, 102, 255];
  // Jagged debris chunks (transparent background so it sits cleanly over floor)
  s.fillRect(2, 3, 4, 3, stone);
  s.setPx(2, 3, stoneHi);
  s.fillRect(9, 2, 5, 4, stoneLo);
  s.fillRect(10, 2, 3, 2, stone);
  s.fillRect(4, 10, 6, 4, stone);
  s.fillRect(5, 10, 4, 1, stoneHi);
  s.fillRect(12, 11, 3, 3, stoneLo);
  // Bent steel rebar
  s.drawLine(2, 13, 8, 7, C.steelDeep);
  s.applyOutline(INK_OUTLINE);
  return s;
}

function drawCrateTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  s.drawBevelRect(1, 1, 14, 14, C.wood);
  s.drawRectOutline(1, 1, 14, 14, C.steel);
  // Diagonal wood brace
  s.drawLine(3, 3, 12, 12, C.woodLo);
  s.drawLine(4, 3, 12, 11, shadeColor(C.wood, 1.2));
  // Corner iron brackets
  s.fillRect(1, 1, 3, 3, C.steelHi);
  s.fillRect(12, 1, 3, 3, C.steelHi);
  s.fillRect(1, 12, 3, 3, C.steelHi);
  s.fillRect(12, 12, 3, 3, C.steelHi);
  // Glowing Norse supply stencil
  s.drawNorseRune(6, 5, 2, C.orangeHi);
  s.applyOutline(C.ink);
  return s;
}

function drawLavaTile(frame: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const shift = frame * 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const wave = Math.sin(((x + shift) * Math.PI) / 8) + Math.cos(((y - shift * 0.5) * Math.PI) / 8);
      if (wave > 0.95) s.setPx(x, y, C.yellow);
      else if (wave > 0.25) s.setPx(x, y, C.orangeHi);
      else if (wave > -0.55) s.setPx(x, y, C.orange);
      else s.setPx(x, y, hexToRgba('#541812'));
    }
  }
  return s;
}

function drawWaterTile(frame: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const shift = frame * 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const wave = Math.sin(((x + shift) * Math.PI) / 8) * Math.cos(((y + frame * 2) * Math.PI) / 8);
      if (wave > 0.65) s.setPx(x, y, C.ice);
      else if (wave > 0.15) s.setPx(x, y, C.cyanDark);
      else s.setPx(x, y, hexToRgba('#10304a'));
    }
  }
  return s;
}

// ============================================================================
// 6. FX, COMPANIONS, PICKUPS, PROJECTILES, HUD & HUB LANDMARKS
// ============================================================================

function drawMuzzleFlash(frame: number): PixelSurface {
  const s = new PixelSurface(18, 18);
  const cy = 9;
  const len = frame === 0 ? 15 : frame === 1 ? 11 : 7;
  const spread = frame === 0 ? 7 : frame === 1 ? 5 : 3;
  // Fiery outer star burst
  s.fillEllipse(4 + len * 0.35, cy, len * 0.45, spread * 0.45, C.orange);
  s.drawLine(2, cy, 2 + len, cy, C.yellow);
  s.drawLine(3, cy, 3 + len * 0.7, cy - spread, C.orangeHi);
  s.drawLine(3, cy, 3 + len * 0.7, cy + spread, C.orangeHi);
  s.fillEllipse(5, cy, 3.5, 2.5, C.white);
  return s;
}

function drawExplosionFrame(frame: number): PixelSurface {
  const s = new PixelSurface(32, 32);
  const cx = 16;
  const cy = 16;
  const r = 5 + frame * 2.5;
  if (frame === 0) {
    s.fillEllipse(cx, cy, 8, 8, C.yellow);
    s.fillEllipse(cx, cy, 5, 5, C.white);
  } else if (frame <= 2) {
    s.fillEllipse(cx, cy, r, r, C.red);
    s.fillEllipse(cx - 2, cy - 2, r * 0.75, r * 0.75, C.orange);
    s.fillEllipse(cx, cy, r * 0.5, r * 0.5, C.yellow);
    s.fillEllipse(cx, cy, r * 0.25, r * 0.25, C.white);
  } else {
    const smoke: RGBA = [70, 62, 74, frame === 3 ? 210 : 130];
    s.fillEllipse(cx - 5, cy - 4, 6, 6, smoke, true);
    s.fillEllipse(cx + 5, cy - 2, 5, 5, smoke, true);
    s.fillEllipse(cx, cy + 5, 6, 5, smoke, true);
    if (frame === 3) {
      s.fillEllipse(cx, cy, 4, 4, C.orange, true);
    }
  }
  return s;
}

function drawBifrostFrame(frame: number): PixelSurface {
  const s = new PixelSurface(32, 32);
  const cx = 16;
  const cy = 16;
  const ringColors: readonly RGBA[] = [C.magenta, C.cyan, C.emerald, C.yellow, C.purpleHi];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.hypot(dx, dy);
      if (dist > 15 || dist < 2) continue;
      const ang = Math.atan2(dy, dx) + frame * 0.78;
      const spiral = Math.sin(ang * 3 + dist * 0.55);
      if (dist > 11.5) {
        s.setPx(x, y, dist > 13.5 ? C.gold : C.steelHi);
      } else if (spiral > -0.2) {
        const idx = Math.abs(Math.floor(dist * 0.5 + frame)) % ringColors.length;
        const c = ringColors[idx];
        s.setPx(x, y, [c[0], c[1], c[2], 230]);
      } else {
        s.setPx(x, y, [30, 18, 56, 200]);
      }
    }
  }
  s.fillEllipse(cx, cy, 3.5, 3.5, C.white);
  s.applyOutline(C.ink);
  return s;
}

function drawFrostCrystalFrame(frame: number): PixelSurface {
  const s = new PixelSurface(20, 28);
  const cx = 10;
  const hover = frame === 1 ? -1 : frame === 3 ? 1 : 0;
  // Jagged hexagonal glacial crystal
  for (let dy = -10; dy <= 10; dy++) {
    const halfW = Math.max(1, Math.round(6 - Math.abs(dy) * 0.55));
    const y = 14 + dy + hover;
    s.fillRect(cx - halfW, y, halfW, 1, C.ice);
    s.fillRect(cx, y, halfW, 1, C.cyan);
    if (Math.abs(dy) < 5) {
      s.setPx(cx - 1, y, C.white);
    }
  }
  s.drawNorseRune(cx - 1, 11 + hover, 0, C.white);
  s.applyOutline(C.ink);
  return s;
}

function drawCompanionSprite(
  kind: 'turret' | 'drill' | 'seedling' | 'whirlpool' | 'doom_ball' | 'gun_drone',
  frame: number
): PixelSurface {
  if (kind === 'whirlpool') {
    const s = new PixelSurface(32, 32);
    const cx = 16;
    const cy = 16;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const d = Math.hypot(dx, dy);
        if (d > 14.5 || d < 2) continue;
        const a = Math.atan2(dy, dx) + frame * 1.1;
        const v = Math.sin(a * 4 - d * 0.65);
        if (v > 0.2) s.setPx(x, y, [46, 230, 255, 200]);
        else if (v > -0.3) s.setPx(x, y, [24, 140, 200, 145]);
      }
    }
    return s;
  }
  if (kind === 'doom_ball') {
    const s = new PixelSurface(20, 20);
    s.drawShadedEllipse(10, 10, 6.5, 6.5, C.steelDeep);
    // Spikes rotating by frame
    const offset = frame % 2 === 0 ? 0 : Math.PI / 4;
    for (let i = 0; i < 8; i++) {
      const a = offset + (i * Math.PI) / 4;
      const sx = Math.round(10 + Math.cos(a) * 8);
      const sy = Math.round(10 + Math.sin(a) * 8);
      s.fillRect(sx - 1, sy - 1, 2, 2, C.steelHi);
    }
    s.fillEllipse(10, 10, 2.5, 2.5, frame % 2 === 0 ? C.orangeHi : C.yellow);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'drill') {
    const s = new PixelSurface(20, 14);
    s.drawBevelRect(2, 3, 7, 8, C.gold);
    // Spinning conical rune drill
    for (let x = 0; x < 10; x++) {
      const half = Math.max(1, Math.round(4 - x * 0.38));
      const stripe = (x + frame) % 3 === 0 ? C.cyan : C.steelHi;
      s.fillRect(9 + x, 7 - half, 1, half * 2, stripe);
    }
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'turret') {
    const s = new PixelSurface(18, 18);
    s.drawBevelRect(4, 11, 10, 5, C.goldLo);
    s.drawShadedEllipse(9, 8, 5, 5, C.steel);
    s.fillRect(12, 6, 5, 3, C.steelDeep);
    s.fillRect(7, 7, 3, 2, frame % 2 === 0 ? C.yellow : C.orange);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'seedling') {
    const s = new PixelSurface(16, 16);
    const bob = frame === 1 ? -1 : 0;
    s.drawShadedEllipse(8, 10 + bob, 4.5, 4, C.emerald);
    s.drawLine(8, 6 + bob, 5, 2 + bob, C.limeHi);
    s.drawLine(8, 6 + bob, 11, 2 + bob, C.limeHi);
    s.setPx(6, 9 + bob, C.yellow);
    s.setPx(10, 9 + bob, C.yellow);
    s.applyOutline(C.ink);
    return s;
  }
  // gun_drone
  const s = new PixelSurface(16, 16);
  const hover = frame === 1 ? -1 : 0;
  s.drawShadedEllipse(8, 8 + hover, 5, 4, C.steelHi);
  s.fillRect(6, 7 + hover, 4, 2, C.cyan);
  s.fillRect(12, 7 + hover, 3, 2, C.steelDeep);
  s.setPx(8, 13 + hover, frame % 2 === 0 ? C.orangeHi : C.cyan);
  s.applyOutline(C.ink);
  return s;
}

function drawPickupSprite(
  kind: 'hp' | 'ammo' | 'gold' | 'xp' | 'weapon' | 'mod' | 'chest',
  frame: number
): PixelSurface {
  const s = new PixelSurface(16, 16);
  switch (kind) {
    case 'hp': {
      // Glowing crimson Norse med-heart
      s.fillEllipse(6, 6, 3, 3, C.red);
      s.fillEllipse(10, 6, 3, 3, C.red);
      for (let y = 0; y < 6; y++) {
        s.fillRect(4 + y, 8 + y, 9 - y * 2, 1, C.red);
      }
      s.setPx(5, 5, C.white);
      s.setPx(6, 5, C.redHi);
      break;
    }
    case 'ammo': {
      s.drawBevelRect(3, 4, 10, 9, hexToRgba('#4e6e3a'));
      s.fillRect(3, 6, 10, 2, C.gold);
      s.fillRect(6, 9, 1, 3, C.goldHi);
      s.fillRect(9, 9, 1, 3, C.goldHi);
      break;
    }
    case 'gold': {
      // Gleaming Nordic gold coin
      s.drawShadedEllipse(8, 8, 5, 5, C.gold);
      s.drawNorseRune(7, 6, 1, C.goldHi);
      break;
    }
    case 'xp': {
      // Shimmering cyan soul diamond
      for (let dy = -5; dy <= 5; dy++) {
        const hw = Math.max(1, 5 - Math.abs(dy));
        s.fillRect(8 - hw, 8 + dy, hw * 2, 1, C.cyan);
      }
      s.fillRect(7, 6, 2, 4, C.white);
      break;
    }
    case 'weapon': {
      s.drawBevelRect(2, 5, 12, 7, C.steel);
      s.fillRect(4, 7, 8, 2, C.orangeHi);
      s.setPx(8, 3, C.yellow);
      break;
    }
    case 'mod': {
      // Glowing violet/cyan rune chip
      s.drawBevelRect(3, 3, 10, 10, C.purple);
      s.drawNorseRune(6, 5, 4, C.cyan);
      s.setPx(4, 4, C.white);
      break;
    }
    case 'chest': {
      if (frame === 0) {
        // Closed ornate gold-rimmed chest
        s.drawBevelRect(2, 4, 12, 10, C.wood);
        s.drawRectOutline(2, 4, 12, 10, C.gold);
        s.fillRect(2, 8, 12, 1, C.ink);
        s.fillRect(7, 7, 2, 3, C.goldHi);
      } else {
        // Open chest with radiant inner glow
        s.drawBevelRect(2, 7, 12, 7, C.wood);
        s.drawRectOutline(2, 7, 12, 7, C.gold);
        s.fillRect(3, 3, 10, 4, C.woodLo);
        s.fillRect(4, 6, 8, 2, C.yellow);
      }
      break;
    }
  }
  s.applyOutline(C.ink);
  return s;
}

function drawHubLandmark(kind: 'loki' | 'jotunn' | 'yggdrasil' | 'dummy', frame: number): PixelSurface {
  const pulse = frame % 2 === 0;
  if (kind === 'loki') {
    // Loki's talking cyber-head in a glowing emerald containment vat!
    const s = new PixelSurface(32, 36);
    const cx = 16;
    // Stone/metal runic pedestal
    s.drawBevelRect(6, 24, 20, 10, C.steelLo);
    s.drawRectOutline(6, 24, 20, 10, C.gold);
    s.drawNorseRune(14, 27, 4, C.emerald);
    // Glass emerald vat
    s.fillRect(8, 6, 16, 18, [18, 130, 92, 215]);
    s.fillRect(9, 7, 2, 15, [150, 255, 220, 180]); // glass shine
    s.drawBevelRect(7, 4, 18, 3, C.gold);
    s.drawBevelRect(7, 22, 18, 3, C.gold);
    // Floating Loki head with horned helm inside vat
    const hy = pulse ? 14 : 15;
    s.drawShadedEllipse(cx, hy, 4.5, 5, hexToRgba('#b8e6d4'));
    s.drawLine(cx - 3, hy - 3, cx - 6, hy - 7, C.gold);
    s.drawLine(cx + 3, hy - 3, cx + 6, hy - 7, C.gold);
    s.setPx(cx - 2, hy - 1, C.limeHi);
    s.setPx(cx + 2, hy - 1, C.limeHi);
    s.fillRect(cx - 2, hy + 2, 4, 1, C.ink); // sly grin
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'jotunn') {
    // Jotunn-Matic 3000 Arcade Cyber-Terminal
    const s = new PixelSurface(36, 40);
    s.drawBevelRect(6, 6, 24, 32, hexToRgba('#38465c'));
    s.drawRectOutline(6, 6, 24, 32, C.steelHi);
    // Horned top marquee
    s.drawLine(7, 7, 2, 2, C.gold);
    s.drawLine(29, 7, 34, 2, C.gold);
    s.fillRect(9, 8, 18, 4, C.orange);
    // Glowing cyan CRT display
    s.fillRect(9, 14, 18, 12, hexToRgba('#0a2838'));
    s.fillRect(10, 15, 16, 10, pulse ? C.cyan : C.cyanDark);
    s.drawNorseRune(16, 17, 2, C.white);
    // Arcade buttons & joystick
    s.drawBevelRect(8, 28, 20, 7, C.steelDeep);
    s.fillRect(11, 30, 3, 3, C.redHi);
    s.fillRect(16, 30, 3, 3, C.limeHi);
    s.fillRect(21, 30, 3, 3, C.yellow);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'yggdrasil') {
    // Glowing Holographic Yggdrasil World-Tree Shrine
    const s = new PixelSurface(44, 48);
    const cx = 22;
    // Runic stone basin
    s.drawBevelRect(8, 36, 28, 10, C.steelLo);
    s.drawNorseRune(13, 39, 0, C.gold);
    s.drawNorseRune(27, 39, 3, C.gold);
    // Glowing braided trunk
    s.drawBevelRect(cx - 3, 20, 6, 17, C.bronze);
    s.fillRect(cx - 1, 21, 2, 15, C.emerald);
    // Luminous holographic canopy
    s.drawShadedEllipse(cx, 15, 15, 11, C.emeraldLo);
    s.drawShadedEllipse(cx - 7, 13, 8, 7, C.emerald);
    s.drawShadedEllipse(cx + 7, 13, 8, 7, C.emerald);
    s.drawShadedEllipse(cx, 10, 9, 7, pulse ? C.limeHi : C.emerald);
    // Glowing golden skill-node fruits
    s.fillRect(cx - 9, 12, 2, 2, C.goldHi);
    s.fillRect(cx + 7, 11, 2, 2, C.goldHi);
    s.fillRect(cx - 1, 7, 2, 2, C.white);
    s.fillRect(cx - 4, 17, 2, 2, C.cyan);
    s.fillRect(cx + 4, 16, 2, 2, C.cyan);
    s.applyOutline(C.ink);
    return s;
  }
  // training dummy
  const s = new PixelSurface(24, 28);
  const cx = 12;
  s.fillRect(cx - 1, 14, 2, 12, C.wood);
  s.fillRect(cx - 6, 24, 12, 2, C.woodLo);
  s.drawBevelRect(cx - 5, 10, 10, 10, hexToRgba('#c2a16b'));
  // Painted red/white bullseye target
  s.fillEllipse(cx, 15, 3.5, 3.5, C.red);
  s.fillEllipse(cx, 15, 2, 2, C.white);
  s.setPx(cx, 15, C.red);
  // Horned straw head
  s.drawShadedEllipse(cx, 6, 3.5, 3.5, hexToRgba('#d9ba82'));
  s.drawLine(cx - 3, 4, cx - 6, 1, C.steel);
  s.drawLine(cx + 3, 4, cx + 6, 1, C.steel);
  s.applyOutline(C.ink);
  return s;
}

function drawProjectileSprite(
  kind: 'bullet' | 'shell' | 'bolt' | 'energy' | 'rocket' | 'frost' | 'enemy'
): PixelSurface {
  const s = new PixelSurface(16, 10);
  const cy = 5;
  switch (kind) {
    case 'bullet': {
      s.fillRect(2, cy - 1, 8, 2, C.orangeHi);
      s.fillRect(6, cy - 1, 7, 2, C.yellow);
      s.fillRect(10, cy - 1, 4, 2, C.white);
      break;
    }
    case 'shell': {
      s.fillEllipse(9, cy, 3.5, 2.5, C.orange);
      s.fillEllipse(10, cy, 2, 1.5, C.yellow);
      s.setPx(11, cy, C.white);
      break;
    }
    case 'bolt': {
      s.fillRect(2, cy, 11, 1, C.steelHi);
      s.fillRect(1, cy - 2, 3, 5, C.limeHi);
      s.fillRect(12, cy - 1, 3, 3, C.white);
      break;
    }
    case 'energy': {
      s.fillEllipse(8, cy, 5.5, 3.5, C.cyan);
      s.fillEllipse(9, cy, 3.5, 2, C.ice);
      s.fillEllipse(10, cy, 2, 1.2, C.white);
      break;
    }
    case 'rocket': {
      s.fillRect(1, cy - 2, 4, 4, C.orangeHi);
      s.fillRect(5, cy - 2, 7, 4, C.steel);
      s.fillRect(11, cy - 2, 4, 4, C.redHi);
      s.setPx(2, cy, C.white);
      break;
    }
    case 'frost': {
      s.fillRect(3, cy - 1, 10, 2, C.cyan);
      s.fillRect(7, cy - 2, 5, 4, C.ice);
      s.fillRect(12, cy - 1, 3, 2, C.white);
      break;
    }
    case 'enemy': {
      s.fillEllipse(8, cy, 4, 4, C.red);
      s.fillEllipse(8, cy, 2.5, 2.5, C.magenta);
      s.fillEllipse(8, cy, 1.3, 1.3, C.white);
      break;
    }
  }
  s.applyOutline(C.ink);
  return s;
}

function drawHudCrosshair(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const col = C.white;
  s.fillRect(7, 1, 2, 4, col);
  s.fillRect(7, 11, 2, 4, col);
  s.fillRect(1, 7, 4, 2, col);
  s.fillRect(11, 7, 4, 2, col);
  s.fillRect(7, 7, 2, 2, C.cyan);
  s.applyOutline(C.ink);
  return s;
}

function drawHudHeart(full: boolean): PixelSurface {
  const s = new PixelSurface(14, 14);
  const fill = full ? C.red : C.steelDeep;
  s.fillEllipse(5, 5, 3, 3, fill);
  s.fillEllipse(9, 5, 3, 3, fill);
  for (let y = 0; y < 5; y++) {
    s.fillRect(3 + y, 7 + y, 9 - y * 2, 1, fill);
  }
  if (full) {
    s.setPx(4, 4, C.white);
    s.setPx(5, 4, C.redHi);
  }
  s.applyOutline(C.ink);
  return s;
}

function drawDecalSplat(variant: number): PixelSurface {
  const s = new PixelSurface(16, 16);
  const w = C.white; // Tinted at draw time by blood/acid/oil color
  s.fillEllipse(8, 8, 4 + (variant % 2), 3.5 + ((variant + 1) % 2), w);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + variant * 0.7;
    const dist = 4.5 + pixelHash(i, variant, 91) * 3;
    const r = 1 + pixelHash(variant, i, 43) * 1.4;
    s.fillEllipse(8 + Math.cos(a) * dist, 8 + Math.sin(a) * dist, r, r, w);
  }
  return s;
}

function drawScorchDecal(): PixelSurface {
  const s = new PixelSurface(24, 24);
  const cx = 12;
  const cy = 12;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      const jitter = (pixelHash(x, y, 313) - 0.5) * 3;
      if (d + jitter < 10.5) {
        const alpha = Math.max(0, Math.min(220, Math.round((1 - d / 11.5) * 230)));
        s.setPx(x, y, [18, 14, 16, alpha]);
      }
    }
  }
  return s;
}

function drawSoftShadow(): PixelSurface {
  const s = new PixelSurface(24, 14);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 24; x++) {
      const nx = (x - 11.5) / 11;
      const ny = (y - 6.5) / 6;
      const d = Math.hypot(nx, ny);
      if (d <= 1.0) {
        const a = d < 0.72 ? 255 : Math.round((1 - (d - 0.72) / 0.28) * 255);
        s.setPx(x, y, [10, 8, 18, a]);
      }
    }
  }
  return s;
}

function drawGibChunk(variant: number): PixelSurface {
  const s = new PixelSurface(8, 8);
  const col = variant % 2 === 0 ? C.white : C.steelHi;
  s.fillEllipse(4, 4, 2.5, 2 + (variant % 2), col);
  s.applyOutline(C.ink);
  return s;
}

function drawCasing(): PixelSurface {
  const s = new PixelSurface(6, 4);
  s.fillRect(1, 1, 4, 2, C.gold);
  s.setPx(2, 1, C.goldHi);
  s.applyOutline(C.ink);
  return s;
}

// ============================================================================
// ATLAS ASSEMBLY & CACHING
// ============================================================================

let cachedBuiltinPack: BuiltinPackData | null = null;

function buildPackInternal(): BuiltinPackData {
  const packer = new AtlasPacker(1024);
  const sprites: Record<string, SpriteMeta> = {};
  const spriteIdToName: Record<string, string> = {};
  const logicalAliases: Record<string, string> = {};
  let nextId = 1;

  const registerSprite = (
    name: string,
    frames: PixelSurface[],
    originX: number,
    originY: number
  ): void => {
    const id = nextId++;
    const w = frames[0].width;
    const h = frames[0].height;
    const frameMetas: SpriteFrameMeta[] = frames.map((surf) => {
      const placed = packer.pack(surf);
      return {
        page: placed.page,
        srcX: placed.x,
        srcY: placed.y,
        srcW: placed.width,
        srcH: placed.height,
        tgtX: 0,
        tgtY: 0,
        tgtW: placed.width,
        tgtH: placed.height,
        boundW: w,
        boundH: h,
      };
    });
    sprites[name] = {
      id,
      name,
      width: w,
      height: h,
      originX,
      originY,
      bbox: [0, w, h, 0],
      frames: frameMetas,
    };
    spriteIdToName[String(id)] = name;
  };

  // 1. Utility white pixel, shadow, decals, casings, gibs
  const whitePx = new PixelSurface(4, 4);
  whitePx.fillRect(0, 0, 4, 4, C.white);
  registerSprite('fx_white_1x1', [whitePx], 2, 2);
  registerSprite('fx_shadow', [drawSoftShadow()], 12, 7);
  registerSprite(
    'fx_decal_splat',
    [0, 1, 2, 3].map((v) => drawDecalSplat(v)),
    8,
    8
  );
  registerSprite('fx_decal_scorch', [drawScorchDecal()], 12, 12);
  registerSprite('fx_casing', [drawCasing()], 3, 2);
  registerSprite(
    'fx_gib_chunk',
    [0, 1, 2, 3].map((v) => drawGibChunk(v)),
    4,
    4
  );

  // 2. All 8 Outcasts (4 frames each)
  for (const spec of OUTCAST_SPECS) {
    registerSprite(
      spec.key,
      [0, 1, 2, 3].map((f) => drawOutcastFrame(spec, f)),
      12,
      21
    );
    logicalAliases[spec.key] = spec.key;
  }

  // 3. All 6 Two-Phase Major Norse Bosses (12 sprites x 4 frames each)
  const bossKinds: readonly BossKind[] = ['fenrir', 'skadi', 'loki_body', 'hel', 'surtur', 'krunked'];
  for (const b of bossKinds) {
    const p1Frames = [0, 1, 2, 3].map((f) => drawBossFrame(b, false, f));
    const p2Frames = [0, 1, 2, 3].map((f) => drawBossFrame(b, true, f));
    const bw = p1Frames[0].width;
    const bh = p1Frames[0].height;
    const p1Key = `boss_${b}_p1`;
    const p2Key = `boss_${b}_p2`;
    registerSprite(p1Key, p1Frames, Math.floor(bw / 2), bh - 6);
    registerSprite(p2Key, p2Frames, Math.floor(bw / 2), bh - 6);
    logicalAliases[p1Key] = p1Key;
    logicalAliases[p2Key] = p2Key;
  }

  // 4. All 15 Enemy Archetypes (4 frames each)
  const enemyKinds: readonly EnemyVisualKind[] = [
    'enemy_bandit',
    'enemy_wolf',
    'enemy_viking',
    'enemy_robot',
    'enemy_turret',
    'enemy_giant',
    'enemy_spider',
    'enemy_roach',
    'enemy_slime',
    'enemy_rat',
    'enemy_skeleton',
    'enemy_default',
    'enemy_mimic',
    'enemy_bomber',
    'enemy_sniper',
  ];
  for (const ek of enemyKinds) {
    const frames = [0, 1, 2, 3].map((f) => drawEnemyFrame(ek, f));
    const ew = frames[0].width;
    const eh = frames[0].height;
    registerSprite(ek, frames, Math.floor(ew / 2), eh - 3);
    logicalAliases[ek] = ek;
  }

  // 5. Weapons (22 crafted archetypes + golden variants + wep_1000..wep_1300 aliases)
  for (const bp of WEAPON_BLUEPRINTS) {
    registerSprite(bp.key, [drawWeaponSprite(bp, false)], bp.originX, bp.originY);
    registerSprite(`${bp.key}_gold`, [drawWeaponSprite(bp, true)], bp.originX, bp.originY);
    logicalAliases[bp.key] = bp.key;
  }
  for (let uid = 1000; uid <= 1300; uid++) {
    const archKey = WEAPON_ARCHETYPE_KEYS[(uid - 1000) % WEAPON_ARCHETYPE_KEYS.length];
    logicalAliases[`wep_${uid}`] = archKey;
  }

  // 6. Biome Tilesets
  registerSprite(
    'tile_floor',
    [0, 1, 2, 3].map((v) => drawFloorTile(v)),
    0,
    0
  );
  registerSprite('tile_wall', [drawWallTopTile()], 0, 0);
  registerSprite('tile_wall_face', [drawWallFaceTile()], 0, 0);
  registerSprite('tile_wall_broken', [drawWallCrackOverlay(false), drawWallCrackOverlay(true)], 0, 0);
  registerSprite('tile_bedrock', [drawBedrockTile()], 0, 0);
  registerSprite('tile_rubble', [drawRubbleTile()], 0, 0);
  registerSprite('tile_crate', [drawCrateTile()], 0, 0);
  registerSprite(
    'tile_lava',
    [0, 1, 2, 3].map((f) => drawLavaTile(f)),
    0,
    0
  );
  registerSprite(
    'tile_water',
    [0, 1, 2, 3].map((f) => drawWaterTile(f)),
    0,
    0
  );
  for (const tk of [
    'tile_floor',
    'tile_wall',
    'tile_wall_face',
    'tile_wall_broken',
    'tile_bedrock',
    'tile_rubble',
    'tile_crate',
    'tile_lava',
    'tile_water',
  ]) {
    logicalAliases[tk] = tk;
  }

  // 7. FX & Companions
  registerSprite(
    'fx_muzzle_flash',
    [0, 1, 2].map((f) => drawMuzzleFlash(f)),
    2,
    9
  );
  registerSprite(
    'fx_explosion',
    [0, 1, 2, 3, 4].map((f) => drawExplosionFrame(f)),
    16,
    16
  );
  registerSprite(
    'fx_bifrost',
    [0, 1, 2, 3].map((f) => drawBifrostFrame(f)),
    16,
    16
  );
  registerSprite(
    'fx_frost_crystal',
    [0, 1, 2, 3].map((f) => drawFrostCrystalFrame(f)),
    10,
    22
  );
  registerSprite(
    'fx_turret',
    [0, 1].map((f) => drawCompanionSprite('turret', f)),
    9,
    15
  );
  registerSprite(
    'fx_drill',
    [0, 1, 2].map((f) => drawCompanionSprite('drill', f)),
    10,
    7
  );
  registerSprite(
    'fx_seedling',
    [0, 1, 2, 3].map((f) => drawCompanionSprite('seedling', f)),
    8,
    14
  );
  registerSprite(
    'fx_whirlpool',
    [0, 1, 2, 3].map((f) => drawCompanionSprite('whirlpool', f)),
    16,
    16
  );
  registerSprite(
    'fx_doom_ball',
    [0, 1].map((f) => drawCompanionSprite('doom_ball', f)),
    10,
    10
  );
  registerSprite(
    'fx_gun_drone',
    [0, 1].map((f) => drawCompanionSprite('gun_drone', f)),
    8,
    10
  );

  // 8. Pickups & HUD
  registerSprite('hud_crosshair', [drawHudCrosshair()], 8, 8);
  registerSprite('hud_heart', [drawHudHeart(true), drawHudHeart(false)], 7, 7);
  registerSprite('pickup_hp', [drawPickupSprite('hp', 0)], 8, 12);
  registerSprite('pickup_ammo', [drawPickupSprite('ammo', 0)], 8, 12);
  registerSprite('pickup_gold', [drawPickupSprite('gold', 0)], 8, 12);
  registerSprite('pickup_xp', [drawPickupSprite('xp', 0)], 8, 12);
  registerSprite('pickup_weapon', [drawPickupSprite('weapon', 0)], 8, 12);
  registerSprite('pickup_mod', [drawPickupSprite('mod', 0)], 8, 12);
  registerSprite('pickup_chest', [drawPickupSprite('chest', 0), drawPickupSprite('chest', 1)], 8, 13);

  // 9. Hub Landmarks
  registerSprite(
    'hub_loki',
    [0, 1].map((f) => drawHubLandmark('loki', f)),
    16,
    33
  );
  registerSprite(
    'hub_jotunn',
    [0, 1].map((f) => drawHubLandmark('jotunn', f)),
    18,
    37
  );
  registerSprite(
    'hub_yggdrasil',
    [0, 1].map((f) => drawHubLandmark('yggdrasil', f)),
    22,
    45
  );
  registerSprite('hub_dummy', [drawHubLandmark('dummy', 0)], 12, 25);

  // 10. Projectiles
  registerSprite('proj_bullet', [drawProjectileSprite('bullet')], 10, 5);
  registerSprite('proj_shell', [drawProjectileSprite('shell')], 9, 5);
  registerSprite('proj_bolt', [drawProjectileSprite('bolt')], 10, 5);
  registerSprite('proj_energy', [drawProjectileSprite('energy')], 8, 5);
  registerSprite('proj_rocket', [drawProjectileSprite('rocket')], 10, 5);
  registerSprite('proj_frost', [drawProjectileSprite('frost')], 10, 5);
  registerSprite('proj_enemy', [drawProjectileSprite('enemy')], 8, 5);

  for (const k of [
    'fx_muzzle_flash',
    'fx_explosion',
    'fx_bifrost',
    'fx_frost_crystal',
    'fx_turret',
    'fx_drill',
    'fx_seedling',
    'fx_whirlpool',
    'fx_doom_ball',
    'fx_gun_drone',
    'hud_crosshair',
    'hud_heart',
    'pickup_hp',
    'pickup_ammo',
    'pickup_gold',
    'pickup_xp',
    'pickup_weapon',
    'pickup_mod',
    'pickup_chest',
    'hub_loki',
    'hub_jotunn',
    'hub_yggdrasil',
    'hub_dummy',
    'proj_bullet',
    'proj_shell',
    'proj_bolt',
    'proj_energy',
    'proj_rocket',
    'proj_frost',
    'proj_enemy',
  ]) {
    logicalAliases[k] = k;
  }

  // Register logical built-in synth music, ambience & sound keys so Gate A resolves 100% cleanly
  const musicKeys = [
    'music_menu',
    'music_hub',
    'music_worldmap',
    'music_arena',
    'music_canyon',
    'music_ashwastes',
    'music_bladeyard',
    'music_darkcity',
    'music_deadlands',
    'music_garage',
    'music_jotunheim',
    'music_helheim',
    'music_militarybase',
    'music_mosslab',
    'music_mushroomcave',
    'music_muspelheim',
    'music_lavaland',
    'music_forest',
    'music_pineforest',
    'music_safespace',
    'music_saltpan',
    'music_sandcave',
    'music_sandcity',
    'music_secretshop',
    'music_sewer',
    'music_losttemple',
    'music_shrine',
    'music_stonyfield',
    'music_subway',
    'music_cindercity',
    'music_redhall',
    'music_sulfurlake',
    'music_trenches',
    'music_vikingdungeon',
    'music_wildcity',
    'music_snowstorm_heavy',
    'music_snowstorm_light',
    'music_shop',
    'ambience_city',
    'ambience_desert',
    'ambience_hub',
    'ambience_jotunheim',
    'ambience_sewer',
    'music_fenrir_intro',
    'music_fenrir_a',
    'music_fenrir_b',
    'music_fenrir_outro',
    'music_skadi_intro',
    'music_skadi_a',
    'music_skadi_b',
    'music_skadi_outro',
    'music_loki_body_intro',
    'music_loki_body_a',
    'music_loki_body_b',
    'music_loki_body_outro',
    'music_hel_intro',
    'music_hel_a',
    'music_hel_b',
    'music_hel_outro',
    'music_surtur_intro',
    'music_surtur_a',
    'music_surtur_b',
    'music_surtur_outro',
    'music_krunked_intro',
    'music_krunked_a',
    'music_krunked_b',
    'music_krunked_outro',
  ];
  const music: Record<string, string> = {};
  for (const mk of musicKeys) {
    music[mk] = `synth://${mk}`;
    logicalAliases[mk] = mk;
  }

  const sounds: Record<string, { file: string; volume: number; pitch: number }> = {};
  const soundIdToName: Record<string, string> = {};
  for (let uid = 1000; uid <= 1300; uid++) {
    for (const suffix of ['fire', 'equip', 'reload'] as const) {
      const sk = `sfx_wep_${uid}_${suffix}`;
      sounds[sk] = { file: `synth://${sk}`, volume: suffix === 'fire' ? 0.85 : 0.65, pitch: 1.0 };
      logicalAliases[sk] = sk;
    }
  }

  const pages = packer.finalize();
  const manifest: PackManifest = {
    version: 1,
    packType: 'builtin',
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    pageCount: pages.length,
    pages: pages.map((p) => ({
      index: p.index,
      file: `builtin://page_${String(p.index).padStart(3, '0')}`,
      width: p.width,
      height: p.height,
    })),
    sprites,
    spriteIdToName,
    sounds,
    soundIdToName,
    music,
    fonts: {
      krunked_pixel: 'builtin://bitmap_font_5x7',
    },
    logicalAliases,
  };

  return { manifest, pages };
}

/**
 * Builds (and caches) the complete Built-In Krunked pixel-art RGBA pages & PackManifest.
 * Works identically in headless Node and Browser WebGL2.
 */
export function buildBuiltinPackPages(): BuiltinPackData {
  if (!cachedBuiltinPack) {
    cachedBuiltinPack = buildPackInternal();
  }
  return cachedBuiltinPack;
}

/**
 * Returns the Built-In PackManifest without requiring DOM or WebGL (used by Gate A verify:assets).
 */
export function getBuiltinPackManifest(): PackManifest {
  return buildBuiltinPackPages().manifest;
}
