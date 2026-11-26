// ============================================================================
// KRUNKEDFALL — Unified Input Manager (Keyboard + Mouse + Gamepad + Touch)
// ============================================================================
// Handles:
//   - WASD / Arrow movement, Space/Shift/RMB Ability, Q/F Power,
//     E/Wheel/1/2 Swap Weapon, R Vent/Interact (+ contextual E interact),
//     Tab Workbench, Esc Pause, F9 Playtest Drawer
//   - Exact client -> world aim mapping via renderer.screenToWorld()
//   - Multi-platform Gamepad API support (Xbox, PlayStation, Nintendo,
//     Steam Deck, Tesla browser/controllers, generic HID) with radial deadzone,
//     non-standard DirectInput/Linux evdev adaptation, UI navigation repeat,
//     and safe dual-rumble haptics
//   - Strict mobile/touch detection & virtual dual-stick touch input injection
//   - Runtime keybind rebinding persisted via SaveData.keybinds
//   - Edge-triggered pressed latches consumed atomically per 60 Hz sim tick

import type {
  ControllerSettings,
  ControllerStatus,
  GamepadProfileKind,
  InputFrame,
  SimState,
  UiNavActions,
} from '../contracts/index.js';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  countConnectedGamepads,
  detectGamepadProfile,
  getDisplayPrompts,
  readNormalizedGamepad,
  selectActiveGamepad,
  triggerGamepadRumble,
  type GamepadGlyphSet,
  type NormalizedGamepadState,
} from './gamepadProfiles.js';
import { TouchDetector } from './touchDetector.js';

export type KeybindAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'ability'
  | 'power'
  | 'swapWeapon'
  | 'interact'
  | 'reloadOrVent'
  | 'workbench'
  | 'pause';

export interface KeybindMeta {
  action: KeybindAction;
  label: string;
  secondaryHint: string;
}

export const KEYBIND_ACTIONS: readonly KeybindMeta[] = [
  { action: 'moveUp', label: 'MOVE UP', secondaryHint: 'ArrowUp' },
  { action: 'moveDown', label: 'MOVE DOWN', secondaryHint: 'ArrowDown' },
  { action: 'moveLeft', label: 'MOVE LEFT', secondaryHint: 'ArrowLeft' },
  { action: 'moveRight', label: 'MOVE RIGHT', secondaryHint: 'ArrowRight' },
  { action: 'ability', label: 'ABILITY', secondaryHint: 'Shift / RMB / LT' },
  { action: 'power', label: 'POWER', secondaryHint: 'F / RB / Y' },
  { action: 'swapWeapon', label: 'SWAP WEAPON', secondaryHint: 'Wheel / 1 / 2 / X' },
  { action: 'interact', label: 'INTERACT', secondaryHint: 'R / A' },
  { action: 'reloadOrVent', label: 'VENT / RELOAD', secondaryHint: 'R / B' },
  { action: 'workbench', label: 'WORKBENCH', secondaryHint: 'Tab / Select' },
  { action: 'pause', label: 'PAUSE / BACK', secondaryHint: 'Esc / Start' },
] as const;

export const DEFAULT_KEYBINDS: Readonly<Record<KeybindAction, string>> = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  ability: 'Space',
  power: 'KeyQ',
  swapWeapon: 'KeyE',
  interact: 'KeyE',
  reloadOrVent: 'KeyR',
  workbench: 'Tab',
  pause: 'Escape',
};

export interface UiInputActions {
  toggleWorkbench: boolean;
  togglePause: boolean;
  togglePlaytestDrawer: boolean;
}

export interface VirtualTouchInput {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimActive: boolean;
  fireHeld: boolean;
}

export type TouchActionKind =
  | 'fire'
  | 'ability'
  | 'power'
  | 'swap'
  | 'interact'
  | 'vent'
  | 'workbench'
  | 'pause';

export type ScreenToWorldFn = (
  clientX: number,
  clientY: number,
  state: SimState,
) => { x: number; y: number };

export type WorldToScreenFn = (
  worldX: number,
  worldY: number,
  state: SimState,
) => { x: number; y: number };

export interface AimScreenPos {
  x: number;
  y: number;
  visible: boolean;
  isStickAim: boolean;
}

const GAMEPAD_AIM_DIST = 110;
const NAV_STICK_THRESHOLD = 0.45;
const NAV_INITIAL_DELAY_MS = 280;
const NAV_REPEAT_INTERVAL_MS = 115;
const NAV_PAGE_REPEAT_MS = 115;
const AUTO_FIRE_AIM_THRESHOLD = 0.36;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function formatKeyCode(code: string): string {
  if (!code) return '---';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'SPACE';
    case 'Escape':
      return 'ESC';
    case 'Tab':
      return 'TAB';
    case 'ShiftLeft':
      return 'L-SHIFT';
    case 'ShiftRight':
      return 'R-SHIFT';
    case 'ControlLeft':
      return 'L-CTRL';
    case 'ControlRight':
      return 'R-CTRL';
    case 'ArrowUp':
      return 'UP';
    case 'ArrowDown':
      return 'DOWN';
    case 'ArrowLeft':
      return 'LEFT';
    case 'ArrowRight':
      return 'RIGHT';
    case 'Enter':
      return 'ENTER';
    case 'Backspace':
      return 'BKSP';
    default:
      return code.toUpperCase();
  }
}

function isEditableElement(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function isInteractiveUiElement(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, label, [data-ui-interactive="true"]',
    ),
  );
}

