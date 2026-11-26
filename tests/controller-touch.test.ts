// ============================================================================
// KRUNKEDFALL — Controller, Multi-Platform Gamepad, Touch & UI Nav Test Suite
// ============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_STORAGE_KEY,
  type ControllerSettings,
  type UiNavActions,
} from '../src/contracts/index.js';
import {
  SaveManager,
  createDefaultSaveData,
  sanitizeSaveData,
} from '../src/app/saveManager.js';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  InputManager,
  SYNTHETIC_MOUSE_GUARD_MS,
  TouchDetector,
  applyRadialDeadzone,
  countConnectedGamepads,
  detectGamepadProfile,
  detectTeslaBrowser,
  getDisplayPrompts,
  getGamepadGlyphs,
  readNormalizedGamepad,
  selectActiveGamepad,
  triggerGamepadRumble,
} from '../src/input/index.js';
import { TouchControls } from '../src/ui/touchControls.js';
import { GamepadNavigator } from '../src/ui/gamepadNav.js';
import { createInitialSimState, enterHub, enterNode } from '../src/sim/index.js';

// ============================================================================
// MOCK HELPERS
// ============================================================================

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

function mkBtn(pressed = false, value?: number): GamepadButton {
  return {
    pressed,
    touched: pressed || (value !== undefined && value > 0),
    value: value ?? (pressed ? 1 : 0),
  };
}

interface MockGamepadOpts {
  index?: number;
  id?: string;
  mapping?: GamepadMappingType;
  connected?: boolean;
  axes?: number[];
  buttonCount?: number;
  pressedButtons?: Record<number, boolean | number>;
  vibrationActuator?: unknown;
  hapticActuators?: unknown[];
}

function createMockGamepad(opts: MockGamepadOpts = {}): Gamepad {
  const btnCount = opts.buttonCount ?? 17;
  const buttons: GamepadButton[] = Array.from({ length: btnCount }, (_, i) => {
    const entry = opts.pressedButtons?.[i];
    if (typeof entry === 'number') {
      return mkBtn(entry > 0.35, entry);
    }
    return mkBtn(Boolean(entry));
  });
  const pad: Record<string, unknown> = {
    index: opts.index ?? 0,
    id: opts.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    mapping: opts.mapping ?? 'standard',
    connected: opts.connected ?? true,
    timestamp: 100,
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons,
  };
  if (opts.vibrationActuator !== undefined) {
    pad.vibrationActuator = opts.vibrationActuator;
  }
  if (opts.hapticActuators !== undefined) {
    pad.hapticActuators = opts.hapticActuators;
  }
  return pad as unknown as Gamepad;
}

interface MockMediaQueryList {
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener: (type: 'change', fn: () => void) => void;
  removeEventListener: (type: 'change', fn: () => void) => void;
  setMatches: (next: boolean) => void;
}

function createMockMediaQueryList(initial: boolean): MockMediaQueryList {
  const listeners = new Set<() => void>();
  const mql: MockMediaQueryList = {
    matches: initial,
    listeners,
    addEventListener: (_type, fn) => {
      listeners.add(fn);
    },
    removeEventListener: (_type, fn) => {
      listeners.delete(fn);
    },
    setMatches: (next: boolean) => {
      mql.matches = next;
      for (const fn of listeners) fn();
    },
  };
  return mql;
}

interface MockWindowHarness {
  windowObj: Record<string, unknown>;
  dispatch: (type: string, event?: Record<string, unknown>) => void;
  coarseMql: MockMediaQueryList;
  hoverNoneMql: MockMediaQueryList;
}

function createMockWindowHarness(opts: {
  coarse?: boolean;
  hoverNone?: boolean;
  fine?: boolean;
  hover?: boolean;
} = {}): MockWindowHarness {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const coarseMql = createMockMediaQueryList(Boolean(opts.coarse));
  const hoverNoneMql = createMockMediaQueryList(Boolean(opts.hoverNone));
  const fineMql = createMockMediaQueryList(opts.fine ?? !opts.coarse);
  const hoverMql = createMockMediaQueryList(opts.hover ?? !opts.hoverNone);

  const windowObj = {
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
    matchMedia: (query: string) => {
      if (query.includes('pointer: coarse')) return coarseMql;
      if (query.includes('hover: none')) return hoverNoneMql;
      if (query.includes('pointer: fine')) return fineMql;
      if (query.includes('hover: hover')) return hoverMql;
      return createMockMediaQueryList(false);
    },
  };

  return {
    windowObj,
    dispatch: (type: string, event: Record<string, unknown> = {}) => {
      for (const fn of listeners.get(type) ?? []) {
        fn(event);
      }
    },
    coarseMql,
    hoverNoneMql,
  };
}

// Lightweight DOM mock for TouchControls & GamepadNavigator unit tests
class MockClassList {
  private readonly set = new Set<string>();
  public add(...tokens: string[]): void {
    for (const t of tokens) {
      if (t) this.set.add(t);
    }
  }
  public remove(...tokens: string[]): void {
    for (const t of tokens) this.set.delete(t);
  }
  public contains(token: string): boolean {
    return this.set.has(token);
  }
  public toggle(token: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.set.has(token)) {
        this.set.delete(token);
        return false;
      }
      this.set.add(token);
      return true;
    }
    if (force) this.set.add(token);
    else this.set.delete(token);
    return force;
  }
  public toString(): string {
    return [...this.set].join(' ');
  }
  public resetFromString(value: string): void {
    this.set.clear();
    for (const part of value.split(/\s+/)) {
      if (part) this.set.add(part);
    }
  }
}

class MockDOMElement {
  public readonly tagName: string;
  public readonly classList = new MockClassList();
  public readonly dataset: Record<string, string> = {};
  public readonly style: {
    display: string;
    visibility: string;
    transform: string;
    setProperty: (prop: string, val: string) => void;
    getPropertyValue: (prop: string) => string;
  };
  public readonly attributes = new Map<string, string>();
  public readonly children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public textContent = '';
  public hidden = false;
  public disabled = false;
  public tabIndex = 0;
  public type = '';
  public min = '';
  public max = '';
  public step = '';
  public value = '';
  public scrollTop = 0;
  public clickCount = 0;
  public dispatchedEvents: string[] = [];
  public rect = { left: 0, top: 0, width: 0, height: 0 };

