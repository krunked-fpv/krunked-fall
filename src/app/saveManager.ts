// ============================================================================
// KRUNKEDFALL — Persistent Save Manager (Schema Validation & Corruption Guard)
// ============================================================================
// Persists operator progress, Outcast/Skin selections, Yggdrasil Skill Tree
// ranks, Weapondex/Enemydex discoveries, Challenges, Run Modifiers, Render &
// Audio Settings, and Keybinds under `SAVE_STORAGE_KEY`.

import {
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  type AssetPackMode,
  type AudioSettings,
  type BossId,
  type ControllerSettings,
  type OutcastId,
  type RenderSettings,
  type SaveData,
  type SimState,
  type SkinId,
  type TargetFps,
} from '../contracts/index.js';
import {
  BOSS_BY_ID,
  CHALLENGES,
  ENEMY_BY_ID,
  OUTCASTS,
  OUTCAST_BY_ID,
  RUN_MODIFIER_BY_ID,
  SKILL_NODE_BY_ID,
  SKIN_BY_ID,
  WEAPON_BY_UNIQUE_ID,
} from '../data/index.js';
import { DEFAULT_AUDIO_SETTINGS } from '../audio/index.js';
import { DEFAULT_CONTROLLER_SETTINGS, DEFAULT_KEYBINDS } from '../input/index.js';

export const DEFAULT_RENDER_SETTINGS: Readonly<RenderSettings> = {
  targetFps: 120,
  pixelSnap60: false,
  screenshakeScale: 1.0,
  lightingEnabled: true,
  bloodEnabled: true,
  packMode: 'builtin',
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function safeNonNegInt(val: unknown, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.floor(val));
}

function buildDefaultSelectedSkins(): Record<OutcastId, SkinId> {
  return {
    britta: 'original',
    leifi: 'original',
    gustaf: 'original',
    einar: 'original',
    gunilla: 'original',
    trulls: 'original',
    stellan: 'original',
    hilda: 'original',
  };
}

export function createDefaultSaveData(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    selectedOutcast: 'britta',
    selectedSkins: buildDefaultSelectedSkins(),
    unlockedOutcasts: OUTCASTS.map((o) => o.id),
    unlockedSkins: ['original'],
    skillRanks: {},
    unspentSkillPoints: 2,
    totalKills: 0,
    totalRuns: 0,
    bestLoop: 0,
    discoveredWeapons: [1015, 1001],
    discoveredEnemies: [],
    defeatedBosses: [],
    completedChallenges: [],
    activeModifiers: [],
    renderSettings: { ...DEFAULT_RENDER_SETTINGS },
    audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
    controllerSettings: { ...DEFAULT_CONTROLLER_SETTINGS },
    keybinds: { ...DEFAULT_KEYBINDS },
  };
}

/**
 * Validates and sanitizes an arbitrary parsed payload into a guaranteed clean
 * `SaveData` object without ever throwing on corrupt or outdated saves.
 */
