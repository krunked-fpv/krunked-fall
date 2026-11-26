// ============================================================================
// KRUNKEDFALL — Spatial 2D Gamepad UI Navigator
// ============================================================================
// Drives full controller menu navigation across Title Screen, Hub Modals
// (Loki, Jotunn-Matic, Yggdrasil Skill Tree, Modifiers, Weapondex, Enemydex,
// Challenges), Overworld Map (45 nodes + Act tabs + Deploy), Workbench, Shop,
// Campfire, Pause, Options (including Left/Right range slider stepping),
// Keybinds, Victory, and Game Over.

import type { UiNavActions } from '../contracts/index.js';

export interface GamepadNavCallbacks {
  onCancel?(): void;
  onPlayUiClick?(): void;
  onTabChange?(dir: -1 | 1): boolean;
}

const FOCUS_CLASS = 'kf-gp-focus';
const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"]):not([type="file"])',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface CandidateInfo {
  el: HTMLElement;
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  hasLayout: boolean;
}

function isHiddenByStyle(el: HTMLElement): boolean {
  if (el.hidden) return true;
  if (el.style?.display === 'none' || el.style?.visibility === 'hidden') {
    return true;
  }
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    try {
      const cs = window.getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) {
        return true;
      }
    } catch {
      // Ignore in mocked/headless DOM environments
    }
  }
  return false;
}

function isTreeVisible(el: HTMLElement, stopAt: HTMLElement): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (isHiddenByStyle(cur)) return false;
    if (cur === stopAt) break;
    cur = cur.parentElement;
  }
  return true;
}

function getElementRect(el: HTMLElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  if (typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    return {
      left: Number.isFinite(r.left) ? r.left : 0,
      top: Number.isFinite(r.top) ? r.top : 0,
      width: Number.isFinite(r.width) ? r.width : 0,
      height: Number.isFinite(r.height) ? r.height : 0,
    };
  }
  return { left: 0, top: 0, width: 0, height: 0 };
}

function countStepDecimals(stepRaw: string): number {
  const dot = stepRaw.indexOf('.');
  if (dot < 0) return 0;
  return Math.min(6, stepRaw.length - dot - 1);
}

export class GamepadNavigator {
  private readonly root: HTMLElement;
  private readonly cb: GamepadNavCallbacks;

  private focusedEl: HTMLElement | null = null;
  private activeLayer: HTMLElement | null = null;
  private lastLayerKey = '';
  private lastFocusTestId = '';
  private lastFocusCenter: { x: number; y: number } | null = null;

  constructor(root: HTMLElement, callbacks: GamepadNavCallbacks = {}) {
    this.root = root;
    this.cb = callbacks;
  }

  public getFocusedElement(): HTMLElement | null {
    return this.focusedEl;
  }

  public clearFocus(): void {
    if (this.focusedEl) {
      this.focusedEl.classList.remove(FOCUS_CLASS);
      this.focusedEl = null;
    }
    if (typeof this.root.querySelectorAll === 'function') {
      const stray = this.root.querySelectorAll(`.${FOCUS_CLASS}`);
      for (let i = 0; i < stray.length; i++) {
        stray[i].classList.remove(FOCUS_CLASS);
      }
    }
    this.activeLayer = null;
    this.lastLayerKey = '';
    this.lastFocusTestId = '';
    this.lastFocusCenter = null;
  }

