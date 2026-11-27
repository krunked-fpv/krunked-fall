// ============================================================================
// KRUNKEDFALL — Master GameApp Runtime Shell & window.__KRUNKED_DEBUG__
// ============================================================================
// Connects:
//   - SaveManager (krunked_krunkedfall_save_v1)
//   - PackManager (Built-In Krunked Art + auto-detected/Folder-Picker Custom Pack)
//   - WebGL2Renderer (6-pass 640x360 pixel-art pipeline + data resolvers)
//   - AudioEngine (Dual-Pack Web Audio synth + Custom Pack .ogg/.wav bridge)
//   - InputManager (KB + Mouse screenToWorld + Gamepad + live Keybinds)
//   - UiManager (Title, Hub, Overworld, Combat HUD, Overlays, F9 Playtest Drawer)
//   - Decoupled Fixed 60 Hz Sim Accumulator + 30/60/120 FPS Render Pacing

import {
  SIM_DT,
  SIM_HZ,
  type AmmoType,
  type AssetPackMode,
  type AudioSettings,
  type BossId,
  type ControllerSettings,
  type ControllerStatus,
  type DebugBridge,
  type HubPanel,
  type InputFrame,
  type OutcastId,
  type RenderSettings,
  type RuntimeMetrics,
  type ScreenMode,
  type SimEvent,
  type SimState,
  type SkinId,
} from '../contracts/index.js';
import {
  BOSSES,
  BOSS_BY_ID,
  ENEMY_BY_ID,
  OVERWORLD_NODES,
  WEAPON_BY_UNIQUE_ID,
  getBiomePalette,
  getBossDef,
  getOutcastDef,
  getSkinDef,
  getWeaponDef,
} from '../data/index.js';
import {
  allocateSkillNode,
  attachModToWeapon,
  buyShopOffer,
  computeEffectiveWeaponStats,
  createInitialSimState,
  createNeutralInput,
  detachModFromWeapon,
  drainSimEvents,
  enterHub,
  enterNode,
  enterOverworld,
  equipWeaponByUniqueId,
  getSkillEffectValue,
  hashSimState,
  setFreezeStormIntensity,
  setPlayerOutcast,
  spawnBossById,
  startNextLoop,
  stepSim,
  syncPlayerDerivedStats,
  triggerActiveBossPhase2,
  upgradeWeaponGolden,
  useCampfireAction,
} from '../sim/index.js';
import {
  PackManager,
  WebGL2Renderer,
  type CustomPackImportResult,
} from '../render/index.js';
import { AudioEngine } from '../audio/index.js';
import { InputManager, type KeybindAction } from '../input/index.js';
import { UiManager } from '../ui/index.js';
import { SaveManager } from './saveManager.js';

const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_SUBSTEPS_PER_FRAME = 6;

export class GameApp {
  private readonly appRoot: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly uiRoot: HTMLElement;

  private readonly saveManager: SaveManager;
  private readonly packManager: PackManager;
  private readonly renderer: WebGL2Renderer;
  private readonly audio: AudioEngine;
  private readonly input: InputManager;
  private readonly ui: UiManager;
  private readonly debugBridge: DebugBridge;

  private state: SimState;
  private rafId = 0;
  private disposed = false;
  private lastRafMs = 0;
  private lastRenderMs = 0;
  private accumulatorSec = 0;
  private interpAlpha = 0;
  private smoothedFps = 60;
  private lastRoomSignature = '';
  private workbenchReturnMode: 'hub' | 'overworld' | 'combat' = 'combat';
  private runCountedCurrentSession = false;
  private unsubscribePack: (() => void) | null = null;
  private unsubscribeController: (() => void) | null = null;
  private prevGamepadConnected = false;
  private prevGamepadCount = 0;
  private prevGamepadToastLabel = '';