  private readonly props = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(e: unknown) => void>>();

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
    const props = this.props;
    this.style = {
      display: '',
      visibility: '',
      transform: '',
      setProperty(prop: string, val: string) {
        props.set(prop, val);
      },
      getPropertyValue(prop: string) {
        return props.get(prop) ?? '';
      },
    };
  }

  public get className(): string {
    return this.classList.toString();
  }

  public set className(val: string) {
    this.classList.resetFromString(val);
  }

  public appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public append(...nodes: MockDOMElement[]): void {
    for (const n of nodes) this.appendChild(n);
  }

  public remove(): void {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  public setAttribute(name: string, val: string): void {
    this.attributes.set(name, val);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  public addEventListener(type: string, fn: (e: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  public removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  public dispatchEvent(ev: { type: string; bubbles?: boolean } & Record<string, unknown>): boolean {
    this.dispatchedEvents.push(ev.type);
    let stopped = false;
    const wrapped = Object.assign(
      {
        preventDefault: () => {},
        stopPropagation: () => {
          stopped = true;
        },
      },
      ev,
    );
    let cur: MockDOMElement | null = this;
    while (cur) {
      for (const fn of cur.listeners.get(ev.type) ?? []) {
        fn(wrapped);
      }
      if (stopped || !ev.bubbles) break;
      cur = cur.parentElement;
    }
    return true;
  }

  public click(): void {
    this.clickCount += 1;
    this.dispatchEvent({ type: 'click', bubbles: true });
  }

  public scrollIntoView(): void {
    // no-op
  }

  public getBoundingClientRect(): DOMRect {
    return {
      left: this.rect.left,
      top: this.rect.top,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
      width: this.rect.width,
      height: this.rect.height,
      x: this.rect.left,
      y: this.rect.top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  public contains(other: MockDOMElement | null): boolean {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  public closest(selector: string): MockDOMElement | null {
    let cur: MockDOMElement | null = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  public matches(selector: string): boolean {
    const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.some((p) => this.matchesSingle(p));
  }

  private matchesSingle(sel: string): boolean {
    if (sel.includes(' ')) {
      const tokens = sel.split(/\s+/);
      const last = tokens[tokens.length - 1];
      if (!this.matchesSingle(last)) return false;
      const ancestorSel = tokens.slice(0, -1).join(' ');
      return this.parentElement ? this.parentElement.closest(ancestorSel) !== null : false;
    }
    if (sel.includes(':not(:disabled)') && this.disabled) return false;
    if (sel.includes(':not([type="hidden"])') && this.type === 'hidden') return false;
    if (sel.includes(':not([type="file"])') && this.type === 'file') return false;
    if (sel.includes(':not([tabindex="-1"])') && this.tabIndex === -1) return false;

    const clean = sel.replace(/:not\([^)]+\)/g, '');
    if (clean.startsWith('.')) {
      const classes = clean.slice(1).split('.');
      return classes.every((c) => this.classList.contains(c));
    }
    if (clean.startsWith('[')) {
      const m = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(clean);
      if (!m) return false;
      const attr = m[1];
      const expected = m[2];
      if (attr.startsWith('data-')) {
        const camel = attr
          .slice(5)
          .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
        if (!(camel in this.dataset)) return false;
        return expected === undefined ? true : this.dataset[camel] === expected;
      }
      if (attr === 'tabindex') {
        return this.attributes.has('tabindex') || this.tabIndex !== 0;
      }
      const val = this.attributes.get(attr);
      return expected === undefined ? val !== undefined : val === expected;
    }
    return this.tagName === clean.toUpperCase();
  }

  public querySelectorAll(selector: string): MockDOMElement[] {
    const out: MockDOMElement[] = [];
    const visit = (node: MockDOMElement) => {
      for (const ch of node.children) {
        if (ch.matches(selector)) out.push(ch);
        visit(ch);
      }
    };
    visit(this);
    return out;
  }

  public querySelector(selector: string): MockDOMElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function createNeutralNav(): UiNavActions {
  return {
    moveX: 0,
    moveY: 0,
    confirm: false,
    cancel: false,
    tabPrev: false,
    tabNext: false,
    pageUp: false,
    pageDown: false,
  };
}

// ============================================================================
// 1. PROFILE DETECTION, TESLA UA & GLYPHS
// ============================================================================

describe('gamepadProfiles — Profile Detection, Tesla UA & Adaptive Glyphs', () => {
  it('detects Xbox, PlayStation, Nintendo, Steam Deck, Tesla, and Generic HID profiles accurately', () => {
    // Xbox
    expect(detectGamepadProfile('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(
      detectGamepadProfile('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'),
    ).toBe('xbox');
    expect(detectGamepadProfile('Microsoft Corp. Controller (045e)')).toBe('xbox');
    expect(detectGamepadProfile('8BitDo Pro 2 XInput')).toBe('xbox');

    // PlayStation
    expect(
      detectGamepadProfile('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'),
    ).toBe('playstation');
    expect(detectGamepadProfile('Sony Interactive Entertainment DUALSHOCK 4')).toBe('playstation');
    expect(detectGamepadProfile('Wireless Controller (Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(detectGamepadProfile('PS5 Gamepad')).toBe('playstation');

    // Nintendo
    expect(
      detectGamepadProfile('Nintendo Switch Pro Controller (Vendor: 057e Product: 2009)'),
    ).toBe('nintendo');
    expect(detectGamepadProfile('Joy-Con (L+R) (STANDARD GAMEPAD)')).toBe('nintendo');
    expect(detectGamepadProfile('HID Device 057e:2006')).toBe('nintendo');

    // Steam Deck
    expect(detectGamepadProfile('Valve Steam Deck Controller (Vendor: 28de Product: 1205)')).toBe(
      'steamdeck',
    );
    expect(detectGamepadProfile('Steam Virtual Gamepad')).toBe('steamdeck');

    // Tesla UA & controller
    expect(
      detectTeslaBrowser('Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 Tesla/2024.32.6'),
    ).toBe(true);
    expect(detectTeslaBrowser('Mozilla/5.0 (Linux) AppleWebKit/537.36 QtCarBrowser')).toBe(true);
    expect(
      detectTeslaBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0'),
    ).toBe(false);
    expect(detectGamepadProfile('Generic USB Gamepad', true)).toBe('tesla');
    expect(detectGamepadProfile('Tesla Arcade Gamepad', false)).toBe('tesla');
    // Branded controller inside Tesla browser keeps its native face button glyphs
    expect(detectGamepadProfile('DualSense Wireless Controller (054c)', true)).toBe('playstation');

    // Generic HID
    expect(detectGamepadProfile('USB Network Joystick (Vendor: 0079 Product: 0006)', false)).toBe(
      'generic',
    );
    expect(detectGamepadProfile('', false)).toBe('generic');
  });

  it('returns distinct adaptive glyphs for each controller family, keyboard, and touch', () => {
    const xbox = getGamepadGlyphs('xbox');
    expect(xbox.fire).toBe('RT');
    expect(xbox.ability).toBe('LT');
    expect(xbox.confirm).toBe('A');
    expect(xbox.cancel).toBe('B');

    const ps = getGamepadGlyphs('playstation');
    expect(ps.fire).toBe('R2');
    expect(ps.ability).toBe('L2');
    expect(ps.confirm).toBe('✕');
    expect(ps.cancel).toBe('○');
    expect(ps.swap).toBe('□');

    const nintendo = getGamepadGlyphs('nintendo');
    expect(nintendo.fire).toBe('ZR');
    expect(nintendo.ability).toBe('ZL');
    expect(nintendo.confirm).toBe('B');
    expect(nintendo.cancel).toBe('A');

    const deck = getGamepadGlyphs('steamdeck');
    expect(deck.fire).toBe('R2');
    expect(deck.tabPrev).toBe('L1');

    const touch = getDisplayPrompts('touch', 'generic');
    expect(touch.move).toBe('L-STICK');
    expect(touch.aim).toBe('R-STICK');
    expect(touch.ability).toBe('ABIL');

    const kb = getDisplayPrompts('keyboard', 'xbox', {
      moveUp: 'KeyW',
      moveLeft: 'KeyA',
      moveDown: 'KeyS',
      moveRight: 'KeyD',
      ability: 'Space',
      power: 'KeyQ',
      workbench: 'Tab',
      pause: 'Escape',
    });
    expect(kb.move).toBe('WASD');
    expect(kb.ability).toBe('SPACE');
    expect(kb.workbench).toBe('TAB');
  });
});

// ============================================================================
// 2. RADIAL DEADZONE MATH
// ============================================================================

describe('applyRadialDeadzone — Circular Symmetry, Smooth Ramp & Clamping', () => {
  it('zeroes inputs inside radial deadzone including diagonals', () => {
    expect(applyRadialDeadzone(0, 0, 0.16)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(applyRadialDeadzone(0.16, 0, 0.16)).toEqual({ x: 0, y: 0, magnitude: 0 });
    // Diagonal (0.11, 0.11) has hypot ~0.1556 < 0.16 -> strictly zero
    expect(applyRadialDeadzone(0.11, 0.11, 0.16)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(applyRadialDeadzone(Number.NaN, Number.POSITIVE_INFINITY, 0.16)).toEqual({
      x: 0,
      y: 0,
      magnitude: 0,
    });
  });

  it('maintains circular symmetry across arbitrary angles and ramps smoothly to 1.0', () => {
    const dz = 0.16;
    const radius = 0.6;
    const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, -2.1];
    const magnitudes = angles.map((theta) => {
      const res = applyRadialDeadzone(Math.cos(theta) * radius, Math.sin(theta) * radius, dz);
      // Preserves input direction angle accurately
      expect(Math.atan2(res.y, res.x)).toBeCloseTo(Math.atan2(Math.sin(theta), Math.cos(theta)), 5);
      expect(Math.hypot(res.x, res.y)).toBeCloseTo(res.magnitude, 6);
      return res.magnitude;
    });
    for (let i = 1; i < magnitudes.length; i++) {
      expect(magnitudes[i]).toBeCloseTo(magnitudes[0], 6);
    }

    // Monotonic smooth ramp from deadzone edge up to full deflection 1.0
    const low = applyRadialDeadzone(0.2, 0, dz);
    const mid = applyRadialDeadzone(0.58, 0, dz);
    const full = applyRadialDeadzone(1.0, 0, dz);
    expect(low.magnitude).toBeGreaterThan(0);
    expect(mid.magnitude).toBeGreaterThan(low.magnitude);
    expect(full.magnitude).toBeCloseTo(1.0, 6);
    expect(full.x).toBeCloseTo(1.0, 6);
    expect(full.y).toBeCloseTo(0, 6);
  });

  it('clamps diagonal inputs outside unit circle strictly to magnitude 1.0', () => {
    const corner = applyRadialDeadzone(1, 1, 0.16);
    expect(corner.magnitude).toBeCloseTo(1.0, 6);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1.0, 6);
    expect(corner.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(corner.y).toBeCloseTo(Math.SQRT1_2, 5);

    const overshoot = applyRadialDeadzone(-3.5, 0, 0.2);
    expect(overshoot.magnitude).toBeCloseTo(1.0, 6);
    expect(overshoot.x).toBeCloseTo(-1.0, 6);
  });
});

// ============================================================================
// 3. ADAPTIVE MAPPING & MULTI-GAMEPAD ACTIVE-SLOT SWITCHING
// ============================================================================

describe('readNormalizedGamepad & selectActiveGamepad — Standard, DirectInput, Hat-Switch & Multi-Pad', () => {
  it('maps standard W3C gamepads cleanly across sticks, triggers, D-pad, and face buttons', () => {
    const pad = createMockGamepad({
      id: 'Xbox Wireless Controller (045e)',
      mapping: 'standard',
      axes: [0.8, -0.4, 0, -1.0],
      pressedButtons: {
        0: true, // A confirm/interact
        1: false,
        2: true, // X swap
        3: true, // Y power
        4: true, // LB tabPrev
        6: 0.75, // LT ability
        7: 0.9, // RT fire
        8: true, // View workbench
        9: true, // Menu pause
        12: true, // D-pad Up
        15: true, // D-pad Right
      },
    });

    const norm = readNormalizedGamepad(pad, 0.16);
    expect(norm.profile).toBe('xbox');
    expect(norm.moveX).toBeGreaterThan(0.5);
    expect(norm.moveY).toBeLessThan(-0.2);
    expect(norm.aimY).toBeCloseTo(-1, 5);
    expect(norm.dpadX).toBe(1);
    expect(norm.dpadY).toBe(-1);
    expect(norm.confirmHeld).toBe(true);
    expect(norm.interactHeld).toBe(true);
    expect(norm.swapHeld).toBe(true);
    expect(norm.powerHeld).toBe(true);
    expect(norm.tabPrevHeld).toBe(true);
    expect(norm.abilityHeld).toBe(true);
    expect(norm.fireHeld).toBe(true);
    expect(norm.workbenchHeld).toBe(true);
    expect(norm.pauseHeld).toBe(true);
    expect(norm.hasActivity).toBe(true);
  });

  it('adapts non-standard Linux evdev / Tesla 8-axis 11-button pads with -1..+1 triggers and axis 6/7 D-pad', () => {
    // Resting triggers at -1 MUST NOT false-fire!
    const idleEvdev = createMockGamepad({
      id: 'USB Gamepad Linux',
      mapping: '',
      axes: [0, 0, -1, 0, 0, -1, 0, 0],
      buttonCount: 11,
    });
    const idleNorm = readNormalizedGamepad(idleEvdev, 0.16, true);
    expect(idleNorm.profile).toBe('tesla');
    expect(idleNorm.fireHeld).toBe(false);
    expect(idleNorm.abilityHeld).toBe(false);
    expect(idleNorm.hasActivity).toBe(false);

    // Pulled RT (+0.85), aimed RX/RY on axes 3/4, D-pad left/down on axes 6/7, Start on btn 7
    const activeEvdev = createMockGamepad({
      id: 'USB Gamepad Linux',
      mapping: '',
      axes: [0, 0, -1, 0.9, -0.1, 0.85, -1, 1],
      buttonCount: 11,
      pressedButtons: { 6: true, 7: true },
    });
    const activeNorm = readNormalizedGamepad(activeEvdev, 0.16, true);
    expect(activeNorm.aimX).toBeGreaterThan(0.7);
    expect(activeNorm.fireHeld).toBe(true);
    expect(activeNorm.abilityHeld).toBe(false);
    expect(activeNorm.dpadX).toBe(-1);
    expect(activeNorm.dpadY).toBe(1);
    expect(activeNorm.workbenchHeld).toBe(true);
    expect(activeNorm.pauseHeld).toBe(true);
  });

  it('adapts non-standard DirectInput DualSense/DS4 raw HID layout including axis 9 POV hat-switch', () => {
    // Axis 9 hat-switch: -1 = N, -3/7 = E, 1/7 = S, 5/7 = W, 3.2857 = neutral
    const ds4Raw = createMockGamepad({
      id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
      mapping: '',
      axes: [0, 0, 0.85, -1, 0.75, -0.5, 0, 0, 0, -3 / 7],
      buttonCount: 14,
      pressedButtons: { 1: true, 2: false, 0: true }, // raw DS4: 1=Cross(bottom), 0=Square(west)
    });

    const norm = readNormalizedGamepad(ds4Raw, 0.16);
    expect(norm.profile).toBe('playstation');
    expect(norm.aimX).toBeGreaterThan(0.5);
    expect(norm.aimY).toBeLessThan(-0.2);
    expect(norm.abilityHeld).toBe(false);
    expect(norm.fireHeld).toBe(true);
    expect(norm.dpadX).toBe(1);
    expect(norm.dpadY).toBe(0);
    expect(norm.confirmHeld).toBe(true);
    expect(norm.swapHeld).toBe(true);

    // Neutral hat switch (3.2857 and 0.0) yields (0, 0)
    const ds4NeutralHat = createMockGamepad({
      id: 'Wireless Controller (Vendor: 054c Product: 0ce6)',
      mapping: '',
      axes: [0, 0, 0, -1, -1, 0, 0, 0, 0, 3.285714],
      buttonCount: 14,
    });
    const neutralNorm = readNormalizedGamepad(ds4NeutralHat, 0.16);
    expect(neutralNorm.dpadX).toBe(0);
    expect(neutralNorm.dpadY).toBe(0);
    expect(neutralNorm.hasActivity).toBe(false);
  });

  it('skips phantom 0-axis/0-button devices and switches active slot dynamically across multiple gamepads', () => {
    const phantom = createMockGamepad({
      index: 0,
      id: 'Phantom Keyboard HID',
      axes: [],
      buttonCount: 0,
    });
    const xboxIdle = createMockGamepad({
      index: 1,
      id: 'Xbox Wireless Controller (045e)',
    });
    const psActive = createMockGamepad({
      index: 2,
      id: 'DualSense Wireless Controller (054c)',
      pressedButtons: { 0: true },
    });

    // Phantom skipped in count & selection
    expect(countConnectedGamepads([phantom, xboxIdle, psActive])).toBe(2);
    expect(selectActiveGamepad([phantom, xboxIdle], -1, 0.16)).toBe(xboxIdle);

    // Idle preferred slot stays selected when all real pads are idle
    const psIdle = createMockGamepad({ index: 2, id: 'DualSense (054c)' });
    expect(selectActiveGamepad([phantom, xboxIdle, psIdle], 2, 0.16)).toBe(psIdle);

    // Active second pad steals active slot immediately when preferred pad is idle
    expect(selectActiveGamepad([phantom, xboxIdle, psActive], 1, 0.16)).toBe(psActive);

    // If preferred pad ALSO has activity, preferred pad stays locked (zero flicker)
    const xboxActive = createMockGamepad({
      index: 1,
      id: 'Xbox Wireless Controller (045e)',
      axes: [0.9, 0, 0, 0],
    });
    expect(selectActiveGamepad([phantom, xboxActive, psActive], 1, 0.16)).toBe(xboxActive);
  });
});

// ============================================================================
// 4. STRICT TOUCH DETECTOR BEHAVIOR
// ============================================================================

describe('TouchDetector — Strict Desktop/Hybrid Gating, Mobile, Tesla & Synthetic Mouse Guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays strictly false on desktop mouse/keyboard PCs', () => {
    const harness = createMockWindowHarness({ coarse: false, hoverNone: false, fine: true, hover: true });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
      maxTouchPoints: 0,
    });

    const detector = new TouchDetector();
    detector.attach();
    expect(detector.isTouchSensed()).toBe(false);
    expect(detector.shouldShowTouchControls()).toBe(false);
    expect(detector.getActiveDevice()).toBe('keyboard');
    expect(detector.isTesla()).toBe(false);
    detector.detach();
  });

  it('does NOT show touch controls on hybrid Windows touchscreen laptops until an actual touch event fires', () => {
    const harness = createMockWindowHarness({ coarse: false, hoverNone: false, fine: true, hover: true });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/130.0.0.0',
      maxTouchPoints: 10,
    });

    const detector = new TouchDetector();
    detector.attach();
    expect(detector.isTouchSensed()).toBe(false);
    expect(detector.shouldShowTouchControls()).toBe(false);
    expect(detector.getActiveDevice()).toBe('keyboard');

    // Actual touch event enables touch controls
    harness.dispatch('pointerdown', { pointerType: 'touch' });
    expect(detector.isTouchSensed()).toBe(true);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');

    detector.detach();
  });

  it('senses touch immediately on mobile/tablet (pointer: coarse + hover: none) and reacts to live matchMedia changes', () => {
    const harness = createMockWindowHarness({ coarse: true, hoverNone: true });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36',
      maxTouchPoints: 5,
    });

    const detector = new TouchDetector();
    detector.attach();
    expect(detector.isTouchSensed()).toBe(true);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');
    detector.detach();

    // Also test DevTools live toggle from desktop -> mobile coarse pointer
    const toggleHarness = createMockWindowHarness({ coarse: false, hoverNone: false });
    vi.stubGlobal('window', toggleHarness.windowObj);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
      maxTouchPoints: 0,
    });
    const liveDet = new TouchDetector();
    const onChange = vi.fn();
    liveDet.onChange(onChange);
    liveDet.attach();
    expect(liveDet.shouldShowTouchControls()).toBe(false);

    toggleHarness.hoverNoneMql.setMatches(true);
    toggleHarness.coarseMql.setMatches(true);
    expect(liveDet.isTouchSensed()).toBe(true);
    expect(liveDet.shouldShowTouchControls()).toBe(true);
    expect(liveDet.getActiveDevice()).toBe('touch');
    expect(onChange).toHaveBeenCalled();
    liveDet.detach();
  });

  it('detects Tesla touchscreen when no gamepad is active, hides on gamepad, and restores on disconnect', () => {
    const harness = createMockWindowHarness({ coarse: false, hoverNone: false });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 Tesla/2024.26',
      maxTouchPoints: 5,
    });

    const detector = new TouchDetector();
    expect(detector.isTesla()).toBe(true);
    expect(detector.isTouchSensed()).toBe(true);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');

    detector.notifyGamepad();
    expect(detector.getActiveDevice()).toBe('gamepad');
    expect(detector.shouldShowTouchControls()).toBe(false);

    detector.notifyGamepadDisconnected();
    expect(detector.getActiveDevice()).toBe('touch');
    expect(detector.shouldShowTouchControls()).toBe(true);
  });

  it('guards against synthetic mouse events for 700ms after touch, hides on genuine KB/mouse/gamepad, and re-shows on next touch', () => {
    const harness = createMockWindowHarness({ coarse: false, hoverNone: false });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('navigator', { userAgent: 'Desktop', maxTouchPoints: 10 });

    const detector = new TouchDetector();
    expect(SYNTHETIC_MOUSE_GUARD_MS).toBe(700);

    detector.notifyTouch(1000);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');

    // Synthetic mouse event within 700ms MUST NOT prematurely hide touch controls
    detector.notifyKeyboardOrMouse(true, 1650);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');

    // Genuine mouse event after 700ms debounce DOES hide touch controls
    detector.notifyKeyboardOrMouse(true, 1750);
    expect(detector.shouldShowTouchControls()).toBe(false);
    expect(detector.getActiveDevice()).toBe('keyboard');
    expect(detector.isTouchSensed()).toBe(true);

    // Touching again re-shows touch controls
    detector.notifyTouch(2000);
    expect(detector.shouldShowTouchControls()).toBe(true);
    expect(detector.getActiveDevice()).toBe('touch');

    // Genuine keyboard press immediately hides touch controls
    detector.notifyKeyboardOrMouse(false, 2100);
    expect(detector.shouldShowTouchControls()).toBe(false);
    expect(detector.getActiveDevice()).toBe('keyboard');

    // Touch -> Gamepad immediately hides touch controls
    detector.notifyTouch(3000);
    expect(detector.shouldShowTouchControls()).toBe(true);
    detector.notifyGamepad();
    expect(detector.shouldShowTouchControls()).toBe(false);
    expect(detector.getActiveDevice()).toBe('gamepad');
  });
});

