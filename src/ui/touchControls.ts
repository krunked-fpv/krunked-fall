// ============================================================================
// KRUNKEDFALL — Translucent Dual-Stick Virtual Touch Controls
// ============================================================================
// Ergonomic multi-touch twin-stick overlay designed for mobile phones, tablets,
// and Tesla infotainment touchscreens:
//   - STRICTLY hidden (`display: none`) unless explicitly enabled by UiManager
//     (only when mobile/touch is sensed AND in active non-modal gameplay).
//   - Left Translucent Game Stick: floating origin movement inside bottom-left
//     zone, 0.14 radial deadzone, smooth normalized moveX/moveY (-1..1).
//   - Right Translucent Game Stick: floating origin twin-stick aim + auto-fire
//     past 0.36 radial deflection with crimson/amber firing feedback.
//   - Translucent Action Arc Buttons around the right stick:
//       ABILITY, POWER (with conic charge ring & ready pulse), SWAP (W1/W2),
//       and contextual USE / VENT (highlights near stations/portals/pickups or
//       when active weapon overheat exceeds 35%).
//   - True PointerEvent multi-touch tracked per pointerId + safe blur/visibility
//     and hide-time release so virtual sticks never get stuck.
//   - Zero innerHTML churn inside update().

import type { SimState } from '../contracts/index.js';

export interface TouchControlsInputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimActive: boolean;
  fireHeld: boolean;
}

export type TouchActionKind = 'ability' | 'power' | 'swap' | 'interact' | 'vent';

export interface TouchControlsCallbacks {
  onTouchInput(input: {
    moveX: number;
    moveY: number;
    aimX: number;
    aimY: number;
    aimActive: boolean;
    fireHeld: boolean;
  }): void;
  onTouchAction(action: 'ability' | 'power' | 'swap' | 'interact' | 'vent'): void;
  onTouchDetected(): void;
  onPlayUiClick(): void;
}

interface StickRuntime {
  readonly side: 'left' | 'right';
  readonly zoneEl: HTMLElement;
  readonly baseEl: HTMLElement;
  readonly knobEl: HTMLElement;
  pointerId: number | null;
  originX: number;
  originY: number;
  maxTravel: number;
  floatOffsetX: number;
  floatOffsetY: number;
  outX: number;
  outY: number;
  rawMagnitude: number;
  firing: boolean;
}

interface ButtonRuntime {
  readonly el: HTMLButtonElement;
  readonly labelEl: HTMLElement;
  readonly subEl: HTMLElement;
  pointerId: number | null;
  getAction: () => TouchActionKind;
}

