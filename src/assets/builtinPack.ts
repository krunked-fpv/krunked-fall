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
  const jawOpen = frame === 1 || frame === 2 ? 2 : 0;

  if (kind === 'fenrir') {
    // Irradiated Fenrir -> Meltdown Fenrir (Hulking Crouched Cyber-Wolf Silhouette)
    const furDark = phase2 ? hexToRgba('#2b151c') : hexToRgba('#2b3342');
    const furMid = phase2 ? hexToRgba('#54242b') : hexToRgba('#4e5c70');
    const plateHi = phase2 ? hexToRgba('#94433d') : hexToRgba('#8fa4bd');
    const plateLo = phase2 ? hexToRgba('#38181f') : hexToRgba('#343f50');
    const core = phase2 ? (pulse ? C.yellow : C.orangeHi) : pulse ? C.limeHi : C.emerald;
    const coreHot = phase2 ? C.magenta : C.lime;
    const eye = phase2 ? C.white : C.limeHi;

    // Coiled cyber-tail sweeping behind right flank with glowing hazard barb
    s.drawThickLine(cx + 15, cy + 12 + bob, cx + 26, cy + 2 + bob - pulse * 2, 2.2, furMid);
    s.drawThickLine(cx + 26, cy + 2 + bob - pulse * 2, cx + 29, cy - 6 + bob, 1.4, plateHi);
    s.drawGlowOrb(cx + 29, cy - 7 + bob, 2.2, C.white, core, [coreHot[0], coreHot[1], coreHot[2], 120]);

    // Rear muscular wolf haunches crouched low
    s.drawShadedPolygon(
      [
        [cx - 21, cy + 16],
        [cx - 17, cy + 1 + bob],
        [cx + 17, cy + 1 + bob],
        [cx + 22, cy + 16],
        [cx + 16, cy + 23],
        [cx - 16, cy + 23],
      ],
      furDark,
      101
    );

    // Jagged dorsal fur & cyber-spine hackles bristling along arched wolf back
    for (let sp = -3; sp <= 3; sp++) {
      const sx = cx + sp * 5;
      const sh = 7 - Math.abs(sp);
      s.drawShadedPolygon(
        [
          [sx - 3, cy - 3 + bob],
          [sx + (sp < 0 ? -2 : 2), cy - 5 - sh + bob - (pulse && sp % 2 === 0 ? 1 : 0)],
          [sx + 3, cy - 3 + bob],
        ],
        sp % 2 === 0 ? plateHi : furMid,
        120 + sp
      );
      if (Math.abs(sp) <= 2) {
        s.setPx(sx, cy - 5 - Math.floor(sh * 0.5) + bob, core);
      }
    }

    // Massive hunched armored shoulder hull
    s.drawShadedPolygon(
      [
        [cx - 22, cy + 6 + bob],
        [cx - 18, cy - 6 + bob],
        [cx, cy - 10 + bob],
        [cx + 18, cy - 6 + bob],
        [cx + 22, cy + 6 + bob],
        [cx + 15, cy + 18 + bob],
        [cx - 15, cy + 18 + bob],
      ],
      furMid,
      105
    );

    // Exposed glowing cybernetic ribcage cavity (Toxic Emerald P1 / Molten Orange-Magenta P2)
    s.fillEllipse(cx, cy + 8 + bob, 12, 8, C.obsidian);
    s.drawGlowOrb(
      cx,
      cy + 8 + bob,
      6.5 + pulse * 0.8,
      C.white,
      core,
      [coreHot[0], coreHot[1], coreHot[2], 145]
    );
    // Curved metallic armor ribs clasping over glowing nuclear reactor
    for (let r = -2; r <= 2; r++) {
      const rx = cx + r * 4;
      s.drawLine(rx, cy + 1 + bob, rx + (r < 0 ? 1 : r > 0 ? -1 : 0), cy + 14 + bob, plateHi);
      s.drawLine(rx - 1, cy + 2 + bob, rx - 1, cy + 13 + bob, plateLo);
    }
    s.fillRect(cx - 11, cy + 6 + bob, 22, 2, plateHi);

    // Planted heavy cyber-forelegs + spiked pauldrons + razor claws
    const legOff = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    s.drawShadedPolygon(
      [
        [cx - 24, cy + 8 + bob],
        [cx - 14, cy + 8 + bob],
        [cx - 13, cy + 25 + legOff],
        [cx - 23, cy + 25 + legOff],
      ],
      plateLo,
      111
    );
    s.drawShadedPolygon(
      [
        [cx + 14, cy + 8 + bob],
        [cx + 24, cy + 8 + bob],
        [cx + 23, cy + 25 - legOff],
        [cx + 13, cy + 25 - legOff],
      ],
      plateLo,
      112
    );
    // Gleaming gauntlet cuffs & triple wolf claws
    s.drawBevelRect(cx - 24, cy + 18 + legOff, 11, 6, plateHi);
    s.drawBevelRect(cx + 13, cy + 18 - legOff, 11, 6, plateHi);
    for (let c = 0; c < 3; c++) {
      s.fillRect(cx - 23 + c * 4, cy + 24 + legOff, 2, 4, C.steelHi);
      s.setPx(cx - 23 + c * 4, cy + 27 + legOff, C.white);
      s.fillRect(cx + 14 + c * 4, cy + 24 - legOff, 2, 4, C.steelHi);
      s.setPx(cx + 14 + c * 4, cy + 27 - legOff, C.white);
    }

    // Broken iron chain shackles dangling & swaying from both forelegs
    const chainSway = frame === 1 ? -1 : frame === 3 ? 1 : 0;
    for (let ch = 0; ch < 3; ch++) {
      s.drawRectOutline(cx - 29 + ch * 2 + chainSway, cy + 15 + ch * 3, 4, 3, C.steelHi);
      s.drawRectOutline(cx + 25 - ch * 2 - chainSway, cy + 15 + ch * 3, 4, 3, C.steelHi);
    }

    // Sculpted fierce crouched wolf head + pointed swept ears
    s.drawShadedPolygon(
      [
        [cx - 14, cy - 11 + bob],
        [cx - 17, cy - 26 + bob],
        [cx - 7, cy - 17 + bob],
      ],
      furMid,
      114
    );
    s.drawShadedPolygon(
      [
        [cx + 14, cy - 11 + bob],
        [cx + 17, cy - 26 + bob],
        [cx + 7, cy - 17 + bob],
      ],
      furMid,
      115
    );
    s.drawLine(cx - 14, cy - 22 + bob, cx - 10, cy - 15 + bob, coreHot);
    s.drawLine(cx + 14, cy - 22 + bob, cx + 10, cy - 15 + bob, coreHot);

    // Armored cranium & furrowed cyber-brow
    s.drawShadedPolygon(
      [
        [cx - 14, cy - 10 + bob],
        [cx - 11, cy - 19 + bob],
        [cx, cy - 21 + bob],
        [cx + 11, cy - 19 + bob],
        [cx + 14, cy - 10 + bob],
        [cx + 10, cy - 1 + bob],
        [cx - 10, cy - 1 + bob],
      ],
      plateHi,
      116
    );
    s.drawNorseRune(cx - 1, cy - 18 + bob, 1, core);

    // Snapping fanged jaws (animated!) with incandescent inner reactor maw
    s.drawShadedPolygon(
      [
        [cx - 9, cy - 6 + bob],
        [cx + 9, cy - 6 + bob],
        [cx + 7, cy + 2 + bob],
        [cx - 7, cy + 2 + bob],
      ],
      furMid,
      117
    );
    // Glowing gaping mouth cavity
    s.fillRect(cx - 7, cy + bob, 14, 4 + jawOpen, C.obsidian);
    s.fillRect(cx - 5, cy + 1 + bob, 10, 2 + jawOpen, coreHot);
    s.fillRect(cx - 3, cy + 1 + bob, 6, 1 + Math.floor(jawOpen * 0.5), core);
    // Hinged metallic lower jaw
    s.drawBevelRect(cx - 7, cy + 3 + jawOpen + bob, 14, 3, plateLo);
    // Razor fangs upper & lower
    for (let f = -6; f <= 4; f += 3) {
      s.fillRect(cx + f, cy - 1 + bob, 2, 3, C.white);
      s.setPx(cx + f + 1, cy + 2 + jawOpen + bob, C.steelHi);
    }

    // Slanted predator brows + pulsing glowing eyes
    s.drawLine(cx - 11, cy - 13 + bob, cx - 3, cy - 10 + bob, C.ink);
    s.drawLine(cx + 11, cy - 13 + bob, cx + 3, cy - 10 + bob, C.ink);
    s.fillRect(cx - 10, cy - 11 + bob, 6, 3, coreHot);
    s.fillRect(cx + 4, cy - 11 + bob, 6, 3, coreHot);
    s.fillRect(cx - 8, cy - 10 + bob, 3, 1, eye);
    s.fillRect(cx + 5, cy - 10 + bob, 3, 1, eye);

    if (phase2) {
      // Meltdown cracks & crackling magenta-gold overload plasma arcs
      s.drawLine(cx - 18, cy - 2 + bob, cx - 10, cy + 4 + bob, C.orangeHi);
      s.drawLine(cx + 18, cy - 2 + bob, cx + 10, cy + 4 + bob, C.magenta);
      s.drawLine(cx - 25, cy - 15, cx - 17, cy - 8 + pulse * 3, C.yellow);
      s.drawLine(cx + 25, cy - 15, cx + 17, cy - 8 - pulse * 3, C.magenta);
      s.addEmissiveHalo(hexToRgba('#ff4d1a', 115), 1);
    }
  } else if (kind === 'skadi') {
    // Queen Skadi -> Warrior Skadi (Armored Frost-Valkyrie Queen)
    const plate = phase2 ? hexToRgba('#2d4d73') : hexToRgba('#5b82ab');
    const plateDark = phase2 ? hexToRgba('#1b2e4a') : hexToRgba('#355275');
    const capeCol = phase2 ? hexToRgba('#1d3b5e') : hexToRgba('#32638a');
    const iceGlow = phase2 ? (pulse ? C.white : C.cyan) : pulse ? C.white : C.ice;
    const accent = phase2 ? C.redHi : C.cyan;
    const sway = frame === 1 ? -1 : frame === 3 ? 1 : 0;

    // Flowing faceted crystalline frost cape behind armor
    s.drawShadedPolygon(
      [
        [cx - 11, cy - 5 + bob],
        [cx + 11, cy - 5 + bob],
        [cx + 17 + sway, cy + 21],
        [cx + 9 + sway, cy + 18],
        [cx, cy + 24],
        [cx - 9 + sway, cy + 18],
        [cx - 17 + sway, cy + 21],
      ],
      capeCol,
      201
    );
    // Crystalline ice rim highlights along cape edge
    s.drawLine(cx - 17 + sway, cy + 21, cx - 11, cy - 4 + bob, C.cyan);
    s.drawLine(cx + 17 + sway, cy + 21, cx + 11, cy - 4 + bob, C.cyan);

    if (phase2) {
      // Phase 2: Blazing feathered cyan glacial wings sweeping wide!
      for (let w = 0; w < 4; w++) {
        const wy = cy - 10 + w * 5 + bob;
        const reach = 25 - w * 2;
        const lift = -12 + w * 4 + (pulse ? -1 : 1);
        s.drawShadedPolygon(
          [
            [cx - 8, wy],
            [cx - reach, wy + lift],
            [cx - reach + 3, wy + lift + 4],
            [cx - 8, wy + 3],
          ],
          w % 2 === 0 ? iceGlow : C.cyan,
          210 + w
        );
        s.drawShadedPolygon(
          [
            [cx + 8, wy],
            [cx + reach, wy + lift],
            [cx + reach - 3, wy + lift + 4],
            [cx + 8, wy + 3],
          ],
          w % 2 === 0 ? iceGlow : C.cyan,
          220 + w
        );
      }
      // Twin glowing curved glacial scythes!
      s.drawThickLine(cx - 13, cy + 16 + bob, cx - 22, cy - 14 + bob, 1.0, C.steelHi);
      s.drawShadedPolygon(
        [
          [cx - 22, cy - 15 + bob],
          [cx - 9, cy - 21 + bob],
          [cx - 16, cy - 11 + bob],
        ],
        iceGlow,
        225
      );
      s.drawThickLine(cx + 13, cy + 16 + bob, cx + 22, cy - 14 + bob, 1.0, C.steelHi);
      s.drawShadedPolygon(
        [
          [cx + 22, cy - 15 + bob],
          [cx + 9, cy - 21 + bob],
          [cx + 16, cy - 11 + bob],
        ],
        iceGlow,
        226
      );
    } else {
      // Phase 1: Floating hexagonal ice-shard halo + towering Frost Lance
      for (let sh = -1; sh <= 1; sh += 2) {
        const fx = cx + sh * 18;
        const fy = cy - 9 + bob + (pulse ? -1 : 1) * sh;
        s.drawShadedPolygon(
          [
            [fx, fy - 7],
            [fx + 3, fy],
            [fx, fy + 7],
            [fx - 3, fy],
          ],
          iceGlow,
          230 + sh
        );
      }
      // Tall cryo-spear / frost lance on right side
      s.drawThickLine(cx + 17, cy - 16 + bob, cx + 17, cy + 23 + bob, 1.0, C.steelHi);
      s.drawShadedPolygon(
        [
          [cx + 17, cy - 27 + bob],
          [cx + 21, cy - 16 + bob],
          [cx + 17, cy - 12 + bob],
          [cx + 13, cy - 16 + bob],
        ],
        iceGlow,
        235
      );
      s.drawLine(cx + 17, cy - 24 + bob, cx + 17, cy - 14 + bob, C.white);
    }

    // Sculpted Valkyrie armored cuirass, waist clasp & layered battle skirt
    s.drawShadedPolygon(
      [
        [cx - 8, cy + 5 + bob],
        [cx + 8, cy + 5 + bob],
        [cx + 12, cy + 22],
        [cx, cy + 25],
        [cx - 12, cy + 22],
      ],
      plateDark,
      240
    );
    s.drawShadedPolygon(
      [
        [cx - 10, cy - 6 + bob],
        [cx + 10, cy - 6 + bob],
        [cx + 7, cy + 8 + bob],
        [cx - 7, cy + 8 + bob],
      ],
      plate,
      241
    );
    // Fur-trimmed Nordic shoulder mantle + beveled steel pauldrons
    s.fillRect(cx - 13, cy - 7 + bob, 26, 3, C.ice);
    s.drawShadedEllipse(cx - 12, cy - 3 + bob, 4.5, 4, C.steelHi);
    s.drawShadedEllipse(cx + 12, cy - 3 + bob, 4.5, 4, C.steelHi);
    // Glowing frost chest core & Algiz rune
    s.drawGlowOrb(cx, cy + 1 + bob, 3, C.white, accent);
    s.drawNorseRune(cx - 1, cy + 10 + bob, 0, iceGlow);

    // Valkyrie head + sculpted horned glacial ice-crown
    s.drawShadedEllipse(cx, cy - 13 + bob, 6.5, 6.5, C.steelHi);
    // Horned ice-crown spires
    s.drawShadedPolygon(
      [
        [cx - 7, cy - 16 + bob],
        [cx - 12, cy - 26 + bob],
        [cx - 4, cy - 19 + bob],
      ],
      iceGlow,
      245
    );
    s.drawShadedPolygon(
      [
        [cx + 7, cy - 16 + bob],
        [cx + 12, cy - 26 + bob],
        [cx + 4, cy - 19 + bob],
      ],
      iceGlow,
      246
    );
    s.drawShadedPolygon(
      [
        [cx - 2, cy - 18 + bob],
        [cx, cy - 27 + bob],
        [cx + 2, cy - 18 + bob],
      ],
      C.white,
      247
    );
    // Dark faceplate + piercing Valkyrie visor
    s.fillRect(cx - 5, cy - 15 + bob, 10, 4, C.obsidian);
    s.fillRect(cx - 4, cy - 14 + bob, 8, 2, accent);
    s.fillRect(cx - 2, cy - 14 + bob, 4, 1, C.white);
    if (phase2) {
      s.addEmissiveHalo(hexToRgba('#2ee6ff', 100), 1);
    }
  } else if (kind === 'loki_body') {
    // Loki's Body -> Loki's Body in Overdrive (Horned Biomechanical God-Chassis + Serpent Coils)
    const hull = phase2 ? hexToRgba('#26183b') : hexToRgba('#184537');
    const hullDark = phase2 ? hexToRgba('#170d26') : hexToRgba('#0e2922');
    const trim = phase2 ? C.magenta : C.gold;
    const glow = phase2 ? (pulse ? C.magenta : C.cyan) : pulse ? C.limeHi : C.emerald;
    const serpentCol = phase2 ? C.purpleHi : C.emerald;

    // Armored greaves with gilded knee guards
    s.drawShadedPolygon(
      [
        [cx - 10, cy + 10],
        [cx - 3, cy + 10],
        [cx - 4, cy + 25],
        [cx - 11, cy + 25],
      ],
      hullDark,
      301
    );
    s.drawShadedPolygon(
      [
        [cx + 3, cy + 10],
        [cx + 10, cy + 10],
        [cx + 11, cy + 25],
        [cx + 4, cy + 25],
      ],
      hullDark,
      302
    );
    s.fillRect(cx - 9, cy + 16, 4, 3, trim);
    s.fillRect(cx + 5, cy + 16, 4, 3, trim);

    // Sculpted biomechanical V-tapered god-torso
    s.drawShadedPolygon(
      [
        [cx - 14, cy - 8 + bob],
        [cx + 14, cy - 8 + bob],
        [cx + 9, cy + 12 + bob],
        [cx - 9, cy + 12 + bob],
      ],
      hull,
      305
    );
    // Gilded V-chevron armor piping
    s.drawLine(cx - 12, cy - 7 + bob, cx, cy + 9 + bob, trim);
    s.drawLine(cx + 12, cy - 7 + bob, cx, cy + 9 + bob, trim);

    // Undulating neon-emerald cyber-serpent coils wrapping both shoulders & arms!
    for (let side = -1; side <= 1; side += 2) {
      const sx = cx + side * 14;
      s.drawThickLine(cx + side * 9, cy - 6 + bob, sx + side * 4, cy - 1 + bob, 2.5, serpentCol);
      s.drawThickLine(sx + side * 4, cy - 1 + bob, sx, cy + 6 + bob, 2.2, shadeColor(serpentCol, 0.72));
      s.drawThickLine(sx, cy + 6 + bob, sx + side * 5, cy + 10 + bob, 1.8, serpentCol);
      // Glowing serpent scale dots & fanged head crest
      s.setPx(sx + side * 4, cy - 1 + bob, C.white);
      s.setPx(sx + side * 2, cy + 4 + bob, glow);
      // Sweeping curved plasma serpent-blades from wrists!
      const bladeReach = phase2 ? 25 : 22;
      s.drawShadedPolygon(
        [
          [sx + side * 3, cy + 8 + bob],
          [cx + side * bladeReach, cy - 9 + bob + (pulse ? -2 : 1)],
          [cx + side * (bladeReach - 3), cy - 3 + bob],
          [sx + side * 1, cy + 11 + bob],
        ],
        glow,
        310 + side
      );
      s.drawLine(sx + side * 3, cy + 9 + bob, cx + side * (bladeReach - 1), cy - 8 + bob, C.white);
    }

    // Chest reactor prism (cracked lightning core in Phase 2)
    s.fillEllipse(cx, cy + 1 + bob, 6.5, 6.5, C.obsidian);
    s.drawGlowOrb(cx, cy + 1 + bob, 5, C.white, glow, [glow[0], glow[1], glow[2], 130]);
    s.drawNorseRune(cx - 1, cy - 2 + bob, 4, C.obsidian);

    // Iconic HEADLESS Gilded Neck Collar + Holographic Horned Glitch-Head!
    s.drawBevelRect(cx - 6, cy - 12 + bob, 12, 4, C.gold);
    s.fillRect(cx - 4, cy - 12 + bob, 8, 1, C.white);
    const gx = phase2 ? (frame === 1 ? -2 : frame === 3 ? 2 : 0) : 0;
    // Projected holo-head & sweeping Loki curved horns
    s.fillPolygon(
      [
        [cx - 5 + gx, cy - 19 + bob],
        [cx + 5 + gx, cy - 19 + bob],
        [cx + 4 + gx, cy - 13 + bob],
        [cx - 4 + gx, cy - 13 + bob],
      ],
      [glow[0], glow[1], glow[2], 195],
      true
    );
    s.drawThickLine(cx - 4 + gx, cy - 18 + bob, cx - 12 + gx, cy - 25 + bob, 1.3, glow);
    s.drawThickLine(cx + 4 + gx, cy - 18 + bob, cx + 12 + gx, cy - 25 + bob, 1.3, glow);
    s.drawLine(cx - 12 + gx, cy - 25 + bob, cx - 10 + gx, cy - 27 + bob, C.white);
    s.drawLine(cx + 12 + gx, cy - 25 + bob, cx + 10 + gx, cy - 27 + bob, C.white);
    s.fillRect(cx - 3 + gx, cy - 17 + bob, 2, 2, C.white);
    s.fillRect(cx + 1 + gx, cy - 17 + bob, 2, 2, C.white);

    if (phase2) {
      // Overdrive sparking lightning conduits & glitch fragments
      s.drawLine(cx - 10, cy - 4 + bob, cx - 2, cy + 3 + bob, C.white);
      s.drawLine(cx + 10, cy - 3 + bob, cx + 2, cy + 4 + bob, C.cyan);
      s.fillRect(cx - 16, cy - 18 + pulse * 3, 5, 2, C.magenta);
      s.fillRect(cx + 12, cy - 21 - pulse * 3, 5, 2, C.cyan);
      s.addEmissiveHalo(hexToRgba('#ff2ea6', 110), 1);
    }
  } else if (kind === 'hel') {
    // Hel -> Hel Scorned (Towering Half-Armored, Half-Spectral Underworld Monarch)
    const cloak = phase2 ? hexToRgba('#4a102c') : hexToRgba('#2f194a');
    const cloakDark = phase2 ? hexToRgba('#290818') : hexToRgba('#1b0e2e');
    const soul = phase2 ? (pulse ? C.redHi : C.magenta) : pulse ? C.cyan : C.purpleHi;
    const soulHot = phase2 ? C.orangeHi : C.cyan;
    const sway = frame === 1 ? -1 : frame === 3 ? 1 : 0;

    if (phase2) {
      // Phase 2 Hel Scorned: Blazing crimson-violet spectral rib-wings!
      for (let w = 0; w < 3; w++) {
        const wy = cy - 8 + w * 6 + bob;
        s.drawThickLine(cx - 8, wy, cx - 23, wy - 9 + w * 3 + pulse, 1.6, C.magenta);
        s.drawLine(cx - 10, wy, cx - 22, wy - 8 + w * 3 + pulse, C.redHi);
        s.drawThickLine(cx + 8, wy, cx + 23, wy - 9 + w * 3 + pulse, 1.6, C.magenta);
        s.drawLine(cx + 10, wy, cx + 22, wy - 8 + w * 3 + pulse, C.redHi);
      }
    }

    // Torn billowing void mantle with jagged tattered hem wisps
    s.drawShadedPolygon(
      [
        [cx - 12, cy - 6 + bob],
        [cx + 12, cy - 6 + bob],
        [cx + 16 + sway, cy + 20],
        [cx + 11, cy + 26],
        [cx + 6 + sway, cy + 19],
        [cx, cy + 26],
        [cx - 6 + sway, cy + 19],
        [cx - 11, cy + 26],
        [cx - 16 + sway, cy + 20],
      ],
      cloak,
      401
    );
    s.fillPolygon(
      [
        [cx - 8, cy + 5 + bob],
        [cx + 8, cy + 5 + bob],
        [cx + 6, cy + 22],
        [cx - 6, cy + 22],
      ],
      cloakDark
    );

    // Split torso: Left armored obsidian cuirass | Right exposed bone ribcage
    s.drawShadedPolygon(
      [
        [cx - 10, cy - 6 + bob],
        [cx, cy - 6 + bob],
        [cx, cy + 10 + bob],
        [cx - 8, cy + 10 + bob],
      ],
      C.obsidianHi,
      405
    );
    s.fillRect(cx, cy - 5 + bob, 9, 15, C.obsidian);
    for (let r = 0; r < 4; r++) {
      s.fillRect(cx + 1, cy - 4 + r * 3 + bob, 7 - (r === 3 ? 2 : 0), 2, C.bone);
    }
    // Central necrotic spine conduit
    s.drawGlowOrb(cx, cy + 2 + bob, 3.2, C.white, soul, [soul[0], soul[1], soul[2], 125]);

    // Dual-faced head: Left pale cyber-valkyrie visage | Right iron-bone skull!
    s.drawShadedEllipse(cx, cy - 13 + bob, 7.5, 7.5, C.bone);
    // Left living cyber-valkyrie mask half
    s.fillPolygon(
      [
        [cx - 8, cy - 19 + bob],
        [cx, cy - 20 + bob],
        [cx, cy - 6 + bob],
        [cx - 7, cy - 8 + bob],
      ],
      phase2 ? hexToRgba('#7a4263') : hexToRgba('#8ec9d4')
    );
    // Skull teeth on right jaw
    for (let t = 1; t <= 5; t += 2) {
      s.setPx(cx + t, cy - 8 + bob, C.obsidian);
    }
    // Jagged Bone & Soulfire Crown
    s.fillRect(cx - 8, cy - 20 + bob, 16, 3, C.obsidian);
    s.drawShadedPolygon([[cx - 8, cy - 19 + bob], [cx - 10, cy - 27 + bob], [cx - 4, cy - 20 + bob]], C.bone, 411);
    s.drawShadedPolygon([[cx - 2, cy - 20 + bob], [cx, cy - 28 + bob], [cx + 2, cy - 20 + bob]], soul, 412);
    s.drawShadedPolygon([[cx + 4, cy - 20 + bob], [cx + 10, cy - 27 + bob], [cx + 8, cy - 19 + bob]], C.bone, 413);
    // Asymmetric piercing eyes
    s.fillRect(cx - 5, cy - 14 + bob, 3, 2, soulHot);
    s.fillRect(cx + 2, cy - 15 + bob, 4, 3, soul);
    s.setPx(cx + 3, cy - 14 + bob, C.white);

    // Floating necrotic energy sigils + Twin clawed spectral hands!
    const handY = cy + 2 + (frame === 1 ? -3 : frame === 3 ? 3 : 0);
    for (let side = -1; side <= 1; side += 2) {
      const hx = cx + side * 21;
      s.drawShadedPolygon(
        [
          [hx - 4, handY - 5],
          [hx + 4, handY - 5],
          [hx + 5, handY + 3],
          [hx - 5, handY + 3],
        ],
        C.boneLo,
        420 + side
      );
      // Skeletal clawed fingers
      for (let f = -3; f <= 3; f += 3) {
        s.fillRect(hx + f, handY + 3, 2, 4, C.bone);
      }
      s.drawGlowOrb(hx, handY - 1, 2.5, C.white, soul);
      // Floating rune sigil above each hand
      s.drawNorseRune(hx - 1, handY - 15 + (pulse ? -1 : 1), side < 0 ? 3 : 5, soul);
    }
    if (phase2) {
      s.addEmissiveHalo(hexToRgba('#ff2266', 110), 1);
    }
  } else if (kind === 'surtur') {
    // Surtur -> Hate Incarnate (Colossal Horned Obsidian-and-Magma Giant + Flaming Greatsword)
    const rock = phase2 ? hexToRgba('#291014') : hexToRgba('#2c2530');
    const rockHi = phase2 ? hexToRgba('#571f20') : hexToRgba('#4c4152');
    const magma = phase2 ? (pulse ? C.white : C.goldHi) : pulse ? C.yellow : C.orangeHi;
    const fire = phase2 ? C.orangeHi : C.red;

    if (phase2) {
      // Hate Incarnate: Colossal blazing inferno magma wings!
      for (let w = 0; w < 4; w++) {
        const wy = cy - 9 + w * 5 + bob;
        s.drawShadedPolygon(
          [
            [cx - 12, wy],
            [cx - 30, wy - 12 + w * 4 + pulse * 2],
            [cx - 27, wy - 6 + w * 4],
            [cx - 12, wy + 4],
          ],
          w % 2 === 0 ? fire : magma,
          501 + w
        );
        s.drawShadedPolygon(
          [
            [cx + 12, wy],
            [cx + 30, wy - 12 + w * 4 + pulse * 2],
            [cx + 27, wy - 6 + w * 4],
            [cx + 12, wy + 4],
          ],
          w % 2 === 0 ? fire : magma,
          510 + w
        );
      }
    }

    // Colossal planted obsidian legs
    s.drawShadedPolygon([[cx - 15, cy + 12], [cx - 4, cy + 12], [cx - 5, cy + 28], [cx - 16, cy + 28]], rock, 515);
    s.drawShadedPolygon([[cx + 4, cy + 12], [cx + 15, cy + 12], [cx + 16, cy + 28], [cx + 5, cy + 28]], rock, 516);
    s.drawLine(cx - 10, cy + 14, cx - 10, cy + 26, fire);
    s.drawLine(cx + 10, cy + 14, cx + 10, cy + 26, fire);

    // Towering hunched obsidian torso split by glowing molten lava cracks
    s.drawShadedPolygon(
      [
        [cx - 21, cy - 6 + bob],
        [cx - 12, cy - 14 + bob],
        [cx + 12, cy - 14 + bob],
        [cx + 21, cy - 6 + bob],
        [cx + 15, cy + 15 + bob],
        [cx - 15, cy + 15 + bob],
      ],
      rock,
      520
    );
    // Craggy boulder pauldrons glowing with magma vents
    s.drawShadedPolygon(
      [[cx - 26, cy - 4 + bob], [cx - 21, cy - 13 + bob], [cx - 12, cy - 10 + bob], [cx - 14, cy + 3 + bob], [cx - 24, cy + 4 + bob]],
      rockHi,
      521
    );
    s.drawShadedPolygon(
      [[cx + 26, cy - 4 + bob], [cx + 21, cy - 13 + bob], [cx + 12, cy - 10 + bob], [cx + 14, cy + 3 + bob], [cx + 24, cy + 4 + bob]],
      rockHi,
      522
    );
    s.drawGlowOrb(cx - 19, cy - 5 + bob, 2.6, C.white, magma, [fire[0], fire[1], fire[2], 140]);
    s.drawGlowOrb(cx + 19, cy - 5 + bob, 2.6, C.white, magma, [fire[0], fire[1], fire[2], 140]);

    // Blazing volcanic furnace chest fissures + incandescent core
    s.drawLine(cx - 13, cy - 9 + bob, cx, cy + 2 + bob, fire);
    s.drawLine(cx - 12, cy - 9 + bob, cx, cy + 1 + bob, magma);
    s.drawLine(cx + 13, cy - 9 + bob, cx, cy + 2 + bob, fire);
    s.drawLine(cx + 12, cy - 9 + bob, cx, cy + 1 + bob, magma);
    s.drawLine(cx, cy + 2 + bob, cx, cy + 14 + bob, fire);
    s.drawGlowOrb(
      cx,
      cy + 1 + bob,
      phase2 ? 7 : 5.5,
      C.white,
      magma,
      [fire[0], fire[1], fire[2], 160]
    );

    // Towering Flaming Magma Greatsword held upright on right flank!
    s.drawBevelRect(cx + 20, cy + 6 + bob, 9, 3, rockHi); // crossguard
    s.fillRect(cx + 23, cy + 9 + bob, 3, 12, C.obsidian); // pommel grip
    s.drawShadedPolygon(
      [
        [cx + 22, cy + 6 + bob],
        [cx + 27, cy + 6 + bob],
        [cx + 27, cy - 22 + bob],
        [cx + 24, cy - 30 + bob - pulse],
        [cx + 22, cy - 22 + bob],
      ],
      fire,
      528
    );
    s.fillRect(cx + 24, cy - 24 + bob, 2, 28, magma);
    s.setPx(cx + 24, cy - 27 + bob - pulse, C.white);

    // Horned obsidian head + jagged burning rune crown + sweeping curved giant horns
    s.drawShadedEllipse(cx, cy - 16 + bob, 8.5, 7.5, rockHi);
    // Sweeping giant basalt horns
    s.drawThickLine(cx - 7, cy - 19 + bob, cx - 15, cy - 25 + bob, 2.0, rock);
    s.drawThickLine(cx - 15, cy - 25 + bob, cx - 17, cy - 30 + bob, 1.3, fire);
    s.drawLine(cx - 15, cy - 25 + bob, cx - 17, cy - 30 + bob, magma);
    s.drawThickLine(cx + 7, cy - 19 + bob, cx + 15, cy - 25 + bob, 2.0, rock);
    s.drawThickLine(cx + 15, cy - 25 + bob, cx + 17, cy - 30 + bob, 1.3, fire);
    s.drawLine(cx + 15, cy - 25 + bob, cx + 17, cy - 30 + bob, magma);
    // Jagged fire crown spikes
    s.fillRect(cx - 4, cy - 26 + bob, 2, 5, magma);
    s.fillRect(cx - 1, cy - 28 + bob - pulse, 2, 7, C.white);
    s.fillRect(cx + 2, cy - 26 + bob, 2, 5, magma);
    // Furnace eyes & roaring molten maw
    s.fillRect(cx - 6, cy - 17 + bob, 4, 2, magma);
    s.fillRect(cx + 2, cy - 17 + bob, 4, 2, magma);
    s.setPx(cx - 4, cy - 17 + bob, C.white);
    s.setPx(cx + 4, cy - 17 + bob, C.white);
    s.fillRect(cx - 5, cy - 12 + bob, 10, 3 + (pulse ? 1 : 0), fire);
    s.fillRect(cx - 3, cy - 11 + bob, 6, 2, magma);
    if (phase2) {
      s.addEmissiveHalo(hexToRgba('#ffaa22', 120), 1);
    }
  } else {
    // KRUNKED -> CORRUPTED KRUNKED (Iconic Cyber-Allfather Sovereign, Gungnir & Cyber-Ravens)
    const plate = phase2 ? hexToRgba('#2b1730') : hexToRgba('#354459');
    const plateDark = phase2 ? hexToRgba('#190d1f') : hexToRgba('#1f2836');
    const gold = phase2 ? hexToRgba('#d97a2b') : C.gold;
    const cloak = phase2 ? hexToRgba('#540e34') : hexToRgba('#6b1627');
    const eyeGlow = phase2 ? (pulse ? C.white : C.magenta) : pulse ? C.white : C.cyan;
    const lanceGlow = phase2 ? C.magenta : C.cyan;
    const sway = frame === 1 ? -1 : frame === 3 ? 1 : 0;

    if (phase2) {
      // Corrupted Krunked: Blazing Magenta & Cyan Plasma Energy Wings + Floating Glitch-Halo!
      for (let w = 0; w < 4; w++) {
        const wy = cy - 10 + w * 6 + bob;
        const wingC = w % 2 === 0 ? C.magenta : C.cyan;
        s.drawShadedPolygon(
          [
            [cx - 12, wy],
            [cx - 31, wy - 12 + w * 4 + (pulse ? -1 : 1)],
            [cx - 28, wy - 6 + w * 4],
            [cx - 12, wy + 3],
          ],
          wingC,
          601 + w
        );
        s.drawShadedPolygon(
          [
            [cx + 12, wy],
            [cx + 31, wy - 12 + w * 4 - (pulse ? -1 : 1)],
            [cx + 28, wy - 6 + w * 4],
            [cx + 12, wy + 3],
          ],
          wingC,
          610 + w
        );
      }
      // Cracked floating glitch-halo arcs behind war-helm
      s.drawLine(cx - 14, cy - 26 + bob, cx - 6, cy - 30 + bob, C.magenta);
      s.drawLine(cx + 6, cy - 30 + bob, cx + 14, cy - 26 + bob, C.cyan);
      s.fillRect(cx - 18, cy - 24 + pulse * 2, 4, 2, C.cyan);
      s.fillRect(cx + 14, cy - 24 - pulse * 2, 4, 2, C.magenta);
    }

    // Flowing crimson-and-gold runic royal cloak billowing behind sovereign
    s.drawShadedPolygon(
      [
        [cx - 16, cy - 8 + bob],
        [cx + 16, cy - 8 + bob],
        [cx + 22 + sway, cy + 24],
        [cx + 12, cy + 28],
        [cx, cy + 24],
        [cx - 12, cy + 28],
        [cx - 22 + sway, cy + 24],
      ],
      cloak,
      620
    );
    s.drawLine(cx - 21 + sway, cy + 23, cx - 15, cy - 7 + bob, gold);
    s.drawLine(cx + 21 + sway, cy + 23, cx + 15, cy - 7 + bob, gold);
    s.drawNorseRune(cx - 16, cy + 13 + bob, 2, gold);
    s.drawNorseRune(cx + 13, cy + 13 + bob, 2, gold);

    // Armored sovereign legs + gilded greaves
    s.drawShadedPolygon([[cx - 11, cy + 14], [cx - 3, cy + 14], [cx - 4, cy + 28], [cx - 12, cy + 28]], plateDark, 622);
    s.drawShadedPolygon([[cx + 3, cy + 14], [cx + 11, cy + 14], [cx + 12, cy + 28], [cx + 4, cy + 28]], plateDark, 623);
    s.fillRect(cx - 10, cy + 20, 5, 2, gold);
    s.fillRect(cx + 5, cy + 20, 5, 2, gold);

    // Sculpted sovereign chest armor & ornate gilded pauldrons
    s.drawShadedPolygon(
      [
        [cx - 15, cy - 8 + bob],
        [cx + 15, cy - 8 + bob],
        [cx + 12, cy + 15 + bob],
        [cx, cy + 19 + bob],
        [cx - 12, cy + 15 + bob],
      ],
      plate,
      625
    );
    s.drawShadedEllipse(cx - 16, cy - 5 + bob, 5.5, 5, gold);
    s.drawShadedEllipse(cx + 16, cy - 5 + bob, 5.5, 5, gold);
    // Gilded chestplate ribs & blazing Bifrost / corrupted reactor core
    s.drawBevelRect(cx - 9, cy - 5 + bob, 18, 12, gold);
    s.fillEllipse(cx, cy + 1 + bob, 6, 5.5, C.obsidian);
    s.drawGlowOrb(
      cx,
      cy + 1 + bob,
      phase2 ? 5.2 : 4.2,
      C.white,
      eyeGlow,
      [lanceGlow[0], lanceGlow[1], lanceGlow[2], 145]
    );

    // Twin Hovering Cyber-Ravens flanking shoulders with animated flapping wings!
    const wingFlap = frame === 1 ? -3 : frame === 3 ? 2 : 0;
    for (let side = -1; side <= 1; side += 2) {
      const rx = cx + side * 23;
      const ry = cy - 15 + bob + (side < 0 ? wingFlap * 0.4 : -wingFlap * 0.4);
      // Outstretched cyber-raven wing
      s.drawShadedPolygon(
        [
          [rx, ry],
          [rx + side * 7, ry - 6 + wingFlap],
          [rx + side * 5, ry + 1 + wingFlap],
        ],
        C.obsidianHi,
        630 + side
      );
      s.drawShadedEllipse(rx, ry, 3.5, 3, C.steelDeep);
      // Metallic beak pointing inward & glowing optic eye
      s.drawLine(rx - side * 3, ry, rx - side * 6, ry + 1, gold);
      s.setPx(rx - side * 1, ry - 1, lanceGlow);
    }

    // Towering Neon Gungnir Plasma Lance on right side!
    s.fillRect(cx + 21, cy - 24 + bob, 3, 52, C.steelHi);
    s.fillRect(cx + 22, cy - 22 + bob, 1, 48, lanceGlow);
    s.fillRect(cx + 19, cy - 21 + bob, 7, 2, gold);
    s.drawShadedPolygon(
      [
        [cx + 22, cy - 32 + bob],
        [cx + 27, cy - 22 + bob],
        [cx + 22, cy - 19 + bob],
        [cx + 18, cy - 22 + bob],
      ],
      eyeGlow,
      635
    );
    s.drawLine(cx + 22, cy - 30 + bob, cx + 22, cy - 21 + bob, C.white);

    // Iconic Winged Horned War-Helm & SINGLE BLAZING ALL-SEEING CYBER EYE
    s.drawShadedPolygon(
      [
        [cx - 9, cy - 12 + bob],
        [cx - 10, cy - 21 + bob],
        [cx, cy - 25 + bob],
        [cx + 10, cy - 21 + bob],
        [cx + 9, cy - 12 + bob],
        [cx, cy - 9 + bob],
      ],
      plate,
      640
    );
    // Sweeping gilded helm wings & curved war-horns
    s.drawShadedPolygon(
      [[cx - 9, cy - 18 + bob], [cx - 18, cy - 28 + bob], [cx - 12, cy - 26 + bob], [cx - 7, cy - 20 + bob]],
      gold,
      641
    );
    s.drawShadedPolygon(
      [[cx + 9, cy - 18 + bob], [cx + 18, cy - 28 + bob], [cx + 12, cy - 26 + bob], [cx + 7, cy - 20 + bob]],
      gold,
      642
    );
    s.fillRect(cx - 8, cy - 22 + bob, 16, 3, C.goldHi);
    // Shadowed faceplate + riveted cyber-eyepatch (left) + SINGLE BLAZING EYE (right)
    s.fillRect(cx - 7, cy - 19 + bob, 14, 7, C.obsidian);
    s.drawBevelRect(cx - 6, cy - 17 + bob, 5, 4, C.steelLo);
    s.drawLine(cx - 6, cy - 18 + bob, cx - 1, cy - 13 + bob, C.steelHi);
    s.drawGlowOrb(cx + 3, cy - 15 + bob, 2.6, C.white, eyeGlow, [lanceGlow[0], lanceGlow[1], lanceGlow[2], 140]);

    if (phase2) {
      // Exposed corruption cracks across chest & cloak
      s.drawLine(cx - 11, cy - 5 + bob, cx - 2, cy + 7 + bob, C.magenta);
      s.drawLine(cx + 11, cy - 3 + bob, cx + 3, cy + 9 + bob, C.cyan);
      s.addEmissiveHalo(hexToRgba('#ff1e88', 115), 1);
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
  // Crisp readable neutral Norse masonry midtones so biome tinting stays vivid
  const baseA: RGBA = [224, 226, 234, 255];
  const baseB: RGBA = [212, 214, 224, 255];
  const hi: RGBA = [244, 246, 252, 255];
  const lo: RGBA = [184, 186, 198, 255];
  const mortar: RGBA = [148, 150, 164, 255];

  s.fillRect(0, 0, 16, 16, variant % 2 === 0 ? baseA : baseB);
  // Multi-stone flagstone layout per variant for natural masonry variety
  const splitTop = variant === 0 ? 9 : variant === 1 ? 6 : variant === 2 ? 11 : 7;
  const splitBot = variant === 0 ? 4 : variant === 1 ? 11 : variant === 2 ? 5 : 12;

  // Alternate slight stone shade per slab
  s.fillRect(0, 0, splitTop, 8, baseA);
  s.fillRect(splitTop, 0, 16 - splitTop, 8, baseB);
  s.fillRect(0, 8, splitBot, 8, baseB);
  s.fillRect(splitBot, 8, 16 - splitBot, 8, baseA);

  // Fine mineral grain & micro-pebbles
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const h = pixelHash(x, y, 701 + variant * 37);
      if (h > 0.87) s.setPx(x, y, hi);
      else if (h < 0.12) s.setPx(x, y, lo);
    }
  }

  // Flagstone mortar seams & soft inner shadow
  s.fillRect(0, 0, 16, 1, mortar);
  s.fillRect(0, 8, 16, 1, mortar);
  s.fillRect(splitTop, 0, 1, 8, mortar);
  s.fillRect(splitBot, 8, 1, 8, mortar);

  // Subtle top-left bevel catchlights along each stone block
  s.fillRect(1, 1, Math.max(1, splitTop - 2), 1, hi);
  s.fillRect(splitTop + 1, 1, Math.max(1, 14 - splitTop), 1, hi);
  s.fillRect(1, 9, Math.max(1, splitBot - 2), 1, hi);
  s.fillRect(splitBot + 1, 9, Math.max(1, 14 - splitBot), 1, hi);

  if (variant === 2) {
    // Faint worn Elder Futhark Norse rune etched into stone
    s.drawNorseRune(4, 2, 3, [162, 166, 182, 255]);
  } else if (variant === 3) {
    // Hairline weathered fracture across corner slab
    s.drawLine(3, 3, 6, 6, mortar);
    s.drawLine(6, 6, 9, 5, mortar);
    s.setPx(4, 3, hi);
  }
  return s;
}

function drawWallTopTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const base: RGBA = [224, 228, 240, 255];
  const inner: RGBA = [202, 206, 220, 255];
  const hi: RGBA = [252, 253, 255, 255];
  const lo: RGBA = [132, 136, 154, 255];
  const deep: RGBA = [92, 96, 114, 255];

  s.fillRect(0, 0, 16, 16, base);
  // Crisp razor-sharp bright top & left highlight bevel so walls pop immediately
  s.fillRect(0, 0, 16, 2, hi);
  s.fillRect(0, 0, 2, 16, hi);
  // Deep bottom & right shadow lip framing the cap
  s.fillRect(0, 14, 16, 2, deep);
  s.fillRect(14, 2, 2, 14, lo);

  // Recessed armored Norse masonry center panel
  s.drawRectOutline(2, 2, 12, 12, lo);
  s.fillRect(3, 3, 10, 10, inner);
  s.fillRect(3, 3, 10, 1, hi);
  s.fillRect(3, 12, 10, 1, deep);
  // Riveted iron corner studs
  s.setPx(2, 2, deep);
  s.setPx(13, 2, deep);
  s.setPx(2, 13, deep);
  s.setPx(13, 13, deep);
  s.setPx(3, 2, hi);
  s.setPx(12, 2, hi);
  // Subtle carved Norse rune medallion
  s.drawNorseRune(6, 5, 0, [160, 166, 184, 255]);
  return s;
}

