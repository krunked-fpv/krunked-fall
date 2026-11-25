// ============================================================================
// KRUNKEDFALL — Retail Ground-Truth Oracle Dumper (Strictly Read-Only)
// ============================================================================
// Inspects the operator's locally installed retail Steam assets read-only and
// writes `.krunkedfall-assets/oracle.json` for Gate A parity verification.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TILE_SIZE } from '../src/contracts/index';
import { parseDataWin } from './gm-parser/datawin';
import {
  loadDeaMelsWeapons,
  loadNodeData,
  parseCsv,
  resolveSteamDir,
  sanitizeBrandText,
} from './extract-assets';

export interface OracleWeaponEntry {
  id: number;
  uniqueId: number;
  name: string;
  spriteId: number;
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
  damageFactor: number;
  projectileScale: number;
  heatseekingRate: number;
  spriteRecoil: number;
  spriteRecoilAngle: number;
  userKnockback: number;
  knockbackOnlyWhenStill: boolean;
  screenshakeAmount: number;
  spriteFlashFrames: number;
  overheat: number;
  overheatFactor: number;
  windupMax: number;
  extraProjectileBounces: number;
  zoomFactor: number;
  laserSight: boolean;
  refundChance: number;
  lifestealChance: number;
  burnTier: number;
  freezeTier: number;
  explosiveTier: number;
  acidTier: number;
  radioactiveTier: number;
  golden: number;
  goldenCost: number;
  soundFireId: number | null;
  soundEquipId: number | null;
  soundReloadId: number | null;
}

export interface OracleDump {
  version: number;
  generatedAt: string;
  dataWinSize: number;
  bytecodeVersion: number;
  display: {
    width: number;
    height: number;
    simHz: number;
    tileSize: number;
  };
  counts: {
    txtr: number;
    sprt: number;
    tpag: number;
    audo: number;
    sond: number;
    shdr: number;
    font: number;
    ogg: number;
    weaponCount: number;
    tierCounts: Record<string, number>;
    classCounts: Record<string, number>;
    ammoCounts: Record<string, number>;
    modCount: number;
    outcastCount: number;
    nodeCount: number;
    nodeDataPositionedCount: number;
    bossCount: number;
  };
  bossKeysVerified: string[];
  weaponsByUniqueId: Record<string, OracleWeaponEntry>;
}

const OUTCAST_SOURCE_KEYS = [
  'Cyberserker_name',
  'Moose_name',
  'Darkelf_name',
  'Dwarf_name',
  'Gnome_name',
  'Troll_name',
  'Goblin_name',
  'Dryad_name',
];

const BOSS_SPRITE_CHECKS: Array<{ id: string; p1: RegExp; p2: RegExp }> = [
  { id: 'fenrir', p1: /^sprEnFenrirNormalIdle$/i, p2: /^sprEnFenrir2NormalIdle$/i },
  { id: 'skadi', p1: /^sprEnSkadiNormalIdle$/i, p2: /^sprEnSkadi2NormalIdle$/i },
  { id: 'loki_body', p1: /^sprEnBodyNormalIdle$/i, p2: /^sprEnBody2NormalIdle$/i },
  { id: 'hel', p1: /^sprEnHelNormalIdle$/i, p2: /^sprEnHel2NormalIdle$/i },
  { id: 'surtur', p1: /^sprEnSurturNormalIdle$/i, p2: /^sprEnSurtur2NormalIdle$/i },
  { id: 'krunked', p1: /^sprEnOdinNormalIdle$/i, p2: /^sprEnOdin2NormalIdle$/i },
];

