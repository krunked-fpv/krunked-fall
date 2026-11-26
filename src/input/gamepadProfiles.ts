// ============================================================================
// KRUNKEDFALL — Gamepad Profile Detection, Adaptive Mapping & Haptic Engine
// ============================================================================
// Supports Xbox, PlayStation (DualSense/DualShock), Nintendo (Pro/Joy-Con),
// Steam Deck, Tesla browser / controllers, and generic USB/Bluetooth HID
// gamepads across both W3C "standard" and non-standard / DirectInput / Linux
// evdev layouts. 100% safe in headless Node environments.

import type {
  ControllerSettings,
  GamepadProfileKind,
  InputDeviceKind,
} from '../contracts/index.js';

export const DEFAULT_CONTROLLER_SETTINGS: Readonly<ControllerSettings> = {
  deadzone: 0.16,
  vibrationEnabled: true,
  twinStickAutoFire: false,
  touchOpacity: 0.72,
  touchScale: 1.0,
};

export interface GamepadGlyphSet {
  move: string;
  aim: string;
  fire: string;
  ability: string;
  power: string;
  swap: string;
  interact: string;
  vent: string;
  workbench: string;
  pause: string;
  confirm: string;
  cancel: string;
  tabPrev: string;
  tabNext: string;
}

export interface NormalizedGamepadState {
  index: number;
  id: string;
  profile: GamepadProfileKind;
  mapping: string;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimMagnitude: number;
  dpadX: -1 | 0 | 1;
  dpadY: -1 | 0 | 1;
  fireHeld: boolean;
  fireValue: number;
  abilityHeld: boolean;
  abilityValue: number;
  powerHeld: boolean;
  swapHeld: boolean;
  interactHeld: boolean;
  ventHeld: boolean;
  confirmHeld: boolean;
  cancelHeld: boolean;
  tabPrevHeld: boolean;
  tabNextHeld: boolean;
  workbenchHeld: boolean;
  pauseHeld: boolean;
  hasActivity: boolean;
}

const TESLA_UA_RE = /Tesla|QtCarBrowser/i;
const STEAM_DECK_RE = /steam\s*deck|steam\s*virtual|valve|(?:^|[^0-9a-f])28de(?:$|[^0-9a-f])/i;
const PLAYSTATION_RE =
  /playstation|dualsense|dualshock|sony|(?:^|[^0-9a-f])054c(?:$|[^0-9a-f])|\bps[345]\b/i;
const NINTENDO_RE =
  /nintendo|switch|joy-?con|pro\s*controller|(?:^|[^0-9a-f])057e(?:$|[^0-9a-f])/i;
const XBOX_RE =
  /xbox|x-?box|xinput|microsoft|(?:^|[^0-9a-f])045e(?:$|[^0-9a-f])|8bitdo[\s_-]*x|8bitdo.*xinput/i;
const SONY_WIRELESS_RE = /wireless\s*controller/i;
const TESLA_PAD_RE = /tesla/i;

const BUTTON_PRESS_THRESHOLD = 0.35;

const GLYPH_TABLES: Readonly<Record<GamepadProfileKind, Readonly<GamepadGlyphSet>>> = {
  xbox: {
    move: 'LS',
    aim: 'RS',
    fire: 'RT',
    ability: 'LT',
    power: 'RB',
    swap: 'X',
    interact: 'A',
    vent: 'B',
    workbench: 'VIEW',
    pause: 'MENU',
    confirm: 'A',
    cancel: 'B',
    tabPrev: 'LB',
    tabNext: 'RB',
  },
  playstation: {
    move: 'LS',
    aim: 'RS',
    fire: 'R2',
    ability: 'L2',
    power: 'R1',
    swap: '□',
    interact: '✕',
    vent: '○',
    workbench: 'SHARE',
    pause: 'OPT',
    confirm: '✕',
    cancel: '○',
    tabPrev: 'L1',
    tabNext: 'R1',
  },
  nintendo: {
    move: 'LS',
    aim: 'RS',
    fire: 'ZR',
    ability: 'ZL',
    power: 'R',
    swap: 'Y',
    interact: 'B',
    vent: 'A',
    workbench: '-',
    pause: '+',
    confirm: 'B',
    cancel: 'A',
    tabPrev: 'L',
    tabNext: 'R',
  },
  steamdeck: {
    move: 'LS',
    aim: 'RS',
    fire: 'R2',
    ability: 'L2',
    power: 'R1',
    swap: 'X',
    interact: 'A',
    vent: 'B',
    workbench: 'VIEW',
    pause: 'MENU',
    confirm: 'A',
    cancel: 'B',
    tabPrev: 'L1',
    tabNext: 'R1',
  },
  tesla: {
    move: 'LS',
    aim: 'RS',
    fire: 'RT',
    ability: 'LT',
    power: 'RB',
    swap: 'X',
    interact: 'A',
    vent: 'B',
    workbench: 'SEL',
    pause: 'START',
    confirm: 'A',
    cancel: 'B',
    tabPrev: 'LB',
    tabNext: 'RB',
  },
  generic: {
    move: 'LS',
    aim: 'RS',
    fire: 'RT',
    ability: 'LT',
    power: 'RB',
    swap: 'X',
    interact: 'A',
    vent: 'B',
    workbench: 'SEL',
    pause: 'START',
    confirm: 'A',
    cancel: 'B',
    tabPrev: 'LB',
    tabNext: 'RB',
  },
};