// ============================================================================
// 5. VIRTUAL TOUCH INPUT INJECTION & TOUCH CONTROLS MULTI-TOUCH
// ============================================================================

describe('TouchControls & InputManager — Virtual Stick / Button Injection & Clean Release', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects left stick move, right stick aim + fire, and action buttons into InputManager.sampleInputFrame and releases cleanly', () => {
    const canvas = createMockCanvas(932, 430);
    const input = new InputManager(canvas, (cx, cy) => ({ x: cx, y: cy }));
    const state = createInitialSimState(777, 'britta');
    enterNode(state, 'act1_canyon');

    input.setTouchInput({
      moveX: 0.6,
      moveY: -0.8,
      aimX: 0,
      aimY: 1,
      aimActive: true,
      fireHeld: true,
    });
    input.triggerTouchAction('ability');
    input.triggerTouchAction('power');
    input.triggerTouchAction('swap');
    input.triggerTouchAction('interact');
    input.triggerTouchAction('vent');

    const status = input.getControllerStatus();
    expect(status.activeDevice).toBe('touch');
    expect(status.touchSensed).toBe(true);
    expect(status.touchControlsVisible).toBe(true);

    const f1 = input.sampleInputFrame(state);
    expect(f1.moveX).toBeCloseTo(0.6, 5);
    expect(f1.moveY).toBeCloseTo(-0.8, 5);
    expect(f1.aimWorldX).toBeCloseTo(state.player.x, 3);
    expect(f1.aimWorldY).toBeGreaterThan(state.player.y + 90);
    expect(f1.firePrimary).toBe(true);
    expect(f1.firePrimaryPressed).toBe(true);
    expect(f1.abilityPressed).toBe(true);
    expect(f1.powerPressed).toBe(true);
    expect(f1.swapWeaponPressed).toBe(true);
    expect(f1.interactPressed).toBe(true);
    expect(f1.reloadOrVentPressed).toBe(true);

    // Projected stick aim reticle reports isStickAim = true
    const aimScreen = input.getAimScreenPos(state, (wx, wy) => ({ x: wx * 2, y: wy * 2 }));
    expect(aimScreen.visible).toBe(true);
    expect(aimScreen.isStickAim).toBe(true);

    // Next tick while fire still held does NOT re-trigger firePrimaryPressed
    const f2 = input.sampleInputFrame(state);
    expect(f2.firePrimary).toBe(true);
    expect(f2.firePrimaryPressed).toBe(false);
    expect(f2.abilityPressed).toBe(false);

    // clearTouchInput zeroes movement & fire cleanly
    input.clearTouchInput();
    const f3 = input.sampleInputFrame(state);
    expect(f3.moveX).toBe(0);
    expect(f3.moveY).toBe(0);
    expect(f3.firePrimary).toBe(false);
  });

  it('drives TouchControls multi-touch sticks, contextual USE/VENT button, and emits neutral zeroed input on setVisible(false)', () => {
    const harness = createMockWindowHarness({ coarse: true, hoverNone: true });
    vi.stubGlobal('window', harness.windowObj);
    vi.stubGlobal('document', {
      hidden: false,
      createElement: (tag: string) => new MockDOMElement(tag),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const parent = new MockDOMElement('div');
    const inputCalls: Array<{
      moveX: number;
      moveY: number;
      aimX: number;
      aimY: number;
      aimActive: boolean;
      fireHeld: boolean;
    }> = [];
    const actions: string[] = [];
    const onTouchDetected = vi.fn();
    const onPlayUiClick = vi.fn();

    const controls = new TouchControls(parent as unknown as HTMLElement, {
      onTouchInput: (inp) => inputCalls.push({ ...inp }),
      onTouchAction: (act) => actions.push(act),
      onTouchDetected,
      onPlayUiClick,
    });

    // Strictly hidden initially
    const layer = parent.querySelector('[data-testid="touch-controls-layer"]')!;
    expect(controls.isVisible()).toBe(false);
    expect(layer.style.display).toBe('none');

    controls.setVisible(true);
    expect(controls.isVisible()).toBe(true);
    expect(layer.style.display).toBe('block');

    const state = createInitialSimState(42, 'britta');
    enterNode(state, 'act1_canyon');
    // Force overheat > 35% so contextual button enters VENT mode
    state.player.weapons[0]!.overheat = 0.6;
    controls.update(state, { touchOpacity: 0.8, touchScale: 1.1 });
    expect(layer.style.getPropertyValue('--kf-touch-opacity')).toBe('0.80');
    expect(layer.style.getPropertyValue('--kf-touch-scale')).toBe('1.10');

    const leftStick = parent.querySelector('[data-testid="touch-stick-left"]')!;
    const rightStick = parent.querySelector('[data-testid="touch-stick-right"]')!;
    const abilBtn = parent.querySelector('[data-testid="touch-btn-ability"]')!;
    const interactBtn = parent.querySelector('[data-testid="touch-btn-interact"]')!;

    // Multi-touch: Finger 1 on left stick (+X), Finger 2 on right stick (+Y past fire threshold)
    leftStick.dispatchEvent({
      type: 'pointerdown',
      pointerId: 1,
      pointerType: 'touch',
      button: 0,
      clientX: 100,
      clientY: 300,
    });
    harness.dispatch('pointermove', {
      type: 'pointermove',
      pointerId: 1,
      pointerType: 'touch',
      clientX: 145,
      clientY: 300,
      preventDefault: vi.fn(),
    });

    rightStick.dispatchEvent({
      type: 'pointerdown',
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      clientX: 800,
      clientY: 300,
    });
    harness.dispatch('pointermove', {
      type: 'pointermove',
      pointerId: 2,
      pointerType: 'touch',
      clientX: 800,
      clientY: 345,
      preventDefault: vi.fn(),
    });

    const latest = inputCalls[inputCalls.length - 1];
    expect(latest.moveX).toBeGreaterThan(0.7);
    expect(latest.aimActive).toBe(true);
    expect(latest.aimY).toBeGreaterThan(0.7);
    expect(latest.fireHeld).toBe(true);
    expect(rightStick.classList.contains('firing')).toBe(true);

    // Tap ability & contextual vent buttons while sticks remain held
    abilBtn.dispatchEvent({ type: 'pointerdown', pointerId: 3, pointerType: 'touch', button: 0 });
    interactBtn.dispatchEvent({ type: 'pointerdown', pointerId: 4, pointerType: 'touch', button: 0 });
    expect(actions).toEqual(['ability', 'vent']);

    // Hiding controls releases all sticks and emits zeroed neutral state
    controls.setVisible(false);
    const released = inputCalls[inputCalls.length - 1];
    expect(released).toEqual({
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      aimActive: false,
      fireHeld: false,
    });
    expect(rightStick.classList.contains('firing')).toBe(false);

    controls.dispose();
  });
});

