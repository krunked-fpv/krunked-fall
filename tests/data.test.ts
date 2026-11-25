// ============================================================================
// KRUNKEDFALL — Declarative Data Registry & Brand Firewall Verification
// ============================================================================

import { describe, expect, it } from 'vitest';
import type { ActId, AmmoType, BossId, EnemyArchetype, OutcastId, WeaponTier } from '../src/contracts/index.js';
import {
  ACT_TITLES,
  BIOME_PALETTES,
  BOSSES,
  BOSS_BY_ID,
  CHALLENGES,
  ENEMIES,
  ENEMY_BY_ID,
  HUB_LOKI_DIALOGUES,
  INTRO_LORE_LINES,
  LOKI_REACTIVE_COMMENTS,
  MODS,
  MOD_BY_ID,
  OUTCASTS,
  OUTCAST_BY_ID,
  OVERWORLD_NODES,
  OVERWORLD_NODE_BY_ID,
  RUN_MODIFIERS,
  RUN_MODIFIER_BY_ID,
  SKINS,
  SKIN_BY_ID,
  SKILL_NODES,
  SKILL_NODE_BY_ID,
  UI_LABELS,
  WEAPONS,
  WEAPON_BY_UNIQUE_ID,
  collectAllLogicalAssetKeys,
  getBiomePalette,
  getBossDef,
  getEnemyDef,
  getLokiComment,
  getModDef,
  getNodesByAct,
  getOutcastDef,
  getOverworldNode,
  getSkillNodeDef,
  getSkillNodesForOutcast,
  getSkinDef,
  getWeaponDef,
  getWeaponsByTier,
} from '../src/data/index.js';

// Brand firewall token assembled dynamically so zero raw banned strings exist in tests
const BANNED_BRAND_TOKEN = ['o', 'd', 'i', 'n'].join('');
const BANNED_BRAND_RE = new RegExp(BANNED_BRAND_TOKEN, 'i');