  constructor(
    appRoot: HTMLElement,
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    this.appRoot = appRoot;
    this.canvas = canvas;
    this.uiRoot = uiRoot;

    this.saveManager = new SaveManager();
    const save = this.saveManager.getData();

    // Initialize simulation state hydrated with saved Outcast, Skin, Skills & Modifiers
    const initSkin = save.selectedSkins[save.selectedOutcast] ?? 'original';
    this.state = createInitialSimState(
      (Date.now() & 0x7fffffff) || 1337,
      save.selectedOutcast,
      initSkin,
    );
    this.hydrateStateFromSave();

    // Initialize Dual-Mode Asset Pack Manager & WebGL2 6-Pass Renderer
    this.packManager = new PackManager();
    this.renderer = new WebGL2Renderer(this.canvas, this.packManager);
    this.renderer.setDataResolvers({
      getWeaponDef: (uid) => WEAPON_BY_UNIQUE_ID.get(uid),
      getEnemyDef: (defId) => ENEMY_BY_ID.get(defId),
      getBossDef: (bossId) => BOSS_BY_ID.get(bossId as BossId),
      getBiomePalette: (biomeId) => getBiomePalette(biomeId),
      getSkinDef: (skinId) => getSkinDef(skinId),
    });

    // Initialize Web Audio Engine (bridged dynamically to PackManager)
    this.audio = new AudioEngine(save.audioSettings);
    this.syncAudioPackSource();

    // Initialize Unified Input Manager (KB + Mouse + Multi-Platform Gamepad + Touch)
    this.input = new InputManager(
      this.canvas,
      (clientX, clientY, simState) =>
        this.renderer.screenToWorld(clientX, clientY, simState),
      save.keybinds,
      () => this.audio.unlock(),
      save.controllerSettings,
    );

    // Build complete DebugBridge conforming strictly to contracts
    this.debugBridge = this.createDebugBridge();

    // Initialize Master UI Manager
    this.ui = new UiManager(this.appRoot, this.uiRoot, {
      onNewRun: () => this.startNewRun(),
      onContinue: () => this.continueSavedRun(),
      onOpenHubPanel: (panel) => {
        this.state.hubPanel = panel;
      },
      onLaunchOverworld: () => {
        enterOverworld(this.state);
        this.flushSimEvents();
      },
      onDeployNode: (nodeId) => this.warpToNodeInternal(nodeId),
      onReturnToHub: () => this.returnToHubInternal(),
      onReturnToTitle: () => this.returnToTitleInternal(),
      onLeaveToOverworld: () => {
        enterOverworld(this.state);
        this.flushSimEvents();
      },
      onRetryRun: () => this.retryRunInternal(),
      onStartNextLoop: () => this.startNextLoopInternal(),
      onToggleWorkbench: () => this.toggleWorkbench(),
      onCloseWorkbench: () => this.closeWorkbench(),
      onResumeGame: () => {
        this.state.paused = false;
      },
      onSwapWeapon: () => {
        const p = this.state.player;
        if (p.weapons[1] !== null) {
          p.activeSlot = p.activeSlot === 0 ? 1 : 0;
        }
      },
      onSelectOutcast: (outcastId) => this.selectOutcastInternal(outcastId),
      onSelectSkin: (skinId) => this.selectSkinInternal(skinId),
      onAllocateSkill: (nodeId) => this.allocateSkillInternal(nodeId),
      onToggleModifier: (modifierId) => this.toggleModifierInternal(modifierId),
      onAttachMod: (modId, slot) => {
        const ok = attachModToWeapon(this.state, modId, slot);
        if (ok) {
          this.flushSimEvents();
          this.saveManager.evaluateChallenges(this.state);
        }
        return ok;
      },
      onDetachMod: (modSlotIdx, slot) => {
        const ok = detachModFromWeapon(this.state, modSlotIdx, slot);
        if (ok) this.flushSimEvents();
        return ok;
      },
      onGoldenUpgrade: (slot) => {
        const ok = upgradeWeaponGolden(this.state, slot, false);
        if (ok) this.flushSimEvents();
        return ok;
      },
      onBuyShopOffer: (offerId) => {
        const ok = buyShopOffer(this.state, offerId);
        if (ok) {
          this.recordEquippedWeapons();
          this.flushSimEvents();
        }
        return ok;
      },
      onUseCampfire: (action) => {
        const ok = useCampfireAction(this.state, action);
        if (ok) {
          this.saveManager.getData().unspentSkillPoints = this.state.player.skillPoints;
          this.saveManager.save();
          this.flushSimEvents();
        }
        return ok;
      },
      onUpdateRenderSettings: (partial) => this.updateRenderSettingsInternal(partial),
      onUpdateAudioSettings: (partial) => this.updateAudioSettingsInternal(partial),
      onUpdateControllerSettings: (partial) =>
        this.updateControllerSettingsInternal(partial),
      onSetPackMode: (mode) => this.setPackModeInternal(mode),
      onLoadCustomPack: (files) => this.loadCustomPackFromFilesInternal(files),
      onStartRebind: (action) => this.startKeybindCapture(action),
      onCancelRebind: () => this.input.cancelRebind(),
      onResetKeybinds: () => {
        const defaults = this.input.resetKeybinds();
        this.saveManager.getData().keybinds = { ...defaults };
        this.saveManager.save();
      },
      onTouchInput: (touchInput) => this.input.setTouchInput(touchInput),
      onTouchAction: (action) => this.input.triggerTouchAction(action),
      onTouchDetected: () => {
        this.audio.unlock();
        this.input.getTouchDetector().notifyTouch();
      },
      onPlayUiClick: () => {
        this.audio.unlock();
        this.audio.playUi('click');
      },
      onPlayUiHover: () => {
        this.audio.playUi('hover');
      },
      onPlayUiConfirm: () => {
        this.audio.unlock();
        this.audio.playUi('confirm');
      },
      onPlayUiError: () => {
        this.audio.unlock();
        this.audio.playUi('error');
      },
      getBridge: () => this.debugBridge,
    });
  }

