// ============================================================================
// KRUNKEDFALL — Gameplay & System Overlays (Forged Ragnarok Polish)
// ============================================================================
// Workbench (TAB), Weapon Shop, Campfire, Pause (ESC), Options, Keybinds,
// Victory / Loop Mode Prompt, and Game Over Run Summary.

import {
  AMMO_NAMES,
  type AssetPackMode,
  type AudioSettings,
  type ControllerSettings,
  type ControllerStatus,
  type RenderSettings,
  type SaveData,
  type SimState,
  type TargetFps,
} from '../contracts/index.js';
import {
  UI_LABELS,
  getModDef,
  getOutcastDef,
  getOverworldNode,
  getWeaponDef,
} from '../data/index.js';
import {
  DEFAULT_CONTROLLER_SETTINGS,
  KEYBIND_ACTIONS,
  formatKeyCode,
  getGamepadGlyphs,
  type GamepadGlyphSet,
  type KeybindAction,
} from '../input/index.js';
import {
  computeEffectiveWeaponStats,
  getWeaponModLimit,
  type EffectiveWeaponStats,
} from '../sim/index.js';
import { svgIcon, type IconName } from './icons.js';
import {
  getLokiPortraitUrl,
  getOutcastPortraitUrl,
  getWeaponThumbUrl,
} from './spritePreview.js';

function stripBrackets(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1);
  return t;
}

function formatControllerStatusLabel(status?: ControllerStatus): {
  text: string;
  badgeClass: string;
} {
  if (!status) {
    return {
      text: 'KEYBOARD & MOUSE',
      badgeClass: 'kf-controller-badge',
    };
  }
  if (status.gamepadConnected) {
    const profileTitle =
      status.gamepadProfile === 'xbox'
        ? 'XBOX'
        : status.gamepadProfile === 'playstation'
          ? 'PLAYSTATION'
          : status.gamepadProfile === 'nintendo'
            ? 'NINTENDO'
            : status.gamepadProfile === 'steamdeck'
              ? 'STEAM DECK'
              : status.gamepadProfile === 'tesla'
                ? 'TESLA'
                : 'GENERIC';
    const rawName = status.gamepadName.trim();
    const shortName =
      rawName.length > 28 ? `${rawName.slice(0, 25)}...` : rawName;
    const mod = status.gamepadProfile === 'tesla' ? 'tesla' : 'gamepad';
    return {
      text: shortName
        ? `${profileTitle} · ${shortName}`
        : `${profileTitle} CONNECTED`,
      badgeClass: `kf-controller-badge connected ${mod}`,
    };
  }
  if (status.touchSensed) {
    return {
      text: status.isTeslaBrowser
        ? 'TESLA TOUCH ACTIVE'
        : 'TOUCH CONTROLS ACTIVE',
      badgeClass: status.isTeslaBrowser
        ? 'kf-controller-badge tesla'
        : 'kf-controller-badge touch',
    };
  }
  return {
    text: status.isTeslaBrowser
      ? 'TESLA BROWSER · READY'
      : 'KEYBOARD & MOUSE',
    badgeClass: status.isTeslaBrowser
      ? 'kf-controller-badge tesla'
      : 'kf-controller-badge',
  };
}

function makeControllerBadgeEl(
  meta: { text: string; badgeClass: string },
  testId?: string,
): HTMLElement {
  const el = document.createElement('span');
  el.className = meta.badgeClass;
  if (testId) el.dataset.testid = testId;
  const dot = document.createElement('span');
  dot.className = 'kf-controller-dot';
  const lbl = document.createElement('span');
  lbl.textContent = meta.text;
  el.append(dot, lbl);
  return el;
}

export type ModalOverlayKind =
  | 'none'
  | 'workbench'
  | 'shop'
  | 'campfire'
  | 'pause'
  | 'options'
  | 'keybinds'
  | 'victory'
  | 'gameover';

export interface OverlaysCallbacks {
  onCloseOverlay(): void;
  onResumeGame(): void;
  onOpenOptions(): void;
  onOpenKeybinds(): void;
  onReturnToHub(): void;
  onReturnToTitle(): void;
  onLeaveToOverworld(): void;
  onRetryRun(): void;
  onStartNextLoop(): void;
  onAttachMod(modId: string, slot: 0 | 1): boolean;
  onDetachMod(modSlotIdx: number, slot: 0 | 1): boolean;
  onGoldenUpgrade(slot: 0 | 1): boolean;
  onBuyShopOffer(offerId: string): boolean;
  onUseCampfire(action: 'heal' | 'ammo' | 'upgrade' | 'skill'): boolean;
  onUpdateRenderSettings(partial: Partial<RenderSettings>): void;
  onUpdateAudioSettings(partial: Partial<AudioSettings>): void;
  onUpdateControllerSettings(partial: Partial<ControllerSettings>): void;
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onStartRebind(action: KeybindAction): void;
  onResetKeybinds(): void;
  onPlayUiClick(): void;
  onPlayUiConfirm?(): void;
  onPlayUiError?(): void;
}