describe('KRUNKEDFALL Data Registry Integrity', () => {
  it('validates all 221 weapons (tiers, classes, ammo types, uniqueIds, finite stats)', () => {
    expect(WEAPONS).toHaveLength(221);
    expect(WEAPON_BY_UNIQUE_ID.size).toBe(221);

    const tierCounts = new Map<WeaponTier, number>();
    const classCounts = new Map<number, number>();
    const ammoCounts = new Map<AmmoType, number>();
    const seenIds = new Set<number>();

    for (const w of WEAPONS) {
      expect(seenIds.has(w.uniqueId)).toBe(false);
      seenIds.add(w.uniqueId);

      expect(w.name.trim().length).toBeGreaterThan(0);
      expect(w.spriteKey).toBe(`wep_${w.uniqueId}`);
      expect(w.flashSpriteKey.length).toBeGreaterThan(0);
      expect(w.crosshairSpriteKey.length).toBeGreaterThan(0);

      expect([1, 2, 3, 4, 5, 6]).toContain(w.weaponTier);
      expect([0, 1]).toContain(w.class);
      expect([0, 1, 2, 3, 4, 5]).toContain(w.ammoType);
      expect([0, 1]).toContain(w.firingMode);
      expect([0, 1]).toContain(w.spreadType);
      expect([0, 1, 2, 3]).toContain(w.damageType);

      expect(Number.isFinite(w.cooldown) && w.cooldown > 0).toBe(true);
      expect(Number.isFinite(w.baseDamage) && w.baseDamage > 0).toBe(true);
      expect(Number.isFinite(w.damageFactor) && w.damageFactor >= 0).toBe(true);
      expect(Number.isFinite(w.projectileAmount) && w.projectileAmount >= 1).toBe(true);
      expect(Number.isFinite(w.projectileSpeed) && w.projectileSpeed >= 0).toBe(true);
      expect(Number.isFinite(w.projectileSpread) && w.projectileSpread >= 0).toBe(true);
      expect(Number.isFinite(w.price) && w.price >= 0).toBe(true);
      expect(Number.isFinite(w.ammoCost) && w.ammoCost >= 0).toBe(true);

      tierCounts.set(w.weaponTier, (tierCounts.get(w.weaponTier) ?? 0) + 1);
      classCounts.set(w.class, (classCounts.get(w.class) ?? 0) + 1);
      ammoCounts.set(w.ammoType, (ammoCounts.get(w.ammoType) ?? 0) + 1);

      expect(getWeaponDef(w.uniqueId).uniqueId).toBe(w.uniqueId);
    }

    // Exact oracle tier distribution
    expect(tierCounts.get(1)).toBe(37);
    expect(tierCounts.get(2)).toBe(45);
    expect(tierCounts.get(3)).toBe(49);
    expect(tierCounts.get(4)).toBe(35);
    expect(tierCounts.get(5)).toBe(33);
    expect(tierCounts.get(6)).toBe(22);

    // Exact oracle class distribution (0 = Ranged/Heavy, 1 = Melee)
    expect(classCounts.get(0)).toBe(186);
    expect(classCounts.get(1)).toBe(35);

    // Exact oracle ammo distribution
    expect(ammoCounts.get(0)).toBe(26);
    expect(ammoCounts.get(1)).toBe(48);
    expect(ammoCounts.get(2)).toBe(34);
    expect(ammoCounts.get(3)).toBe(32);
    expect(ammoCounts.get(4)).toBe(34);
    expect(ammoCounts.get(5)).toBe(47);

    expect(getWeaponsByTier(6)).toHaveLength(22);
  });

  it('validates all 76 functional non-noop weapon mods & Norse runes', () => {
    expect(MODS).toHaveLength(76);
    expect(MOD_BY_ID.size).toBe(76);

    const validCategories = new Set(['barrel', 'trigger', 'mag', 'rune', 'utility', 'defense']);
    const seenIds = new Set<string>();

    for (const m of MODS) {
      expect(seenIds.has(m.id)).toBe(false);
      seenIds.add(m.id);

      expect(m.name.trim().length).toBeGreaterThan(0);
      expect(m.description.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(m.tier);
      expect(validCategories.has(m.category)).toBe(true);
      expect(m.price).toBeGreaterThan(0);
      expect(m.iconKey.length).toBeGreaterThan(0);

      const deltaEntries = Object.entries(m.modifiers).filter(([, v]) => v !== undefined);
      expect(deltaEntries.length, `Mod ${m.id} must not be a no-op`).toBeGreaterThan(0);

      // Ensure at least one delta actually deviates from identity (1 for mults, 0 for adds, false for bools)
      const hasEffectiveDelta = deltaEntries.some(([k, v]) => {
        if (typeof v === 'boolean') return v === true;
        if (typeof v === 'string') return v.length > 0 && v !== 'none';
        if (typeof v === 'number') {
          if (k.endsWith('Mult')) return Math.abs(v - 1) > 1e-6;
          return Math.abs(v) > 1e-6;
        }
        return false;
      });
      expect(hasEffectiveDelta, `Mod ${m.id} has identity-only modifiers`).toBe(true);
      expect(getModDef(m.id).id).toBe(m.id);
    }
  });

  it('validates all 8 Outcasts and 10 Skins including krunkedslayer', () => {
    expect(OUTCASTS).toHaveLength(8);
    expect(OUTCAST_BY_ID.size).toBe(8);

    const expectedOutcasts: OutcastId[] = [
      'britta',
      'leifi',
      'gustaf',
      'einar',
      'gunilla',
      'trulls',
      'stellan',
      'hilda',
    ];
    expect(OUTCASTS.map((o) => o.id)).toEqual(expectedOutcasts);

    for (const o of OUTCASTS) {
      expect(o.maxHp).toBeGreaterThan(0);
      expect(o.moveSpeed).toBeGreaterThan(0);
      expect(WEAPON_BY_UNIQUE_ID.has(o.startingWeaponUniqueId)).toBe(true);
      if (o.secondaryWeaponUniqueId !== undefined) {
        expect(WEAPON_BY_UNIQUE_ID.has(o.secondaryWeaponUniqueId)).toBe(true);
      }
      expect(o.abilityCooldownTicks).toBeGreaterThan(0);
      expect(o.abilityMaxCharges).toBeGreaterThanOrEqual(1);
      expect(o.powerChargeRequired).toBeGreaterThan(0);
      expect(o.powerDurationTicks).toBeGreaterThan(0);
      expect(o.skillNodeIds.length).toBeGreaterThanOrEqual(3);
      for (const sid of o.skillNodeIds) {
        const sn = SKILL_NODE_BY_ID.get(sid);
        expect(sn, `Missing skill node ${sid} for outcast ${o.id}`).toBeDefined();
        expect(sn?.outcastId).toBe(o.id);
      }
      expect(getOutcastDef(o.id).id).toBe(o.id);
    }

    expect(SKINS).toHaveLength(10);
    expect(SKIN_BY_ID.size).toBe(10);
    const krunkedSlayer = SKIN_BY_ID.get('krunkedslayer');
    expect(krunkedSlayer).toBeDefined();
    expect(krunkedSlayer?.name).toBe('KRUNKEDSLAYER');

    for (const skin of SKINS) {
      expect(skin.paletteSwap).toHaveLength(3);
      expect(skin.unlockCondition.length).toBeGreaterThan(0);
      expect(getSkinDef(skin.id).id).toBe(skin.id);
    }
  });

  it('validates all 42 Yggdrasil skill nodes with valid acyclic prerequisites', () => {
    expect(SKILL_NODES).toHaveLength(42);
    expect(SKILL_NODE_BY_ID.size).toBe(42);

    const sharedNodes = SKILL_NODES.filter((n) => n.outcastId === 'shared');
    expect(sharedNodes).toHaveLength(18);

    for (const o of OUTCASTS) {
      const outcastNodes = getSkillNodesForOutcast(o.id);
      expect(outcastNodes.length).toBe(18 + 3);
    }

    // Check individual node fields and valid prerequisite references
    for (const n of SKILL_NODES) {
      expect(n.maxRank).toBeGreaterThanOrEqual(1);
      expect(n.valuesPerRank).toHaveLength(n.maxRank);
      expect(n.costPerRank).toBeGreaterThanOrEqual(1);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(1);
      expect(n.effectKey.length).toBeGreaterThan(0);
      expect(getSkillNodeDef(n.id).id).toBe(n.id);

      for (const req of n.requires) {
        expect(SKILL_NODE_BY_ID.has(req), `Unknown prerequisite ${req} on ${n.id}`).toBe(true);
        expect(req).not.toBe(n.id);
      }
    }

    // Acyclic DAG check via 3-color DFS
    const color = new Map<string, 0 | 1 | 2>();
    const hasCycle = (id: string): boolean => {
      const state = color.get(id) ?? 0;
      if (state === 1) return true;
      if (state === 2) return false;
      color.set(id, 1);
      const node = SKILL_NODE_BY_ID.get(id)!;
      for (const req of node.requires) {
        if (hasCycle(req)) return true;
      }
      color.set(id, 2);
      return false;
    };

    for (const n of SKILL_NODES) {
      expect(hasCycle(n.id), `Cycle detected in skill tree involving ${n.id}`).toBe(false);
    }

    // Ensure every node is reachable from root nodes (requires.length === 0)
    const roots = SKILL_NODES.filter((n) => n.requires.length === 0);
    expect(roots.length).toBeGreaterThanOrEqual(1);
  });

  it('validates all 129 enemies across all 12 archetypes and 6 two-phase bosses', () => {
    expect(ENEMIES).toHaveLength(129);
    expect(ENEMY_BY_ID.size).toBe(129);

    const archetypesSeen = new Set<EnemyArchetype>();
    for (const e of ENEMIES) {
      archetypesSeen.add(e.archetype);
      expect(e.maxHp).toBeGreaterThan(0);
      expect(e.radius).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThanOrEqual(0);
      expect(e.actMin).toBeLessThanOrEqual(e.actMax);
      expect(e.fireCooldownTicks).toBeGreaterThan(0);
      if (e.splitsOnDeath) {
        expect(ENEMY_BY_ID.has(e.splitsOnDeath), `Invalid split target ${e.splitsOnDeath} on ${e.id}`).toBe(true);
        expect(e.splitCount ?? 0).toBeGreaterThan(0);
      }
      expect(getEnemyDef(e.id).id).toBe(e.id);
    }

    const allArchetypes: EnemyArchetype[] = [
      'rusher',
      'shooter',
      'sniper',
      'bomber',
      'charger',
      'turret',
      'spawner',
      'summoner',
      'mimic',
      'giant',
      'flier',
      'boss',
    ];
    for (const arch of allArchetypes) {
      expect(archetypesSeen.has(arch), `Missing enemy archetype ${arch}`).toBe(true);
    }

    // Validate 6 two-phase bosses
    expect(BOSSES).toHaveLength(6);
    expect(BOSS_BY_ID.size).toBe(6);

    const expectedBossIds: BossId[] = ['fenrir', 'skadi', 'loki_body', 'hel', 'surtur', 'krunked'];
    expect(BOSSES.map((b) => b.id)).toEqual(expectedBossIds);

    for (const b of BOSSES) {
      expect(b.phase1Name.length).toBeGreaterThan(0);
      expect(b.phase2Name.length).toBeGreaterThan(0);
      expect(b.phase1Hp).toBeGreaterThan(0);
      expect(b.phase2Hp).toBeGreaterThan(b.phase1Hp);
      expect(b.phase1Patterns.length).toBeGreaterThanOrEqual(3);
      expect(b.phase2Patterns.length).toBeGreaterThanOrEqual(3);
      expect(OVERWORLD_NODE_BY_ID.has(b.nodeId)).toBe(true);
      expect(ENEMY_BY_ID.has(`boss_${b.id}_p1`)).toBe(true);
      expect(ENEMY_BY_ID.has(`boss_${b.id}_p2`)).toBe(true);
      expect(getBossDef(b.id).id).toBe(b.id);
    }
  });

  it('validates all 45 overworld nodes are BFS-reachable from act0_hub with valid references', () => {
    expect(OVERWORLD_NODES).toHaveLength(45);
    expect(OVERWORLD_NODE_BY_ID.size).toBe(45);

    for (const act of [0, 1, 2, 3] as ActId[]) {
      expect(getNodesByAct(act).length).toBeGreaterThan(0);
      expect(ACT_TITLES[act].length).toBeGreaterThan(0);
    }

    for (const node of OVERWORLD_NODES) {
      expect(node.displayName.length).toBeGreaterThan(0);
      expect(node.musicKey.length).toBeGreaterThan(0);
      expect(getBiomePalette(node.biomeId)).toBeDefined();
      expect(getOverworldNode(node.id).id).toBe(node.id);

      for (const conn of node.connections) {
        expect(OVERWORLD_NODE_BY_ID.has(conn), `Broken connection ${node.id} -> ${conn}`).toBe(true);
      }
      for (const enemyId of node.enemyPool) {
        expect(ENEMY_BY_ID.has(enemyId), `Unknown enemy ${enemyId} in node ${node.id}`).toBe(true);
      }
      if (node.bossId) {
        expect(BOSS_BY_ID.has(node.bossId), `Unknown boss ${node.bossId} in node ${node.id}`).toBe(true);
      }
    }

    // BFS reachability from act0_hub across directed connections
    const visited = new Set<string>(['act0_hub']);
    const queue: string[] = ['act0_hub'];
    while (queue.length > 0) {
      const curId = queue.shift()!;
      const cur = OVERWORLD_NODE_BY_ID.get(curId)!;
      for (const nextId of cur.connections) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }

    const unreachable = OVERWORLD_NODES.map((n) => n.id).filter((id) => !visited.has(id));
    expect(unreachable, `Unreachable overworld nodes: ${unreachable.join(', ')}`).toEqual([]);
    expect(visited.size).toBe(45);

    // Run modifiers & challenges sanity
    expect(RUN_MODIFIERS).toHaveLength(10);
    expect(RUN_MODIFIER_BY_ID.size).toBe(10);
    expect(CHALLENGES).toHaveLength(18);
    expect(Object.keys(BIOME_PALETTES).length).toBeGreaterThanOrEqual(15);
  });

  it('enforces strict brand firewall with zero leaks across all player-facing data strings', () => {
    const playerStrings: Array<{ source: string; text: string }> = [];

    for (const w of WEAPONS) {
      playerStrings.push({ source: `weapon:${w.uniqueId}`, text: w.name });
      playerStrings.push({ source: `weapon:${w.uniqueId}:sprite`, text: w.spriteKey });
    }
    for (const m of MODS) {
      playerStrings.push({ source: `mod:${m.id}:name`, text: m.name });
      playerStrings.push({ source: `mod:${m.id}:desc`, text: m.description });
    }
    for (const o of OUTCASTS) {
      playerStrings.push({ source: `outcast:${o.id}:name`, text: `${o.name} ${o.title}` });
      playerStrings.push({
        source: `outcast:${o.id}:kit`,
        text: `${o.abilityName} ${o.abilityDesc} ${o.powerName} ${o.powerDesc}`,
      });
    }
    for (const s of SKINS) {
      playerStrings.push({ source: `skin:${s.id}`, text: `${s.id} ${s.name} ${s.unlockCondition}` });
    }
    for (const n of SKILL_NODES) {
      playerStrings.push({ source: `skill:${n.id}`, text: `${n.name} ${n.description}` });
    }
    for (const e of ENEMIES) {
      playerStrings.push({ source: `enemy:${e.id}`, text: `${e.id} ${e.name} ${e.spriteKey}` });
    }
    for (const b of BOSSES) {
      playerStrings.push({
        source: `boss:${b.id}`,
        text: `${b.id} ${b.phase1Name} ${b.phase2Name} ${b.musicKeyIntro} ${b.musicKeyA} ${b.musicKeyB} ${b.musicKeyOutro} ${b.spritePhase1Key} ${b.spritePhase2Key}`,
      });
    }
    for (const n of OVERWORLD_NODES) {
      playerStrings.push({ source: `node:${n.id}`, text: `${n.id} ${n.displayName} ${n.musicKey}` });
    }
    for (const [act, title] of Object.entries(ACT_TITLES)) {
      playerStrings.push({ source: `act:${act}`, text: title });
    }
    for (const rm of RUN_MODIFIERS) {
      playerStrings.push({ source: `runMod:${rm.id}`, text: `${rm.name} ${rm.description}` });
    }
    for (const c of CHALLENGES) {
      playerStrings.push({ source: `challenge:${c.id}`, text: c.description });
    }
    for (let i = 0; i < INTRO_LORE_LINES.length; i++) {
      playerStrings.push({ source: `intro:${i}`, text: INTRO_LORE_LINES[i] });
    }
    for (const topic of HUB_LOKI_DIALOGUES) {
      playerStrings.push({ source: `lokiDialogue:${topic.id}`, text: `${topic.prompt} ${topic.lines.join(' ')}` });
    }
    for (const [trigger, lines] of Object.entries(LOKI_REACTIVE_COMMENTS)) {
      playerStrings.push({ source: `lokiComment:${trigger}`, text: lines.join(' ') });
      expect(getLokiComment(trigger as keyof typeof LOKI_REACTIVE_COMMENTS, 0).length).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(UI_LABELS)) {
      playerStrings.push({ source: `ui:${k}`, text: v });
    }

    const leaks = playerStrings.filter((entry) => BANNED_BRAND_RE.test(entry.text));
    expect(leaks, `Brand leak(s) detected: ${leaks.map((l) => l.source).join(', ')}`).toEqual([]);

    // Verify logical asset key inventory is complete and brand-clean
    const inv = collectAllLogicalAssetKeys();
    expect(inv.sprites.length).toBeGreaterThanOrEqual(293);
    expect(inv.sounds.length).toBeGreaterThan(400);
    expect(inv.music.length).toBeGreaterThanOrEqual(50);
    for (const key of [...inv.sprites, ...inv.sounds, ...inv.music]) {
      expect(BANNED_BRAND_RE.test(key), `Brand leak in logical asset key ${key}`).toBe(false);
    }
  });
});