  /**
   * Processes one frame of gamepad UI navigation actions.
   * Pass `active = true` only when activeDevice === 'gamepad' and a menu/modal
   * or non-gameplay screen (Title / Overworld / Hub Modal / Overlay) is open.
   */
  public update(actions: UiNavActions, active: boolean): void {
    if (!active) {
      if (this.focusedEl || this.activeLayer) {
        this.clearFocus();
      }
      return;
    }

    const layer = this.resolveActiveLayer();
    if (!layer) {
      this.clearFocus();
      return;
    }

    const layerKey = this.computeLayerKey(layer);
    const layerChanged = layer !== this.activeLayer || layerKey !== this.lastLayerKey;
    this.activeLayer = layer;
    this.lastLayerKey = layerKey;

    const candidates = this.collectCandidates(layer);
    if (candidates.length === 0) {
      if (this.focusedEl) {
        this.focusedEl.classList.remove(FOCUS_CLASS);
        this.focusedEl = null;
      }
      if (actions.cancel) {
        this.cb.onPlayUiClick?.();
        this.cb.onCancel?.();
      }
      return;
    }

    // Ensure valid focus inside the current layer (restoring across DOM rebuilds)
    if (layerChanged) {
      this.lastFocusTestId = '';
      this.lastFocusCenter = null;
      this.setFocus(this.pickInitialCandidate(layer, candidates), false);
    } else if (!this.focusedEl || !candidates.some((c) => c.el === this.focusedEl)) {
      this.setFocus(this.restoreOrPickCandidate(layer, candidates), false);
    } else {
      // Refresh focus class in case element classes were rewritten
      this.focusedEl.classList.add(FOCUS_CLASS);
    }

    // 1. Cancel (B / Circle)
    if (actions.cancel) {
      this.cb.onPlayUiClick?.();
      this.cb.onCancel?.();
      return;
    }

    // 2. Shoulder Tab Cycling (LB / RB)
    if (actions.tabPrev || actions.tabNext) {
      const dir: -1 | 1 = actions.tabNext ? 1 : -1;
      const handled = this.cb.onTabChange?.(dir) ?? false;
      if (!handled) {
        this.cycleTabsInLayer(layer, dir);
      }
      return;
    }

    // 3. Page Scroll (Right Stick Y)
    if (actions.pageUp || actions.pageDown) {
      this.scrollLayer(layer, actions.pageDown ? 150 : -150);
    }

    // 4. Range Slider Left/Right Stepping
    if (
      actions.moveX !== 0 &&
      this.focusedEl &&
      this.isRangeInput(this.focusedEl)
    ) {
      this.stepRangeInput(this.focusedEl, actions.moveX);
      if (actions.moveY === 0) {
        if (actions.confirm) {
          this.cb.onPlayUiClick?.();
        }
        return;
      }
    }

    // 5. Spatial 2D Directional Navigation
    const moveX =
      this.focusedEl && this.isRangeInput(this.focusedEl) ? 0 : actions.moveX;
    const moveY = actions.moveY;
    if (moveX !== 0 || moveY !== 0) {
      const next = this.findSpatialNeighbor(candidates, this.focusedEl, moveX, moveY);
      if (next && next !== this.focusedEl) {
        this.setFocus(next, true);
      }
    }

    // 6. Confirm (A / Cross)
    if (actions.confirm && this.focusedEl) {
      this.activateFocusedElement(this.focusedEl);
    }
  }

  private resolveActiveLayer(): HTMLElement | null {
    if (typeof this.root.querySelectorAll !== 'function') {
      return this.root;
    }

    // 1. Topmost visible modal backdrop (Overlays sit after HubUi in DOM order)
    const modals = this.root.querySelectorAll<HTMLElement>('.kf-modal-backdrop');
    for (let i = modals.length - 1; i >= 0; i--) {
      if (isTreeVisible(modals[i], this.root)) {
        return modals[i];
      }
    }

    // 2. Overworld Map screen
    const overworld = this.root.querySelector<HTMLElement>('.kf-overworld-screen');
    if (overworld && isTreeVisible(overworld, this.root)) {
      return overworld;
    }

    // 3. Title Screen
    const title = this.root.querySelector<HTMLElement>('.kf-title-screen');
    if (title && isTreeVisible(title, this.root)) {
      return title;
    }

    // 4. Direct root container fallback (supports standalone unit tests)
    if (!isHiddenByStyle(this.root)) {
      return this.root;
    }
    return null;
  }

  private computeLayerKey(layer: HTMLElement): string {
    const modal = layer.querySelector?.<HTMLElement>('.kf-modal');
    if (modal) {
      const testId = modal.dataset?.testid;
      if (testId) return `modal:${testId}`;
      const title = modal.querySelector?.('.kf-modal-title')?.textContent ?? '';
      return `modal:${title}`;
    }
    if (layer.classList?.contains('kf-overworld-screen')) return 'screen:overworld';
    if (layer.classList?.contains('kf-title-screen')) return 'screen:title';
    return `root:${layer.className || layer.tagName}`;
  }