function drawWallFaceTile(): PixelSurface {
  const s = new PixelSurface(16, 16);
  const brickA: RGBA = [194, 198, 212, 255];
  const brickB: RGBA = [176, 180, 196, 255];
  const hi: RGBA = [238, 242, 252, 255];
  const mortar: RGBA = [80, 84, 100, 255];
  const baseShadow: RGBA = [54, 56, 70, 255];

  // Staggered chiseled masonry courses
  s.fillRect(0, 0, 16, 16, brickA);
  s.fillRect(0, 2, 8, 4, brickA);
  s.fillRect(8, 2, 8, 4, brickB);
  s.fillRect(0, 6, 4, 5, brickB);
  s.fillRect(4, 6, 8, 5, brickA);
  s.fillRect(12, 6, 4, 5, brickB);
  s.fillRect(0, 11, 9, 4, brickA);
  s.fillRect(9, 11, 7, 4, brickB);

  // Strong bright bevel under wall cap lip + brick top catchlights
  s.fillRect(0, 0, 16, 2, hi);
  s.fillRect(1, 2, 6, 1, [218, 222, 234, 255]);
  s.fillRect(5, 7, 6, 1, [216, 220, 232, 255]);
  s.fillRect(1, 12, 7, 1, [206, 210, 224, 255]);

  // Deep brick mortar grooves
  s.fillRect(0, 5, 16, 1, mortar);
  s.fillRect(0, 10, 16, 1, mortar);
  s.fillRect(7, 2, 1, 4, mortar);
  s.fillRect(3, 6, 1, 5, mortar);
  s.fillRect(12, 6, 1, 5, mortar);
  s.fillRect(8, 11, 1, 4, mortar);

  // Ground contact darkening along base edge
  s.fillRect(0, 14, 16, 1, mortar);
  s.fillRect(0, 15, 16, 1, baseShadow);
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

type HubLandmarkKind =
  | 'loki'
  | 'jotunn'
  | 'yggdrasil'
  | 'modifiers'
  | 'weapondex'
  | 'enemydex'
  | 'challenges'
  | 'dummy';

function drawHubLandmark(kind: HubLandmarkKind, frame: number): PixelSurface {
  const pulse = frame % 2 === 0;
  if (kind === 'loki') {
    // Loki's talking horned cyber-head suspended in glowing emerald fluid jar!
    const s = new PixelSurface(32, 38);
    const cx = 16;
    // Ornate gilded runic pedestal + side power cables & pressure gauge
    s.drawBevelRect(5, 26, 22, 10, C.steelLo);
    s.drawRectOutline(5, 26, 22, 10, C.gold);
    s.fillRect(8, 28, 4, 4, C.obsidian);
    s.setPx(9, 29, pulse ? C.limeHi : C.emerald);
    s.drawNorseRune(15, 29, 4, C.emerald);
    s.drawLine(5, 31, 2, 34, C.emeraldLo);
    s.drawLine(27, 31, 30, 34, C.emeraldLo);
    // Cylindrical emerald containment fluid jar + rising bubbles
    s.fillRect(8, 6, 16, 19, [16, 148, 102, 222]);
    s.fillRect(10, 7, 12, 17, [24, 184, 124, 210]);
    s.fillRect(9, 7, 2, 16, [180, 255, 232, 185]); // curved glass specular shine
    s.setPx(20, pulse ? 9 : 11, C.white); // rising bubble
    s.setPx(11, pulse ? 20 : 18, C.limeHi);
    s.drawBevelRect(7, 3, 18, 4, C.gold);
    s.drawBevelRect(7, 24, 18, 3, C.gold);
    s.fillRect(13, 1, 6, 2, C.steelHi);
    // Floating Loki head with sweeping golden horns & sly grin
    const hy = pulse ? 15 : 16;
    s.drawShadedEllipse(cx, hy, 4.6, 5.2, hexToRgba('#b8ebd6'));
    s.drawThickLine(cx - 3, hy - 3, cx - 7, hy - 8, 0.8, C.gold);
    s.drawThickLine(cx + 3, hy - 3, cx + 7, hy - 8, 0.8, C.gold);
    s.setPx(cx - 7, hy - 8, C.goldHi);
    s.setPx(cx + 7, hy - 8, C.goldHi);
    s.fillRect(cx - 3, hy - 1, 2, 2, C.limeHi);
    s.fillRect(cx + 1, hy - 1, 2, 2, C.limeHi);
    s.setPx(cx - 2, hy - 1, C.white);
    s.setPx(cx + 2, hy - 1, C.white);
    s.fillRect(cx - 2, hy + 2, 4, 1, C.ink);
    s.setPx(cx + 2, hy + 1, C.ink);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'jotunn') {
    // Jotunn-Matic 3000 Retro-Cyber Outcast Character Pod with Hologram Screen
    const s = new PixelSurface(36, 42);
    const cx = 18;
    // Heavy steel arcade/stasis pod chassis
    s.drawBevelRect(5, 6, 26, 34, hexToRgba('#34455e'));
    s.drawRectOutline(5, 6, 26, 34, C.steelHi);
    // Horned gilded marquee header
    s.drawThickLine(6, 7, 2, 2, 0.9, C.gold);
    s.drawThickLine(30, 7, 34, 2, 0.9, C.gold);
    s.drawBevelRect(8, 7, 20, 5, C.orange);
    s.fillRect(10, 9, 16, 1, C.goldHi);
    // Glowing cyan character preview CRT chamber + scanlines + mini Outcast silhouette
    s.fillRect(8, 13, 20, 15, hexToRgba('#072030'));
    s.fillRect(9, 14, 18, 13, pulse ? hexToRgba('#105a78') : hexToRgba('#0c4761'));
    for (let sy = 15; sy < 27; sy += 2) {
      s.fillRect(9, sy, 18, 1, [46, 230, 255, 75], true);
    }
    // Mini glowing cyan Outcast hologram inside screen
    s.fillRect(cx - 2, 16, 4, 3, C.ice);
    s.fillRect(cx - 3, 19, 6, 5, C.cyan);
    s.fillRect(cx - 2, 24, 2, 2, C.ice);
    s.fillRect(cx + 1, 24, 2, 2, C.ice);
    s.setPx(cx - 1, 17, C.white);
    s.setPx(cx + 1, 17, C.white);
    // Retro control deck with joystick & glowing buttons
    s.drawBevelRect(7, 29, 22, 9, C.steelDeep);
    s.fillRect(10, 31, 2, 4, C.steelHi);
    s.fillRect(9, 30, 4, 2, C.magenta);
    s.fillRect(16, 32, 3, 3, C.limeHi);
    s.fillRect(21, 32, 3, 3, C.yellow);
    s.fillRect(25, 32, 2, 3, C.cyan);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'yggdrasil') {
    // Glowing Holographic Yggdrasil Cyber-Tree with Neon Emerald Canopy
    const s = new PixelSurface(44, 48);
    const cx = 22;
    // Carved runic stone basin
    s.drawBevelRect(7, 36, 30, 10, C.steelLo);
    s.drawRectOutline(7, 36, 30, 10, C.steelHi);
    s.drawNorseRune(12, 39, 0, C.gold);
    s.drawNorseRune(29, 39, 3, C.gold);
    s.fillRect(17, 38, 10, 5, C.obsidian);
    s.fillRect(18, 39, 8, 3, pulse ? C.emerald : C.emeraldLo);
    // Braided metallic-bronze & glowing circuit roots/trunk
    s.drawShadedPolygon(
      [[cx - 5, 36], [cx - 3, 19], [cx + 3, 19], [cx + 5, 36]],
      C.bronze,
      701
    );
    s.drawLine(cx - 1, 35, cx - 1, 20, C.emerald);
    s.drawLine(cx + 1, 35, cx + 1, 20, C.limeHi);
    s.drawLine(cx - 3, 24, cx - 10, 16, C.bronze);
    s.drawLine(cx + 3, 24, cx + 10, 16, C.bronze);
    // Luminous multi-layered cyber-foliage canopy
    s.drawShadedEllipse(cx, 15, 16, 11, C.emeraldLo);
    s.drawShadedEllipse(cx - 9, 14, 8, 7, C.emerald);
    s.drawShadedEllipse(cx + 9, 14, 8, 7, C.emerald);
    s.drawShadedEllipse(cx, 10, 10, 7, pulse ? C.limeHi : C.emerald);
    s.drawShadedEllipse(cx - 4, 8, 5, 4, C.limeHi);
    // Glowing golden skill-node fruits & data motes
    s.drawGlowOrb(cx - 10, 13, 2, C.white, C.goldHi);
    s.drawGlowOrb(cx + 9, 12, 2, C.white, C.goldHi);
    s.drawGlowOrb(cx, 7, 2.2, C.white, C.yellow);
    s.fillRect(cx - 5, 18, 2, 2, C.cyan);
    s.fillRect(cx + 5, 17, 2, 2, C.cyan);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'modifiers') {
    // Glowing Purple Runestone Pillar for Run Modifiers
    const s = new PixelSurface(32, 42);
    const cx = 16;
    // Cracked stone ritual plinth
    s.drawBevelRect(5, 32, 22, 8, C.steelLo);
    s.fillRect(7, 33, 18, 2, C.purpleLo);
    // Tall carved obsidian standing-stone obelisk
    s.drawShadedPolygon(
      [
        [cx - 8, 33],
        [cx - 7, 10],
        [cx, 3],
        [cx + 7, 10],
        [cx + 8, 33],
      ],
      C.obsidianHi,
      710
    );
    // Pulsing purple/magenta Elder Futhark runes down the obelisk spine
    const runeCol = pulse ? C.purpleHi : C.magenta;
    s.drawNorseRune(cx - 1, 9, 5, runeCol);
    s.drawNorseRune(cx - 1, 17, 1, C.white);
    s.drawNorseRune(cx - 1, 25, 3, runeCol);
    // Orbiting levitating violet hazard crystal shards
    const lift = pulse ? -1 : 1;
    s.drawShadedPolygon([[4, 15 + lift], [6, 11 + lift], [8, 15 + lift], [6, 19 + lift]], C.purpleHi, 712);
    s.drawShadedPolygon([[24, 15 - lift], [26, 11 - lift], [28, 15 - lift], [26, 19 - lift]], C.magenta, 713);
    s.addEmissiveHalo(hexToRgba('#b84cff', 95), 1);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'weapondex') {
    // Neon-Lit Gun-Rack Armory Terminal for Weapon Database
    const s = new PixelSurface(38, 38);
    // Armored steel weapon-rack backing frame
    s.drawBevelRect(3, 5, 32, 30, C.steelDeep);
    s.drawRectOutline(3, 5, 32, 30, C.steelHi);
    // Neon cyan top light bar
    s.fillRect(5, 6, 28, 2, pulse ? C.cyan : C.ice);
    // Upper rack: crisp mounted pixel rifle silhouette
    s.fillRect(6, 10, 26, 7, C.obsidian);
    s.fillRect(8, 12, 4, 3, C.wood);
    s.fillRect(12, 11, 12, 3, C.steelHi);
    s.fillRect(24, 12, 6, 1, C.gold);
    s.fillRect(16, 14, 3, 2, C.steelLo);
    s.setPx(16, 11, C.orangeHi);
    // Middle rack: energy cannon + Norse axe icon
    s.fillRect(6, 19, 15, 6, C.obsidian);
    s.fillRect(8, 21, 9, 3, C.steel);
    s.fillRect(11, 22, 5, 1, C.cyan);
    // Right-side glowing amber-gold CRT weapon scanner monitor
    s.fillRect(23, 19, 9, 8, hexToRgba('#1c1408'));
    s.fillRect(24, 20, 7, 6, pulse ? C.orangeHi : C.gold);
    s.fillRect(25, 22, 5, 1, C.white);
    s.fillRect(25, 24, 3, 1, C.obsidian);
    // Lower workbench console ledge
    s.drawBevelRect(4, 28, 30, 7, C.steelLo);
    s.fillRect(7, 30, 8, 2, C.gold);
    s.fillRect(18, 30, 4, 2, C.cyan);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'enemydex') {
    // Holographic Crimson Skull Console for Enemy Database
    const s = new PixelSurface(38, 38);
    const cx = 19;
    // Dark armored tactical console desk
    s.drawBevelRect(4, 24, 30, 12, C.obsidianHi);
    s.drawRectOutline(4, 24, 30, 12, C.steel);
    // Emitter lens dish + side radar pips
    s.fillRect(13, 24, 12, 3, C.red);
    s.fillRect(15, 24, 8, 2, pulse ? C.redHi : C.orangeHi);
    s.fillRect(7, 28, 5, 4, hexToRgba('#290a14'));
    s.setPx(9, 29, C.redHi);
    s.fillRect(26, 28, 5, 4, hexToRgba('#290a14'));
    s.setPx(28, 30, C.yellow);
    // Glowing holographic crimson projection cone
    s.fillPolygon(
      [[14, 24], [24, 24], [30, 6], [8, 6]],
      [255, 48, 72, pulse ? 88 : 65],
      true
    );
    // Crisp holographic horned monster skull hovering in projection
    const sy = pulse ? 13 : 14;
    s.drawShadedEllipse(cx, sy, 6, 5.5, C.redHi, false);
    s.drawLine(cx - 5, sy - 3, cx - 9, sy - 8, C.redHi);
    s.drawLine(cx + 5, sy - 3, cx + 9, sy - 8, C.redHi);
    // Hollow skull eyes & jaw teeth
    s.fillRect(cx - 4, sy - 1, 3, 2, C.white);
    s.fillRect(cx + 1, sy - 1, 3, 2, C.white);
    s.fillRect(cx - 3, sy + 4, 6, 3, C.red);
    s.setPx(cx - 2, sy + 5, C.white);
    s.setPx(cx, sy + 5, C.white);
    s.setPx(cx + 2, sy + 5, C.white);
    // Holo scanline sweep
    s.fillRect(10, pulse ? 10 : 17, 18, 1, [255, 210, 220, 165], true);
    s.applyOutline(C.ink);
    return s;
  }
  if (kind === 'challenges') {
    // Golden Trophy Board & Valhallan Quest Pillar for Challenges
    const s = new PixelSurface(36, 40);
    const cx = 18;
    // Timber & iron notice-board pillars
    s.drawBevelRect(4, 12, 28, 25, C.wood);
    s.drawRectOutline(4, 12, 28, 25, C.gold);
    // Gleaming golden trophy chalice mounted on top crest
    s.drawShadedPolygon([[cx - 5, 3], [cx + 5, 3], [cx + 3, 9], [cx - 3, 9]], C.goldHi, 740);
    s.fillRect(cx - 1, 9, 2, 3, C.gold);
    s.fillRect(cx - 4, 11, 8, 2, C.goldHi);
    // Pinned parchment challenge scrolls & glowing gold star plaques
    s.fillRect(7, 15, 9, 8, C.bone);
    s.fillRect(8, 17, 7, 1, C.woodLo);
    s.fillRect(8, 19, 5, 1, C.woodLo);
    s.fillRect(20, 15, 9, 8, C.bone);
    s.fillRect(21, 17, 7, 1, C.red);
    s.fillRect(21, 19, 6, 1, C.woodLo);
    // Glowing achievement stars along lower trophy shelf
    s.drawGlowOrb(11, 29, 2.2, C.white, pulse ? C.yellow : C.gold);
    s.drawGlowOrb(cx, 29, 2.6, C.white, C.goldHi);
    s.drawGlowOrb(25, 29, 2.2, C.white, pulse ? C.gold : C.yellow);
    s.applyOutline(C.ink);
    return s;
  }
  // training dummy
  const s = new PixelSurface(26, 30);
  const cx = 13;
  // Reinforced timber stand & cross-arms
  s.fillRect(cx - 1, 14, 2, 14, C.wood);
  s.fillRect(cx - 7, 26, 14, 2, C.woodLo);
  s.fillRect(cx - 9, 13, 18, 2, C.wood);
  // Straw-and-leather padded torso wrapped with iron straps
  s.drawBevelRect(cx - 5, 10, 10, 11, hexToRgba('#c7a56d'));
  s.fillRect(cx - 5, 19, 10, 2, C.steelLo);
  // Crisp painted red/white bullseye target
  s.fillEllipse(cx, 15, 3.6, 3.6, C.red);
  s.fillEllipse(cx, 15, 2.2, 2.2, C.white);
  s.setPx(cx, 15, C.red);
  // Horned iron Norse helm head
  s.drawShadedEllipse(cx, 6, 4, 3.8, C.steel);
  s.drawThickLine(cx - 3, 4, cx - 7, 1, 0.7, C.bone);
  s.drawThickLine(cx + 3, 4, cx + 7, 1, 0.7, C.bone);
  s.setPx(cx - 1, 6, pulse ? C.orangeHi : C.yellow);
  s.setPx(cx + 2, 6, pulse ? C.orangeHi : C.yellow);
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

  // 9. Hub Landmarks (All 8 distinct Outpost Hub stations!)
  registerSprite(
    'hub_loki',
    [0, 1].map((f) => drawHubLandmark('loki', f)),
    16,
    35
  );
  registerSprite(
    'hub_jotunn',
    [0, 1].map((f) => drawHubLandmark('jotunn', f)),
    18,
    39
  );
  registerSprite(
    'hub_yggdrasil',
    [0, 1].map((f) => drawHubLandmark('yggdrasil', f)),
    22,
    45
  );
  registerSprite(
    'hub_modifiers',
    [0, 1].map((f) => drawHubLandmark('modifiers', f)),
    16,
    39
  );
  registerSprite(
    'hub_weapondex',
    [0, 1].map((f) => drawHubLandmark('weapondex', f)),
    19,
    35
  );
  registerSprite(
    'hub_enemydex',
    [0, 1].map((f) => drawHubLandmark('enemydex', f)),
    19,
    35
  );
  registerSprite(
    'hub_challenges',
    [0, 1].map((f) => drawHubLandmark('challenges', f)),
    18,
    37
  );
  registerSprite(
    'hub_dummy',
    [0, 1].map((f) => drawHubLandmark('dummy', f)),
    13,
    27
  );

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
    'hub_modifiers',
    'hub_weapondex',
    'hub_enemydex',
    'hub_challenges',
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