// ============================================================================
// 6. UI NAVIGATION ACTIONS & GAMEPLAY LATCH BLOCKING
// ============================================================================

describe('InputManager.consumeUiNavActions — Repeat Timing, Buttons & UI Blocking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enforces 280ms initial repeat delay & 115ms repeat interval, handles A/B/LB/RB, and blocks gameplay latches when UI is open', () => {
    let activePad: Gamepad | null = createMockGamepad({
      id: 'Xbox Wireless Controller (045e)',
      axes: [0.9, 0, 0, 0.85], // Left stick right, Right stick down (pageDown)
      pressedButtons: {
        0: true, // A confirm
        1: true, // B cancel
        4: true, // LB tabPrev
        5: true, // RB tabNext
        7: true, // RT fire (must be blocked when UI open)
        6: true, // LT ability (must be blocked when UI open)
      },
    });

    vi.stubGlobal('navigator', {
      getGamepads: () => (activePad ? [activePad] : []),
    });

    const input = new InputManager(createMockCanvas(), (cx, cy) => ({ x: cx, y: cy }));
    const state = createInitialSimState(101, 'britta');
    enterHub(state);
    input.setUiBlockingGameplay(true);

    // t = 1000: immediate first step + button edges
    const nav0 = input.consumeUiNavActions(1000);
    expect(nav0.moveX).toBe(1);
    expect(nav0.confirm).toBe(true);
    expect(nav0.cancel).toBe(true);
    expect(nav0.tabPrev).toBe(true);
    expect(nav0.tabNext).toBe(true);
    expect(nav0.pageDown).toBe(true);

    // Gameplay latches MUST remain completely blocked while UI is open
    const blockedFrame = input.sampleInputFrame(state);
    expect(blockedFrame.firePrimary).toBe(false);
    expect(blockedFrame.firePrimaryPressed).toBe(false);
    expect(blockedFrame.abilityPressed).toBe(false);
    expect(blockedFrame.powerPressed).toBe(false);
    expect(blockedFrame.interactPressed).toBe(false);
    expect(blockedFrame.reloadOrVentPressed).toBe(false);

    // t = 1200 (200ms < 280ms): moveX must NOT repeat yet; held buttons must NOT re-fire
    const nav1 = input.consumeUiNavActions(1200);
    expect(nav1.moveX).toBe(0);
    expect(nav1.confirm).toBe(false);
    expect(nav1.cancel).toBe(false);
    expect(nav1.tabPrev).toBe(false);
    expect(nav1.tabNext).toBe(false);

    // t = 1280 (280ms): first repeat fires!
    const nav2 = input.consumeUiNavActions(1280);
    expect(nav2.moveX).toBe(1);

    // t = 1350 (70ms < 115ms): no repeat yet
    expect(input.consumeUiNavActions(1350).moveX).toBe(0);

    // t = 1395 (115ms since 1280): second repeat fires!
    expect(input.consumeUiNavActions(1395).moveX).toBe(1);

    // Centering stick resets repeat timer so next tilt fires immediately
    activePad = createMockGamepad({ id: 'Xbox Wireless Controller (045e)', axes: [0, 0, 0, 0] });
    expect(input.consumeUiNavActions(1410).moveX).toBe(0);

    activePad = createMockGamepad({ id: 'Xbox Wireless Controller (045e)', axes: [-0.9, 0, 0, 0] });
    expect(input.consumeUiNavActions(1420).moveX).toBe(-1);
  });
});