export function sanitizeSaveData(raw: unknown): SaveData {
  const defaults = createDefaultSaveData();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  // Outcast selection
  const selectedOutcast: OutcastId =
    typeof obj.selectedOutcast === 'string' && OUTCAST_BY_ID.has(obj.selectedOutcast as OutcastId)
      ? (obj.selectedOutcast as OutcastId)
      : defaults.selectedOutcast;

  // Per-outcast skin selection
  const selectedSkins = buildDefaultSelectedSkins();
  if (obj.selectedSkins && typeof obj.selectedSkins === 'object') {
    const rawSkins = obj.selectedSkins as Record<string, unknown>;
    for (const o of OUTCASTS) {
      const candidate = rawSkins[o.id];
      if (typeof candidate === 'string' && SKIN_BY_ID.has(candidate as SkinId)) {
        selectedSkins[o.id] = candidate as SkinId;
      }
    }
  }

  // Unlocked outcasts (always keep all 8 playable Outcasts accessible)
  const unlockedOutcastSet = new Set<OutcastId>(OUTCASTS.map((o) => o.id));
  if (Array.isArray(obj.unlockedOutcasts)) {
    for (const id of obj.unlockedOutcasts) {
      if (typeof id === 'string' && OUTCAST_BY_ID.has(id as OutcastId)) {
        unlockedOutcastSet.add(id as OutcastId);
      }
    }
  }

  // Unlocked skins
  const unlockedSkinSet = new Set<SkinId>(['original']);
  if (Array.isArray(obj.unlockedSkins)) {
    for (const id of obj.unlockedSkins) {
      if (typeof id === 'string' && SKIN_BY_ID.has(id as SkinId)) {
        unlockedSkinSet.add(id as SkinId);
      }
    }
  }

  // Yggdrasil skill ranks
  const skillRanks: Record<string, number> = {};
  if (obj.skillRanks && typeof obj.skillRanks === 'object') {
    for (const [nodeId, rank] of Object.entries(obj.skillRanks as Record<string, unknown>)) {
      const def = SKILL_NODE_BY_ID.get(nodeId);
      if (!def) continue;
      const n = safeNonNegInt(rank, 0);
      if (n > 0) {
        skillRanks[nodeId] = Math.min(def.maxRank, n);
      }
    }
  }

  // Discovered weapons
  const discoveredWeaponSet = new Set<number>(defaults.discoveredWeapons);
  if (Array.isArray(obj.discoveredWeapons)) {
    for (const uid of obj.discoveredWeapons) {
      if (typeof uid === 'number' && WEAPON_BY_UNIQUE_ID.has(uid)) {
        discoveredWeaponSet.add(uid);
      }
    }
  }

  // Discovered enemies
  const discoveredEnemySet = new Set<string>();
  if (Array.isArray(obj.discoveredEnemies)) {
    for (const eid of obj.discoveredEnemies) {
      if (typeof eid === 'string' && ENEMY_BY_ID.has(eid)) {
        discoveredEnemySet.add(eid);
      }
    }
  }

  // Defeated bosses
  const defeatedBossSet = new Set<BossId>();
  if (Array.isArray(obj.defeatedBosses)) {
    for (const bid of obj.defeatedBosses) {
      if (typeof bid === 'string' && BOSS_BY_ID.has(bid as BossId)) {
        defeatedBossSet.add(bid as BossId);
      }
    }
  }

  // Completed challenges
  const validChallengeIds = new Set(CHALLENGES.map((c) => c.id));
  const completedChallengeSet = new Set<string>();
  if (Array.isArray(obj.completedChallenges)) {
    for (const cid of obj.completedChallenges) {
      if (typeof cid === 'string' && validChallengeIds.has(cid)) {
        completedChallengeSet.add(cid);
      }
    }
  }

  // Active run modifiers
  const activeModifierSet = new Set<string>();
  if (Array.isArray(obj.activeModifiers)) {
    for (const mid of obj.activeModifiers) {
      if (typeof mid === 'string' && RUN_MODIFIER_BY_ID.has(mid)) {
        activeModifierSet.add(mid);
      }
    }
  }

  // Render settings
  const rawRender =
    obj.renderSettings && typeof obj.renderSettings === 'object'
      ? (obj.renderSettings as Record<string, unknown>)
      : {};
  const rawFps = rawRender.targetFps;
  const targetFps: TargetFps =
    rawFps === 30 || rawFps === 60 || rawFps === 120
      ? rawFps
      : DEFAULT_RENDER_SETTINGS.targetFps;
  const packMode: AssetPackMode =
    rawRender.packMode === 'custom' || rawRender.packMode === 'builtin'
      ? rawRender.packMode
      : DEFAULT_RENDER_SETTINGS.packMode;
  const renderSettings: RenderSettings = {
    targetFps,
    pixelSnap60:
      typeof rawRender.pixelSnap60 === 'boolean'
        ? rawRender.pixelSnap60
        : DEFAULT_RENDER_SETTINGS.pixelSnap60,
    screenshakeScale:
      typeof rawRender.screenshakeScale === 'number' &&
      Number.isFinite(rawRender.screenshakeScale)
        ? clamp(rawRender.screenshakeScale, 0, 2)
        : DEFAULT_RENDER_SETTINGS.screenshakeScale,
    lightingEnabled:
      typeof rawRender.lightingEnabled === 'boolean'
        ? rawRender.lightingEnabled
        : DEFAULT_RENDER_SETTINGS.lightingEnabled,
    bloodEnabled:
      typeof rawRender.bloodEnabled === 'boolean'
        ? rawRender.bloodEnabled
        : DEFAULT_RENDER_SETTINGS.bloodEnabled,
    packMode,
  };

  // Audio settings
  const rawAudio =
    obj.audioSettings && typeof obj.audioSettings === 'object'
      ? (obj.audioSettings as Record<string, unknown>)
      : {};
  const audioSettings: AudioSettings = {
    masterVolume:
      typeof rawAudio.masterVolume === 'number' && Number.isFinite(rawAudio.masterVolume)
        ? clamp(rawAudio.masterVolume, 0, 1)
        : DEFAULT_AUDIO_SETTINGS.masterVolume,
    musicVolume:
      typeof rawAudio.musicVolume === 'number' && Number.isFinite(rawAudio.musicVolume)
        ? clamp(rawAudio.musicVolume, 0, 1)
        : DEFAULT_AUDIO_SETTINGS.musicVolume,
    sfxVolume:
      typeof rawAudio.sfxVolume === 'number' && Number.isFinite(rawAudio.sfxVolume)
        ? clamp(rawAudio.sfxVolume, 0, 1)
        : DEFAULT_AUDIO_SETTINGS.sfxVolume,
    muted:
      typeof rawAudio.muted === 'boolean' ? rawAudio.muted : DEFAULT_AUDIO_SETTINGS.muted,
  };

  // Controller & touch settings
  const rawController =
    obj.controllerSettings && typeof obj.controllerSettings === 'object'
      ? (obj.controllerSettings as Record<string, unknown>)
      : {};
  const controllerSettings: ControllerSettings = {
    deadzone:
      typeof rawController.deadzone === 'number' && Number.isFinite(rawController.deadzone)
        ? clamp(rawController.deadzone, 0.08, 0.35)
        : DEFAULT_CONTROLLER_SETTINGS.deadzone,
    vibrationEnabled:
      typeof rawController.vibrationEnabled === 'boolean'
        ? rawController.vibrationEnabled
        : DEFAULT_CONTROLLER_SETTINGS.vibrationEnabled,
    twinStickAutoFire:
      typeof rawController.twinStickAutoFire === 'boolean'
        ? rawController.twinStickAutoFire
        : DEFAULT_CONTROLLER_SETTINGS.twinStickAutoFire,
    touchOpacity:
      typeof rawController.touchOpacity === 'number' &&
      Number.isFinite(rawController.touchOpacity)
        ? clamp(rawController.touchOpacity, 0.3, 1.0)
        : DEFAULT_CONTROLLER_SETTINGS.touchOpacity,
    touchScale:
      typeof rawController.touchScale === 'number' && Number.isFinite(rawController.touchScale)
        ? clamp(rawController.touchScale, 0.75, 1.35)
        : DEFAULT_CONTROLLER_SETTINGS.touchScale,
  };

  // Keybinds
  const keybinds: Record<string, string> = { ...DEFAULT_KEYBINDS };
  if (obj.keybinds && typeof obj.keybinds === 'object') {
    for (const [k, v] of Object.entries(obj.keybinds as Record<string, unknown>)) {
      if (k in DEFAULT_KEYBINDS && typeof v === 'string' && v.length > 0 && v.length <= 24) {
        keybinds[k] = v;
      }
    }
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    selectedOutcast,
    selectedSkins,
    unlockedOutcasts: [...unlockedOutcastSet],
    unlockedSkins: [...unlockedSkinSet],
    skillRanks,
    unspentSkillPoints: safeNonNegInt(obj.unspentSkillPoints, defaults.unspentSkillPoints),
    totalKills: safeNonNegInt(obj.totalKills, 0),
    totalRuns: safeNonNegInt(obj.totalRuns, 0),
    bestLoop: safeNonNegInt(obj.bestLoop, 0),
    discoveredWeapons: [...discoveredWeaponSet],
    discoveredEnemies: [...discoveredEnemySet],
    defeatedBosses: [...defeatedBossSet],
    completedChallenges: [...completedChallengeSet],
    activeModifiers: [...activeModifierSet],
    renderSettings,
    audioSettings,
    controllerSettings,
    keybinds,
  };
}

