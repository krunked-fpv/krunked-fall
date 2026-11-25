// ============================================================================
// KRUNKEDFALL — Owned Retail Asset Extractor (Strictly Read-Only from Steam)
// ============================================================================
// Reads the operator's locally installed Steam copy strictly read-only and
// emits a self-contained, gitignored Custom Pack into `.krunkedfall-assets/`.
// NEVER writes inside the Steam directory.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  type PackManifest,
  type SpriteMeta,
} from '../src/contracts/index';
import {
  parseDataWin,
  sliceAudoPayload,
  sliceTxtrPayload,
  type DataWinSummary,
} from './gm-parser/datawin';
import { encodePng } from './gm-parser/png';
import { decodeTexturePayload } from './gm-parser/qoi';

export const DEFAULT_STEAM_DIR = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Odinfall';

export function resolveSteamDir(): string {
  return process.env.KRUNKEDFALL_STEAM_DIR || DEFAULT_STEAM_DIR;
}

/**
 * Global case-preserving brand sanitizer ("Odin" -> "Krunked").
 */
export function sanitizeBrandText(text: string): string {
  return text.replace(/odin/gi, (match) => {
    if (match === match.toUpperCase()) return 'KRUNKED';
    if (match === match.toLowerCase()) return 'krunked';
    if (match[0] === match[0].toUpperCase()) return 'Krunked';
    return 'krunked';
  });
}