// ============================================================================
// 7. SAFE RUMBLE INVOCATION
// ============================================================================

describe('Gamepad Haptic Rumble — Safe Invocation, Fallback & Disabled Guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invokes dual-rumble vibrationActuator, falls back to hapticActuators, and no-ops safely when absent or disabled', () => {
    const playEffect = vi.fn(() => Promise.reject(new Error('not supported')));
    const padWithActuator = createMockGamepad({
      vibrationActuator: { type: 'dual-rumble', playEffect },
    });

    // Direct helper handles rejected promises cleanly without throwing
    expect(() => triggerGamepadRumble(padWithActuator, 0.8, 150, 0.5)).not.toThrow();
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', {
      startDelay: 0,
      duration: 150,
      weakMagnitude: 0.4,
      strongMagnitude: 0.8,
    });

    // Legacy hapticActuators fallback
    const pulse = vi.fn();
    const padWithLegacy = createMockGamepad({ hapticActuators: [{ pulse }] });
    triggerGamepadRumble(padWithLegacy, 0.6, 120);
    expect(pulse).toHaveBeenCalledWith(0.6, 120);

    // No actuator at all -> safe no-op
    const plainPad = createMockGamepad({});
    expect(() => triggerGamepadRumble(plainPad, 1.0, 200)).not.toThrow();
    expect(() => triggerGamepadRumble(null, 1.0, 200)).not.toThrow();

    // InputManager.rumble respects vibrationEnabled setting
    const playEffect2 = vi.fn();
    const connectedPad = createMockGamepad({
      vibrationActuator: { type: 'dual-rumble', playEffect: playEffect2 },
    });
    vi.stubGlobal('navigator', { getGamepads: () => [connectedPad] });

    const input = new InputManager(createMockCanvas(), (cx, cy) => ({ x: cx, y: cy }));
    input.pollGamepad(100);
    input.rumble(0.5, 90);
    expect(playEffect2).toHaveBeenCalledTimes(1);

    input.setControllerSettings({ vibrationEnabled: false });
    input.rumble(0.9, 180);
    expect(playEffect2).toHaveBeenCalledTimes(1); // skipped when disabled!
  });
});

