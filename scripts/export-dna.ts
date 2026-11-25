// ============================================================================
// KRUNKEDFALL — Idempotent Central Mashup DNA Vault Exporter
// ============================================================================
// Copies GAME_DNA.md and dna/genome.json into C:\KrunkedVault\games\krunkedfall\
// and idempotently creates or upserts Krunkedfall's summary row inside
// C:\KrunkedVault\CATALOG.md without ever modifying or dirtying C:\krunked-fall.

import fs from 'node:fs';
import path from 'node:path';

interface GenomeJson {
  slug: string;
  brandName: string;
  sourceGenre: string;
  simHz: number;
  renderMode: string;
  coreMechanics: string[];
  spliceableModules: Array<{ name: string; paths: string[]; contracts: string[] }>;
  repoPath: string;
  buildDate: string;
}

const REPO_ROOT = process.cwd();
const VAULT_ROOT = process.env.KRUNKED_VAULT_DIR ?? 'C:\\KrunkedVault';
const DNA_MD_SRC = path.join(REPO_ROOT, 'GAME_DNA.md');
const GENOME_SRC = path.join(REPO_ROOT, 'dna', 'genome.json');

const CATALOG_HEADER = [
  '# Krunked Game DNA Vault — Master Catalog',
  '',
  '| Krunked Title | Source Genre | Sim/Render | Signature Mechanics & Feel | Spliceable Modules | Local Repo Path |',
  '| --- | --- | --- | --- | --- | --- |',
];

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function main(): void {
  if (!fs.existsSync(DNA_MD_SRC)) {
    throw new Error(`Missing source blueprint: ${DNA_MD_SRC}`);
  }
  if (!fs.existsSync(GENOME_SRC)) {
    throw new Error(`Missing source genome: ${GENOME_SRC}`);
  }

  const genome = JSON.parse(fs.readFileSync(GENOME_SRC, 'utf8')) as GenomeJson;
  const gameVaultDir = path.join(VAULT_ROOT, 'games', genome.slug);
  fs.mkdirSync(gameVaultDir, { recursive: true });

  const destDna = path.join(gameVaultDir, 'GAME_DNA.md');
  const destGenome = path.join(gameVaultDir, 'genome.json');
  fs.copyFileSync(DNA_MD_SRC, destDna);
  fs.copyFileSync(GENOME_SRC, destGenome);

  const signatureFeel =
    '221 weapons x 76 mods, 8 Outcasts, 6 two-phase bosses, swept destructible cover, Fimbulwinter anti-camping storm, dual Built-In/Custom pixel packs';
  const spliceableSummary = genome.spliceableModules.map((m) => m.name).join(', ');
  const row = `| ${escapeCell(genome.brandName)} | ${escapeCell(genome.sourceGenre)} | ${genome.simHz} Hz / ${escapeCell(genome.renderMode)} | ${escapeCell(signatureFeel)} | ${escapeCell(spliceableSummary)} | \`${escapeCell(genome.repoPath)}\` |`;

  const catalogPath = path.join(VAULT_ROOT, 'CATALOG.md');
  let lines: string[];
  if (fs.existsSync(catalogPath)) {
    const existing = fs.readFileSync(catalogPath, 'utf8').split(/\r?\n/);
    // Ensure header exists
    const hasTableHeader = existing.some((l) => l.startsWith('| Krunked Title |'));
    lines = hasTableHeader ? [...existing] : [...CATALOG_HEADER, ...existing.filter((l) => l.trim().length > 0)];
    // Remove trailing empty lines before upserting
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    const rowPrefix = `| ${escapeCell(genome.brandName)} |`;
    const matchIdx = lines.findIndex((l) => l.startsWith(rowPrefix));
    if (matchIdx >= 0) {
      lines[matchIdx] = row;
    } else {
      lines.push(row);
    }
  } else {
    lines = [...CATALOG_HEADER, row];
  }

  fs.writeFileSync(catalogPath, lines.join('\n') + '\n', 'utf8');

  console.log(`[export:dna] Synced GAME_DNA.md -> ${destDna}`);
  console.log(`[export:dna] Synced genome.json -> ${destGenome}`);
  console.log(`[export:dna] Upserted catalog row -> ${catalogPath}`);
}

main();
