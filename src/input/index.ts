// ============================================================================
// KRUNKEDFALL — Input Subsystem Public Barrel
// ============================================================================

export {
  InputManager,
  DEFAULT_KEYBINDS,
  KEYBIND_ACTIONS,
  formatKeyCode,
  type KeybindAction,
  type KeybindMeta,
  type UiInputActions,
  type VirtualTouchInput,
  type TouchActionKind,
  type ScreenToWorldFn,
  type WorldToScreenFn,
  type AimScreenPos,
} from './inputManager.js';

export {
  DEFAULT_CONTROLLER_SETTINGS,
  detectTeslaBrowser,
  detectGamepadProfile,
  getGamepadGlyphs,
  getDisplayPrompts,
  applyRadialDeadzone,
  readNormalizedGamepad,
  selectActiveGamepad,
  countConnectedGamepads,
  isRealGamepad,
  triggerGamepadRumble,
  type GamepadGlyphSet,
  type NormalizedGamepadState,
} from './gamepadProfiles.js';

export {
  TouchDetector,
  SYNTHETIC_MOUSE_GUARD_MS,
} from './touchDetector.js';