export function dumpOracle(): OracleDump {
  const steamDir = resolveSteamDir();
  const dataWinPath = path.join(steamDir, 'data.win');
  if (!fs.existsSync(dataWinPath)) {
    throw new Error(
      `Steam data.win not found at "${dataWinPath}". Set KRUNKEDFALL_STEAM_DIR to your owned retail install.`,
    );
  }

  const outRoot = path.resolve(process.cwd(), '.krunkedfall-assets');
  fs.mkdirSync(outRoot, { recursive: true });

  const buffer = fs.readFileSync(dataWinPath);
  const dataWin = parseDataWin(buffer);

  // External OGG count
  const oggFiles = fs
    .readdirSync(steamDir)
    .filter((f) => f.toLowerCase().endsWith('.ogg') && fs.statSync(path.join(steamDir, f)).isFile());

  // Weapons oracle table
  const rawWeapons = loadDeaMelsWeapons(steamDir);
  const tierCounts: Record<string, number> = {};
  const classCounts: Record<string, number> = {};
  const ammoCounts: Record<string, number> = {};
  const weaponsByUniqueId: Record<string, OracleWeaponEntry> = {};

  for (const w of rawWeapons) {
    const tKey = String(w.weaponTier);
    const cKey = String(w.class);
    const aKey = String(w.ammoType);
    tierCounts[tKey] = (tierCounts[tKey] ?? 0) + 1;
    classCounts[cKey] = (classCounts[cKey] ?? 0) + 1;
    ammoCounts[aKey] = (ammoCounts[aKey] ?? 0) + 1;

    weaponsByUniqueId[String(w.unique_id)] = {
      id: w.id,
      uniqueId: w.unique_id,
      name: sanitizeBrandText(w.name),
      spriteId: w.sprite,
      weaponTier: w.weaponTier,
      weaponPool: w.weaponPool,
      class: w.class,
      price: w.price,
      firingMode: w.firingMode,
      ammoType: w.ammoType,
      ammoCost: w.ammoCost,
      cooldown: w.cooldown,
      burstCooldown: w.burstCooldown,
      burstCount: w.burstCount,
      projectileObject: w.projectileObject,
      projectileAmount: w.projectileAmount,
      projectileSpeed: w.projectileSpeed,
      projectileSpread: w.projectileSpread,
      spreadType: w.spreadType,
      projectileOffset: w.projectileOffset,
      projectileOffsetIgnoreWall: Boolean(w.projectileOffsetIgnoreWall),
      damageType: w.damageType,
      damageFactor: w.damageFactor,
      projectileScale: w.projectileScale,
      heatseekingRate: w.heatseekingRate,
      spriteRecoil: w.spriteRecoil,
      spriteRecoilAngle: w.spriteRecoilAngle,
      userKnockback: w.userKnockback,
      knockbackOnlyWhenStill: Boolean(w.knockbackOnlyWhenStill),
      screenshakeAmount: w.screenshakeAmount,
      spriteFlashFrames: w.spriteFlashFrames,
      overheat: w.overheat,
      overheatFactor: w.overheatFactor,
      windupMax: w.windupMax,
      extraProjectileBounces: w.extraProjectileBounces,
      zoomFactor: w.zoomFactor,
      laserSight: Boolean(w.laserSight),
      refundChance: w.refundChance,
      lifestealChance: w.lifestealChance,
      burnTier: w.burnTier,
      freezeTier: w.freezeTier,
      explosiveTier: w.explosiveTier,
      acidTier: w.acidTier,
      radioactiveTier: w.radioactiveTier,
      golden: w.golden,
      goldenCost: w.goldenCost,
      soundFireId: typeof w.soundFire?.name === 'number' ? w.soundFire.name : null,
      soundEquipId: typeof w.soundEquip?.name === 'number' ? w.soundEquip.name : null,
      soundReloadId: typeof w.soundReload?.name === 'number' ? w.soundReload.name : null,
    };
  }

  // Mods count from locale/Mods.csv (all non-empty keyed rows)
  const modsCsvRows = parseCsv(fs.readFileSync(path.join(steamDir, 'locale', 'Mods.csv'), 'utf8'));
  const modCount = modsCsvRows.slice(1).filter((r) => (r[0] ?? '').trim().length > 0).length;

  // Outcasts count verified in locale/Characters.csv
  const charsCsvRows = parseCsv(
    fs.readFileSync(path.join(steamDir, 'locale', 'Characters.csv'), 'utf8'),
  );
  const charKeys = new Set(charsCsvRows.slice(1).map((r) => (r[0] ?? '').trim()));
  const outcastCount = OUTCAST_SOURCE_KEYS.filter((k) => charKeys.has(k)).length;

  // Nodes count from locale/Nodes.csv (Act*_name rows) + node_data.json positioned entries
  const nodesCsvRows = parseCsv(
    fs.readFileSync(path.join(steamDir, 'locale', 'Nodes.csv'), 'utf8'),
  );
  const nodeCount = nodesCsvRows
    .slice(1)
    .filter((r) => /^Act\d+_.*_name$/i.test((r[0] ?? '').trim())).length;

  const nodeData = loadNodeData(steamDir);
  let nodeDataPositionedCount = 0;
  const nodeGroups = (nodeData.nodes ?? {}) as Record<string, unknown>;
  for (const list of Object.values(nodeGroups)) {
    if (Array.isArray(list)) {
      nodeDataPositionedCount += list.length;
    }
  }

  // Boss count verified against data.win SPRT names (both Phase 1 & Phase 2 present)
  const spriteNames = dataWin.sprites.map((s) => s.name);
  const bossKeysVerified: string[] = [];
  for (const boss of BOSS_SPRITE_CHECKS) {
    const hasP1 = spriteNames.some((n) => boss.p1.test(n));
    const hasP2 = spriteNames.some((n) => boss.p2.test(n));
    if (hasP1 && hasP2) {
      bossKeysVerified.push(boss.id);
    }
  }

  const oracle: OracleDump = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dataWinSize: dataWin.gen8.fileSize,
    bytecodeVersion: dataWin.gen8.bytecodeVersion,
    display: {
      width: dataWin.gen8.defaultWindowWidth,
      height: dataWin.gen8.defaultWindowHeight,
      simHz: dataWin.gen8.simHz,
      tileSize: TILE_SIZE,
    },
    counts: {
      txtr: dataWin.txtr.length,
      sprt: dataWin.sprites.length,
      tpag: dataWin.tpagCount,
      audo: dataWin.audo.length,
      sond: dataWin.sounds.length,
      shdr: dataWin.shdrCount,
      font: dataWin.fontCount,
      ogg: oggFiles.length,
      weaponCount: rawWeapons.length,
      tierCounts,
      classCounts,
      ammoCounts,
      modCount,
      outcastCount,
      nodeCount,
      nodeDataPositionedCount,
      bossCount: bossKeysVerified.length,
    },
    bossKeysVerified,
    weaponsByUniqueId,
  };

  const outPath = path.join(outRoot, 'oracle.json');
  fs.writeFileSync(outPath, JSON.stringify(oracle, null, 2), 'utf8');

  console.log(
    `[oracle] Wrote ${outPath}: ` +
      `${oracle.display.width}x${oracle.display.height} @ ${oracle.display.simHz}Hz | ` +
      `TXTR=${oracle.counts.txtr} SPRT=${oracle.counts.sprt} TPAG=${oracle.counts.tpag} ` +
      `AUDO=${oracle.counts.audo} SOND=${oracle.counts.sond} SHDR=${oracle.counts.shdr} OGG=${oracle.counts.ogg} | ` +
      `weapons=${oracle.counts.weaponCount} mods=${oracle.counts.modCount} outcasts=${oracle.counts.outcastCount} ` +
      `nodes=${oracle.counts.nodeCount} bosses=${oracle.counts.bossCount}`,
  );

  return oracle;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  dumpOracle();
}