const LEFT_DEADZONE = 0.14;
const RIGHT_AIM_DEADZONE = 0.14;
const RIGHT_FIRE_THRESHOLD = 0.36;
const DEFAULT_FALLBACK_TRAVEL = 44;
const MIN_TOUCH_OPACITY = 0.3;
const MAX_TOUCH_OPACITY = 1.0;
const MIN_TOUCH_SCALE = 0.75;
const MAX_TOUCH_SCALE = 1.35;

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function hubStationShortTag(id: SimState['hubInteractables'][number]['id']): string {
  switch (id) {
    case 'loki':
      return 'LOKI';
    case 'jotunn_matic':
      return 'SKIN';
    case 'skill_tree':
      return 'TREE';
    case 'bifrost':
      return 'MAP';
    case 'modifiers':
      return 'MODS';
    case 'weapondex':
      return 'WEPS';
    case 'enemydex':
      return 'FOES';
    case 'training_dummy':
      return 'TEST';
    default:
      return 'OPEN';
  }
}

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly cb: TouchControlsCallbacks;

  private readonly leftStick: StickRuntime;
  private readonly rightStick: StickRuntime;
  private readonly abilityBtn: ButtonRuntime;
  private readonly powerBtn: ButtonRuntime;
  private readonly swapBtn: ButtonRuntime;
  private readonly interactBtn: ButtonRuntime;
  private readonly allButtons: readonly ButtonRuntime[];

  private visible = false;
  private disposed = false;
  private contextualAction: 'interact' | 'vent' = 'interact';

  // Cached values to guarantee zero redundant DOM writes at 60/120 FPS
  private lastOpacityStr = '';
  private lastScaleStr = '';
  private lastScaleNum = 1.0;
  private lastAbilityLabel = '';
  private lastAbilitySub = '';
  private lastAbilityState = '';
  private lastPowerSub = '';
  private lastPowerPct = '';
  private lastPowerState = '';
  private lastSwapSub = '';
  private lastSwapHasSecondary = false;
  private lastInteractLabel = '';
  private lastInteractSub = '';
  private lastInteractState = '';

  // Deduplicate same-event handling between zone/base/window listeners
  private lastHandledDownEvent: Event | null = null;
  private lastHandledMoveEvent: Event | null = null;
  private lastHandledEndEvent: Event | null = null;

  constructor(parent: HTMLElement, callbacks: TouchControlsCallbacks) {
    this.cb = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'kf-touch-layer';
    this.root.dataset.testid = 'touch-controls-layer';
    this.root.style.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.addEventListener('contextmenu', this.handleContextMenu);

    // ---- LEFT TRANSLUCENT GAME STICK (MOVEMENT) ----
    this.leftStick = this.createStick('left', 'MOVE');
    this.root.appendChild(this.leftStick.zoneEl);

    // ---- RIGHT CLUSTER (TWIN-STICK AIM + AUTO-FIRE + ACTION ARC) ----
    const rightCluster = document.createElement('div');
    rightCluster.className = 'kf-touch-right-cluster';

    this.rightStick = this.createStick('right', 'AIM');
    rightCluster.appendChild(this.rightStick.zoneEl);

    this.abilityBtn = this.createActionButton(
      'kf-touch-btn-ability',
      'touch-btn-ability',
      'ABIL',
      'RDY',
      () => 'ability',
    );
    this.powerBtn = this.createActionButton(
      'kf-touch-btn-power',
      'touch-btn-power',
      'PWR',
      '0%',
      () => 'power',
    );
    this.swapBtn = this.createActionButton(
      'kf-touch-btn-swap',
      'touch-btn-swap',
      'SWAP',
      'W1',
      () => 'swap',
    );
    this.interactBtn = this.createActionButton(
      'kf-touch-btn-interact',
      'touch-btn-interact',
      'USE',
      '---',
      () => this.contextualAction,
    );

    this.allButtons = [
      this.abilityBtn,
      this.powerBtn,
      this.swapBtn,
      this.interactBtn,
    ];

    rightCluster.append(
      this.abilityBtn.el,
      this.powerBtn.el,
      this.interactBtn.el,
      this.swapBtn.el,
    );
    this.root.appendChild(rightCluster);
    parent.appendChild(this.root);

    // Global window listeners keep drags alive outside bounds & release safely
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', this.handleWindowPointerMove, {
        passive: false,
      });
      window.addEventListener('pointerup', this.handleWindowPointerEnd);
      window.addEventListener('pointercancel', this.handleWindowPointerEnd);
      window.addEventListener('blur', this.handleWindowBlur);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public setVisible(visible: boolean): void {
    if (this.disposed) return;
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (!visible) {
      this.releaseAllInputs(true);
    }
  }

  public update(
    state: SimState,
    settings: { touchOpacity: number; touchScale: number },
  ): void {
    if (this.disposed) return;

    const clampedOpacity = clamp(
      Number.isFinite(settings.touchOpacity) ? settings.touchOpacity : 0.72,
      MIN_TOUCH_OPACITY,
      MAX_TOUCH_OPACITY,
    );
    const clampedScale = clamp(
      Number.isFinite(settings.touchScale) ? settings.touchScale : 1.0,
      MIN_TOUCH_SCALE,
      MAX_TOUCH_SCALE,
    );
    this.lastScaleNum = clampedScale;

    const opacityStr = clampedOpacity.toFixed(2);
    if (opacityStr !== this.lastOpacityStr) {
      this.lastOpacityStr = opacityStr;
      this.root.style.setProperty('--kf-touch-opacity', opacityStr);
    }

    const scaleStr = clampedScale.toFixed(2);
    if (scaleStr !== this.lastScaleStr) {
      this.lastScaleStr = scaleStr;
      this.root.style.setProperty('--kf-touch-scale', scaleStr);
    }

    if (!this.visible) return;

    const p = state.player;

    // 1. ABILITY button (charge count & cooldown state)
    const abilActive = p.abilityActiveTicks > 0;
    const abilReady = p.abilityCharges > 0;
    const abilLabel = 'ABIL';
    const abilSub = abilActive
      ? `${(p.abilityActiveTicks / 60).toFixed(1)}s`
      : abilReady
        ? p.abilityMaxCharges > 1
          ? `${p.abilityCharges}/${p.abilityMaxCharges}`
          : 'RDY'
        : `${(p.abilityCooldown / 60).toFixed(1)}s`;
    const abilState = abilActive ? 'active' : abilReady ? 'ready' : 'cooling';

    if (abilLabel !== this.lastAbilityLabel) {
      this.lastAbilityLabel = abilLabel;
      this.abilityBtn.labelEl.textContent = abilLabel;
    }
    if (abilSub !== this.lastAbilitySub) {
      this.lastAbilitySub = abilSub;
      this.abilityBtn.subEl.textContent = abilSub;
    }
    if (abilState !== this.lastAbilityState) {
      this.lastAbilityState = abilState;
      this.abilityBtn.el.classList.toggle('active', abilActive);
      this.abilityBtn.el.classList.toggle('ready', abilReady && !abilActive);
      this.abilityBtn.el.classList.toggle('cooling', !abilReady && !abilActive);
    }

    // 2. POWER button (charge % + pulsing ready glow)
    const pwrRatio = clamp(
      p.powerCharge / Math.max(1, p.powerChargeRequired),
      0,
      1,
    );
    const pwrReady = p.powerCharge >= p.powerChargeRequired;
    const pwrActive = p.powerActiveTicks > 0;
    const pwrPctStr = `${Math.round(pwrRatio * 100)}%`;
    const pwrSub = pwrActive
      ? `${(p.powerActiveTicks / 60).toFixed(1)}s`
      : pwrReady
        ? 'READY'
        : pwrPctStr;
    const pwrState = pwrActive ? 'active' : pwrReady ? 'ready' : 'charging';

    if (pwrPctStr !== this.lastPowerPct) {
      this.lastPowerPct = pwrPctStr;
      this.powerBtn.el.style.setProperty('--kf-pwr-pct', pwrPctStr);
    }
    if (pwrSub !== this.lastPowerSub) {
      this.lastPowerSub = pwrSub;
      this.powerBtn.subEl.textContent = pwrSub;
    }
    if (pwrState !== this.lastPowerState) {
      this.lastPowerState = pwrState;
      this.powerBtn.el.classList.toggle('active', pwrActive);
      this.powerBtn.el.classList.toggle('ready', pwrReady || pwrActive);
    }

    // 3. SWAP button (active slot W1 / W2)
    const swapSub = p.activeSlot === 0 ? 'W1' : 'W2';
    const hasSecondary = p.weapons[1] !== null;
    if (swapSub !== this.lastSwapSub) {
      this.lastSwapSub = swapSub;
      this.swapBtn.subEl.textContent = swapSub;
    }
    if (hasSecondary !== this.lastSwapHasSecondary) {
      this.lastSwapHasSecondary = hasSecondary;
      this.swapBtn.el.classList.toggle('ready', hasSecondary);
      this.swapBtn.el.classList.toggle('cooling', !hasSecondary);
    }

    // 4. Contextual USE / VENT button
    let nextMode: 'interact' | 'vent' = 'interact';
    let nextLabel = 'USE';
    let nextSub = '---';
    let nextHighlight = false;
    let nextVentClass = false;

    if (state.screenMode === 'hub') {
      let nearestId: SimState['hubInteractables'][number]['id'] | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < state.hubInteractables.length; i++) {
        const st = state.hubInteractables[i];
        const d = Math.hypot(st.x - p.x, st.y - p.y);
        if (d <= st.radius + p.radius + 18 && d < bestDist) {
          bestDist = d;
          nearestId = st.id;
        }
      }
      if (nearestId !== null) {
        nextMode = 'interact';
        nextLabel = 'USE';
        nextSub = hubStationShortTag(nearestId);
        nextHighlight = true;
      }
    } else if (state.screenMode === 'combat') {
      const nearExit =
        state.map.exitUnlocked &&
        Math.hypot(p.x - state.map.exitX, p.y - state.map.exitY) <= 44;

      if (nearExit) {
        nextMode = 'interact';
        nextLabel = 'USE';
        nextSub = 'PORTAL';
        nextHighlight = true;
      } else {
        let nearWeaponPickup = false;
        for (let i = 0; i < state.pickups.length; i++) {
          const pk = state.pickups[i];
          if (
            pk.kind === 'weapon' &&
            pk.weaponUniqueId !== undefined &&
            Math.hypot(pk.x - p.x, pk.y - p.y) <= p.radius + 24
          ) {
            nearWeaponPickup = true;
            break;
          }
        }

        if (nearWeaponPickup) {
          nextMode = 'interact';
          nextLabel = 'USE';
          nextSub = 'EQUIP';
          nextHighlight = true;
        } else {
          const activeWep = p.weapons[p.activeSlot];
          if (
            activeWep &&
            (activeWep.overheat > 0.35 || activeWep.overheatedLockTicks > 0)
          ) {
            nextMode = 'vent';
            nextLabel = 'VENT';
            nextSub =
              activeWep.overheatedLockTicks > 0
                ? 'HOT!'
                : `${Math.round(activeWep.overheat * 100)}%`;
            nextHighlight = true;
            nextVentClass = true;
          }
        }
      }
    }

    this.contextualAction = nextMode;
    const interactState = `${nextHighlight ? 'hi' : 'lo'}:${nextVentClass ? 'v' : 'u'}`;

    if (nextLabel !== this.lastInteractLabel) {
      this.lastInteractLabel = nextLabel;
      this.interactBtn.labelEl.textContent = nextLabel;
    }
    if (nextSub !== this.lastInteractSub) {
      this.lastInteractSub = nextSub;
      this.interactBtn.subEl.textContent = nextSub;
    }
    if (interactState !== this.lastInteractState) {
      this.lastInteractState = interactState;
      this.interactBtn.el.classList.toggle('highlight', nextHighlight);
      this.interactBtn.el.classList.toggle('vent-mode', nextVentClass);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.releaseAllInputs(true);
    this.disposed = true;
    this.visible = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', this.handleWindowPointerMove);
      window.removeEventListener('pointerup', this.handleWindowPointerEnd);
      window.removeEventListener('pointercancel', this.handleWindowPointerEnd);
      window.removeEventListener('blur', this.handleWindowBlur);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.root.removeEventListener('contextmenu', this.handleContextMenu);
    this.root.remove();
  }

  // ==========================================================================
  // DOM FACTORY HELPERS (RUN ONCE IN CONSTRUCTOR — ZERO RUNTIME ALLOCATIONS)
  // ==========================================================================

  private createStick(side: 'left' | 'right', caption: string): StickRuntime {
    const zoneEl = document.createElement('div');
    zoneEl.className = `kf-touch-stick-zone kf-touch-stick-zone-${side}`;
    zoneEl.dataset.uiInteractive = 'true';

    const baseEl = document.createElement('div');
    baseEl.className = `kf-touch-stick-base kf-touch-stick-${side}`;
    baseEl.dataset.testid = side === 'left' ? 'touch-stick-left' : 'touch-stick-right';
    baseEl.dataset.uiInteractive = 'true';

    // Crisp Norse-cyberpunk cardinal ticks + threshold reticle guide
    const ticksEl = document.createElement('div');
    ticksEl.className = 'kf-touch-stick-ticks';
    const dirs: readonly string[] = ['n', 's', 'e', 'w'];
    for (let i = 0; i < dirs.length; i++) {
      const tick = document.createElement('span');
      tick.className = `kf-touch-tick kf-touch-tick-${dirs[i]}`;
      ticksEl.appendChild(tick);
    }

    const thresholdEl = document.createElement('div');
    thresholdEl.className = 'kf-touch-stick-threshold';

    const labelEl = document.createElement('span');
    labelEl.className = 'kf-touch-stick-caption';
    labelEl.textContent = caption;

    const knobEl = document.createElement('div');
    knobEl.className = `kf-touch-stick-knob kf-touch-stick-knob-${side}`;
    knobEl.dataset.testid =
      side === 'left' ? 'touch-stick-left-knob' : 'touch-stick-right-knob';

    const knobCore = document.createElement('span');
    knobCore.className = 'kf-touch-stick-knob-core';
    knobEl.appendChild(knobCore);

    baseEl.append(ticksEl, thresholdEl, labelEl, knobEl);
    zoneEl.appendChild(baseEl);

    const stick: StickRuntime = {
      side,
      zoneEl,
      baseEl,
      knobEl,
      pointerId: null,
      originX: 0,
      originY: 0,
      maxTravel: DEFAULT_FALLBACK_TRAVEL,
      floatOffsetX: 0,
      floatOffsetY: 0,
      outX: 0,
      outY: 0,
      rawMagnitude: 0,
      firing: false,
    };

    const onDown = (e: PointerEvent): void => this.handleStickPointerDown(stick, e);
    const onMove = (e: PointerEvent): void => this.handleStickPointerMove(stick, e);
    const onEnd = (e: PointerEvent): void => this.handleStickPointerEnd(stick, e);

    // Bind on both zone and base so real touches and non-bubbling synthetic
    // events targeting touch-stick-left/right work reliably.
    zoneEl.addEventListener('pointerdown', onDown);
    baseEl.addEventListener('pointerdown', onDown);
    zoneEl.addEventListener('pointermove', onMove);
    baseEl.addEventListener('pointermove', onMove);
    zoneEl.addEventListener('pointerup', onEnd);
    baseEl.addEventListener('pointerup', onEnd);
    zoneEl.addEventListener('pointercancel', onEnd);
    baseEl.addEventListener('pointercancel', onEnd);
    zoneEl.addEventListener('lostpointercapture', onEnd);
    baseEl.addEventListener('lostpointercapture', onEnd);

    return stick;
  }

  private createActionButton(
    variantClass: string,
    testId: string,
    initialLabel: string,
    initialSub: string,
    getAction: () => TouchActionKind,
  ): ButtonRuntime {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `kf-touch-btn ${variantClass}`;
    el.dataset.testid = testId;
    el.dataset.uiInteractive = 'true';
    el.tabIndex = -1;

    const labelEl = document.createElement('span');
    labelEl.className = 'kf-touch-btn-label';
    labelEl.textContent = initialLabel;

    const subEl = document.createElement('span');
    subEl.className = 'kf-touch-btn-sub';
    subEl.textContent = initialSub;

    el.append(labelEl, subEl);

    const runtime: ButtonRuntime = {
      el,
      labelEl,
      subEl,
      pointerId: null,
      getAction,
    };

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!this.visible || this.disposed) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      runtime.pointerId = e.pointerId;
      el.classList.add('pressed');
      this.tryCapture(el, e.pointerId);

      this.cb.onTouchDetected();
      this.cb.onPlayUiClick();
      this.cb.onTouchAction(runtime.getAction());
    });

    const releaseBtn = (e: PointerEvent): void => {
      if (runtime.pointerId !== null && e.pointerId !== runtime.pointerId) return;
      runtime.pointerId = null;
      el.classList.remove('pressed');
    };

    el.addEventListener('pointerup', releaseBtn);
    el.addEventListener('pointercancel', releaseBtn);
    el.addEventListener('lostpointercapture', releaseBtn);

    return runtime;
  }

  // ==========================================================================
  // MULTI-TOUCH POINTER HANDLING FOR DUAL STICKS
  // ==========================================================================

  private handleStickPointerDown(stick: StickRuntime, e: PointerEvent): void {
    if (!this.visible || this.disposed) return;
    if (e === this.lastHandledDownEvent) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.lastHandledDownEvent = e;
    e.preventDefault();
    e.stopPropagation();

    // Ignore secondary finger if this stick is already captured by another finger
    if (stick.pointerId !== null && stick.pointerId !== e.pointerId) return;

    this.cb.onTouchDetected();

    stick.pointerId = e.pointerId;
    this.tryCapture(stick.zoneEl, e.pointerId);

    const zoneRect = stick.zoneEl.getBoundingClientRect();
    const baseRect = stick.baseEl.getBoundingClientRect();

    if (zoneRect.width > 4 && baseRect.width > 4) {
      // Compute floating origin gently bounded inside the stick's landing zone
      const restCenterX = zoneRect.left + zoneRect.width * 0.5;
      const restCenterY = zoneRect.top + zoneRect.height * 0.5;
      const baseRadius = baseRect.width * 0.5;
      const maxShiftX = Math.max(0, zoneRect.width * 0.5 - baseRadius * 0.88);
      const maxShiftY = Math.max(0, zoneRect.height * 0.5 - baseRadius * 0.88);

      const desiredShiftX = clamp(e.clientX - restCenterX, -maxShiftX, maxShiftX);
      const desiredShiftY = clamp(e.clientY - restCenterY, -maxShiftY, maxShiftY);

      stick.floatOffsetX = desiredShiftX;
      stick.floatOffsetY = desiredShiftY;
      stick.originX = restCenterX + desiredShiftX;
      stick.originY = restCenterY + desiredShiftY;
      stick.maxTravel = Math.max(24, baseRadius * 0.78);
    } else {
      // Headless / unmeasured fallback (e.g. unit tests without layout boxes)
      stick.floatOffsetX = 0;
      stick.floatOffsetY = 0;
      stick.originX = e.clientX;
      stick.originY = e.clientY;
      stick.maxTravel = Math.max(24, DEFAULT_FALLBACK_TRAVEL * this.lastScaleNum);
    }

    stick.baseEl.classList.add('active');
    stick.baseEl.style.transform = `translate3d(${stick.floatOffsetX.toFixed(1)}px, ${stick.floatOffsetY.toFixed(1)}px, 0)`;

    this.updateStickFromPoint(stick, e.clientX, e.clientY);
  }

  private handleStickPointerMove(stick: StickRuntime, e: PointerEvent): void {
    if (e === this.lastHandledMoveEvent) return;
    if (stick.pointerId === null || e.pointerId !== stick.pointerId) return;
    if (!this.visible || this.disposed) return;

    this.lastHandledMoveEvent = e;
    e.preventDefault();
    this.updateStickFromPoint(stick, e.clientX, e.clientY);
  }

  private handleStickPointerEnd(stick: StickRuntime, e: PointerEvent): void {
    if (e === this.lastHandledEndEvent) return;
    if (stick.pointerId === null || e.pointerId !== stick.pointerId) return;

    this.lastHandledEndEvent = e;
    this.resetStick(stick);
    this.emitStickInput();
  }

  private readonly handleWindowPointerMove = (e: PointerEvent): void => {
    if (e === this.lastHandledMoveEvent) return;
    if (!this.visible || this.disposed) return;
    if (e.pointerId === this.leftStick.pointerId) {
      this.handleStickPointerMove(this.leftStick, e);
    } else if (e.pointerId === this.rightStick.pointerId) {
      this.handleStickPointerMove(this.rightStick, e);
    }
  };

  private readonly handleWindowPointerEnd = (e: PointerEvent): void => {
    if (e === this.lastHandledEndEvent) return;
    let changed = false;

    if (e.pointerId === this.leftStick.pointerId) {
      this.lastHandledEndEvent = e;
      this.resetStick(this.leftStick);
      changed = true;
    } else if (e.pointerId === this.rightStick.pointerId) {
      this.lastHandledEndEvent = e;
      this.resetStick(this.rightStick);
      changed = true;
    }

    for (let i = 0; i < this.allButtons.length; i++) {
      const btn = this.allButtons[i];
      if (btn.pointerId === e.pointerId) {
        btn.pointerId = null;
        btn.el.classList.remove('pressed');
      }
    }

    if (changed) {
      this.emitStickInput();
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.releaseAllInputs(false);
  };

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.hidden) {
      this.releaseAllInputs(false);
    }
  };

  private readonly handleContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private updateStickFromPoint(
    stick: StickRuntime,
    clientX: number,
    clientY: number,
  ): void {
    const dx = clientX - stick.originX;
    const dy = clientY - stick.originY;
    const dist = Math.hypot(dx, dy);
    const maxTravel = Math.max(1, stick.maxTravel);
    const clampedDist = Math.min(dist, maxTravel);
    const angle = dist > 0.0001 ? Math.atan2(dy, dx) : 0;

    const knobX = dist > 0.0001 ? Math.cos(angle) * clampedDist : 0;
    const knobY = dist > 0.0001 ? Math.sin(angle) * clampedDist : 0;
    stick.knobEl.style.transform = `translate3d(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px, 0)`;

    const rawMag = clamp(dist / maxTravel, 0, 1);
    stick.rawMagnitude = rawMag;

    const deadzone = stick.side === 'left' ? LEFT_DEADZONE : RIGHT_AIM_DEADZONE;
    if (rawMag <= deadzone) {
      stick.outX = 0;
      stick.outY = 0;
      stick.firing = false;
    } else {
      const scaled = clamp((rawMag - deadzone) / (1 - deadzone), 0, 1);
      stick.outX = Math.cos(angle) * scaled;
      stick.outY = Math.sin(angle) * scaled;
      stick.firing = stick.side === 'right' && rawMag >= RIGHT_FIRE_THRESHOLD;
    }

    if (stick.side === 'right') {
      stick.baseEl.classList.toggle('firing', stick.firing);
    }

    this.emitStickInput();
  }

  private resetStick(stick: StickRuntime): void {
    const prevId = stick.pointerId;
    stick.pointerId = null;
    stick.floatOffsetX = 0;
    stick.floatOffsetY = 0;
    stick.outX = 0;
    stick.outY = 0;
    stick.rawMagnitude = 0;
    stick.firing = false;

    stick.baseEl.classList.remove('active', 'firing');
    stick.baseEl.style.transform = 'translate3d(0px, 0px, 0px)';
    stick.knobEl.style.transform = 'translate3d(0px, 0px, 0px)';

    if (prevId !== null) {
      this.tryReleaseCapture(stick.zoneEl, prevId);
    }
  }

  private releaseAllInputs(forceEmit: boolean): void {
    const hadActive =
      this.leftStick.pointerId !== null ||
      this.rightStick.pointerId !== null ||
      this.leftStick.outX !== 0 ||
      this.leftStick.outY !== 0 ||
      this.rightStick.outX !== 0 ||
      this.rightStick.outY !== 0 ||
      this.rightStick.firing;

    this.resetStick(this.leftStick);
    this.resetStick(this.rightStick);

    for (let i = 0; i < this.allButtons.length; i++) {
      const btn = this.allButtons[i];
      if (btn.pointerId !== null) {
        this.tryReleaseCapture(btn.el, btn.pointerId);
        btn.pointerId = null;
      }
      btn.el.classList.remove('pressed');
    }

    if (forceEmit || hadActive) {
      this.cb.onTouchInput({
        moveX: 0,
        moveY: 0,
        aimX: 0,
        aimY: 0,
        aimActive: false,
        fireHeld: false,
      });
    }
  }

  private emitStickInput(): void {
    const aimActive =
      this.rightStick.pointerId !== null &&
      this.rightStick.rawMagnitude > RIGHT_AIM_DEADZONE;

    this.cb.onTouchInput({
      moveX: this.leftStick.outX,
      moveY: this.leftStick.outY,
      aimX: aimActive ? this.rightStick.outX : 0,
      aimY: aimActive ? this.rightStick.outY : 0,
      aimActive,
      fireHeld: aimActive && this.rightStick.firing,
    });
  }

  private tryCapture(el: Element, pointerId: number): void {
    try {
      if (typeof el.setPointerCapture === 'function') {
        el.setPointerCapture(pointerId);
      }
    } catch {
      // Ignore synthetic events without active browser pointer ids
    }
  }

  private tryReleaseCapture(el: Element, pointerId: number): void {
    try {
      if (
        typeof el.hasPointerCapture === 'function' &&
        el.hasPointerCapture(pointerId) &&
        typeof el.releasePointerCapture === 'function'
      ) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore synthetic / already-released captures
    }
  }
}
