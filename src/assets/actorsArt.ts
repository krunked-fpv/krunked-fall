// ============================================================================
// KRUNKEDFALL — Heavy-Metal Outcasts (34x34), 22 Enemies (28..54px),
//                22 Chunky Weapons, Bold Projectiles & Comic-Book VFX
// ============================================================================
// Every sprite uses multi-layer `drawPart()` internal dark-ink outlining,
// curated 6-tone hue-shifted ColorRamps, Bayer dithering, and chunky
// readable arcade proportions matching native 640x360 action-roguelite scale.

import {
  type AmmoType,
  type WeaponClass,
} from '../contracts/index';
import {
  INK_OUTLINE,
  PixelSurface,
  RAMPS,
  hexToRgba,
  pixelHash,
  sampleRamp,
  type ColorRamp,
  type RGBA,
} from './pixelArtGen';

const WHT: RGBA = [255, 255, 255, 255];
const CYAN: RGBA = [72, 240, 255, 255];
const MAGENTA: RGBA = [255, 58, 178, 255];
const LIME: RGBA = [166, 255, 62, 255];
const GOLD: RGBA = [255, 214, 68, 255];
const ORANGE: RGBA = [255, 118, 32, 255];
const RED: RGBA = [255, 48, 72, 255];
const PURPLE: RGBA = [208, 108, 255, 255];

// ============================================================================
// 1. ALL 8 PLAYABLE OUTCASTS (34x34, ~28-30px TALL, 4-FRAME EXPRESSIVE CYCLE)
// ============================================================================

export type OutcastStyle =
  | 'britta'
  | 'leifi'
  | 'gustaf'
  | 'einar'
  | 'gunilla'
  | 'trulls'
  | 'stellan'
  | 'hilda';

export interface OutcastArtSpec {
  key: string;
  style: OutcastStyle;
  bodyRamp: ColorRamp;
  trimRamp: ColorRamp;
  headRamp: ColorRamp;
  capeRamp?: ColorRamp;
  visor: RGBA;
}

export const OUTCAST_ART_SPECS: readonly OutcastArtSpec[] = [
  { key: 'outcast_britta', style: 'britta', bodyRamp: RAMPS.iron, trimRamp: RAMPS.chrome, headRamp: RAMPS.skin, capeRamp: RAMPS.fur, visor: CYAN },
  { key: 'outcast_leifi', style: 'leifi', bodyRamp: RAMPS.steel, trimRamp: RAMPS.bronze, headRamp: RAMPS.fur, capeRamp: RAMPS.crimson, visor: GOLD },
  { key: 'outcast_gustaf', style: 'gustaf', bodyRamp: RAMPS.obsidian, trimRamp: RAMPS.void, headRamp: RAMPS.obsidian, capeRamp: RAMPS.void, visor: PURPLE },
  { key: 'outcast_einar', style: 'einar', bodyRamp: RAMPS.iron, trimRamp: RAMPS.gold, headRamp: RAMPS.skin, visor: GOLD },
  { key: 'outcast_gunilla', style: 'gunilla', bodyRamp: RAMPS.troll, trimRamp: RAMPS.gold, headRamp: RAMPS.skin, visor: LIME },
  { key: 'outcast_trulls', style: 'trulls', bodyRamp: RAMPS.iron, trimRamp: RAMPS.steel, headRamp: RAMPS.troll, visor: CYAN },
  { key: 'outcast_stellan', style: 'stellan', bodyRamp: RAMPS.leather, trimRamp: RAMPS.rust, headRamp: RAMPS.troll, visor: GOLD },
  { key: 'outcast_hilda', style: 'hilda', bodyRamp: RAMPS.emerald, trimRamp: RAMPS.wood, headRamp: RAMPS.skin, capeRamp: RAMPS.emerald, visor: LIME },
];

export function drawOutcastFrameHQ(spec: OutcastArtSpec, frame: number): PixelSurface {
  const s = new PixelSurface(34, 34);
  const cx = 17;
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const legL = frame === 1 ? -2 : frame === 3 ? 2 : 0;
  const legR = -legL;
  const capeSway = frame === 1 ? -2 : frame === 3 ? 2 : 0;

  // 1. Flowing Back Cloak / Fur Mantle (animated sway)
  if (spec.capeRamp) {
    const capeRamp = spec.capeRamp;
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 8, 15 + bob],
          [cx + 8, 15 + bob],
          [cx + 10 + capeSway, 29 + bob],
          [cx + 4 + capeSway, 27 + bob],
          [cx + capeSway, 30 + bob],
          [cx - 4 + capeSway, 27 + bob],
          [cx - 10 + capeSway, 29 + bob],
        ],
        capeRamp,
      );
    });
  }

  // 2. Chunky Armored War Boots (articulated stride!)
  s.drawPart((p) => {
    p.drawRampPlate(cx - 7, 25 + Math.min(0, legL), 5, 6 - Math.max(0, legL), RAMPS.iron, false, false);
    p.drawRampPlate(cx + 2, 25 + Math.min(0, legR), 5, 6 - Math.max(0, legR), RAMPS.iron, false, false);
    p.fillRect(cx - 7, 25 + Math.min(0, legL), 5, 1, spec.trimRamp[4]);
    p.fillRect(cx + 2, 25 + Math.min(0, legR), 5, 1, spec.trimRamp[4]);
  });

  // 3. Chunky Armored Viking Torso + Belt + Chest Core
  const wide = spec.style === 'leifi' || spec.style === 'trulls' || spec.style === 'einar';
  const tw = wide ? 14 : 12;
  const tx = Math.floor(cx - tw / 2);
  s.drawPart((p) => {
    p.drawRampPolygon(
      [
        [tx - 1, 15 + bob],
        [tx + tw + 1, 15 + bob],
        [tx + tw - 1, 26 + bob],
        [tx + 1, 26 + bob],
      ],
      spec.bodyRamp,
    );
    // Heavy Viking leather belt + forged buckle
    p.fillRect(tx, 23 + bob, tw, 3, RAMPS.leather[2]);
    p.drawRampPlate(cx - 2, 23 + bob, 4, 3, spec.trimRamp, false, false);
    // Fur collar or metallic chest V-trim
    p.drawLine(tx + 1, 16 + bob, cx, 21 + bob, spec.trimRamp[4]);
    p.drawLine(tx + tw - 2, 16 + bob, cx, 21 + bob, spec.trimRamp[4]);
    p.drawGlowOrb(cx, 19 + bob, 1.5, WHT, spec.visor);

    if (spec.style === 'gunilla') {
      // Crossed gleaming brass ammo bandolier!
      p.drawThickLine(tx, 16 + bob, tx + tw - 1, 23 + bob, 1.0, RAMPS.gold[3]);
      for (let b = 0; b < 4; b++) {
        p.setPx(tx + 2 + b * 2, 17 + b + bob, RAMPS.gold[5]);
      }
    } else if (spec.style === 'stellan') {
      // Strapped crimson dynamite/grenades on chest!
      p.fillRect(tx + 2, 17 + bob, 3, 5, RAMPS.crimson[3]);
      p.setPx(tx + 3, 17 + bob, GOLD);
      p.fillRect(tx + tw - 5, 17 + bob, 3, 5, RAMPS.crimson[3]);
      p.setPx(tx + tw - 4, 17 + bob, GOLD);
    }
  }, INK_OUTLINE, 1);

  // 4. Sculpted Pauldrons & Arms
  s.drawPart((p) => {
    const armY = 16 + bob;
    if (spec.style === 'britta') {
      // Iconic massive gleaming chrome cyber-arm with blazing cyan plasma seam!
      p.drawRampEllipse(tx - 1, armY + 1, 3.6, 3.2, RAMPS.chrome);
      p.drawRampPlate(tx - 4, armY + 3, 5, 7, RAMPS.chrome, false, false);
      p.fillRect(tx - 2, armY + 3, 1, 6, CYAN);
      p.setPx(tx - 2, armY + 4, WHT);
      // Right armored leather arm
      p.drawRampEllipse(tx + tw + 1, armY + 1, 3.0, 2.8, RAMPS.fur);
      p.drawRampPlate(tx + tw - 1, armY + 3, 4, 6, RAMPS.leather, false, false);
    } else if (spec.style === 'trulls') {
      // Spiked iron troll pauldrons!
      p.drawRampEllipse(tx - 2, armY + 1, 4, 3.5, RAMPS.steel);
      p.drawRampEllipse(tx + tw + 2, armY + 1, 4, 3.5, RAMPS.steel);
      p.drawRampLimb(tx - 3, armY - 1, tx - 6, armY - 4, 1.4, 0.5, RAMPS.bone);
      p.drawRampLimb(tx + tw + 3, armY - 1, tx + tw + 6, armY - 4, 1.4, 0.5, RAMPS.bone);
      p.drawRampPlate(tx - 4, armY + 4, 4, 6, RAMPS.troll, false, false);
      p.drawRampPlate(tx + tw, armY + 4, 4, 6, RAMPS.troll, false, false);
    } else {
      p.drawRampEllipse(tx - 1, armY + 1, 3.3, 3.0, spec.trimRamp);
      p.drawRampEllipse(tx + tw + 1, armY + 1, 3.3, 3.0, spec.trimRamp);
      p.drawRampPlate(tx - 3, armY + 4, 4, 5, spec.bodyRamp, false, false);
      p.drawRampPlate(tx + tw - 1, armY + 4, 4, 5, spec.bodyRamp, false, false);
    }
  });

  // 5. Iconic Expressive Head & Heavy-Metal Norse Headgear!
  const hy = 9 + bob;
  s.drawPart((p) => {
    p.drawRampEllipse(cx, hy + 2, 5.2, 4.8, spec.headRamp, false);

    switch (spec.style) {
      case 'britta': {
        // Tall blazing neon-magenta punk mohawk + gleaming cyber-visor eye!
        p.drawRampPolygon(
          [
            [cx - 3, hy - 1],
            [cx - 1, hy - 7],
            [cx + 1, hy - 8],
            [cx + 3, hy - 5],
            [cx + 4, hy - 1],
          ],
          RAMPS.void,
        );
        p.drawLine(cx, hy - 7, cx + 1, hy - 2, MAGENTA);
        p.setPx(cx, hy - 7, WHT);
        // Cyber-plate over left eye + glowing cyan eye
        p.fillRect(cx - 4, hy + 1, 4, 3, RAMPS.chrome[3]);
        p.fillRect(cx - 3, hy + 2, 2, 1, CYAN);
        p.setPx(cx - 3, hy + 2, WHT);
        // Fierce right eye + smirk
        p.fillRect(cx + 1, hy + 2, 2, 2, INK_OUTLINE);
        p.setPx(cx + 2, hy + 2, WHT);
        p.fillRect(cx - 1, hy + 5, 3, 1, RAMPS.skin[1]);
        break;
      }
      case 'leifi': {
        // Armored Viking Moose Helm + HUGE sweeping ivory antlers!
        p.drawRampLimb(cx - 5, hy, cx - 12, hy - 4, 1.5, 1.0, RAMPS.bone);
        p.drawRampLimb(cx - 9, hy - 2, cx - 10, hy - 7, 1.2, 0.6, RAMPS.bone);
        p.drawRampLimb(cx - 12, hy - 4, cx - 13, hy - 8, 1.1, 0.5, RAMPS.bone);
        p.drawRampLimb(cx + 5, hy, cx + 12, hy - 4, 1.5, 1.0, RAMPS.bone);
        p.drawRampLimb(cx + 9, hy - 2, cx + 10, hy - 7, 1.2, 0.6, RAMPS.bone);
        p.drawRampLimb(cx + 12, hy - 4, cx + 13, hy - 8, 1.1, 0.5, RAMPS.bone);
        // Riveted Norse iron battle helm & moose muzzle
        p.drawRampPolygon(
          [[cx - 6, hy + 1], [cx - 5, hy - 4], [cx, hy - 5], [cx + 5, hy - 4], [cx + 6, hy + 1]],
          RAMPS.steel,
        );
        p.drawRampEllipse(cx, hy + 4, 4.5, 3.0, RAMPS.fur, false);
        p.fillRect(cx - 4, hy + 1, 8, 2, INK_OUTLINE);
        p.fillRect(cx - 3, hy + 1, 6, 1, GOLD);
        p.setPx(cx, hy + 1, WHT);
        break;
      }
      case 'gustaf': {
        // Pointed shadow assassin hood + blazing twin neon-violet eyes
        p.drawRampPolygon(
          [
            [cx - 6, hy + 5],
            [cx - 6, hy - 2],
            [cx, hy - 7],
            [cx + 6, hy - 2],
            [cx + 6, hy + 5],
          ],
          RAMPS.obsidian,
        );
        p.fillEllipse(cx, hy + 2, 4.2, 3.5, INK_OUTLINE);
        p.fillRect(cx - 3, hy + 1, 2, 2, PURPLE);
        p.fillRect(cx + 1, hy + 1, 2, 2, PURPLE);
        p.setPx(cx - 2, hy + 1, WHT);
        p.setPx(cx + 2, hy + 1, WHT);
        break;
      }
      case 'einar': {
        // Riveted brass mining helmet + blazing headlamp + HUGE fiery braided beard!
        p.drawRampPolygon(
          [[cx - 6, hy + 1], [cx - 5, hy - 4], [cx + 5, hy - 4], [cx + 6, hy + 1]],
          RAMPS.gold,
        );
        p.drawGlowOrb(cx, hy - 2, 2.0, WHT, GOLD);
        // Massive braided fiery orange-gold dwarf beard spilling over chest!
        p.drawRampPolygon(
          [
            [cx - 5, hy + 3],
            [cx + 5, hy + 3],
            [cx + 6, hy + 10],
            [cx + 2, hy + 13],
            [cx, hy + 11],
            [cx - 2, hy + 13],
            [cx - 6, hy + 10],
          ],
          RAMPS.fire,
        );
        p.fillRect(cx - 3, hy + 11, 2, 1, RAMPS.gold[5]);
        p.fillRect(cx + 1, hy + 11, 2, 1, RAMPS.gold[5]);
        p.setPx(cx - 2, hy + 2, INK_OUTLINE);
        p.setPx(cx + 2, hy + 2, INK_OUTLINE);
        break;
      }
      case 'gunilla': {
        // Crimson commando headband with trailing tails + HUGE glowing lime aviator goggles!
        p.drawRampPolygon([[cx - 6, hy - 2], [cx + 6, hy - 2], [cx + 5, hy + 1], [cx - 5, hy + 1]], RAMPS.crimson);
        p.drawThickLine(cx - 6, hy - 1, cx - 10, hy + 2 + (frame % 2), 1.0, RAMPS.crimson[3]);
        // Chunky neon-lime goggles
        p.drawRampPlate(cx - 5, hy, 5, 4, RAMPS.iron, false, false);
        p.drawRampPlate(cx + 1, hy, 5, 4, RAMPS.iron, false, false);
        p.fillRect(cx - 4, hy + 1, 3, 2, LIME);
        p.fillRect(cx + 2, hy + 1, 3, 2, LIME);
        p.setPx(cx - 4, hy + 1, WHT);
        p.setPx(cx + 2, hy + 1, WHT);
        break;
      }
      case 'trulls': {
        // Rugged cyber-troll brow + huge ivory lower tusks + glowing bionic eye!
        p.drawRampPolygon([[cx - 6, hy - 1], [cx - 5, hy - 4], [cx + 5, hy - 4], [cx + 6, hy - 1]], RAMPS.troll);
        p.drawRampPlate(cx - 4, hy, 4, 3, RAMPS.chrome, false, false);
        p.setPx(cx - 2, hy + 1, CYAN);
        p.setPx(cx - 3, hy + 1, WHT);
        p.fillRect(cx + 2, hy + 1, 2, 2, GOLD);
        // Huge jutting tusks
        p.fillRect(cx - 4, hy + 4, 2, 3, RAMPS.bone[5]);
        p.fillRect(cx + 2, hy + 4, 2, 3, RAMPS.bone[5]);
        break;
      }
      case 'stellan': {
        // Long sweeping goblin ears + brass blast goggles + manic toothy grin!
        p.drawRampPolygon([[cx - 5, hy + 1], [cx - 11, hy - 2], [cx - 5, hy + 4]], RAMPS.troll);
        p.drawRampPolygon([[cx + 5, hy + 1], [cx + 11, hy - 2], [cx + 5, hy + 4]], RAMPS.troll);
        p.drawRampPlate(cx - 5, hy - 2, 10, 4, RAMPS.bronze, false, false);
        p.fillRect(cx - 4, hy - 1, 3, 2, GOLD);
        p.fillRect(cx + 1, hy - 1, 3, 2, GOLD);
        p.setPx(cx - 3, hy - 1, WHT);
        p.setPx(cx + 2, hy - 1, WHT);
        // Toothy goblin grin
        p.fillRect(cx - 3, hy + 4, 6, 2, INK_OUTLINE);
        p.setPx(cx - 2, hy + 4, WHT);
        p.setPx(cx, hy + 5, WHT);
        p.setPx(cx + 2, hy + 4, WHT);
        break;
      }
      case 'hilda': {
        // Forest Valkyrie hood + blooming wooden stag antlers with emerald blossoms!
        p.drawRampLimb(cx - 4, hy - 2, cx - 9, hy - 8, 1.3, 0.7, RAMPS.wood);
        p.drawRampLimb(cx - 7, hy - 5, cx - 11, hy - 5, 1.0, 0.6, RAMPS.wood);
        p.drawRampLimb(cx + 4, hy - 2, cx + 9, hy - 8, 1.3, 0.7, RAMPS.wood);
        p.drawRampLimb(cx + 7, hy - 5, cx + 11, hy - 5, 1.0, 0.6, RAMPS.wood);
        p.drawGlowOrb(cx - 9, hy - 8, 1.4, WHT, LIME);
        p.drawGlowOrb(cx + 9, hy - 8, 1.4, WHT, LIME);
        p.drawGlowOrb(cx - 11, hy - 5, 1.1, WHT, RAMPS.emerald[4]);
        p.drawGlowOrb(cx + 11, hy - 5, 1.1, WHT, RAMPS.emerald[4]);
        p.fillRect(cx - 3, hy + 1, 2, 2, LIME);
        p.fillRect(cx + 1, hy + 1, 2, 2, LIME);
        p.setPx(cx - 2, hy + 1, WHT);
        p.setPx(cx + 2, hy + 1, WHT);
        break;
      }
    }
  }, INK_OUTLINE, 1);

  return s;
}