function formatRunTime(ticks: number): string {
  const totalSec = Math.max(0, Math.floor(ticks / 60));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export class Overlays {
  private readonly backdrop: HTMLElement;
  private readonly cb: OverlaysCallbacks;
  private lastKind: ModalOverlayKind = 'none';
  private lastSig = '';
  private workbenchSlot: 0 | 1 = 0;
  private previewModId: string | null = null;

  constructor(parent: HTMLElement, callbacks: OverlaysCallbacks) {
    this.cb = callbacks;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'kf-modal-backdrop kf-interactive';
    this.backdrop.style.display = 'none';
    this.backdrop.dataset.uiInteractive = 'true';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        if (
          this.lastKind === 'workbench' ||
          this.lastKind === 'pause' ||
          this.lastKind === 'options' ||
          this.lastKind === 'keybinds'
        ) {
          this.cb.onPlayUiClick();
          this.cb.onCloseOverlay();
        }
      }
    });
    parent.appendChild(this.backdrop);
  }

  private playConfirm(): void {
    if (this.cb.onPlayUiConfirm) this.cb.onPlayUiConfirm();
    else this.cb.onPlayUiClick();
  }

  private playError(): void {
    if (this.cb.onPlayUiError) this.cb.onPlayUiError();
    else this.cb.onPlayUiClick();
  }

  public render(
    kind: ModalOverlayKind,
    state: SimState,
    save: SaveData,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
    rebindingAction: KeybindAction | null,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    if (kind === 'none') {
      if (this.lastKind !== 'none') {
        this.lastKind = 'none';
        this.lastSig = '';
        this.backdrop.style.display = 'none';
        this.backdrop.classList.remove('kf-entering');
        this.backdrop.innerHTML = '';
      }
      return;
    }

    this.backdrop.style.display = 'flex';

    const sig = this.computeSignature(
      kind,
      state,
      save,
      packMode,
      customPackAvailable,
      rebindingAction,
      controllerStatus,
      prompts,
    );
    if (kind === this.lastKind && sig === this.lastSig) {
      return;
    }

    const isFreshOpen = kind !== this.lastKind;
    this.lastKind = kind;
    this.lastSig = sig;
    this.backdrop.classList.toggle('kf-entering', isFreshOpen);

    this.backdrop.innerHTML = '';
    switch (kind) {
      case 'workbench':
        this.buildWorkbench(state, isFreshOpen, controllerStatus, prompts);
        break;
      case 'shop':
        this.buildShop(state, isFreshOpen);
        break;
      case 'campfire':
        this.buildCampfire(state, isFreshOpen);
        break;
      case 'pause':
        this.buildPause(state, isFreshOpen, controllerStatus, prompts);
        break;
      case 'options':
        this.buildOptions(save, packMode, customPackAvailable, isFreshOpen, controllerStatus, prompts);
        break;
      case 'keybinds':
        this.buildKeybinds(save, rebindingAction, isFreshOpen, controllerStatus, prompts);
        break;
      case 'victory':
        this.buildVictory(state, isFreshOpen);
        break;
      case 'gameover':
        this.buildGameOver(state, isFreshOpen);
        break;
    }
  }

  private computeSignature(
    kind: ModalOverlayKind,
    state: SimState,
    save: SaveData,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
    rebindingAction: KeybindAction | null,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): string {
    const p = state.player;
    const devKey = [
      controllerStatus?.activeDevice ?? 'keyboard',
      controllerStatus?.gamepadConnected ? '1' : '0',
      controllerStatus?.gamepadProfile ?? 'generic',
      controllerStatus?.gamepadName ?? '',
      controllerStatus?.touchSensed ? '1' : '0',
      controllerStatus?.isTeslaBrowser ? '1' : '0',
      prompts?.cancel ?? '',
      prompts?.pause ?? '',
    ].join(':');
    switch (kind) {
      case 'workbench':
        return [
          kind,
          this.workbenchSlot,
          this.previewModId ?? '',
          p.gold,
          p.weapons[0]?.uniqueId,
          p.weapons[0]?.golden ? 'g' : 'n',
          p.weapons[0]?.mods.join(','),
          p.weapons[1]?.uniqueId ?? 'none',
          p.weapons[1]?.golden ? 'g' : 'n',
          p.weapons[1]?.mods.join(',') ?? '',
          p.backpackMods.join(','),
          devKey,
        ].join('|');
      case 'shop':
        return [
          kind,
          p.gold,
          state.shopOffers.map((o) => `${o.id}:${o.purchased ? 1 : 0}`).join(','),
        ].join('|');
      case 'campfire':
        return [
          kind,
          p.hp,
          p.maxHp,
          p.skillPoints,
          p.weapons[p.activeSlot]?.golden ? 'g' : 'n',
        ].join('|');
      case 'pause':
        return [kind, state.screenMode, state.currentNodeId, p.outcastId, p.skinId, Math.ceil(p.hp), p.gold, p.kills, devKey].join('|');
      case 'options': {
        const cs = save.controllerSettings ?? DEFAULT_CONTROLLER_SETTINGS;
        return [
          kind,
          save.renderSettings.targetFps,
          save.renderSettings.pixelSnap60 ? '1' : '0',
          save.renderSettings.lightingEnabled ? '1' : '0',
          save.renderSettings.bloodEnabled ? '1' : '0',
          save.audioSettings.muted ? '1' : '0',
          cs.vibrationEnabled ? '1' : '0',
          cs.twinStickAutoFire ? '1' : '0',
          packMode,
          customPackAvailable ? '1' : '0',
          devKey,
        ].join('|');
      }
      case 'keybinds':
        return [
          kind,
          rebindingAction ?? '',
          Object.entries(save.keybinds)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join(','),
          devKey,
        ].join('|');
      case 'victory':
      case 'gameover':
        return [
          kind,
          state.loopCount,
          state.player.kills,
          state.runStats.score,
          state.runStats.roomsCleared,
          state.runStats.bossesDefeated.length,
        ].join('|');
      default:
        return kind;
    }
  }

  // ==========================================================================
  // 1. WEAPON WORKBENCH (TAB)
  // ==========================================================================

  private buildWorkbench(
    state: SimState,
    isFreshOpen: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const p = state.player;
    if (this.workbenchSlot === 1 && !p.weapons[1]) {
      this.workbenchSlot = 0;
    }
    const inst = p.weapons[this.workbenchSlot] ?? p.weapons[0];
    const def = getWeaponDef(inst.uniqueId);
    const modLimit = getWeaponModLimit(state.skillRanks);
    const goldenCost = Math.max(150, (def.goldenCost || 4) * 50);

    const curStats = computeEffectiveWeaponStats(
      def,
      inst.mods,
      inst.golden,
      state.skillRanks,
    );

    const canPreview =
      this.previewModId !== null &&
      p.backpackMods.includes(this.previewModId) &&
      inst.mods.length < modLimit;

    const previewStats = canPreview
      ? computeEffectiveWeaponStats(
          def,
          [...inst.mods, this.previewModId!],
          inst.golden,
          state.skillRanks,
        )
      : null;

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-cyan kf-modal${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'workbench-modal';

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const closeKey =
      activeDevice === 'touch'
        ? ''
        : activeDevice === 'gamepad' && prompts
          ? stripBrackets(prompts.cancel)
          : 'TAB / ESC';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge">${svgIcon('workbench', 18)}</div>
        <div>
          <div class="kf-modal-title">${UI_LABELS.workbenchTitle}</div>
          <span class="kf-modal-subtitle">GOLD: ${p.gold}G · MOD SOCKETS: ${inst.mods.length}/${modLimit}</span>
        </div>
      </div>
    `;
    const closeBtn = this.makeHtmlBtn(
      `${svgIcon('close', 13)}<span>CLOSE</span>${closeKey ? `<span class="kf-kbd">${closeKey}</span>` : ''}`,
      'kf-btn kf-btn-sm kf-btn-danger',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onCloseOverlay();
      },
    );
    closeBtn.dataset.testid = 'workbench-close-btn';
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    // Top Slot Selector + Golden Forge CTA
    const tabsRow = document.createElement('div');
    tabsRow.style.display = 'flex';
    tabsRow.style.alignItems = 'center';
    tabsRow.style.flexWrap = 'wrap';
    tabsRow.style.gap = '8px';
    tabsRow.style.marginBottom = '12px';

    for (let s = 0; s < 2; s++) {
      const slotIdx = s as 0 | 1;
      const w = p.weapons[slotIdx];
      const wDef = w ? getWeaponDef(w.uniqueId) : null;
      const isSelected = this.workbenchSlot === slotIdx;
      const tabBtn = this.makeBtn(
        wDef
          ? `SLOT ${s + 1}: ${w!.golden ? '★ ' : ''}${wDef.name} (T${wDef.weaponTier})`
          : `SLOT ${s + 1}: EMPTY`,
        isSelected
          ? 'kf-btn kf-btn-sm kf-btn-primary'
          : 'kf-btn kf-btn-sm',
        () => {
          if (!w) return;
          this.cb.onPlayUiClick();
          this.workbenchSlot = slotIdx;
          this.lastSig = '';
        },
      );
      tabBtn.disabled = !w;
      tabBtn.dataset.testid = `workbench-slot-${slotIdx}`;
      tabBtn.dataset.gpTabGroup = 'workbench-slots';
      if (isSelected) {
        tabBtn.dataset.gpTabActive = 'true';
      }
      tabsRow.appendChild(tabBtn);
    }

    const goldBtn = this.makeHtmlBtn(
      inst.golden
        ? `${svgIcon('star', 13)}<span>GOLDEN FORGED</span>`
        : `${svgIcon('spark', 13)}<span>GOLDEN UPGRADE (${goldenCost}G)</span>`,
      inst.golden
        ? 'kf-btn kf-btn-sm kf-btn-emerald'
        : 'kf-btn kf-btn-sm kf-btn-gold',
      () => {
        if (this.cb.onGoldenUpgrade(this.workbenchSlot)) {
          this.playConfirm();
        } else {
          this.playError();
        }
      },
    );
    goldBtn.disabled = inst.golden || p.gold < goldenCost;
    goldBtn.style.marginLeft = 'auto';
    goldBtn.dataset.testid = 'workbench-golden-btn';
    tabsRow.appendChild(goldBtn);

    // Split Grid
    const grid = document.createElement('div');
    grid.className = 'kf-workbench-grid';

    // Left column: Weapon Showcase + Mod Sockets + Live Telemetry
    const leftCol = document.createElement('div');
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.gap = '10px';

    const wepThumb = getWeaponThumbUrl(def.ammoType, def.class, def.uniqueId, inst.golden, 108, 68);
    const showcase = document.createElement('div');
    showcase.className = `kf-wb-showcase${inst.golden ? ' golden' : ''}`;
    showcase.innerHTML = `
      <div class="kf-wb-weapon-stage">
        ${wepThumb ? `<img class="kf-pixel-img" src="${wepThumb}" width="96" height="60" alt="${def.name}">` : svgIcon('weapondex', 28)}
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
          <strong style="font-family:var(--kf-font-display);font-size:16px;letter-spacing:0.08em;color:${inst.golden ? 'var(--kf-amber)' : '#fff'};">
            ${inst.golden ? '★ ' : ''}${def.name}
          </strong>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span class="kf-pill kf-pill-cyan">TIER ${def.weaponTier}</span>
          <span class="kf-pill">${AMMO_NAMES[def.ammoType]}</span>
          <span class="kf-pill ${inst.golden ? 'kf-pill-gold' : ''}">${inst.golden ? 'GOLDEN +35% DMG' : 'STANDARD FRAME'}</span>
        </div>
      </div>
    `;

    // Visual Mod Sockets Card
    const socketsCard = document.createElement('div');
    socketsCard.className = 'kf-card';
    socketsCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-family:var(--kf-font-display);font-size:12px;letter-spacing:0.1em;color:var(--kf-cyan);">ATTACHED MOD SOCKETS</strong>
        <span class="kf-pill">${inst.mods.length} / ${modLimit}</span>
      </div>
    `;

    const socketsGrid = document.createElement('div');
    socketsGrid.className = 'kf-mod-sockets';

    for (let i = 0; i < modLimit; i++) {
      const modId = inst.mods[i];
      if (modId) {
        const mDef = getModDef(modId);
        const sock = document.createElement('div');
        sock.className = 'kf-mod-socket';
        sock.style.borderLeft = `3px solid ${mDef.accentColor}`;
        sock.innerHTML = `
          <div style="min-width:0;">
            <strong style="display:block;font-family:var(--kf-font-display);font-size:11.5px;color:${mDef.accentColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${mDef.name}</strong>
            <div style="font-size:10px;color:var(--kf-text-dim);line-height:1.25;">${mDef.description}</div>
          </div>
        `;
        const detBtn = this.makeBtn('DETACH', 'kf-btn kf-btn-sm kf-btn-danger', () => {
          this.cb.onPlayUiClick();
          this.cb.onDetachMod(i, this.workbenchSlot);
        });
        detBtn.style.padding = '4px 7px';
        detBtn.style.fontSize = '9.5px';
        sock.appendChild(detBtn);
        socketsGrid.appendChild(sock);
      } else {
        const emptySock = document.createElement('div');
        emptySock.className = 'kf-mod-socket empty';
        emptySock.textContent = `+ EMPTY SOCKET ${i + 1}`;
        socketsGrid.appendChild(emptySock);
      }
    }
    socketsCard.appendChild(socketsGrid);

    // Live Stat Delta Comparison Table
    const statCard = document.createElement('div');
    statCard.className = 'kf-card';
    const previewLabel =
      previewStats && this.previewModId
        ? `PREVIEWING +${getModDef(this.previewModId).name}`
        : 'EFFECTIVE WEAPON TELEMETRY';
    statCard.innerHTML = `<strong style="font-family:var(--kf-font-display);font-size:11.5px;color:${previewStats ? 'var(--kf-amber)' : 'var(--kf-cyan)'};letter-spacing:0.1em;">${previewLabel}</strong>`;

    const table = document.createElement('table');
    table.className = 'kf-stat-table';
    table.innerHTML = this.renderStatDeltaRows(curStats, previewStats);
    statCard.appendChild(table);

    leftCol.append(showcase, socketsCard, statCard);

    // Right column: Backpack Mods
    const rightCol = document.createElement('div');
    rightCol.className = 'kf-card';
    rightCol.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <strong style="font-family:var(--kf-font-display);font-size:12.5px;color:var(--kf-rune);letter-spacing:0.1em;">${svgIcon('rune', 13)} BACKPACK MODS (${p.backpackMods.length})</strong>
        <span style="font-size:10.5px;color:var(--kf-text-dim);">Hover to preview deltas</span>
      </div>
    `;

    const bpList = document.createElement('div');
    bpList.style.display = 'flex';
    bpList.style.flexDirection = 'column';
    bpList.style.gap = '7px';

    if (p.backpackMods.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '12px';
      empty.style.color = 'var(--kf-text-muted)';
      empty.style.padding = '16px 8px';
      empty.style.textAlign = 'center';
      empty.textContent = 'Backpack empty. Open Mod Chests, visit Shops, or slay Bosses to collect mods & runes.';
      bpList.appendChild(empty);
    } else {
      const seen = new Map<string, number>();
      for (const id of p.backpackMods) {
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      for (const [modId, count] of seen.entries()) {
        const mDef = getModDef(modId);
        const isPrev = this.previewModId === modId;
        const item = document.createElement('div');
        item.className = 'kf-mod-socket';
        item.style.borderLeft = `3px solid ${mDef.accentColor}`;
        if (isPrev) {
          item.style.background = 'rgba(26, 38, 58, 0.94)';
          item.style.borderColor = mDef.accentColor;
        }
        item.addEventListener('mouseenter', () => {
          if (this.previewModId !== modId) {
            this.previewModId = modId;
            this.lastSig = '';
          }
        });
        item.innerHTML = `
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong style="font-family:var(--kf-font-display);font-size:12px;color:${mDef.accentColor};">${mDef.name}</strong>
              <span class="kf-pill" style="font-size:9px;padding:1px 5px;">${mDef.category.toUpperCase()} · T${mDef.tier} · ×${count}</span>
            </div>
            <div style="font-size:11px;color:var(--kf-text-dim);margin-top:2px;">${mDef.description}</div>
          </div>
        `;
        const attachBtn = this.makeBtn(
          inst.mods.length >= modLimit ? 'FULL' : 'ATTACH',
          'kf-btn kf-btn-sm kf-btn-emerald',
          () => {
            if (this.cb.onAttachMod(modId, this.workbenchSlot)) {
              this.playConfirm();
            } else {
              this.playError();
            }
          },
        );
        attachBtn.disabled = inst.mods.length >= modLimit;
        attachBtn.dataset.testid = `workbench-attach-${modId}`;
        item.appendChild(attachBtn);
        bpList.appendChild(item);
      }
    }

    rightCol.appendChild(bpList);
    grid.append(leftCol, rightCol);
    body.append(tabsRow, grid);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  private renderStatDeltaRows(
    cur: EffectiveWeaponStats,
    next: EffectiveWeaponStats | null,
  ): string {
    const fmt = (
      label: string,
      a: number,
      b: number | null,
      decimals: number,
      higherIsBetter: boolean,
      suffix = '',
    ): string => {
      const aStr = `${a.toFixed(decimals)}${suffix}`;
      if (b === null || Math.abs(b - a) < 1e-4) {
        return `<tr><td>${label}</td><td>${aStr}</td></tr>`;
      }
      const better = higherIsBetter ? b > a : b < a;
      const cls = better ? 'kf-delta-pos' : 'kf-delta-neg';
      const arrow = b > a ? '▲' : '▼';
      return `<tr><td>${label}</td><td>${aStr} <span class="${cls}">→ ${b.toFixed(decimals)}${suffix} ${arrow}</span></td></tr>`;
    };

    const curRof = 60 / Math.max(1, cur.cooldown);
    const nextRof = next ? 60 / Math.max(1, next.cooldown) : null;

    const elems = (s: EffectiveWeaponStats): string => {
      const list: string[] = [];
      if (s.burnTier > 0) list.push(`BURN ${s.burnTier}`);
      if (s.freezeTier > 0) list.push(`CRYO ${s.freezeTier}`);
      if (s.acidTier > 0) list.push(`ACID ${s.acidTier}`);
      if (s.explosiveTier > 0) list.push(`BLAST ${s.explosiveTier}`);
      if (s.radioactiveTier > 0) list.push(`RAD ${s.radioactiveTier}`);
      if (s.lightningTier > 0) list.push(`SHOCK ${s.lightningTier}`);
      return list.length > 0 ? list.join(', ') : 'KINETIC';
    };

    return [
      fmt('DAMAGE / SHOT', cur.damage, next?.damage ?? null, 1, true),
      fmt('FIRE RATE', curRof, nextRof, 2, true, ' /s'),
      fmt('PROJECTILES', cur.projectileAmount, next?.projectileAmount ?? null, 0, true),
      fmt('BURST COUNT', cur.burstCount, next?.burstCount ?? null, 0, true),
      fmt('SPREAD', cur.projectileSpread, next?.projectileSpread ?? null, 1, false, '°'),
      fmt('PROJ SPEED', cur.projectileSpeed, next?.projectileSpeed ?? null, 1, true),
      fmt('OVERHEAT / SHOT', cur.overheatPerShot * 100, next ? next.overheatPerShot * 100 : null, 1, false, '%'),
      fmt('BOUNCES / PIERCE', cur.extraBounces + cur.pierce, next ? next.extraBounces + next.pierce : null, 0, true),
      `<tr><td>ELEMENTS</td><td style="color:var(--kf-amber);">${elems(next ?? cur)}</td></tr>`,
    ].join('');
  }

  // ==========================================================================
  // 2. WEAPON SHOP
  // ==========================================================================

  private buildShop(state: SimState, isFreshOpen: boolean): void {
    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-gold kf-modal kf-modal-md${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'shop-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge gold">${svgIcon('shop', 18)}</div>
        <div>
          <div class="kf-modal-title" style="color:var(--kf-amber);">MIDGARD ARMS DEALER</div>
          <span class="kf-modal-subtitle">GOLD BALANCE: ${state.player.gold}G</span>
        </div>
      </div>
    `;
    const leaveBtn = this.makeHtmlBtn(
      `${svgIcon('bifrost', 14)}<span>OVERWORLD</span>${svgIcon('chevronRight', 13)}`,
      'kf-btn kf-btn-sm kf-btn-primary',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onLeaveToOverworld();
      },
    );
    header.appendChild(leaveBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    for (const offer of state.shopOffers) {
      const canAfford = !offer.purchased && state.player.gold >= offer.price;
      const card = document.createElement('div');
      card.className = `kf-card${offer.purchased ? ' locked' : ''}`;

      let detail = offer.kind.replace('_', ' ').toUpperCase();
      let visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;">${svgIcon('gold', 20)}</div>`;

      if (offer.weaponUniqueId !== undefined) {
        const wDef = getWeaponDef(offer.weaponUniqueId);
        detail = `TIER ${wDef.weaponTier} ${AMMO_NAMES[wDef.ammoType]} · DMG ${wDef.baseDamage}`;
        const thumb = getWeaponThumbUrl(wDef.ammoType, wDef.class, wDef.uniqueId, false, 56, 36);
        visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;">${thumb ? `<img class="kf-pixel-img" src="${thumb}" width="52" height="34" alt="">` : svgIcon('weapondex', 20)}</div>`;
      } else if (offer.modId) {
        const mDef = getModDef(offer.modId);
        detail = mDef.description;
        visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;color:${mDef.accentColor};border-color:${mDef.accentColor}66;">${svgIcon('rune', 22)}</div>`;
      } else if (offer.kind === 'heal') {
        detail = 'Restore 45% of maximum vitality immediately.';
        visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;color:var(--kf-emerald);border-color:rgba(61,242,153,0.45);">${svgIcon('heart', 20)}</div>`;
      } else if (offer.kind === 'ammo') {
        detail = 'Replenish all finite weapon ammunition reserves.';
        visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;color:var(--kf-amber);border-color:rgba(255,198,84,0.45);">${svgIcon('ammo', 20)}</div>`;
      } else if (offer.kind === 'golden_upgrade') {
        detail = 'Forge your active weapon into a Golden masterpiece (+35% DMG).';
        visualHtml = `<div class="kf-dex-thumb" style="width:58px;height:44px;color:var(--kf-amber);border-color:rgba(255,210,87,0.65);">${svgIcon('star', 20)}</div>`;
      }

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '11px';
      row.innerHTML = `
        ${visualHtml}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <strong style="font-family:var(--kf-font-display);font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${offer.name}</strong>
            <span class="kf-pill kf-pill-gold">${offer.price}G</span>
          </div>
          <div style="font-size:11.5px;color:var(--kf-text-dim);margin-top:2px;line-height:1.35;">${detail}</div>
        </div>
      `;
      card.appendChild(row);

      const buyBtn = this.makeHtmlBtn(
        offer.purchased
          ? `${svgIcon('check', 13)}<span>PURCHASED</span>`
          : canAfford
            ? `${svgIcon('gold', 13)}<span>BUY (${offer.price}G)</span>`
            : `${svgIcon('lock', 13)}<span>NEED ${offer.price}G</span>`,
        offer.purchased
          ? 'kf-btn kf-btn-sm'
          : canAfford
            ? 'kf-btn kf-btn-sm kf-btn-gold'
            : 'kf-btn kf-btn-sm',
        () => {
          if (this.cb.onBuyShopOffer(offer.id)) {
            this.playConfirm();
          } else {
            this.playError();
          }
        },
      );
      buyBtn.disabled = !canAfford;
      card.appendChild(buyBtn);
      grid.appendChild(card);
    }

    body.appendChild(grid);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 3. CAMPFIRE HEARTH
  // ==========================================================================

  private buildCampfire(state: SimState, isFreshOpen: boolean): void {
    const p = state.player;
    const activeWep = p.weapons[p.activeSlot];
    const activeDef = activeWep ? getWeaponDef(activeWep.uniqueId) : null;

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-gold kf-modal kf-modal-md${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'campfire-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge gold">${svgIcon('flame', 18)}</div>
        <div>
          <div class="kf-modal-title" style="color:var(--kf-amber);">MIDGARD CAMPFIRE HEARTH</div>
          <span class="kf-modal-subtitle">CHOOSE ONE BOON BEFORE CONTINUING</span>
        </div>
      </div>
    `;
    const skipBtn = this.makeHtmlBtn(
      `<span>LEAVE</span>${svgIcon('chevronRight', 13)}`,
      'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onLeaveToOverworld();
      },
    );
    header.appendChild(skipBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body';

    const choices: Array<{
      action: 'heal' | 'ammo' | 'upgrade' | 'skill';
      icon: IconName;
      badgeCls: string;
      title: string;
      desc: string;
      btnClass: string;
    }> = [
      {
        action: 'heal',
        icon: 'heart',
        badgeCls: 'emerald',
        title: 'REST & FULL HEAL',
        desc: `Restore full HP (${Math.ceil(p.hp)}/${p.maxHp}) and recharge energy shields.`,
        btnClass: 'kf-btn kf-btn-emerald',
      },
      {
        action: 'ammo',
        icon: 'ammo',
        badgeCls: 'gold',
        title: 'AMMO RESUPPLY CRATE',
        desc: 'Refill all 5 finite ammunition reserves (Bullets, Shells, Bolts, Energy, Explosives) to 100%.',
        btnClass: 'kf-btn kf-btn-gold',
      },
      {
        action: 'upgrade',
        icon: 'star',
        badgeCls: '',
        title: activeWep?.golden ? 'FORGE FREE MOD CRATE' : 'FORGE GOLDEN UPGRADE',
        desc: activeWep?.golden
          ? 'Receive a high-tier weapon mod or Norse rune in your backpack.'
          : `Upgrade ${activeDef?.name ?? 'active weapon'} to GOLDEN (+35% DMG, +15% ROF, -20% Overheat)!`,
        btnClass: 'kf-btn kf-btn-primary',
      },
      {
        action: 'skill',
        icon: 'tree',
        badgeCls: 'rune',
        title: 'MEDITATE BY THE FLAME',
        desc: 'Gain +1 Yggdrasil Skill Point immediately for permanent Outcast upgrades.',
        btnClass: 'kf-btn kf-btn-gold',
      },
    ];

    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    for (const c of choices) {
      const card = document.createElement('div');
      card.className = 'kf-card';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="kf-modal-icon-badge ${c.badgeCls}" style="width:34px;height:34px;">${svgIcon(c.icon, 18)}</div>
          <strong style="font-family:var(--kf-font-display);font-size:14px;letter-spacing:0.08em;color:#fff;">${c.title}</strong>
        </div>
        <div style="font-size:12px;color:var(--kf-text-dim);flex:1;line-height:1.45;">${c.desc}</div>
      `;
      const btn = this.makeBtn('CLAIM BOON', c.btnClass, () => {
        this.playConfirm();
        this.cb.onUseCampfire(c.action);
      });
      card.appendChild(btn);
      grid.appendChild(card);
    }

    body.appendChild(grid);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 4. PAUSE MENU (ESC) WITH LIVE RUN DOSSIER
  // ==========================================================================

  private buildPause(
    state: SimState,
    isFreshOpen: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const p = state.player;
    const outcast = getOutcastDef(p.outcastId);
    const node = getOverworldNode(state.currentNodeId);
    const portraitUrl = getOutcastPortraitUrl(p.outcastId, p.skinId, 42);

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-cyan kf-modal kf-modal-sm${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'pause-modal';

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const resumeKey =
      activeDevice === 'touch'
        ? ''
        : activeDevice === 'gamepad' && prompts
          ? stripBrackets(prompts.pause)
          : 'ESC';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge">${svgIcon('pause', 17)}</div>
        <div>
          <div class="kf-modal-title">PAUSED</div>
          <span class="kf-modal-subtitle">ACT ${state.act} · ${node.displayName} · LOOP ${state.loopCount}</span>
        </div>
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '9px';

    // Run Dossier Strip
    const dossier = document.createElement('div');
    dossier.className = 'kf-pause-dossier';
    dossier.innerHTML = `
      <div class="kf-hub-portrait" style="border-color:${outcast.accentColor};">
        ${portraitUrl ? `<img class="kf-pixel-img" src="${portraitUrl}" width="36" height="36" alt="${outcast.name}">` : svgIcon('clone', 18)}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-family:var(--kf-font-display);font-size:13.5px;letter-spacing:0.08em;color:#fff;">${outcast.name} · LVL ${p.level}</strong>
          <span style="font-family:var(--kf-font);font-size:11px;color:var(--kf-text-dim);">${formatRunTime(state.runStats.elapsedTicks)}</span>
        </div>
        <div style="display:flex;gap:10px;font-family:var(--kf-font);font-size:11px;margin-top:3px;">
          <span style="color:var(--kf-emerald);">HP ${Math.ceil(p.hp)}/${p.maxHp}</span>
          <span style="color:var(--kf-amber);">${p.gold}G</span>
          <span style="color:var(--kf-cyan);">${p.kills} KILLS</span>
        </div>
      </div>
    `;

    const resumeBtn = this.makeHtmlBtn(
      `${svgIcon('play', 14)}<span>RESUME</span>${resumeKey ? `<span class="kf-kbd kf-kbd-cyan">${resumeKey}</span>` : ''}`,
      'kf-btn kf-btn-primary',
      () => {
        this.playConfirm();
        this.cb.onResumeGame();
      },
    );
    resumeBtn.dataset.testid = 'pause-resume-btn';
    resumeBtn.dataset.gpInitial = 'true';

    const optBtn = this.makeHtmlBtn(
      `${svgIcon('options', 14)}<span>OPTIONS</span>`,
      'kf-btn',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onOpenOptions();
      },
    );
    optBtn.dataset.testid = 'pause-options-btn';

    const kbBtn = this.makeHtmlBtn(
      `${svgIcon('keybinds', 14)}<span>KEYBINDS &amp; CONTROLS</span>`,
      'kf-btn',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onOpenKeybinds();
      },
    );
    kbBtn.dataset.testid = 'pause-keybinds-btn';

    const hubBtn = this.makeHtmlBtn(
      `${svgIcon('hub', 14)}<span>RETURN TO OUTPOST HUB</span>`,
      'kf-btn kf-btn-gold',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onReturnToHub();
      },
    );
    hubBtn.dataset.testid = 'pause-hub-btn';

    const titleBtn = this.makeHtmlBtn(
      `${svgIcon('close', 14)}<span>TITLE SCREEN</span>`,
      'kf-btn kf-btn-danger',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onReturnToTitle();
      },
    );
    titleBtn.dataset.testid = 'pause-title-btn';

    body.append(dossier, resumeBtn, optBtn, kbBtn, hubBtn, titleBtn);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 5. OPTIONS MODAL (BALANCED 2-COLUMN CARDS · ZERO CLIPPING · CUSTOM CONTROLS)
  // ==========================================================================

  private buildOptions(
    save: SaveData,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
    isFreshOpen: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const rs = save.renderSettings;
    const as = save.audioSettings;
    const cs = save.controllerSettings ?? DEFAULT_CONTROLLER_SETTINGS;
    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const doneKey =
      activeDevice === 'touch'
        ? ''
        : activeDevice === 'gamepad' && prompts
          ? stripBrackets(prompts.cancel)
          : 'ESC';

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-cyan kf-modal${isFreshOpen ? ' kf-entering' : ''}`;
    modal.style.width = 'min(960px, 96vw)';
    modal.dataset.testid = 'options-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge">${svgIcon('options', 18)}</div>
        <div>
          <div class="kf-modal-title">${UI_LABELS.optionsTitle}</div>
          <span class="kf-modal-subtitle">CHANGES ARE SAVED AUTOMATICALLY</span>
        </div>
      </div>
    `;
    const closeBtn = this.makeHtmlBtn(
      `${svgIcon('check', 13)}<span>DONE</span>${doneKey ? `<span class="kf-kbd kf-kbd-cyan">${doneKey}</span>` : ''}`,
      'kf-btn kf-btn-sm kf-btn-primary',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onCloseOverlay();
      },
    );
    closeBtn.dataset.testid = 'options-close-btn';
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    const cols = document.createElement('div');
    cols.className = 'kf-grid-2';
    cols.style.gap = '14px';

    // ---- LEFT COLUMN: DISPLAY & VISUALS + ART PACK ----
    const leftCol = document.createElement('div');
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.gap = '12px';

    const displayCard = this.makeSectionCard('display', 'DISPLAY & VISUALS');

    // Target FPS Segmented Control
    const fpsRow = this.makeOptionRow('TARGET FPS', '60 Hz sim · high-FPS pacing');
    const fpsSeg = document.createElement('div');
    fpsSeg.className = 'kf-seg-group';
    for (const fps of [30, 60, 120] as TargetFps[]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `kf-seg-btn${rs.targetFps === fps ? ' active' : ''}`;
      b.textContent = `${fps}`;
      b.dataset.testid = `opt-fps-${fps}`;
      b.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.cb.onUpdateRenderSettings({ targetFps: fps });
      });
      fpsSeg.appendChild(b);
    }
    fpsRow.appendChild(fpsSeg);

    // Classic 60 FPS Native Pixel-Snap
    const snapRow = this.makeOptionRow('PIXEL-SNAP 60', 'Exact integer 640×360 texel lock');
    snapRow.appendChild(
      this.makeToggleBtn(
        rs.pixelSnap60,
        rs.pixelSnap60 ? 'LOCKED' : 'SMOOTH',
        'gold',
        () => this.cb.onUpdateRenderSettings({ pixelSnap60: !rs.pixelSnap60 }),
        'opt-pixelsnap-toggle',
      ),
    );

    // Screenshake Slider
    const shakeRow = this.makeSliderRow(
      'SCREENSHAKE',
      rs.screenshakeScale,
      0,
      2,
      0.1,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateRenderSettings({ screenshakeScale: v }),
    );

    // Lighting Toggle
    const lightRow = this.makeOptionRow('2D DYNAMIC LIGHTING', 'Muzzle blooms & point lights');
    lightRow.appendChild(
      this.makeToggleBtn(rs.lightingEnabled, rs.lightingEnabled ? 'ON' : 'OFF', '', () =>
        this.cb.onUpdateRenderSettings({ lightingEnabled: !rs.lightingEnabled }),
      ),
    );

    // Blood Toggle
    const bloodRow = this.makeOptionRow('BLOOD & GORE', 'Persistent decals & overkill gibs');
    bloodRow.appendChild(
      this.makeToggleBtn(rs.bloodEnabled, rs.bloodEnabled ? 'ON' : 'OFF', '', () =>
        this.cb.onUpdateRenderSettings({ bloodEnabled: !rs.bloodEnabled }),
      ),
    );

    displayCard.append(fpsRow, snapRow, shakeRow, lightRow, bloodRow);

    // Art Pack Card
    const packCard = this.makeSectionCard('pack', 'ART & AUDIO PACK');
    const packRow = this.makeOptionRow(
      'ACTIVE ASSET PACK',
      customPackAvailable ? 'Live zero-restart pack switch' : 'Load folder from Title Screen',
    );
    const packSeg = document.createElement('div');
    packSeg.className = 'kf-seg-group';
    const biBtn = document.createElement('button');
    biBtn.type = 'button';
    biBtn.className = `kf-seg-btn${packMode === 'builtin' ? ' active' : ''}`;
    biBtn.textContent = 'BUILT-IN';
    biBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      void this.cb.onSetPackMode('builtin');
    });
    const cuBtn = document.createElement('button');
    cuBtn.type = 'button';
    cuBtn.className = `kf-seg-btn${packMode === 'custom' ? ' active gold' : ''}`;
    cuBtn.textContent = 'CUSTOM';
    cuBtn.disabled = !customPackAvailable;
    cuBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      void this.cb.onSetPackMode('custom');
    });
    packSeg.append(biBtn, cuBtn);
    packRow.appendChild(packSeg);
    packCard.appendChild(packRow);

    leftCol.append(displayCard, packCard);

    // ---- RIGHT COLUMN: AUDIO MIXER + CONTROLLER & TOUCH ----
    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = '12px';

    const audioCard = this.makeSectionCard(as.muted ? 'mute' : 'volume', 'AUDIO MIXER');
    const muteRow = this.makeOptionRow('AUDIO OUTPUT', 'Master audio enable / mute');
    muteRow.appendChild(
      this.makeToggleBtn(
        !as.muted,
        as.muted ? 'MUTED' : 'ACTIVE',
        '',
        () => this.cb.onUpdateAudioSettings({ muted: !as.muted }),
      ),
    );
    const masterRow = this.makeSliderRow(
      'MASTER VOLUME',
      as.masterVolume,
      0,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateAudioSettings({ masterVolume: v }),
    );
    const musicRow = this.makeSliderRow(
      'MUSIC VOLUME',
      as.musicVolume,
      0,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateAudioSettings({ musicVolume: v }),
    );
    const sfxRow = this.makeSliderRow(
      'SFX VOLUME',
      as.sfxVolume,
      0,
      1,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateAudioSettings({ sfxVolume: v }),
    );
    audioCard.append(muteRow, masterRow, musicRow, sfxRow);

    // Controller & Touch Card
    const ctrlSection = document.createElement('div');
    ctrlSection.className = 'kf-card kf-controller-section';
    ctrlSection.dataset.testid = 'options-controller-section';

    const ctrlSectionHeader = document.createElement('div');
    ctrlSectionHeader.className = 'kf-controller-section-title';
    const ctrlTitle = document.createElement('span');
    ctrlTitle.style.display = 'inline-flex';
    ctrlTitle.style.alignItems = 'center';
    ctrlTitle.style.gap = '6px';
    ctrlTitle.innerHTML = `${svgIcon('gamepad', 14)}<span>CONTROLLER &amp; TOUCH</span>`;

    const statusMeta = formatControllerStatusLabel(controllerStatus);
    const statusBadge = makeControllerBadgeEl(statusMeta, 'options-controller-badge');
    statusBadge.style.padding = '3px 8px';
    statusBadge.style.fontSize = '10px';
    ctrlSectionHeader.append(ctrlTitle, statusBadge);

    const deadzoneRow = this.makeSliderRow(
      'STICK DEADZONE',
      cs.deadzone,
      0.08,
      0.35,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateControllerSettings({ deadzone: v }),
      'opt-controller-deadzone',
    );

    const rumbleRow = this.makeOptionRow('HAPTIC RUMBLE', 'Vibration on fire, hits & bosses');
    rumbleRow.appendChild(
      this.makeToggleBtn(
        cs.vibrationEnabled,
        cs.vibrationEnabled ? 'ON' : 'OFF',
        '',
        () => this.cb.onUpdateControllerSettings({ vibrationEnabled: !cs.vibrationEnabled }),
        'opt-controller-rumble',
      ),
    );

    const autoFireRow = this.makeOptionRow('STICK AUTO-FIRE', 'Right-stick deflection fires');
    autoFireRow.appendChild(
      this.makeToggleBtn(
        cs.twinStickAutoFire,
        cs.twinStickAutoFire ? 'ON' : 'OFF',
        'gold',
        () => this.cb.onUpdateControllerSettings({ twinStickAutoFire: !cs.twinStickAutoFire }),
        'opt-controller-autofire',
      ),
    );

    const touchOpacityRow = this.makeSliderRow(
      'TOUCH OPACITY',
      cs.touchOpacity,
      0.3,
      1.0,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateControllerSettings({ touchOpacity: v }),
      'opt-touch-opacity',
    );

    const touchScaleRow = this.makeSliderRow(
      'TOUCH SIZE',
      cs.touchScale,
      0.75,
      1.35,
      0.05,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateControllerSettings({ touchScale: v }),
      'opt-touch-scale',
    );

    ctrlSection.append(
      ctrlSectionHeader,
      deadzoneRow,
      rumbleRow,
      autoFireRow,
      touchOpacityRow,
      touchScaleRow,
    );

    rightCol.append(audioCard, ctrlSection);
    cols.append(leftCol, rightCol);
    body.appendChild(cols);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  private makeSectionCard(icon: IconName, title: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'kf-card';
    card.style.gap = '7px';
    const hdr = document.createElement('div');
    hdr.className = 'kf-controller-section-title';
    hdr.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${svgIcon(icon, 14)}<span>${title}</span></span>`;
    card.appendChild(hdr);
    return card;
  }

  private makeToggleBtn(
    isOn: boolean,
    label: string,
    variant: '' | 'gold' | 'danger',
    onClick: () => void,
    testId?: string,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kf-toggle${variant ? ` ${variant}` : ''}${isOn ? ' on' : ''}`;
    if (testId) btn.dataset.testid = testId;
    btn.innerHTML = `
      <span class="kf-toggle-track"><span class="kf-toggle-thumb"></span></span>
      <span>${label}</span>
    `;
    btn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      onClick();
    });
    return btn;
  }

  private makeOptionRow(title: string, subtitle: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kf-option-row';
    row.style.padding = '7px 10px';
    const left = document.createElement('div');
    left.style.minWidth = '0';
    left.innerHTML = `
      <div class="kf-option-title" style="font-size:12px;">${title}</div>
      <div class="kf-option-desc" style="font-size:10.5px;">${subtitle}</div>
    `;
    row.appendChild(left);
    return row;
  }

  private makeSliderRow(
    title: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    onChange: (v: number) => void,
    testId?: string,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kf-option-row';
    row.style.padding = '7px 10px';
    const left = document.createElement('div');
    left.innerHTML = `<div class="kf-option-title" style="font-size:12px;">${title}</div>`;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '9px';

    const valLabel = document.createElement('span');
    valLabel.style.width = '40px';
    valLabel.style.textAlign = 'right';
    valLabel.style.fontFamily = 'var(--kf-font)';
    valLabel.style.fontSize = '11px';
    valLabel.style.fontWeight = '800';
    valLabel.style.color = 'var(--kf-cyan)';
    valLabel.textContent = format(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'kf-range';
    slider.style.width = '144px';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    const updatePct = (v: number) => {
      const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
      slider.style.setProperty('--val-pct', `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`);
    };
    updatePct(value);

    if (testId) {
      slider.dataset.testid = testId;
    }
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      valLabel.textContent = format(v);
      updatePct(v);
      onChange(v);
    });

    right.append(slider, valLabel);
    row.append(left, right);
    return row;
  }

  // ==========================================================================
  // 6. KEYBINDS & CONTROLLER / TOUCH LAYOUT (2-COLUMN KEYCAPS + COMPACT REF)
  // ==========================================================================

  private buildKeybinds(
    save: SaveData,
    rebindingAction: KeybindAction | null,
    isFreshOpen: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-cyan kf-modal${isFreshOpen ? ' kf-entering' : ''}`;
    modal.style.width = 'min(920px, 95vw)';
    modal.dataset.testid = 'keybinds-modal';

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const doneKey =
      activeDevice === 'touch'
        ? ''
        : activeDevice === 'gamepad' && prompts
          ? stripBrackets(prompts.cancel)
          : 'ESC';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge">${svgIcon('keybinds', 18)}</div>
        <div>
          <div class="kf-modal-title">KEYBINDS &amp; CONTROLS</div>
          <span class="kf-modal-subtitle">CLICK ANY KEYCAP TO REBIND · KEYBOARD · GAMEPAD · TOUCH</span>
        </div>
      </div>
    `;

    const rightHdr = document.createElement('div');
    rightHdr.style.display = 'flex';
    rightHdr.style.gap = '7px';
    const resetBtn = this.makeHtmlBtn(
      `${svgIcon('retry', 13)}<span>RESET</span>`,
      'kf-btn kf-btn-sm kf-btn-gold',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onResetKeybinds();
      },
    );
    resetBtn.dataset.testid = 'keybinds-reset-btn';
    const closeBtn = this.makeHtmlBtn(
      `${svgIcon('check', 13)}<span>DONE</span>${doneKey ? `<span class="kf-kbd kf-kbd-cyan">${doneKey}</span>` : ''}`,
      'kf-btn kf-btn-sm kf-btn-primary',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onCloseOverlay();
      },
    );
    closeBtn.dataset.testid = 'keybinds-close-btn';
    rightHdr.append(resetBtn, closeBtn);
    header.appendChild(rightHdr);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '9px';
    body.style.padding = '12px 16px';

    // 2-Column Keyboard Keycap Grid
    const kbGrid = document.createElement('div');
    kbGrid.className = 'kf-keybind-grid';

    for (const meta of KEYBIND_ACTIONS) {
      const boundCode = save.keybinds[meta.action] ?? '';
      const listening = rebindingAction === meta.action;
      const row = document.createElement('div');
      row.className = 'kf-keybind-row';

      const info = document.createElement('div');
      info.style.minWidth = '0';
      info.innerHTML = `
        <div style="font-family:var(--kf-font-display);font-size:12.5px;font-weight:700;letter-spacing:0.06em;color:#fff;">${meta.label}</div>
        <div style="font-size:10px;color:var(--kf-text-muted);">ALT: ${meta.secondaryHint}</div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = listening
        ? 'kf-btn kf-btn-sm kf-btn-gold'
        : 'kf-kbd kf-kbd-lg kf-kbd-cyan';
      btn.style.cursor = 'pointer';
      btn.textContent = listening ? 'PRESS KEY...' : formatKeyCode(boundCode);
      btn.dataset.testid = `keybind-btn-${meta.action}`;
      btn.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.cb.onStartRebind(meta.action);
      });

      row.append(info, btn);
      kbGrid.appendChild(row);
    }

    // Controller & Touch Reference Card
    const profile = controllerStatus?.gamepadProfile ?? 'xbox';
    const glyphs = getGamepadGlyphs(profile);
    const statusMeta = formatControllerStatusLabel(controllerStatus);
    const familyLabel =
      profile === 'xbox'
        ? 'XBOX / XINPUT LAYOUT'
        : profile === 'playstation'
          ? 'PLAYSTATION (DUALSENSE / DUALSHOCK)'
          : profile === 'nintendo'
            ? 'NINTENDO SWITCH PRO / JOY-CON'
            : profile === 'steamdeck'
              ? 'STEAM DECK LAYOUT'
              : profile === 'tesla'
                ? 'TESLA CONTROLLER LAYOUT'
                : 'STANDARD GAMEPAD LAYOUT';

    const refCard = document.createElement('div');
    refCard.className = 'kf-card kf-controller-section';
    refCard.dataset.testid = 'keybinds-controller-layout';

    const refTop = document.createElement('div');
    refTop.className = 'kf-controller-section-title';
    refTop.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        ${svgIcon('gamepad', 15)}
        <span>CONTROLLER &amp; TOUCH · <span style="color:var(--kf-text-dim);">${familyLabel}</span></span>
      </div>
    `;
    const refBadge = makeControllerBadgeEl(statusMeta);
    refBadge.style.padding = '3px 9px';
    refBadge.style.fontSize = '10px';
    refTop.appendChild(refBadge);

    const gpRows: Array<[string, string]> = [
      ['MOVE / NAV', `${glyphs.move} / D-PAD`],
      ['AIM / SCROLL', glyphs.aim],
      ['FIRE WEAPON', glyphs.fire],
      ['ABILITY', glyphs.ability],
      ['POWER', glyphs.power],
      ['SWAP WEAPON', glyphs.swap],
      ['USE / CONFIRM', `${glyphs.interact} (${glyphs.confirm})`],
      ['VENT / BACK', `${glyphs.vent} (${glyphs.cancel})`],
      ['WORKBENCH', glyphs.workbench],
      ['PAUSE MENU', glyphs.pause],
      ['SWITCH TABS', `${glyphs.tabPrev} / ${glyphs.tabNext}`],
    ];

    const gpGrid = document.createElement('div');
    gpGrid.className = 'kf-controller-grid';
    gpGrid.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    gpGrid.style.gap = '6px 8px';
    for (const [actionLabel, glyphLabel] of gpRows) {
      const cell = document.createElement('div');
      cell.className = 'kf-controller-map-row';
      cell.style.padding = '5px 8px';
      cell.style.fontSize = '11px';
      cell.innerHTML = `
        <span style="color:var(--kf-text-dim);font-family:var(--kf-font-display);font-weight:700;letter-spacing:0.05em;">${actionLabel}</span>
        <span class="kf-glyph-chip">${glyphLabel}</span>
      `;
      gpGrid.appendChild(cell);
    }

    const touchRef = document.createElement('div');
    touchRef.style.padding = '7px 10px';
    touchRef.style.borderRadius = '4px';
    touchRef.style.background = 'rgba(10, 15, 24, 0.85)';
    touchRef.style.borderLeft = '3px solid var(--kf-gold)';
    touchRef.style.fontSize = '11px';
    touchRef.style.color = 'var(--kf-text-dim)';
    touchRef.innerHTML = `
      <strong style="color:var(--kf-amber);font-family:var(--kf-font-display);letter-spacing:0.08em;">TOUCH DUAL-STICK (MOBILE / TESLA):</strong>
      Left Stick moves · Right Stick aims &amp; auto-fires · Arc Buttons trigger Ability, Power, Swap &amp; Use/Vent. Auto-appears only on touch input.
    `;

    refCard.append(refTop, gpGrid, touchRef);
    body.append(kbGrid, refCard);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 7. VICTORY / LOOP MODE PROMPT
  // ==========================================================================

  private buildVictory(state: SimState, isFreshOpen: boolean): void {
    const outcast = getOutcastDef(state.player.outcastId);
    const nextLoop = state.loopCount + 1;
    const portraitUrl = getOutcastPortraitUrl(state.player.outcastId, state.player.skinId, 54);

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-gold kf-modal kf-modal-md${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'victory-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge gold">${svgIcon('trophy', 20)}</div>
        <div>
          <div class="kf-modal-title" style="color:var(--kf-amber);">${UI_LABELS.victoryTitle}</div>
          <span class="kf-modal-subtitle">${UI_LABELS.victorySubtitle}</span>
        </div>
      </div>
      <span class="kf-pill kf-pill-gold">${svgIcon('star', 11)} KRUNKEDSLAYER</span>
    `;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.innerHTML = `
      <div class="kf-summary-hero" style="border-color:rgba(255,210,87,0.45);background:linear-gradient(135deg,rgba(62,40,14,0.65),rgba(12,18,30,0.9));">
        <div class="kf-outcast-thumb" style="width:56px;height:56px;border-color:var(--kf-amber);">
          ${portraitUrl ? `<img class="kf-pixel-img" src="${portraitUrl}" width="50" height="50" alt="${outcast.name}">` : svgIcon('trophy', 24)}
        </div>
        <div style="flex:1;">
          <div style="font-family:var(--kf-font-display);font-size:15px;font-weight:800;letter-spacing:0.08em;color:var(--kf-emerald);">
            ${outcast.name} VANQUISHED CORRUPTED KRUNKED AT BALDER'S SHRINE!
          </div>
          <div style="font-size:12px;color:var(--kf-text-dim);margin-top:3px;">
            Loop ${nextLoop} unlocks escalated enemy speed, mythic drop odds, and endless leaderboard glory.
          </div>
        </div>
      </div>
      ${this.renderRunSummaryGrid(state)}
    `;

    const footer = document.createElement('div');
    footer.className = 'kf-modal-footer';

    const hubBtn = this.makeHtmlBtn(
      `${svgIcon('hub', 14)}<span>RETURN TO HUB</span>`,
      'kf-btn kf-btn-primary',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onReturnToHub();
      },
    );
    hubBtn.dataset.testid = 'victory-hub-btn';

    const loopBtn = this.makeHtmlBtn(
      `${svgIcon('loop', 15)}<span>ENTER LOOP ${nextLoop} (ENDLESS)</span>${svgIcon('chevronRight', 13)}`,
      'kf-btn kf-btn-gold',
      () => {
        this.playConfirm();
        this.cb.onStartNextLoop();
      },
    );
    loopBtn.dataset.testid = 'victory-loop-btn';
    loopBtn.dataset.gpInitial = 'true';

    footer.append(hubBtn, loopBtn);
    modal.append(header, body, footer);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 8. GAME OVER RUN SUMMARY
  // ==========================================================================

  private buildGameOver(state: SimState, isFreshOpen: boolean): void {
    const outcast = getOutcastDef(state.player.outcastId);
    const lokiUrl = getLokiPortraitUrl(44);
    const w0 = state.player.weapons[0];
    const w0Def = w0 ? getWeaponDef(w0.uniqueId) : null;
    const w0Thumb = w0Def
      ? getWeaponThumbUrl(w0Def.ammoType, w0Def.class, w0Def.uniqueId, Boolean(w0?.golden), 52, 32)
      : '';

    const modal = document.createElement('div');
    modal.className = `kf-panel kf-panel-crimson kf-modal kf-modal-md${isFreshOpen ? ' kf-entering' : ''}`;
    modal.dataset.testid = 'gameover-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div class="kf-modal-title-group">
        <div class="kf-modal-icon-badge crimson">${svgIcon('skull', 19)}</div>
        <div>
          <div class="kf-modal-title" style="color:var(--kf-crimson);">${UI_LABELS.gameoverTitle}</div>
          <span class="kf-modal-subtitle">${UI_LABELS.gameoverSubtitle}</span>
        </div>
      </div>
      <span class="kf-pill kf-pill-crimson">ACT ${state.act} · LOOP ${state.loopCount}</span>
    `;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.innerHTML = `
      <div class="kf-summary-hero" style="border-color:rgba(255,61,94,0.42);background:linear-gradient(135deg,rgba(54,14,24,0.68),rgba(11,16,26,0.92));">
        <div class="kf-loki-tank" style="width:52px;height:52px;">
          ${lokiUrl ? `<img class="kf-pixel-img" src="${lokiUrl}" width="46" height="46" alt="Loki">` : svgIcon('loki', 22)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--kf-font-display);font-size:11px;font-weight:800;letter-spacing:0.12em;color:var(--kf-emerald);">LOKI · CLONE BAY LOG</div>
          <div style="font-size:12.5px;color:#edf5ff;margin-top:2px;">
            "Splendid mess, ${outcast.name}. The Jotunn-Matic is already printing a fresher copy — try dodging next time."
          </div>
        </div>
        ${
          w0Def
            ? `<div class="kf-loadout-chip" style="flex:0 0 auto;">
                ${w0Thumb ? `<img class="kf-pixel-img" src="${w0Thumb}" width="38" height="24" alt="">` : ''}
                <span>${w0Def.name}</span>
              </div>`
            : ''
        }
      </div>
      ${this.renderRunSummaryGrid(state)}
    `;

    const footer = document.createElement('div');
    footer.className = 'kf-modal-footer';

    const hubBtn = this.makeHtmlBtn(
      `${svgIcon('hub', 14)}<span>RETURN TO HUB</span>`,
      'kf-btn',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onReturnToHub();
      },
    );
    hubBtn.dataset.testid = 'gameover-hub-btn';

    const retryBtn = this.makeHtmlBtn(
      `${svgIcon('retry', 14)}<span>RETRY RUN</span>${svgIcon('chevronRight', 13)}`,
      'kf-btn kf-btn-primary',
      () => {
        this.playConfirm();
        this.cb.onRetryRun();
      },
    );
    retryBtn.dataset.testid = 'gameover-retry-btn';
    retryBtn.dataset.gpInitial = 'true';

    footer.append(hubBtn, retryBtn);
    modal.append(header, body, footer);
    this.backdrop.appendChild(modal);
  }

  private renderRunSummaryGrid(state: SimState): string {
    const rs = state.runStats;
    const cells = [
      { lbl: 'SCORE', val: String(rs.score), color: 'var(--kf-amber)' },
      { lbl: 'FOES SLAIN', val: String(state.player.kills), color: 'var(--kf-crimson)' },
      { lbl: 'ROOMS CLEARED', val: String(rs.roomsCleared), color: 'var(--kf-cyan)' },
      { lbl: 'BOSSES SLAIN', val: `${rs.bossesDefeated.length}/6`, color: 'var(--kf-emerald)' },
      { lbl: 'WALLS SHATTERED', val: String(rs.wallsDestroyed), color: 'var(--kf-gold)' },
      { lbl: 'RUN TIME', val: formatRunTime(rs.elapsedTicks), color: '#eef4fc' },
    ];
    return `
      <div class="kf-summary-grid">
        ${cells
          .map(
            (c) => `
          <div class="kf-summary-cell">
            <div class="kf-summary-val" style="color:${c.color};">${c.val}</div>
            <div class="kf-summary-lbl">${c.lbl}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    `;
  }

  private makeBtn(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private makeHtmlBtn(html: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.innerHTML = html;
    btn.addEventListener('click', onClick);
    return btn;
  }

  public dispose(): void {
    this.backdrop.remove();
  }
}
