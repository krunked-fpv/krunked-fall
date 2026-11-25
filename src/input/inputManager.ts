// ============================================================================
// KRUNKEDFALL — Unified Input Manager (Keyboard + Mouse + Gamepad + Rebinds)
// ============================================================================
// Handles:
//   - WASD / Arrow movement, Space/Shift/RMB Ability, Q/F Power,
//     E/Wheel/1/2 Swap Weapon, R Vent/Interact (+ contextual E interact),
//     Tab Workbench, Esc Pause, F9 Playtest Drawer
//   - Exact client -> world aim mapping via renderer.screenToWorld()
//   - Full Gamepad API support (left stick move, right stick twin-stick aim
//     with 0.18 deadzone, triggers/bumpers/face buttons with edge detection)
//   - Runtime keybind rebinding persisted via SaveData.keybinds
//   - Edge-triggered pressed latches consumed atomically per 60 Hz sim tick

import type { InputFrame, SimState } from '../contracts/index.js';

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
  { action: 'reloadOrVent', label: 'VENT / RELOAD', secondaryHint: 'R' },
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

export type ScreenToWorldFn = (
  clientX: number,
  clientY: number,
  state: SimState,
) => { x: number; y: number };

const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_AIM_DIST = 110;

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

function applyDeadzone(val: number, deadzone = GAMEPAD_DEADZONE): number {
  const abs = Math.abs(val);
  if (abs <= deadzone) return 0;
  return Math.sign(val) * ((abs - deadzone) / (1 - deadzone));
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function isInteractiveUiElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, label, [data-ui-interactive="true"]',
    ),
  );
}

export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly onFirstGesture?: () => void;

  private keybinds: Record<KeybindAction, string>;
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

  // Pointer & aim state
  private mouseClientX = 0;
  private mouseClientY = 0;
  private hasMouseMoved = false;
  private mousePrimaryDown = false;
  private usingGamepadAim = false;
  private lastGamepadAimAngle = 0;

  // Gamepad previous button states for clean edge detection
  private prevPadButtons: boolean[] = [];

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
  ) {
    this.canvas = canvas;
    this.screenToWorld = screenToWorld;
    this.onFirstGesture = onFirstGesture;
    this.keybinds = { ...DEFAULT_KEYBINDS };
    if (initialKeybinds) {
      this.setKeybinds(initialKeybinds);
    }

    const rect = canvas.getBoundingClientRect();
    this.mouseClientX = rect.left + rect.width * 0.65;
    this.mouseClientY = rect.top + rect.height * 0.5;
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
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
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
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }

  public setUiBlockingGameplay(blocking: boolean): void {
    this.uiBlockingGameplay = blocking;
    if (blocking) {
      this.mousePrimaryDown = false;
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

  public getCursorClientPos(): { x: number; y: number; visible: boolean } {
    return {
      x: this.mouseClientX,
      y: this.mouseClientY,
      visible: this.hasMouseMoved && !this.usingGamepadAim,
    };
  }

  public isUsingGamepad(): boolean {
    return this.usingGamepadAim;
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
   * Samples current keyboard, mouse, and Gamepad state into a single 60 Hz
   * `InputFrame` and atomically consumes all edge-triggered pressed latches.
   */
  public sampleInputFrame(state: SimState): InputFrame {
    // 1. Poll Gamepad API (if connected)
    let padMoveX = 0;
    let padMoveY = 0;
    let padAimX = 0;
    let padAimY = 0;
    let padFireHeld = false;

    const pads =
      typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? navigator.getGamepads()
        : null;
    let activePad: Gamepad | null = null;
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        const gp = pads[i];
        if (gp && gp.connected) {
          activePad = gp;
          break;
        }
      }
    }

    if (activePad) {
      padMoveX = applyDeadzone(activePad.axes[0] ?? 0);
      padMoveY = applyDeadzone(activePad.axes[1] ?? 0);
      padAimX = applyDeadzone(activePad.axes[2] ?? 0);
      padAimY = applyDeadzone(activePad.axes[3] ?? 0);

      const btn = (idx: number): boolean => {
        const b = activePad!.buttons[idx];
        return Boolean(b && (b.pressed || b.value > 0.35));
      };
      const wasDown = (idx: number): boolean => Boolean(this.prevPadButtons[idx]);
      const justPressed = (idx: number): boolean => btn(idx) && !wasDown(idx);

      // D-pad movement fallback
      if (btn(14)) padMoveX = -1;
      if (btn(15)) padMoveX = 1;
      if (btn(12)) padMoveY = -1;
      if (btn(13)) padMoveY = 1;

      // RT (7) Fire
      padFireHeld = btn(7);
      if (justPressed(7)) {
        this.onFirstGesture?.();
        this.latchFirePressed = true;
      }
      // LT (6) or LB (4) Ability
      if (justPressed(6) || justPressed(4)) {
        this.onFirstGesture?.();
        this.latchAbilityPressed = true;
      }
      // RB (5) or Y (3) Power
      if (justPressed(5) || justPressed(3)) {
        this.onFirstGesture?.();
        this.latchPowerPressed = true;
      }
      // X (2) Swap Weapon
      if (justPressed(2)) {
        this.latchSwapPressed = true;
      }
      // A (0) Interact / Vent
      if (justPressed(0)) {
        this.latchInteractPressed = true;
        this.latchReloadOrVentPressed = true;
      }
      // Start (9) Pause
      if (justPressed(9)) {
        this.uiTogglePause = true;
        this.latchPausePressed = true;
      }
      // Select / Back (8) Workbench
      if (justPressed(8)) {
        this.uiToggleWorkbench = true;
      }

      if (Math.hypot(padAimX, padAimY) > 0.05) {
        this.usingGamepadAim = true;
        this.lastGamepadAimAngle = Math.atan2(padAimY, padAimX);
      }

      const nextPrev: boolean[] = new Array(activePad.buttons.length);
      for (let i = 0; i < activePad.buttons.length; i++) {
        nextPrev[i] = btn(i);
      }
      this.prevPadButtons = nextPrev;
    } else if (this.prevPadButtons.length > 0) {
      this.prevPadButtons = [];
    }

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

    let moveX = Math.abs(kbMoveX) > 0 ? kbMoveX : padMoveX;
    let moveY = Math.abs(kbMoveY) > 0 ? kbMoveY : padMoveY;
    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 1) {
      moveX /= moveLen;
      moveY /= moveLen;
    }

    // 3. Resolve exact world aim coordinates
    let aimWorldX: number;
    let aimWorldY: number;
    if (this.usingGamepadAim) {
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
      firePrimary: !this.uiBlockingGameplay && (this.mousePrimaryDown || padFireHeld),
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

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    this.onFirstGesture?.();

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
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMouseMoved = true;
    this.usingGamepadAim = false;
  };

  private readonly handleMouseDown = (e: MouseEvent): void => {
    this.onFirstGesture?.();
    this.mouseClientX = e.clientX;
    this.mouseClientY = e.clientY;
    this.hasMouseMoved = true;
    this.usingGamepadAim = false;

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