  public async init(): Promise<void> {
    await this.renderer.init();

    // Auto-detect local dev Custom Pack or cached IndexedDB pack
    const detected = await this.packManager.detectCustomPack();
    const savedPackMode = this.saveManager.getData().renderSettings.packMode;
    if (savedPackMode === 'custom' && detected) {
      await this.packManager.setMode('custom');
    } else {
      await this.packManager.setMode('builtin');
    }
    this.syncAudioPackSource();

    this.unsubscribePack = this.packManager.onChange(() => {
      this.syncAudioPackSource();
    });

    this.input.attach();
    this.input.pollGamepad(performance.now());
    const initCtrl = this.input.getControllerStatus();
    this.prevGamepadConnected = initCtrl.gamepadConnected;
    this.prevGamepadCount = initCtrl.gamepadCount;
    this.prevGamepadToastLabel = this.formatGamepadToastTitle(initCtrl);
    this.unsubscribeController = this.input.onControllerChange((status) => {
      this.handleControllerStatusChange(status);
    });
    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    // Expose strict DebugBridge on window.__KRUNKED_DEBUG__
    window.__KRUNKED_DEBUG__ = this.debugBridge;

    // Queue menu theme (activates immediately on first user gesture)
    this.audio.setMusic('music_menu', 'a');

    this.lastRafMs = performance.now();
    this.lastRenderMs = this.lastRafMs;
    this.rafId = requestAnimationFrame(this.loop);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    window.removeEventListener('resize', this.handleResize);
    this.unsubscribePack?.();
    this.unsubscribePack = null;
    this.unsubscribeController?.();
    this.unsubscribeController = null;
    this.input.detach();
    this.ui.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.packManager.dispose();
    if (window.__KRUNKED_DEBUG__ === this.debugBridge) {
      delete window.__KRUNKED_DEBUG__;
    }
  }

  // ==========================================================================
  // FIXED 60 HZ SIM ACCUMULATOR + 30/60/120 FPS FRAME-PACED RENDER LOOP
  // ==========================================================================

  private readonly loop = (nowMs: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const rawDtSec = Math.max(0, (nowMs - this.lastRafMs) / 1000);
    this.lastRafMs = nowMs;
    const clampedDtSec = Math.min(MAX_FRAME_DELTA_SEC, rawDtSec);

    // Sync blocking state before polling so gamepad face buttons route cleanly
    this.input.setUiBlockingGameplay(this.ui.isBlockingGameplay(this.state));
    this.input.pollGamepad(nowMs);

    // Handle global UI hotkeys (F9 Drawer, TAB/View Workbench, ESC/Menu Pause)
    this.processUiInputActions();
    this.input.setUiBlockingGameplay(this.ui.isBlockingGameplay(this.state));

    // Drive responsive 60/120 FPS gamepad menu navigation across all screens/modals
    const navActions = this.input.consumeUiNavActions(nowMs);
    this.ui.processGamepadNav(
      navActions,
      this.state,
      this.input.getControllerStatus(),
    );
    this.input.setUiBlockingGameplay(this.ui.isBlockingGameplay(this.state));

    // Fixed 60 Hz deterministic simulation accumulator
    const prevScreenMode = this.state.screenMode;
    this.accumulatorSec += clampedDtSec;
    let steps = 0;
    while (this.accumulatorSec >= SIM_DT && steps < MAX_SUBSTEPS_PER_FRAME) {
      const inputFrame = this.input.sampleInputFrame(this.state);
      stepSim(this.state, inputFrame);
      this.accumulatorSec -= SIM_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS_PER_FRAME && this.accumulatorSec > SIM_DT) {
      this.accumulatorSec = 0;
    }

    // Drain simulation events into WebGL2Renderer, AudioEngine, Haptics & Save progression
    this.flushSimEvents();
    this.checkRoomTransitionAndRunEnd(prevScreenMode);

    // Frame-paced rendering supporting 30 | 60 | 120 FPS
    const renderSettings = this.saveManager.getData().renderSettings;
    const minIntervalMs =
      renderSettings.targetFps === 120
        ? 0
        : 1000 / renderSettings.targetFps - 1.25;

    const elapsedRenderMs = nowMs - this.lastRenderMs;
    if (elapsedRenderMs >= minIntervalMs) {
      if (elapsedRenderMs > 0 && elapsedRenderMs < 1000) {
        const instantFps = 1000 / elapsedRenderMs;
        this.smoothedFps = this.smoothedFps * 0.85 + instantFps * 0.15;
      }
      this.lastRenderMs = nowMs;

      this.interpAlpha = renderSettings.pixelSnap60
        ? 1
        : Math.max(0, Math.min(1, this.accumulatorSec / SIM_DT));

      this.renderer.render(
        this.state,
        this.interpAlpha,
        renderSettings,
        nowMs * 0.001,
      );

      const aimPos = this.input.getAimScreenPos(
        this.state,
        (wx, wy, simState) => this.renderer.worldToScreen(wx, wy, simState),
      );
      const controllerStatus = this.input.getControllerStatus();
      const promptGlyphs = this.input.getPromptGlyphs();

      this.ui.render(
        this.state,
        this.saveManager.getData(),
        this.saveManager.hasExistingSave(),
        this.buildMetrics(),
        aimPos,
        this.input.isRebinding(),
        nowMs,
        controllerStatus,
        promptGlyphs,
      );
    }
  };