const TOUCH_GLYPHS: Readonly<GamepadGlyphSet> = {
  move: 'L-STICK',
  aim: 'R-STICK',
  fire: 'R-STICK',
  ability: 'ABIL',
  power: 'PWR',
  swap: 'SWAP',
  interact: 'USE',
  vent: 'VENT',
  workbench: 'BENCH',
  pause: 'PAUSE',
  confirm: 'TAP',
  cancel: 'BACK',
  tabPrev: 'PREV',
  tabNext: 'NEXT',
};

function formatPromptKeyCode(code: string): string {
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

export function detectTeslaBrowser(userAgent?: string): boolean {
  const ua =
    typeof userAgent === 'string'
      ? userAgent
      : typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : '';
  return TESLA_UA_RE.test(ua);
}

export function detectGamepadProfile(
  id: string,
  isTeslaBrowser?: boolean,
): GamepadProfileKind {
  const raw = typeof id === 'string' ? id.trim() : '';
  if (raw.length > 0) {
    if (STEAM_DECK_RE.test(raw)) return 'steamdeck';
    if (PLAYSTATION_RE.test(raw)) return 'playstation';
    if (NINTENDO_RE.test(raw)) return 'nintendo';
    if (XBOX_RE.test(raw)) return 'xbox';
    if (SONY_WIRELESS_RE.test(raw)) return 'playstation';
    if (TESLA_PAD_RE.test(raw)) return 'tesla';
  }
  const inTesla =
    typeof isTeslaBrowser === 'boolean' ? isTeslaBrowser : detectTeslaBrowser();
  if (inTesla) return 'tesla';
  return 'generic';
}

export function getGamepadGlyphs(profile: GamepadProfileKind): GamepadGlyphSet {
  const table = GLYPH_TABLES[profile] ?? GLYPH_TABLES.generic;
  return { ...table };
}

export function getDisplayPrompts(
  device: InputDeviceKind,
  profile: GamepadProfileKind,
  keybinds?: Record<string, string>,
): GamepadGlyphSet {
  if (device === 'gamepad') {
    return getGamepadGlyphs(profile);
  }
  if (device === 'touch') {
    return { ...TOUCH_GLYPHS };
  }

  const moveUp = keybinds?.moveUp ?? 'KeyW';
  const moveLeft = keybinds?.moveLeft ?? 'KeyA';
  const moveDown = keybinds?.moveDown ?? 'KeyS';
  const moveRight = keybinds?.moveRight ?? 'KeyD';
  const isDefaultWasd =
    moveUp === 'KeyW' &&
    moveLeft === 'KeyA' &&
    moveDown === 'KeyS' &&
    moveRight === 'KeyD';

  const moveLabel = isDefaultWasd
    ? 'WASD'
    : `${formatPromptKeyCode(moveUp)}/${formatPromptKeyCode(moveLeft)}/${formatPromptKeyCode(moveDown)}/${formatPromptKeyCode(moveRight)}`;

  return {
    move: moveLabel,
    aim: 'MOUSE',
    fire: 'LMB',
    ability: formatPromptKeyCode(keybinds?.ability ?? 'Space'),
    power: formatPromptKeyCode(keybinds?.power ?? 'KeyQ'),
    swap: formatPromptKeyCode(keybinds?.swapWeapon ?? 'KeyE'),
    interact: formatPromptKeyCode(keybinds?.interact ?? 'KeyE'),
    vent: formatPromptKeyCode(keybinds?.reloadOrVent ?? 'KeyR'),
    workbench: formatPromptKeyCode(keybinds?.workbench ?? 'Tab'),
    pause: formatPromptKeyCode(keybinds?.pause ?? 'Escape'),
    confirm: 'ENTER',
    cancel: 'ESC',
    tabPrev: 'Q',
    tabNext: 'E',
  };
}

/**
 * True scaled radial deadzone with smooth exponential response curve,
 * clamped strictly to the unit circle.
 */
export function applyRadialDeadzone(
  x: number,
  y: number,
  deadzone: number,
  curve = 1.35,
): { x: number; y: number; magnitude: number } {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const dz = Math.max(0, Math.min(0.95, Number.isFinite(deadzone) ? deadzone : 0.16));

  const rawLen = Math.hypot(sx, sy);
  if (rawLen <= dz || rawLen === 0) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const clampedLen = rawLen > 1 ? 1 : rawLen;
  const linear = (clampedLen - dz) / (1 - dz);
  const exp = Number.isFinite(curve) && curve > 0 ? curve : 1;
  const magnitude = Math.min(1, Math.max(0, Math.pow(linear, exp)));
  const invLen = 1 / rawLen;

  return {
    x: sx * invLen * magnitude,
    y: sy * invLen * magnitude,
    magnitude,
  };
}

function readAxis(pad: Gamepad, idx: number): number {
  const axes = pad.axes;
  if (!axes || idx < 0 || idx >= axes.length) return 0;
  const v = axes[idx];
  return Number.isFinite(v) ? v : 0;
}

function readButton(pad: Gamepad, idx: number): { pressed: boolean; value: number } {
  const buttons = pad.buttons;
  if (!buttons || idx < 0 || idx >= buttons.length) {
    return { pressed: false, value: 0 };
  }
  const b = buttons[idx];
  if (!b) return { pressed: false, value: 0 };
  const val = Number.isFinite(b.value)
    ? Math.max(0, Math.min(1, b.value))
    : b.pressed
      ? 1
      : 0;
  return {
    pressed: Boolean(b.pressed || val > BUTTON_PRESS_THRESHOLD),
    value: val,
  };
}

/**
 * Interprets a pair of analog trigger axes supporting BOTH `-1..+1` (resting at -1,
 * common on Linux evdev / DirectInput / Tesla) AND `0..+1` (resting at 0) ranges
 * with zero false positives when idle.
 */
function normalizeTriggerAxisPair(
  leftRaw: number,
  rightRaw: number,
): { left: number; right: number } {
  const usesSignedRange = leftRaw < -0.5 || rightRaw < -0.5;
  if (usesSignedRange) {
    return {
      left: Math.max(0, Math.min(1, (leftRaw + 1) * 0.5)),
      right: Math.max(0, Math.min(1, (rightRaw + 1) * 0.5)),
    };
  }
  return {
    left: Math.max(0, Math.min(1, leftRaw)),
    right: Math.max(0, Math.min(1, rightRaw)),
  };
}

/**
 * Translates a Chrome/DirectInput HID POV hat-switch axis (typically axis 9)
 * into discrete D-pad coordinates. Neutral (3.2857 or 0.0) maps to (0, 0).
 */
function parseHatSwitchAxis(value: number): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  if (!Number.isFinite(value) || Math.abs(value) > 1.1) {
    return { x: 0, y: 0 };
  }
  // 8-way discrete hat angles: -1 + k * (2 / 7) for k = 0..7
  // Note: 0.0 is 0.143 away from both SE (-0.143) and S (+0.143), so tolerance 0.10 ignores unused 0.0
  const steps: ReadonlyArray<readonly [number, -1 | 0 | 1, -1 | 0 | 1]> = [
    [-1.0, 0, -1], // N
    [-5 / 7, 1, -1], // NE
    [-3 / 7, 1, 0], // E
    [-1 / 7, 1, 1], // SE
    [1 / 7, 0, 1], // S
    [3 / 7, -1, 1], // SW
    [5 / 7, -1, 0], // W
    [1.0, -1, -1], // NW
  ];
  for (let i = 0; i < steps.length; i++) {
    if (Math.abs(value - steps[i][0]) <= 0.1) {
      return { x: steps[i][1], y: steps[i][2] };
    }
  }
  return { x: 0, y: 0 };
}