// ============================================================================
// 8. SAVEMANAGER PERSISTENCE & SANITIZATION OF CONTROLLER SETTINGS
// ============================================================================

describe('SaveManager — controllerSettings Persistence & Corruption Sanitization', () => {
  let mockStorage: MemoryStorage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists custom controllerSettings cleanly and clamps/sanitizes corrupt payloads', () => {
    const defaults = createDefaultSaveData();
    expect(defaults.controllerSettings).toEqual(DEFAULT_CONTROLLER_SETTINGS);

    const mgr = new SaveManager();
    const custom: ControllerSettings = {
      deadzone: 0.24,
      vibrationEnabled: false,
      twinStickAutoFire: true,
      touchOpacity: 0.85,
      touchScale: 1.2,
    };
    mgr.getData().controllerSettings = { ...custom };
    mgr.save();

    const reloaded = new SaveManager();
    expect(reloaded.getData().controllerSettings).toEqual(custom);

    // Out-of-bounds clamping
    const lowClamped = sanitizeSaveData({
      controllerSettings: {
        deadzone: 0.01,
        vibrationEnabled: 'nope',
        twinStickAutoFire: 123,
        touchOpacity: -0.5,
        touchScale: 0.2,
      },
    });
    expect(lowClamped.controllerSettings).toEqual({
      deadzone: 0.08,
      vibrationEnabled: DEFAULT_CONTROLLER_SETTINGS.vibrationEnabled,
      twinStickAutoFire: DEFAULT_CONTROLLER_SETTINGS.twinStickAutoFire,
      touchOpacity: 0.3,
      touchScale: 0.75,
    });

    const highClamped = sanitizeSaveData({
      controllerSettings: {
        deadzone: 0.99,
        vibrationEnabled: false,
        twinStickAutoFire: true,
        touchOpacity: 4.5,
        touchScale: 9.9,
      },
    });
    expect(highClamped.controllerSettings).toEqual({
      deadzone: 0.35,
      vibrationEnabled: false,
      twinStickAutoFire: true,
      touchOpacity: 1.0,
      touchScale: 1.35,
    });

    // NaN / null controllerSettings falls back safely
    mockStorage.setItem(
      SAVE_STORAGE_KEY,
      JSON.stringify({
        controllerSettings: { deadzone: null, touchOpacity: 'bad', touchScale: null },
      }),
    );
    const recovered = new SaveManager();
    expect(recovered.getData().controllerSettings).toEqual(DEFAULT_CONTROLLER_SETTINGS);
  });
});

