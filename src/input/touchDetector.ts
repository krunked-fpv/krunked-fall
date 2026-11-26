// ============================================================================
// KRUNKEDFALL — Strict Mobile / Touch & Tesla Input Detector
// ============================================================================
// STRICT VISIBILITY INVARIANT:
//   Touch controls are NEVER shown on desktop mouse/keyboard PCs, and NOT shown
//   on hybrid Windows touchscreen laptops until an actual touch event occurs!
//   They activate immediately ONLY on true touch-primary environments:
//     1. (pointer: coarse) && (hover: none), OR
//     2. Mobile / tablet UA with maxTouchPoints > 0, OR
//     3. Tesla browser (Tesla / QtCarBrowser) with maxTouchPoints > 0 when no
//        gamepad is currently active.
//   Ignores browser-emulated compatibility mouse events for 700ms after touch.

import type { InputDeviceKind } from '../contracts/index.js';
import { detectTeslaBrowser } from './gamepadProfiles.js';

const MOBILE_TABLET_UA_RE = /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|PlayBook/i;
export const SYNTHETIC_MOUSE_GUARD_MS = 700;

interface MediaQueryListLike {
  matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

export class TouchDetector {
  private touchSensed = false;
  private touchControlsVisible = false;
  private activeDevice: InputDeviceKind = 'keyboard';
  private teslaBrowser = false;
  private wasPrimaryTouch = false;
  private lastTouchAtMs = Number.NEGATIVE_INFINITY;

  private attached = false;
  private coarseMql: MediaQueryListLike | null = null;
  private hoverNoneMql: MediaQueryListLike | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.evaluateEnvironment(true);
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;

    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    if (typeof window.matchMedia === 'function') {
      try {
        this.coarseMql = window.matchMedia('(pointer: coarse)') as MediaQueryListLike;
        this.hoverNoneMql = window.matchMedia('(hover: none)') as MediaQueryListLike;
        this.bindMediaListener(this.coarseMql, this.handleMediaChange);
        this.bindMediaListener(this.hoverNoneMql, this.handleMediaChange);
      } catch {
        this.coarseMql = null;
        this.hoverNoneMql = null;
      }
    }

    this.evaluateEnvironment(false);
  }

  public detach(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;

    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('resize', this.handleResize);

    if (this.coarseMql) {
      this.unbindMediaListener(this.coarseMql, this.handleMediaChange);
      this.coarseMql = null;
    }
    if (this.hoverNoneMql) {
      this.unbindMediaListener(this.hoverNoneMql, this.handleMediaChange);
      this.hoverNoneMql = null;
    }
  }

  public isTouchSensed(): boolean {
    return this.touchSensed;
  }

  public shouldShowTouchControls(): boolean {
    return this.touchControlsVisible;
  }

  public getActiveDevice(): InputDeviceKind {
    return this.activeDevice;
  }

  public isTesla(): boolean {
    return this.teslaBrowser;
  }

  public isWithinSyntheticMouseGuard(nowMs = Date.now()): boolean {
    return nowMs - this.lastTouchAtMs < SYNTHETIC_MOUSE_GUARD_MS;
  }

  public notifyTouch(nowMs = Date.now()): void {
    this.lastTouchAtMs = nowMs;
    this.updateState(true, true, 'touch');
  }

  /**
   * Notifies detector of keyboard or mouse input.
   * By default (`isMouse = true`), ignores browser-emulated compatibility mouse
   * events arriving within 700ms of a touch event.
   */
  public notifyKeyboardOrMouse(isMouse = true, nowMs = Date.now()): void {
    if (isMouse && this.isWithinSyntheticMouseGuard(nowMs)) {
      return;
    }
    this.updateState(this.touchSensed, false, 'keyboard');
  }

  public notifyGamepad(): void {
    this.updateState(this.touchSensed, false, 'gamepad');
  }

  /**
   * Called when all gamepads disconnect so primary touch devices (phones,
   * tablets, Tesla infotainment) gracefully recover touch controls.
   */
  public notifyGamepadDisconnected(): void {
    if (this.activeDevice !== 'gamepad') return;
    if (this.isPrimaryTouchEnvironment()) {
      this.updateState(true, true, 'touch');
    } else {
      this.updateState(this.touchSensed, false, 'keyboard');
    }
  }

  public onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private isPrimaryTouchEnvironment(): boolean {
    const ua =
      typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';
    const maxTouchPoints =
      typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
        ? navigator.maxTouchPoints
        : 0;

    this.teslaBrowser = detectTeslaBrowser(ua);

    let coarseAndNoHover = false;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const hoverNone = window.matchMedia('(hover: none)').matches;
        coarseAndNoHover = Boolean(coarse && hoverNone);
      } catch {
        coarseAndNoHover = false;
      }
    }

    if (coarseAndNoHover) return true;
    if (maxTouchPoints > 0 && MOBILE_TABLET_UA_RE.test(ua)) return true;
    if (this.teslaBrowser && maxTouchPoints > 0) return true;
    return false;
  }

  private evaluateEnvironment(initial: boolean): void {
    const primaryTouch = this.isPrimaryTouchEnvironment();
    const prevPrimaryTouch = this.wasPrimaryTouch;
    this.wasPrimaryTouch = primaryTouch;

    if (primaryTouch) {
      if (initial) {
        this.touchSensed = true;
        this.activeDevice = 'touch';
        this.touchControlsVisible = true;
      } else if (!prevPrimaryTouch && this.activeDevice !== 'gamepad') {
        this.updateState(true, true, 'touch');
      } else if (!this.touchSensed) {
        this.updateState(true, this.activeDevice === 'touch', this.activeDevice);
      }
      return;
    }

    // Non-primary-touch environment (desktop PC or hybrid Windows laptop)
    if (initial) {
      this.touchSensed = false;
      this.touchControlsVisible = false;
      this.activeDevice = 'keyboard';
    } else if (
      prevPrimaryTouch &&
      this.activeDevice === 'touch' &&
      !this.isWithinSyntheticMouseGuard() &&
      this.hasZeroTouchPoints()
    ) {
      // DevTools switched back from mobile emulation to desktop mouse
      this.updateState(false, false, 'keyboard');
    }
  }

  private hasZeroTouchPoints(): boolean {
    if (typeof navigator === 'undefined') return true;
    return typeof navigator.maxTouchPoints !== 'number' || navigator.maxTouchPoints <= 0;
  }

  private updateState(
    nextSensed: boolean,
    nextVisible: boolean,
    nextDevice: InputDeviceKind,
  ): void {
    const changed =
      this.touchSensed !== nextSensed ||
      this.touchControlsVisible !== nextVisible ||
      this.activeDevice !== nextDevice;

    this.touchSensed = nextSensed;
    this.touchControlsVisible = nextVisible;
    this.activeDevice = nextDevice;

    if (changed) {
      for (const cb of this.listeners) {
        cb();
      }
    }
  }

  private bindMediaListener(mql: MediaQueryListLike, fn: () => void): void {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', fn);
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(fn);
    }
  }

  private unbindMediaListener(mql: MediaQueryListLike, fn: () => void): void {
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', fn);
    } else if (typeof mql.removeListener === 'function') {
      mql.removeListener(fn);
    }
  }

  private readonly handleTouchStart = (): void => {
    this.notifyTouch();
  };

  private readonly handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.notifyTouch();
    } else if (e.pointerType === 'mouse') {
      this.notifyKeyboardOrMouse(true);
    }
  };

  private readonly handleResize = (): void => {
    this.evaluateEnvironment(false);
  };

  private readonly handleMediaChange = (): void => {
    this.evaluateEnvironment(false);
  };
}