export function isRealGamepad(pad: Gamepad | null | undefined): pad is Gamepad {
  if (!pad || !pad.connected) return false;
  const btnLen = pad.buttons ? pad.buttons.length : 0;
  const axisLen = pad.axes ? pad.axes.length : 0;
  return btnLen > 0 || axisLen > 0;
}

export function countConnectedGamepads(
  pads: ArrayLike<Gamepad | null> | null | undefined,
): number {
  if (!pads) return 0;
  let realCount = 0;
  let totalConnected = 0;
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (!gp || !gp.connected) continue;
    totalConnected++;
    if (isRealGamepad(gp)) realCount++;
  }
  return realCount > 0 ? realCount : totalConnected;
}

export function readNormalizedGamepad(
  pad: Gamepad,
  deadzone: number,
  isTeslaBrowser?: boolean,
): NormalizedGamepadState {
  const id = typeof pad.id === 'string' ? pad.id : '';
  const mapping = typeof pad.mapping === 'string' ? pad.mapping : '';
  const profile = detectGamepadProfile(id, isTeslaBrowser);
  const axisCount = pad.axes ? pad.axes.length : 0;
  const buttonCount = pad.buttons ? pad.buttons.length : 0;

  // Treat explicit 'standard' mapping, or minimal 4-axis/16-button mocks without mapping, as standard.
  const isStandard =
    mapping === 'standard' ||
    (pad.mapping === undefined && id === '' && axisCount <= 4 && buttonCount >= 16);

  // 1. Left Stick (universal axes[0], axes[1])
  const leftStick = applyRadialDeadzone(readAxis(pad, 0), readAxis(pad, 1), deadzone);

  // 2. Right Stick & Trigger Axes
  let rawAimX = 0;
  let rawAimY = 0;
  let axisLt = 0;
  let axisRt = 0;
  let usesLinuxXpadTriggerAxes = false;

  if (isStandard || axisCount <= 4) {
    rawAimX = readAxis(pad, 2);
    rawAimY = readAxis(pad, 3);
  } else {
    const a2 = readAxis(pad, 2);
    const a3 = readAxis(pad, 3);
    const a4 = readAxis(pad, 4);
    const a5 = readAxis(pad, 5);

    const isDs4DirectInput =
      (profile === 'playstation' && axisCount >= 10) ||
      (a3 < -0.5 && a4 < -0.5 && Math.abs(a2) <= 0.9 && Math.abs(a5) <= 0.9);

    const isLinuxEvdev =
      !isDs4DirectInput &&
      (a2 < -0.5 ||
        a5 < -0.5 ||
        (axisCount === 8 && buttonCount <= 11));

    if (isDs4DirectInput) {
      // DirectInput DualShock / DualSense HID: axes[2]=RX, axes[5]=RY, axes[3]=L2, axes[4]=R2
      rawAimX = a2;
      rawAimY = a5;
      const trig = normalizeTriggerAxisPair(a3, a4);
      axisLt = trig.left;
      axisRt = trig.right;
    } else if (isLinuxEvdev) {
      // Linux xpad / evdev / Tesla QtCarBrowser: axes[2]=LT, axes[3]=RX, axes[4]=RY, axes[5]=RT
      rawAimX = a3;
      rawAimY = a4;
      const trig = normalizeTriggerAxisPair(a2, a5);
      axisLt = trig.left;
      axisRt = trig.right;
      usesLinuxXpadTriggerAxes = true;
    } else {
      // Fallback DirectInput / Generic 6+ axis pad: axes[2]=RX, axes[3]=RY, axes[4]=LT, axes[5]=RT
      rawAimX = a2;
      rawAimY = a3;
      if (axisCount >= 6) {
        const trig = normalizeTriggerAxisPair(a4, a5);
        axisLt = trig.left;
        axisRt = trig.right;
      }
    }
  }

  const rightStick = applyRadialDeadzone(rawAimX, rawAimY, deadzone);

  // 3. D-Pad (standard buttons 12..15 + non-standard axes 6/7 + axis 9 hat-switch)
  let dpadX: -1 | 0 | 1 = 0;
  let dpadY: -1 | 0 | 1 = 0;

  if (readButton(pad, 14).pressed) dpadX = -1;
  else if (readButton(pad, 15).pressed) dpadX = 1;
  if (readButton(pad, 12).pressed) dpadY = -1;
  else if (readButton(pad, 13).pressed) dpadY = 1;

  if (!isStandard) {
    if (dpadX === 0 && dpadY === 0 && axisCount >= 10) {
      const hat = parseHatSwitchAxis(readAxis(pad, 9));
      dpadX = hat.x;
      dpadY = hat.y;
    }
    if (dpadX === 0 && dpadY === 0 && axisCount >= 8) {
      const hx = readAxis(pad, 6);
      const hy = readAxis(pad, 7);
      if (hx < -0.5) dpadX = -1;
      else if (hx > 0.5) dpadX = 1;
      if (hy < -0.5) dpadY = -1;
      else if (hy > 0.5) dpadY = 1;
    }
  }

  // 4. Face Buttons, Bumpers, Triggers, Center Buttons
  // Keep physical bottom = confirm/interact, east = cancel/vent, west = swap, north = power.
  const isRawDs4FaceOrder =
    !isStandard && profile === 'playstation' && axisCount >= 10 && buttonCount >= 14;

  const btnBottom = isRawDs4FaceOrder ? readButton(pad, 1) : readButton(pad, 0);
  const btnEast = isRawDs4FaceOrder ? readButton(pad, 2) : readButton(pad, 1);
  const btnWest = isRawDs4FaceOrder ? readButton(pad, 0) : readButton(pad, 2);
  const btnNorth = readButton(pad, 3);

  const btnLb = readButton(pad, 4);
  const btnRb = readButton(pad, 5);

  // Linux xpad 11-button raw layout puts Back/Start on 6/7 while triggers live on axes 2/5
  const isRawLinux11Buttons =
    !isStandard && usesLinuxXpadTriggerAxes && buttonCount === 11;

  const btnLt = isRawLinux11Buttons ? { pressed: false, value: 0 } : readButton(pad, 6);
  const btnRt = isRawLinux11Buttons ? { pressed: false, value: 0 } : readButton(pad, 7);
  const btnSelect = isRawLinux11Buttons ? readButton(pad, 6) : readButton(pad, 8);
  const btnStart = isRawLinux11Buttons ? readButton(pad, 7) : readButton(pad, 9);

  const abilityValue = Math.max(btnLt.value, axisLt);
  const fireValue = Math.max(btnRt.value, axisRt);
  const abilityHeld = btnLt.pressed || abilityValue > BUTTON_PRESS_THRESHOLD;
  const fireHeld = btnRt.pressed || fireValue > BUTTON_PRESS_THRESHOLD;

  const confirmHeld = btnBottom.pressed;
  const cancelHeld = btnEast.pressed;
  const interactHeld = btnBottom.pressed;
  const ventHeld = btnEast.pressed;
  const swapHeld = btnWest.pressed;
  const powerHeld = btnNorth.pressed || btnRb.pressed;
  const tabPrevHeld = btnLb.pressed;
  const tabNextHeld = btnRb.pressed;
  const workbenchHeld = btnSelect.pressed;
  const pauseHeld = btnStart.pressed;

  let anyRawButton = false;
  if (pad.buttons) {
    for (let i = 0; i < pad.buttons.length; i++) {
      if (readButton(pad, i).pressed) {
        anyRawButton = true;
        break;
      }
    }
  }

  const hasActivity =
    leftStick.magnitude > 0 ||
    rightStick.magnitude > 0 ||
    dpadX !== 0 ||
    dpadY !== 0 ||
    fireHeld ||
    abilityHeld ||
    powerHeld ||
    swapHeld ||
    interactHeld ||
    ventHeld ||
    workbenchHeld ||
    pauseHeld ||
    anyRawButton;

  return {
    index: typeof pad.index === 'number' ? pad.index : 0,
    id,
    profile,
    mapping,
    moveX: leftStick.x,
    moveY: leftStick.y,
    aimX: rightStick.x,
    aimY: rightStick.y,
    aimMagnitude: rightStick.magnitude,
    dpadX,
    dpadY,
    fireHeld,
    fireValue,
    abilityHeld,
    abilityValue,
    powerHeld,
    swapHeld,
    interactHeld,
    ventHeld,
    confirmHeld,
    cancelHeld,
    tabPrevHeld,
    tabNextHeld,
    workbenchHeld,
    pauseHeld,
    hasActivity,
  };
}