export class SaveManager {
  private data: SaveData;
  private existedOnLoad = false;

  constructor() {
    this.data = this.load();
  }

  public getData(): SaveData {
    return this.data;
  }

  public hasExistingSave(): boolean {
    return this.existedOnLoad || this.data.totalRuns > 0 || this.data.totalKills > 0;
  }

  public load(): SaveData {
    if (typeof localStorage === 'undefined') {
      this.existedOnLoad = false;
      this.data = createDefaultSaveData();
      return this.data;
    }

    try {
      const rawText = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!rawText) {
        this.existedOnLoad = false;
        this.data = createDefaultSaveData();
        return this.data;
      }
      const parsed: unknown = JSON.parse(rawText);
      this.data = sanitizeSaveData(parsed);
      this.existedOnLoad = true;
      return this.data;
    } catch {
      // Corrupt JSON or storage failure — recover gracefully to safe defaults
      this.existedOnLoad = false;
      this.data = createDefaultSaveData();
      this.save();
      return this.data;
    }
  }

  public save(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(this.data));
      this.existedOnLoad = true;
    } catch {
      // Ignore private-mode / quota errors without crashing gameplay
    }
  }

  public reset(): SaveData {
    this.data = createDefaultSaveData();
    this.existedOnLoad = false;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(SAVE_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    }
    return this.data;
  }

  public unlockSkin(skinId: SkinId): boolean {
    if (!SKIN_BY_ID.has(skinId)) return false;
    if (this.data.unlockedSkins.includes(skinId)) return false;
    this.data.unlockedSkins.push(skinId);
    this.save();
    return true;
  }

  public recordDiscoveredWeapon(uniqueId: number): boolean {
    if (!WEAPON_BY_UNIQUE_ID.has(uniqueId)) return false;
    if (this.data.discoveredWeapons.includes(uniqueId)) return false;
    this.data.discoveredWeapons.push(uniqueId);
    this.save();
    return true;
  }

  public recordDiscoveredEnemy(enemyId: string): boolean {
    if (!ENEMY_BY_ID.has(enemyId)) return false;
    if (this.data.discoveredEnemies.includes(enemyId)) return false;
    this.data.discoveredEnemies.push(enemyId);
    this.save();
    return true;
  }

  public recordDefeatedBoss(bossId: BossId): boolean {
    if (!BOSS_BY_ID.has(bossId)) return false;
    let changed = false;
    if (!this.data.defeatedBosses.includes(bossId)) {
      this.data.defeatedBosses.push(bossId);
      changed = true;
    }

    // Unlock thematic boss victory skins
    const bossSkinMap: Record<BossId, SkinId> = {
      fenrir: 'warlord',
      skadi: 'frost_walker',
      loki_body: 'snakecharmer',
      hel: 'ascended',
      surtur: 'fire_walker',
      krunked: 'krunkedslayer',
    };
    const rewardSkin = bossSkinMap[bossId];
    if (rewardSkin && !this.data.unlockedSkins.includes(rewardSkin)) {
      this.data.unlockedSkins.push(rewardSkin);
      changed = true;
    }

    if (changed) this.save();
    return changed;
  }

  /**
   * Evaluates all 18 Weapon Challenges against current run + lifetime stats,
   * rewarding gold & skill points immediately when newly completed.
   */
  public evaluateChallenges(state: SimState): string[] {
    const newlyCompleted: string[] = [];

    // Also check milestone skin unlocks
    if (state.clearedNodeIds.includes('act1_canyon')) {
      this.unlockSkin('wastelander');
    }
    if (state.clearedNodeIds.includes('act1_arena') || state.loopCount >= 1) {
      this.unlockSkin('champion');
    }
    if (state.activeModifiers.length >= 2 && state.runStats.bossesDefeated.includes('krunked')) {
      this.unlockSkin('overlord');
    }

    for (const chal of CHALLENGES) {
      if (this.data.completedChallenges.includes(chal.id)) continue;

      let satisfied = false;
      switch (chal.targetType) {
        case 'kills':
          satisfied = this.data.totalKills >= Number(chal.targetValue);
          break;
        case 'mod':
          satisfied = state.runStats.modsAttached >= Number(chal.targetValue);
          break;
        case 'node':
          satisfied = state.clearedNodeIds.includes(String(chal.targetValue));
          break;
        case 'boss':
          satisfied = this.data.defeatedBosses.includes(chal.targetValue as BossId);
          break;
        case 'loop':
          satisfied =
            Math.max(this.data.bestLoop, state.loopCount) >= Number(chal.targetValue);
          break;
      }

      if (satisfied) {
        this.data.completedChallenges.push(chal.id);
        state.player.gold += chal.rewardGold;
        state.player.skillPoints += chal.rewardSkillPoints;
        this.data.unspentSkillPoints = state.player.skillPoints;
        newlyCompleted.push(chal.id);
      }
    }

    if (newlyCompleted.length > 0) {
      this.save();
    }
    return newlyCompleted;
  }
}
