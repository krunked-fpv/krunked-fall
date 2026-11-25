// ============================================================================
// KRUNKEDFALL — Gate A Asset, Brand Firewall & Oracle Parity Verifier
// ============================================================================
// Works both locally (with extracted `.krunkedfall-assets/`) and gracefully
// in CI (without retail files).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  BossDef,
  ModDef,
  OutcastDef,
  PackManifest,
  SkinDef,
  WeaponDef,
} from '../../src/contracts/index';
import type { OracleDump } from '../../tools/oracle-dump';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, '.krunkedfall-assets');
const BANNED_BRAND = ['o', 'd', 'i', 'n'].join('');
const BANNED_BRAND_RE = new RegExp(BANNED_BRAND, 'i');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CORE_SPRITE_ALIASES = [
  'outcast_britta',
  'outcast_leifi',
  'outcast_gustaf',
  'outcast_einar',
  'outcast_gunilla',
  'outcast_trulls',
  'outcast_stellan',
  'outcast_hilda',
  'boss_fenrir_p1',
  'boss_fenrir_p2',
  'boss_skadi_p1',
  'boss_skadi_p2',
  'boss_loki_body_p1',
  'boss_loki_body_p2',
  'boss_hel_p1',
  'boss_hel_p2',
  'boss_surtur_p1',
  'boss_surtur_p2',
  'boss_krunked_p1',
  'boss_krunked_p2',
  'tile_floor',
  'tile_wall',
  'tile_wall_broken',
  'fx_muzzle_flash',
  'fx_explosion',
  'fx_bifrost',
  'hud_crosshair',
  'hud_heart',
  'pickup_hp',
  'pickup_ammo',
  'pickup_gold',
  'pickup_chest',
  'enemy_default',
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
];

const CORE_MUSIC_ALIASES = [
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
  'music_menu',
  'music_hub',
  'music_worldmap',
  'music_arena',
  'music_canyon',
  'music_ashwastes',
  'music_darkcity',
  'music_jotunheim',
  'music_helheim',
  'music_muspelheim',
  'music_lavaland',
  'music_forest',
  'music_sewer',
  'music_losttemple',
  'music_shrine',
  'music_cindercity',
  'music_redhall',
  'music_sulfurlake',
  'music_snowstorm_heavy',
  'music_snowstorm_light',
  'music_shop',
];

const failures: string[] = [];

function fail(msg: string): void {
  failures.push(msg);
  console.error(`  [FAIL] ${msg}`);
}

function pass(msg: string): void {
  console.log(`  [PASS] ${msg}`);
}