/**
 * Selects the active gamepad from `navigator.getGamepads()`:
 * 1. Whichever connected real gamepad currently has live input activity
 *    (keeping preferredIndex if it is also active to avoid flicker).
 * 2. Else preferredIndex if still connected.
 * 3. Else the first connected real gamepad (skipping phantom 0-button/0-axis devices
 *    whenever a real gamepad exists).
 */
export function selectActiveGamepad(
  pads: ArrayLike<Gamepad | null> | null | undefined,
  preferredIndex: number,
  deadzone: number,
  isTeslaBrowser?: boolean,
): Gamepad | null {
  if (!pads || pads.length === 0) return null;

  const realCandidates: Array<{ pad: Gamepad; slot: number }> = [];
  const allCandidates: Array<{ pad: Gamepad; slot: number }> = [];

  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (!gp || !gp.connected) continue;
    allCandidates.push({ pad: gp, slot: i });
    if (isRealGamepad(gp)) {
      realCandidates.push({ pad: gp, slot: i });
    }
  }

  const pool = realCandidates.length > 0 ? realCandidates : allCandidates;
  if (pool.length === 0) return null;

  const matchesPreferred = (entry: { pad: Gamepad; slot: number }): boolean => {
    if (preferredIndex < 0) return false;
    const idx = typeof entry.pad.index === 'number' ? entry.pad.index : entry.slot;
    return idx === preferredIndex || entry.slot === preferredIndex;
  };

  let preferredEntry: { pad: Gamepad; slot: number } | null = null;
  let firstActive: Gamepad | null = null;

  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    const isPref = matchesPreferred(entry);
    if (isPref) preferredEntry = entry;

    const norm = readNormalizedGamepad(entry.pad, deadzone, isTeslaBrowser);
    if (norm.hasActivity) {
      if (isPref) {
        return entry.pad;
      }
      if (!firstActive) {
        firstActive = entry.pad;
      }
    }
  }

  if (firstActive) return firstActive;
  if (preferredEntry) return preferredEntry.pad;
  return pool[0].pad;
}