  private processUiInputActions(): void {
    const uiActs = this.input.consumeUiActions();
    if (uiActs.togglePlaytestDrawer) {
      this.audio.playUi('click');
      this.ui.togglePlaytestDrawer();
    }
    if (uiActs.toggleWorkbench) {
      this.audio.playUi('click');
      this.toggleWorkbench();
    }
    if (uiActs.togglePause) {
      this.audio.playUi('click');
      this.ui.handleEscapeKey(this.state);
    }
  }

  private flushSimEvents(): void {
    const events = drainSimEvents(this.state);
    if (events.length === 0) return;

    this.renderer.ingestEvents(events, this.state);
    this.audio.handleEvents(events, this.state.player.x);
    this.triggerHapticsForEvents(events);
    this.processProgressionEvents(events);
  }

  private triggerHapticsForEvents(events: readonly SimEvent[]): void {
    let bestIntensity = 0;
    let bestDurationMs = 0;
    let bestWeakScale = 0.65;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      let intensity = 0;
      let durationMs = 0;
      let weakScale = 0.65;

      switch (ev.type) {
        case 'weapon_fire':
          intensity = 0.18;
          durationMs = 42;
          weakScale = 0.9;
          break;
        case 'ability_trigger':
          intensity = 0.34;
          durationMs = 68;
          weakScale = 0.85;
          break;
        case 'player_hit':
          intensity = 0.68;
          durationMs = 155;
          weakScale = 0.72;
          break;
        case 'explosion': {
          const scale = Math.max(0.6, Math.min(1.15, ev.intensity || 1));
          intensity = Math.min(0.92, 0.78 * scale);
          durationMs = 185;
          weakScale = 0.62;
          break;
        }
        case 'boss_phase2':
          intensity = 1.0;
          durationMs = 320;
          weakScale = 0.88;
          break;
        default:
          break;
      }

      if (intensity > bestIntensity) {
        bestIntensity = intensity;
        bestDurationMs = durationMs;
        bestWeakScale = weakScale;
      }
    }

