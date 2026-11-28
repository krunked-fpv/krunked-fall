// ============================================================================
// KRUNKEDFALL — Colossal Mechanical Norse Bosses (100..116px),
//                Monumental Hub Landmarks & 320x180 Pixel-Art Title Panorama
// ============================================================================
// Multi-layer sculpted heavy-metal pixel art with per-component ink contours,
// hue-shifted 6-stop material ramps, Bayer dithering, Norse scrollwork,
// blazing animated flames/cores/wings, and dramatic Phase 2 transformations.

import {
  INK_OUTLINE,
  PixelSurface,
  RAMPS,
  hexToRgba,
  pixelHash,
  sampleRamp,
  valueNoise2D,
  type ColorRamp,
  type RGBA,
} from './pixelArtGen';

const WHT: RGBA = [255, 255, 255, 255];
const CYAN: RGBA = [72, 240, 255, 255];
const MAGENTA: RGBA = [255, 52, 168, 255];
const LIME: RGBA = [166, 255, 62, 255];
const GOLD: RGBA = [255, 214, 68, 255];
const ORANGE: RGBA = [255, 118, 32, 255];
const RED: RGBA = [255, 42, 68, 255];
const PURPLE: RGBA = [208, 108, 255, 255];

export type BossKind = 'fenrir' | 'skadi' | 'loki_body' | 'hel' | 'surtur' | 'krunked';

// ============================================================================
// 1. ALL 6 TWO-PHASE COLOSSAL MECHANICAL NORSE BOSSES (100x104 .. 116x116)
// ============================================================================