interface RumbleCapableGamepad {
  vibrationActuator?: {
    type?: string;
    playEffect?: (
      type: string,
      params: {
        startDelay?: number;
        duration: number;
        weakMagnitude: number;
        strongMagnitude: number;
      },
    ) => Promise<unknown> | void;
  };
  hapticActuators?: ArrayLike<{
    pulse?: (value: number, duration: number) => Promise<unknown> | void;
  }>;
}

/**
 * Safe dual-rumble / hapticActuators wrapper. Completely no-ops in headless
 * environments or unsupported browsers without ever rejecting unhandled promises.
 */
export function triggerGamepadRumble(
  pad: Gamepad | null,
  intensity: number,
  durationMs: number,
  weakScale = 0.65,
): void {
  if (!pad || !pad.connected) return;
  if (!Number.isFinite(intensity) || !Number.isFinite(durationMs)) return;

  const strong = Math.max(0, Math.min(1, intensity));
  const duration = Math.max(0, Math.min(1500, Math.round(durationMs)));
  if (strong <= 0.01 || duration <= 0) return;

  const weakFactor = Number.isFinite(weakScale) ? Math.max(0, Math.min(1, weakScale)) : 0.65;
  const weak = Math.max(0, Math.min(1, strong * weakFactor));

  const rPad = pad as unknown as RumbleCapableGamepad;
  try {
    if (rPad.vibrationActuator && typeof rPad.vibrationActuator.playEffect === 'function') {
      const res = rPad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude: weak,
        strongMagnitude: strong,
      });
      if (res && typeof (res as Promise<unknown>).catch === 'function') {
        (res as Promise<unknown>).catch(() => {});
      }
      return;
    }

    if (rPad.hapticActuators && rPad.hapticActuators.length > 0) {
      const actuator = rPad.hapticActuators[0];
      if (actuator && typeof actuator.pulse === 'function') {
        const res = actuator.pulse(strong, duration);
        if (res && typeof (res as Promise<unknown>).catch === 'function') {
          (res as Promise<unknown>).catch(() => {});
        }
      }
    }
  } catch {
    // Ignore unsupported / blocked vibration calls gracefully
  }
}