function getSafeGamepads(): ArrayLike<Gamepad | null> | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  try {
    return navigator.getGamepads();
  } catch {
    return null;
  }
}

export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly onFirstGesture?: () => void;
  private readonly touchDetector: TouchDetector;

  private keybinds: Record<KeybindAction, string>;
  private controllerSettings: ControllerSettings;
  private readonly keysDown = new Set<string>();

  // Edge-triggered simulation latches (consumed once per 60 Hz sampleInputFrame)
  private latchFirePressed = false;
  private latchAbilityPressed = false;
  private latchPowerPressed = false;
  private latchSwapPressed = false;
  private latchInteractPressed = false;
  private latchReloadOrVentPressed = false;
  private latchPausePressed = false;
  private requestedWeaponSlot: 0 | 1 | null = null;
  private pendingDualKeyE = false;

  // UI-level action latches (polled every frame even when sim is paused)
  private uiToggleWorkbench = false;
  private uiTogglePause = false;
  private uiTogglePlaytestDrawer = false;

  // Gamepad UI navigation latches & repeat timers
  private uiNavMoveX: -1 | 0 | 1 = 0;
  private uiNavMoveY: -1 | 0 | 1 = 0;
  private uiNavConfirm = false;
  private uiNavCancel = false;
  private uiNavTabPrev = false;
  private uiNavTabNext = false;
  private uiNavPageUp = false;
  private uiNavPageDown = false;

  private navHeldX: -1 | 0 | 1 = 0;
  private navNextRepeatXMs = 0;
  private navHeldY: -1 | 0 | 1 = 0;
  private navNextRepeatYMs = 0;
  private navHeldPage: -1 | 0 | 1 = 0;
  private navNextPageRepeatMs = 0;

  // Pointer & aim state
  private mouseClientX = 0;
  private mouseClientY = 0;
  private hasMouseMoved = false;
  private mousePrimaryDown = false;
  private usingGamepadAim = false;
  private lastGamepadAimAngle = 0;
  private usingTouchAim = false;
  private lastTouchAimAngle = 0;

  // Virtual touch input state
  private touchInput: VirtualTouchInput = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    aimActive: false,
    fireHeld: false,
  };
  private prevTouchFireHeld = false;

  // Gamepad polling & connection tracking
  private activeGamepadIndex = -1;
  private gamepadConnected = false;
  private gamepadProfile: GamepadProfileKind = 'generic';
  private gamepadName = '';
  private gamepadCount = 0;
  private currentPadState: NormalizedGamepadState | null = null;
  private prevPadState: NormalizedGamepadState | null = null;
  private prevPadFireHeld = false;
  private prevPadAbilityHeld = false;
  private prevPadPowerHeld = false;
  private lastPollMs: number | null = null;
  private polledSinceLastSample = false;
  private userSwitchedToNonGamepad = false;

  // Status change subscribers
  private readonly controllerListeners = new Set<(status: ControllerStatus) => void>();
  private unsubscribeTouchDetector: (() => void) | null = null;
  private lastStatusSig = '';

  // Rebind capture callback
  private rebindAction: KeybindAction | null = null;
  private rebindCallback: ((action: KeybindAction, code: string | null) => void) | null = null;

  private attached = false;
  private uiBlockingGameplay = false;

  constructor(
    canvas: HTMLCanvasElement,
    screenToWorld: ScreenToWorldFn,
    initialKeybinds?: Record<string, string>,
    onFirstGesture?: () => void,
    initialControllerSettings?: Partial<ControllerSettings>,
  ) {
    this.canvas = canvas;
    this.screenToWorld = screenToWorld;
    this.onFirstGesture = onFirstGesture;
    this.touchDetector = new TouchDetector();
    this.gamepadProfile = this.touchDetector.isTesla() ? 'tesla' : 'generic';

    this.keybinds = { ...DEFAULT_KEYBINDS };
    if (initialKeybinds) {
      this.setKeybinds(initialKeybinds);
    }

    this.controllerSettings = { ...DEFAULT_CONTROLLER_SETTINGS };
    if (initialControllerSettings) {
      this.setControllerSettings(initialControllerSettings);
    }

    const rect = canvas.getBoundingClientRect();
    this.mouseClientX = rect.left + rect.width * 0.65;
    this.mouseClientY = rect.top + rect.height * 0.5;
    this.lastStatusSig = this.computeStatusSig(this.getControllerStatus());
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;

    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);

    this.touchDetector.attach();
    this.unsubscribeTouchDetector = this.touchDetector.onChange(() => {
      this.emitControllerChangeIfNeeded();
    });
    this.emitControllerChangeIfNeeded();
  }

  public detach(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);

    this.unsubscribeTouchDetector?.();
    this.unsubscribeTouchDetector = null;
    this.touchDetector.detach();
  }

  public setUiBlockingGameplay(blocking: boolean): void {
    const wasBlocking = this.uiBlockingGameplay;
    this.uiBlockingGameplay = blocking;
    if (blocking) {
      this.mousePrimaryDown = false;
      this.clearTouchInput();
      if (!wasBlocking) {
        this.clearUiNavLatches();
        this.resetUiNavRepeat();
      }
    }
  }

  public setKeybinds(binds: Record<string, string>): void {
    const next: Record<KeybindAction, string> = { ...DEFAULT_KEYBINDS };
    for (const meta of KEYBIND_ACTIONS) {
      const val = binds[meta.action];
      if (typeof val === 'string' && val.length > 0 && val.length <= 24) {
        next[meta.action] = val;
      }
    }
    this.keybinds = next;
  }

  public getKeybinds(): Record<KeybindAction, string> {
    return { ...this.keybinds };
  }

  public setSingleKeybind(action: KeybindAction, code: string): void {
    this.keybinds[action] = code;
  }

  public resetKeybinds(): Record<KeybindAction, string> {
    this.keybinds = { ...DEFAULT_KEYBINDS };
    return this.getKeybinds();
  }

  public startRebind(
    action: KeybindAction,
    callback: (action: KeybindAction, code: string | null) => void,
  ): void {
    this.rebindAction = action;
    this.rebindCallback = callback;
  }

  public cancelRebind(): void {
    if (this.rebindAction && this.rebindCallback) {
      const act = this.rebindAction;
      const cb = this.rebindCallback;
      this.rebindAction = null;
      this.rebindCallback = null;
      cb(act, null);
    }
  }

  public isRebinding(): KeybindAction | null {
    return this.rebindAction;
  }

  public setControllerSettings(partial: Partial<ControllerSettings>): void {
    if (!partial || typeof partial !== 'object') return;
    if (typeof partial.deadzone === 'number' && Number.isFinite(partial.deadzone)) {
      this.controllerSettings.deadzone = clamp(partial.deadzone, 0.08, 0.35);
    }
    if (typeof partial.vibrationEnabled === 'boolean') {
      this.controllerSettings.vibrationEnabled = partial.vibrationEnabled;
    }
    if (typeof partial.twinStickAutoFire === 'boolean') {
      this.controllerSettings.twinStickAutoFire = partial.twinStickAutoFire;
    }
    if (typeof partial.touchOpacity === 'number' && Number.isFinite(partial.touchOpacity)) {
      this.controllerSettings.touchOpacity = clamp(partial.touchOpacity, 0.3, 1.0);
    }
    if (typeof partial.touchScale === 'number' && Number.isFinite(partial.touchScale)) {
      this.controllerSettings.touchScale = clamp(partial.touchScale, 0.75, 1.35);
    }
  }

  public getControllerSettings(): ControllerSettings {
    return { ...this.controllerSettings };
  }

  public getControllerStatus(): ControllerStatus {
    return {
      activeDevice: this.touchDetector.getActiveDevice(),
      touchSensed: this.touchDetector.isTouchSensed(),
      touchControlsVisible: this.touchDetector.shouldShowTouchControls(),
      gamepadConnected: this.gamepadConnected,
      gamepadProfile: this.gamepadProfile,
      gamepadName: this.gamepadName,
      gamepadCount: this.gamepadCount,
      isTeslaBrowser: this.touchDetector.isTesla(),
    };
  }

  public getPromptGlyphs(): GamepadGlyphSet {
    return getDisplayPrompts(
      this.touchDetector.getActiveDevice(),
      this.gamepadProfile,
      this.keybinds,
    );
  }

  public getTouchDetector(): TouchDetector {
    return this.touchDetector;
  }

  public onControllerChange(cb: (status: ControllerStatus) => void): () => void {
    this.controllerListeners.add(cb);
    return () => {
      this.controllerListeners.delete(cb);
    };
  }

  public rumble(intensity: number, durationMs = 80, weakScale = 0.65): void {
    if (!this.controllerSettings.vibrationEnabled) return;
    if (this.userSwitchedToNonGamepad) return;
    const pads = getSafeGamepads();
    if (!pads) return;
    const activePad = selectActiveGamepad(
      pads,
      this.activeGamepadIndex,
      this.controllerSettings.deadzone,
      this.touchDetector.isTesla(),
    );
    if (!activePad) return;
    triggerGamepadRumble(activePad, intensity, durationMs, weakScale);
  }

  public getCursorClientPos(): { x: number; y: number; visible: boolean } {
    return {
      x: this.mouseClientX,
      y: this.mouseClientY,
      visible: this.hasMouseMoved && !this.usingGamepadAim && !this.usingTouchAim,
    };
  }

  public getAimScreenPos(
    state: SimState,
    worldToScreen?: WorldToScreenFn,
  ): AimScreenPos {
    if (this.usingTouchAim || this.usingGamepadAim) {
      const angle = this.usingTouchAim ? this.lastTouchAimAngle : this.lastGamepadAimAngle;
      const aimWorldX = state.player.x + Math.cos(angle) * GAMEPAD_AIM_DIST;
      const aimWorldY = state.player.y + Math.sin(angle) * GAMEPAD_AIM_DIST;
      if (worldToScreen) {
        const pt = worldToScreen(aimWorldX, aimWorldY, state);
        return { x: pt.x, y: pt.y, visible: true, isStickAim: true };
      }
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: rect.left + rect.width * 0.5 + Math.cos(angle) * GAMEPAD_AIM_DIST,
        y: rect.top + rect.height * 0.5 + Math.sin(angle) * GAMEPAD_AIM_DIST,
        visible: true,
        isStickAim: true,
      };
    }

    return {
      x: this.mouseClientX,
      y: this.mouseClientY,
      visible: this.hasMouseMoved,
      isStickAim: false,
    };
  }

  public isUsingGamepad(): boolean {
    return this.usingGamepadAim || this.touchDetector.getActiveDevice() === 'gamepad';
  }

  public setTouchInput(partial: Partial<VirtualTouchInput>): void {
    if (!partial || typeof partial !== 'object') return;
    if (typeof partial.moveX === 'number' && Number.isFinite(partial.moveX)) {
      this.touchInput.moveX = clamp(partial.moveX, -1, 1);
    }
    if (typeof partial.moveY === 'number' && Number.isFinite(partial.moveY)) {
      this.touchInput.moveY = clamp(partial.moveY, -1, 1);
    }
    if (typeof partial.aimX === 'number' && Number.isFinite(partial.aimX)) {
      this.touchInput.aimX = clamp(partial.aimX, -1, 1);
    }
    if (typeof partial.aimY === 'number' && Number.isFinite(partial.aimY)) {
      this.touchInput.aimY = clamp(partial.aimY, -1, 1);
    }
    if (typeof partial.aimActive === 'boolean') {
      this.touchInput.aimActive = partial.aimActive;
    }
    if (typeof partial.fireHeld === 'boolean') {
      this.touchInput.fireHeld = partial.fireHeld;
    }

    const hasStickOrFire =
      Math.hypot(this.touchInput.moveX, this.touchInput.moveY) > 0.01 ||
      this.touchInput.aimActive ||
      this.touchInput.fireHeld;

    if (hasStickOrFire) {
      this.onFirstGesture?.();
      this.userSwitchedToNonGamepad = true;
      this.touchDetector.notifyTouch();
    }

    if (
      this.touchInput.aimActive &&
      Math.hypot(this.touchInput.aimX, this.touchInput.aimY) > 0.05
    ) {
      this.usingTouchAim = true;
      this.usingGamepadAim = false;
      this.lastTouchAimAngle = Math.atan2(this.touchInput.aimY, this.touchInput.aimX);
    }

    if (this.touchInput.fireHeld && !this.prevTouchFireHeld && !this.uiBlockingGameplay) {
      this.latchFirePressed = true;
    }
    this.prevTouchFireHeld = this.touchInput.fireHeld;
  }

  public triggerTouchAction(action: TouchActionKind): void {
    this.onFirstGesture?.();
    this.userSwitchedToNonGamepad = true;
    this.touchDetector.notifyTouch();

    if (action === 'workbench') {
      this.uiToggleWorkbench = true;
      return;
    }
    if (action === 'pause') {
      this.uiTogglePause = true;
      this.latchPausePressed = true;
      return;
    }

    if (this.uiBlockingGameplay) return;

    switch (action) {
      case 'fire':
        this.latchFirePressed = true;
        break;
      case 'ability':
        this.latchAbilityPressed = true;
        break;
      case 'power':
        this.latchPowerPressed = true;
        break;
      case 'swap':
        this.latchSwapPressed = true;
        break;
      case 'interact':
        this.latchInteractPressed = true;
        break;
      case 'vent':
        this.latchReloadOrVentPressed = true;
        break;
    }
  }

  public clearTouchInput(): void {
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.aimX = 0;
    this.touchInput.aimY = 0;
    this.touchInput.aimActive = false;
    this.touchInput.fireHeld = false;
    this.prevTouchFireHeld = false;
  }

  public clearLatches(): void {
    this.latchFirePressed = false;
    this.latchAbilityPressed = false;
    this.latchPowerPressed = false;
    this.latchSwapPressed = false;
    this.latchInteractPressed = false;
    this.latchReloadOrVentPressed = false;
    this.latchPausePressed = false;
    this.requestedWeaponSlot = null;
    this.pendingDualKeyE = false;
  }

  private clearUiNavLatches(): void {
    this.uiNavMoveX = 0;
    this.uiNavMoveY = 0;
    this.uiNavConfirm = false;
    this.uiNavCancel = false;
    this.uiNavTabPrev = false;
    this.uiNavTabNext = false;
    this.uiNavPageUp = false;
    this.uiNavPageDown = false;
  }

  private resetUiNavRepeat(): void {
    this.navHeldX = 0;
    this.navNextRepeatXMs = 0;
    this.navHeldY = 0;
    this.navNextRepeatYMs = 0;
    this.navHeldPage = 0;
    this.navNextPageRepeatMs = 0;
  }

  public consumeUiActions(): UiInputActions {
    const actions: UiInputActions = {
      toggleWorkbench: this.uiToggleWorkbench,
      togglePause: this.uiTogglePause,
      togglePlaytestDrawer: this.uiTogglePlaytestDrawer,
    };
    this.uiToggleWorkbench = false;
    this.uiTogglePause = false;
    this.uiTogglePlaytestDrawer = false;
    return actions;
  }

  /**
   * Polls connected gamepads once per frame/timestamp (idempotent when called
   * repeatedly with the same explicit `nowMs` before `sampleInputFrame`).
   */
  public pollGamepad(nowMs?: number): void {
    if (
      nowMs !== undefined &&
      this.lastPollMs === nowMs &&
      this.polledSinceLastSample
    ) {
      return;
    }

    const effectiveNow =
      nowMs !== undefined
        ? nowMs
        : typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

    this.pollGamepadInternal(effectiveNow);
    this.lastPollMs = nowMs !== undefined ? nowMs : null;
    this.polledSinceLastSample = true;
  }

  public consumeUiNavActions(nowMs?: number): UiNavActions {
    if (nowMs === undefined || this.lastPollMs !== nowMs || !this.polledSinceLastSample) {
      this.pollGamepad(nowMs);
    }

    const actions: UiNavActions = {
      moveX: this.uiNavMoveX,
      moveY: this.uiNavMoveY,
      confirm: this.uiNavConfirm,
      cancel: this.uiNavCancel,
      tabPrev: this.uiNavTabPrev,
      tabNext: this.uiNavTabNext,
      pageUp: this.uiNavPageUp,
      pageDown: this.uiNavPageDown,
    };
    this.clearUiNavLatches();
    return actions;
  }

  /**
   * Samples current keyboard, mouse, Gamepad, and virtual touch state into a
   * single 60 Hz `InputFrame` and atomically consumes all edge-triggered latches.
   */
  public sampleInputFrame(state: SimState): InputFrame {
    // Poll gamepad if pollGamepad() wasn't already invoked for this frame/tick
    if (!this.polledSinceLastSample) {
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      this.pollGamepadInternal(now);
    }
    this.polledSinceLastSample = false;

    const norm = this.currentPadState;
    let padMoveX = norm ? norm.moveX : 0;
    let padMoveY = norm ? norm.moveY : 0;
    if (norm) {
      if (norm.dpadX !== 0) padMoveX = norm.dpadX;
      if (norm.dpadY !== 0) padMoveY = norm.dpadY;
    }

    const padFireHeld = norm
      ? norm.fireHeld ||
        (this.controllerSettings.twinStickAutoFire &&
          norm.aimMagnitude >= AUTO_FIRE_AIM_THRESHOLD)
      : false;

    // 2. Keyboard Movement (custom keybinds + Arrow key fallback)
    let kbMoveX = 0;
    let kbMoveY = 0;
    if (!this.uiBlockingGameplay) {
      if (this.keysDown.has(this.keybinds.moveLeft) || this.keysDown.has('ArrowLeft')) {
        kbMoveX -= 1;
      }
      if (this.keysDown.has(this.keybinds.moveRight) || this.keysDown.has('ArrowRight')) {
        kbMoveX += 1;
      }
      if (this.keysDown.has(this.keybinds.moveUp) || this.keysDown.has('ArrowUp')) {
        kbMoveY -= 1;
      }
      if (this.keysDown.has(this.keybinds.moveDown) || this.keysDown.has('ArrowDown')) {
        kbMoveY += 1;
      }
    }

    const hasKbMove = Math.abs(kbMoveX) > 0 || Math.abs(kbMoveY) > 0;
    const hasTouchMove = Math.hypot(this.touchInput.moveX, this.touchInput.moveY) > 0.01;

    let moveX = hasKbMove ? kbMoveX : hasTouchMove ? this.touchInput.moveX : padMoveX;
    let moveY = hasKbMove ? kbMoveY : hasTouchMove ? this.touchInput.moveY : padMoveY;
    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveY /= moveLen;
    }

    // 3. Resolve exact world aim coordinates
    let aimWorldX: number;
    let aimWorldY: number;
    if (this.usingTouchAim) {
      aimWorldX = state.player.x + Math.cos(this.lastTouchAimAngle) * GAMEPAD_AIM_DIST;
      aimWorldY = state.player.y + Math.sin(this.lastTouchAimAngle) * GAMEPAD_AIM_DIST;
    } else if (this.usingGamepadAim) {
      aimWorldX = state.player.x + Math.cos(this.lastGamepadAimAngle) * GAMEPAD_AIM_DIST;
      aimWorldY = state.player.y + Math.sin(this.lastGamepadAimAngle) * GAMEPAD_AIM_DIST;
    } else if (this.hasMouseMoved) {
      const world = this.screenToWorld(this.mouseClientX, this.mouseClientY, state);
      aimWorldX = world.x;
      aimWorldY = world.y;
    } else {
      aimWorldX = state.player.x + Math.cos(state.player.aimAngle) * 80;
      aimWorldY = state.player.y + Math.sin(state.player.aimAngle) * 80;
    }

    // 4. Contextual resolution when Swap & Interact share the same key (default: KeyE)
    let interactPressed = this.latchInteractPressed;
    let swapWeaponPressed = this.latchSwapPressed;

    if (this.pendingDualKeyE) {
      if (this.hasNearbyInteractable(state)) {
        interactPressed = true;
      } else {
        swapWeaponPressed = true;
      }
    }

    // Direct slot selection (1 / 2)
    if (this.requestedWeaponSlot !== null) {
      const want = this.requestedWeaponSlot;
      if (state.player.activeSlot !== want && state.player.weapons[want] !== null) {
        swapWeaponPressed = true;
      }
    }

    const frame: InputFrame = {
      moveX: this.uiBlockingGameplay ? 0 : moveX,
      moveY: this.uiBlockingGameplay ? 0 : moveY,
      aimWorldX,
      aimWorldY,
      firePrimary:
        !this.uiBlockingGameplay &&
        (this.mousePrimaryDown || padFireHeld || this.touchInput.fireHeld),
      firePrimaryPressed: !this.uiBlockingGameplay && this.latchFirePressed,
      abilityPressed: !this.uiBlockingGameplay && this.latchAbilityPressed,
      powerPressed: !this.uiBlockingGameplay && this.latchPowerPressed,
      swapWeaponPressed: !this.uiBlockingGameplay && swapWeaponPressed,
      interactPressed: !this.uiBlockingGameplay && interactPressed,
      reloadOrVentPressed: !this.uiBlockingGameplay && this.latchReloadOrVentPressed,
      pausePressed: this.latchPausePressed,
    };

    // Consume all edge-triggered latches atomically so zero taps drop or double-fire
    this.clearLatches();
    return frame;
  }

  // ==========================================================================
  // INTERNAL GAMEPAD POLLING & UI NAV REPEAT
  // ==========================================================================

  private pollGamepadInternal(nowMs: number): void {
    const pads = getSafeGamepads();
    const isTesla = this.touchDetector.isTesla();
    const count = countConnectedGamepads(pads);
    const activePad = selectActiveGamepad(
      pads,
      this.activeGamepadIndex,
      this.controllerSettings.deadzone,
      isTesla,
    );

    if (!activePad) {
      const wasConnected = this.gamepadConnected;
      this.gamepadConnected = false;
      this.gamepadCount = 0;
      this.gamepadName = '';
      this.gamepadProfile = isTesla ? 'tesla' : 'generic';
      this.activeGamepadIndex = -1;
      this.currentPadState = null;
      this.prevPadState = null;
      this.prevPadFireHeld = false;
      this.prevPadAbilityHeld = false;
      this.prevPadPowerHeld = false;
      this.resetUiNavRepeat();
      if (wasConnected) {
        this.usingGamepadAim = false;
        this.touchDetector.notifyGamepadDisconnected();
      }
      this.emitControllerChangeIfNeeded();
      return;
    }

    const nextIndex = typeof activePad.index === 'number' ? activePad.index : 0;
    const switchedPad = this.activeGamepadIndex !== -1 && this.activeGamepadIndex !== nextIndex;
    this.activeGamepadIndex = nextIndex;

    const norm = readNormalizedGamepad(
      activePad,
      this.controllerSettings.deadzone,
      isTesla,
    );

    this.gamepadConnected = true;
    this.gamepadCount = Math.max(1, count);
    this.gamepadName = norm.id || 'Gamepad';
    this.gamepadProfile = norm.profile;
    this.currentPadState = norm;

    const prev = switchedPad ? null : this.prevPadState;
    const prevFire = switchedPad ? false : this.prevPadFireHeld;
    const prevAbility = switchedPad ? false : this.prevPadAbilityHeld;
    const prevPower = switchedPad ? false : this.prevPadPowerHeld;

    if (norm.hasActivity) {
      this.onFirstGesture?.();
      this.userSwitchedToNonGamepad = false;
      this.touchDetector.notifyGamepad();
    }

    // Global Pause / Workbench buttons (always edge-detected)
    if (norm.pauseHeld && !(prev?.pauseHeld ?? false)) {
      this.onFirstGesture?.();
      this.uiTogglePause = true;
      this.latchPausePressed = true;
    }
    if (norm.workbenchHeld && !(prev?.workbenchHeld ?? false)) {
      this.onFirstGesture?.();
      this.uiToggleWorkbench = true;
    }

    // UI Navigation actions (A confirm, B cancel, LB/RB tabs, D-pad/Left Stick repeat, Right Stick scroll)
    if (norm.confirmHeld && !(prev?.confirmHeld ?? false)) {
      this.uiNavConfirm = true;
    }
    if (norm.cancelHeld && !(prev?.cancelHeld ?? false)) {
      this.uiNavCancel = true;
    }
    if (norm.tabPrevHeld && !(prev?.tabPrevHeld ?? false)) {
      this.uiNavTabPrev = true;
    }
    if (norm.tabNextHeld && !(prev?.tabNextHeld ?? false)) {
      this.uiNavTabNext = true;
    }

    const dirX: -1 | 0 | 1 =
      norm.dpadX !== 0
        ? norm.dpadX
        : norm.moveX <= -NAV_STICK_THRESHOLD
          ? -1
          : norm.moveX >= NAV_STICK_THRESHOLD
            ? 1
            : 0;
    const dirY: -1 | 0 | 1 =
      norm.dpadY !== 0
        ? norm.dpadY
        : norm.moveY <= -NAV_STICK_THRESHOLD
          ? -1
          : norm.moveY >= NAV_STICK_THRESHOLD
            ? 1
            : 0;

    const stepX = this.stepNavAxis(dirX, this.navHeldX, this.navNextRepeatXMs, nowMs);
    this.navHeldX = stepX.held;
    this.navNextRepeatXMs = stepX.nextRepeatMs;
    if (stepX.emitted !== 0) {
      this.uiNavMoveX = stepX.emitted;
    }

    const stepY = this.stepNavAxis(dirY, this.navHeldY, this.navNextRepeatYMs, nowMs);
    this.navHeldY = stepY.held;
    this.navNextRepeatYMs = stepY.nextRepeatMs;
    if (stepY.emitted !== 0) {
      this.uiNavMoveY = stepY.emitted;
    }

    // Right-stick vertical page scroll
    const pageDir: -1 | 0 | 1 =
      norm.aimY <= -NAV_STICK_THRESHOLD
        ? -1
        : norm.aimY >= NAV_STICK_THRESHOLD
          ? 1
          : 0;
    if (pageDir === 0) {
      this.navHeldPage = 0;
      this.navNextPageRepeatMs = 0;
    } else if (pageDir !== this.navHeldPage) {
      this.navHeldPage = pageDir;
      this.navNextPageRepeatMs = nowMs + NAV_PAGE_REPEAT_MS;
      if (pageDir < 0) this.uiNavPageUp = true;
      else this.uiNavPageDown = true;
    } else if (nowMs >= this.navNextPageRepeatMs) {
      this.navNextPageRepeatMs = nowMs + NAV_PAGE_REPEAT_MS;
      if (pageDir < 0) this.uiNavPageUp = true;
      else this.uiNavPageDown = true;
    }

    // Gameplay latches (strictly suppressed when UI is blocking gameplay)
    const fireNow =
      norm.fireHeld ||
      (this.controllerSettings.twinStickAutoFire &&
        norm.aimMagnitude >= AUTO_FIRE_AIM_THRESHOLD);
    const abilityNow = norm.abilityHeld || norm.tabPrevHeld;
    const powerNow = norm.powerHeld || norm.tabNextHeld;

    if (!this.uiBlockingGameplay) {
      if (fireNow && !prevFire) {
        this.onFirstGesture?.();
        this.latchFirePressed = true;
      }
      if (abilityNow && !prevAbility) {
        this.onFirstGesture?.();
        this.latchAbilityPressed = true;
      }
      if (powerNow && !prevPower) {
        this.onFirstGesture?.();
        this.latchPowerPressed = true;
      }
      if (norm.swapHeld && !(prev?.swapHeld ?? false)) {
        this.onFirstGesture?.();
        this.latchSwapPressed = true;
      }
      if (norm.interactHeld && !(prev?.interactHeld ?? false)) {
        this.onFirstGesture?.();
        this.latchInteractPressed = true;
        this.latchReloadOrVentPressed = true;
      }
      if (norm.ventHeld && !(prev?.ventHeld ?? false)) {
        this.onFirstGesture?.();
        this.latchReloadOrVentPressed = true;
      }

      if (norm.aimMagnitude > 0.05) {
        this.usingGamepadAim = true;
        this.usingTouchAim = false;
        this.lastGamepadAimAngle = Math.atan2(norm.aimY, norm.aimX);
      }
    }

    this.prevPadState = norm;
    this.prevPadFireHeld = fireNow;
    this.prevPadAbilityHeld = abilityNow;
    this.prevPadPowerHeld = powerNow;

    this.emitControllerChangeIfNeeded();
  }

  private stepNavAxis(
    dir: -1 | 0 | 1,
    held: -1 | 0 | 1,
    nextRepeatMs: number,
    nowMs: number,
  ): { held: -1 | 0 | 1; nextRepeatMs: number; emitted: -1 | 0 | 1 } {
    if (dir === 0) {
      return { held: 0, nextRepeatMs: 0, emitted: 0 };
    }
    if (dir !== held) {
      return {
        held: dir,
        nextRepeatMs: nowMs + NAV_INITIAL_DELAY_MS,
        emitted: dir,
      };
    }
    if (nowMs >= nextRepeatMs) {
      return {
        held: dir,
        nextRepeatMs: nowMs + NAV_REPEAT_INTERVAL_MS,
        emitted: dir,
      };
    }
    return { held, nextRepeatMs, emitted: 0 };
  }

  private computeStatusSig(status: ControllerStatus): string {
    return `${status.activeDevice}|${status.touchSensed ? 1 : 0}|${status.touchControlsVisible ? 1 : 0}|${status.gamepadConnected ? 1 : 0}|${status.gamepadProfile}|${status.gamepadName}|${status.gamepadCount}|${status.isTeslaBrowser ? 1 : 0}`;
  }

  private emitControllerChangeIfNeeded(): void {
    const status = this.getControllerStatus();
    const sig = this.computeStatusSig(status);
    if (sig === this.lastStatusSig) return;
    this.lastStatusSig = sig;
    for (const cb of this.controllerListeners) {
      cb(status);
    }
  }

  private hasNearbyInteractable(state: SimState): boolean {
    const p = state.player;
    if (state.screenMode === 'hub') {
      for (let i = 0; i < state.hubInteractables.length; i++) {
        const item = state.hubInteractables[i];
        if (Math.hypot(item.x - p.x, item.y - p.y) <= item.radius + p.radius + 14) {
          return true;
        }
      }
      return false;
    }

    if (state.screenMode === 'combat') {
      // Unlocked Bifrost exit portal
      if (state.map.exitUnlocked) {
        if (Math.hypot(p.x - state.map.exitX, p.y - state.map.exitY) <= 36) {
          return true;
        }
      }
      // Weapon ground pickup
      for (let i = 0; i < state.pickups.length; i++) {
        const pk = state.pickups[i];
        if (pk.kind === 'weapon' && Math.hypot(pk.x - p.x, pk.y - p.y) <= p.radius + 18) {
          return true;
        }
      }
    }

    return false;
  }

  // ==========================================================================
  // DOM EVENT HANDLERS
  // ==========================================================================

  private readonly handleGamepadConnected = (e: Event): void => {
    const gpEvent = e as GamepadEvent;
    const pad = gpEvent.gamepad;
    const isTesla = this.touchDetector.isTesla();
    const pads = getSafeGamepads();
    const count = Math.max(1, countConnectedGamepads(pads));

    if (pad) {
      this.activeGamepadIndex = typeof pad.index === 'number' ? pad.index : 0;
      this.gamepadName = pad.id || 'Gamepad';
      this.gamepadProfile = detectGamepadProfile(pad.id || '', isTesla);
    }
    this.gamepadConnected = true;
    this.gamepadCount = count;
    this.userSwitchedToNonGamepad = false;
    this.touchDetector.notifyGamepad();
    this.emitControllerChangeIfNeeded();
  };

  private readonly handleGamepadDisconnected = (e: Event): void => {
    const gpEvent = e as GamepadEvent;
    const disconnectedIdx = gpEvent.gamepad?.index;
    const pads = getSafeGamepads();
    const isTesla = this.touchDetector.isTesla();
    const remainingCount = countConnectedGamepads(pads);

    if (remainingCount === 0) {
      this.gamepadConnected = false;
      this.gamepadCount = 0;
      this.gamepadName = '';
      this.gamepadProfile = isTesla ? 'tesla' : 'generic';
      this.activeGamepadIndex = -1;
      this.currentPadState = null;
      this.prevPadState = null;
      this.prevPadFireHeld = false;
      this.prevPadAbilityHeld = false;
      this.prevPadPowerHeld = false;
      this.usingGamepadAim = false;
      this.resetUiNavRepeat();
      this.touchDetector.notifyGamepadDisconnected();
    } else {
      if (disconnectedIdx === this.activeGamepadIndex) {
        this.activeGamepadIndex = -1;
        this.prevPadState = null;
      }
      const nextPad = selectActiveGamepad(
        pads,
        this.activeGamepadIndex,
        this.controllerSettings.deadzone,
        isTesla,
      );
      this.gamepadConnected = Boolean(nextPad);
      this.gamepadCount = remainingCount;
      this.gamepadName = nextPad?.id || 'Gamepad';
      this.gamepadProfile = nextPad
        ? detectGamepadProfile(nextPad.id || '', isTesla)
        : isTesla
          ? 'tesla'
          : 'generic';
      if (nextPad) {
        this.activeGamepadIndex = typeof nextPad.index === 'number' ? nextPad.index : 0;
      }
    }

    this.emitControllerChangeIfNeeded();
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    this.onFirstGesture?.();
    this.userSwitchedToNonGamepad = true;
    this.usingTouchAim = false;
    this.touchDetector.notifyKeyboardOrMouse(false);

    // Keybind capture mode takes highest priority
    if (this.rebindAction) {
      e.preventDefault();
      e.stopPropagation();
      const action = this.rebindAction;
      const cb = this.rebindCallback;
      this.rebindAction = null;
      this.rebindCallback = null;
      if (e.code === 'Escape' && action !== 'pause') {
        cb?.(action, null);
      } else {
        this.keybinds[action] = e.code;
        cb?.(action, e.code);
      }
      return;
    }

    // F9 Playtest Drawer toggles globally (even if an input isn't focused)
    if (e.code === 'F9') {
      e.preventDefault();
      if (!e.repeat) {
        this.uiTogglePlaytestDrawer = true;
      }
      return;
    }

    if (isEditableElement(e.target)) {
      if (e.code === 'Escape') {
        (e.target as HTMLElement).blur();
      }
      return;
    }

    // Prevent browser defaults on game keys
    if (
      e.code === 'Tab' ||
      e.code === 'Space' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight'
    ) {
      e.preventDefault();
    }

    const isFresh = !e.repeat && !this.keysDown.has(e.code);
    this.keysDown.add(e.code);

    if (!isFresh) return;

    // UI hotkeys
    if (e.code === this.keybinds.workbench || e.code === 'Tab') {
      this.uiToggleWorkbench = true;
      return;
    }
    if (e.code === this.keybinds.pause || e.code === 'Escape') {
      this.uiTogglePause = true;
      return;
    }

    if (this.uiBlockingGameplay) return;

    // Gameplay edge-triggered actions
    if (
      e.code === this.keybinds.ability ||
      e.code === 'ShiftLeft' ||
      e.code === 'ShiftRight'
    ) {
      this.latchAbilityPressed = true;
    }
    if (e.code === this.keybinds.power || e.code === 'KeyF') {
      this.latchPowerPressed = true;
    }

    // Handle swap vs interact cleanly even when both default to KeyE
    const sharedSwapInteract = this.keybinds.swapWeapon === this.keybinds.interact;
    if (sharedSwapInteract && e.code === this.keybinds.swapWeapon) {
      this.pendingDualKeyE = true;
    } else {
      if (e.code === this.keybinds.swapWeapon) {
        this.latchSwapPressed = true;
      }
      if (e.code === this.keybinds.interact) {
        this.latchInteractPressed = true;
      }
    }

    // R = Vent/Reload AND also acts as secondary Interact
    if (e.code === this.keybinds.reloadOrVent) {
      this.latchReloadOrVentPressed = true;
      this.latchInteractPressed = true;
    }

    // Direct slot hotkeys 1 / 2
    if (e.code === 'Digit1') {
      this.requestedWeaponSlot = 0;
    } else if (e.code === 'Digit2') {
      this.requestedWeaponSlot = 1;
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private readonly handleWindowBlur = (): void => {
    this.keysDown.clear();
    this.mousePrimaryDown = false;
    this.clearTouchInput();
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (this.touchDetector.isWithinSyntheticMouseGuard()) {
      return;
    }
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMouseMoved = true;
    this.usingGamepadAim = false;
    this.usingTouchAim = false;
    this.userSwitchedToNonGamepad = true;
    this.touchDetector.notifyKeyboardOrMouse(true);
  };

  private readonly handleMouseDown = (e: MouseEvent): void => {
    if (this.touchDetector.isWithinSyntheticMouseGuard()) {
      return;
    }
    this.onFirstGesture?.();
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMouseMoved = true;
    this.usingGamepadAim = false;
    this.usingTouchAim = false;
    this.userSwitchedToNonGamepad = true;
    this.touchDetector.notifyKeyboardOrMouse(true);

    if (this.uiBlockingGameplay || isInteractiveUiElement(e.target)) {
      return;
    }

    if (e.button === 0) {
      this.mousePrimaryDown = true;
      this.latchFirePressed = true;
    } else if (e.button === 2) {
      this.latchAbilityPressed = true;
    }
  };

  private readonly handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mousePrimaryDown = false;
    }
  };

  private readonly handleWheel = (e: WheelEvent): void => {
    if (this.uiBlockingGameplay || isInteractiveUiElement(e.target)) {
      return;
    }
    if (Math.abs(e.deltaY) > 0) {
      this.latchSwapPressed = true;
    }
  };

  private readonly handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
}