export function drawBossFrameHQ(kind: BossKind, phase2: boolean, frame: number): PixelSurface {
  const isMassive = kind === 'fenrir' || kind === 'surtur' || kind === 'krunked';
  const w = isMassive ? 116 : 104;
  const h = isMassive ? 112 : 104;
  const s = new PixelSurface(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2) + 2;
  const pulse = frame === 1 || frame === 3 ? 1 : 0;
  const bob = frame === 1 ? -2 : frame === 3 ? 2 : 0;
  const jawOpen = frame === 1 || frame === 2 ? 4 : 0;
  const sway = frame === 1 ? -3 : frame === 3 ? 3 : 0;

  if (kind === 'fenrir') {
    // ------------------------------------------------------------------------
    // IRRADIATED FENRIR -> MELTDOWN FENRIR (116x112 Colossal Cyber-Wolf Titan)
    // ------------------------------------------------------------------------
    const furRamp: ColorRamp = phase2 ? RAMPS.hellPlate : RAMPS.wolfSlate;
    const plateRamp: ColorRamp = phase2 ? RAMPS.rust : RAMPS.steel;
    const coreRamp: ColorRamp = phase2 ? RAMPS.fire : RAMPS.toxic;
    const coreCol = phase2 ? (pulse ? GOLD : ORANGE) : pulse ? LIME : RAMPS.emerald[4];
    const coreHot = phase2 ? MAGENTA : LIME;

    // 1. Coiled barbed cyber-tail whipping behind right flank
    s.drawPart((p) => {
      p.drawRampLimb(cx + 26, cy + 16 + bob, cx + 44, cy + 2 + bob - pulse * 3, 4.5, 3.0, plateRamp);
      p.drawRampLimb(cx + 44, cy + 2 + bob - pulse * 3, cx + 50, cy - 12 + bob, 3.0, 1.8, plateRamp);
      p.drawGlowOrb(cx + 50, cy - 14 + bob, 4.2, WHT, coreCol, [coreHot[0], coreHot[1], coreHot[2], 140]);
    });

    // 2. Massive crouched rear wolf haunches & bristling dorsal hackle spikes!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 38, cy + 24],
          [cx - 32, cy - 2 + bob],
          [cx + 32, cy - 2 + bob],
          [cx + 38, cy + 24],
          [cx + 28, cy + 40],
          [cx - 28, cy + 40],
        ],
        furRamp,
      );
      for (let sp = -4; sp <= 4; sp++) {
        const sx = cx + sp * 8;
        const sh = 14 - Math.abs(sp) * 2;
        p.drawRampPolygon(
          [
            [sx - 5, cy - 4 + bob],
            [sx + (sp < 0 ? -4 : 4), cy - 8 - sh + bob - (pulse && sp % 2 === 0 ? 2 : 0)],
            [sx + 5, cy - 4 + bob],
          ],
          sp % 2 === 0 ? plateRamp : furRamp,
        );
        if (Math.abs(sp) <= 2) {
          p.fillRect(sx - 1, cy - 9 - Math.floor(sh * 0.4) + bob, 2, 4, coreCol);
        }
      }
    });

    // 3. Colossal Armored Shoulder Hull + Exposed Nuclear Ribcage Reactor!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 40, cy + 10 + bob],
          [cx - 32, cy - 14 + bob],
          [cx, cy - 20 + bob],
          [cx + 32, cy - 14 + bob],
          [cx + 40, cy + 10 + bob],
          [cx + 28, cy + 32 + bob],
          [cx - 28, cy + 32 + bob],
        ],
        plateRamp,
      );
      // Exposed glowing nuclear reactor belly behind heavy steel ribs!
      p.fillEllipse(cx, cy + 14 + bob, 21, 13, INK_OUTLINE);
      p.drawGlowOrb(cx, cy + 14 + bob, 11 + pulse * 1.5, WHT, coreCol, [coreHot[0], coreHot[1], coreHot[2], 165]);
      // Curved forged steel ribcage bars clasping over reactor
      for (let r = -3; r <= 3; r++) {
        const rx = cx + r * 6;
        p.drawRampLimb(rx, cy + 2 + bob, rx + (r < 0 ? 2 : r > 0 ? -2 : 0), cy + 25 + bob, 1.8, 1.5, RAMPS.chrome);
      }
      // Central heavy steel sternum bar + rivets
      p.drawRampPlate(cx - 20, cy + 11 + bob, 40, 5, plateRamp, true, true);
    }, INK_OUTLINE, 2);

    // 4. Giant Planted Armored Forelegs, Razor Wolf Claws & Heavy Draped Iron Shackles!
    const legOff = frame === 1 ? -2 : frame === 3 ? 2 : 0;
    s.drawPart((p) => {
      // Heavy angled armored wolf shoulders & forelegs
      p.drawRampPolygon(
        [[cx - 46, cy + 6 + bob], [cx - 24, cy + 8 + bob], [cx - 22, cy + 40 + legOff], [cx - 42, cy + 40 + legOff]],
        plateRamp,
      );
      p.drawRampPolygon(
        [[cx + 24, cy + 8 + bob], [cx + 46, cy + 6 + bob], [cx + 42, cy + 40 - legOff], [cx + 22, cy + 40 - legOff]],
        plateRamp,
      );
      // Spiked iron shoulder plates + glowing toxic exhaust vents
      p.drawRampPolygon([[cx - 47, cy + 4 + bob], [cx - 52, cy - 8 + bob], [cx - 35, cy - 2 + bob]], RAMPS.iron);
      p.drawRampPolygon([[cx + 47, cy + 4 + bob], [cx + 52, cy - 8 + bob], [cx + 35, cy - 2 + bob]], RAMPS.iron);
      p.fillRect(cx - 41, cy + 14 + bob, 5, 2, coreCol);
      p.fillRect(cx + 36, cy + 14 + bob, 5, 2, coreCol);
      // Heavy riveted gauntlet cuffs
      p.drawRampPlate(cx - 44, cy + 28 + legOff, 22, 10, RAMPS.iron, true, true);
      p.drawRampPlate(cx + 22, cy + 28 - legOff, 22, 10, RAMPS.iron, true, true);
      p.fillRect(cx - 43, cy + 31 + legOff, 20, 2, RAMPS.bronze[4]);
      p.fillRect(cx + 23, cy + 31 - legOff, 20, 2, RAMPS.bronze[4]);
      // Triple colossal razor-steel wolf claws!
      for (let c = 0; c < 3; c++) {
        p.drawRampPolygon(
          [[cx - 42 + c * 7, cy + 38 + legOff], [cx - 37 + c * 7, cy + 38 + legOff], [cx - 40 + c * 7, cy + 49 + legOff]],
          RAMPS.chrome,
        );
        p.drawRampPolygon(
          [[cx + 23 + c * 7, cy + 38 - legOff], [cx + 28 + c * 7, cy + 38 - legOff], [cx + 25 + c * 7, cy + 49 - legOff]],
          RAMPS.chrome,
        );
      }
      // Subtle broken Gleipnir iron shackle links hanging cleanly beneath wrists (NO weird side ladders!)
      for (let ch = 0; ch < 3; ch++) {
        p.drawRampEllipse(cx - 46 - ch * 2, cy + 34 + ch * 5 + sway, 3.0, 2.2, RAMPS.iron, false);
        p.drawRampEllipse(cx + 46 + ch * 2, cy + 34 + ch * 5 - sway, 3.0, 2.2, RAMPS.iron, false);
      }
    }, INK_OUTLINE, 2);

    // 5. Colossal Snarling Armored Cyber-Wolf Skull Head & Roaring Plasma Maw!
    s.drawPart((p) => {
      // Swept armored ears
      p.drawRampPolygon([[cx - 24, cy - 20 + bob], [cx - 32, cy - 46 + bob], [cx - 12, cy - 31 + bob]], plateRamp);
      p.drawRampPolygon([[cx + 24, cy - 20 + bob], [cx + 32, cy - 46 + bob], [cx + 12, cy - 31 + bob]], plateRamp);
      p.drawLine(cx - 26, cy - 40 + bob, cx - 18, cy - 27 + bob, coreCol);
      p.drawLine(cx + 26, cy - 40 + bob, cx + 18, cy - 27 + bob, coreCol);
      // Heavy riveted armored cranium
      p.drawRampPolygon(
        [
          [cx - 26, cy - 18 + bob],
          [cx - 20, cy - 35 + bob],
          [cx, cy - 39 + bob],
          [cx + 20, cy - 35 + bob],
          [cx + 26, cy - 18 + bob],
          [cx + 19, cy - 2 + bob],
          [cx - 19, cy - 2 + bob],
        ],
        plateRamp,
      );
      // Glowing carved forehead Norse rune
      p.drawNorseRune(cx - 1, cy - 33 + bob, 1, coreCol);
      p.drawNorseRune(cx - 1, cy - 34 + bob, 1, WHT);
      // Snout ridge
      p.drawRampPolygon([[cx - 16, cy - 12 + bob], [cx + 16, cy - 12 + bob], [cx + 13, cy + 2 + bob], [cx - 13, cy + 2 + bob]], furRamp);
      // Roaring incandescent plasma jaws (animated!)
      p.fillRect(cx - 14, cy - 1 + bob, 28, 7 + jawOpen, INK_OUTLINE);
      p.fillRect(cx - 11, cy + 1 + bob, 22, 4 + jawOpen, coreHot);
      p.fillRect(cx - 7, cy + 2 + bob, 14, 2 + Math.floor(jawOpen * 0.5), WHT);
      // Hinged armored lower jaw
      p.drawRampPlate(cx - 14, cy + 5 + jawOpen + bob, 28, 6, plateRamp, false, true);
      // Massive razor-sharp fangs
      for (let f = -12; f <= 10; f += 5) {
        p.drawRampPolygon([[cx + f, cy - 2 + bob], [cx + f + 3, cy - 2 + bob], [cx + f + 1, cy + 4 + bob]], RAMPS.bone);
        p.drawRampPolygon([[cx + f + 1, cy + 5 + jawOpen + bob], [cx + f + 4, cy + 5 + jawOpen + bob], [cx + f + 2, cy + 1 + jawOpen + bob]], RAMPS.bone);
      }
      // Furious slanted armored brows + blazing predator eyes
      p.drawThickLine(cx - 21, cy - 24 + bob, cx - 5, cy - 17 + bob, 1.5, INK_OUTLINE);
      p.drawThickLine(cx + 21, cy - 24 + bob, cx + 5, cy - 17 + bob, 1.5, INK_OUTLINE);
      p.fillPolygon([[cx - 19, cy - 21 + bob], [cx - 7, cy - 17 + bob], [cx - 9, cy - 13 + bob], [cx - 19, cy - 16 + bob]], coreHot);
      p.fillPolygon([[cx + 19, cy - 21 + bob], [cx + 7, cy - 17 + bob], [cx + 9, cy - 13 + bob], [cx + 19, cy - 16 + bob]], coreHot);
      p.fillRect(cx - 15, cy - 18 + bob, 5, 2, WHT);
      p.fillRect(cx + 10, cy - 18 + bob, 5, 2, WHT);
    }, INK_OUTLINE, 2);

    if (phase2) {
      // Meltdown fiery plasma exhaust & crackling overload veins!
      s.drawFlameCluster(cx - 28, cy - 8 + bob, 8, 12, 111 + frame, RAMPS.fire, true);
      s.drawFlameCluster(cx + 28, cy - 8 + bob, 8, 12, 122 + frame, RAMPS.fire, true);
      s.drawLine(cx - 32, cy - 2 + bob, cx - 16, cy + 8 + bob, GOLD);
      s.drawLine(cx + 32, cy - 2 + bob, cx + 16, cy + 8 + bob, MAGENTA);
      s.addEmissiveHalo(hexToRgba('#ff5522', 110), 1);
    }
    return s;
  }

  if (kind === 'skadi') {
    // ------------------------------------------------------------------------
    // QUEEN SKADI -> WARRIOR SKADI (104x104 Fierce Armored Glacial Valkyrie Warlord!)
    // ------------------------------------------------------------------------
    const armorRamp: ColorRamp = phase2 ? RAMPS.obsidian : RAMPS.steel;
    const frostRamp: ColorRamp = phase2 ? RAMPS.cyan : RAMPS.ice;
    const cloakRamp: ColorRamp = phase2 ? RAMPS.crimson : RAMPS.obsidian;
    const accent = phase2 ? RED : CYAN;

    // 1. Dramatic Jagged Tattered Frost-Cloak & Phase 2 Razor Ice-Blade Wings!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 24, cy - 12 + bob],
          [cx + 24, cy - 12 + bob],
          [cx + 38 + sway, cy + 34],
          [cx + 24, cy + 44],
          [cx + 12 + sway, cy + 32],
          [cx, cy + 46],
          [cx - 12 + sway, cy + 32],
          [cx - 24, cy + 44],
          [cx - 38 + sway, cy + 34],
        ],
        cloakRamp,
      );
      p.drawLine(cx - 36 + sway, cy + 32, cx - 22, cy - 10 + bob, frostRamp[5]);
      p.drawLine(cx + 36 + sway, cy + 32, cx + 22, cy - 10 + bob, frostRamp[5]);
    });

    if (phase2) {
      s.drawPart((p) => {
        // Colossal sweeping crystalline frost-feather battle wings!
        for (let f = 0; f < 5; f++) {
          const wy = cy - 18 + f * 8 + bob;
          const reach = 49 - f * 4;
          const lift = -24 + f * 7 + (pulse ? -2 : 2);
          p.drawRampPolygon(
            [[cx - 16, wy], [cx - reach, wy + lift], [cx - reach + 7, wy + lift + 7], [cx - 16, wy + 5]],
            RAMPS.ice,
          );
          p.drawRampPolygon(
            [[cx + 16, wy], [cx + reach, wy + lift], [cx + reach - 7, wy + lift + 7], [cx + 16, wy + 5]],
            RAMPS.ice,
          );
        }
      });
    } else {
      // Phase 1: Orbiting razor icicle spear-shards hovering behind shoulders
      s.drawPart((p) => {
        for (let side = -1; side <= 1; side += 2) {
          const fx = cx + side * 38;
          const fy = cy - 20 + bob + (pulse ? -3 : 3) * side;
          p.drawRampPolygon([[fx, fy - 15], [fx + 5, fy - 3], [fx, fy + 14], [fx - 5, fy - 3]], RAMPS.ice);
          p.drawLine(fx, fy - 12, fx, fy + 10, WHT);
        }
      });
    }

    // 2. Striding Armored Valkyrie Greaves, Battle Tassets & Fur-Trimmed War-Corset!
    s.drawPart((p) => {
      // Sculpted steel thigh-plates & sharp booted greaves (NO chess-pawn triangle dress!)
      p.drawRampPolygon([[cx - 16, cy + 16], [cx - 4, cy + 16], [cx - 7, cy + 45], [cx - 19, cy + 45]], armorRamp);
      p.drawRampPolygon([[cx + 4, cy + 16], [cx + 16, cy + 16], [cx + 19, cy + 45], [cx + 7, cy + 45]], armorRamp);
      // Spiked knee-guards & frozen trim
      p.drawRampPolygon([[cx - 17, cy + 28], [cx - 11, cy + 24], [cx - 5, cy + 28], [cx - 11, cy + 34]], frostRamp);
      p.drawRampPolygon([[cx + 5, cy + 28], [cx + 11, cy + 24], [cx + 17, cy + 28], [cx + 11, cy + 34]], frostRamp);
      // Narrow armored loin-banner with glowing Nordic frost rune
      p.drawRampPolygon([[cx - 7, cy + 14 + bob], [cx + 7, cy + 14 + bob], [cx + 5, cy + 40 + bob], [cx, cy + 45 + bob], [cx - 5, cy + 40 + bob]], RAMPS.obsidian);
      p.drawNorseRune(cx - 1, cy + 24 + bob, 0, CYAN);
      p.drawNorseRune(cx - 1, cy + 34 + bob, 2, frostRamp[5]);
      // Sleek V-tapered Valkyrie cuirass with beveled steel breastplate + white arctic wolf-fur collar!
      p.drawRampPolygon(
        [[cx - 20, cy - 13 + bob], [cx + 20, cy - 13 + bob], [cx + 13, cy + 14 + bob], [cx, cy + 18 + bob], [cx - 13, cy + 14 + bob]],
        armorRamp,
      );
      p.drawRampPolygon([[cx - 15, cy - 10 + bob], [cx + 15, cy - 10 + bob], [cx + 10, cy + 7 + bob], [cx - 10, cy + 7 + bob]], frostRamp);
      // Jagged white wolf-fur shoulder ruff
      for (let i = -3; i <= 3; i++) {
        p.drawRampPolygon(
          [[cx + i * 6 - 5, cy - 13 + bob], [cx + i * 6, cy - 20 + bob], [cx + i * 6 + 5, cy - 13 + bob]],
          RAMPS.ice,
        );
      }
      // Blazing Frost-Heart Core
      p.fillPolygon([[cx, cy - 8 + bob], [cx + 7, cy + 1 + bob], [cx, cy + 9 + bob], [cx - 7, cy + 1 + bob]], INK_OUTLINE);
      p.drawGlowOrb(cx, cy + 1 + bob, 4.6, WHT, accent, [accent[0], accent[1], accent[2], 155]);
    }, INK_OUTLINE, 2);

    // 3. Flared Gothic Spiked Ice Pauldrons + Colossal Jagged Frost-Halberd (P1) / Twin Scythes (P2)!
    s.drawPart((p) => {
      // Sharp angled layered Valkyrie pauldrons (NOT round snowman balls!)
      p.drawRampPolygon(
        [[cx - 32, cy - 10 + bob], [cx - 24, cy - 22 + bob], [cx - 14, cy - 13 + bob], [cx - 18, cy + 2 + bob], [cx - 30, cy + 1 + bob]],
        armorRamp,
      );
      p.drawRampPolygon([[cx - 28, cy - 16 + bob], [cx - 38, cy - 25 + bob], [cx - 22, cy - 19 + bob]], frostRamp);
      p.drawRampPolygon(
        [[cx + 32, cy - 10 + bob], [cx + 24, cy - 22 + bob], [cx + 14, cy - 13 + bob], [cx + 18, cy + 2 + bob], [cx + 30, cy + 1 + bob]],
        armorRamp,
      );
      p.drawRampPolygon([[cx + 28, cy - 16 + bob], [cx + 38, cy - 25 + bob], [cx + 22, cy - 19 + bob]], frostRamp);
      // Armored arms
      p.drawRampLimb(cx - 24, cy + 1 + bob, cx - 26, cy + 18 + bob, 4.2, 3.2, armorRamp);
      p.drawRampLimb(cx + 24, cy + 1 + bob, cx + 29, cy + 15 + bob, 4.2, 3.2, armorRamp);

      if (phase2) {
        // Dual sweeping curved crescent Frost-Scythes!
        for (let side = -1; side <= 1; side += 2) {
          p.drawRampLimb(cx + side * 26, cy + 32 + bob, cx + side * 42, cy - 24 + bob, 2.2, 1.8, RAMPS.chrome);
          p.drawRampPolygon(
            [[cx + side * 43, cy - 26 + bob], [cx + side * 14, cy - 39 + bob], [cx + side * 26, cy - 24 + bob], [cx + side * 38, cy - 16 + bob]],
            RAMPS.ice,
          );
          p.drawLine(cx + side * 42, cy - 25 + bob, cx + side * 17, cy - 37 + bob, WHT);
        }
      } else {
        // Towering Rune-Carved Glacial Battle-Halberd with sweeping crescent axe-blade + top spearpoint!
        p.drawRampLimb(cx + 32, cy - 32 + bob, cx + 27, cy + 46 + bob, 2.2, 2.0, RAMPS.iron);
        p.drawRampPolygon(
          [[cx + 32, cy - 49 + bob], [cx + 37, cy - 31 + bob], [cx + 32, cy - 25 + bob], [cx + 27, cy - 31 + bob]],
          RAMPS.ice,
        );
        // Sweeping bearded axe blade jutting outward!
        p.drawRampPolygon(
          [[cx + 33, cy - 29 + bob], [cx + 47, cy - 35 + bob], [cx + 49, cy - 14 + bob], [cx + 41, cy - 5 + bob], [cx + 31, cy - 15 + bob]],
          RAMPS.ice,
        );
        p.drawLine(cx + 46, cy - 33 + bob, cx + 48, cy - 15 + bob, WHT);
        p.drawLine(cx + 48, cy - 15 + bob, cx + 41, cy - 7 + bob, WHT);
        p.drawGlowOrb(cx + 37, cy - 21 + bob, 2.5, WHT, CYAN);
      }
    });

    // 4. Fierce Winged Valkyrie Battle-Helm, Sharp Cheek-Guards, Glowing Twin Ice-Eyes & 5-Point Glacier Crown!
    s.drawPart((p) => {
      // Sweeping jagged glacier crown spires
      p.drawRampPolygon([[cx - 12, cy - 32 + bob], [cx - 26, cy - 48 + bob], [cx - 9, cy - 38 + bob]], RAMPS.ice);
      p.drawRampPolygon([[cx + 12, cy - 32 + bob], [cx + 26, cy - 48 + bob], [cx + 9, cy - 38 + bob]], RAMPS.ice);
      p.drawRampPolygon([[cx - 6, cy - 36 + bob], [cx - 10, cy - 49 + bob], [cx - 2, cy - 38 + bob]], frostRamp);
      p.drawRampPolygon([[cx + 6, cy - 36 + bob], [cx + 10, cy - 49 + bob], [cx + 2, cy - 38 + bob]], frostRamp);
      p.drawRampPolygon([[cx - 3, cy - 37 + bob], [cx, cy - 51 + bob], [cx + 3, cy - 37 + bob]], RAMPS.ice);
      // Angular sculpted Valkyrie helm + dark visor recess + cheek blades
      p.drawRampPolygon(
        [[cx - 12, cy - 21 + bob], [cx - 11, cy - 35 + bob], [cx, cy - 39 + bob], [cx + 11, cy - 35 + bob], [cx + 12, cy - 21 + bob], [cx, cy - 14 + bob]],
        armorRamp,
      );
      p.fillPolygon([[cx - 9, cy - 28 + bob], [cx + 9, cy - 28 + bob], [cx + 6, cy - 18 + bob], [cx - 6, cy - 18 + bob]], INK_OUTLINE);
      // Vertical steel nasal bar + piercing slanted glowing Valkyrie eyes!
      p.fillRect(cx - 1, cy - 35 + bob, 2, 13, RAMPS.chrome[5]);
      p.fillPolygon([[cx - 8, cy - 26 + bob], [cx - 2, cy - 24 + bob], [cx - 3, cy - 22 + bob], [cx - 8, cy - 23 + bob]], accent);
      p.fillPolygon([[cx + 8, cy - 26 + bob], [cx + 2, cy - 24 + bob], [cx + 3, cy - 22 + bob], [cx + 8, cy - 23 + bob]], accent);
      p.setPx(cx - 5, cy - 24 + bob, WHT);
      p.setPx(cx + 5, cy - 24 + bob, WHT);
    }, INK_OUTLINE, 2);

    if (phase2) s.addEmissiveHalo(hexToRgba('#48eeff', 105), 1);
    return s;
  }

  if (kind === 'loki_body') {
    // ------------------------------------------------------------------------
    // LOKI'S BODY -> OVERDRIVE (104x104 Sinister Obsidian & Gold Cyber-Serpent Titan!)
    // ------------------------------------------------------------------------
    const hullRamp: ColorRamp = phase2 ? RAMPS.hellPlate : RAMPS.obsidian;
    const trimRamp: ColorRamp = phase2 ? RAMPS.void : RAMPS.gold;
    const veinCol = phase2 ? (pulse ? MAGENTA : CYAN) : pulse ? LIME : RAMPS.emerald[4];
    const bladeRamp: ColorRamp = phase2 ? RAMPS.void : RAMPS.toxic;

    // 1. Digitigrade Biomechanical Mech-Legs with Gilded Knee Blades (NO Lego blocks!)
    s.drawPart((p) => {
      p.drawRampLimb(cx - 14, cy + 16, cx - 22, cy + 31, 6.2, 4.8, hullRamp);
      p.drawRampLimb(cx - 22, cy + 31, cx - 16, cy + 45, 4.8, 5.5, RAMPS.iron);
      p.drawRampLimb(cx + 14, cy + 16, cx + 22, cy + 31, 6.2, 4.8, hullRamp);
      p.drawRampLimb(cx + 22, cy + 31, cx + 16, cy + 45, 4.8, 5.5, RAMPS.iron);
      // Glowing toxic piston hoses & gilded knee-spurs
      p.drawLine(cx - 16, cy + 19, cx - 20, cy + 30, veinCol);
      p.drawLine(cx + 16, cy + 19, cx + 20, cy + 30, veinCol);
      p.drawRampPolygon([[cx - 26, cy + 30], [cx - 20, cy + 24], [cx - 15, cy + 32], [cx - 20, cy + 36]], trimRamp);
      p.drawRampPolygon([[cx + 26, cy + 30], [cx + 20, cy + 24], [cx + 15, cy + 32], [cx + 20, cy + 36]], trimRamp);
      // Clawed metal mech feet
      p.drawRampPolygon([[cx - 24, cy + 46], [cx - 16, cy + 41], [cx - 8, cy + 46]], RAMPS.steel);
      p.drawRampPolygon([[cx + 8, cy + 46], [cx + 16, cy + 41], [cx + 24, cy + 46]], RAMPS.steel);
    });

    // 2. Sculpted Biomechanical Obsidian & Gold Ribbed Chassis + Toxic Core Furnace!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 28, cy - 16 + bob],
          [cx - 16, cy - 23 + bob],
          [cx + 16, cy - 23 + bob],
          [cx + 28, cy - 16 + bob],
          [cx + 19, cy + 14 + bob],
          [cx + 10, cy + 23 + bob],
          [cx - 10, cy + 23 + bob],
          [cx - 19, cy + 14 + bob],
        ],
        hullRamp,
      );
      // Gilded Asgardian chevron ribs & glowing bioluminescent veins
      for (let r = 0; r < 3; r++) {
        const ry = cy - 9 + r * 7 + bob;
        p.drawThickLine(cx - 21 + r * 2, ry - 3, cx - 7, ry + 3, 1.5, trimRamp[4]);
        p.drawThickLine(cx + 21 - r * 2, ry - 3, cx + 7, ry + 3, 1.5, trimRamp[4]);
        p.drawLine(cx - 18 + r * 2, ry - 1, cx - 8, ry + 4, veinCol);
        p.drawLine(cx + 18 - r * 2, ry - 1, cx + 8, ry + 4, veinCol);
      }
      // Blazing toxic prism reactor core in sternum
      p.fillPolygon([[cx, cy - 10 + bob], [cx + 11, cy + 1 + bob], [cx, cy + 13 + bob], [cx - 11, cy + 1 + bob]], INK_OUTLINE);
      p.drawGlowOrb(cx, cy + 1 + bob, 7.5 + pulse, WHT, veinCol, [veinCol[0], veinCol[1], veinCol[2], 165]);
      p.drawNorseRune(cx - 1, cy - 2 + bob, 4, INK_OUTLINE);
    }, INK_OUTLINE, 2);

    // 3. Twin Snarling Mechanical Serpent-Head Shoulder Mounts + Sweeping Plasma Mantis-Blades!
    s.drawPart((p) => {
      for (let side = -1; side <= 1; side += 2) {
        // Mechanical fanged serpent-head pauldron!
        const shX = cx + side * 27;
        const shY = cy - 14 + bob;
        p.drawRampPolygon(
          [[shX - side * 8, shY - 8], [shX + side * 9, shY - 12], [shX + side * 12, shY + 2], [shX - side * 4, shY + 6]],
          RAMPS.emerald,
        );
        p.drawRampPolygon([[shX + side * 6, shY - 10], [shX + side * 14, shY - 18], [shX + side * 10, shY - 4]], trimRamp);
        p.fillRect(shX + side * 4, shY - 4, 3, 3, GOLD);
        p.setPx(shX + side * 5, shY - 4, WHT);
        // Segmented biomechanical arms + colossal curved wrist plasma scythe-blades!
        p.drawRampLimb(shX + side * 2, shY + 5, cx + side * 34, cy + 12 + bob, 5.2, 4.0, hullRamp);
        p.drawRampPlate(cx + side * 30 - 4, cy + 9 + bob, 9, 7, trimRamp, true, false);
        const reach = phase2 ? 49 : 44;
        p.drawRampPolygon(
          [
            [cx + side * 34, cy + 13 + bob],
            [cx + side * reach, cy - 12 + bob + (pulse ? -3 : 2)],
            [cx + side * (reach - 4), cy + 12 + bob],
            [cx + side * 30, cy + 25 + bob],
          ],
          bladeRamp,
        );
        p.drawLine(cx + side * 34, cy + 15 + bob, cx + side * (reach - 1), cy - 10 + bob, WHT);
      }
    }, INK_OUTLINE, 2);

    // 4. Headless Gilded Collar + Flickering Holographic Horned Trickster Skull-Glitch!
    s.drawPart((p) => {
      p.drawRampPlate(cx - 14, cy - 25 + bob, 28, 7, trimRamp, true, true);
      p.fillRect(cx - 10, cy - 23 + bob, 20, 3, INK_OUTLINE);
      p.fillRect(cx - 7, cy - 22 + bob, 14, 2, veinCol);
      const gx = phase2 ? (frame === 1 ? -4 : frame === 3 ? 4 : 0) : frame === 1 ? -1 : 1;
      // Wide sweeping curved horned glitch hologram!
      p.drawRampLimb(cx - 8 + gx, cy - 33 + bob, cx - 22 + gx, cy - 41 + bob, 3.0, 1.8, bladeRamp);
      p.drawRampLimb(cx - 22 + gx, cy - 41 + bob, cx - 26 + gx, cy - 50 + bob, 1.8, 0.9, bladeRamp);
      p.drawRampLimb(cx + 8 + gx, cy - 33 + bob, cx + 22 + gx, cy - 41 + bob, 3.0, 1.8, bladeRamp);
      p.drawRampLimb(cx + 22 + gx, cy - 41 + bob, cx + 26 + gx, cy - 50 + bob, 1.8, 0.9, bladeRamp);
      p.fillPolygon(
        [[cx - 10 + gx, cy - 38 + bob], [cx + 10 + gx, cy - 38 + bob], [cx + 8 + gx, cy - 25 + bob], [cx, cy - 22 + bob], [cx - 8 + gx, cy - 25 + bob]],
        [veinCol[0], veinCol[1], veinCol[2], 220],
        true,
      );
      // Sinister laughing hologram eyes + jagged tooth grin!
      p.fillPolygon([[cx - 7 + gx, cy - 34 + bob], [cx - 2 + gx, cy - 32 + bob], [cx - 6 + gx, cy - 30 + bob]], WHT);
      p.fillPolygon([[cx + 7 + gx, cy - 34 + bob], [cx + 2 + gx, cy - 32 + bob], [cx + 6 + gx, cy - 30 + bob]], WHT);
      p.drawLine(cx - 5 + gx, cy - 26 + bob, cx + 5 + gx, cy - 26 + bob, INK_OUTLINE);
    });

    if (phase2) {
      s.fillRect(cx - 32, cy - 36 + pulse * 4, 12, 2, MAGENTA);
      s.fillRect(cx + 20, cy - 40 - pulse * 4, 12, 2, CYAN);
      s.addEmissiveHalo(hexToRgba('#ff2ea6', 110), 1);
    }
    return s;
  }

  if (kind === 'hel') {
    // ------------------------------------------------------------------------
    // HEL -> HEL SCORNED (104x104 Terrifying Reaper-Valkyrie of the Underworld!)
    // ------------------------------------------------------------------------
    const cloakRamp: ColorRamp = phase2 ? RAMPS.hellPlate : RAMPS.obsidian;
    const soul = phase2 ? (pulse ? RED : MAGENTA) : pulse ? CYAN : PURPLE;
    const soulRamp: ColorRamp = phase2 ? RAMPS.crimson : RAMPS.void;

    if (phase2) {
      // Phase 2: Towering skeletal blood-bone wings!
      s.drawPart((p) => {
        for (let wIdx = 0; wIdx < 4; wIdx++) {
          const wy = cy - 18 + wIdx * 9 + bob;
          p.drawRampLimb(cx - 14, wy, cx - 48, wy - 18 + wIdx * 6 + pulse * 2, 3.2, 1.2, RAMPS.bone);
          p.drawRampLimb(cx + 14, wy, cx + 48, wy - 18 + wIdx * 6 + pulse * 2, 3.2, 1.2, RAMPS.bone);
          p.drawLine(cx - 18, wy + 2, cx - 45, wy - 15 + wIdx * 6, RED);
          p.drawLine(cx + 18, wy + 2, cx + 45, wy - 15 + wIdx * 6, RED);
        }
      });
    }

    // 1. Dramatic Sweeping Tattered Spectral Mantle dissolving into Soulfire Wisps!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 26, cy - 14 + bob],
          [cx + 26, cy - 14 + bob],
          [cx + 38 + sway, cy + 28],
          [cx + 28, cy + 45],
          [cx + 17 + sway, cy + 31],
          [cx + 8, cy + 48],
          [cx, cy + 35],
          [cx - 8, cy + 48],
          [cx - 17 + sway, cy + 31],
          [cx - 28, cy + 45],
          [cx - 38 + sway, cy + 28],
        ],
        cloakRamp,
      );
      // Glowing ghostly soul-trim along cloak tears
      p.drawLine(cx - 36 + sway, cy + 28, cx - 28, cy + 44, soul);
      p.drawLine(cx + 36 + sway, cy + 28, cx + 28, cy + 44, soul);
      p.drawLine(cx - 8, cy + 46, cx, cy + 35, soul);
      p.drawLine(cx + 8, cy + 46, cx, cy + 35, soul);
    });

    // 2. Sculpted Asymmetric Reaper Corset (Left Dark Spiked Valkyrie Plate | Right Exposed Bone Ribcage & Spine!)
    s.drawPart((p) => {
      // High spiked dark-iron gothic collar behind neck
      p.drawRampPolygon([[cx - 22, cy - 14 + bob], [cx - 28, cy - 30 + bob], [cx - 12, cy - 22 + bob]], RAMPS.obsidian);
      p.drawRampPolygon([[cx + 22, cy - 14 + bob], [cx + 28, cy - 30 + bob], [cx + 12, cy - 22 + bob]], RAMPS.bone);
      // Left steel Valkyrie armor half
      p.drawRampPolygon(
        [[cx - 20, cy - 13 + bob], [cx, cy - 13 + bob], [cx, cy + 24 + bob], [cx - 12, cy + 21 + bob], [cx - 15, cy + 5 + bob]],
        RAMPS.steel,
      );
      // Right skeletal black void cavity + glowing soul spine + 5 curved bleached bone ribs!
      p.fillPolygon([[cx, cy - 13 + bob], [cx + 20, cy - 13 + bob], [cx + 15, cy + 22 + bob], [cx, cy + 24 + bob]], INK_OUTLINE);
      p.fillRect(cx + 1, cy - 10 + bob, 3, 30, soul);
      for (let r = 0; r < 5; r++) {
        const ry = cy - 9 + r * 6 + bob;
        const rw = 16 - (r >= 3 ? (r - 2) * 3 : 0);
        p.drawRampLimb(cx + 3, ry, cx + rw, ry + 2, 2.2, 1.4, RAMPS.bone);
      }
      // Blazing necrotic soul-core!
      p.drawGlowOrb(cx, cy + 2 + bob, 5.8, WHT, soul, [soul[0], soul[1], soul[2], 165]);
    }, INK_OUTLINE, 2);

    // 3. Colossal Diagonal Crescent Soul-Reaper Scythe + Skeletal Clawed Grip & Orbiting Runes!
    const handY = cy + 6 + (frame === 1 ? -3 : frame === 3 ? 3 : 0);
    s.drawPart((p) => {
      // Sweeping diagonal bone-and-iron scythe haft spanning across entire silhouette!
      p.drawRampLimb(cx - 32, cy + 44 + bob, cx + 36, cy - 36 + bob, 2.6, 2.2, RAMPS.bone);
      // MASSIVE razor-curved crescent spectral Soul-Scythe blade!
      p.drawRampPolygon(
        [
          [cx + 36, cy - 38 + bob],
          [cx + 14, cy - 48 + bob],
          [cx - 8, cy - 43 + bob],
          [cx + 12, cy - 38 + bob],
          [cx + 28, cy - 26 + bob],
        ],
        soulRamp,
      );
      p.drawThickLine(cx + 35, cy - 37 + bob, cx + 14, cy - 47 + bob, 1.3, WHT);
      p.drawThickLine(cx + 14, cy - 47 + bob, cx - 6, cy - 43 + bob, 1.1, soul);
      // Left armored claw + right skeletal bone claw gripping scythe & channeling soulfire!
      p.drawRampLimb(cx - 21, cy - 8 + bob, cx - 28, handY + 6, 3.8, 3.0, RAMPS.steel);
      p.drawGlowOrb(cx - 30, handY + 8, 5.0, WHT, soul, [soul[0], soul[1], soul[2], 140]);
      p.drawRampLimb(cx + 21, cy - 8 + bob, cx + 27, handY - 8, 3.4, 2.6, RAMPS.bone);
      p.drawRampEllipse(cx + 26, handY - 8, 5.2, 4.8, RAMPS.bone, false);
      // Orbiting glowing underworld runes
      p.drawNorseRune(cx - 40, cy - 10 + (pulse ? -3 : 3), 3, soul);
      p.drawNorseRune(cx + 39, cy + 14 + (pulse ? 3 : -3), 5, soul);
    }, INK_OUTLINE, 2);

    // 4. Terrifying Dual-Faced Queen's Head (Left Pale Armored Mask | Right Grinning Hollow Skull) + 5-Spire Bone Crown!
    s.drawPart((p) => {
      // Towering 5-spire jagged bone-and-obsidian crown
      p.drawRampPolygon([[cx - 13, cy - 33 + bob], [cx - 24, cy - 49 + bob], [cx - 8, cy - 36 + bob]], RAMPS.obsidian);
      p.drawRampPolygon([[cx + 13, cy - 33 + bob], [cx + 24, cy - 49 + bob], [cx + 8, cy - 36 + bob]], RAMPS.bone);
      p.drawRampPolygon([[cx - 6, cy - 36 + bob], [cx - 10, cy - 48 + bob], [cx - 2, cy - 38 + bob]], RAMPS.bone);
      p.drawRampPolygon([[cx + 6, cy - 36 + bob], [cx + 10, cy - 48 + bob], [cx + 2, cy - 38 + bob]], RAMPS.bone);
      p.drawRampPolygon([[cx - 3, cy - 37 + bob], [cx, cy - 51 + bob], [cx + 3, cy - 37 + bob]], soulRamp);
      // Dual-faced head (left cold pale steel mask, right bone skull!)
      p.drawRampPolygon(
        [[cx - 12, cy - 22 + bob], [cx - 11, cy - 35 + bob], [cx, cy - 37 + bob], [cx + 11, cy - 35 + bob], [cx + 12, cy - 22 + bob], [cx + 7, cy - 13 + bob], [cx - 7, cy - 13 + bob]],
        RAMPS.bone,
      );
      p.drawRampPolygon(
        [[cx - 12, cy - 22 + bob], [cx - 11, cy - 35 + bob], [cx, cy - 37 + bob], [cx, cy - 13 + bob], [cx - 7, cy - 13 + bob]],
        phase2 ? RAMPS.hellPlate : RAMPS.ice,
      );
      // Asymmetric eyes + jagged skull jaw teeth
      p.fillRect(cx - 9, cy - 27 + bob, 6, 3, INK_OUTLINE);
      p.fillRect(cx - 8, cy - 26 + bob, 4, 2, CYAN);
      p.setPx(cx - 6, cy - 26 + bob, WHT);
      p.fillRect(cx + 2, cy - 29 + bob, 8, 6, INK_OUTLINE);
      p.drawGlowOrb(cx + 6, cy - 26 + bob, 2.5, WHT, soul);
      for (let t = 1; t <= 8; t += 3) {
        p.fillRect(cx + t, cy - 17 + bob, 2, 4, INK_OUTLINE);
      }
    }, INK_OUTLINE, 2);

    if (phase2) s.addEmissiveHalo(hexToRgba('#ff2266', 110), 1);
    return s;
  }

  if (kind === 'surtur') {
    // ------------------------------------------------------------------------
    // SURTUR -> HATE INCARNATE (116x112 Apocalyptic Horned Muspelheim Fire-Demon Titan!)
    // ------------------------------------------------------------------------
    const rockRamp: ColorRamp = phase2 ? RAMPS.hellPlate : RAMPS.obsidian;
    const armorRamp: ColorRamp = phase2 ? RAMPS.rust : RAMPS.iron;

    if (phase2) {
      // Colossal Jagged Skeletal Dragon-Fire Wings erupting across full 116px span!
      s.drawPart((p) => {
        for (let wIdx = 0; wIdx < 4; wIdx++) {
          const wy = cy - 18 + wIdx * 9 + bob;
          p.drawRampPolygon(
            [[cx - 22, wy], [cx - 56, wy - 24 + wIdx * 8 + pulse * 3], [cx - 48, wy - 11 + wIdx * 8], [cx - 22, wy + 7]],
            RAMPS.fire,
          );
          p.drawRampPolygon(
            [[cx + 22, wy], [cx + 56, wy - 24 + wIdx * 8 + pulse * 3], [cx + 48, wy - 11 + wIdx * 8], [cx + 22, wy + 7]],
            RAMPS.fire,
          );
        }
      });
    }

    // 1. Wide Stanced Craggy Basalt Legs with Molten Magma Veins & Spiked Iron Greaves!
    s.drawPart((p) => {
      p.drawRampPolygon([[cx - 27, cy + 16], [cx - 7, cy + 18], [cx - 11, cy + 49], [cx - 34, cy + 49]], rockRamp);
      p.drawRampPolygon([[cx + 7, cy + 18], [cx + 27, cy + 16], [cx + 34, cy + 49], [cx + 11, cy + 49]], rockRamp);
      // Glowing jagged magma cracks & forged bronze knee-plates
      p.drawThickLine(cx - 20, cy + 20, cx - 23, cy + 44, 1.5, ORANGE);
      p.drawThickLine(cx + 20, cy + 20, cx + 23, cy + 44, 1.5, ORANGE);
      p.drawRampPolygon([[cx - 28, cy + 32], [cx - 19, cy + 26], [cx - 10, cy + 32], [cx - 19, cy + 38]], armorRamp);
      p.drawRampPolygon([[cx + 10, cy + 32], [cx + 19, cy + 26], [cx + 28, cy + 32], [cx + 19, cy + 38]], armorRamp);
      // Hanging charred leather & iron war-tabard between legs
      p.drawRampPolygon([[cx - 10, cy + 18 + bob], [cx + 10, cy + 18 + bob], [cx + 6, cy + 42 + bob], [cx, cy + 47 + bob], [cx - 6, cy + 42 + bob]], RAMPS.crimson);
      p.drawNorseRune(cx - 1, cy + 28 + bob, 1, GOLD);
    });

    // 2. Gargantuan Broad-Shouldered Muscular Volcanic Torso Cracked Open with Molten Furnace Ribs!
    s.drawPart((p) => {
      p.drawRampPolygon(
        [
          [cx - 38, cy - 15 + bob],
          [cx - 22, cy - 26 + bob],
          [cx + 22, cy - 26 + bob],
          [cx + 38, cy - 15 + bob],
          [cx + 24, cy + 22 + bob],
          [cx - 24, cy + 22 + bob],
        ],
        rockRamp,
      );
      // Cracked volcanic chest fissures blazing white-hot!
      p.drawThickLine(cx - 25, cy - 16 + bob, cx, cy + 2 + bob, 2.2, ORANGE);
      p.drawThickLine(cx + 25, cy - 16 + bob, cx, cy + 2 + bob, 2.2, ORANGE);
      p.drawThickLine(cx - 18, cy + 12 + bob, cx, cy + 2 + bob, 1.6, RED);
      p.drawThickLine(cx + 18, cy + 12 + bob, cx, cy + 2 + bob, 1.6, RED);
      p.drawThickLine(cx, cy + 2 + bob, cx, cy + 20 + bob, 2.0, GOLD);
      // Heavy iron waist belt with glowing molten rune clasp
      p.drawRampPlate(cx - 25, cy + 15 + bob, 50, 7, armorRamp, true, true);
      p.drawRampPlate(cx - 7, cy + 14 + bob, 14, 9, RAMPS.bronze, false, true);
      p.drawGlowOrb(cx, cy + 1 + bob, phase2 ? 12 : 9.5, WHT, GOLD, [255, 78, 20, 180]);
    }, INK_OUTLINE, 2);

    // 3. Massive Craggy Spiked Volcanic Pauldrons, Clawed Demon Fist & Colossal Diagonal Molten Rune Greatsword!
    s.drawPart((p) => {
      // Left hulking spiked boulder pauldron + blazing clenched magma fist!
      p.drawRampPolygon(
        [[cx - 50, cy - 4 + bob], [cx - 42, cy - 24 + bob], [cx - 21, cy - 18 + bob], [cx - 24, cy + 5 + bob], [cx - 46, cy + 8 + bob]],
        armorRamp,
      );
      p.drawRampLimb(cx - 40, cy - 20 + bob, cx - 50, cy - 31 + bob, 3.0, 0.9, RAMPS.fire);
      p.drawRampLimb(cx - 38, cy + 6 + bob, cx - 44, cy + 27 + bob, 6.5, 5.8, rockRamp);
      p.drawFlameCluster(cx - 44, cy + 26 + bob, 8, 9, 540 + frame, RAMPS.fire, true);

      // Right spiked pauldron + arm wielding COLOSSAL SERRATED MOLTEN GREATSWORD (Twilight Sword!)
      p.drawRampPolygon(
        [[cx + 50, cy - 4 + bob], [cx + 42, cy - 24 + bob], [cx + 21, cy - 18 + bob], [cx + 24, cy + 5 + bob], [cx + 46, cy + 8 + bob]],
        armorRamp,
      );
      p.drawRampLimb(cx + 40, cy - 20 + bob, cx + 50, cy - 31 + bob, 3.0, 0.9, RAMPS.fire);
      p.drawRampLimb(cx + 38, cy + 6 + bob, cx + 41, cy + 22 + bob, 6.2, 5.2, rockRamp);

      // Winged jagged iron crossguard & pommel
      p.drawRampPolygon([[cx + 28, cy + 16 + bob], [cx + 55, cy + 11 + bob], [cx + 54, cy + 17 + bob], [cx + 29, cy + 22 + bob]], RAMPS.iron);
      p.drawRampLimb(cx + 42, cy + 18 + bob, cx + 40, cy + 36 + bob, 2.8, 2.4, RAMPS.obsidian);
      p.drawGlowOrb(cx + 40, cy + 37 + bob, 3.2, GOLD, ORANGE);
      // MASSIVE serrated obsidian-and-magma blade licking with flames!
      p.drawRampPolygon(
        [
          [cx + 35, cy + 14 + bob],
          [cx + 49, cy + 12 + bob],
          [cx + 53, cy - 32 + bob],
          [cx + 45, cy - 53 + bob - pulse * 2],
          [cx + 37, cy - 32 + bob],
        ],
        RAMPS.fire,
      );
      // Dark volcanic obsidian central fuller with white-hot molten rune core!
      p.drawRampPolygon(
        [[cx + 39, cy + 12 + bob], [cx + 46, cy + 11 + bob], [cx + 48, cy - 28 + bob], [cx + 44, cy - 40 + bob], [cx + 40, cy - 28 + bob]],
        RAMPS.obsidian,
      );
      p.drawThickLine(cx + 43, cy + 8 + bob, cx + 45, cy - 36 + bob, 1.8, WHT);
      p.drawFlameCluster(cx + 47, cy - 28 + bob, 7, 12, 560 + frame, RAMPS.fire, true);
    }, INK_OUTLINE, 2);

    // 4. Colossal Curved Demon-Horns, Jagged Obsidian Skull-Helm & Roaring Asymmetrical Fire-Beard!
    s.drawPart((p) => {
      // Wild roaring fire-mane & lava beard billowing over chest!
      p.drawFlameCluster(cx, cy - 14 + bob, 22, 16, 515 + frame, RAMPS.fire, false);
      // Massive twin sweeping curved obsidian demon-horns!
      p.drawRampLimb(cx - 12, cy - 31 + bob, cx - 32, cy - 38 + bob, 5.2, 3.2, rockRamp);
      p.drawRampLimb(cx - 32, cy - 38 + bob, cx - 38, cy - 53 + bob, 3.2, 1.1, RAMPS.fire);
      p.drawRampLimb(cx + 12, cy - 31 + bob, cx + 32, cy - 38 + bob, 5.2, 3.2, rockRamp);
      p.drawRampLimb(cx + 32, cy - 38 + bob, cx + 38, cy - 53 + bob, 3.2, 1.1, RAMPS.fire);
      // Angular horned demon war-helm (NO smooth round circle head!)
      p.drawRampPolygon(
        [[cx - 15, cy - 21 + bob], [cx - 14, cy - 37 + bob], [cx, cy - 43 + bob], [cx + 14, cy - 37 + bob], [cx + 15, cy - 21 + bob], [cx + 9, cy - 14 + bob], [cx - 9, cy - 14 + bob]],
        armorRamp,
      );
      p.drawFlameCluster(cx, cy - 42 + bob, 10, 12, 529 + frame, RAMPS.fire, true);
      // Furious slanted brow ridge + blazing white-gold demon eyes + glowing furnace fangs!
      p.drawThickLine(cx - 12, cy - 33 + bob, cx - 2, cy - 29 + bob, 1.6, INK_OUTLINE);
      p.drawThickLine(cx + 12, cy - 33 + bob, cx + 2, cy - 29 + bob, 1.6, INK_OUTLINE);
      p.fillPolygon([[cx - 11, cy - 31 + bob], [cx - 3, cy - 28 + bob], [cx - 4, cy - 25 + bob], [cx - 11, cy - 27 + bob]], GOLD);
      p.fillPolygon([[cx + 11, cy - 31 + bob], [cx + 3, cy - 28 + bob], [cx + 4, cy - 25 + bob], [cx + 11, cy - 27 + bob]], GOLD);
      p.setPx(cx - 7, cy - 28 + bob, WHT);
      p.setPx(cx + 7, cy - 28 + bob, WHT);
      // Roaring magma grille maw
      p.fillRect(cx - 7, cy - 21 + bob, 14, 5, INK_OUTLINE);
      p.fillRect(cx - 5, cy - 20 + bob, 10, 3, ORANGE);
      for (let f = -5; f <= 4; f += 3) {
        p.fillRect(cx + f, cy - 21 + bob, 1, 2, WHT);
      }
    }, INK_OUTLINE, 2);

    if (phase2) s.addEmissiveHalo(hexToRgba('#ffaa22', 120), 1);
    return s;
  }

  // --------------------------------------------------------------------------
  // KRUNKED -> CORRUPTED KRUNKED (116x112 Ultimate Cyber-Allfather Dreadnought Sovereign!)
  // --------------------------------------------------------------------------
  const plateRamp: ColorRamp = phase2 ? RAMPS.obsidian : RAMPS.iron;
  const trimRamp: ColorRamp = phase2 ? RAMPS.crimson : RAMPS.gold;
  const cloakRamp: ColorRamp = phase2 ? RAMPS.void : RAMPS.crimson;
  const eyeGlow = phase2 ? (pulse ? WHT : MAGENTA) : pulse ? WHT : CYAN;
  const lanceGlow = phase2 ? MAGENTA : CYAN;

  if (phase2) {
    // Corrupted Krunked: Colossal Blazing Magenta & Cyan Energy Valkyrie Wings + Shattered Glitch Crown!
    s.drawPart((p) => {
      for (let wIdx = 0; wIdx < 4; wIdx++) {
        const wy = cy - 18 + wIdx * 10 + bob;
        const wRamp = wIdx % 2 === 0 ? RAMPS.void : RAMPS.cyan;
        p.drawRampPolygon(
          [[cx - 20, wy], [cx - 56, wy - 22 + wIdx * 7 + (pulse ? -2 : 2)], [cx - 49, wy - 10 + wIdx * 7], [cx - 20, wy + 5]],
          wRamp,
        );
        p.drawRampPolygon(
          [[cx + 20, wy], [cx + 56, wy - 22 + wIdx * 7 - (pulse ? -2 : 2)], [cx + 49, wy - 10 + wIdx * 7], [cx + 20, wy + 5]],
          wRamp,
        );
      }
      p.drawThickLine(cx - 26, cy - 48 + bob, cx - 10, cy - 53 + bob, 1.5, MAGENTA);
      p.drawThickLine(cx + 10, cy - 53 + bob, cx + 26, cy - 48 + bob, 1.5, CYAN);
    });
  }

  // 1. Billowing Royal Crimson-and-Gold Tattered Runic War-Cloak
  s.drawPart((p) => {
    p.drawRampPolygon(
      [
        [cx - 32, cy - 16 + bob],
        [cx + 32, cy - 16 + bob],
        [cx + 42 + sway, cy + 38],
        [cx + 26, cy + 50],
        [cx + 12, cy + 39],
        [cx, cy + 48],
        [cx - 12, cy + 39],
        [cx - 26, cy + 50],
        [cx - 42 + sway, cy + 38],
      ],
      cloakRamp,
    );
    p.drawThickLine(cx - 40 + sway, cy + 37, cx - 30, cy - 14 + bob, 1.6, trimRamp[4]);
    p.drawThickLine(cx + 40 + sway, cy + 37, cx + 30, cy - 14 + bob, 1.6, trimRamp[4]);
    p.drawNorseRune(cx - 30, cy + 20 + bob, 2, trimRamp[4]);
    p.drawNorseRune(cx + 26, cy + 20 + bob, 2, trimRamp[4]);
  });

  // 2. Sculpted Dreadnought Greaves, Gilded Battle-Tabard & V-Tapered Bifrost Cuirass!
  s.drawPart((p) => {
    p.drawRampPolygon([[cx - 24, cy + 20], [cx - 7, cy + 20], [cx - 9, cy + 49], [cx - 28, cy + 49]], plateRamp);
    p.drawRampPolygon([[cx + 7, cy + 20], [cx + 24, cy + 20], [cx + 28, cy + 49], [cx + 9, cy + 49]], plateRamp);
    // Pointed gilded knee-plates
    p.drawRampPolygon([[cx - 25, cy + 34], [cx - 16, cy + 29], [cx - 8, cy + 34], [cx - 16, cy + 40]], trimRamp);
    p.drawRampPolygon([[cx + 8, cy + 34], [cx + 16, cy + 29], [cx + 25, cy + 34], [cx + 16, cy + 40]], trimRamp);
    // Center royal runic tabard
    p.drawRampPolygon([[cx - 8, cy + 22 + bob], [cx + 8, cy + 22 + bob], [cx + 5, cy + 44 + bob], [cx, cy + 49 + bob], [cx - 5, cy + 44 + bob]], cloakRamp);
    p.drawNorseRune(cx - 1, cy + 31 + bob, 0, trimRamp[5]);

    // V-Tapered Sovereign Dreadnought Chestplate
    p.drawRampPolygon(
      [[cx - 29, cy - 16 + bob], [cx + 29, cy - 16 + bob], [cx + 21, cy + 22 + bob], [cx, cy + 28 + bob], [cx - 21, cy + 22 + bob]],
      plateRamp,
    );
    // Ornate golden Valknut chest harness & Bifrost reactor!
    p.drawRampPolygon([[cx - 21, cy - 12 + bob], [cx + 21, cy - 12 + bob], [cx + 15, cy + 12 + bob], [cx, cy + 18 + bob], [cx - 15, cy + 12 + bob]], trimRamp);
    p.fillPolygon([[cx, cy - 9 + bob], [cx + 11, cy + 2 + bob], [cx, cy + 13 + bob], [cx - 11, cy + 2 + bob]], INK_OUTLINE);
    p.drawGlowOrb(cx, cy + 2 + bob, phase2 ? 8.8 : 7.2, WHT, eyeGlow, [lanceGlow[0], lanceGlow[1], lanceGlow[2], 175]);
    // Riveted gilded waist belt
    p.drawRampPlate(cx - 22, cy + 16 + bob, 44, 6, trimRamp, true, true);
  }, INK_OUTLINE, 2);

  // 3. Flared Spiked Gilded Pauldrons, Fierce Armored Cyber-Ravens & Towering Gungnir Plasma Lance!
  const wingFlap = frame === 1 ? -5 : frame === 3 ? 4 : 0;
  s.drawPart((p) => {
    // Sharp angular layered Sovereign pauldrons (NO round yellow balls!)
    p.drawRampPolygon(
      [[cx - 43, cy - 8 + bob], [cx - 33, cy - 23 + bob], [cx - 19, cy - 15 + bob], [cx - 22, cy + 3 + bob], [cx - 39, cy + 4 + bob]],
      trimRamp,
    );
    p.drawRampPolygon([[cx - 38, cy - 17 + bob], [cx - 48, cy - 28 + bob], [cx - 28, cy - 20 + bob]], RAMPS.chrome);
    p.drawRampPolygon(
      [[cx + 43, cy - 8 + bob], [cx + 33, cy - 23 + bob], [cx + 19, cy - 15 + bob], [cx + 22, cy + 3 + bob], [cx + 39, cy + 4 + bob]],
      trimRamp,
    );
    p.drawRampPolygon([[cx + 38, cy - 17 + bob], [cx + 48, cy - 28 + bob], [cx + 28, cy - 20 + bob]], RAMPS.chrome);
    // Armored gauntlets
    p.drawRampLimb(cx - 32, cy + 3 + bob, cx - 35, cy + 23 + bob, 5.2, 4.4, plateRamp);
    p.drawRampLimb(cx + 32, cy + 3 + bob, cx + 38, cy + 18 + bob, 5.2, 4.4, plateRamp);

    // Twin Fierce Swooping Cyber-Ravens flanking sovereign!
    for (let side = -1; side <= 1; side += 2) {
      const rx = cx + side * 43;
      const ry = cy - 30 + bob + (side < 0 ? wingFlap * 0.4 : -wingFlap * 0.4);
      p.drawRampPolygon(
        [[rx - side * 4, ry], [rx + side * 14, ry - 12 + wingFlap], [rx + side * 12, ry - 2 + wingFlap], [rx + side * 5, ry + 5 + wingFlap]],
        RAMPS.obsidian,
      );
      p.drawLine(rx, ry - 2, rx + side * 13, ry - 11 + wingFlap, lanceGlow);
      p.drawRampPolygon([[rx - side * 5, ry - 4], [rx + side * 5, ry - 4], [rx + side * 4, ry + 5], [rx - side * 4, ry + 5]], RAMPS.steel);
      p.drawRampPolygon([[rx - side * 4, ry - 1], [rx - side * 12, ry + 2], [rx - side * 4, ry + 4]], RAMPS.gold);
      p.fillRect(rx - side * 3, ry - 2, 2, 2, lanceGlow);
    }

    // Colossal Rune-Etched Neon Gungnir Plasma Spear!
    p.drawRampLimb(cx + 39, cy - 36 + bob, cx + 36, cy + 49 + bob, 2.5, 2.2, RAMPS.chrome);
    p.drawLine(cx + 39, cy - 34 + bob, cx + 36, cy + 44 + bob, lanceGlow);
    p.drawRampPolygon([[cx + 31, cy - 35 + bob], [cx + 47, cy - 35 + bob], [cx + 43, cy - 29 + bob], [cx + 35, cy - 29 + bob]], trimRamp);
    p.drawRampPolygon(
      [[cx + 39, cy - 55 + bob], [cx + 49, cy - 36 + bob], [cx + 39, cy - 29 + bob], [cx + 29, cy - 36 + bob]],
      phase2 ? RAMPS.void : RAMPS.cyan,
    );
    p.drawThickLine(cx + 39, cy - 52 + bob, cx + 39, cy - 32 + bob, 1.3, WHT);
  }, INK_OUTLINE, 2);

  // 4. Fierce Winged Horned Allfather War-Helm, Silver-Steel Beard Plate, Eyepatch & SINGLE BLAZING CYBER-EYE!
  s.drawPart((p) => {
    // Sweeping razor gilded Valkyrie helm-wings
    p.drawRampPolygon([[cx - 14, cy - 33 + bob], [cx - 35, cy - 50 + bob], [cx - 24, cy - 41 + bob], [cx - 30, cy - 38 + bob], [cx - 12, cy - 29 + bob]], trimRamp);
    p.drawRampPolygon([[cx + 14, cy - 33 + bob], [cx + 35, cy - 50 + bob], [cx + 24, cy - 41 + bob], [cx + 30, cy - 38 + bob], [cx + 12, cy - 29 + bob]], trimRamp);
    // Braided metallic cyber-beard plates flowing below jaw!
    p.drawRampPolygon([[cx - 12, cy - 19 + bob], [cx + 12, cy - 19 + bob], [cx + 8, cy - 8 + bob], [cx, cy - 4 + bob], [cx - 8, cy - 8 + bob]], RAMPS.chrome);
    p.drawLine(cx - 4, cy - 18 + bob, cx - 3, cy - 7 + bob, INK_OUTLINE);
    p.drawLine(cx + 4, cy - 18 + bob, cx + 3, cy - 7 + bob, INK_OUTLINE);
    // Angular peaked dreadnought war-helm (NO boxy rectangle!)
    p.drawRampPolygon(
      [[cx - 15, cy - 21 + bob], [cx - 16, cy - 38 + bob], [cx, cy - 46 + bob], [cx + 16, cy - 38 + bob], [cx + 15, cy - 21 + bob], [cx, cy - 16 + bob]],
      plateRamp,
    );
    // Crown diadem + dark visor recess
    p.drawRampPolygon([[cx - 15, cy - 37 + bob], [cx, cy - 43 + bob], [cx + 15, cy - 37 + bob], [cx + 13, cy - 33 + bob], [cx, cy - 37 + bob], [cx - 13, cy - 33 + bob]], trimRamp);
    p.fillRect(cx - 12, cy - 33 + bob, 24, 11, INK_OUTLINE);
    // Left riveted dark-iron eyepatch + diagonal gilded strap
    p.drawRampPlate(cx - 11, cy - 31 + bob, 10, 7, RAMPS.steel, true, false);
    p.drawThickLine(cx - 12, cy - 33 + bob, cx - 1, cy - 23 + bob, 1.0, trimRamp[4]);
    // Right SINGLE BLAZING ALL-SEEING CYBER-EYE with horizontal lens flare!
    p.drawGlowOrb(cx + 6, cy - 27 + bob, 4.4, WHT, eyeGlow, [lanceGlow[0], lanceGlow[1], lanceGlow[2], 180]);
    p.drawLine(cx + 1, cy - 27 + bob, cx + 13, cy - 27 + bob, WHT);
  }, INK_OUTLINE, 2);

  if (phase2) {
    s.drawLine(cx - 19, cy - 9 + bob, cx - 3, cy + 12 + bob, MAGENTA);
    s.drawLine(cx + 19, cy - 6 + bob, cx + 5, cy + 15 + bob, CYAN);
    s.addEmissiveHalo(hexToRgba('#ff1e88', 115), 1);
  }
  return s;
}