    if (bestIntensity > 0) {
      this.input.rumble(bestIntensity, bestDurationMs, bestWeakScale);
    }
  }

  private formatGamepadToastTitle(status: ControllerStatus): string {
    const low = status.gamepadName.toLowerCase();
    switch (status.gamepadProfile) {
      case 'xbox':
        return 'XBOX CONTROLLER';
      case 'playstation':
        return low.includes('dualsense')
          ? 'DUALSENSE CONTROLLER'
          : low.includes('dualshock')
            ? 'DUALSHOCK CONTROLLER'
            : 'PLAYSTATION CONTROLLER';
      case 'nintendo':
        return 'NINTENDO CONTROLLER';
      case 'steamdeck':
        return 'STEAM DECK CONTROLLER';
      case 'tesla':
        return 'TESLA CONTROLLER';
      default:
        return 'GAMEPAD CONTROLLER';
    }
  }

  private handleControllerStatusChange(status: ControllerStatus): void {
    const wasConnected = this.prevGamepadConnected;
    const prevCount = this.prevGamepadCount;
    const prevLabel = this.prevGamepadToastLabel;

    this.prevGamepadConnected = status.gamepadConnected;
    this.prevGamepadCount = status.gamepadCount;
    const curLabel = this.formatGamepadToastTitle(status);
    if (status.gamepadConnected) {
      this.prevGamepadToastLabel = curLabel;
    }

    if (
      status.gamepadConnected &&
      (!wasConnected || status.gamepadCount > prevCount)
    ) {
      this.audio.unlock();
      this.audio.playUi('confirm');
      this.ui.showControllerToast(`${curLabel} CONNECTED`, 'connected');
    } else if (wasConnected && !status.gamepadConnected) {
      this.audio.playUi('click');
      const label = prevLabel || 'CONTROLLER';
      this.ui.showControllerToast(`${label} DISCONNECTED`, 'disconnected');
    }
  }

  private processProgressionEvents(events: readonly SimEvent[]): void {
    const save = this.saveManager.getData();
    let dirty = false;
    let shouldCheckChallenges = false;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'enemy_death':
          if (ev.defId !== 'training_dummy') {
            save.totalKills += 1;
            dirty = true;
            shouldCheckChallenges = true;
          }
          if (this.saveManager.recordDiscoveredEnemy(ev.defId)) {
            dirty = false; // already saved inside recordDiscoveredEnemy
          }
          break;
        case 'boss_spawn':
          this.saveManager.recordDiscoveredEnemy(`boss_${ev.bossId}_p1`);
          break;
        case 'boss_phase2':
          this.saveManager.recordDiscoveredEnemy(`boss_${ev.bossId}_p2`);
          break;
        case 'boss_defeated':
          this.saveManager.recordDefeatedBoss(ev.bossId);
          shouldCheckChallenges = true;
          break;
        case 'pickup_collect':
          if (ev.kind === 'weapon') {
            this.recordEquippedWeapons();
          }
          break;
        case 'level_up':
          save.unspentSkillPoints = this.state.player.skillPoints;
          dirty = true;
          break;
        default:
          break;
      }
    }

    if (shouldCheckChallenges) {
      const newlyDone = this.saveManager.evaluateChallenges(this.state);
      if (newlyDone.length > 0) {
        this.audio.playUi('levelup');
        dirty = false;
      }
    }

    if (dirty) {
      this.saveManager.save();
    }
  }

  private checkRoomTransitionAndRunEnd(prevScreenMode: ScreenMode): void {
    const roomSig = `${this.state.screenMode}:${this.state.currentNodeId}:${this.state.map.width}x${this.state.map.height}`;
    if (roomSig !== this.lastRoomSignature) {
      this.lastRoomSignature = roomSig;
      this.renderer.clearRoomDecals();
      this.recordVisibleEnemiesAndWeapons();
    }

    // Track run completion / loop record / gameover saves
    if (
      prevScreenMode !== this.state.screenMode &&
      (this.state.screenMode === 'victory' || this.state.screenMode === 'gameover')
    ) {
      const save = this.saveManager.getData();
      save.unspentSkillPoints = this.state.player.skillPoints;
      if (this.state.loopCount > save.bestLoop) {
        save.bestLoop = this.state.loopCount;
      }
      this.saveManager.evaluateChallenges(this.state);
      this.saveManager.save();
    }
  }

  // ==========================================================================
  // FLOW & STATE TRANSITIONS
  // ==========================================================================

  private hydrateStateFromSave(): void {
    const save = this.saveManager.getData();
    this.state.skillRanks = { ...save.skillRanks };
    this.state.activeModifiers = [...save.activeModifiers];
    this.state.player.skillPoints = save.unspentSkillPoints;

    // Recompute player maxHp & derived stats from loaded skill ranks
    const outcast = getOutcastDef(save.selectedOutcast);
    const hpBonus = getSkillEffectValue(this.state.skillRanks, 'max_hp_add', 0);
    this.state.player.maxHp = outcast.maxHp + hpBonus;
    this.state.player.hp = this.state.player.maxHp;

    const ammoMult = getSkillEffectValue(this.state.skillRanks, 'max_ammo_mult', 1);
    const baseMax: readonly [number, number, number, number, number, number] = [
      0, 240, 72, 96, 180, 36,
    ];
    for (let a = 1; a <= 5; a++) {
      const idx = a as AmmoType;
      const cap = Math.round(baseMax[idx] * ammoMult);
      this.state.player.maxAmmo[idx] = cap;
      this.state.player.ammo[idx] = cap;
    }

    const active = this.state.player.weapons[0];
    if (active) {
      const stats = computeEffectiveWeaponStats(
        getWeaponDef(active.uniqueId),
        active.mods,
        active.golden,
        this.state.skillRanks,
      );
      syncPlayerDerivedStats(this.state, stats);
    }
    this.recordEquippedWeapons();
  }

  private startNewRun(): void {
    const save = this.saveManager.getData();
    save.totalRuns += 1;
    this.runCountedCurrentSession = true;
    this.saveManager.save();

    const skin = save.selectedSkins[save.selectedOutcast] ?? 'original';
    this.state = createInitialSimState(
      (Date.now() & 0x7fffffff) || 1337,
      save.selectedOutcast,
      skin,
    );
    this.hydrateStateFromSave();
    enterHub(this.state);
    this.renderer.clearRoomDecals();
    this.flushSimEvents();
  }

  private continueSavedRun(): void {
    const save = this.saveManager.getData();
    if (!this.runCountedCurrentSession) {
      save.totalRuns += 1;
      this.runCountedCurrentSession = true;
      this.saveManager.save();
    }
    this.hydrateStateFromSave();
    enterHub(this.state);
    this.renderer.clearRoomDecals();
    this.flushSimEvents();
  }

  private retryRunInternal(): void {
    const save = this.saveManager.getData();
    save.totalRuns += 1;
    this.saveManager.save();

    const skin = save.selectedSkins[save.selectedOutcast] ?? 'original';
    this.state = createInitialSimState(
      (Date.now() & 0x7fffffff) || 1337,
      save.selectedOutcast,
      skin,
    );
    this.hydrateStateFromSave();
    enterNode(this.state, 'act1_canyon');
    this.renderer.clearRoomDecals();
    this.flushSimEvents();
  }

  private startNextLoopInternal(): void {
    startNextLoop(this.state);
    const save = this.saveManager.getData();
    if (this.state.loopCount > save.bestLoop) {
      save.bestLoop = this.state.loopCount;
    }
    this.saveManager.evaluateChallenges(this.state);
    this.saveManager.save();
    this.renderer.clearRoomDecals();
    this.flushSimEvents();
  }

  private returnToHubInternal(): void {
    this.ui.openSystemOverlay('none');
    enterHub(this.state);
    this.renderer.clearRoomDecals();
    this.flushSimEvents();
  }

  private returnToTitleInternal(): void {
    this.ui.openSystemOverlay('none');
    this.state.paused = false;
    this.state.hubPanel = 'none';
    this.state.screenMode = 'title';
    this.audio.setMusic('music_menu', 'a');
  }

  private warpToNodeInternal(nodeId: string): void {
    this.ui.openSystemOverlay('none');
    enterNode(this.state, nodeId);
    this.renderer.clearRoomDecals();
    this.recordVisibleEnemiesAndWeapons();
    this.flushSimEvents();
  }

  private toggleWorkbench(): void {
    if (this.ui.getSystemOverlay() !== 'none') return;
    const mode = this.state.screenMode;
    if (mode === 'workbench') {
      this.closeWorkbench();
    } else if (mode === 'combat' || mode === 'hub' || mode === 'overworld') {
      this.workbenchReturnMode = mode;
      this.state.hubPanel = 'none';
      this.state.paused = false;
      this.state.screenMode = 'workbench';
    }
  }

  private closeWorkbench(): void {
    if (this.state.screenMode === 'workbench') {
      this.state.screenMode = this.workbenchReturnMode;
    }
  }

  private selectOutcastInternal(outcastId: OutcastId): void {
    const save = this.saveManager.getData();
    save.selectedOutcast = outcastId;
    const skin = save.selectedSkins[outcastId] ?? 'original';
    setPlayerOutcast(this.state, outcastId, skin);
    this.recordEquippedWeapons();
    this.saveManager.save();
    this.flushSimEvents();
  }

  private selectSkinInternal(skinId: SkinId): void {
    const save = this.saveManager.getData();
    this.state.player.skinId = skinId;
    save.selectedSkins[this.state.player.outcastId] = skinId;
    this.saveManager.save();
  }

  private allocateSkillInternal(nodeId: string): boolean {
    const ok = allocateSkillNode(this.state, nodeId);
    if (ok) {
      const save = this.saveManager.getData();
      save.skillRanks = { ...this.state.skillRanks };
      save.unspentSkillPoints = this.state.player.skillPoints;
      this.saveManager.save();
      this.audio.playUi('levelup');
      this.flushSimEvents();
    } else {
      this.audio.playUi('error');
    }
    return ok;
  }

  private toggleModifierInternal(modifierId: string): void {
    const idx = this.state.activeModifiers.indexOf(modifierId);
    if (idx >= 0) {
      this.state.activeModifiers.splice(idx, 1);
    } else {
      this.state.activeModifiers.push(modifierId);
    }
    this.saveManager.getData().activeModifiers = [...this.state.activeModifiers];
    this.saveManager.save();
  }

  private updateRenderSettingsInternal(partial: Partial<RenderSettings>): void {
    const rs = this.saveManager.getData().renderSettings;
    if (partial.targetFps === 30 || partial.targetFps === 60 || partial.targetFps === 120) {
      rs.targetFps = partial.targetFps;
    }
    if (typeof partial.pixelSnap60 === 'boolean') {
      rs.pixelSnap60 = partial.pixelSnap60;
    }
    if (typeof partial.screenshakeScale === 'number' && Number.isFinite(partial.screenshakeScale)) {
      rs.screenshakeScale = Math.max(0, Math.min(2, partial.screenshakeScale));
    }
    if (typeof partial.lightingEnabled === 'boolean') {
      rs.lightingEnabled = partial.lightingEnabled;
    }
    if (typeof partial.bloodEnabled === 'boolean') {
      rs.bloodEnabled = partial.bloodEnabled;
    }
    if (partial.packMode === 'builtin' || partial.packMode === 'custom') {
      void this.setPackModeInternal(partial.packMode);
    }
    this.saveManager.save();
  }

  private updateAudioSettingsInternal(partial: Partial<AudioSettings>): void {
    const as = this.saveManager.getData().audioSettings;
    if (typeof partial.masterVolume === 'number' && Number.isFinite(partial.masterVolume)) {
      as.masterVolume = Math.max(0, Math.min(1, partial.masterVolume));
    }
    if (typeof partial.musicVolume === 'number' && Number.isFinite(partial.musicVolume)) {
      as.musicVolume = Math.max(0, Math.min(1, partial.musicVolume));
    }
    if (typeof partial.sfxVolume === 'number' && Number.isFinite(partial.sfxVolume)) {
      as.sfxVolume = Math.max(0, Math.min(1, partial.sfxVolume));
    }
    if (typeof partial.muted === 'boolean') {
      as.muted = partial.muted;
    }
    this.audio.applySettings(as);
    this.saveManager.save();
  }

  private updateControllerSettingsInternal(
    partial: Partial<ControllerSettings>,
  ): void {
    this.input.setControllerSettings(partial);
    this.saveManager.getData().controllerSettings = {
      ...this.input.getControllerSettings(),
    };
    this.saveManager.save();
  }

  private async setPackModeInternal(mode: AssetPackMode): Promise<boolean> {
    const ok = await this.packManager.setMode(mode);
    this.syncAudioPackSource();
    this.saveManager.getData().renderSettings.packMode = this.packManager.getMode();
    this.saveManager.save();
    return ok;
  }

  private async loadCustomPackFromFilesInternal(
    files: FileList,
  ): Promise<CustomPackImportResult> {
    const result = await this.packManager.loadCustomPackFromFiles(files);
    if (result.ok) {
      this.syncAudioPackSource();
      this.saveManager.getData().renderSettings.packMode = this.packManager.getMode();
      this.saveManager.save();
    }
    return result;
  }

  private syncAudioPackSource(): void {
    const mode = this.packManager.getMode();
    this.audio.setPackSource(
      mode,
      mode === 'custom'
        ? (key, kind) => this.packManager.resolveAudioUrl(key, kind)
        : undefined,
    );
  }

  private startKeybindCapture(action: KeybindAction): void {
    this.input.startRebind(action, (_act, code) => {
      if (code) {
        this.saveManager.getData().keybinds = { ...this.input.getKeybinds() };
        this.saveManager.save();
        this.audio.playUi('confirm');
      } else {
        this.audio.playUi('click');
      }
    });
  }

  private recordEquippedWeapons(): void {
    const [w0, w1] = this.state.player.weapons;
    if (w0) this.saveManager.recordDiscoveredWeapon(w0.uniqueId);
    if (w1) this.saveManager.recordDiscoveredWeapon(w1.uniqueId);
  }

  private recordVisibleEnemiesAndWeapons(): void {
    this.recordEquippedWeapons();
    for (let i = 0; i < this.state.enemies.length; i++) {
      this.saveManager.recordDiscoveredEnemy(this.state.enemies[i].defId);
    }
  }

  private buildMetrics(): RuntimeMetrics {
    const rs = this.saveManager.getData().renderSettings;
    return {
      fps: this.smoothedFps,
      targetFps: rs.targetFps,
      simHz: SIM_HZ,
      tick: this.state.tick,
      interpAlpha: this.interpAlpha,
      entityCount: this.state.enemies.length + this.state.companions.length + 1,
      projectileCount: this.state.projectiles.length,
      pickupCount: this.state.pickups.length,
      packMode: this.packManager.getMode(),
      customPackAvailable: this.packManager.isCustomPackAvailable(),
      stateHash: hashSimState(this.state),
    };
  }

  // ==========================================================================
  // WINDOW.__KRUNKED_DEBUG__ CONTRACT BRIDGE
  // ==========================================================================

  private createDebugBridge(): DebugBridge {
    return {
      getState: () => this.state,
      getHash: () => hashSimState(this.state),
      getMetrics: () => this.buildMetrics(),
      stepTicks: (count: number, input?: Partial<InputFrame>): string => {
        const safeCount = Math.max(0, Math.min(36000, Math.floor(count)));
        const base = createNeutralInput();
        const merged: InputFrame = input ? { ...base, ...input } : base;
        const holdOnly: InputFrame = {
          ...merged,
          firePrimaryPressed: false,
          abilityPressed: false,
          powerPressed: false,
          swapWeaponPressed: false,
          interactPressed: false,
          reloadOrVentPressed: false,
          pausePressed: false,
        };
        for (let i = 0; i < safeCount; i++) {
          stepSim(this.state, i === 0 ? merged : holdOnly);
        }
        this.flushSimEvents();
        return hashSimState(this.state);
      },
      warpToNode: (nodeId: string) => {
        this.warpToNodeInternal(nodeId);
      },
      spawnBoss: (bossId: BossId) => {
        this.ui.openSystemOverlay('none');
        const bossDef = getBossDef(bossId);
        // Enter the authentic boss arena node (which spawns Phase 1 cleanly),
        // or force-spawn if already inside that arena
        if (this.state.currentNodeId !== bossDef.nodeId || this.state.screenMode !== 'combat') {
          enterNode(this.state, bossDef.nodeId);
          this.renderer.clearRoomDecals();
        } else {
          spawnBossById(this.state, bossId);
        }
        this.recordVisibleEnemiesAndWeapons();
        this.flushSimEvents();
      },
      triggerBossPhase2: () => {
        triggerActiveBossPhase2(this.state);
        this.recordVisibleEnemiesAndWeapons();
        this.flushSimEvents();
      },
      setOutcast: (outcastId: OutcastId) => {
        this.selectOutcastInternal(outcastId);
      },
      setSkin: (skinId: SkinId) => {
        this.selectSkinInternal(skinId);
      },
      grantWeapon: (uniqueId: number, slot?: 0 | 1) => {
        equipWeaponByUniqueId(this.state, uniqueId, slot);
        this.saveManager.recordDiscoveredWeapon(uniqueId);
        this.flushSimEvents();
      },
      grantMod: (modId: string, attachToActive = true) => {
        this.state.player.backpackMods.push(modId);
        if (attachToActive) {
          attachModToWeapon(this.state, modId, this.state.player.activeSlot);
          this.saveManager.evaluateChallenges(this.state);
        }
        this.flushSimEvents();
      },
      grantResources: (opts) => {
        const p = this.state.player;
        if (typeof opts.gold === 'number' && Number.isFinite(opts.gold)) {
          p.gold = Math.max(0, p.gold + Math.floor(opts.gold));
        }
        if (typeof opts.skillPoints === 'number' && Number.isFinite(opts.skillPoints)) {
          p.skillPoints = Math.max(0, p.skillPoints + Math.floor(opts.skillPoints));
          this.saveManager.getData().unspentSkillPoints = p.skillPoints;
          this.saveManager.save();
        }
        if (typeof opts.ammo === 'number' && Number.isFinite(opts.ammo)) {
          const add = Math.floor(opts.ammo);
          for (let a = 1; a <= 5; a++) {
            const idx = a as AmmoType;
            p.ammo[idx] = Math.min(p.maxAmmo[idx], Math.max(0, p.ammo[idx] + add));
          }
        }
        if (typeof opts.hp === 'number' && Number.isFinite(opts.hp)) {
          p.hp = Math.min(p.maxHp, Math.max(1, p.hp + opts.hp));
          p.shield = p.maxShield;
        }
      },
      triggerFreezeStorm: (intensity = 0.85) => {
        setFreezeStormIntensity(this.state, intensity);
        this.flushSimEvents();
      },
      setGodMode: (enabled: boolean) => {
        this.state.godMode = Boolean(enabled);
      },
      setPackMode: (mode: AssetPackMode) => this.setPackModeInternal(mode),
      setRenderSettings: (partial: Partial<RenderSettings>) => {
        this.updateRenderSettingsInternal(partial);
      },
      setScreenMode: (mode: ScreenMode, hubPanel?: HubPanel) => {
        this.ui.openSystemOverlay('none');
        this.state.paused = false;
        if (mode === 'hub') {
          enterHub(this.state);
          if (hubPanel) this.state.hubPanel = hubPanel;
          this.renderer.clearRoomDecals();
          this.flushSimEvents();
          return;
        }
        if (mode === 'overworld') {
          enterOverworld(this.state);
          this.flushSimEvents();
          return;
        }
        if (mode === 'title') {
          this.returnToTitleInternal();
          return;
        }
        this.state.screenMode = mode;
        if (hubPanel !== undefined) {
          this.state.hubPanel = hubPanel;
        }
      },
      resetSave: () => {
        const clean = this.saveManager.reset();
        this.input.setKeybinds(clean.keybinds);
        this.input.setControllerSettings(clean.controllerSettings);
        this.audio.applySettings(clean.audioSettings);
        void this.packManager.setMode('builtin');
        this.syncAudioPackSource();
        this.state = createInitialSimState(1337, clean.selectedOutcast, 'original');
        this.hydrateStateFromSave();
        this.renderer.clearRoomDecals();
      },
      listBosses: () => BOSSES.map((b) => b.id),
      listNodes: () => OVERWORLD_NODES.map((n) => n.id),
    };
  }

  private readonly handleResize = (): void => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const width = this.appRoot.clientWidth || window.innerWidth || 640;
    const height = this.appRoot.clientHeight || window.innerHeight || 360;
    this.renderer.resize(width, height, dpr);
  };
}
