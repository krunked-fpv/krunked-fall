// ============================================================================
// KRUNKEDFALL — Master UI Manager (Coordinates All Screens, HUD & Overlays)
// ============================================================================

import type {
  AssetPackMode,
  AudioSettings,
  DebugBridge,
  HubPanel,
  OutcastId,
  RenderSettings,
  RuntimeMetrics,
  SaveData,
  SimState,
  SkinId,
} from '../contracts/index.js';
import type { KeybindAction } from '../input/index.js';
import type { CustomPackImportResult } from '../render/index.js';
import { CombatHud } from './combatHud.js';
import { HubUi } from './hubUi.js';
import { Overlays, type ModalOverlayKind } from './overlays.js';
import { OverworldUi } from './overworldUi.js';
import { PlaytestDrawer } from './playtestDrawer.js';
import { TitleScreen } from './titleScreen.js';

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
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onLoadCustomPack(files: FileList): Promise<CustomPackImportResult>;
  onStartRebind(action: KeybindAction): void;
  onCancelRebind(): void;
  onResetKeybinds(): void;
  onPlayUiClick(): void;
  getBridge(): DebugBridge;
}

export class UiManager {
  private readonly appRoot: HTMLElement;
  private readonly cb: UiManagerCallbacks;

  private readonly titleScreen: TitleScreen;
  private readonly hubUi: HubUi;
  private readonly overworldUi: OverworldUi;
  private readonly combatHud: CombatHud;
  private readonly overlays: Overlays;
  private readonly playtestDrawer: PlaytestDrawer;

  private systemOverlay: 'none' | 'options' | 'keybinds' = 'none';
  private hidingCursor = false;

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
    cursor: { x: number; y: number; visible: boolean },
    rebindingAction: KeybindAction | null,
    nowMs: number,
  ): void {
    const mode = state.screenMode;

    // 1. Primary screen layers
    this.titleScreen.setVisible(mode === 'title');
    if (mode === 'title') {
      this.titleScreen.render(
        save,
        hasContinue,
        metrics.packMode,
        metrics.customPackAvailable,
      );
    }

    this.hubUi.setVisible(mode === 'hub');
    if (mode === 'hub') {
      this.hubUi.render(state, save);
    }

    this.overworldUi.setVisible(mode === 'overworld', state);
    if (mode === 'overworld') {
      this.overworldUi.render(state);
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
      this.combatHud.update(state, cursor, activeCrosshair);
    }

    // Toggle custom combat cursor cleanly (never hide OS cursor inside menus/drawer)
    const shouldHideCursor = activeCrosshair && cursor.visible;
    if (shouldHideCursor !== this.hidingCursor) {
      this.hidingCursor = shouldHideCursor;
      this.appRoot.classList.toggle('kf-hide-cursor', shouldHideCursor);
    }

    // 2. Modal overlays
    this.overlays.render(
      activeOverlay,
      state,
      save,
      metrics.packMode,
      metrics.customPackAvailable,
      rebindingAction,
    );

    // 3. Dev F9 Playtest Drawer telemetry
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
    this.titleScreen.dispose();
    this.hubUi.dispose();
    this.overworldUi.dispose();
    this.combatHud.dispose();
    this.overlays.dispose();
    this.playtestDrawer.dispose();
  }
}