// ============================================================================
// 2. MONUMENTAL HUB OUTPOST LANDMARKS & MASSIVE BIFROST RUNE AMPHITHEATER!
// ============================================================================

/**
 * Colossal 128x128 Carved Stone Bifrost Rune Amphitheater (inspired by ref_05!)
 * Sunken terraced stone pit ringed by glowing turquoise Elder Futhark runes
 * and blazing prismatic Valknut energy triangles!
 */
export function drawBifrostAmphitheaterHQ(frame: number): PixelSurface {
  const s = new PixelSurface(128, 128);
  const cx = 64;
  const cy = 64;
  const rot = frame * (Math.PI / 8);

  // 1. Massive carved circular stone rune ring (outer radius 60, inner pit radius 40)
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > 61) continue;
      const ang = Math.atan2(dy, dx);
      if (d >= 41) {
        // Outer carved Nordic stone ring slabs
        const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 16);
        const segFrac = (((ang + Math.PI) / (Math.PI * 2)) * 16) % 1;
        const isSeam = segFrac < 0.06 || d > 59.5 || d < 42.5;
        if (isSeam) {
          s.setPx(x, y, INK_OUTLINE);
        } else {
          const light = (dx * -0.4 + dy * -0.5) / 110 + 0.55 + (seg % 2 === 0 ? 0.04 : -0.04);
          s.setPx(x, y, sampleRamp(RAMPS.steel, light, x, y, 0.1));
        }
      } else if (d >= 31) {
        // Terraced sunken stone amphitheater steps!
        const stepDepth = d > 36 ? 0.42 : 0.25;
        const col = sampleRamp(RAMPS.iron, stepDepth, x, y, 0.12);
        s.setPx(x, y, col);
      } else {
        // Deep swirling prismatic Bifrost energy vortex core!
        const spiral = Math.sin(ang * 3 + d * 0.28 - rot * 2);
        const hue = (ang / (Math.PI * 2) + 1 + frame * 0.25) % 1;
        let c: RGBA;
        if (d < 9) c = WHT;
        else if (d < 16) c = spiral > 0 ? GOLD : CYAN;
        else if (hue < 0.33) c = spiral > -0.1 ? LIME : CYAN;
        else if (hue < 0.66) c = spiral > -0.1 ? GOLD : ORANGE;
        else c = spiral > -0.1 ? MAGENTA : PURPLE;
        s.setPx(x, y, c);
      }
    }
  }

  // 2. 12 Glowing Turquoise Elder Futhark Runes etched all around the outer stone ring!
  const runeGlow = frame % 2 === 0 ? hexToRgba('#45ffd8') : CYAN;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = Math.round(cx + Math.cos(a) * 51) - 1;
    const ry = Math.round(cy + Math.sin(a) * 51) - 2;
    s.drawNorseRune(rx, ry, i, runeGlow);
  }

  // 3. Blazing Prismatic Valknut Triangles (Top Green, Bottom-Left Cyan, Bottom-Right Magenta!)
  const drawHoloTri = (tx: number, ty: number, r: number, outer: RGBA) => {
    const p1: [number, number] = [tx, ty - r];
    const p2: [number, number] = [tx - r * 0.92, ty + r * 0.72];
    const p3: [number, number] = [tx + r * 0.92, ty + r * 0.72];
    s.drawThickLine(p1[0], p1[1], p2[0], p2[1], 2.0, outer);
    s.drawThickLine(p2[0], p2[1], p3[0], p3[1], 2.0, outer);
    s.drawThickLine(p3[0], p3[1], p1[0], p1[1], 2.0, outer);
    s.drawLine(p1[0], p1[1], p2[0], p2[1], WHT);
    s.drawLine(p2[0], p2[1], p3[0], p3[1], WHT);
    s.drawLine(p3[0], p3[1], p1[0], p1[1], WHT);
  };
  const triPulse = frame % 2 === 0 ? 12 : 13;
  drawHoloTri(cx, cy - 34, triPulse, LIME);
  drawHoloTri(cx - 32, cy + 20, triPulse, CYAN);
  drawHoloTri(cx + 32, cy + 20, triPulse, MAGENTA);

  // Subtle concentric glowing inner ring
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    s.setPx(Math.round(cx + Math.cos(a) * 31), Math.round(cy + Math.sin(a) * 31), WHT);
  }
  return s;
}