/**
 * RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes (`""`),
 * and embedded commas/newlines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r') {
        // Ignore CR in CRLF
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface RawDeaMelsSound {
  name: number | null;
  volume: number | null;
  pitch: number | null;
}

export interface RawDeaMelsWeapon {
  name: string;
  id: number;
  unique_id: number;
  sprite: number;
  weaponTier: number;
  weaponPool: number;
  class: number;
  price: number;
  firingMode: number;
  ammoType: number;
  ammoCost: number;
  cooldown: number;
  burstCooldown: number;
  burstCount: number;
  projectileObject: number;
  projectileAmount: number;
  projectileSpeed: number;
  projectileSpread: number;
  spreadType: number;
  projectileOffset: number;
  projectileOffsetIgnoreWall: boolean;
  damageType: number;
  heatseekingRate: number;
  animationStyle: number;
  firingAnimationStyle: number;
  animationSpeed: number;
  spriteRecoil: number;
  spriteRecoilAngle: number;
  userKnockback: number;
  knockbackOnlyWhenStill: boolean;
  screenshakeAmount: number;
  spriteFlashFrames: number;
  overheat: number;
  overheatFactor: number;
  ejectionType: number;
  ejectionAmount: number;
  ejectionTiming: number;
  windupMax: number;
  projectileScale: number;
  damageFactor: number;
  extraProjectileBounces: number;
  zoomFactor: number;
  laserSight: boolean;
  refundChance: number;
  lifestealChance: number;
  crosshairSprite: number;
  crosshairColor: string;
  weaponFlashSprite: number;
  burnTier: number;
  freezeTier: number;
  explosiveTier: number;
  acidTier: number;
  radioactiveTier: number;
  golden: number;
  goldenCost: number;
  stashed: { x: number; y: number };
  isLocked: boolean;
  killsUnlock: number;
  soundFire: RawDeaMelsSound;
  soundEquip: RawDeaMelsSound;
  soundReload: RawDeaMelsSound;
}

export function loadDeaMelsWeapons(steamDir: string): RawDeaMelsWeapon[] {
  const rawBase64 = fs.readFileSync(path.join(steamDir, 'DeaMels.json'), 'utf8').trim();
  const decodedJson = Buffer.from(rawBase64, 'base64').toString('utf8');
  return JSON.parse(decodedJson) as RawDeaMelsWeapon[];
}

export function loadNodeData(steamDir: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(steamDir, 'node_data.json'), 'utf8');
  // Strip trailing commas before closing braces/brackets
  const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned) as Record<string, unknown>;
}

function buildLogicalAliases(
  dataWin: DataWinSummary,
  sprites: Record<string, SpriteMeta>,
  spriteIdToName: Record<string, string>,
  sounds: Record<string, { file: string; volume: number; pitch: number }>,
  soundIdToName: Record<string, string>,
  music: Record<string, string>,
  weapons: RawDeaMelsWeapon[],
): Record<string, string> {
  const spriteNames = dataWin.sprites.filter((s) => s.frames.length > 0).map((s) => s.name);
  const musicKeys = Object.keys(music);
  const aliases: Record<string, string> = {};

  const pickSprite = (patterns: RegExp[], fallback?: string): string => {
    for (const pattern of patterns) {
      const hit = spriteNames.find((name) => pattern.test(name));
      if (hit && sprites[hit]) return hit;
    }
    if (fallback && sprites[fallback]) return fallback;
    throw new Error(`Could not resolve sprite alias for patterns: ${patterns.map(String).join(', ')}`);
  };

  const pickMusic = (patterns: RegExp[], fallback?: string): string => {
    for (const pattern of patterns) {
      const hit = musicKeys.find((key) => pattern.test(key));
      if (hit && music[hit]) return hit;
    }
    if (fallback && music[fallback]) return fallback;
    throw new Error(`Could not resolve music alias for patterns: ${patterns.map(String).join(', ')}`);
  };

  // --- 1. Outcasts (8 playable characters -> exact GMS2 idle/run sprites) ---
  aliases.outcast_britta = pickSprite([/^sprPlayerCyberserkerIdleA$/i, /sprPlayerCyberserker.*Idle/i]);
  aliases.outcast_leifi = pickSprite([/^sprPlayerMooseIdleA$/i, /sprPlayerMoose.*Idle/i]);
  aliases.outcast_gustaf = pickSprite([/^sprPlayerDarkelfIdleA$/i, /sprPlayerDarkelf.*Idle/i]);
  aliases.outcast_einar = pickSprite([/^sprPlayerDwarfIdleA$/i, /sprPlayerDwarf.*Idle/i]);
  aliases.outcast_gunilla = pickSprite([/^sprPlayerGnomeIdleA$/i, /sprPlayerGnome.*Idle/i]);
  aliases.outcast_trulls = pickSprite([/^sprPlayerTrollIdleA$/i, /sprPlayerTroll.*Idle/i]);
  aliases.outcast_stellan = pickSprite([/^sprPlayerGoblinIdleA$/i, /sprPlayerGoblin.*Idle/i]);
  aliases.outcast_hilda = pickSprite([/^sprPlayerDryadIdleA$/i, /sprPlayerDryad.*Idle/i]);

  // --- 2. Bosses (Phase 1 & Phase 2 for all 6 Major Bosses) ---
  aliases.boss_fenrir_p1 = pickSprite([/^sprEnFenrirNormalIdle$/i, /sprEnFenrir.*NormalIdle/i]);
  aliases.boss_fenrir_p2 = pickSprite([/^sprEnFenrir2NormalIdle$/i, /sprEnFenrir2.*Idle/i]);
  aliases.boss_skadi_p1 = pickSprite([/^sprEnSkadiNormalIdle$/i, /sprEnSkadi.*NormalIdle/i]);
  aliases.boss_skadi_p2 = pickSprite([/^sprEnSkadi2NormalIdle$/i, /sprEnSkadi2.*Idle/i]);
  aliases.boss_loki_body_p1 = pickSprite([/^sprEnBodyNormalIdle$/i, /sprEnBody.*NormalIdle/i]);
  aliases.boss_loki_body_p2 = pickSprite([/^sprEnBody2NormalIdle$/i, /sprEnBody2.*Idle/i]);
  aliases.boss_hel_p1 = pickSprite([/^sprEnHelNormalIdle$/i, /sprEnHel.*NormalIdle/i]);
  aliases.boss_hel_p2 = pickSprite([/^sprEnHel2NormalIdle$/i, /sprEnHel2.*Idle/i]);
  aliases.boss_surtur_p1 = pickSprite([/^sprEnSurturNormalIdle$/i, /sprEnSurtur.*NormalIdle/i]);
  aliases.boss_surtur_p2 = pickSprite([/^sprEnSurtur2NormalIdle$/i, /sprEnSurtur2.*Idle/i]);
  // Final Boss: map Krunked logical keys to retail final boss sprites strictly inside manifest.json
  aliases.boss_krunked_p1 = pickSprite([/^sprEnOdinNormalIdle$/i, /sprEnOdin.*NormalIdle/i]);
  aliases.boss_krunked_p2 = pickSprite([/^sprEnOdin2NormalIdle$/i, /sprEnOdin2.*Idle/i]);

  // --- 3. Boss Music Stems (Intro / A / B / Outro for all 6 Major Bosses) ---
  const safespaceFallback = pickMusic([/^sndMusicSafespace$/i, /^sndMusicWorldmap$/i]);
  aliases.music_fenrir_intro = pickMusic([/^sndMusicFenrirIntro$/i]);
  aliases.music_fenrir_a = pickMusic([/^sndMusicFenrirA$/i]);
  aliases.music_fenrir_b = pickMusic([/^sndMusicFenrirB$/i]);
  aliases.music_fenrir_outro = pickMusic([/^sndMusicFenrirOutro$/i], safespaceFallback);

  aliases.music_skadi_intro = pickMusic([/^sndMusicSkadiIntro$/i]);
  aliases.music_skadi_a = pickMusic([/^sndMusicSkadiA$/i]);
  aliases.music_skadi_b = pickMusic([/^sndMusicSkadiB$/i]);
  aliases.music_skadi_outro = pickMusic([/^sndMusicSkadiOutro$/i], safespaceFallback);

  aliases.music_loki_body_intro = pickMusic([/^sndMusicBodyIntro$/i]);
  aliases.music_loki_body_a = pickMusic([/^sndMusicBodyA$/i]);
  aliases.music_loki_body_b = pickMusic([/^sndMusicBodyB$/i]);
  aliases.music_loki_body_outro = pickMusic([/^sndMusicBodyOutro$/i], safespaceFallback);

  aliases.music_hel_intro = pickMusic([/^sndMusicHelIntro$/i]);
  aliases.music_hel_a = pickMusic([/^sndMusicHelA$/i]);
  aliases.music_hel_b = pickMusic([/^sndMusicHelB$/i]);
  aliases.music_hel_outro = pickMusic([/^sndMusicHelOutro$/i], safespaceFallback);

  aliases.music_surtur_intro = pickMusic([/^sndMusicSurturIntro$/i]);
  aliases.music_surtur_a = pickMusic([/^sndMusicSurturA$/i]);
  aliases.music_surtur_b = pickMusic([/^sndMusicSurturB$/i]);
  aliases.music_surtur_outro = pickMusic([/^sndMusicSurturOutro$/i], safespaceFallback);

  aliases.music_krunked_intro = pickMusic([/^sndMusicOdinIntro$/i]);
  aliases.music_krunked_a = pickMusic([/^sndMusicOdinA$/i]);
  aliases.music_krunked_b = pickMusic([/^sndMusicOdinB$/i]);
  aliases.music_krunked_outro = pickMusic([/^sndMusicOdinOutro$/i], safespaceFallback);

  // --- 4. Biome, UI & Ambience Music ---
  aliases.music_menu = pickMusic([/^sndMusicMenu$/i]);
  aliases.music_hub = pickMusic([/^sndMusicHub$/i]);
  aliases.music_worldmap = pickMusic([/^sndMusicWorldmap$/i]);
  aliases.music_arena = pickMusic([/^sndMusicArena$/i]);
  aliases.music_canyon = pickMusic([/^sndMusicCanyon$/i]);
  aliases.music_ashwastes = pickMusic([/^sndMusicAshwastes$/i]);
  aliases.music_darkcity = pickMusic([/^sndMusicDarkcity$/i]);
  aliases.music_jotunheim = pickMusic([/^sndMusicJotunheim$/i]);
  aliases.music_helheim = pickMusic([/^sndMusicHelheim$/i]);
  aliases.music_muspelheim = pickMusic([/^sndMusicMuspelheim$/i]);
  aliases.music_lavaland = pickMusic([/^sndMusicLavaland$/i]);
  aliases.music_forest = pickMusic([/^sndMusicPineforest$/i]);
  aliases.music_pineforest = pickMusic([/^sndMusicPineforest$/i]);
  aliases.music_sewer = pickMusic([/^sndMusicSewer$/i]);
  aliases.music_losttemple = pickMusic([/^sndMusicLosttemple$/i]);
  aliases.music_shrine = pickMusic([/^sndMusicTheshrine$/i]);
  aliases.music_cindercity = pickMusic([/^sndMusicCindercity$/i]);
  aliases.music_redhall = pickMusic([/^sndMusicRedhall$/i]);
  aliases.music_sulfurlake = pickMusic([/^sndMusicSulfurlake$/i]);
  aliases.music_snowstorm_heavy = pickMusic([/^sndMusicSnowstormHeavy$/i]);
  aliases.music_snowstorm_light = pickMusic([/^sndMusicSnowstormLight$/i]);
  aliases.music_shop = pickMusic([/^sndMusicSecretshop$/i]);
  aliases.music_secretshop = pickMusic([/^sndMusicSecretshop$/i]);

  // Additional biome/UI/ambience aliases so every overworld node maps cleanly
  aliases.music_desert = pickMusic([/^sndMusicSaltpan$/i, /^sndMusicCanyon$/i]);
  aliases.music_saltpan = pickMusic([/^sndMusicSaltpan$/i]);
  aliases.music_sandcave = pickMusic([/^sndMusicSandcave$/i]);
  aliases.music_sandcity = pickMusic([/^sndMusicSandcity$/i]);
  aliases.music_subway = pickMusic([/^sndMusicSubway$/i]);
  aliases.music_vikingdungeon = pickMusic([/^sndMusicVikingdungeon$/i]);
  aliases.music_stonyfield = pickMusic([/^sndMusicStonyfield$/i]);
  aliases.music_deadlands = pickMusic([/^sndMusicDeadlands$/i]);
  aliases.music_mushroomcave = pickMusic([/^sndMusicMushroomcave$/i]);
  aliases.music_wildcity = pickMusic([/^sndMusicWildcity$/i]);
  aliases.music_garage = pickMusic([/^sndmusicgarage$/i]);
  aliases.music_mosslab = pickMusic([/^sndMusicMosslab$/i]);
  aliases.music_militarybase = pickMusic([/^sndMusicMilitarybase$/i]);
  aliases.music_trenches = pickMusic([/^sndMusicTrenches$/i]);
  aliases.music_bladeyard = pickMusic([/^sndMusicBladeyard$/i]);
  aliases.music_safespace = safespaceFallback;
  aliases.music_campfire = safespaceFallback;
  aliases.music_credits = pickMusic([/^sndMusicCredits$/i]);
  aliases.music_intro = pickMusic([/^sndMusicIntro$/i]);
  aliases.ambience_city = pickMusic([/^sndAmbienceCity$/i]);
  aliases.ambience_desert = pickMusic([/^sndAmbienceDesert$/i]);
  aliases.ambience_hub = pickMusic([/^sndAmbienceHubEntrance$/i]);
  aliases.ambience_jotunheim = pickMusic([/^sndAmbienceJotunheim$/i]);
  aliases.ambience_sewer = pickMusic([/^sndAmbienceSewer$/i]);
  aliases.ambience_storm = pickMusic([/^sndAmbienceMotherstorm$/i]);

  // --- 5. Weapons (all 221 weapon sprites & fire/equip/reload SFX) ---
  for (const w of weapons) {
    const sprName = spriteIdToName[String(w.sprite)];
    if (sprName && sprites[sprName]) {
      aliases[`wep_${w.unique_id}`] = sprName;
    }
    if (w.soundFire && typeof w.soundFire.name === 'number') {
      const sndName = soundIdToName[String(w.soundFire.name)];
      if (sndName && (sounds[sndName] || music[sndName])) {
        aliases[`sfx_wep_${w.unique_id}_fire`] = sndName;
      }
    }
    if (w.soundEquip && typeof w.soundEquip.name === 'number') {
      const sndName = soundIdToName[String(w.soundEquip.name)];
      if (sndName && (sounds[sndName] || music[sndName])) {
        aliases[`sfx_wep_${w.unique_id}_equip`] = sndName;
      }
    }
    if (w.soundReload && typeof w.soundReload.name === 'number') {
      const sndName = soundIdToName[String(w.soundReload.name)];
      if (sndName && (sounds[sndName] || music[sndName])) {
        aliases[`sfx_wep_${w.unique_id}_reload`] = sndName;
      }
    }
  }

  // --- 6. Tiles, FX, Companions, HUD, Pickups, Hub, Projectiles & Enemies ---
  aliases.tile_floor = pickSprite([/^sprCanyonFloor$/i, /^sprAshwastesFloor$/i]);
  aliases.tile_wall = pickSprite([/^sprCanyonWall$/i, /^sprAshwastesWall$/i]);
  aliases.tile_wall_broken = pickSprite([/^sprCanyonWallBroken$/i, /^sprAshwastesWallBroken$/i]);
  aliases.tile_bedrock = pickSprite([/^sprAshwastesWall$/i, /^sprDarkcityWall$/i]);
  aliases.tile_rubble = pickSprite([/^sprCanyonFloorBroken$/i, /^sprAshwastesFloorBroken$/i]);
  aliases.tile_crate = pickSprite([
    /^sprDoodadBarrelExplosive$/i,
    /^sprDoodadBarrelFire$/i,
    /^sprDoodadBigExplosiveTank$/i,
    /^sprChestBase$/i,
  ]);
  aliases.tile_lava = pickSprite([/^sprEnLava$/i, /^sprAshwastesFloor$/i]);
  aliases.tile_water = pickSprite([/^sprBluebunkerFloor$/i, /^sprDarkcityFloor$/i]);

  aliases.fx_muzzle_flash = pickSprite([/^sprEffectMuzzleflash$/i]);
  aliases.fx_explosion = pickSprite([/^sprEffectExplosionStar$/i, /^sprEffectPlasmaexplosion$/i]);
  aliases.fx_bifrost = pickSprite([/^sprHubBifrostMiddle$/i, /^sprHubBifrostBottom$/i]);
  aliases.fx_frost_crystal = pickSprite([/^sprEnProjectileFrostballbig$/i, /^sprEnProjectileFrostball$/i]);
  aliases.fx_turret = pickSprite([/^sprSummonTurretBodyA$/i, /^sprSummonTurretmouthIdle$/i]);
  aliases.fx_drill = pickSprite([/^sprProjectileDrillnoseA$/i]);
  aliases.fx_seedling = pickSprite([/^sprPlayerDryadMinionIdleA$/i]);
  aliases.fx_whirlpool = pickSprite([/^sprEffectPlasmaexplosion$/i]);
  aliases.fx_doom_ball = pickSprite([/^sprEnProjectileFenrirHyperball$/i]);

  aliases.hud_crosshair = pickSprite([/^sprCrosshairDefault$/i, /^sprCrosshairBullet$/i]);
  aliases.hud_heart = pickSprite([/^sprItemHeart$/i]);

  aliases.pickup_hp = pickSprite([/^sprPickupHp$/i, /^sprItemHeart$/i]);
  aliases.pickup_ammo = pickSprite([/^sprPickupBullet$/i, /^sprPickupShell$/i]);
  aliases.pickup_gold = pickSprite([/^sprPickupMoney$/i]);
  aliases.pickup_xp = pickSprite([/^sprPickupExp1$/i]);
  aliases.pickup_weapon = pickSprite([/^sprChestLidWeapon$/i, /^sprChestBase$/i]);
  aliases.pickup_mod = pickSprite([/^sprModTurbo$/i, /^sprChestLidMod$/i]);
  aliases.pickup_chest = pickSprite([/^sprChestBase$/i]);

  aliases.hub_loki = pickSprite([/^sprHubLoki1$/i, /^sprHubLokiHeadSmirk$/i]);
  aliases.hub_jotunn = pickSprite([/^sprHubDatabase$/i, /^sprHubWeapondexBelt$/i]);
  aliases.hub_yggdrasil = pickSprite([/^sprHubTree$/i]);
  aliases.hub_dummy = pickSprite([/^sprHubCoopRobotBody$/i, /^sprEnShopkeeperNormalIdle$/i]);

  aliases.proj_bullet = pickSprite([/^sprProjectileBullet$/i]);
  aliases.proj_shell = pickSprite([/^sprProjectilePellet$/i, /^sprProjectileBullet$/i]);
  aliases.proj_bolt = pickSprite([/^sprProjectileBolt$/i, /^sprProjectileArrow$/i]);
  aliases.proj_energy = pickSprite([/^sprProjectilePlasma$/i, /^sprProjectileLaser$/i]);
  aliases.proj_rocket = pickSprite([/^sprProjectileRocket$/i]);
  aliases.proj_frost = pickSprite([/^sprEnProjectileFrostball$/i]);
  aliases.proj_enemy = pickSprite([/^sprEnProjectileBullet$/i]);

  // Enemies
  aliases.enemy_default = pickSprite([/^sprEnBanditNormalIdle$/i]);
  aliases.enemy_bandit = pickSprite([/^sprEnBanditNormalIdle$/i]);
  aliases.enemy_wolf = pickSprite([/^sprEnWolfNormalIdle$/i, /^sprEnBluewolfNormalIdle$/i]);
  aliases.enemy_viking = pickSprite([/^sprEnCybervikingNormalIdle$/i, /^sprEnNeovikingNormalIdle$/i]);
  aliases.enemy_robot = pickSprite([/^sprEnLaserdroneNormalIdle$/i, /^sprEnTreasurebotNormalIdle$/i]);
  aliases.enemy_turret = pickSprite([/^sprEnBunkerNormalIdle$/i, /^sprSummonTurretBodyA$/i]);
  aliases.enemy_giant = pickSprite([/^sprEnFiregiantNormalIdle$/i, /^sprEnFrostgiantNormalIdle$/i]);
  aliases.enemy_spider = pickSprite([/^sprEnSpindelkrabbaNormalIdle$/i, /^sprEnIcespiderEliteIdle$/i]);
  aliases.enemy_roach = pickSprite([/^sprEnRoachNormalIdle$/i, /^sprEnBombroachNormalIdle$/i]);
  aliases.enemy_slime = pickSprite([/^sprEnSlimeNormalIdle$/i]);
  aliases.enemy_rat = pickSprite([/^sprEnRatNormalIdle$/i, /^sprEnAcidratNormalIdle$/i]);
  aliases.enemy_skeleton = pickSprite([/^sprEnSkulltrooperNormalIdle$/i, /^sprEnBowboneNormalIdle$/i]);
  aliases.enemy_mimic = pickSprite([/^sprEnWeaponmimicNormalIdle$/i, /^sprEnModmimicNormalIdle$/i]);
  aliases.enemy_bomber = pickSprite([/^sprEnBombroachNormalIdle$/i]);
  aliases.enemy_sniper = pickSprite([/^sprEnSniperNormalIdle$/i]);

  // Validate every alias resolves cleanly into sprites, sounds, or music
  for (const [aliasKey, target] of Object.entries(aliases)) {
    if (!sprites[target] && !sounds[target] && !music[target]) {
      throw new Error(`Dangling logicalAlias: "${aliasKey}" -> "${target}"`);
    }
  }

  return aliases;
}

export function extractAssets(): PackManifest {
  const startMs = Date.now();
  const steamDir = resolveSteamDir();
  const dataWinPath = path.join(steamDir, 'data.win');
  if (!fs.existsSync(dataWinPath)) {
    throw new Error(
      `Steam data.win not found at "${dataWinPath}". Set KRUNKEDFALL_STEAM_DIR to your owned retail install.`,
    );
  }

  const outRoot = path.resolve(process.cwd(), '.krunkedfall-assets');
  const pagesDir = path.join(outRoot, 'pages');
  const soundsDir = path.join(outRoot, 'sounds');
  const musicDir = path.join(outRoot, 'music');
  const fontsDir = path.join(outRoot, 'fonts');
  const dataDir = path.join(outRoot, 'data');

  for (const dir of [outRoot, pagesDir, soundsDir, musicDir, fontsDir, dataDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[extract] Reading data.win strictly read-only from: ${steamDir}`);
  const dataWinBuffer = fs.readFileSync(dataWinPath);
  const dataWin = parseDataWin(dataWinBuffer);
  console.log(
    `[extract] Parsed data.win (${dataWinBuffer.length.toLocaleString()} bytes): ` +
      `TXTR=${dataWin.txtr.length}, SPRT=${dataWin.sprites.length}, TPAG=${dataWin.tpagCount}, ` +
      `SOND=${dataWin.sounds.length}, AUDO=${dataWin.audo.length}, SHDR=${dataWin.shdrCount}, FONT=${dataWin.fontCount}`,
  );

  // 1. Decode all 127 TXTR pages to PNG
  const pages: PackManifest['pages'] = [];
  for (const txtrEntry of dataWin.txtr) {
    const fileName = `page_${String(txtrEntry.index).padStart(3, '0')}.png`;
    const outPath = path.join(pagesDir, fileName);
    const payload = sliceTxtrPayload(dataWinBuffer, txtrEntry);
    const decoded = decodeTexturePayload(payload);
    const pngBuffer =
      decoded.format === 'png'
        ? decoded.png
        : encodePng(decoded.width, decoded.height, decoded.rgba, 1);
    fs.writeFileSync(outPath, pngBuffer);
    pages.push({
      index: txtrEntry.index,
      file: `pages/${fileName}`,
      width: decoded.width,
      height: decoded.height,
    });
  }
  console.log(`[extract] Decoded ${pages.length} texture pages to .krunkedfall-assets/pages/`);

  // 2. Build sprite registry & ID map
  const sprites: Record<string, SpriteMeta> = {};
  const spriteIdToName: Record<string, string> = {};
  for (const s of dataWin.sprites) {
    sprites[s.name] = {
      id: s.id,
      name: s.name,
      width: s.width,
      height: s.height,
      originX: s.originX,
      originY: s.originY,
      bbox: s.bbox,
      frames: s.frames,
    };
    spriteIdToName[String(s.id)] = s.name;
  }

  // 3. Extract all 435 embedded AUDO RIFF WAVs mapped from SOND
  const sounds: PackManifest['sounds'] = {};
  const soundIdToName: Record<string, string> = {};
  let extractedWavCount = 0;
  for (const sond of dataWin.sounds) {
    soundIdToName[String(sond.id)] = sond.name;
    if (sond.audioId >= 0 && sond.audioId < dataWin.audo.length) {
      const audoEntry = dataWin.audo[sond.audioId];
      const wavData = sliceAudoPayload(dataWinBuffer, audoEntry);
      const safeName = sond.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const relFile = `sounds/${safeName}.wav`;
      fs.writeFileSync(path.join(outRoot, relFile), wavData);
      sounds[sond.name] = {
        file: relFile,
        volume: Number(sond.volume.toFixed(4)),
        pitch: Number(sond.pitch.toFixed(4)),
      };
      extractedWavCount++;
    }
  }
  console.log(`[extract] Extracted ${extractedWavCount} embedded WAV sounds to .krunkedfall-assets/sounds/`);

  // 4. Copy all external .ogg files from Steam root
  const music: PackManifest['music'] = {};
  const rootEntries = fs.readdirSync(steamDir).sort();
  for (const file of rootEntries) {
    if (!file.toLowerCase().endsWith('.ogg')) continue;
    const srcPath = path.join(steamDir, file);
    if (!fs.statSync(srcPath).isFile()) continue;
    const dstPath = path.join(musicDir, file);
    fs.copyFileSync(srcPath, dstPath);
    const baseKey = file.slice(0, -4);
    music[baseKey] = `music/${file}`;
  }
  console.log(`[extract] Copied ${Object.keys(music).length} external OGG tracks to .krunkedfall-assets/music/`);

  // 5. Copy fonts/*.ttf if present
  const fonts: PackManifest['fonts'] = {};
  const steamFontsDir = path.join(steamDir, 'fonts');
  if (fs.existsSync(steamFontsDir) && fs.statSync(steamFontsDir).isDirectory()) {
    for (const file of fs.readdirSync(steamFontsDir).sort()) {
      if (!file.toLowerCase().endsWith('.ttf')) continue;
      const srcPath = path.join(steamFontsDir, file);
      if (!fs.statSync(srcPath).isFile()) continue;
      fs.copyFileSync(srcPath, path.join(fontsDir, file));
      const baseKey = file.slice(0, -4);
      fonts[baseKey] = `fonts/${file}`;
    }
  }
  console.log(`[extract] Copied ${Object.keys(fonts).length} TTF fonts to .krunkedfall-assets/fonts/`);

  // 6. Parse base64 DeaMels.json with Krunked brand sanitization
  const rawWeapons = loadDeaMelsWeapons(steamDir);
  const sanitizedWeapons = rawWeapons.map((w) => ({
    ...w,
    name: sanitizeBrandText(w.name),
  }));
  fs.writeFileSync(
    path.join(dataDir, 'weapons.json'),
    JSON.stringify(sanitizedWeapons, null, 2),
    'utf8',
  );
  console.log(`[extract] Parsed ${sanitizedWeapons.length} weapons -> .krunkedfall-assets/data/weapons.json`);

  // 7. Parse node_data.json stripping trailing commas
  const nodeData = loadNodeData(steamDir);
  fs.writeFileSync(path.join(dataDir, 'nodes.json'), JSON.stringify(nodeData, null, 2), 'utf8');
  console.log(`[extract] Parsed node_data.json -> .krunkedfall-assets/data/nodes.json`);

  // 8. Parse locale/*.csv with case-preserving global brand sanitization
  const localeBundle: Record<string, Record<string, Record<string, string>>> = {};
  const steamLocaleDir = path.join(steamDir, 'locale');
  let localeEntryCount = 0;
  if (fs.existsSync(steamLocaleDir) && fs.statSync(steamLocaleDir).isDirectory()) {
    for (const file of fs.readdirSync(steamLocaleDir).sort()) {
      if (!file.toLowerCase().endsWith('.csv')) continue;
      const csvText = fs.readFileSync(path.join(steamLocaleDir, file), 'utf8');
      const rows = parseCsv(csvText);
      if (rows.length === 0) continue;
      const headers = rows[0].map((h) => h.trim());
      const table: Record<string, Record<string, string>> = {};
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawKey = (row[0] ?? '').trim();
        if (!rawKey) continue;
        const safeKey = sanitizeBrandText(rawKey);
        const record: Record<string, string> = {};
        for (let c = 1; c < headers.length; c++) {
          const colName = headers[c] || `col_${c}`;
          const val = row[c] ?? '';
          if (val.length > 0) {
            record[colName] = sanitizeBrandText(val);
          }
        }
        table[safeKey] = record;
        localeEntryCount++;
      }
      const tableName = file.slice(0, -4);
      localeBundle[tableName] = table;
    }
  }
  fs.writeFileSync(
    path.join(dataDir, 'locale.json'),
    JSON.stringify(localeBundle, null, 2),
    'utf8',
  );
  console.log(
    `[extract] Parsed ${Object.keys(localeBundle).length} locale CSVs (${localeEntryCount} entries, brand-sanitized) -> .krunkedfall-assets/data/locale.json`,
  );

  // 9. Build logicalAliases & manifest.json
  const logicalAliases = buildLogicalAliases(
    dataWin,
    sprites,
    spriteIdToName,
    sounds,
    soundIdToName,
    music,
    rawWeapons,
  );

  const manifest: PackManifest = {
    version: 1,
    packType: 'custom',
    logicalWidth: dataWin.gen8.defaultWindowWidth || LOGICAL_WIDTH,
    logicalHeight: dataWin.gen8.defaultWindowHeight || LOGICAL_HEIGHT,
    pageCount: pages.length,
    pages,
    sprites,
    spriteIdToName,
    sounds,
    soundIdToName,
    music,
    fonts,
    logicalAliases,
  };

  fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
  console.log(
    `[extract] Complete in ${elapsedSec}s: manifest.json written with ` +
      `${pages.length} pages, ${Object.keys(sprites).length} sprites, ` +
      `${Object.keys(sounds).length} WAVs, ${Object.keys(music).length} OGGs, ` +
      `${Object.keys(logicalAliases).length} logicalAliases.`,
  );

  return manifest;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  extractAssets();
}
