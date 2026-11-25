// ============================================================================
// KRUNKEDFALL — SaveManager & InputManager Verification Suite
// ============================================================================
// Covers:
//   1. SaveManager default save creation, persistence under SAVE_STORAGE_KEY
//      ('krunked_krunkedfall_save_v1'), schema validation, corruption recovery
//      (malformed JSON, invalid types, out-of-range FPS, unknown Outcast/Skin/
//      Weapon/Enemy/Boss/Skill/Modifier/Challenge IDs, negative skill points &
//      counters, out-of-range audio/screenshake, throwing Storage), reset(),
//      unlock/discovery helpers, and challenge evaluation.
//   2. InputManager keybind serialization, validation, rebinding, reset,
//      formatKeyCode(), headless neutral input sampling (zero DOM globals),
//      UI blocking, contextual E interact vs swap, and mocked Gamepad / DOM
//      event handling.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  type BossId,
  type OutcastId,
  type SkinId,
} from '../src/contracts/index.js';
import {
  DEFAULT_RENDER_SETTINGS,
  SaveManager,
  createDefaultSaveData,
  sanitizeSaveData,
} from '../src/app/saveManager.js';
import { DEFAULT_AUDIO_SETTINGS } from '../src/audio/index.js';
import {
  DEFAULT_KEYBINDS,
  InputManager,
  KEYBIND_ACTIONS,
  formatKeyCode,
  type KeybindAction,
} from '../src/input/inputManager.js';
import {
  CHALLENGES,
  OUTCASTS,
  SKILL_NODES,
  WEAPONS,
} from '../src/data/index.js';
import { createInitialSimState, enterHub, enterNode } from '../src/sim/index.js';

interface MemoryStorage extends Storage {
  readonly store: Map<string, string>;
}

function createMockStorage(initial?: Record<string, string>): MemoryStorage {
  const store = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    store,
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
}

function createMockCanvas(width = 1280, height = 720): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