/**
 * Compact 44x44 Bifrost Combat Room Exit Portal (swirling prismatic rune ring!)
 */
export function drawBifrostCombatPortalHQ(frame: number): PixelSurface {
  const s = new PixelSurface(44, 44);
  const cx = 22;
  const cy = 22;
  const colors: readonly RGBA[] = [CYAN, LIME, GOLD, MAGENTA, PURPLE];
  for (let y = 0; y < 44; y++) {
    for (let x = 0; x < 44; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > 20.5) continue;
      const ang = Math.atan2(dy, dx) + frame * 0.78;
      if (d > 15.5) {
        const light = (dx * -0.4 + dy * -0.5) / 36 + 0.55;
        s.setPx(x, y, sampleRamp(RAMPS.gold, light, x, y, 0.1));
      } else {
        const sp = Math.sin(ang * 3 + d * 0.45);
        const idx = Math.abs(Math.floor(d * 0.4 + frame)) % colors.length;
        s.setPx(x, y, sp > -0.25 ? colors[idx] : RAMPS.obsidian[1]);
      }
    }
  }
  s.drawGlowOrb(cx, cy, 4.5, WHT, CYAN);
  s.applyOutline(INK_OUTLINE);
  return s;
}

export type HubLandmarkKind =
  | 'loki'
  | 'jotunn'
  | 'yggdrasil'
  | 'modifiers'
  | 'weapondex'
  | 'enemydex'
  | 'challenges'
  | 'dummy';