  private collectCandidates(layer: HTMLElement): CandidateInfo[] {
    if (typeof layer.querySelectorAll !== 'function') return [];
    const raw = layer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const preliminary: CandidateInfo[] = [];
    let anyHasLayout = false;

    for (let i = 0; i < raw.length; i++) {
      const el = raw[i];
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.getAttribute?.('aria-disabled') === 'true') continue;
      if (el.closest?.('.kf-touch-layer')) continue;
      if (!isTreeVisible(el, layer)) continue;

      const r = getElementRect(el);
      const hasLayout = r.width > 0 && r.height > 0;
      if (hasLayout) anyHasLayout = true;

      preliminary.push({
        el,
        left: r.left,
        right: r.left + r.width,
        top: r.top,
        bottom: r.top + r.height,
        cx: r.left + r.width * 0.5,
        cy: r.top + r.height * 0.5,
        width: r.width,
        height: r.height,
        hasLayout,
      });
    }

    if (anyHasLayout) {
      return preliminary.filter((c) => c.hasLayout);
    }
    return preliminary;
  }

  private pickInitialCandidate(
    layer: HTMLElement,
    candidates: CandidateInfo[],
  ): HTMLElement {
    // 1. Explicit selected item (Overworld node, Skill Tree node, Outcast card)
    const preferredSelectors = [
      '[data-gp-initial="true"]',
      '.kf-map-node.selected',
      '.kf-skill-node.selected',
      '.kf-outcast-card.selected',
    ];
    for (const sel of preferredSelectors) {
      const found = candidates.find((c) => c.el.matches?.(sel));
      if (found) return found.el;
    }

    // 2. First interactive control inside modal body (avoid defaulting to Close [ESC])
    const body = layer.querySelector?.<HTMLElement>('.kf-modal-body');
    if (body) {
      const inBody = candidates.find((c) => body.contains(c.el));
      if (inBody) return inBody.el;
    }

    // 3. First primary/gold action button inside modal footer (Victory / Game Over)
    const footer = layer.querySelector?.<HTMLElement>('.kf-modal-footer');
    if (footer) {
      const primaryFooter = candidates.find(
        (c) =>
          footer.contains(c.el) &&
          (c.el.classList.contains('kf-btn-primary') ||
            c.el.classList.contains('kf-btn-gold')),
      );
      if (primaryFooter) return primaryFooter.el;
      const anyFooter = candidates.find((c) => footer.contains(c.el));
      if (anyFooter) return anyFooter.el;
    }

    return candidates[0].el;
  }

  private restoreOrPickCandidate(
    layer: HTMLElement,
    candidates: CandidateInfo[],
  ): HTMLElement {
    // 1. Match by stable data-testid across DOM re-render
    if (this.lastFocusTestId) {
      const byTestId = candidates.find(
        (c) => c.el.dataset?.testid === this.lastFocusTestId,
      );
      if (byTestId) return byTestId.el;
    }

    // 2. Match by nearest geometric center when layout coordinates exist
    if (this.lastFocusCenter && candidates.some((c) => c.hasLayout)) {
      let best: CandidateInfo | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const d = Math.hypot(
          c.cx - this.lastFocusCenter.x,
          c.cy - this.lastFocusCenter.y,
        );
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (best && bestDist < 140) {
        return best.el;
      }
    }

    return this.pickInitialCandidate(layer, candidates);
  }

  private setFocus(el: HTMLElement, scrollAndNotify: boolean): void {
    if (this.focusedEl && this.focusedEl !== el) {
      this.focusedEl.classList.remove(FOCUS_CLASS);
    }
    this.focusedEl = el;
    el.classList.add(FOCUS_CLASS);
    this.lastFocusTestId = el.dataset?.testid ?? '';

    const r = getElementRect(el);
    if (r.width > 0 && r.height > 0) {
      this.lastFocusCenter = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    }

    if (scrollAndNotify) {
      try {
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch {
        try {
          el.scrollIntoView?.();
        } catch {
          // Ignore in minimal mock DOMs
        }
      }
    }
  }

  private findSpatialNeighbor(
    candidates: CandidateInfo[],
    currentEl: HTMLElement | null,
    dx: -1 | 0 | 1,
    dy: -1 | 0 | 1,
  ): HTMLElement | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].el;

    const curIdx = currentEl
      ? candidates.findIndex((c) => c.el === currentEl)
      : -1;
    if (curIdx < 0) return candidates[0].el;

    const cur = candidates[curIdx];
    const hasLayout = cur.hasLayout && candidates.some((c, i) => i !== curIdx && c.hasLayout);

    // Fallback to clean DOM order when elements have no computed bounding rects
    if (!hasLayout) {
      const step = dy !== 0 ? dy : dx;
      const nextIdx = (curIdx + step + candidates.length) % candidates.length;
      return candidates[nextIdx].el;
    }

    const isVertical = dx === 0 && dy !== 0;
    const isHorizontal = dy === 0 && dx !== 0;
    const dirLen = Math.hypot(dx, dy) || 1;
    const ux = dx / dirLen;
    const uy = dy / dirLen;

    let bestStrict: CandidateInfo | null = null;
    let bestStrictScore = Infinity;
    let bestWide: CandidateInfo | null = null;
    let bestWideScore = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      if (i === curIdx) continue;
      const cand = candidates[i];
      const vx = cand.cx - cur.cx;
      const vy = cand.cy - cur.cy;

      const along = vx * ux + vy * uy;
      if (along <= 2) continue;

      let alongDist = along;
      let perp: number;
      let centerTie = 0;
      let inCone: boolean;

      if (isVertical) {
        // Bounding-box horizontal interval gap (0 when intervals overlap, e.g. wide -> split row)
        perp =
          cand.right < cur.left
            ? cur.left - cand.right
            : cand.left > cur.right
              ? cand.left - cur.right
              : 0;
        const rawEdgeAlong = dy > 0 ? cand.top - cur.bottom : cur.top - cand.bottom;
        // Skip side-by-side siblings on the same row that do not advance vertically
        if (perp > 0 && rawEdgeAlong < -Math.min(cur.height, cand.height) * 0.5) {
          continue;
        }
        alongDist = Math.max(0, rawEdgeAlong);
        centerTie = Math.abs(vx) * 0.05;
        inCone = perp === 0 || (rawEdgeAlong >= -4 && perp <= along * 1.35 + 24);
      } else if (isHorizontal) {
        // Bounding-box vertical interval gap (0 when intervals overlap on the same row)
        perp =
          cand.bottom < cur.top
            ? cur.top - cand.bottom
            : cand.top > cur.bottom
              ? cand.top - cur.bottom
              : 0;
        const rawEdgeAlong = dx > 0 ? cand.left - cur.right : cur.left - cand.right;
        // Skip elements on other rows that overlap horizontally (e.g. wider slider below a narrow button)
        if (perp > 0 && rawEdgeAlong < -Math.min(cur.width, cand.width) * 0.5) {
          continue;
        }
        alongDist = Math.max(0, rawEdgeAlong);
        centerTie = Math.abs(vy) * 0.05;
        inCone = perp === 0 || (rawEdgeAlong >= -4 && perp <= along * 1.35 + 24);
      } else {
        perp = Math.abs(vx * -uy + vy * ux);
        inCone = perp <= along * 1.35 + 24;
      }

      if (inCone) {
        const score = alongDist + perp * 3.0 + centerTie;
        if (score < bestStrictScore) {
          bestStrictScore = score;
          bestStrict = cand;
        }
      } else {
        const wideScore = alongDist + perp * 4.0 + centerTie;
        if (wideScore < bestWideScore) {
          bestWideScore = wideScore;
          bestWide = cand;
        }
      }
    }

    if (bestStrict) return bestStrict.el;
    if (bestWide) return bestWide.el;

    // Clean wrap-around at list/grid boundaries
    if (dy !== 0 && dx === 0) {
      // Wrap vertically to the opposite extreme along Y, preferring overlapping X
      let wrapTarget: CandidateInfo | null = null;
      let bestMetric = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        if (i === curIdx) continue;
        const cand = candidates[i];
        const extreme = dy > 0 ? cand.cy : -cand.cy;
        const gapX =
          cand.right < cur.left
            ? cur.left - cand.right
            : cand.left > cur.right
              ? cand.left - cur.right
              : 0;
        const xPenalty = gapX * 0.5 + Math.abs(cand.cx - cur.cx) * 0.05;
        const metric = extreme + xPenalty;
        if (metric < bestMetric) {
          bestMetric = metric;
          wrapTarget = cand;
        }
      }
      if (wrapTarget) return wrapTarget.el;
    } else if (dx !== 0 && dy === 0) {
      // Wrap horizontally only among siblings overlapping on roughly the same row
      const rowTolerance = Math.max(cur.height, 44);
      let wrapTarget: CandidateInfo | null = null;
      let bestMetric = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        if (i === curIdx) continue;
        const cand = candidates[i];
        if (Math.abs(cand.cy - cur.cy) > rowTolerance) continue;
        if (Math.abs(cand.cx - cur.cx) <= 8) continue;
        const metric = dx > 0 ? cand.cx : -cand.cx;
        if (metric < bestMetric) {
          bestMetric = metric;
          wrapTarget = cand;
        }
      }
      if (wrapTarget) return wrapTarget.el;
    }

    return currentEl;
  }

  private isRangeInput(el: HTMLElement): el is HTMLInputElement {
    return (
      el.tagName === 'INPUT' &&
      (el as HTMLInputElement).type === 'range'
    );
  }

  private stepRangeInput(input: HTMLInputElement, dir: -1 | 1): void {
    const min = input.min !== '' ? Number(input.min) : 0;
    const max = input.max !== '' ? Number(input.max) : 100;
    const stepRaw = input.step && input.step !== 'any' ? input.step : '1';
    const step = Number(stepRaw);
    const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
    const cur = Number(input.value);
    const base = Number.isFinite(cur) ? cur : min;
    const clamped = Math.max(min, Math.min(max, base + dir * safeStep));
    const decimals = countStepDecimals(stepRaw);
    const nextVal = Number(clamped.toFixed(decimals));

    if (String(nextVal) === input.value) return;
    input.value = String(nextVal);

    if (typeof Event === 'function' && typeof input.dispatchEvent === 'function') {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.cb.onPlayUiClick?.();
  }

  private activateFocusedElement(el: HTMLElement): void {
    if (this.isRangeInput(el)) {
      this.cb.onPlayUiClick?.();
      return;
    }

    if (el.tagName === 'SELECT') {
      const sel = el as HTMLSelectElement;
      if (sel.options && sel.options.length > 0) {
        sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length;
        if (typeof Event === 'function' && typeof sel.dispatchEvent === 'function') {
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.cb.onPlayUiClick?.();
      }
      return;
    }

    this.cb.onPlayUiClick?.();
    el.click?.();
  }

  private cycleTabsInLayer(layer: HTMLElement, dir: -1 | 1): boolean {
    if (typeof layer.querySelectorAll !== 'function') return false;

    const tabSets: HTMLElement[][] = [];
    const tagged = Array.from(
      layer.querySelectorAll<HTMLElement>('[data-gp-tab-group]'),
    ).filter((el) => !(el as HTMLButtonElement).disabled && isTreeVisible(el, layer));
    if (tagged.length > 1) {
      tabSets.push(tagged);
    }

    const fallbackSelectors = [
      '.kf-overworld-acts button:not(:disabled)',
      '.kf-loki-topics button:not(:disabled)',
    ];
    for (const sel of fallbackSelectors) {
      const list = Array.from(layer.querySelectorAll<HTMLElement>(sel)).filter(
        (el) => isTreeVisible(el, layer),
      );
      if (list.length > 1) {
        tabSets.push(list);
      }
    }

    if (tabSets.length === 0) return false;
    const tabs = tabSets[0];

    let activeIdx = tabs.findIndex(
      (t) =>
        t.dataset?.gpTabActive === 'true' ||
        t.classList.contains('active') ||
        t.classList.contains('kf-btn-primary'),
    );
    if (activeIdx < 0) activeIdx = 0;

    const nextIdx = (activeIdx + dir + tabs.length) % tabs.length;
    const target = tabs[nextIdx];
    this.cb.onPlayUiClick?.();
    target.click?.();
    return true;
  }

  private scrollLayer(layer: HTMLElement, deltaY: number): void {
    const scroller =
      layer.querySelector?.<HTMLElement>('.kf-overworld-map-wrap') ??
      layer.querySelector?.<HTMLElement>('.kf-scroll') ??
      (layer.classList?.contains('kf-scroll') ? layer : null);

    if (!scroller) return;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + deltaY);
  }
}