// ============================================================================
// 2. 22 DISTINCT HEAVY-METAL ENEMY ARCHETYPES (28x28 .. 54x54, 4-FRAME ANIM)
// ============================================================================

export type EnemyVisualKind =
  | 'enemy_bandit'
  | 'enemy_trooper'
  | 'enemy_wolf'
  | 'enemy_bear'
  | 'enemy_viking'
  | 'enemy_robot'
  | 'enemy_walker'
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
  | 'enemy_sniper'
  | 'enemy_flier'
  | 'enemy_cactus'
  | 'enemy_mushroom'
  | 'enemy_snowman';

export const ENEMY_VISUAL_KINDS: readonly EnemyVisualKind[] = [
  'enemy_bandit',
  'enemy_trooper',
  'enemy_wolf',
  'enemy_bear',
  'enemy_viking',
  'enemy_robot',
  'enemy_walker',
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
  'enemy_flier',
  'enemy_cactus',
  'enemy_mushroom',
  'enemy_snowman',
];

export function drawEnemyFrameHQ(kind: EnemyVisualKind, frame: number): PixelSurface {
  const isGiant = kind === 'enemy_giant';
  const isWalker = kind === 'enemy_walker';
  const isBear = kind === 'enemy_bear';
  const w = isGiant ? 54 : isWalker ? 46 : isBear ? 38 : 30;
  const h = isGiant ? 54 : isWalker ? 46 : isBear ? 36 : 30;
  const s = new PixelSurface(w, h);
  const cx = Math.floor(w / 2);
  const bob = frame === 1 || frame === 3 ? -1 : 0;
  const leg = frame === 1 ? -2 : frame === 3 ? 2 : 0;
  const pulse = frame % 2 === 0;

  switch (kind) {
    case 'enemy_bandit':
    case 'enemy_default': {
      // Gritty Wasteland Raider with gas-mask, mohawk, spiked leather vest & glowing red goggles
      s.drawPart((p) => {
        p.drawRampPlate(cx - 5, 22 + Math.min(0, leg), 4, 6, RAMPS.leather, false, false);
        p.drawRampPlate(cx + 1, 22 + Math.min(0, -leg), 4, 6, RAMPS.leather, false, false);
      });
      s.drawPart((p) => {
        p.drawRampPolygon([[cx - 6, 13 + bob], [cx + 6, 13 + bob], [cx + 5, 23 + bob], [cx - 5, 23 + bob]], RAMPS.rust);
        p.fillRect(cx - 5, 20 + bob, 10, 2, RAMPS.iron[2]);
        p.fillRect(cx - 1, 20 + bob, 2, 2, GOLD);
        // Spiked steel left pauldron
        p.drawRampEllipse(cx - 7, 15 + bob, 3, 2.8, RAMPS.iron);
        p.drawLine(cx - 8, 13 + bob, cx - 10, 10 + bob, RAMPS.chrome[5]);
        p.drawRampEllipse(cx + 7, 15 + bob, 2.6, 2.6, RAMPS.leather);
      });
      s.drawPart((p) => {
        // Gas-mask cranium + fiery orange mohawk + blazing crimson goggles
        p.drawRampEllipse(cx, 9 + bob, 4.8, 4.5, RAMPS.iron, false);
        p.drawRampPolygon([[cx - 2, 5 + bob], [cx, 1 + bob], [cx + 2, 5 + bob]], RAMPS.fire);
        p.fillRect(cx - 4, 8 + bob, 3, 3, RED);
        p.fillRect(cx + 1, 8 + bob, 3, 3, RED);
        p.setPx(cx - 3, 8 + bob, WHT);
        p.setPx(cx + 2, 8 + bob, WHT);
        // Gas mask canister snout
        p.drawRampEllipse(cx, 12 + bob, 2.5, 2, RAMPS.steel);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_trooper': {
      // Heavy Bluetooth / Cyber-Norse Armored Trooper with glowing blue T-visor!
      s.drawPart((p) => {
        p.drawRampPlate(cx - 5, 22 + Math.min(0, leg), 4, 6, RAMPS.steel, false, false);
        p.drawRampPlate(cx + 1, 22 + Math.min(0, -leg), 4, 6, RAMPS.steel, false, false);
      });
      s.drawPart((p) => {
        p.drawRampPolygon([[cx - 7, 12 + bob], [cx + 7, 12 + bob], [cx + 5, 23 + bob], [cx - 5, 23 + bob]], RAMPS.steel);
        p.drawRampEllipse(cx - 8, 15 + bob, 3.2, 3, RAMPS.steel);
        p.drawRampEllipse(cx + 8, 15 + bob, 3.2, 3, RAMPS.steel);
        p.drawGlowOrb(cx, 17 + bob, 1.6, WHT, CYAN);
      });
      s.drawPart((p) => {
        p.drawRampPolygon([[cx - 5, 11 + bob], [cx - 5, 5 + bob], [cx, 3 + bob], [cx + 5, 5 + bob], [cx + 5, 11 + bob]], RAMPS.steel);
        p.fillRect(cx - 4, 7 + bob, 8, 2, INK_OUTLINE);
        p.fillRect(cx - 3, 7 + bob, 6, 1, CYAN);
        p.fillRect(cx - 1, 8 + bob, 2, 3, CYAN);
        p.setPx(cx, 7 + bob, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_wolf': {
      // Snarling Cyber-Fang Wolf Hound in predatory low pounce
      s.drawPart((p) => {
        p.drawRampLimb(cx - 8, 19 + bob, cx - 10, 26 + leg, 2.2, 1.6, RAMPS.wolfSlate);
        p.drawRampLimb(cx + 5, 19 + bob, cx + 8, 26 - leg, 2.2, 1.6, RAMPS.wolfSlate);
        p.drawRampLimb(cx - 9, 17 + bob, cx - 13, 12 + bob, 1.5, 0.7, RAMPS.wolfSlate);
      });
      s.drawPart((p) => {
        p.drawRampEllipse(cx - 1, 17 + bob, 9.5, 5.5, RAMPS.wolfSlate);
        // Glowing toxic dorsal cyber-cells!
        p.fillRect(cx - 5, 12 + bob, 2, 2, LIME);
        p.fillRect(cx - 1, 11 + bob, 2, 2, LIME);
        p.fillRect(cx + 3, 12 + bob, 2, 2, LIME);
      });
      s.drawPart((p) => {
        // Armored wolf head & snapping jaws
        p.drawRampPolygon([[cx + 3, 12 + bob], [cx + 4, 5 + bob], [cx + 7, 10 + bob]], RAMPS.steel);
        p.drawRampPolygon([[cx + 7, 12 + bob], [cx + 10, 5 + bob], [cx + 11, 11 + bob]], RAMPS.steel);
        p.drawRampEllipse(cx + 7, 13 + bob, 5.2, 4.4, RAMPS.steel);
        p.fillRect(cx + 8, 15 + bob, 5, 3, INK_OUTLINE);
        p.setPx(cx + 10, 15 + bob, WHT);
        p.setPx(cx + 12, 15 + bob, WHT);
        p.fillRect(cx + 8, 11 + bob, 3, 2, LIME);
        p.setPx(cx + 9, 11 + bob, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_bear': {
      // 38x36 Hulking Cyber-War Bear with iron shoulder plates & roaring fangs!
      s.drawPart((p) => {
        p.drawRampPlate(cx - 10, 24 + Math.min(0, leg), 6, 9, RAMPS.fur, false, false);
        p.drawRampPlate(cx + 4, 24 + Math.min(0, -leg), 6, 9, RAMPS.fur, false, false);
        p.fillRect(cx - 10, 31 + Math.min(0, leg), 6, 2, RAMPS.bone[5]);
        p.fillRect(cx + 4, 31 + Math.min(0, -leg), 6, 2, RAMPS.bone[5]);
      });
      s.drawPart((p) => {
        p.drawRampEllipse(cx, 19 + bob, 13, 10, RAMPS.fur);
        p.drawRampEllipse(cx - 10, 16 + bob, 5, 4.5, RAMPS.steel);
        p.drawRampEllipse(cx + 10, 16 + bob, 5, 4.5, RAMPS.steel);
      });
      s.drawPart((p) => {
        p.drawRampEllipse(cx - 5, 6 + bob, 2.5, 2.5, RAMPS.fur);
        p.drawRampEllipse(cx + 5, 6 + bob, 2.5, 2.5, RAMPS.fur);
        p.drawRampEllipse(cx, 11 + bob, 6.8, 6.0, RAMPS.fur);
        p.drawRampEllipse(cx, 14 + bob, 4.2, 3.0, RAMPS.leather);
        p.fillRect(cx - 3, 14 + bob, 6, 3, RAMPS.crimson[1]);
        p.setPx(cx - 2, 14 + bob, WHT);
        p.setPx(cx + 2, 14 + bob, WHT);
        p.fillRect(cx - 4, 9 + bob, 2, 2, RED);
        p.fillRect(cx + 2, 9 + bob, 2, 2, RED);
        p.setPx(cx - 3, 9 + bob, WHT);
        p.setPx(cx + 3, 9 + bob, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_viking': {
      // Horned Norse Berserker / Einherjar with round wooden rune shield & fur cloak!
      s.drawPart((p) => {
        p.drawRampPlate(cx - 5, 22 + Math.min(0, leg), 4, 6, RAMPS.leather, false, false);
        p.drawRampPlate(cx + 1, 22 + Math.min(0, -leg), 4, 6, RAMPS.leather, false, false);
      });
      s.drawPart((p) => {
        p.drawRampPolygon([[cx - 7, 13 + bob], [cx + 7, 13 + bob], [cx + 6, 23 + bob], [cx - 6, 23 + bob]], RAMPS.steel);
        p.fillRect(cx - 7, 13 + bob, 14, 3, RAMPS.fur[4]); // fur mantle
      });
      // Chunky round Norse battle shield on left flank!
      s.drawPart((p) => {
        p.drawRampEllipse(cx - 8, 19 + bob, 4.8, 5.8, RAMPS.wood);
        p.drawRampEllipse(cx - 8, 19 + bob, 2.0, 2.4, RAMPS.gold);
      });
      // Sculpted horned iron helm & fiery beard
      s.drawPart((p) => {
        p.drawRampLimb(cx - 4, 7 + bob, cx - 10, 2 + bob, 1.8, 0.6, RAMPS.bone);
        p.drawRampLimb(cx + 4, 7 + bob, cx + 10, 2 + bob, 1.8, 0.6, RAMPS.bone);
        p.drawRampEllipse(cx, 9 + bob, 5.2, 4.8, RAMPS.steel);
        p.fillRect(cx - 4, 9 + bob, 8, 2, INK_OUTLINE);
        p.setPx(cx - 2, 9 + bob, CYAN);
        p.setPx(cx + 2, 9 + bob, CYAN);
        p.drawRampPolygon([[cx - 4, 11 + bob], [cx + 4, 11 + bob], [cx, 16 + bob]], RAMPS.fire);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_robot': {
      // Menacing Angular Cyber-Norse Siege Automaton with shoulder rockets, horned steel brow & twin gun arms!
      s.drawPart((p) => {
        // Heavy armored hydraulic mech legs (wide fighting stance)
        p.drawRampPolygon([[cx - 8, 22 + Math.min(0, leg)], [cx - 2, 22 + Math.min(0, leg)], [cx - 3, 28], [cx - 9, 28]], RAMPS.iron);
        p.drawRampPolygon([[cx + 2, 22 + Math.min(0, -leg)], [cx + 8, 22 + Math.min(0, -leg)], [cx + 9, 28], [cx + 3, 28]], RAMPS.iron);
        p.fillRect(cx - 8, 25, 4, 1, RAMPS.steel[4]);
        p.fillRect(cx + 4, 25, 4, 1, RAMPS.steel[4]);
      });
      s.drawPart((p) => {
        // Twin underslung arm plasma cannons
        p.drawRampPlate(cx - 13, 13 + bob, 5, 9, RAMPS.iron, true, false);
        p.drawRampPlate(cx + 8, 13 + bob, 5, 9, RAMPS.iron, true, false);
        p.fillRect(cx - 12, 21 + bob, 3, 2, ORANGE);
        p.fillRect(cx + 9, 21 + bob, 3, 2, ORANGE);
        // Sloped V-tapered armored iron chassis (NO T-pose blue cylinder!)
        p.drawRampPolygon(
          [
            [cx - 9, 10 + bob],
            [cx + 9, 10 + bob],
            [cx + 7, 23 + bob],
            [cx, 25 + bob],
            [cx - 7, 23 + bob],
          ],
          RAMPS.steel,
        );
        // Shoulder exhaust vents & glowing reactor chest slit
        p.fillRect(cx - 6, 17 + bob, 12, 2, INK_OUTLINE);
        p.fillRect(cx - 4, 18 + bob, 8, 2, pulse ? ORANGE : RED);
        p.fillRect(cx - 2, 18 + bob, 4, 1, GOLD);
      }, INK_OUTLINE, 1);
      // Angular Horned Cyber-Knight Head & Blazing Crimson Visor!
      s.drawPart((p) => {
        p.drawRampLimb(cx - 5, 6 + bob, cx - 10, 1 + bob, 1.8, 0.7, RAMPS.chrome);
        p.drawRampLimb(cx + 5, 6 + bob, cx + 10, 1 + bob, 1.8, 0.7, RAMPS.chrome);
        p.drawRampPolygon([[cx - 6, 12 + bob], [cx - 5, 5 + bob], [cx, 3 + bob], [cx + 5, 5 + bob], [cx + 6, 12 + bob]], RAMPS.iron);
        p.fillRect(cx - 5, 8 + bob, 10, 3, INK_OUTLINE);
        p.fillRect(cx - 4, 9 + bob, 8, 1, RED);
        p.fillRect(cx - 1, 9 + bob, 2, 1, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_walker': {
      // 46x46 Angular Reverse-Jointed Cyber-Norse Siege Mech-Walker (sharp AT-ST iron hydraulics!)
      s.drawPart((p) => {
        // Sharp angular iron thighs, glowing knee pistons & clawed mech feet (NO marshmallow legs!)
        p.drawRampPolygon([[cx - 11, 25], [cx - 5, 25], [cx - 12, 34 + leg], [cx - 17, 34 + leg]], RAMPS.iron);
        p.drawRampPolygon([[cx - 17, 34 + leg], [cx - 11, 34 + leg], [cx - 8, 43 + leg], [cx - 14, 43 + leg]], RAMPS.steel);
        p.drawRampPlate(cx - 17, 41 + leg, 11, 4, RAMPS.obsidian, true, false);
        p.drawRampPolygon([[cx + 5, 25], [cx + 11, 25], [cx + 17, 34 - leg], [cx + 12, 34 - leg]], RAMPS.iron);
        p.drawRampPolygon([[cx + 11, 34 - leg], [cx + 17, 34 - leg], [cx + 14, 43 - leg], [cx + 8, 43 - leg]], RAMPS.steel);
        p.drawRampPlate(cx + 6, 41 - leg, 11, 4, RAMPS.obsidian, true, false);
        p.fillRect(cx - 15, 33 + leg, 3, 2, ORANGE);
        p.fillRect(cx + 12, 33 - leg, 3, 2, ORANGE);
      });
      s.drawPart((p) => {
        // Twin heavy shoulder autocannon pods + sloped angular armored cockpit hull!
        p.drawRampPlate(cx - 20, 10 + bob, 7, 15, RAMPS.iron, true, false);
        p.drawRampPlate(cx + 13, 10 + bob, 7, 15, RAMPS.iron, true, false);
        p.fillRect(cx - 19, 24 + bob, 5, 4, ORANGE);
        p.fillRect(cx + 14, 24 + bob, 5, 4, ORANGE);
        p.drawRampPolygon(
          [
            [cx - 15, 11 + bob],
            [cx - 9, 3 + bob],
            [cx + 9, 3 + bob],
            [cx + 15, 11 + bob],
            [cx + 12, 27 + bob],
            [cx - 12, 27 + bob],
          ],
          RAMPS.steel,
        );
        // Horned brow ridge + blazing crimson visor + glowing Norse war-rune
        p.drawRampPolygon([[cx - 14, 9 + bob], [cx - 19, 3 + bob], [cx - 9, 6 + bob]], RAMPS.chrome);
        p.drawRampPolygon([[cx + 14, 9 + bob], [cx + 19, 3 + bob], [cx + 9, 6 + bob]], RAMPS.chrome);
        p.fillRect(cx - 9, 11 + bob, 18, 5, INK_OUTLINE);
        p.fillRect(cx - 7, 12 + bob, 14, 3, pulse ? RED : ORANGE);
        p.fillRect(cx - 4, 13 + bob, 8, 1, WHT);
        p.drawNorseRune(cx - 1, 19 + bob, 2, CYAN);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_turret': {
      // Armored Heavy Tripod Auto-Cannon Bunker
      s.drawPart((p) => {
        p.drawRampLimb(cx, 18, cx - 10, 27, 2.2, 1.5, RAMPS.iron);
        p.drawRampLimb(cx, 18, cx + 10, 27, 2.2, 1.5, RAMPS.iron);
        p.drawRampLimb(cx, 18, cx, 28, 2.4, 1.8, RAMPS.steel);
      });
      s.drawPart((p) => {
        p.drawRampPlate(cx - 8, 8 + bob, 16, 11, RAMPS.steel, true, false);
        // Twin heavy rotary gun barrels pointing right
        p.drawRampPlate(cx + 6, 10 + bob, 8, 3, RAMPS.iron, false, false);
        p.drawRampPlate(cx + 6, 14 + bob, 8, 3, RAMPS.iron, false, false);
        // Blazing targeting scanner lens
        p.drawGlowOrb(cx - 1, 13 + bob, 3.0, WHT, pulse ? RED : ORANGE);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_giant': {
      // 54x54 Fierce Hunched Armored Jotunn Berserker Brute (sculpted musculature, massive war-cleaver, spiked pauldrons & roaring fire-beard!)
      const stride = frame === 1 ? -2 : frame === 3 ? 2 : 0;
      // 1. Fur-wrapped iron greaves in aggressive wide battle stance (NO stubby Lego squares!)
      s.drawPart((p) => {
        p.drawRampPolygon(
          [[cx - 15, 34 + Math.min(0, stride)], [cx - 4, 34 + Math.min(0, stride)], [cx - 6, 50], [cx - 18, 50]],
          RAMPS.iron,
        );
        p.drawRampPolygon(
          [[cx + 4, 34 + Math.min(0, -stride)], [cx + 15, 34 + Math.min(0, -stride)], [cx + 18, 50], [cx + 6, 50]],
          RAMPS.iron,
        );
        // Fur boot cuffs & golden shin-plates
        p.drawRampPlate(cx - 16, 35 + Math.min(0, stride), 11, 4, RAMPS.fur, false, false);
        p.drawRampPlate(cx + 5, 35 + Math.min(0, -stride), 11, 4, RAMPS.fur, false, false);
        p.drawRampPlate(cx - 15, 41 + Math.min(0, stride), 8, 5, RAMPS.bronze, false, true);
        p.drawRampPlate(cx + 7, 41 + Math.min(0, -stride), 8, 5, RAMPS.bronze, false, true);
        // Tattered leather battle loincloth with glowing rune buckle
        p.drawRampPolygon([[cx - 6, 33 + bob], [cx + 6, 33 + bob], [cx + 4, 45 + bob], [cx - 4, 45 + bob]], RAMPS.crimson);
        p.drawRampPlate(cx - 9, 31 + bob, 18, 4, RAMPS.leather, false, false);
        p.drawRampPlate(cx - 4, 30 + bob, 8, 6, RAMPS.gold, false, true);
      });
      // 2. Sculpted V-Tapered Armored Warlord Chest + Crossed Iron Chains
      s.drawPart((p) => {
        p.drawRampPolygon(
          [
            [cx - 19, 15 + bob],
            [cx - 11, 9 + bob],
            [cx + 11, 9 + bob],
            [cx + 19, 15 + bob],
            [cx + 12, 34 + bob],
            [cx - 12, 34 + bob],
          ],
          RAMPS.obsidian,
        );
        // Crossed heavy iron war-straps + glowing forge furnace chest plate
        p.drawThickLine(cx - 14, 13 + bob, cx + 10, 31 + bob, 1.8, RAMPS.iron[4]);
        p.drawThickLine(cx + 14, 13 + bob, cx - 10, 31 + bob, 1.8, RAMPS.iron[4]);
        p.drawGlowOrb(cx, 23 + bob, 3.2, GOLD, ORANGE);
      });
      // 3. Asymmetric Spiked Pauldrons, Massive Gauntlet + Giant Jagged Iron War-Cleaver!
      s.drawPart((p) => {
        // Left colossal horned steel pauldron & spiked fist
        p.drawRampPolygon(
          [[cx - 25, 16 + bob], [cx - 19, 9 + bob], [cx - 11, 13 + bob], [cx - 13, 23 + bob], [cx - 24, 22 + bob]],
          RAMPS.steel,
        );
        p.drawRampLimb(cx - 21, 11 + bob, cx - 26, 5 + bob, 2.4, 0.7, RAMPS.chrome);
        p.drawRampLimb(cx - 18, 22 + bob, cx - 22, 34 + bob, 4.5, 4.0, RAMPS.iron);
        p.drawRampPlate(cx - 25, 32 + bob, 9, 6, RAMPS.steel, true, false);
        // Right armored arm gripping a MASSIVE notched Viking War-Cleaver!
        p.drawRampPolygon(
          [[cx + 11, 13 + bob], [cx + 19, 9 + bob], [cx + 25, 16 + bob], [cx + 23, 22 + bob], [cx + 13, 23 + bob]],
          RAMPS.steel,
        );
        p.drawRampLimb(cx + 18, 22 + bob, cx + 21, 32 + bob, 4.2, 3.8, RAMPS.iron);
        // Huge notched iron cleaver blade angled beside right flank
        p.drawRampLimb(cx + 21, 35 + bob, cx + 23, 9 + bob, 1.6, 1.5, RAMPS.wood);
        p.drawRampPolygon(
          [[cx + 21, 12 + bob], [cx + 27, 4 + bob], [cx + 26, 26 + bob], [cx + 20, 24 + bob]],
          RAMPS.chrome,
        );
        p.drawLine(cx + 26, 6 + bob, cx + 25, 25 + bob, ORANGE);
      });
      // 4. Fierce Curved-Horned War-Helm + Wild Blazing Fire-Beard!
      s.drawPart((p) => {
        p.drawFlameCluster(cx, 19 + bob, 11, 10, 310 + frame, RAMPS.fire, false);
        p.drawRampLimb(cx - 7, 9 + bob, cx - 16, 4 + bob, 2.8, 1.4, RAMPS.bone);
        p.drawRampLimb(cx - 16, 4 + bob, cx - 18, 1 + bob, 1.4, 0.6, RAMPS.bone);
        p.drawRampLimb(cx + 7, 9 + bob, cx + 16, 4 + bob, 2.8, 1.4, RAMPS.bone);
        p.drawRampLimb(cx + 16, 4 + bob, cx + 18, 1 + bob, 1.4, 0.6, RAMPS.bone);
        p.drawRampPolygon(
          [[cx - 9, 17 + bob], [cx - 8, 6 + bob], [cx, 3 + bob], [cx + 8, 6 + bob], [cx + 9, 17 + bob]],
          RAMPS.iron,
        );
        // Vertical iron noseguard + angry glowing molten eyes!
        p.fillRect(cx - 7, 10 + bob, 14, 4, INK_OUTLINE);
        p.fillRect(cx - 1, 6 + bob, 2, 10, RAMPS.chrome[4]);
        p.fillRect(cx - 5, 11 + bob, 3, 2, GOLD);
        p.fillRect(cx + 2, 11 + bob, 3, 2, GOLD);
        p.setPx(cx - 4, 11 + bob, WHT);
        p.setPx(cx + 3, 11 + bob, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_spider': {
      // 8-Legged Articulated Cyber-Arachnid with pulsing radioactive abdomen!
      s.drawPart((p) => {
        for (let i = 0; i < 4; i++) {
          const ly = 11 + i * 4;
          const wig = ((frame + i) % 2 === 0 ? 1 : -1) * 2;
          p.drawRampLimb(cx - 4, ly, cx - 11, ly - 2 + wig, 1.4, 1.0, RAMPS.iron);
          p.drawRampLimb(cx - 11, ly - 2 + wig, cx - 13, ly + 4 + wig, 1.0, 0.7, RAMPS.iron);
          p.drawRampLimb(cx + 4, ly, cx + 11, ly - 2 - wig, 1.4, 1.0, RAMPS.iron);
          p.drawRampLimb(cx + 11, ly - 2 - wig, cx + 13, ly + 4 - wig, 1.0, 0.7, RAMPS.iron);
        }
      });
      s.drawPart((p) => {
        p.drawRampEllipse(cx, 19 + bob, 7.5, 6.5, RAMPS.toxic);
        p.drawGlowOrb(cx, 18 + bob, 2.5, WHT, LIME);
        p.drawRampEllipse(cx, 10 + bob, 5.2, 4.5, RAMPS.obsidian);
        // 4 gleaming crimson spider eyes + mandibles
        p.setPx(cx - 3, 9 + bob, RED);
        p.setPx(cx - 1, 8 + bob, RED);
        p.setPx(cx + 1, 8 + bob, RED);
        p.setPx(cx + 3, 9 + bob, RED);
        p.drawLine(cx - 3, 13 + bob, cx - 4, 16 + bob, RAMPS.chrome[5]);
        p.drawLine(cx + 3, 13 + bob, cx + 4, 16 + bob, RAMPS.chrome[5]);
      });
      break;
    }

    case 'enemy_roach': {
      // Armored Rad-Cockroach with twitching antennae & glowing radioactive ribs
      s.drawPart((p) => {
        for (let i = 0; i < 3; i++) {
          const ly = 13 + i * 4;
          const wig = (frame + i) % 2 === 0 ? 2 : -2;
          p.drawLine(cx - 6, ly, cx - 12, ly + wig, RAMPS.wood[1]);
          p.drawLine(cx + 6, ly, cx + 12, ly - wig, RAMPS.wood[1]);
        }
        p.drawLine(cx - 3, 8 + bob, cx - 9, 2 + (pulse ? 0 : 2), RAMPS.fire[3]);
        p.drawLine(cx + 3, 8 + bob, cx + 9, 2 + (pulse ? 2 : 0), RAMPS.fire[3]);
        p.drawRampEllipse(cx, 17 + bob, 8.2, 7.8, RAMPS.rust);
        p.fillRect(cx - 5, 15 + bob, 10, 2, LIME);
        p.fillRect(cx - 4, 19 + bob, 8, 1, RAMPS.toxic[4]);
        p.drawRampEllipse(cx, 10 + bob, 4.8, 3.5, RAMPS.leather);
        p.setPx(cx - 2, 9 + bob, GOLD);
        p.setPx(cx + 2, 9 + bob, GOLD);
      });
      break;
    }

    case 'enemy_slime': {
      // Wobbling Bubbling Acid-Lime Bio-Slime with suspended skull inside!
      const rx = frame === 1 ? 11.5 : frame === 3 ? 8.5 : 10;
      const ry = frame === 1 ? 7.2 : frame === 3 ? 10.2 : 8.8;
      s.drawPart((p) => {
        p.drawRampEllipse(cx, 19, rx, ry, RAMPS.toxic, true);
        // Floating bleached skull visible inside translucent goo!
        p.drawRampEllipse(cx + 1, 17 + bob, 3.6, 3.2, RAMPS.bone, false);
        p.setPx(cx, 17 + bob, INK_OUTLINE);
        p.setPx(cx + 2, 17 + bob, INK_OUTLINE);
        // Glossy slime specular & dripping bubbles
        p.fillEllipse(cx - 4, 15, 2.2, 1.4, WHT);
        p.fillEllipse(cx + 6, 22, 1.8, 1.4, RAMPS.toxic[4]);
      });
      break;
    }

    case 'enemy_rat': {
      // Hunched Sewer Cyber-Rat with glowing eyes, long pink tail & scrap armor
      s.drawPart((p) => {
        p.drawRampLimb(cx - 6, 20, cx - 13, 24 + leg, 1.4, 0.7, RAMPS.crimson);
        p.drawRampEllipse(cx - 1, 18 + bob, 8, 5.5, RAMPS.fur);
        p.drawRampPlate(cx - 5, 13 + bob, 7, 5, RAMPS.steel, false, false);
        p.drawRampEllipse(cx + 6, 15 + bob, 5, 4, RAMPS.fur);
        p.drawRampEllipse(cx + 3, 10 + bob, 2.5, 2.5, RAMPS.crimson);
        p.fillRect(cx + 7, 14 + bob, 2, 2, RED);
        p.setPx(cx + 7, 14 + bob, WHT);
        p.fillRect(cx + 10, 16 + bob, 2, 2, RAMPS.crimson[4]); // nose
      });
      break;
    }

    case 'enemy_skeleton': {
      // Horned Cyber-Draugr Undead Warrior with exposed iron-ribcage & glowing cyan skull!
      s.drawPart((p) => {
        p.fillRect(cx - 4, 21 + Math.min(0, leg), 2, 7, RAMPS.bone[4]);
        p.fillRect(cx + 2, 21 + Math.min(0, -leg), 2, 7, RAMPS.bone[4]);
        p.drawRampPolygon([[cx - 6, 13 + bob], [cx + 6, 13 + bob], [cx + 4, 21 + bob], [cx - 4, 21 + bob]], RAMPS.obsidian);
        for (let r = 0; r < 3; r++) {
          p.fillRect(cx - 5, 14 + r * 2 + bob, 10, 1, RAMPS.bone[4]);
        }
      });
      s.drawPart((p) => {
        p.drawRampLimb(cx - 4, 7 + bob, cx - 9, 3 + bob, 1.5, 0.6, RAMPS.iron);
        p.drawRampLimb(cx + 4, 7 + bob, cx + 9, 3 + bob, 1.5, 0.6, RAMPS.iron);
        p.drawRampEllipse(cx, 9 + bob, 5.2, 4.8, RAMPS.bone, false);
        p.fillRect(cx - 4, 8 + bob, 3, 3, INK_OUTLINE);
        p.fillRect(cx + 1, 8 + bob, 3, 3, INK_OUTLINE);
        p.setPx(cx - 3, 9 + bob, CYAN);
        p.setPx(cx + 2, 9 + bob, CYAN);
        p.fillRect(cx - 3, 12 + bob, 6, 2, RAMPS.bone[3]);
        p.setPx(cx - 1, 12 + bob, INK_OUTLINE);
        p.setPx(cx + 1, 12 + bob, INK_OUTLINE);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_mimic': {
      // Snapping Fanged Iron-Bound Loot-Chest Monster!
      const jaw = pulse ? 3 : 1;
      s.drawPart((p) => {
        p.drawRampPlate(cx - 10, 15 + bob, 20, 11, RAMPS.wood, false, false);
        p.drawRectOutline(cx - 10, 15 + bob, 20, 11, RAMPS.gold[4]);
        // Hinged top lid snapping open!
        p.drawRampPlate(cx - 10, 7 - jaw + bob, 20, 7, RAMPS.wood, false, false);
        p.drawRectOutline(cx - 10, 7 - jaw + bob, 20, 7, RAMPS.gold[4]);
        // Gaping red maw + jagged white teeth + curling purple tongue!
        p.fillRect(cx - 9, 13 - jaw + bob, 18, 4 + jaw, RAMPS.crimson[1]);
        for (let t = -8; t <= 7; t += 3) {
          p.fillRect(cx + t, 13 - jaw + bob, 2, 3, WHT);
          p.fillRect(cx + t + 1, 15 + bob, 2, 2, RAMPS.bone[4]);
        }
        p.drawRampLimb(cx, 16 + bob, cx + 3, 21 + bob, 2.0, 1.2, RAMPS.void);
        p.fillRect(cx - 5, 9 - jaw + bob, 3, 2, GOLD);
        p.fillRect(cx + 2, 9 - jaw + bob, 3, 2, GOLD);
      });
      break;
    }

    case 'enemy_bomber': {
      // Manic Goblin Sapper sprinting with an iron Norse powder-keg bomb hoisted overhead!
      s.drawPart((p) => {
        // Sprinting goblin legs & armored loincloth
        p.drawRampLimb(cx - 3, 21, cx - 6, 27 + leg, 2.0, 1.4, RAMPS.troll);
        p.drawRampLimb(cx + 3, 21, cx + 6, 27 - leg, 2.0, 1.4, RAMPS.troll);
        p.drawRampPolygon([[cx - 6, 15 + bob], [cx + 6, 15 + bob], [cx + 4, 23 + bob], [cx - 4, 23 + bob]], RAMPS.leather);
        // Pointy-eared grinning goblin head peeking underneath!
        p.drawRampPolygon([[cx - 6, 15 + bob], [cx - 10, 13 + bob], [cx - 5, 18 + bob]], RAMPS.troll);
        p.drawRampPolygon([[cx + 6, 15 + bob], [cx + 10, 13 + bob], [cx + 5, 18 + bob]], RAMPS.troll);
        p.drawRampEllipse(cx, 16 + bob, 4.6, 3.8, RAMPS.troll, false);
        p.setPx(cx - 2, 16 + bob, GOLD);
        p.setPx(cx + 2, 16 + bob, GOLD);
        p.drawLine(cx - 2, 18 + bob, cx + 2, 18 + bob, WHT);
        // Raised green goblin arms hoisting the keg!
        p.drawRampLimb(cx - 5, 16 + bob, cx - 8, 9 + bob, 1.8, 1.4, RAMPS.troll);
        p.drawRampLimb(cx + 5, 16 + bob, cx + 8, 9 + bob, 1.8, 1.4, RAMPS.troll);
      });
      s.drawPart((p) => {
        // Huge banded crimson-iron Norse warhead keg held high!
        p.drawRampEllipse(cx, 8 + bob, 6.8, 5.2, RAMPS.obsidian, true);
        p.fillRect(cx - 6, 7 + bob, 12, 2, RAMPS.crimson[3]);
        p.drawGlowOrb(cx, 8 + bob, 2.4, WHT, pulse ? RED : GOLD);
        // Sizzling spark fuse bursting on top!
        p.drawLine(cx, 3 + bob, cx + 4, 1 + bob, RAMPS.wood[4]);
        p.drawGlowOrb(cx + 5, 2 + bob, 2.2, WHT, pulse ? GOLD : ORANGE);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_sniper': {
      // Hooded Cyber-Scout Marksman in tattered dark cloak, glowing crimson optical monocle & sleek scoped sniper rifle!
      s.drawPart((p) => {
        p.drawRampPlate(cx - 5, 22 + Math.min(0, leg), 3, 6, RAMPS.leather, false, false);
        p.drawRampPlate(cx + 2, 22 + Math.min(0, -leg), 3, 6, RAMPS.leather, false, false);
        // Sweeping dark stealth ranger poncho/cloak!
        p.drawRampPolygon(
          [[cx - 7, 12 + bob], [cx + 7, 12 + bob], [cx + 10, 23 + bob], [cx + 3, 25 + bob], [cx - 4, 23 + bob], [cx - 10, 25 + bob]],
          RAMPS.obsidian,
        );
        p.drawLine(cx - 9, 24 + bob, cx - 7, 13 + bob, RAMPS.void[3]);
        // Armored right shoulder pad
        p.drawRampPolygon([[cx - 9, 13 + bob], [cx - 4, 11 + bob], [cx - 4, 17 + bob], [cx - 9, 17 + bob]], RAMPS.steel);
      });
      s.drawPart((p) => {
        // Pointed shadow ranger hood + blazing red cyber-scope monocle!
        p.drawRampPolygon([[cx - 6, 12 + bob], [cx - 5, 5 + bob], [cx, 2 + bob], [cx + 5, 5 + bob], [cx + 6, 12 + bob]], RAMPS.obsidian);
        p.fillPolygon([[cx - 4, 6 + bob], [cx + 4, 6 + bob], [cx + 3, 11 + bob], [cx - 3, 11 + bob]], INK_OUTLINE);
        p.drawGlowOrb(cx + 1, 8 + bob, 2.0, WHT, RED);
        // Long scoped sniper rifle angled forward with glowing red laser emitter!
        p.drawRampPlate(cx - 5, 16 + bob, 19, 3, RAMPS.steel, false, false);
        p.drawRampPlate(cx, 13 + bob, 7, 3, RAMPS.iron, false, false);
        p.setPx(cx + 6, 14 + bob, RED);
        p.setPx(cx + 13, 17 + bob, RED);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_flier': {
      // Winged Cyber-Raven / Valkyrie Drone with wide flapping steel-feather wings!
      const flap = frame === 1 ? -5 : frame === 3 ? 4 : 0;
      s.drawPart((p) => {
        p.drawRampPolygon([[cx - 3, 14 + bob], [cx - 14, 7 + flap], [cx - 11, 16 + flap], [cx - 3, 18 + bob]], RAMPS.obsidian);
        p.drawRampPolygon([[cx + 3, 14 + bob], [cx + 14, 7 + flap], [cx + 11, 16 + flap], [cx + 3, 18 + bob]], RAMPS.obsidian);
        p.drawRampEllipse(cx, 15 + bob, 5.2, 6.2, RAMPS.steel);
        p.drawRampPolygon([[cx - 2, 15 + bob], [cx + 2, 15 + bob], [cx, 21 + bob]], RAMPS.gold); // sharp beak
        p.setPx(cx - 2, 12 + bob, pulse ? CYAN : RED);
        p.setPx(cx + 2, 12 + bob, pulse ? CYAN : RED);
      });
      break;
    }

    case 'enemy_cactus': {
      // Spiked Wasteland Killer Cactus with angry glowing eyes & crimson bandana!
      s.drawPart((p) => {
        p.drawRampLimb(cx, 26, cx, 7 + bob, 5.5, 4.8, RAMPS.troll);
        p.drawRampLimb(cx - 5, 17 + bob, cx - 10, 12 + bob, 2.8, 2.4, RAMPS.troll);
        p.drawRampLimb(cx + 5, 16 + bob, cx + 10, 11 + bob, 2.8, 2.4, RAMPS.troll);
        // Bandana & furious eyes
        p.fillRect(cx - 5, 9 + bob, 10, 2, RAMPS.crimson[3]);
        p.fillRect(cx - 3, 12 + bob, 2, 2, GOLD);
        p.fillRect(cx + 1, 12 + bob, 2, 2, GOLD);
        p.setPx(cx - 6, 10 + bob, WHT);
        p.setPx(cx + 6, 13 + bob, WHT);
      });
      break;
    }

    case 'enemy_mushroom': {
      // Toxic Neon-Spotted Shrooman Fiend!
      s.drawPart((p) => {
        p.drawRampPlate(cx - 4, 22 + Math.min(0, leg), 3, 6, RAMPS.bone, false, false);
        p.drawRampPlate(cx + 1, 22 + Math.min(0, -leg), 3, 6, RAMPS.bone, false, false);
        p.drawRampEllipse(cx, 19 + bob, 5.5, 5.5, RAMPS.bone, false);
        p.fillRect(cx - 3, 18 + bob, 2, 2, INK_OUTLINE);
        p.fillRect(cx + 1, 18 + bob, 2, 2, INK_OUTLINE);
        p.setPx(cx - 2, 18 + bob, LIME);
        p.setPx(cx + 2, 18 + bob, LIME);
      });
      s.drawPart((p) => {
        // Huge spotted magenta mushroom cap
        p.drawRampEllipse(cx, 11 + bob, 11, 6.5, RAMPS.void, true);
        p.fillEllipse(cx - 5, 9 + bob, 2.2, 1.8, LIME);
        p.fillEllipse(cx + 4, 10 + bob, 2.5, 1.8, LIME);
        p.fillEllipse(cx, 7 + bob, 2, 1.4, WHT);
      }, INK_OUTLINE, 1);
      break;
    }

    case 'enemy_snowman': {
      // Sinister Frost-Golem Snowman with iron bucket helm & carrot nose!
      s.drawPart((p) => {
        p.drawRampEllipse(cx, 22 + bob, 8.2, 6.2, RAMPS.ice, true);
        p.drawRampEllipse(cx, 13 + bob, 6.0, 5.2, RAMPS.ice, true);
        // Iron bucket helmet
        p.drawRampPolygon([[cx - 6, 9 + bob], [cx - 5, 3 + bob], [cx + 5, 3 + bob], [cx + 6, 9 + bob]], RAMPS.iron);
        // Glowing sinister red coal eyes & carrot nose
        p.setPx(cx - 2, 12 + bob, RED);
        p.setPx(cx + 2, 12 + bob, RED);
        p.drawLine(cx, 14 + bob, cx + 5, 14 + bob, ORANGE);
        // Twigs for arms
        p.drawLine(cx - 7, 19 + bob, cx - 12, 15 + bob, RAMPS.wood[3]);
        p.drawLine(cx + 7, 19 + bob, cx + 12, 15 + bob, RAMPS.wood[3]);
      });
      break;
    }
  }

  return s;
}

// ============================================================================
// 3. 22 CHUNKY HEAVY-METAL WEAPONS (26x14 .. 42x20) + GLEAMING GOLDEN VARIANTS
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

export interface WeaponArtBlueprint {
  key: WeaponArchetypeKey;
  w: number;
  h: number;
  originX: number;
  originY: number;
  bodyRamp: ColorRamp;
  accent: RGBA;
}

export const WEAPON_ART_BLUEPRINTS: readonly WeaponArtBlueprint[] = [
  { key: 'wep_pistol', w: 24, h: 16, originX: 6, originY: 9, bodyRamp: RAMPS.steel, accent: CYAN },
  { key: 'wep_revolver', w: 26, h: 16, originX: 6, originY: 9, bodyRamp: RAMPS.chrome, accent: GOLD },
  { key: 'wep_smg', w: 28, h: 16, originX: 7, originY: 9, bodyRamp: RAMPS.iron, accent: ORANGE },
  { key: 'wep_rifle', w: 34, h: 16, originX: 9, originY: 9, bodyRamp: RAMPS.steel, accent: LIME },
  { key: 'wep_assault', w: 34, h: 18, originX: 9, originY: 10, bodyRamp: RAMPS.iron, accent: CYAN },
  { key: 'wep_sniper', w: 42, h: 16, originX: 10, originY: 9, bodyRamp: RAMPS.obsidian, accent: RED },
  { key: 'wep_shotgun', w: 34, h: 16, originX: 9, originY: 9, bodyRamp: RAMPS.iron, accent: ORANGE },
  { key: 'wep_double_barrel', w: 32, h: 16, originX: 8, originY: 9, bodyRamp: RAMPS.steel, accent: GOLD },
  { key: 'wep_crossbow', w: 30, h: 22, originX: 8, originY: 11, bodyRamp: RAMPS.wood, accent: LIME },
  { key: 'wep_ballista', w: 36, h: 24, originX: 9, originY: 12, bodyRamp: RAMPS.bronze, accent: CYAN },
  { key: 'wep_plasma', w: 34, h: 18, originX: 9, originY: 10, bodyRamp: RAMPS.steel, accent: CYAN },
  { key: 'wep_laser', w: 36, h: 16, originX: 9, originY: 8, bodyRamp: RAMPS.chrome, accent: MAGENTA },
  { key: 'wep_railgun', w: 42, h: 18, originX: 10, originY: 9, bodyRamp: RAMPS.obsidian, accent: CYAN },
  { key: 'wep_rocket', w: 38, h: 18, originX: 10, originY: 10, bodyRamp: RAMPS.troll, accent: RED },
  { key: 'wep_grenade_launcher', w: 34, h: 18, originX: 9, originY: 10, bodyRamp: RAMPS.iron, accent: GOLD },
  { key: 'wep_minigun', w: 40, h: 20, originX: 10, originY: 10, bodyRamp: RAMPS.iron, accent: GOLD },
  { key: 'wep_dagger', w: 24, h: 14, originX: 5, originY: 7, bodyRamp: RAMPS.chrome, accent: CYAN },
  { key: 'wep_axe', w: 32, h: 22, originX: 6, originY: 11, bodyRamp: RAMPS.steel, accent: ORANGE },
  { key: 'wep_sword', w: 36, h: 16, originX: 6, originY: 8, bodyRamp: RAMPS.chrome, accent: CYAN },
  { key: 'wep_greatsword', w: 42, h: 18, originX: 7, originY: 9, bodyRamp: RAMPS.steel, accent: PURPLE },
  { key: 'wep_hammer', w: 34, h: 24, originX: 6, originY: 12, bodyRamp: RAMPS.steel, accent: CYAN },
  { key: 'wep_staff', w: 38, h: 18, originX: 7, originY: 9, bodyRamp: RAMPS.bronze, accent: LIME },
];

export function drawWeaponSpriteHQ(bp: WeaponArtBlueprint, golden: boolean): PixelSurface {
  const s = new PixelSurface(bp.w, bp.h);
  const body = golden ? RAMPS.gold : bp.bodyRamp;
  const trim = golden ? RAMPS.gold : RAMPS.chrome;
  const accent = golden ? WHT : bp.accent;
  const cy = bp.originY;

  s.drawPart((p) => {
    switch (bp.key) {
      case 'wep_pistol':
      case 'wep_revolver': {
        p.drawRampPlate(5, cy - 4, bp.w - 9, 6, body, false, false);
        p.drawRampPolygon([[5, cy + 2], [9, cy + 2], [8, cy + 6], [4, cy + 6]], RAMPS.wood);
        if (bp.key === 'wep_revolver') {
          p.drawRampPlate(9, cy - 3, 6, 5, trim, false, false);
          p.fillRect(10, cy - 1, 4, 1, INK_OUTLINE);
        }
        p.fillRect(bp.w - 6, cy - 3, 3, 2, accent);
        p.setPx(bp.w - 5, cy - 3, WHT);
        break;
      }
      case 'wep_smg': {
        p.drawRampPlate(4, cy - 4, 17, 7, body, false, false);
        p.drawRampPlate(6, cy + 3, 4, 4, RAMPS.iron, false, false);
        p.drawRampPlate(13, cy + 3, 3, 5, RAMPS.bronze, false, false); // extended curved mag
        p.drawRampPlate(21, cy - 3, 5, 3, trim, false, false);
        p.fillRect(9, cy - 2, 6, 2, accent);
        break;
      }
      case 'wep_rifle':
      case 'wep_assault': {
        p.drawRampPolygon([[2, cy - 2], [9, cy - 2], [9, cy + 4], [2, cy + 5]], RAMPS.wood);
        p.drawRampPlate(8, cy - 4, 16, 7, body, true, false);
        p.drawRampPlate(24, cy - 3, 8, 3, trim, false, false);
        p.drawRampPolygon([[15, cy + 3], [19, cy + 3], [20, cy + 7], [16, cy + 7]], RAMPS.iron);
        p.fillRect(12, cy - 6, 7, 2, accent); // glowing holo sight
        p.setPx(15, cy - 6, WHT);
        break;
      }
      case 'wep_sniper': {
        p.drawRampPolygon([[2, cy - 2], [9, cy - 2], [9, cy + 4], [2, cy + 5]], RAMPS.iron);
        p.drawRampPlate(9, cy - 4, 14, 6, body, false, false);
        p.drawRampPlate(23, cy - 3, 16, 3, trim, false, false);
        p.drawRampPlate(37, cy - 4, 3, 5, RAMPS.iron, false, false); // muzzle brake
        p.drawRampPlate(12, cy - 8, 11, 4, RAMPS.steel, false, false); // heavy scope
        p.fillRect(21, cy - 7, 2, 2, accent);
        p.setPx(22, cy - 7, WHT);
        break;
      }
      case 'wep_shotgun':
      case 'wep_double_barrel': {
        p.drawRampPolygon([[2, cy - 2], [10, cy - 2], [10, cy + 4], [2, cy + 5]], RAMPS.wood);
        p.drawRampPlate(9, cy - 4, 21, 5, body, false, false);
        p.drawRampPlate(17, cy + 1, 9, 3, RAMPS.wood, false, false); // pump grip
        if (bp.key === 'wep_double_barrel') {
          p.drawRampPlate(13, cy - 6, 17, 3, trim, false, false);
        }
        p.fillRect(11, cy - 3, 4, 2, accent);
        break;
      }
      case 'wep_crossbow':
      case 'wep_ballista': {
        p.drawRampPlate(3, cy - 3, bp.w - 9, 6, body, false, false);
        // Sweeping curved bow limbs
        p.drawRampLimb(bp.w - 9, cy, bp.w - 16, 2, 2.2, 1.2, trim);
        p.drawRampLimb(bp.w - 9, cy, bp.w - 16, bp.h - 3, 2.2, 1.2, trim);
        p.drawLine(bp.w - 16, 2, 9, cy, RAMPS.chrome[5]);
        p.drawLine(bp.w - 16, bp.h - 3, 9, cy, RAMPS.chrome[5]);
        // Blazing loaded energy bolt!
        p.fillRect(9, cy - 1, bp.w - 11, 3, accent);
        p.fillRect(bp.w - 6, cy - 1, 4, 3, WHT);
        break;
      }
      case 'wep_plasma':
      case 'wep_laser':
      case 'wep_railgun': {
        p.drawRampPlate(3, cy - 5, bp.w - 10, 10, body, true, false);
        p.drawRampPlate(7, cy + 5, 5, 4, RAMPS.iron, false, false);
        // Blazing energy core rails & split prongs
        p.fillRect(11, cy - 3, bp.w - 17, 5, accent);
        p.fillRect(12, cy - 1, bp.w - 19, 2, WHT);
        p.drawRampPlate(bp.w - 9, cy - 6, 7, 3, trim, false, false);
        p.drawRampPlate(bp.w - 9, cy + 2, 7, 3, trim, false, false);
        break;
      }
      case 'wep_rocket':
      case 'wep_grenade_launcher': {
        p.drawRampPlate(3, cy - 5, bp.w - 9, 10, body, true, false);
        p.drawRampPlate(bp.w - 8, cy - 7, 6, 14, trim, false, false); // giant flared launcher bell!
        p.drawRampPlate(8, cy + 5, 5, 4, RAMPS.iron, false, false);
        if (bp.key === 'wep_grenade_launcher') {
          p.drawRampEllipse(16, cy + 2, 5.5, 5.5, RAMPS.steel, true);
        }
        p.fillRect(11, cy - 3, 7, 3, accent);
        break;
      }
      case 'wep_minigun': {
        // Huge heavy-metal Gatling cannon (inspired by ref_04!)
        p.drawRampPlate(3, cy - 6, 15, 11, body, true, false);
        // 3 heavy rotating steel barrels + golden barrel clamp
        p.drawRampPlate(18, cy - 6, 19, 3, trim, false, false);
        p.drawRampPlate(18, cy - 2, 19, 3, RAMPS.steel, false, false);
        p.drawRampPlate(18, cy + 2, 19, 3, trim, false, false);
        p.drawRampPlate(29, cy - 7, 4, 13, RAMPS.gold, false, false);
        p.drawRampPlate(7, cy + 4, 9, 5, RAMPS.gold, false, false); // brass drum box!
        break;
      }
      case 'wep_dagger': {
        p.drawRampPlate(2, cy - 2, 5, 4, RAMPS.leather, false, false);
        p.drawRampPlate(7, cy - 4, 2, 8, RAMPS.gold, false, false);
        p.drawRampPolygon([[9, cy - 3], [22, cy], [9, cy + 3]], trim);
        p.drawLine(10, cy, 18, cy, accent);
        break;
      }
      case 'wep_axe': {
        p.drawRampPlate(2, cy - 2, 23, 4, RAMPS.wood, false, false);
        // Sweeping double-bitted heavy Norse rune battle-axe!
        p.drawRampPolygon(
          [
            [17, cy - 3],
            [22, 2],
            [29, 4],
            [27, cy],
            [29, bp.h - 5],
            [22, bp.h - 3],
            [17, cy + 3],
          ],
          body,
        );
        p.drawLine(28, 4, 26, cy, WHT);
        p.drawLine(26, cy, 28, bp.h - 5, WHT);
        p.drawNorseRune(21, cy - 2, 1, accent);
        break;
      }
      case 'wep_sword':
      case 'wep_greatsword': {
        p.drawRampPlate(2, cy - 2, 6, 4, RAMPS.leather, false, false);
        p.drawRampPlate(8, cy - 6, 3, 12, RAMPS.gold, false, false);
        const bh = bp.key === 'wep_greatsword' ? 4 : 3;
        p.drawRampPolygon(
          [
            [11, cy - bh],
            [bp.w - 6, cy - bh + 1],
            [bp.w - 2, cy],
            [bp.w - 6, cy + bh - 1],
            [11, cy + bh],
          ],
          trim,
        );
        p.fillRect(13, cy - 1, bp.w - 20, 2, accent);
        p.fillRect(14, cy, bp.w - 22, 1, WHT);
        break;
      }
      case 'wep_hammer': {
        p.drawRampPlate(2, cy - 2, 20, 4, RAMPS.wood, false, false);
        p.drawRampPlate(18, 2, 13, bp.h - 4, body, true, false);
        p.drawRectOutline(18, 2, 13, bp.h - 4, trim[4]);
        p.drawNorseRune(23, cy - 2, 0, accent);
        break;
      }
      case 'wep_staff': {
        p.drawRampPlate(2, cy - 2, 25, 4, body, false, false);
        p.drawRampEllipse(29, cy, 6, 6, RAMPS.gold);
        p.drawGlowOrb(29, cy, 4.0, WHT, accent);
        break;
      }
    }
  });

  return s;
}

export function selectWeaponArchetypeKey(
  ammoType: AmmoType,
  weaponClass: WeaponClass,
  uniqueId: number,
  golden = false,
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
// 4. BOLD COMIC-BOOK PROJECTILES, 56x56 EXPLOSIONS, CASINGS, PICKUPS & COMPANIONS
// ============================================================================

export function drawProjectileSpriteHQ(
  kind: 'bullet' | 'shell' | 'bolt' | 'energy' | 'rocket' | 'frost' | 'enemy',
): PixelSurface {
  // Bold high-contrast teardrop/fireball projectiles (inspired by ref_01 & ref_06!)
  if (kind === 'enemy') {
    const s = new PixelSurface(16, 16);
    // Unmistakable bright glowing crimson-magenta fireball with blazing white core!
    s.fillEllipse(8, 8, 6.2, 6.2, hexToRgba('#ff1e56'));
    s.fillEllipse(8, 8, 4.6, 4.6, MAGENTA);
    s.fillEllipse(8, 8, 2.8, 2.8, hexToRgba('#ffaad8'));
    s.fillEllipse(8, 8, 1.6, 1.6, WHT);
    s.applyOutline(INK_OUTLINE);
    return s;
  }

  const s = new PixelSurface(22, 14);
  const cy = 7;
  switch (kind) {
    case 'bullet': {
      // Iconic blazing golden-yellow teardrop bolt with white-hot center (ref_01!)
      s.fillPolygon([[2, cy], [11, cy - 5], [19, cy - 3], [20, cy], [19, cy + 3], [11, cy + 5]], GOLD);
      s.fillPolygon([[5, cy], [12, cy - 3], [18, cy], [12, cy + 3]], ORANGE);
      s.fillEllipse(14, cy, 4.2, 2.2, WHT);
      break;
    }
    case 'shell': {
      // Blazing buckshot flare teardrop
      s.fillEllipse(13, cy, 5.5, 4.2, GOLD);
      s.fillEllipse(14, cy, 4.0, 2.8, ORANGE);
      s.fillEllipse(15, cy, 2.4, 1.8, WHT);
      break;
    }
    case 'bolt': {
      s.fillRect(2, cy - 1, 15, 2, RAMPS.chrome[4]);
      s.fillPolygon([[1, cy - 4], [6, cy - 1], [6, cy + 1], [1, cy + 4]], LIME);
      s.fillPolygon([[15, cy - 3], [21, cy], [15, cy + 3]], WHT);
      break;
    }
    case 'energy': {
      s.fillEllipse(12, cy, 7.5, 4.8, CYAN);
      s.fillEllipse(13, cy, 5.2, 3.2, hexToRgba('#b8fcff'));
      s.fillEllipse(14, cy, 3.2, 1.8, WHT);
      break;
    }
    case 'rocket': {
      s.fillPolygon([[1, cy - 3], [6, cy], [1, cy + 3]], ORANGE);
      s.fillEllipse(4, cy, 2.2, 1.8, GOLD);
      s.drawRampPlate(6, cy - 3, 10, 6, RAMPS.steel, false, false);
      s.fillPolygon([[16, cy - 3], [21, cy], [16, cy + 3]], RED);
      s.setPx(17, cy - 1, WHT);
      break;
    }
    case 'frost': {
      s.fillPolygon([[3, cy], [11, cy - 4], [20, cy], [11, cy + 4]], CYAN);
      s.fillPolygon([[7, cy], [13, cy - 2], [19, cy], [13, cy + 2]], WHT);
      break;
    }
  }
  s.applyOutline(INK_OUTLINE);
  return s;
}

export function drawMuzzleFlashHQ(frame: number): PixelSurface {
  const s = new PixelSurface(28, 24);
  const cy = 12;
  const len = frame === 0 ? 23 : frame === 1 ? 17 : 11;
  const sp = frame === 0 ? 10 : frame === 1 ? 7 : 4;
  // Jagged blazing heavy-metal comic muzzle star!
  s.fillPolygon(
    [
      [2, cy - 3],
      [6, cy - sp],
      [11, cy - 3],
      [2 + len, cy],
      [11, cy + 3],
      [6, cy + sp],
      [2, cy + 3],
    ],
    GOLD,
  );
  s.fillPolygon(
    [
      [2, cy - 2],
      [6, cy - sp * 0.65],
      [9, cy - 2],
      [2 + len * 0.78, cy],
      [9, cy + 2],
      [6, cy + sp * 0.65],
      [2, cy + 2],
    ],
    ORANGE,
  );
  s.fillEllipse(7, cy, Math.max(2, len * 0.28), Math.max(2, sp * 0.35), WHT);
  return s;
}

export function drawExplosionFrameHQ(frame: number): PixelSurface {
  // 72x72 Native-Crisp 6-Frame Jagged Heavy-Metal Comic-Book Explosion (ZERO chunky mixels!)
  const s = new PixelSurface(72, 72);
  const cx = 36;
  const cy = 36;
  const seed = 910 + frame * 37;
  const drawStarCloud = (r: number, outer: RGBA, mid: RGBA, core: RGBA, lobes: number, spikes: boolean) => {
    if (spikes) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + frame * 0.25;
        const len = r * (1.15 + pixelHash(i, seed, 5) * 0.25);
        const wAng = 0.2;
        s.fillPolygon(
          [
            [cx + Math.cos(a - wAng) * r * 0.45, cy + Math.sin(a - wAng) * r * 0.45],
            [cx + Math.cos(a) * len, cy + Math.sin(a) * len],
            [cx + Math.cos(a + wAng) * r * 0.45, cy + Math.sin(a + wAng) * r * 0.45],
          ],
          outer,
        );
      }
    }
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + frame * 0.35;
      const dist = r * (0.45 + pixelHash(i, seed, 11) * 0.34);
      const pr = r * (0.32 + pixelHash(seed, i, 19) * 0.22);
      s.fillEllipse(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, pr, pr * 0.92, outer);
    }
    s.fillEllipse(cx, cy, r * 0.68, r * 0.68, mid);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + frame * 0.35 + 0.25;
      const dist = r * 0.34;
      const pr = r * 0.28;
      s.fillEllipse(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, pr, pr * 0.88, mid);
    }
    s.fillEllipse(cx, cy, r * 0.40, r * 0.40, core);
  };

  if (frame === 0) {
    drawStarCloud(18, ORANGE, GOLD, WHT, 7, true);
    s.applyOutline(INK_OUTLINE);
  } else if (frame === 1) {
    drawStarCloud(27, RAMPS.fire[2], ORANGE, WHT, 9, true);
    s.applyOutline(INK_OUTLINE);
  } else if (frame === 2) {
    drawStarCloud(31, RAMPS.fire[1], RAMPS.fire[3], GOLD, 10, false);
    // Scattered flying white-hot shrapnel sparks
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05 + 0.3;
      s.fillRect(Math.round(cx + Math.cos(a) * 32), Math.round(cy + Math.sin(a) * 32), 2, 2, GOLD);
    }
    s.applyOutline(INK_OUTLINE);
  } else if (frame === 3) {
    drawStarCloud(28, hexToRgba('#292030', 240), RAMPS.fire[2], ORANGE, 8, false);
    s.applyOutline(INK_OUTLINE);
  } else {
    // Dissipating comic-book dark soot smoke puffs with inner crescent highlights
    const puff: RGBA = [44, 38, 52, frame === 4 ? 210 : 125];
    const puffHi: RGBA = [78, 66, 90, frame === 4 ? 210 : 125];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.45;
      const dist = 16 + (frame - 4) * 6;
      const pr = 9 - (frame - 4) * 2.5;
      s.fillEllipse(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, pr, pr, puff, true);
      s.fillEllipse(cx + Math.cos(a) * dist - 1, cy + Math.sin(a) * dist - 1, pr * 0.5, pr * 0.5, puffHi, true);
    }
  }
  return s;
}

export function drawPickupSpriteHQ(
  kind: 'hp' | 'ammo' | 'gold' | 'xp' | 'weapon' | 'mod' | 'chest',
  frame: number,
): PixelSurface {
  const s = new PixelSurface(20, 20);
  s.drawPart((p) => {
    switch (kind) {
      case 'hp': {
        // Gleaming crimson Norse med-heart vial!
        p.drawRampEllipse(7, 8, 4.2, 4.2, RAMPS.crimson, true);
        p.drawRampEllipse(13, 8, 4.2, 4.2, RAMPS.crimson, true);
        p.drawRampPolygon([[3, 9], [17, 9], [10, 17]], RAMPS.crimson);
        p.fillRect(6, 6, 2, 2, WHT);
        break;
      }
      case 'ammo': {
        // Chunky olive-green military ammo box with bright brass belt! (ref_07!)
        p.drawRampPlate(3, 5, 14, 11, RAMPS.troll, false, false);
        p.fillRect(3, 8, 14, 2, RAMPS.gold[4]);
        for (let bx = 5; bx <= 13; bx += 2) {
          p.fillRect(bx, 11, 1, 3, GOLD);
          p.setPx(bx, 11, WHT);
        }
        break;
      }
      case 'gold': {
        // Gleaming Norse gold bullion/coin stack! (ref_01!)
        p.drawRampPlate(5, 7, 10, 9, RAMPS.gold, false, false);
        p.drawRampPlate(3, 5, 10, 9, RAMPS.gold, false, false);
        p.drawNorseRune(6, 7, 1, RAMPS.gold[1]);
        p.setPx(5, 6, WHT);
        break;
      }
      case 'xp': {
        p.drawRampPolygon([[10, 3], [16, 10], [10, 17], [4, 10]], RAMPS.cyan);
        p.fillRect(9, 7, 2, 5, WHT);
        break;
      }
      case 'weapon': {
        p.drawRampPlate(2, 6, 16, 8, RAMPS.steel, true, false);
        p.fillRect(5, 9, 10, 2, GOLD);
        p.setPx(10, 4, WHT);
        break;
      }
      case 'mod': {
        // Glowing violet/cyan Norse rune chip!
        p.drawRampPlate(3, 3, 14, 14, RAMPS.void, true, false);
        p.drawNorseRune(8, 7, 4, CYAN);
        p.setPx(5, 5, WHT);
        break;
      }
      case 'chest': {
        if (frame === 0) {
          p.drawRampPlate(2, 5, 16, 12, RAMPS.wood, false, false);
          p.drawRectOutline(2, 5, 16, 12, RAMPS.gold[4]);
          p.fillRect(2, 10, 16, 2, INK_OUTLINE);
          p.drawRampPlate(8, 8, 4, 5, RAMPS.gold, false, false);
        } else {
          p.drawRampPlate(2, 9, 16, 8, RAMPS.wood, false, false);
          p.drawRectOutline(2, 9, 16, 8, RAMPS.gold[4]);
          p.drawRampPlate(3, 3, 14, 5, RAMPS.wood, false, false);
          p.fillRect(4, 8, 12, 3, GOLD);
          p.fillRect(6, 8, 8, 1, WHT);
        }
        break;
      }
    }
  });
  return s;
}

export function drawCompanionSpriteHQ(
  kind: 'turret' | 'drill' | 'seedling' | 'whirlpool' | 'doom_ball' | 'gun_drone',
  frame: number,
): PixelSurface {
  if (kind === 'whirlpool') {
    const s = new PixelSurface(36, 36);
    const cx = 18;
    const cy = 18;
    for (let y = 0; y < 36; y++) {
      for (let x = 0; x < 36; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const d = Math.hypot(dx, dy);
        if (d > 16.5 || d < 2) continue;
        const a = Math.atan2(dy, dx) + frame * 1.1;
        const v = Math.sin(a * 4 - d * 0.55);
        if (v > 0.35) s.setPx(x, y, [145, 248, 255, 220]);
        else if (v > -0.25) s.setPx(x, y, [38, 178, 232, 165]);
      }
    }
    return s;
  }
  if (kind === 'doom_ball') {
    const s = new PixelSurface(26, 26);
    s.drawPart((p) => {
      p.drawRampEllipse(13, 13, 8, 8, RAMPS.iron, true);
      const offset = frame % 2 === 0 ? 0 : Math.PI / 4;
      for (let i = 0; i < 8; i++) {
        const a = offset + (i * Math.PI) / 4;
        p.drawRampLimb(13 + Math.cos(a) * 6, 13 + Math.sin(a) * 6, 13 + Math.cos(a) * 11, 13 + Math.sin(a) * 11, 2.0, 0.7, RAMPS.chrome);
      }
      p.drawGlowOrb(13, 13, 3.2, WHT, frame % 2 === 0 ? ORANGE : GOLD);
    });
    return s;
  }
  if (kind === 'drill') {
    const s = new PixelSurface(26, 18);
    s.drawPart((p) => {
      p.drawRampPlate(2, 4, 9, 10, RAMPS.gold, true, false);
      for (let x = 0; x < 13; x++) {
        const half = Math.max(1, Math.round(5 - x * 0.38));
        const col = (x + frame) % 3 === 0 ? CYAN : RAMPS.chrome[4];
        p.fillRect(11 + x, 9 - half, 1, half * 2, col);
      }
    });
    return s;
  }
  if (kind === 'turret') {
    const s = new PixelSurface(24, 24);
    s.drawPart((p) => {
      p.drawRampPlate(5, 14, 14, 7, RAMPS.bronze, false, false);
      p.drawRampEllipse(12, 10, 6.5, 6.5, RAMPS.steel, true);
      p.drawRampPlate(16, 8, 6, 4, RAMPS.iron, false, false);
      p.drawGlowOrb(10, 10, 2.2, WHT, frame % 2 === 0 ? GOLD : ORANGE);
    });
    return s;
  }
  if (kind === 'seedling') {
    const s = new PixelSurface(22, 22);
    const bob = frame === 1 ? -1 : 0;
    s.drawPart((p) => {
      p.drawRampEllipse(11, 14 + bob, 6, 5.5, RAMPS.emerald, true);
      p.drawRampLimb(11, 8 + bob, 6, 3 + bob, 1.5, 0.8, RAMPS.toxic);
      p.drawRampLimb(11, 8 + bob, 16, 3 + bob, 1.5, 0.8, RAMPS.toxic);
      p.fillRect(8, 12 + bob, 2, 2, GOLD);
      p.fillRect(12, 12 + bob, 2, 2, GOLD);
    });
    return s;
  }
  // gun_drone
  const s = new PixelSurface(22, 22);
  const hover = frame === 1 ? -1 : 0;
  s.drawPart((p) => {
    p.drawRampEllipse(11, 10 + hover, 6.5, 5.2, RAMPS.chrome, true);
    p.fillRect(8, 9 + hover, 6, 2, CYAN);
    p.drawRampPlate(15, 9 + hover, 5, 3, RAMPS.iron, false, false);
    p.drawGlowOrb(11, 16 + hover, 1.8, WHT, frame % 2 === 0 ? ORANGE : CYAN);
  });
  return s;
}

export function drawCasingHQ(): PixelSurface {
  // Bright gleaming golden brass shell casing (10x6) so casing showers POP like ref_01!
  const s = new PixelSurface(10, 6);
  s.fillRect(2, 1, 6, 4, RAMPS.gold[3]);
  s.fillRect(2, 1, 6, 2, RAMPS.gold[4]);
  s.fillRect(3, 1, 3, 1, RAMPS.gold[5]);
  s.fillRect(7, 1, 1, 4, RAMPS.gold[2]);
  s.applyOutline(INK_OUTLINE);
  return s;
}

export function drawGibChunkHQ(variant: number): PixelSurface {
  const s = new PixelSurface(12, 12);
  s.drawPart((p) => {
    if (variant % 2 === 0) {
      p.drawRampEllipse(6, 6, 4, 3.2, RAMPS.crimson, false);
      p.setPx(5, 5, RAMPS.bone[5]);
    } else {
      p.drawRampPolygon([[3, 4], [9, 3], [10, 8], [4, 9]], RAMPS.iron);
    }
  });
  return s;
}

export function drawFrostCrystalHQ(frame: number): PixelSurface {
  const s = new PixelSurface(28, 36);
  const cx = 14;
  const hover = frame === 1 ? -2 : frame === 3 ? 2 : 0;
  s.drawPart((p) => {
    p.drawRampPolygon(
      [
        [cx, 3 + hover],
        [cx + 8, 12 + hover],
        [cx + 7, 24 + hover],
        [cx, 32 + hover],
        [cx - 7, 24 + hover],
        [cx - 8, 12 + hover],
      ],
      RAMPS.ice,
    );
    p.drawLine(cx, 5 + hover, cx, 30 + hover, WHT);
    p.drawNorseRune(cx - 1, 15 + hover, 0, WHT);
  });
  return s;
}