export function drawHubLandmarkHQ(kind: HubLandmarkKind, frame: number): PixelSurface {
  const pulse = frame % 2 === 0;

  if (kind === 'loki') {
    // 48x56 Loki's Grinning Cyber-Head in Bubbling Emerald Stasis Vat!
    const s = new PixelSurface(48, 56);
    const cx = 24;
    s.drawPart((p) => {
      // Heavy riveted industrial brass/iron pedestal + cables
      p.drawRampPlate(8, 36, 32, 16, RAMPS.iron, true, false);
      p.drawRectOutline(8, 36, 32, 16, RAMPS.gold[4]);
      p.fillRect(12, 40, 8, 7, INK_OUTLINE);
      p.fillRect(13, 41, 6, 5, pulse ? LIME : RAMPS.emerald[3]);
      p.drawNorseRune(23, 41, 4, LIME);
      p.drawRampLimb(8, 44, 3, 50, 2.0, 1.5, RAMPS.emerald);
      p.drawRampLimb(40, 44, 45, 50, 2.0, 1.5, RAMPS.emerald);
    });
    s.drawPart((p) => {
      // Cylindrical glowing emerald containment tank
      p.fillRect(12, 9, 24, 26, [18, 148, 96, 232]);
      p.fillRect(15, 10, 18, 24, [32, 198, 126, 224]);
      p.fillRect(14, 11, 3, 22, [200, 255, 236, 195]); // curved specular shine
      // Rising bubbles
      p.drawGlowOrb(31, pulse ? 14 : 18, 1.4, WHT, LIME);
      p.drawGlowOrb(17, pulse ? 29 : 25, 1.2, WHT, LIME);
      // Heavy gilded top & bottom vat caps
      p.drawRampPlate(10, 5, 28, 5, RAMPS.gold, true, false);
      p.drawRampPlate(10, 34, 28, 4, RAMPS.gold, true, false);
      // Suspended Loki head with sweeping golden horns & sly grin!
      const hy = pulse ? 21 : 22;
      p.drawRampLimb(cx - 5, hy - 4, cx - 11, hy - 12, 2.0, 0.9, RAMPS.gold);
      p.drawRampLimb(cx + 5, hy - 4, cx + 11, hy - 12, 2.0, 0.9, RAMPS.gold);
      p.drawRampEllipse(cx, hy, 7.0, 7.6, RAMPS.emerald, false);
      p.fillRect(cx - 5, hy - 2, 3, 3, LIME);
      p.fillRect(cx + 2, hy - 2, 3, 3, LIME);
      p.setPx(cx - 4, hy - 2, WHT);
      p.setPx(cx + 3, hy - 2, WHT);
      p.drawLine(cx - 4, hy + 3, cx + 4, hy + 3, INK_OUTLINE);
      p.setPx(cx + 4, hy + 2, INK_OUTLINE);
    }, INK_OUTLINE, 1);
    return s;
  }

  if (kind === 'jotunn') {
    // 52x60 Jotunn-Matic 3000 Horned Retro-Cyber Outcast Clone Pod!
    const s = new PixelSurface(52, 60);
    const cx = 26;
    s.drawPart((p) => {
      // Horned arcade marquee crest
      p.drawRampLimb(10, 10, 3, 2, 2.5, 1.0, RAMPS.gold);
      p.drawRampLimb(42, 10, 49, 2, 2.5, 1.0, RAMPS.gold);
      p.drawRampPlate(8, 9, 36, 48, RAMPS.steel, true, false);
      p.drawRampPlate(12, 11, 28, 7, RAMPS.fire, false, true);
      p.fillRect(15, 14, 22, 2, RAMPS.gold[5]);
      // Glowing cyan holo-chamber CRT screen + Outcast silhouette
      p.fillRect(12, 20, 28, 22, INK_OUTLINE);
      p.fillRect(13, 21, 26, 20, pulse ? hexToRgba('#10688a') : hexToRgba('#0c5270'));
      for (let sy = 22; sy < 40; sy += 2) {
        p.fillRect(13, sy, 26, 1, [72, 240, 255, 78], true);
      }
      // Crisp glowing holographic Outcast inside chamber
      p.fillRect(cx - 3, 24, 6, 4, WHT);
      p.fillRect(cx - 5, 28, 10, 7, CYAN);
      p.fillRect(cx - 4, 35, 3, 4, RAMPS.ice[4]);
      p.fillRect(cx + 1, 35, 3, 4, RAMPS.ice[4]);
      // Retro arcade joystick & neon buttons deck
      p.drawRampPlate(10, 44, 32, 11, RAMPS.iron, true, false);
      p.fillRect(16, 46, 3, 6, RAMPS.chrome[5]);
      p.drawGlowOrb(17, 46, 2.5, WHT, MAGENTA);
      p.fillRect(25, 48, 4, 4, LIME);
      p.fillRect(31, 48, 4, 4, GOLD);
      p.fillRect(37, 48, 3, 4, CYAN);
    });
    return s;
  }

  if (kind === 'yggdrasil') {
    // 70x76 Monumental Glowing Yggdrasil Cyber-Tree Shrine!
    const s = new PixelSurface(70, 76);
    const cx = 35;
    s.drawPart((p) => {
      // Carved stone runic octagonal sanctuary planter basin
      p.drawRampPolygon([[12, 56], [58, 56], [62, 70], [8, 70]], RAMPS.steel);
      p.drawRampPlate(14, 54, 42, 6, RAMPS.iron, true, true);
      p.drawNorseRune(19, 61, 0, GOLD);
      p.drawNorseRune(48, 61, 3, GOLD);
      p.fillRect(28, 60, 14, 7, INK_OUTLINE);
      p.fillRect(29, 61, 12, 5, pulse ? RAMPS.emerald[4] : RAMPS.emerald[3]);
    });
    s.drawPart((p) => {
      // Braided metallic bronze trunk + glowing neon-emerald circuit roots!
      p.drawRampPolygon([[cx - 9, 55], [cx - 5, 28], [cx + 5, 28], [cx + 9, 55]], RAMPS.bronze);
      p.drawThickLine(cx - 2, 53, cx - 2, 29, 1.0, RAMPS.emerald[4]);
      p.drawThickLine(cx + 2, 53, cx + 2, 29, 1.0, LIME);
      p.drawRampLimb(cx - 4, 34, cx - 18, 22, 3.2, 1.8, RAMPS.bronze);
      p.drawRampLimb(cx + 4, 34, cx + 18, 22, 3.2, 1.8, RAMPS.bronze);
    });
    s.drawPart((p) => {
      // Lush multi-tiered glowing cyber-foliage canopy + golden skill-node orbs!
      p.drawRampEllipse(cx, 24, 27, 17, RAMPS.emerald, false);
      p.drawRampEllipse(cx - 15, 22, 13, 11, RAMPS.emerald, false);
      p.drawRampEllipse(cx + 15, 22, 13, 11, RAMPS.emerald, false);
      p.drawRampEllipse(cx, 15, 17, 11, pulse ? RAMPS.toxic : RAMPS.emerald, true);
      p.drawRampEllipse(cx - 6, 12, 8, 6, RAMPS.toxic, true);
      // Glowing golden skill-fruits & cyan data motes
      p.drawGlowOrb(cx - 16, 20, 3.0, WHT, GOLD);
      p.drawGlowOrb(cx + 15, 19, 3.0, WHT, GOLD);
      p.drawGlowOrb(cx, 10, 3.4, WHT, GOLD);
      p.drawGlowOrb(cx - 8, 28, 2.2, WHT, CYAN);
      p.drawGlowOrb(cx + 9, 27, 2.2, WHT, CYAN);
    }, INK_OUTLINE, 2);
    return s;
  }

  if (kind === 'modifiers') {
    // 44x58 Ancient Obsidian Runestone Monolith with Orbiting Violet Crystals!
    const s = new PixelSurface(44, 58);
    const cx = 22;
    s.drawPart((p) => {
      p.drawRampPlate(6, 44, 32, 11, RAMPS.iron, true, false);
      p.drawRampPolygon([[cx - 11, 45], [cx - 9, 14], [cx, 4], [cx + 9, 14], [cx + 11, 45]], RAMPS.obsidian);
      const rc = pulse ? PURPLE : MAGENTA;
      p.drawNorseRune(cx - 1, 13, 5, rc);
      p.drawNorseRune(cx - 1, 24, 1, WHT);
      p.drawNorseRune(cx - 1, 35, 3, rc);
      // Floating orbiting violet crystal shards
      const lift = pulse ? -2 : 2;
      p.drawRampPolygon([[5, 22 + lift], [8, 15 + lift], [11, 22 + lift], [8, 29 + lift]], RAMPS.void);
      p.drawRampPolygon([[33, 22 - lift], [36, 15 - lift], [39, 22 - lift], [36, 29 - lift]], RAMPS.void);
    });
    s.addEmissiveHalo(hexToRgba('#b84cff', 95), 1);
    return s;
  }

  if (kind === 'weapondex') {
    // 58x54 Timber-and-Iron Viking Gunsmith Armory Stall (inspired by ref_08 market craft!)
    const s = new PixelSurface(58, 54);
    s.drawPart((p) => {
      // Heavy timber awning & iron backing frame
      p.drawRampPlate(4, 4, 50, 8, RAMPS.rust, false, false);
      for (let rx = 6; rx < 52; rx += 6) {
        p.fillRect(rx, 4, 2, 8, RAMPS.wood[1]);
      }
      p.drawRampPlate(6, 12, 46, 38, RAMPS.iron, true, false);
      p.fillRect(8, 13, 42, 2, pulse ? CYAN : RAMPS.ice[4]);
      // Displayed heavy rifle & axe on rack
      p.fillRect(9, 17, 40, 10, INK_OUTLINE);
      p.drawRampPlate(12, 20, 6, 4, RAMPS.wood, false, false);
      p.drawRampPlate(18, 19, 17, 4, RAMPS.chrome, false, false);
      p.fillRect(35, 20, 10, 2, GOLD);
      // Lower rack + amber CRT gun scanner
      p.fillRect(9, 29, 23, 9, INK_OUTLINE);
      p.drawRampPlate(12, 32, 14, 4, RAMPS.steel, false, false);
      p.fillRect(16, 33, 7, 2, CYAN);
      p.fillRect(35, 29, 14, 11, INK_OUTLINE);
      p.fillRect(36, 30, 12, 9, pulse ? ORANGE : GOLD);
      p.fillRect(38, 33, 8, 2, WHT);
      // Wooden counter ledge
      p.drawRampPlate(4, 42, 50, 9, RAMPS.wood, false, false);
      p.fillRect(10, 44, 12, 3, GOLD);
      p.fillRect(26, 44, 8, 3, CYAN);
    });
    return s;
  }

  if (kind === 'enemydex') {
    // 52x54 Holographic Horned Crimson Skull Bestiary Console!
    const s = new PixelSurface(52, 54);
    const cx = 26;
    s.drawPart((p) => {
      p.drawRampPlate(6, 34, 40, 16, RAMPS.obsidian, true, false);
      p.fillRect(17, 34, 18, 4, RAMPS.crimson[3]);
      p.fillRect(20, 34, 12, 2, pulse ? RED : ORANGE);
      p.fillRect(10, 39, 7, 6, INK_OUTLINE);
      p.setPx(13, 41, RED);
      p.fillRect(35, 39, 7, 6, INK_OUTLINE);
      p.setPx(38, 42, GOLD);
    });
    // Translucent crimson holo-cone + hovering horned skull
    s.fillPolygon([[18, 34], [34, 34], [43, 8], [9, 8]], [255, 44, 76, pulse ? 85 : 60], true);
    const sy = pulse ? 18 : 19;
    s.drawPart((p) => {
      p.drawRampLimb(cx - 7, sy - 4, cx - 14, sy - 12, 2.2, 0.8, RAMPS.crimson);
      p.drawRampLimb(cx + 7, sy - 4, cx + 14, sy - 12, 2.2, 0.8, RAMPS.crimson);
      p.drawRampEllipse(cx, sy, 9, 8.2, RAMPS.crimson, false);
      p.fillRect(cx - 6, sy - 2, 4, 3, WHT);
      p.fillRect(cx + 2, sy - 2, 4, 3, WHT);
      p.fillRect(cx - 4, sy + 6, 8, 4, RAMPS.crimson[2]);
      p.setPx(cx - 3, sy + 7, WHT);
      p.setPx(cx, sy + 7, WHT);
      p.setPx(cx + 3, sy + 7, WHT);
    });
    s.fillRect(12, pulse ? 14 : 24, 28, 1, [255, 220, 230, 170], true);
    return s;
  }

  if (kind === 'challenges') {
    const s = new PixelSurface(48, 52);
    const cx = 24;
    s.drawPart((p) => {
      p.drawRampPlate(6, 15, 36, 33, RAMPS.wood, false, false);
      p.drawRectOutline(6, 15, 36, 33, RAMPS.gold[4]);
      p.drawRampPolygon([[cx - 7, 3], [cx + 7, 3], [cx + 4, 12], [cx - 4, 12]], RAMPS.gold);
      p.fillRect(10, 19, 12, 11, RAMPS.bone[4]);
      p.fillRect(26, 19, 12, 11, RAMPS.bone[4]);
      p.drawGlowOrb(14, 39, 3.2, WHT, GOLD);
      p.drawGlowOrb(cx, 39, 3.8, WHT, GOLD);
      p.drawGlowOrb(34, 39, 3.2, WHT, GOLD);
    });
    return s;
  }

  // training dummy (38x44)
  const s = new PixelSurface(38, 44);
  const cx = 19;
  s.drawPart((p) => {
    p.drawRampPlate(cx - 2, 20, 4, 20, RAMPS.wood, false, false);
    p.drawRampPlate(cx - 10, 38, 20, 4, RAMPS.wood, false, false);
    p.drawRampPlate(cx - 14, 18, 28, 4, RAMPS.wood, false, false);
    p.drawRampPlate(cx - 8, 14, 16, 16, RAMPS.bronze, false, false);
    p.fillRect(cx - 8, 27, 16, 3, RAMPS.iron[3]);
    p.fillEllipse(cx, 21, 5.2, 5.2, RED);
    p.fillEllipse(cx, 21, 3.2, 3.2, WHT);
    p.fillEllipse(cx, 21, 1.4, 1.4, RED);
    // Horned Viking iron helmet on top!
    p.drawRampLimb(cx - 5, 7, cx - 11, 2, 1.8, 0.7, RAMPS.bone);
    p.drawRampLimb(cx + 5, 7, cx + 11, 2, 1.8, 0.7, RAMPS.bone);
    p.drawRampEllipse(cx, 9, 6.2, 5.6, RAMPS.steel, true);
    p.setPx(cx - 2, 9, pulse ? ORANGE : GOLD);
    p.setPx(cx + 2, 9, pulse ? ORANGE : GOLD);
  });
  return s;
}

