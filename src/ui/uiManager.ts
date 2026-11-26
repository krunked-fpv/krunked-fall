// ============================================================================
// KRUNKEDFALL — Master UI Manager (Coordinates All Screens, HUD & Overlays)
// ============================================================================

import type {
  AssetPackMode,
  AudioSettings,
  ControllerSettings,
  ControllerStatus,
  DebugBridge,
  HubPanel,
  OutcastId,
  RenderSettings,
  RuntimeMetrics,
  SaveData,
  SimState,
  SkinId,
  UiNavActions,
} from '../contracts/index.js';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  type GamepadGlyphSet,
  type KeybindAction,
} from '../input/index.js';
import type { CustomPackImportResult } from '../render/index.js';
import { CombatHud } from './combatHud.js';
import { GamepadNavigator } from './gamepadNav.js';
import { HubUi } from './hubUi.js';
import { Overlays, type ModalOverlayKind } from './overlays.js';
import { OverworldUi } from './overworldUi.js';
import { PlaytestDrawer } from './playtestDrawer.js';
import { TitleScreen } from './titleScreen.js';
import {
  TouchControls,
  type TouchActionKind,
  type TouchControlsInputState,
} from './touchControls.js';

export interface UiManagerCallbacks {
  onNewRun(): void;
  onContinue(): void;
  onOpenHubPanel(panel: HubPanel): void;
  onLaunchOverworld(): void;
  onDeployNode(nodeId: string): void;
  onReturnToHub(): void;
  onReturnToTitle(): void;
  onLeaveToOverworld(): void;
  onRetryRun(): void;
  onStartNextLoop(): void;
  onToggleWorkbench(): void;
  onCloseWorkbench(): void;
  onResumeGame(): void;
  onSwapWeapon(): void;
  onSelectOutcast(outcastId: OutcastId): void;
  onSelectSkin(skinId: SkinId): void;
  onAllocateSkill(nodeId: string): boolean;
  onToggleModifier(modifierId: string): void;
  onAttachMod(modId: string, slot: 0 | 1): boolean;
  onDetachMod(modSlotIdx: number, slot: 0 | 1): boolean;
  onGoldenUpgrade(slot: 0 | 1): boolean;
  onBuyShopOffer(offerId: string): boolean;
  onUseCampfire(action: 'heal' | 'ammo' | 'upgrade' | 'skill'): boolean;
  onUpdateRenderSettings(partial: Partial<RenderSettings>): void;
  onUpdateAudioSettings(partial: Partial<AudioSettings>): void;
  onUpdateControllerSettings(partial: Partial<ControllerSettings>): void;
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onLoadCustomPack(files: FileList): Promise<CustomPackImportResult>;
  onStartRebind(action: KeybindAction): void;
  onCancelRebind(): void;
  onResetKeybinds(): void;
  onTouchInput(input: TouchControlsInputState): void;
  onTouchAction(action: TouchActionKind): void;
  onTouchDetected(): void;
  onPlayUiClick(): void;
  getBridge(): DebugBridge;
}

const TOAST_DURATION_MS = 3000;
const TOAST_FADE_MS = 220;
const NEUTRAL_UI_NAV: Readonly<UiNavActions> = {
  moveX: 0,
  moveY: 0,
  confirm: false,
  cancel: false,
  tabPrev: false,
  tabNext: false,
  pageUp: false,
  pageDown: false,
};

export class UiManager {
  private readonly appRoot: HTMLElement;
  private readonly cb: UiManagerCallbacks;

  private readonly titleScreen: TitleScreen;
  private readonly hubUi: HubUi;
  private readonly overworldUi: OverworldUi;
  private readonly combatHud: CombatHud;
  private readonly overlays: Overlays;
  private readonly playtestDrawer: PlaytestDrawer;
  private readonly touchControls: TouchControls;
  private readonly gamepadNav: GamepadNavigator;

  private readonly toastEl: HTMLElement;
  private readonly toastTextEl: HTMLElement;
  private toastVisible = false;
  private toastFadeStartMs = 0;
  private toastHideAtMs = 0;
  private lastUiClickMs = 0;

  private systemOverlay: 'none' | 'options' | 'keybinds' = 'none';
  private hidingCursor = false;
  private touchActiveClass = false;