function info(msg: string): void {
  console.log(`  [INFO] ${msg}`);
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function resolveKeyInManifest(
  manifest: PackManifest,
  key: string,
  kind: 'sprite' | 'sound' | 'music',
): string | null {
  const mapped = manifest.logicalAliases?.[key] ?? key;
  if (kind === 'sprite') {
    if (manifest.sprites[mapped]) return mapped;
    if (manifest.sprites[key]) return key;
    return null;
  }
  if (kind === 'sound') {
    if (manifest.sounds[mapped]) return mapped;
    if (manifest.sounds[key]) return key;
    if (manifest.music[mapped]) return mapped;
    return null;
  }
  if (manifest.music[mapped]) return mapped;
  if (manifest.music[key]) return key;
  return null;
}

// ============================================================================
// CHECK 1: IP FIREWALL (git ls-files & dist/)
// ============================================================================
function checkIpFirewall(): void {
  console.log('[Gate A / 1] IP Firewall');
  const forbiddenExt = /\.(win|ogg|wav)$/i;

  try {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const leakedTracked = tracked.filter(
      (f) => forbiddenExt.test(f) || f.replace(/\\/g, '/').startsWith('.krunkedfall-assets/'),
    );
    if (leakedTracked.length > 0) {
      fail(`Tracked retail/extracted files in git: ${leakedTracked.slice(0, 10).join(', ')}`);
    } else {
      pass(`git ls-files clean (${tracked.length} tracked files, 0 retail binaries or .krunkedfall-assets/)`);
    }
  } catch (err) {
    fail(`git ls-files check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(distDir)) {
    const distFiles = walkFiles(distDir).map((f) => path.relative(ROOT, f).replace(/\\/g, '/'));
    const leakedDist = distFiles.filter(
      (f) => forbiddenExt.test(f) || f.includes('.krunkedfall-assets/'),
    );
    if (leakedDist.length > 0) {
      fail(`Leaked retail files in dist/: ${leakedDist.slice(0, 10).join(', ')}`);
    } else {
      pass(`dist/ clean (${distFiles.length} built files, 0 retail binaries)`);
    }
  } else {
    info('dist/ not built yet — skipping dist/ IP scan');
  }
}

// ============================================================================
// CHECK 2: BRAND FIREWALL (src/ & dist/)
// ============================================================================
function checkBrandFirewall(): void {
  console.log('[Gate A / 2] Brand Firewall');
  const textExts = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.css',
    '.html',
    '.json',
    '.svg',
    '.glsl',
    '.vert',
    '.frag',
  ]);

  const scanRoot = (dirName: string): void => {
    const fullDir = path.join(ROOT, dirName);
    if (!fs.existsSync(fullDir)) {
      info(`${dirName}/ not present — skipping`);
      return;
    }
    const files = walkFiles(fullDir).filter((f) => textExts.has(path.extname(f).toLowerCase()));
    const hits: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (BANNED_BRAND_RE.test(lines[i])) {
          hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      }
    }
    if (hits.length > 0) {
      fail(
        `Brand leak detected in ${dirName}/ (${hits.length} hit(s)): ${hits.slice(0, 10).join(', ')}`,
      );
    } else {
      pass(`${dirName}/ brand-clean across ${files.length} files (0 leaks)`);
    }
  };

  scanRoot('src');
  scanRoot('dist');
}

// ============================================================================
// CHECK 3: BUILT-IN PACK & DATA REGISTRY INTEGRITY
// ============================================================================
interface LoadedDataModule {
  WEAPONS?: readonly WeaponDef[];
  MODS?: readonly ModDef[];
  OUTCASTS?: readonly OutcastDef[];
  SKINS?: readonly SkinDef[];
  BOSSES?: readonly BossDef[];
  OVERWORLD_NODES?: readonly unknown[];
  BIOME_NODES?: readonly unknown[];
  NODES?: readonly unknown[];
  collectAllLogicalAssetKeys?: () => { sprites: string[]; sounds: string[]; music: string[] };
}

interface LoadedAssetsModule {
  getBuiltinPackManifest?: () => PackManifest;
}

async function checkDataAndBuiltinPack(): Promise<{
  dataMod: LoadedDataModule | null;
  logicalKeys: { sprites: string[]; sounds: string[]; music: string[] } | null;
}> {
  console.log('[Gate A / 3] Built-In Pack & Data Registry Integrity');
  let dataMod: LoadedDataModule | null = null;
  let logicalKeys: { sprites: string[]; sounds: string[]; music: string[] } | null = null;

  const dataIndexPath = path.join(ROOT, 'src', 'data', 'index.ts');
  if (fs.existsSync(dataIndexPath)) {
    dataMod = (await import(pathToFileURL(dataIndexPath).href)) as LoadedDataModule;

    const weapons = dataMod.WEAPONS ?? [];
    if (weapons.length !== 221) {
      fail(`Expected 221 weapons in src/data, found ${weapons.length}`);
    } else {
      const tiers = new Set(weapons.map((w) => w.weaponTier));
      const ammos = new Set(weapons.map((w) => w.ammoType));
      if (tiers.size !== 6) {
        fail(`Expected 6 weapon tiers in src/data, found ${tiers.size}`);
      } else if (ammos.size !== 6) {
        fail(`Expected 6 ammo types in src/data, found ${ammos.size}`);
      } else {
        pass('src/data WEAPONS verified: 221 weapons, 6 tiers, 6 ammo types');
      }
    }

    const mods = dataMod.MODS ?? [];
    if (mods.length !== 76) {
      fail(`Expected 76 mods in src/data, found ${mods.length}`);
    } else {
      const emptyMods = mods.filter((m) => Object.keys(m.modifiers ?? {}).length === 0);
      if (emptyMods.length > 0) {
        fail(`Found ${emptyMods.length} no-op mods with empty modifiers`);
      } else {
        pass('src/data MODS verified: 76 functional mods');
      }
    }

    const outcasts = dataMod.OUTCASTS ?? [];
    if (outcasts.length !== 8) {
      fail(`Expected 8 outcasts in src/data, found ${outcasts.length}`);
    } else {
      pass('src/data OUTCASTS verified: 8 playable Outcasts');
    }

    const skins = dataMod.SKINS ?? [];
    const hasKrunkedslayer = skins.some(
      (s) => s.id === 'krunkedslayer' && /krunkedslayer/i.test(s.name),
    );
    if (skins.length !== 10 || !hasKrunkedslayer) {
      fail(
        `Expected 10 skins including KRUNKEDSLAYER in src/data, found ${skins.length} (hasKrunkedslayer=${hasKrunkedslayer})`,
      );
    } else {
      pass('src/data SKINS verified: 10 skins including KRUNKEDSLAYER');
    }

    const nodes = dataMod.OVERWORLD_NODES ?? dataMod.BIOME_NODES ?? dataMod.NODES ?? [];
    if (nodes.length < 43) {
      fail(`Expected >= 43 overworld nodes in src/data, found ${nodes.length}`);
    } else {
      pass(`src/data OVERWORLD_NODES verified: ${nodes.length} nodes`);
    }

    const bosses = dataMod.BOSSES ?? [];
    const validBosses = bosses.filter((b) => Boolean(b.phase1Name) && Boolean(b.phase2Name));
    if (bosses.length !== 6 || validBosses.length !== 6) {
      fail(`Expected 6 two-phase bosses in src/data, found ${bosses.length} (valid=${validBosses.length})`);
    } else {
      pass('src/data BOSSES verified: 6 two-phase major bosses');
    }

    if (typeof dataMod.collectAllLogicalAssetKeys === 'function') {
      logicalKeys = dataMod.collectAllLogicalAssetKeys();
      info(
        `Collected logical keys from src/data: ${logicalKeys.sprites.length} sprites, ` +
          `${logicalKeys.sounds.length} sounds, ${logicalKeys.music.length} music`,
      );
    }
  } else {
    info('src/data/index.ts not yet present in this worktree — skipping data registry assertions');
  }

  const assetsIndexPath = path.join(ROOT, 'src', 'assets', 'index.ts');
  if (fs.existsSync(assetsIndexPath)) {
    const assetsMod = (await import(pathToFileURL(assetsIndexPath).href)) as LoadedAssetsModule;
    if (typeof assetsMod.getBuiltinPackManifest === 'function') {
      const builtinManifest = assetsMod.getBuiltinPackManifest();
      const spriteKeysToCheck = new Set<string>([
        ...CORE_SPRITE_ALIASES,
        ...(logicalKeys?.sprites ?? []),
      ]);
      const missingSprites: string[] = [];
      for (const key of spriteKeysToCheck) {
        if (!resolveKeyInManifest(builtinManifest, key, 'sprite')) {
          missingSprites.push(key);
        }
      }
      if (missingSprites.length > 0) {
        fail(
          `Built-In Pack missing ${missingSprites.length} logical sprite key(s): ${missingSprites.slice(0, 12).join(', ')}`,
        );
      } else {
        pass(
          `Built-In Pack resolved all ${spriteKeysToCheck.size} logical sprite keys cleanly`,
        );
      }
    } else {
      fail('src/assets/index.ts exists but does not export getBuiltinPackManifest()');
    }
  } else {
    info('src/assets/index.ts not yet present in this worktree — skipping Built-In Pack assertions');
  }

  return { dataMod, logicalKeys };
}

// ============================================================================
// CHECK 4: LOCAL RETAIL PACK & ORACLE PARITY (when .krunkedfall-assets exists)
// ============================================================================
function checkLocalPackAndOracle(
  dataMod: LoadedDataModule | null,
  logicalKeys: { sprites: string[]; sounds: string[]; music: string[] } | null,
): void {
  console.log('[Gate A / 4] Local Retail Pack & Oracle Parity');
  const manifestPath = path.join(ASSETS_DIR, 'manifest.json');
  const oraclePath = path.join(ASSETS_DIR, 'oracle.json');

  if (!fs.existsSync(manifestPath) || !fs.existsSync(oraclePath)) {
    info(
      '[SKIP/CI] .krunkedfall-assets/manifest.json or oracle.json not present — skipping local retail pack checks (CI-safe)',
    );
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackManifest;
  const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8')) as OracleDump;

  // 4a. Verify Oracle ground-truth counts
  const c = oracle.counts;
  if (oracle.display.width !== 640 || oracle.display.height !== 360 || oracle.display.simHz !== 60) {
    fail(
      `Oracle display mismatch: got ${oracle.display.width}x${oracle.display.height}@${oracle.display.simHz}Hz`,
    );
  } else {
    pass('Oracle display parity: 640x360 @ 60 Hz');
  }

  if (
    c.txtr !== 127 ||
    c.sprt !== 6200 ||
    c.tpag !== 35495 ||
    c.audo !== 435 ||
    c.sond !== 518 ||
    c.shdr !== 76 ||
    c.ogg !== 83 ||
    c.weaponCount !== 221 ||
    c.modCount !== 76 ||
    c.outcastCount !== 8 ||
    c.nodeCount < 43 ||
    c.bossCount !== 6
  ) {
    fail(`Oracle inventory count mismatch: ${JSON.stringify(c)}`);
  } else {
    pass(
      `Oracle inventory parity: TXTR=${c.txtr}, SPRT=${c.sprt}, TPAG=${c.tpag}, AUDO=${c.audo}, ` +
        `SOND=${c.sond}, SHDR=${c.shdr}, OGG=${c.ogg}, weapons=${c.weaponCount}, mods=${c.modCount}, ` +
        `outcasts=${c.outcastCount}, nodes=${c.nodeCount}, bosses=${c.bossCount}`,
    );
  }

  // 4b. Verify all 127 PNG pages exist and have valid PNG signatures
  if (manifest.pageCount !== 127 || manifest.pages.length !== 127) {
    fail(`Custom Pack manifest pageCount mismatch: ${manifest.pageCount}/${manifest.pages.length}`);
  } else {
    let invalidPages = 0;
    const sigBuf = Buffer.alloc(8);
    for (const p of manifest.pages) {
      const fullPath = path.join(ASSETS_DIR, p.file);
      if (!fs.existsSync(fullPath)) {
        invalidPages++;
        continue;
      }
      const fd = fs.openSync(fullPath, 'r');
      fs.readSync(fd, sigBuf, 0, 8, 0);
      fs.closeSync(fd);
      if (!sigBuf.equals(PNG_SIGNATURE)) {
        invalidPages++;
      }
    }
    if (invalidPages > 0) {
      fail(`Custom Pack has ${invalidPages} missing or invalid PNG page(s)`);
    } else {
      pass('Custom Pack verified: all 127 PNG pages exist with valid PNG headers');
    }
  }

  // 4c. Verify Custom Pack sprite, sound, and music inventories
  const sprCount = Object.keys(manifest.sprites).length;
  const sndCount = Object.keys(manifest.sounds).length;
  const musCount = Object.keys(manifest.music).length;
  if (sprCount !== 6200 || sndCount !== 435 || musCount !== 83) {
    fail(
      `Custom Pack inventory mismatch: sprites=${sprCount} (6200), sounds=${sndCount} (435), music=${musCount} (83)`,
    );
  } else {
    pass(`Custom Pack inventory verified: ${sprCount} sprites, ${sndCount} WAVs, ${musCount} OGGs`);
  }

  // 4d. Verify every logical sprite/sound/music key resolves in Custom Pack manifest
  const weaponSpriteKeys = Object.keys(oracle.weaponsByUniqueId).map((uid) => `wep_${uid}`);
  const spriteKeys = new Set<string>([
    ...CORE_SPRITE_ALIASES,
    ...weaponSpriteKeys,
    ...(logicalKeys?.sprites ?? []),
  ]);
  const missingCustomSprites: string[] = [];
  for (const key of spriteKeys) {
    if (!resolveKeyInManifest(manifest, key, 'sprite')) {
      missingCustomSprites.push(key);
    }
  }
  if (missingCustomSprites.length > 0) {
    fail(
      `Custom Pack missing ${missingCustomSprites.length} logical sprite key(s): ${missingCustomSprites.slice(0, 12).join(', ')}`,
    );
  } else {
    pass(`Custom Pack resolved all ${spriteKeys.size} logical sprite keys cleanly`);
  }

  const musicKeys = new Set<string>([
    ...CORE_MUSIC_ALIASES,
    ...(logicalKeys?.music ?? []),
  ]);
  const missingCustomMusic: string[] = [];
  for (const key of musicKeys) {
    const resolved = resolveKeyInManifest(manifest, key, 'music');
    if (!resolved || !fs.existsSync(path.join(ASSETS_DIR, manifest.music[resolved]))) {
      missingCustomMusic.push(key);
    }
  }
  if (missingCustomMusic.length > 0) {
    fail(
      `Custom Pack missing ${missingCustomMusic.length} logical music key(s): ${missingCustomMusic.slice(0, 12).join(', ')}`,
    );
  } else {
    pass(`Custom Pack resolved all ${musicKeys.size} logical music keys with OGG files on disk`);
  }

  const soundKeys = new Set<string>(logicalKeys?.sounds ?? []);
  for (const w of Object.values(oracle.weaponsByUniqueId)) {
    if (w.soundFireId !== null) {
      soundKeys.add(`sfx_wep_${w.uniqueId}_fire`);
    }
  }
  const missingCustomSounds: string[] = [];
  for (const key of soundKeys) {
    const resolved = resolveKeyInManifest(manifest, key, 'sound');
    if (!resolved) {
      missingCustomSounds.push(key);
      continue;
    }
    const relFile = manifest.sounds[resolved]?.file ?? manifest.music[resolved];
    if (!relFile || !fs.existsSync(path.join(ASSETS_DIR, relFile))) {
      missingCustomSounds.push(key);
    }
  }
  if (missingCustomSounds.length > 0) {
    fail(
      `Custom Pack missing ${missingCustomSounds.length} logical sound key(s): ${missingCustomSounds.slice(0, 12).join(', ')}`,
    );
  } else {
    pass(`Custom Pack resolved all ${soundKeys.size} logical sound keys with audio files on disk`);
  }

  // 4e. Cross-check src/data WEAPONS stats against oracle.json
  if (dataMod?.WEAPONS && dataMod.WEAPONS.length > 0) {
    const mismatches: string[] = [];
    const fieldsToCheck: Array<
      keyof Pick<
        WeaponDef,
        | 'uniqueId'
        | 'weaponTier'
        | 'class'
        | 'ammoType'
        | 'cooldown'
        | 'projectileAmount'
        | 'projectileSpeed'
        | 'projectileSpread'
        | 'spriteRecoil'
      >
    > = [
      'uniqueId',
      'weaponTier',
      'class',
      'ammoType',
      'cooldown',
      'projectileAmount',
      'projectileSpeed',
      'projectileSpread',
      'spriteRecoil',
    ];

    for (const w of dataMod.WEAPONS) {
      const ref = oracle.weaponsByUniqueId[String(w.uniqueId)];
      if (!ref) {
        mismatches.push(`uniqueId=${w.uniqueId} not found in oracle.json`);
        continue;
      }
      for (const field of fieldsToCheck) {
        const actual = w[field];
        const expected = ref[field];
        if (Math.abs(Number(actual) - Number(expected)) > 1e-4) {
          mismatches.push(`wep_${w.uniqueId}.${field}: got ${actual}, expected ${expected}`);
        }
      }
    }

    if (mismatches.length > 0) {
      fail(
        `Weapon oracle stat mismatches (${mismatches.length}): ${mismatches.slice(0, 10).join('; ')}`,
      );
    } else {
      pass(
        `Cross-checked all ${dataMod.WEAPONS.length} src/data weapons against oracle.json (100% stat parity)`,
      );
    }
  }
}

async function main(): Promise<void> {
  console.log('=== KRUNKEDFALL Gate A: Asset, Brand Firewall & Oracle Verification ===');
  checkIpFirewall();
  checkBrandFirewall();
  const { dataMod, logicalKeys } = await checkDataAndBuiltinPack();
  checkLocalPackAndOracle(dataMod, logicalKeys);

  if (failures.length > 0) {
    console.error(`\n[Gate A FAILED] ${failures.length} failure(s) detected.`);
    process.exit(1);
  }
  console.log('\n[Gate A PASSED] All asset, firewall, and oracle checks passed.');
}

main().catch((err) => {
  console.error('[Gate A FATAL]', err);
  process.exit(1);
});