describe('SaveManager — Persistence, Schema Validation & Corruption Recovery', () => {
  let mockStorage: MemoryStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates clean default save data when storage is empty and uses the canonical key', () => {
    expect(SAVE_STORAGE_KEY).toBe('krunked_krunkedfall_save_v1');

    const mgr = new SaveManager();
    const data = mgr.getData();

    expect(mgr.hasExistingSave()).toBe(false);
    expect(data.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(data.selectedOutcast).toBe('britta');
    expect(data.unlockedOutcasts).toHaveLength(OUTCASTS.length);
    for (const o of OUTCASTS) {
      expect(data.unlockedOutcasts).toContain(o.id);
      expect(data.selectedSkins[o.id]).toBe('original');
    }
    expect(data.unlockedSkins).toEqual(['original']);
    expect(data.unspentSkillPoints).toBe(2);
    expect(data.totalKills).toBe(0);
    expect(data.totalRuns).toBe(0);
    expect(data.bestLoop).toBe(0);
    expect(data.discoveredWeapons).toEqual([1015, 1001]);
    expect(data.discoveredEnemies).toEqual([]);
    expect(data.defeatedBosses).toEqual([]);
    expect(data.completedChallenges).toEqual([]);
    expect(data.activeModifiers).toEqual([]);
    expect(data.renderSettings).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(data.audioSettings).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(data.keybinds).toEqual(DEFAULT_KEYBINDS);
    expect(mockStorage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it('round-trips full progression, settings, and keybinds under krunked_krunkedfall_save_v1', () => {
    const mgr = new SaveManager();
    const data = mgr.getData();

    data.selectedOutcast = 'hilda';
    data.selectedSkins.hilda = 'krunkedslayer';
    data.selectedSkins.britta = 'warlord';
    data.skillRanks = { skill_fortitude: 2, hilda_seedling_fervor: 3 };
    data.unspentSkillPoints = 7;
    data.totalKills = 412;
    data.totalRuns = 9;
    data.bestLoop = 2;
    data.activeModifiers = ['mod_ragnarok_tide', 'mod_hyper_tempo'];
    data.renderSettings = {
      targetFps: 60,
      pixelSnap60: true,
      screenshakeScale: 1.5,
      lightingEnabled: false,
      bloodEnabled: false,
      packMode: 'custom',
    };
    data.audioSettings = {
      masterVolume: 0.75,
      musicVolume: 0.4,
      sfxVolume: 0.9,
      muted: true,
    };
    data.keybinds.moveUp = 'KeyI';
    data.keybinds.ability = 'ShiftLeft';
    data.keybinds.power = 'KeyF';

    mgr.save();

    const rawPersisted = mockStorage.getItem(SAVE_STORAGE_KEY);
    expect(rawPersisted).not.toBeNull();
    expect(mgr.hasExistingSave()).toBe(true);

    // Reload into a brand-new SaveManager instance and verify lossless round-trip
    const reloaded = new SaveManager();
    expect(reloaded.hasExistingSave()).toBe(true);
    expect(reloaded.getData()).toEqual(data);
  });

  it('recovers gracefully from malformed JSON and overwrites corrupt payload with safe defaults', () => {
    mockStorage.setItem(SAVE_STORAGE_KEY, '{not-valid-json:::[[[');

    const mgr = new SaveManager();
    const defaults = createDefaultSaveData();

    expect(mgr.getData()).toEqual(defaults);
    // load() catches JSON.parse error and writes back clean default JSON
    const rewritten = mockStorage.getItem(SAVE_STORAGE_KEY);
    expect(rewritten).not.toBeNull();
    expect(() => JSON.parse(rewritten!)).not.toThrow();
    expect(JSON.parse(rewritten!)).toEqual(defaults);
  });

  it('sanitizes non-object roots, invalid types, out-of-range FPS, unknown Outcast/Skin IDs, and negative skill points', () => {
    // Non-object roots
    expect(sanitizeSaveData(null)).toEqual(createDefaultSaveData());
    expect(sanitizeSaveData(undefined)).toEqual(createDefaultSaveData());
    expect(sanitizeSaveData('corrupt-string')).toEqual(createDefaultSaveData());
    expect(sanitizeSaveData(42)).toEqual(createDefaultSaveData());

    const fortitudeNode = SKILL_NODES.find((n) => n.id === 'skill_fortitude')!;
    const validWeaponId = WEAPONS[10].uniqueId;

    const corruptPayload = {
      schemaVersion: 999,
      selectedOutcast: 'unknown_viking_99',
      selectedSkins: {
        britta: 'nonexistent_skin',
        leifi: 'frost_walker',
        gustaf: 12345,
        einar: null,
      },
      unlockedOutcasts: ['fake_hero', 42],
      unlockedSkins: ['original', 'warlord', 'warlord', 'bogus_skin', 99],
      skillRanks: {
        skill_fortitude: 999, // exceeds maxRank -> clamp to fortitudeNode.maxRank
        skill_gunslinger: -4, // negative -> clamped to 0 -> dropped
        skill_sniper: 1.9, // fractional -> floored to 1
        skill_marathon: 'three', // invalid type -> dropped
        fake_skill_node: 2, // unknown node -> dropped
      },
      unspentSkillPoints: -25,
      totalKills: -100,
      totalRuns: Number.NaN,
      bestLoop: Number.POSITIVE_INFINITY,
      discoveredWeapons: [validWeaponId, validWeaponId, -999, 'pistol', 999999],
      discoveredEnemies: ['bandit', 'bandit', 'totally_fake_mob', 123],
      defeatedBosses: ['fenrir', 'fenrir', 'not_a_boss', null],
      completedChallenges: [CHALLENGES[0].id, 'fake_challenge_999'],
      activeModifiers: ['mod_valhalla_gauntlet', 'mod_fake_99', 77],
      renderSettings: {
        targetFps: 144, // out-of-range (only 30|60|120 allowed) -> default 120
        pixelSnap60: 'yes', // invalid type -> default false
        screenshakeScale: 9.5, // clamped to 2
        lightingEnabled: 0, // invalid type -> default true
        bloodEnabled: null, // invalid type -> default true
        packMode: 'pirated_pack', // invalid -> default 'builtin'
      },
      audioSettings: {
        masterVolume: -0.4, // clamped to 0
        musicVolume: 4.2, // clamped to 1
        sfxVolume: Number.NaN, // default
        muted: 'true', // invalid type -> default false
      },
      keybinds: {
        moveUp: 'ArrowUp', // valid
        moveDown: '', // empty -> fallback to default KeyS
        moveLeft: 'A_WAY_TOO_LONG_KEYCODE_EXCEEDING_LIMIT', // >24 chars -> fallback KeyA
        moveRight: 42, // non-string -> fallback KeyD
        injectedAction: 'KeyZ', // unknown action -> stripped
      },
    };

    mockStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(corruptPayload));
    const mgr = new SaveManager();
    const clean = mgr.getData();

    expect(clean.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(clean.selectedOutcast).toBe('britta');
    expect(clean.selectedSkins.britta).toBe('original');
    expect(clean.selectedSkins.leifi).toBe('frost_walker');
    expect(clean.selectedSkins.gustaf).toBe('original');
    expect(clean.selectedSkins.einar).toBe('original');

    // All 8 Outcasts always stay unlocked even when corrupt payload omits them
    expect(clean.unlockedOutcasts).toHaveLength(OUTCASTS.length);
    expect(clean.unlockedSkins).toEqual(['original', 'warlord']);

    // Skill ranks clamped & unknown/negative entries stripped
    expect(clean.skillRanks).toEqual({
      skill_fortitude: fortitudeNode.maxRank,
      skill_sniper: 1,
    });

    // Negative skill points & invalid counters sanitized safely
    expect(clean.unspentSkillPoints).toBe(0);
    expect(clean.totalKills).toBe(0);
    expect(clean.totalRuns).toBe(0);
    expect(clean.bestLoop).toBe(0);

    // Non-finite unspentSkillPoints falls back to default (2)
    expect(sanitizeSaveData({ unspentSkillPoints: 'bad' }).unspentSkillPoints).toBe(2);
    expect(sanitizeSaveData({ unspentSkillPoints: Number.NaN }).unspentSkillPoints).toBe(2);

    // Valid registries deduplicated & unknowns dropped
    expect(clean.discoveredWeapons).toContain(1015);
    expect(clean.discoveredWeapons).toContain(1001);
    expect(clean.discoveredWeapons).toContain(validWeaponId);
    expect(clean.discoveredWeapons).not.toContain(-999);
    expect(clean.discoveredWeapons).not.toContain(999999);
    expect(clean.discoveredEnemies).toEqual(['bandit']);
    expect(clean.defeatedBosses).toEqual(['fenrir']);
    expect(clean.completedChallenges).toEqual([CHALLENGES[0].id]);
    expect(clean.activeModifiers).toEqual(['mod_valhalla_gauntlet']);

    // Render settings validated
    expect(clean.renderSettings).toEqual({
      targetFps: DEFAULT_RENDER_SETTINGS.targetFps,
      pixelSnap60: DEFAULT_RENDER_SETTINGS.pixelSnap60,
      screenshakeScale: 2,
      lightingEnabled: DEFAULT_RENDER_SETTINGS.lightingEnabled,
      bloodEnabled: DEFAULT_RENDER_SETTINGS.bloodEnabled,
      packMode: 'builtin',
    });

    // Test out-of-range low/negative FPS & negative screenshakeScale as well
    const negRender = sanitizeSaveData({
      renderSettings: { targetFps: -30, screenshakeScale: -5 },
    });
    expect(negRender.renderSettings.targetFps).toBe(120);
    expect(negRender.renderSettings.screenshakeScale).toBe(0);

    // Valid targetFps values (30, 60, 120) preserved verbatim
    for (const validFps of [30, 60, 120] as const) {
      expect(sanitizeSaveData({ renderSettings: { targetFps: validFps } }).renderSettings.targetFps).toBe(
        validFps,
      );
    }

    // Audio settings validated
    expect(clean.audioSettings).toEqual({
      masterVolume: 0,
      musicVolume: 1,
      sfxVolume: DEFAULT_AUDIO_SETTINGS.sfxVolume,
      muted: false,
    });

    // Keybinds validated & unknown actions rejected
    expect(clean.keybinds.moveUp).toBe('ArrowUp');
    expect(clean.keybinds.moveDown).toBe(DEFAULT_KEYBINDS.moveDown);
    expect(clean.keybinds.moveLeft).toBe(DEFAULT_KEYBINDS.moveLeft);
    expect(clean.keybinds.moveRight).toBe(DEFAULT_KEYBINDS.moveRight);
    expect('injectedAction' in clean.keybinds).toBe(false);
  });

  it('resets save cleanly via reset() and clears persisted storage key', () => {
    const mgr = new SaveManager();
    mgr.getData().selectedOutcast = 'stellan';
    mgr.getData().totalKills = 250;
    mgr.getData().totalRuns = 4;
    mgr.getData().bestLoop = 1;
    mgr.save();

    expect(mockStorage.getItem(SAVE_STORAGE_KEY)).not.toBeNull();
    expect(mgr.hasExistingSave()).toBe(true);

    const resetData = mgr.reset();
    expect(resetData).toEqual(createDefaultSaveData());
    expect(mgr.getData()).toEqual(createDefaultSaveData());
    expect(mgr.hasExistingSave()).toBe(false);
    expect(mockStorage.getItem(SAVE_STORAGE_KEY)).toBeNull();

    // Subsequent SaveManager starts clean with no existing save
    const fresh = new SaveManager();
    expect(fresh.hasExistingSave()).toBe(false);
    expect(fresh.getData()).toEqual(createDefaultSaveData());
  });

  it('tracks skins, weapons, enemies, boss victory skins, and challenge rewards deterministically', () => {
    const mgr = new SaveManager();

    // Unknown IDs rejected cleanly
    expect(mgr.unlockSkin('fake_skin' as SkinId)).toBe(false);
    expect(mgr.recordDiscoveredWeapon(999999)).toBe(false);
    expect(mgr.recordDiscoveredEnemy('fake_enemy')).toBe(false);
    expect(mgr.recordDefeatedBoss('fake_boss' as BossId)).toBe(false);

    // Valid unlocks & deduplication
    expect(mgr.unlockSkin('original')).toBe(false); // already unlocked
    expect(mgr.unlockSkin('wastelander')).toBe(true);
    expect(mgr.unlockSkin('wastelander')).toBe(false); // duplicate

    expect(mgr.recordDiscoveredWeapon(1015)).toBe(false); // default weapon
    const newWeaponId = WEAPONS.find((w) => w.uniqueId !== 1015 && w.uniqueId !== 1001)!.uniqueId;
    expect(mgr.recordDiscoveredWeapon(newWeaponId)).toBe(true);
    expect(mgr.recordDiscoveredWeapon(newWeaponId)).toBe(false);

    expect(mgr.recordDiscoveredEnemy('bandit')).toBe(true);
    expect(mgr.recordDiscoveredEnemy('bandit')).toBe(false);

    // Boss defeat unlocks matching thematic skin
    const bossSkinExpectations: Array<[BossId, SkinId]> = [
      ['fenrir', 'warlord'],
      ['skadi', 'frost_walker'],
      ['loki_body', 'snakecharmer'],
      ['hel', 'ascended'],
      ['surtur', 'fire_walker'],
      ['krunked', 'krunkedslayer'],
    ];
    for (const [bossId, expectedSkin] of bossSkinExpectations) {
      expect(mgr.recordDefeatedBoss(bossId)).toBe(true);
      expect(mgr.getData().defeatedBosses).toContain(bossId);
      expect(mgr.getData().unlockedSkins).toContain(expectedSkin);
      expect(mgr.recordDefeatedBoss(bossId)).toBe(false); // already recorded + skin unlocked
    }

    // Evaluate challenges & milestone skins against a progressed SimState
    const state = createInitialSimState(42, 'britta');
    state.clearedNodeIds.push('act1_canyon', 'act1_arena');
    state.activeModifiers = ['mod_ragnarok_tide', 'mod_hyper_tempo'];
    state.runStats.bossesDefeated = ['fenrir', 'krunked'];
    state.runStats.modsAttached = 5;
    state.loopCount = 1;
    mgr.getData().totalKills = 120;

    const goldBefore = state.player.gold;
    const spBefore = state.player.skillPoints;
    const completed = mgr.evaluateChallenges(state);

    expect(completed).toContain('chal_kills_25');
    expect(completed).toContain('chal_kills_100');
    expect(completed).toContain('chal_mod_first');
    expect(completed).toContain('chal_mod_five');
    expect(completed).toContain('chal_node_canyon');
    expect(completed).toContain('chal_node_arena');
    expect(completed).toContain('chal_boss_fenrir');
    expect(completed).toContain('chal_boss_krunked');
    expect(completed).toContain('chal_loop_1');
    expect(state.player.gold).toBeGreaterThan(goldBefore);
    expect(state.player.skillPoints).toBeGreaterThan(spBefore);
    expect(mgr.getData().unlockedSkins).toContain('champion');
    expect(mgr.getData().unlockedSkins).toContain('overlord');

    // Re-evaluating does not double-award completed challenges
    expect(mgr.evaluateChallenges(state)).toEqual([]);
  });

  it('handles missing localStorage and throwing Storage errors without throwing', () => {
    // 1. Completely undefined localStorage (pure headless environment)
    vi.stubGlobal('localStorage', undefined);
    expect(() => {
      const headlessMgr = new SaveManager();
      headlessMgr.save();
      headlessMgr.reset();
    }).not.toThrow();

    // 2. Throwing Storage (quota exceeded / private mode)
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {
        throw new Error('SecurityError');
      },
      getItem: () => {
        throw new Error('SecurityError');
      },
      key: () => null,
      removeItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    vi.stubGlobal('localStorage', throwingStorage);

    expect(() => {
      const mgr = new SaveManager();
      expect(mgr.getData()).toEqual(createDefaultSaveData());
      mgr.save();
      mgr.reset();
    }).not.toThrow();
  });
});

describe('InputManager — Keybind Validation, Serialization & Headless Sampling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats standard, modifier, arrow, and unknown key codes cleanly', () => {
    expect(formatKeyCode('')).toBe('---');
    expect(formatKeyCode('KeyW')).toBe('W');
    expect(formatKeyCode('Digit2')).toBe('2');
    expect(formatKeyCode('Space')).toBe('SPACE');
    expect(formatKeyCode('Escape')).toBe('ESC');
    expect(formatKeyCode('Tab')).toBe('TAB');
    expect(formatKeyCode('ShiftLeft')).toBe('L-SHIFT');
    expect(formatKeyCode('ShiftRight')).toBe('R-SHIFT');
    expect(formatKeyCode('ControlLeft')).toBe('L-CTRL');
    expect(formatKeyCode('ControlRight')).toBe('R-CTRL');
    expect(formatKeyCode('ArrowUp')).toBe('UP');
    expect(formatKeyCode('ArrowDown')).toBe('DOWN');
    expect(formatKeyCode('ArrowLeft')).toBe('LEFT');
    expect(formatKeyCode('ArrowRight')).toBe('RIGHT');
    expect(formatKeyCode('Enter')).toBe('ENTER');
    expect(formatKeyCode('Backspace')).toBe('BKSP');
    expect(formatKeyCode('F9')).toBe('F9');
  });

  it('validates, rebinds, resets, and serializes keybinds cleanly across SaveManager round-trips', () => {
    const storage = createMockStorage();
    vi.stubGlobal('localStorage', storage);

    const canvas = createMockCanvas();
    const screenToWorld = (cx: number, cy: number) => ({ x: cx * 0.5, y: cy * 0.5 });

    // Construct with mixed valid + invalid keybind overrides
    const input = new InputManager(canvas, screenToWorld, {
      moveUp: 'KeyI',
      moveDown: '', // invalid empty -> fallback KeyS
      moveLeft: 'TOO_LONG_KEY_IDENTIFIER_123456', // >24 chars -> fallback KeyA
      unknownAction: 'KeyZ', // ignored
    });

    const initial = input.getKeybinds();
    expect(Object.keys(initial).sort()).toEqual(KEYBIND_ACTIONS.map((a) => a.action).sort());
    expect(initial.moveUp).toBe('KeyI');
    expect(initial.moveDown).toBe(DEFAULT_KEYBINDS.moveDown);
    expect(initial.moveLeft).toBe(DEFAULT_KEYBINDS.moveLeft);
    expect('unknownAction' in initial).toBe(false);

    // getKeybinds() returns a defensive shallow clone
    initial.moveUp = 'MutatedOutside';
    expect(input.getKeybinds().moveUp).toBe('KeyI');

    // Single keybind update & rebind capture state machine
    input.setSingleKeybind('ability', 'ShiftLeft');
    input.setSingleKeybind('power', 'KeyF');
    expect(input.getKeybinds().ability).toBe('ShiftLeft');
    expect(input.getKeybinds().power).toBe('KeyF');

    const rebindSpy = vi.fn();
    expect(input.isRebinding()).toBeNull();
    input.startRebind('interact', rebindSpy);
    expect(input.isRebinding()).toBe('interact');
    input.cancelRebind();
    expect(input.isRebinding()).toBeNull();
    expect(rebindSpy).toHaveBeenCalledWith('interact', null);

    // Round-trip keybinds through SaveManager persistence
    const saveMgr = new SaveManager();
    saveMgr.getData().keybinds = input.getKeybinds();
    saveMgr.save();

    const reloadedSave = new SaveManager();
    const restoredInput = new InputManager(canvas, screenToWorld, reloadedSave.getData().keybinds);
    expect(restoredInput.getKeybinds()).toEqual(input.getKeybinds());

    // Reset restores canonical defaults
    const resetBinds = restoredInput.resetKeybinds();
    expect(resetBinds).toEqual(DEFAULT_KEYBINDS);
    expect(restoredInput.getKeybinds()).toEqual(DEFAULT_KEYBINDS);
  });

  it('samples neutral input frames safely in pure headless Node without window or Gamepad API', () => {
    const canvas = createMockCanvas(1280, 720);
    const screenToWorld = vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }));
    const input = new InputManager(canvas, screenToWorld);
    const state = createInitialSimState(1337, 'britta');
    enterHub(state);

    // attach/detach must be safe no-ops when window is undefined
    expect(() => input.attach()).not.toThrow();
    expect(() => input.detach()).not.toThrow();

    // Neutral cursor and gamepad state
    expect(input.isUsingGamepad()).toBe(false);
    expect(input.getCursorClientPos()).toEqual({
      x: 1280 * 0.65,
      y: 720 * 0.5,
      visible: false,
    });

    // Sample neutral input frame
    const frame = input.sampleInputFrame(state);
    expect(frame.moveX).toBe(0);
    expect(frame.moveY).toBe(0);
    expect(Number.isFinite(frame.aimWorldX)).toBe(true);
    expect(Number.isFinite(frame.aimWorldY)).toBe(true);
    expect(frame.aimWorldX).toBeCloseTo(state.player.x + Math.cos(state.player.aimAngle) * 80, 5);
    expect(frame.aimWorldY).toBeCloseTo(state.player.y + Math.sin(state.player.aimAngle) * 80, 5);
    expect(frame.firePrimary).toBe(false);
    expect(frame.firePrimaryPressed).toBe(false);
    expect(frame.abilityPressed).toBe(false);
    expect(frame.powerPressed).toBe(false);
    expect(frame.swapWeaponPressed).toBe(false);
    expect(frame.interactPressed).toBe(false);
    expect(frame.reloadOrVentPressed).toBe(false);
    expect(frame.pausePressed).toBe(false);

    expect(input.consumeUiActions()).toEqual({
      toggleWorkbench: false,
      togglePause: false,
      togglePlaytestDrawer: false,
    });

    // UI blocking & latch clearing stay safe
    expect(() => input.setUiBlockingGameplay(true)).not.toThrow();
    expect(() => input.clearLatches()).not.toThrow();
    const blockedFrame = input.sampleInputFrame(state);
    expect(blockedFrame.moveX).toBe(0);
    expect(blockedFrame.moveY).toBe(0);
    expect(blockedFrame.firePrimary).toBe(false);
  });

  it('handles keyboard events, live rebind capture, dual KeyE context, mouse aim, and gamepad deadzone/edge detection', () => {
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    const mockWindow = {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(fn);
      },
      removeEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners.get(type)?.delete(fn);
      },
    };
    const dispatchWin = (type: string, ev: Record<string, unknown>) => {
      for (const fn of listeners.get(type) ?? []) {
        fn(ev);
      }
    };

    class MockElement {
      public closest(): null {
        return null;
      }
    }
    class MockHTMLElement extends MockElement {
      public tagName = 'DIV';
      public isContentEditable = false;
    }

    let activeGamepad: Partial<Gamepad> | null = null;
    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('Element', MockElement);
    vi.stubGlobal('HTMLElement', MockHTMLElement);
    vi.stubGlobal('navigator', {
      getGamepads: () => (activeGamepad ? [activeGamepad] : []),
    });

    const firstGesture = vi.fn();
    const canvas = createMockCanvas(640, 360);
    const screenToWorld = (cx: number, cy: number) => ({ x: cx + 10, y: cy + 20 });
    const input = new InputManager(canvas, screenToWorld, undefined, firstGesture);
    input.attach();

    const state = createInitialSimState(909, 'britta');
    enterNode(state, 'act1_canyon');

    // 1. Live rebind capture & Escape cancel
    const captured: Array<[KeybindAction, string | null]> = [];
    input.startRebind('ability', (act, code) => captured.push([act, code]));
    dispatchWin('keydown', {
      code: 'Escape',
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(captured).toEqual([['ability', null]]);
    expect(input.getKeybinds().ability).toBe(DEFAULT_KEYBINDS.ability);

    input.startRebind('ability', (act, code) => captured.push([act, code]));
    dispatchWin('keydown', {
      code: 'KeyC',
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(captured[1]).toEqual(['ability', 'KeyC']);
    expect(input.getKeybinds().ability).toBe('KeyC');
    expect(firstGesture).toHaveBeenCalled();

    // 2. Movement normalization + custom ability key + mouse aim + UI latches
    dispatchWin('mousemove', { clientX: 200, clientY: 150 });
    dispatchWin('mousedown', { button: 0, clientX: 200, clientY: 150, target: null });
    dispatchWin('keydown', { code: 'KeyD', repeat: false, target: null, preventDefault: vi.fn() });
    dispatchWin('keydown', { code: 'KeyS', repeat: false, target: null, preventDefault: vi.fn() });
    dispatchWin('keydown', { code: 'KeyC', repeat: false, target: null, preventDefault: vi.fn() });
    dispatchWin('keydown', { code: 'F9', repeat: false, target: null, preventDefault: vi.fn() });
    dispatchWin('keydown', { code: 'Tab', repeat: false, target: null, preventDefault: vi.fn() });

    const f1 = input.sampleInputFrame(state);
    expect(f1.moveX).toBeCloseTo(Math.SQRT1_2, 4);
    expect(f1.moveY).toBeCloseTo(Math.SQRT1_2, 4);
    expect(f1.aimWorldX).toBe(210);
    expect(f1.aimWorldY).toBe(170);
    expect(f1.firePrimary).toBe(true);
    expect(f1.firePrimaryPressed).toBe(true);
    expect(f1.abilityPressed).toBe(true);
    expect(input.getCursorClientPos()).toEqual({ x: 200, y: 150, visible: true });

    // Edge latches are consumed atomically on the next tick
    const f2 = input.sampleInputFrame(state);
    expect(f2.firePrimary).toBe(true);
    expect(f2.firePrimaryPressed).toBe(false);
    expect(f2.abilityPressed).toBe(false);

    const uiActs = input.consumeUiActions();
    expect(uiActs.togglePlaytestDrawer).toBe(true);
    expect(uiActs.toggleWorkbench).toBe(true);
    expect(input.consumeUiActions().togglePlaytestDrawer).toBe(false);

    // 3. Dual KeyE resolves to swapWeapon in open combat and interact when near Hub station
    dispatchWin('blur', {});
    dispatchWin('keydown', { code: 'KeyE', repeat: false, target: null, preventDefault: vi.fn() });
    const swapFrame = input.sampleInputFrame(state);
    expect(swapFrame.swapWeaponPressed).toBe(true);
    expect(swapFrame.interactPressed).toBe(false);

    dispatchWin('keyup', { code: 'KeyE' });
    enterHub(state);
    const loki = state.hubInteractables[0];
    state.player.x = loki.x;
    state.player.y = loki.y;
    dispatchWin('keydown', { code: 'KeyE', repeat: false, target: null, preventDefault: vi.fn() });
    const interactFrame = input.sampleInputFrame(state);
    expect(interactFrame.interactPressed).toBe(true);
    expect(interactFrame.swapWeaponPressed).toBe(false);

    // 4. Gamepad deadzone filtering, twin-stick aim, and button edge detection
    const mkBtn = (pressed: boolean) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 });
    const buttons = Array.from({ length: 16 }, () => mkBtn(false));
    buttons[7] = mkBtn(true); // RT Fire
    buttons[6] = mkBtn(true); // LT Ability
    buttons[9] = mkBtn(true); // Start Pause
    activeGamepad = {
      connected: true,
      axes: [0.1, -0.1, 1.0, 0.0], // left stick within 0.18 deadzone -> 0; right stick right -> aim +X
      buttons,
    };

    const gpFrame1 = input.sampleInputFrame(state);
    expect(gpFrame1.moveX).toBe(0);
    expect(gpFrame1.moveY).toBe(0);
    expect(gpFrame1.firePrimary).toBe(true);
    expect(gpFrame1.firePrimaryPressed).toBe(true);
    expect(gpFrame1.abilityPressed).toBe(true);
    expect(gpFrame1.pausePressed).toBe(true);
    expect(input.isUsingGamepad()).toBe(true);
    expect(gpFrame1.aimWorldX).toBeGreaterThan(state.player.x + 100);

    // Holding same buttons on next tick does not re-trigger edge latches
    const gpFrame2 = input.sampleInputFrame(state);
    expect(gpFrame2.firePrimary).toBe(true);
    expect(gpFrame2.firePrimaryPressed).toBe(false);
    expect(gpFrame2.abilityPressed).toBe(false);

    input.detach();
  });
});