  constructor(
    appRoot: HTMLElement,
    uiRoot: HTMLElement,
    callbacks: UiManagerCallbacks,
  ) {
    this.appRoot = appRoot;
    this.cb = callbacks;

    this.titleScreen = new TitleScreen(uiRoot, {
      onNewRun: callbacks.onNewRun,
      onContinue: callbacks.onContinue,
      onOpenOptions: () => {
        this.systemOverlay = 'options';
      },
      onOpenKeybinds: () => {
        this.systemOverlay = 'keybinds';
      },
      onSetPackMode: callbacks.onSetPackMode,
      onLoadCustomPack: callbacks.onLoadCustomPack,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.hubUi = new HubUi(uiRoot, {
      onOpenPanel: callbacks.onOpenHubPanel,
      onLaunchOverworld: callbacks.onLaunchOverworld,
      onOpenWorkbench: callbacks.onToggleWorkbench,
      onOpenPause: () => {
        callbacks.getBridge().getState().paused = true;
      },
      onSelectOutcast: callbacks.onSelectOutcast,
      onSelectSkin: callbacks.onSelectSkin,
      onAllocateSkill: callbacks.onAllocateSkill,
      onToggleModifier: callbacks.onToggleModifier,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.overworldUi = new OverworldUi(uiRoot, {
      onDeployNode: callbacks.onDeployNode,
      onReturnToHub: callbacks.onReturnToHub,
      onOpenWorkbench: callbacks.onToggleWorkbench,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.combatHud = new CombatHud(uiRoot, {
      onOpenWorkbench: callbacks.onToggleWorkbench,
      onOpenPause: () => {
        callbacks.getBridge().getState().paused = true;
      },
      onSwapWeapon: callbacks.onSwapWeapon,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.touchControls = new TouchControls(uiRoot, {
      onTouchInput: callbacks.onTouchInput,
      onTouchAction: callbacks.onTouchAction,
      onTouchDetected: callbacks.onTouchDetected,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.overlays = new Overlays(uiRoot, {
      onCloseOverlay: () => this.handleCloseOverlay(),
      onResumeGame: () => {
        this.systemOverlay = 'none';
        callbacks.onResumeGame();
      },
      onOpenOptions: () => {
        this.systemOverlay = 'options';
      },
      onOpenKeybinds: () => {
        this.systemOverlay = 'keybinds';
      },
      onReturnToHub: () => {
        this.systemOverlay = 'none';
        callbacks.onReturnToHub();
      },
      onReturnToTitle: () => {
        this.systemOverlay = 'none';
        callbacks.onReturnToTitle();
      },
      onLeaveToOverworld: () => {
        this.systemOverlay = 'none';
        callbacks.onLeaveToOverworld();
      },
      onRetryRun: () => {
        this.systemOverlay = 'none';
        callbacks.onRetryRun();
      },
      onStartNextLoop: () => {
        this.systemOverlay = 'none';
        callbacks.onStartNextLoop();
      },
      onAttachMod: callbacks.onAttachMod,
      onDetachMod: callbacks.onDetachMod,
      onGoldenUpgrade: callbacks.onGoldenUpgrade,
      onBuyShopOffer: callbacks.onBuyShopOffer,
      onUseCampfire: callbacks.onUseCampfire,
      onUpdateRenderSettings: callbacks.onUpdateRenderSettings,
      onUpdateAudioSettings: callbacks.onUpdateAudioSettings,
      onUpdateControllerSettings: callbacks.onUpdateControllerSettings,
      onSetPackMode: callbacks.onSetPackMode,
      onStartRebind: callbacks.onStartRebind,
      onResetKeybinds: callbacks.onResetKeybinds,
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.playtestDrawer = new PlaytestDrawer(uiRoot, {
      getBridge: callbacks.getBridge,
      onClose: () => this.playtestDrawer.setOpen(false),
      onPlayUiClick: callbacks.onPlayUiClick,
    });

    this.gamepadNav = new GamepadNavigator(uiRoot, {
      onCancel: () => this.handleGamepadCancel(callbacks.getBridge().getState()),
      onPlayUiClick: () => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this.lastUiClickMs >= 45) {
          this.lastUiClickMs = now;
          callbacks.onPlayUiClick();
        }
      },
    });

    // Non-intrusive Controller Connect / Disconnect Toast
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'kf-controller-toast hidden';
    this.toastEl.dataset.testid = 'controller-toast';
    this.toastEl.style.display = 'none';
    const dot = document.createElement('span');
    dot.className = 'kf-controller-toast-dot';
    this.toastTextEl = document.createElement('span');
    this.toastEl.append(dot, this.toastTextEl);
    uiRoot.appendChild(this.toastEl);
  }

  public togglePlaytestDrawer(): void {
    this.playtestDrawer.toggle();
  }

  public openSystemOverlay(kind: 'none' | 'options' | 'keybinds'): void {
    this.systemOverlay = kind;
  }

  public getSystemOverlay(): 'none' | 'options' | 'keybinds' {
    return this.systemOverlay;
  }

  public showControllerToast(
    message: string,
    kind: 'connected' | 'disconnected' | 'info' = 'info',
    nowMs?: number,
  ): void {
    const now =
      nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.toastTextEl.textContent = message;
    this.toastEl.style.display = 'inline-flex';
    const variant =
      kind === 'connected'
        ? ' connected'
        : kind === 'disconnected'
          ? ' disconnected'
          : '';
    this.toastEl.className = `kf-controller-toast visible${variant}`;
    this.toastVisible = true;
    this.toastFadeStartMs = now + TOAST_DURATION_MS;
    this.toastHideAtMs = this.toastFadeStartMs + TOAST_FADE_MS;
  }

  public processGamepadNav(
    actions: UiNavActions,
    state: SimState,
    controllerStatus: ControllerStatus,
  ): void {
    const active =
      controllerStatus.activeDevice === 'gamepad' &&
      this.isBlockingGameplay(state) &&
      !this.playtestDrawer.isOpen();
    this.gamepadNav.update(actions, active);
  }

  public handleEscapeKey(state: SimState): void {
    if (this.systemOverlay !== 'none') {
      this.cb.onCancelRebind();
      this.systemOverlay = 'none';
      return;
    }
    if (state.screenMode === 'workbench') {
      this.cb.onCloseWorkbench();
      return;
    }
    if (state.screenMode === 'hub' && state.hubPanel !== 'none') {
      this.cb.onOpenHubPanel('none');
      return;
    }
    if (state.screenMode === 'combat' || state.screenMode === 'hub') {
      state.paused = !state.paused;
    }
  }

  private handleGamepadCancel(state: SimState): void {
    if (this.systemOverlay !== 'none') {
      this.cb.onCancelRebind();
      this.systemOverlay = 'none';
      return;
    }
    if (state.screenMode === 'workbench') {
      this.cb.onCloseWorkbench();
      return;
    }
    if (state.screenMode === 'hub' && state.hubPanel !== 'none') {
      this.cb.onOpenHubPanel('none');
      return;
    }
    if (state.screenMode === 'overworld') {
      this.cb.onReturnToHub();
      return;
    }
    if (state.screenMode === 'shop' || state.screenMode === 'campfire') {
      this.cb.onLeaveToOverworld();
      return;
    }
    if (state.paused && (state.screenMode === 'combat' || state.screenMode === 'hub')) {
      this.cb.onResumeGame();
    }
  }

  private handleCloseOverlay(): void {
    const state = this.cb.getBridge().getState();
    if (this.systemOverlay !== 'none') {
      this.cb.onCancelRebind();
      this.systemOverlay = 'none';
      return;
    }
    if (state.screenMode === 'workbench') {
      this.cb.onCloseWorkbench();
      return;
    }
    if (state.paused) {
      this.cb.onResumeGame();
    }
  }

  public isBlockingGameplay(state: SimState): boolean {
    if (this.systemOverlay !== 'none') return true;
    if (state.paused) return true;
    if (state.screenMode === 'hub' && state.hubPanel !== 'none') return true;
    if (state.screenMode !== 'combat' && state.screenMode !== 'hub') return true;
    return false;
  }

  public render(
    state: SimState,
    save: SaveData,
    hasContinue: boolean,
    metrics: RuntimeMetrics,
    cursor: { x: number; y: number; visible: boolean; isStickAim?: boolean; isStick?: boolean },
    rebindingAction: KeybindAction | null,
    nowMs: number,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const mode = state.screenMode;
    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';

    if (activeDevice !== 'gamepad' || !this.isBlockingGameplay(state)) {
      this.gamepadNav.clearFocus();
    }

    // 1. Primary screen layers
    this.titleScreen.setVisible(mode === 'title');
    if (mode === 'title') {
      this.titleScreen.render(
        save,
        hasContinue,
        metrics.packMode,
        metrics.customPackAvailable,
        controllerStatus,
        prompts,
      );
    }

    this.hubUi.setVisible(mode === 'hub');
    if (mode === 'hub') {
      this.hubUi.render(state, save, controllerStatus, prompts);
    }

    this.overworldUi.setVisible(mode === 'overworld', state);
    if (mode === 'overworld') {
      this.overworldUi.render(state, controllerStatus, prompts);
    }

    const activeOverlay = this.resolveOverlayKind(state);
    const showCombatHud = mode === 'combat' || mode === 'workbench';
    this.combatHud.setVisible(showCombatHud);

    const activeCrosshair =
      mode === 'combat' &&
      activeOverlay === 'none' &&
      !state.paused &&
      !this.playtestDrawer.isOpen();

    if (showCombatHud) {
      this.combatHud.update(
        state,
        cursor,
        activeCrosshair,
        prompts,
        controllerStatus,
      );
    }

    // Toggle custom combat cursor cleanly (never hide OS cursor inside menus/drawer)
    const shouldHideCursor =
      activeCrosshair && cursor.visible && activeDevice === 'keyboard';
    if (shouldHideCursor !== this.hidingCursor) {
      this.hidingCursor = shouldHideCursor;
      this.appRoot.classList.toggle('kf-hide-cursor', shouldHideCursor);
    }

    // 2. Virtual Touch Controls — STRICT visibility rule (never shown on desktop PCs or menus!)
    const showTouchControls =
      controllerStatus?.touchControlsVisible === true &&
      !this.isBlockingGameplay(state) &&
      (mode === 'combat' || mode === 'hub') &&
      !this.playtestDrawer.isOpen();

    this.touchControls.setVisible(showTouchControls);
    const ctrlSettings = save.controllerSettings ?? DEFAULT_CONTROLLER_SETTINGS;
    this.touchControls.update(state, {
      touchOpacity: ctrlSettings.touchOpacity,
      touchScale: ctrlSettings.touchScale,
    });

    if (showTouchControls !== this.touchActiveClass) {
      this.touchActiveClass = showTouchControls;
      this.appRoot.classList.toggle('kf-touch-active', showTouchControls);
    }

    // 3. Modal overlays
    this.overlays.render(
      activeOverlay,
      state,
      save,
      metrics.packMode,
      metrics.customPackAvailable,
      rebindingAction,
      controllerStatus,
      prompts,
    );

    // Keep gamepad focus ring synced immediately after any DOM rebuild (zero flicker)
    if (
      activeDevice === 'gamepad' &&
      this.isBlockingGameplay(state) &&
      !this.playtestDrawer.isOpen()
    ) {
      this.gamepadNav.update(NEUTRAL_UI_NAV, true);
    }

    // 4. Controller connect/disconnect toast expiry
    if (this.toastVisible) {
      if (nowMs >= this.toastHideAtMs) {
        this.toastVisible = false;
        this.toastEl.style.display = 'none';
      } else if (nowMs >= this.toastFadeStartMs) {
        this.toastEl.classList.remove('visible');
        this.toastEl.classList.add('hidden');
      }
    }

    // 5. Dev F9 Playtest Drawer telemetry
    this.playtestDrawer.updateMetrics(metrics, state.godMode, nowMs);
  }

  private resolveOverlayKind(state: SimState): ModalOverlayKind {
    if (this.systemOverlay === 'options') return 'options';
    if (this.systemOverlay === 'keybinds') return 'keybinds';
    if (state.screenMode === 'workbench') return 'workbench';
    if (state.screenMode === 'shop') return 'shop';
    if (state.screenMode === 'campfire') return 'campfire';
    if (state.screenMode === 'victory') return 'victory';
    if (state.screenMode === 'gameover') return 'gameover';
    if (state.paused && (state.screenMode === 'combat' || state.screenMode === 'hub')) {
      return 'pause';
    }
    return 'none';
  }

  public dispose(): void {
    this.appRoot.classList.remove('kf-hide-cursor');
    this.appRoot.classList.remove('kf-touch-active');
    this.gamepadNav.clearFocus();
    this.touchControls.dispose();
    this.toastEl.remove();
    this.titleScreen.dispose();
    this.hubUi.dispose();
    this.overworldUi.dispose();
    this.combatHud.dispose();
    this.overlays.dispose();
    this.playtestDrawer.dispose();
  }
}