// ============================================================================
// 9. GAMEPAD NAVIGATOR — SPATIAL 2D NAVIGATION & RANGE SLIDER ADJUSTMENT
// ============================================================================

describe('GamepadNavigator — 2D Spatial Navigation, Range Sliders, Tabs & Focus Cleanup', () => {
  it('navigates 2D grid geometrically, adjusts range sliders with input/change events, cycles tabs, and cleans up focus', () => {
    const root = new MockDOMElement('div');
    const modalBackdrop = new MockDOMElement('div');
    modalBackdrop.className = 'kf-modal-backdrop';
    const modal = new MockDOMElement('div');
    modal.className = 'kf-modal';
    modal.dataset.testid = 'options-modal';
    const body = new MockDOMElement('div');
    body.className = 'kf-modal-body kf-scroll';

    // Tab strip
    const tab1 = new MockDOMElement('button');
    tab1.dataset.gpTabGroup = 'main';
    tab1.dataset.gpTabActive = 'true';
    tab1.rect = { left: 20, top: 10, width: 100, height: 30 };

    const tab2 = new MockDOMElement('button');
    tab2.dataset.gpTabGroup = 'main';
    tab2.rect = { left: 130, top: 10, width: 100, height: 30 };

    // 2x2 Grid + Range Slider in modal body
    const btnTopLeft = new MockDOMElement('button');
    btnTopLeft.dataset.testid = 'btn-tl';
    btnTopLeft.rect = { left: 40, top: 80, width: 140, height: 40 };

    const btnTopRight = new MockDOMElement('button');
    btnTopRight.dataset.testid = 'btn-tr';
    btnTopRight.rect = { left: 240, top: 80, width: 140, height: 40 };

    const slider = new MockDOMElement('input');
    slider.type = 'range';
    slider.min = '0.08';
    slider.max = '0.35';
    slider.step = '0.01';
    slider.value = '0.16';
    slider.dataset.testid = 'opt-controller-deadzone';
    slider.rect = { left: 40, top: 160, width: 200, height: 24 };

    const btnBottomRight = new MockDOMElement('button');
    btnBottomRight.dataset.testid = 'btn-br';
    btnBottomRight.rect = { left: 240, top: 152, width: 140, height: 40 };

    body.append(btnTopLeft, btnTopRight, slider, btnBottomRight);
    modal.append(tab1, tab2, body);
    modalBackdrop.appendChild(modal);
    root.appendChild(modalBackdrop);

    const onCancel = vi.fn();
    const onPlayUiClick = vi.fn();
    const nav = new GamepadNavigator(root as unknown as HTMLElement, {
      onCancel,
      onPlayUiClick,
    });

    // Initial activation focuses first control in modal body (btnTopLeft)
    nav.update(createNeutralNav(), true);
    expect(nav.getFocusedElement()).toBe(btnTopLeft as unknown as HTMLElement);
    expect(btnTopLeft.classList.contains('kf-gp-focus')).toBe(true);

    // Move Right -> btnTopRight
    nav.update({ ...createNeutralNav(), moveX: 1 }, true);
    expect(nav.getFocusedElement()).toBe(btnTopRight as unknown as HTMLElement);
    expect(btnTopLeft.classList.contains('kf-gp-focus')).toBe(false);
    expect(btnTopRight.classList.contains('kf-gp-focus')).toBe(true);

    // Confirm clicks btnTopRight
    nav.update({ ...createNeutralNav(), confirm: true }, true);
    expect(btnTopRight.clickCount).toBe(1);
    expect(onPlayUiClick).toHaveBeenCalled();

    // Move Down -> btnBottomRight, then Left -> slider
    nav.update({ ...createNeutralNav(), moveY: 1 }, true);
    expect(nav.getFocusedElement()).toBe(btnBottomRight as unknown as HTMLElement);

    nav.update({ ...createNeutralNav(), moveX: -1 }, true);
    expect(nav.getFocusedElement()).toBe(slider as unknown as HTMLElement);

    // Left / Right on focused range slider steps value & dispatches 'input' + 'change'
    nav.update({ ...createNeutralNav(), moveX: 1 }, true);
    expect(slider.value).toBe('0.17');
    expect(slider.dispatchedEvents).toContain('input');
    expect(slider.dispatchedEvents).toContain('change');

    nav.update({ ...createNeutralNav(), moveX: -1 }, true);
    expect(slider.value).toBe('0.16');

    // Tab cycling clicks tab2
    nav.update({ ...createNeutralNav(), tabNext: true }, true);
    expect(tab2.clickCount).toBe(1);

    // Page scroll adjusts scrollTop on .kf-scroll
    nav.update({ ...createNeutralNav(), pageDown: true }, true);
    expect(body.scrollTop).toBe(150);

    // Cancel invokes onCancel
    nav.update({ ...createNeutralNav(), cancel: true }, true);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Deactivating removes .kf-gp-focus immediately
    nav.update(createNeutralNav(), false);
    expect(nav.getFocusedElement()).toBeNull();
    expect(slider.classList.contains('kf-gp-focus')).toBe(false);
  });

  it('navigates cleanly from a full-width button down to a 2-column split row directly beneath it', () => {
    const root = new MockDOMElement('div');
    const titleScreen = new MockDOMElement('div');
    titleScreen.className = 'kf-title-screen';

    const newRun = new MockDOMElement('button');
    newRun.dataset.testid = 'title-play-btn';
    newRun.rect = { left: 430, top: 380, width: 420, height: 38 };

    const optionsBtn = new MockDOMElement('button');
    optionsBtn.dataset.testid = 'title-options-btn';
    optionsBtn.rect = { left: 430, top: 428, width: 205, height: 36 };

    const keybindsBtn = new MockDOMElement('button');
    keybindsBtn.dataset.testid = 'title-keybinds-btn';
    keybindsBtn.rect = { left: 645, top: 428, width: 205, height: 36 };

    const loadPackBtn = new MockDOMElement('button');
    loadPackBtn.dataset.testid = 'load-custom-pack-btn';
    loadPackBtn.rect = { left: 430, top: 545, width: 420, height: 34 };

    titleScreen.append(newRun, optionsBtn, keybindsBtn, loadPackBtn);
    root.appendChild(titleScreen);

    const nav = new GamepadNavigator(root as unknown as HTMLElement);
    nav.update(createNeutralNav(), true);
    expect(nav.getFocusedElement()).toBe(newRun as unknown as HTMLElement);

    // D-pad Down from full-width NEW RUN MUST land on the split row directly below (not skip to loadPackBtn!)
    nav.update({ ...createNeutralNav(), moveY: 1 }, true);
    const landed = nav.getFocusedElement();
    expect(
      landed === (optionsBtn as unknown as HTMLElement) ||
        landed === (keybindsBtn as unknown as HTMLElement),
    ).toBe(true);

    // Horizontal move toggles between OPTIONS and KEYBINDS
    if (landed === (optionsBtn as unknown as HTMLElement)) {
      nav.update({ ...createNeutralNav(), moveX: 1 }, true);
      expect(nav.getFocusedElement()).toBe(keybindsBtn as unknown as HTMLElement);
    } else {
      nav.update({ ...createNeutralNav(), moveX: -1 }, true);
      expect(nav.getFocusedElement()).toBe(optionsBtn as unknown as HTMLElement);
    }

    // D-pad Down again reaches LOAD CUSTOM PACK
    nav.update({ ...createNeutralNav(), moveY: 1 }, true);
    expect(nav.getFocusedElement()).toBe(loadPackBtn as unknown as HTMLElement);
  });
});