// ============================================================================
// 3. EPIC NATIVE 640x360 PIXEL-ART TITLE SCREEN PANORAMA (1:1 ZERO MIXELS!)
// ============================================================================
// Hand-crafted full-resolution 640x360 Cyber-Norse Arctic Wasteland vista
// composited directly over the live animated WebGL2 Aurora Borealis sky!
//   - Jagged layered Scandinavian alpine fjord peaks with crisp snow facets
//   - Shattered cyber-Norse Asgardian fortress spires & broken gothic arches
//   - Colossal half-buried battle-cracked Giant Horned Mech-God Helm (right!)
//   - Fierce detailed Horned Cyber-Viking Outcast on snow-crusted crag (left!)
//   - Ancient Elder Futhark rune obelisks framing the wasteland valley!

export function drawTitleVista320x180(): PixelSurface {
  const w = 640;
  const h = 360;
  const s = new PixelSurface(w, h);

  // Sharp jagged alpine triangle-ridge height helper (NO soft wavy polka dots!)
  const jaggedPeak = (x: number, peaks: readonly [number, number, number][], base: number, seed: number): number => {
    let best = base;
    for (let i = 0; i < peaks.length; i++) {
      const [px, ph, pw] = peaks[i];
      const d = Math.abs(x - px);
      if (d < pw) {
        const slope = 1 - d / pw;
        const crag = (valueNoise2D(x * 0.08, i * 3.1, seed) - 0.5) * 14 * slope;
        const y = base - ph * Math.pow(slope, 0.88) + crag;
        if (y < best) best = y;
      }
    }
    return Math.round(best);
  };

  // Layer 1: Far Jagged Arctic Fjord Mountain Range (crisp lit left facets, shadowed right slopes!)
  const farPeaks: readonly [number, number, number][] = [
    [45, 118, 120],
    [155, 96, 115],
    [250, 74, 110],
    [390, 68, 115],
    [495, 108, 125],
    [595, 126, 120],
  ];
  const farH = new Int16Array(w);
  for (let x = 0; x < w; x++) farH[x] = jaggedPeak(x, farPeaks, 258, 101);
  for (let x = 0; x < w; x++) {
    const topY = farH[x];
    const slope = x > 0 ? farH[x] - farH[x - 1] : 0;
    const isLitSlope = slope < 0; // left-facing slope catches moonlight & aurora!
    for (let y = topY; y < h; y++) {
      const d = y - topY;
      let col: RGBA;
      if (d === 0) col = isLitSlope ? hexToRgba('#7de3f2') : hexToRgba('#38748c');
      else if (d < 4 && isLitSlope) col = hexToRgba('#448ba3');
      else if (d < 22 && isLitSlope) col = (d + x) % 5 === 0 ? hexToRgba('#2b5875') : hexToRgba('#21435e');
      else if (d < 34) col = hexToRgba('#14253b');
      else col = hexToRgba('#0e192b');
      s.setPx(x, y, col);
    }
  }

  // Layer 2: Ruined Cyber-Norse Asgardian Spire Complex & Shattered Conduit Towers on Horizons!
  const drawCitadelSpire = (cx: number, baseY: number, tw: number, th: number, glowCol: RGBA, tilted = false) => {
    const x0 = cx - Math.floor(tw / 2);
    const y0 = baseY - th;
    for (let y = y0; y < baseY; y++) {
      const progress = (y - y0) / Math.max(1, th);
      const halfW = Math.round((tw * 0.5) * (0.62 + progress * 0.5));
      const skew = tilted ? Math.round((1 - progress) * 8) : 0;
      const lx = cx - halfW + skew;
      const rx = cx + halfW + skew;
      for (let x = lx; x <= rx; x++) {
        // Jagged blasted ruin crown at top
        if (y < y0 + 14 && (x - cx + 20) % 5 === 0 && y < y0 + 10) continue;
        if (y < y0 + 6 && pixelHash(x, y0, 71) > 0.55) continue;
        const isLeftLit = x <= lx + 1;
        const isRightRim = x >= rx - 1;
        const col = isLeftLit
          ? hexToRgba('#4b7a96')
          : isRightRim
            ? hexToRgba('#0c1322')
            : hexToRgba('#152136');
        s.setPx(x, y, col);
      }
    }
    // Gothic cyber-buttress horizontal bands & glowing vertical rune power slit!
    for (let by = y0 + 16; by < baseY - 14; by += 14) {
      s.fillRect(cx - Math.floor(tw * 0.45), by, Math.floor(tw * 0.9), 2, hexToRgba('#27405c'));
    }
    for (let gy = y0 + 18; gy < baseY - 22; gy += 7) {
      s.fillRect(cx - 1, gy, 3, 4, glowCol);
      s.setPx(cx, gy + 1, WHT);
    }
  };
  drawCitadelSpire(498, 268, 28, 108, CYAN, false);
  drawCitadelSpire(534, 272, 22, 76, ORANGE, true);
  drawCitadelSpire(464, 274, 18, 62, CYAN, false);
  drawCitadelSpire(142, 268, 24, 84, ORANGE, false);
  drawCitadelSpire(172, 274, 16, 52, CYAN, true);

  // Layer 3: Midground Jagged Glacier Valley Ridges!
  const midPeaks: readonly [number, number, number][] = [
    [70, 76, 130],
    [195, 52, 110],
    [455, 58, 115],
    [560, 84, 135],
  ];
  const midH = new Int16Array(w);
  for (let x = 0; x < w; x++) midH[x] = jaggedPeak(x, midPeaks, 286, 219);
  for (let x = 0; x < w; x++) {
    const topY = midH[x];
    const slope = x > 0 ? midH[x] - midH[x - 1] : 0;
    for (let y = topY; y < h; y++) {
      const d = y - topY;
      let col: RGBA;
      if (d <= 1) col = slope < 0 ? hexToRgba('#94e4f5') : hexToRgba('#447b96');
      else if (d < 7) col = slope < 0 ? hexToRgba('#2c526e') : hexToRgba('#182a42');
      else col = hexToRgba('#0d1524');
      s.setPx(x, y, col);
    }
  }

  // Layer 3-bis: COLOSSAL Half-Buried Battle-Scarred Giant Horned Mech-God Helm (Right Midground!)
  s.drawPart((p) => {
    const hx = 524;
    const hy = 276;
    // Massive ribbed sweeping broken iron horns erupting from snowdrift!
    p.drawRampLimb(hx - 26, hy - 14, hx - 54, hy - 34, 9.0, 5.2, RAMPS.steel);
    p.drawRampLimb(hx - 54, hy - 34, hx - 68, hy - 56, 5.2, 1.8, RAMPS.steel);
    p.drawRampLimb(hx + 26, hy - 14, hx + 52, hy - 32, 9.0, 5.0, RAMPS.steel);
    p.drawRampLimb(hx + 52, hy - 32, hx + 60, hy - 48, 5.0, 2.2, RAMPS.iron); // snapped right horn tip!
    // Horn ribbing segments
    for (let r = 0; r < 4; r++) {
      p.drawThickLine(hx - 32 - r * 7, hy - 22 - r * 5, hx - 28 - r * 7, hy - 14 - r * 5, 1.4, INK_OUTLINE);
      p.drawThickLine(hx + 32 + r * 6, hy - 22 - r * 4, hx + 28 + r * 6, hy - 14 - r * 4, 1.4, INK_OUTLINE);
    }
    // Colossal angular Viking war-helm dome & brow guard!
    p.drawRampPolygon(
      [
        [hx - 38, hy + 26],
        [hx - 35, hy - 18],
        [hx - 18, hy - 34],
        [hx, hy - 40],
        [hx + 18, hy - 34],
        [hx + 35, hy - 18],
        [hx + 38, hy + 26],
      ],
      RAMPS.iron,
    );
    // Heavy steel forehead crest & central nasal bar
    p.drawRampPlate(hx - 32, hy - 20, 64, 7, RAMPS.steel, true, false);
    p.drawRampPlate(hx - 4, hy - 36, 8, 38, RAMPS.steel, false, false);
    // Deep recessed visor cavity with ONE flickering crimson cyber-eye & dangling wires!
    p.fillRect(hx - 27, hy - 10, 54, 12, INK_OUTLINE);
    p.fillRect(hx - 23, hy - 8, 17, 8, RAMPS.iron[0]); // dead left socket + battle crack!
    p.drawThickLine(hx - 18, hy - 30, hx - 8, hy + 14, 1.8, INK_OUTLINE);
    p.drawGlowOrb(hx + 14, hy - 4, 5.2, WHT, RED, [255, 36, 64, 175]);
    // Dangling severed cables from jawplate
    p.drawLine(hx - 24, hy + 6, hx - 29, hy + 24, RAMPS.steel[3]);
    p.drawLine(hx + 22, hy + 8, hx + 28, hy + 24, ORANGE);
  }, INK_OUTLINE, 2);

  // Layer 4: Foreground Dramatic Snow-Crusted Craggy Cliffs Framing Left & Right (center dips cleanly for menu!)
  for (let x = 0; x < w; x++) {
    const u = Math.abs(x / w - 0.5) * 2; // 0 center .. 1 edges
    const sideLift = Math.pow(u, 1.65) * 86;
    const crag = (valueNoise2D(x * 0.06, 17, 303) - 0.5) * 14 + Math.sin(x * 0.035) * 6;
    const topY = Math.round(334 - sideLift + crag);
    for (let y = topY; y < h; y++) {
      const d = y - topY;
      let col: RGBA;
      if (d <= 2) col = hexToRgba('#cceeff'); // crisp snow crust rim!
      else if (d <= 6) col = hexToRgba('#548ca6');
      else if (d <= 15) col = d % 3 === 0 ? hexToRgba('#1c2a42') : hexToRgba('#131c30');
      else col = hexToRgba('#080b14');
      s.setPx(x, y, col);
    }
  }

  // Twin Towering Carved Elder Futhark Rune Obelisks flanking far edges
  const drawObelisk = (mx: number, my: number, mw: number, mh: number, col: RGBA) => {
    s.drawPart((p) => {
      p.drawRampPolygon(
        [[mx - mw, my], [mx - mw + 2, my - mh + 12], [mx, my - mh], [mx + mw - 2, my - mh + 12], [mx + mw, my]],
        RAMPS.obsidian,
      );
      p.drawLine(mx - mw + 2, my - mh + 12, mx - mw + 1, my - 2, RAMPS.steel[3]);
      for (let r = 0; r < 3; r++) {
        const ry = my - mh + 18 + r * 18;
        p.drawNorseRune(mx - 2, ry, (r * 2 + 1) % 6, col);
        p.setPx(mx, ry + 2, WHT);
      }
    }, INK_OUTLINE, 2);
  };
  drawObelisk(584, 314, 11, 86, CYAN);
  drawObelisk(48, 306, 10, 74, ORANGE);

  // Layer 5: HEROIC DETAILED CYBER-VIKING OUTCAST STANDING ON LEFT CLIFF CRAG!
  s.drawPart((p) => {
    const vx = 114;
    const vy = 264;
    // Dramatic tattered crimson war-cloak whipping wide in the Arctic gale!
    p.drawRampPolygon(
      [
        [vx - 4, vy - 34],
        [vx + 10, vy - 34],
        [vx - 16, vy - 18],
        [vx - 44, vy - 2],
        [vx - 34, vy + 10],
        [vx - 52, vy + 18],
        [vx - 18, vy + 14],
        [vx - 8, vy + 4],
      ],
      RAMPS.crimson,
    );
    p.drawLine(vx - 42, vy - 1, vx - 14, vy - 18, RAMPS.fire[4]);

    // Heavy planted fur-trimmed Viking war-boots & steel greaves!
    p.drawRampPolygon([[vx - 10, vy - 8], [vx - 2, vy - 8], [vx - 5, vy + 18], [vx - 13, vy + 18]], RAMPS.iron);
    p.drawRampPolygon([[vx + 3, vy - 8], [vx + 11, vy - 8], [vx + 15, vy + 18], [vx + 6, vy + 18]], RAMPS.iron);
    p.drawRampPlate(vx - 12, vy + 4, 9, 5, RAMPS.fur, false, false);
    p.drawRampPlate(vx + 5, vy + 4, 9, 5, RAMPS.fur, false, false);

    // Broad armored torso, spiked pauldron & glowing cyan cyber-arm!
    p.drawRampPolygon(
      [[vx - 13, vy - 34], [vx + 14, vy - 34], [vx + 10, vy - 6], [vx - 9, vy - 6]],
      RAMPS.steel,
    );
    p.drawRampPlate(vx - 11, vy - 10, 22, 4, RAMPS.leather, false, false);
    p.drawRampPlate(vx - 3, vy - 11, 6, 6, RAMPS.gold, false, true);
    // Fur shoulder mantle & spiked steel pauldron
    p.drawRampPolygon([[vx - 16, vy - 35], [vx - 8, vy - 40], [vx + 14, vy - 38], [vx + 17, vy - 30], [vx - 15, vy - 30]], RAMPS.fur);
    p.drawRampPolygon([[vx + 8, vy - 34], [vx + 19, vy - 32], [vx + 18, vy - 22], [vx + 9, vy - 23]], RAMPS.chrome);
    // Glowing cybernetic right forearm gripping weapon
    p.drawRampLimb(vx + 14, vy - 25, vx + 16, vy - 10, 3.6, 3.0, RAMPS.chrome);
    p.drawLine(vx + 15, vy - 22, vx + 16, vy - 12, CYAN);

    // COLOSSAL Serrated Plasma-Edged Norse Battle-Axe slung across shoulder!
    p.drawRampLimb(vx - 22, vy - 54, vx + 22, vy - 6, 2.2, 2.0, RAMPS.wood);
    p.drawRampPolygon(
      [[vx - 26, vy - 60], [vx - 10, vy - 58], [vx - 13, vy - 40], [vx - 30, vy - 44], [vx - 24, vy - 51]],
      RAMPS.chrome,
    );
    p.drawThickLine(vx - 26, vy - 59, vx - 30, vy - 45, 1.4, CYAN);
    p.drawLine(vx - 25, vy - 58, vx - 29, vy - 46, WHT);

    // Sculpted Horned Cyber-Viking War-Helm & Glowing Cyan Visor gazing into the Aurora!
    p.drawRampLimb(vx - 6, vy - 46, vx - 18, vy - 56, 3.2, 1.0, RAMPS.bone);
    p.drawRampLimb(vx + 8, vy - 46, vx + 20, vy - 56, 3.2, 1.0, RAMPS.bone);
    p.drawRampPolygon(
      [[vx - 8, vy - 36], [vx - 8, vy - 48], [vx + 1, vy - 53], [vx + 10, vy - 48], [vx + 10, vy - 36]],
      RAMPS.iron,
    );
    p.fillRect(vx + 1, vy - 45, 8, 4, INK_OUTLINE);
    p.fillRect(vx + 2, vy - 44, 6, 2, CYAN);
    p.fillRect(vx + 5, vy - 44, 3, 1, WHT);
  }, INK_OUTLINE, 2);

  // Subtle falling Arctic snow motes & warm embers drifting across foreground!
  for (let i = 0; i < 42; i++) {
    const sx = Math.floor(pixelHash(i, 19, 881) * w);
    const sy = 150 + Math.floor(pixelHash(i, 37, 883) * 195);
    const isEmber = i % 5 === 0;
    s.fillRect(sx, sy, isEmber ? 2 : 1, isEmber ? 2 : 1, isEmber ? [255, 170, 64, 185] : [205, 240, 255, 155]);
  }

  return s;
}
