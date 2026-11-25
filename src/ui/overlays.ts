// ============================================================================
// KRUNKEDFALL — Gameplay & System Overlays
// ============================================================================
// Workbench (TAB), Weapon Shop, Campfire, Pause (ESC), Options, Keybinds,
// Victory / Loop Mode Prompt, and Game Over Run Summary.

import {
  AMMO_NAMES,
  type AssetPackMode,
  type AudioSettings,
  type RenderSettings,
  type SaveData,
  type SimState,
  type TargetFps,
} from '../contracts/index.js';
import {
  UI_LABELS,
  getModDef,
  getOutcastDef,
  getWeaponDef,
} from '../data/index.js';
import {
  KEYBIND_ACTIONS,
  formatKeyCode,
  type KeybindAction,
} from '../input/index.js';
import {
  computeEffectiveWeaponStats,
  getWeaponModLimit,
  type EffectiveWeaponStats,
} from '../sim/index.js';

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
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onStartRebind(action: KeybindAction): void;
  onResetKeybinds(): void;
  onPlayUiClick(): void;
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

  public render(
    kind: ModalOverlayKind,
    state: SimState,
    save: SaveData,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
    rebindingAction: KeybindAction | null,
  ): void {
    if (kind === 'none') {
      if (this.lastKind !== 'none') {
        this.lastKind = 'none';
        this.lastSig = '';
        this.backdrop.style.display = 'none';
        this.backdrop.innerHTML = '';
      }
      return;
    }

    this.backdrop.style.display = 'flex';

    // Keep Options sliders interactive without tearing down DOM on volume drag
    const sig = this.computeSignature(
      kind,
      state,
      save,
      packMode,
      customPackAvailable,
      rebindingAction,
    );
    if (kind === this.lastKind && sig === this.lastSig) {
      return;
    }
    this.lastKind = kind;
    this.lastSig = sig;

    this.backdrop.innerHTML = '';
    switch (kind) {
      case 'workbench':
        this.buildWorkbench(state);
        break;
      case 'shop':
        this.buildShop(state);
        break;
      case 'campfire':
        this.buildCampfire(state);
        break;
      case 'pause':
        this.buildPause(state);
        break;
      case 'options':
        this.buildOptions(save, packMode, customPackAvailable);
        break;
      case 'keybinds':
        this.buildKeybinds(save, rebindingAction);
        break;
      case 'victory':
        this.buildVictory(state);
        break;
      case 'gameover':
        this.buildGameOver(state);
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
  ): string {
    const p = state.player;
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
        return [kind, state.screenMode, state.currentNodeId].join('|');
      case 'options':
        // Deliberately omit continuous slider floats so dragging sliders stays smooth
        return [
          kind,
          save.renderSettings.targetFps,
          save.renderSettings.pixelSnap60 ? '1' : '0',
          save.renderSettings.lightingEnabled ? '1' : '0',
          save.renderSettings.bloodEnabled ? '1' : '0',
          save.audioSettings.muted ? '1' : '0',
          packMode,
          customPackAvailable ? '1' : '0',
        ].join('|');
      case 'keybinds':
        return [
          kind,
          rebindingAction ?? '',
          Object.entries(save.keybinds)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v}`)
            .join(','),
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

  private buildWorkbench(state: SimState): void {
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
    modal.className = 'kf-panel kf-panel-cyan kf-modal';
    modal.dataset.testid = 'workbench-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div>
        <span class="kf-modal-title">${UI_LABELS.workbenchTitle}</span>
        <span class="kf-modal-subtitle">GOLD: ${p.gold}G · MOD LIMIT: ${inst.mods.length}/${modLimit}</span>
      </div>
    `;
    const closeBtn = this.makeBtn('CLOSE [TAB / ESC]', 'kf-btn kf-btn-sm kf-btn-danger', () => {
      this.cb.onPlayUiClick();
      this.cb.onCloseOverlay();
    });
    closeBtn.dataset.testid = 'workbench-close-btn';
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    // Slot Selector Tabs
    const tabsRow = document.createElement('div');
    tabsRow.style.display = 'flex';
    tabsRow.style.gap = '8px';
    tabsRow.style.marginBottom = '12px';

    for (let s = 0; s < 2; s++) {
      const slotIdx = s as 0 | 1;
      const w = p.weapons[slotIdx];
      const wDef = w ? getWeaponDef(w.uniqueId) : null;
      const tabBtn = this.makeBtn(
        wDef
          ? `SLOT ${s + 1}: ${w!.golden ? '★ ' : ''}${wDef.name} (T${wDef.weaponTier})`
          : `SLOT ${s + 1}: EMPTY`,
        this.workbenchSlot === slotIdx
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
      tabsRow.appendChild(tabBtn);
    }

    const goldBtn = this.makeBtn(
      inst.golden
        ? '★ GOLDEN UPGRADED'
        : `GOLDEN UPGRADE (${goldenCost}G)`,
      inst.golden
        ? 'kf-btn kf-btn-sm kf-btn-emerald'
        : 'kf-btn kf-btn-sm kf-btn-gold',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onGoldenUpgrade(this.workbenchSlot);
      },
    );
    goldBtn.disabled = inst.golden || p.gold < goldenCost;
    goldBtn.style.marginLeft = 'auto';
    goldBtn.dataset.testid = 'workbench-golden-btn';
    tabsRow.appendChild(goldBtn);

    // Split Grid: Left = Attached Mods + Live Stat Table, Right = Backpack Mods
    const grid = document.createElement('div');
    grid.className = 'kf-workbench-grid';

    // Left column
    const leftCol = document.createElement('div');
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.gap = '10px';

    const wepCard = document.createElement('div');
    wepCard.className = 'kf-card';
    wepCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:14px;color:${inst.golden ? 'var(--kf-amber)' : '#fff'};">
          ${inst.golden ? '★ ' : ''}${def.name}
        </strong>
        <span class="kf-pill kf-pill-cyan">TIER ${def.weaponTier} · ${AMMO_NAMES[def.ammoType]}</span>
      </div>
      <div style="font-size:11px;color:var(--kf-text-dim);">
        ATTACHED MODS (${inst.mods.length}/${modLimit}) — Click DETACH to return to backpack
      </div>
    `;

    const attachedList = document.createElement('div');
    attachedList.style.display = 'flex';
    attachedList.style.flexDirection = 'column';
    attachedList.style.gap = '6px';

    if (inst.mods.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.color = 'var(--kf-text-muted)';
      empty.textContent = 'No mods attached yet. Attach mods from your backpack on the right.';
      attachedList.appendChild(empty);
    } else {
      inst.mods.forEach((modId, idx) => {
        const mDef = getModDef(modId);
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '5px 8px';
        row.style.background = 'var(--kf-bg-1)';
        row.style.borderLeft = `3px solid ${mDef.accentColor}`;
        row.innerHTML = `
          <div>
            <strong style="font-size:11px;color:${mDef.accentColor};">${mDef.name}</strong>
            <div style="font-size:10px;color:var(--kf-text-dim);">${mDef.description}</div>
          </div>
        `;
        const detBtn = this.makeBtn('DETACH', 'kf-btn kf-btn-sm kf-btn-danger', () => {
          this.cb.onPlayUiClick();
          this.cb.onDetachMod(idx, this.workbenchSlot);
        });
        row.appendChild(detBtn);
        attachedList.appendChild(row);
      });
    }
    wepCard.appendChild(attachedList);

    // Live Stat Delta Comparison Table
    const statCard = document.createElement('div');
    statCard.className = 'kf-card';
    const previewLabel = previewStats && this.previewModId
      ? `PREVIEWING +${getModDef(this.previewModId).name}`
      : 'EFFECTIVE WEAPON TELEMETRY';
    statCard.innerHTML = `<strong style="font-size:11px;color:var(--kf-cyan);letter-spacing:0.08em;">${previewLabel}</strong>`;

    const table = document.createElement('table');
    table.className = 'kf-stat-table';
    table.innerHTML = this.renderStatDeltaRows(curStats, previewStats);
    statCard.appendChild(table);

    leftCol.append(wepCard, statCard);

    // Right column: Backpack Mods
    const rightCol = document.createElement('div');
    rightCol.className = 'kf-card';
    rightCol.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <strong style="font-size:12px;color:var(--kf-rune);letter-spacing:0.08em;">BACKPACK MODS (${p.backpackMods.length})</strong>
        <span style="font-size:10px;color:var(--kf-text-dim);">Hover/click to preview stat deltas</span>
      </div>
    `;

    const bpList = document.createElement('div');
    bpList.style.display = 'flex';
    bpList.style.flexDirection = 'column';
    bpList.style.gap = '6px';

    if (p.backpackMods.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.color = 'var(--kf-text-muted)';
      empty.textContent = 'Backpack empty. Open Mod Chests, visit Shops, or defeat Bosses to collect mods & runes.';
      bpList.appendChild(empty);
    } else {
      const seen = new Map<string, number>();
      for (const id of p.backpackMods) {
        seen.set(id, (seen.get(id) ?? 0) + 1);
      }
      for (const [modId, count] of seen.entries()) {
        const mDef = getModDef(modId);
        const item = document.createElement('div');
        item.style.padding = '7px 9px';
        item.style.background =
          this.previewModId === modId ? '#1e283b' : 'var(--kf-bg-1)';
        item.style.border =
          this.previewModId === modId
            ? `1px solid ${mDef.accentColor}`
            : '1px solid var(--kf-border)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.addEventListener('mouseenter', () => {
          if (this.previewModId !== modId) {
            this.previewModId = modId;
            this.lastSig = '';
          }
        });
        item.innerHTML = `
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <strong style="font-size:11px;color:${mDef.accentColor};">${mDef.name}</strong>
              <span class="kf-pill" style="font-size:9px;">T${mDef.tier} · x${count}</span>
            </div>
            <div style="font-size:10px;color:var(--kf-text-dim);">${mDef.description}</div>
          </div>
        `;
        const attachBtn = this.makeBtn(
          inst.mods.length >= modLimit ? 'FULL' : 'ATTACH',
          'kf-btn kf-btn-sm kf-btn-emerald',
          () => {
            this.cb.onPlayUiClick();
            this.cb.onAttachMod(modId, this.workbenchSlot);
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
      `<tr><td>ELEMENTS</td><td>${elems(next ?? cur)}</td></tr>`,
    ].join('');
  }

  // ==========================================================================
  // 2. WEAPON SHOP
  // ==========================================================================

  private buildShop(state: SimState): void {
    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-gold kf-modal kf-modal-md';
    modal.dataset.testid = 'shop-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div>
        <span class="kf-modal-title" style="color:var(--kf-amber);">MIDGARD ARMS DEALER</span>
        <span class="kf-modal-subtitle">GOLD BALANCE: ${state.player.gold}G</span>
      </div>
    `;
    const leaveBtn = this.makeBtn('RETURN TO OVERWORLD ▶', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onLeaveToOverworld();
    });
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
      if (offer.weaponUniqueId !== undefined) {
        const wDef = getWeaponDef(offer.weaponUniqueId);
        detail = `TIER ${wDef.weaponTier} ${AMMO_NAMES[wDef.ammoType]} · DMG ${wDef.baseDamage}`;
      } else if (offer.modId) {
        detail = getModDef(offer.modId).description;
      }

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <strong style="color:#fff;">${offer.name}</strong>
          <span class="kf-pill kf-pill-gold">${offer.price}G</span>
        </div>
        <div style="font-size:11px;color:var(--kf-text-dim);">${detail}</div>
      `;

      const buyBtn = this.makeBtn(
        offer.purchased ? 'PURCHASED' : canAfford ? `BUY (${offer.price}G)` : 'INSUFFICIENT GOLD',
        offer.purchased
          ? 'kf-btn kf-btn-sm'
          : canAfford
            ? 'kf-btn kf-btn-sm kf-btn-gold'
            : 'kf-btn kf-btn-sm',
        () => {
          this.cb.onPlayUiClick();
          this.cb.onBuyShopOffer(offer.id);
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
  // 3. CAMPFIRE
  // ==========================================================================

  private buildCampfire(state: SimState): void {
    const p = state.player;
    const activeWep = p.weapons[p.activeSlot];
    const activeDef = activeWep ? getWeaponDef(activeWep.uniqueId) : null;

    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-gold kf-modal kf-modal-md';
    modal.dataset.testid = 'campfire-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div>
        <span class="kf-modal-title" style="color:var(--kf-amber);">MIDGARD CAMPFIRE HEARTH</span>
        <span class="kf-modal-subtitle">CHOOSE ONE BOON BEFORE CONTINUING</span>
      </div>
    `;
    const skipBtn = this.makeBtn('LEAVE TO OVERWORLD', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      this.cb.onLeaveToOverworld();
    });
    header.appendChild(skipBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body';

    const choices: Array<{
      action: 'heal' | 'ammo' | 'upgrade' | 'skill';
      title: string;
      desc: string;
      btnClass: string;
    }> = [
      {
        action: 'heal',
        title: 'REST & FULL HEAL',
        desc: `Restore full HP (${Math.ceil(p.hp)}/${p.maxHp}) and energy shields.`,
        btnClass: 'kf-btn kf-btn-emerald',
      },
      {
        action: 'ammo',
        title: 'AMMO RESUPPLY CRATE',
        desc: 'Refill all 5 finite ammunition reserves (Bullets, Shells, Bolts, Energy, Explosives) to 100%.',
        btnClass: 'kf-btn kf-btn-gold',
      },
      {
        action: 'upgrade',
        title: activeWep?.golden ? 'FORGE FREE MOD CRATE' : 'FORGE GOLDEN UPGRADE',
        desc: activeWep?.golden
          ? 'Receive a high-tier weapon mod or Norse rune in your backpack.'
          : `Upgrade ${activeDef?.name ?? 'active weapon'} to GOLDEN (+35% DMG, +15% ROF, -20% Overheat)!`,
        btnClass: 'kf-btn kf-btn-primary',
      },
      {
        action: 'skill',
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
        <strong style="color:#fff;">${c.title}</strong>
        <div style="font-size:11px;color:var(--kf-text-dim);flex:1;">${c.desc}</div>
      `;
      const btn = this.makeBtn('CHOOSE', c.btnClass, () => {
        this.cb.onPlayUiClick();
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
  // 4. PAUSE MENU (ESC)
  // ==========================================================================

  private buildPause(state: SimState): void {
    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-cyan kf-modal kf-modal-sm';
    modal.dataset.testid = 'pause-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `<span class="kf-modal-title">PAUSED</span><span class="kf-modal-subtitle">ACT ${state.act} · LOOP ${state.loopCount}</span>`;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '9px';

    const resumeBtn = this.makeBtn('RESUME [ESC]', 'kf-btn kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onResumeGame();
    });
    const optBtn = this.makeBtn('OPTIONS', 'kf-btn', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenOptions();
    });
    const kbBtn = this.makeBtn('KEYBINDS', 'kf-btn', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenKeybinds();
    });
    const hubBtn = this.makeBtn('RETURN TO OUTPOST HUB', 'kf-btn kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToHub();
    });
    const titleBtn = this.makeBtn('TITLE SCREEN', 'kf-btn kf-btn-danger', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToTitle();
    });

    body.append(resumeBtn, optBtn, kbBtn, hubBtn, titleBtn);
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 5. OPTIONS MODAL (FPS, PIXEL-SNAP, AUDIO, GRAPHICS, LIVE PACK MODE)
  // ==========================================================================

  private buildOptions(
    save: SaveData,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
  ): void {
    const rs = save.renderSettings;
    const as = save.audioSettings;

    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-cyan kf-modal kf-modal-md';
    modal.dataset.testid = 'options-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `<span class="kf-modal-title">${UI_LABELS.optionsTitle}</span><span class="kf-modal-subtitle">SAVED AUTOMATICALLY</span>`;
    const closeBtn = this.makeBtn('DONE [ESC]', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onCloseOverlay();
    });
    closeBtn.dataset.testid = 'options-close-btn';
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    // Target FPS (30 | 60 | 120)
    const fpsRow = this.makeOptionRow('TARGET RENDER FPS', 'Fixed 60 Hz sim with smooth high-FPS pacing');
    const fpsBtns = document.createElement('div');
    fpsBtns.style.display = 'flex';
    fpsBtns.style.gap = '6px';
    for (const fps of [30, 60, 120] as TargetFps[]) {
      const b = this.makeBtn(
        `${fps} FPS`,
        rs.targetFps === fps ? 'kf-btn kf-btn-sm kf-btn-primary' : 'kf-btn kf-btn-sm',
        () => {
          this.cb.onPlayUiClick();
          this.cb.onUpdateRenderSettings({ targetFps: fps });
        },
      );
      b.dataset.testid = `opt-fps-${fps}`;
      fpsBtns.appendChild(b);
    }
    fpsRow.appendChild(fpsBtns);

    // Classic 60 FPS Native Pixel-Snap
    const snapRow = this.makeOptionRow(
      'CLASSIC 60 FPS PIXEL-SNAP',
      'Locks camera & sprite coordinates to exact integer 640x360 texels',
    );
    const snapBtn = this.makeBtn(
      rs.pixelSnap60 ? 'ENABLED' : 'SMOOTH INTERP',
      rs.pixelSnap60 ? 'kf-btn kf-btn-sm kf-btn-gold' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onUpdateRenderSettings({ pixelSnap60: !rs.pixelSnap60 });
      },
    );
    snapBtn.dataset.testid = 'opt-pixelsnap-toggle';
    snapRow.appendChild(snapBtn);

    // Master / Music / SFX Volume sliders + Mute
    const muteRow = this.makeOptionRow('AUDIO OUTPUT', 'Mute all music, ambience, and sound effects');
    const muteBtn = this.makeBtn(
      as.muted ? 'MUTED' : 'ACTIVE',
      as.muted ? 'kf-btn kf-btn-sm kf-btn-danger' : 'kf-btn kf-btn-sm kf-btn-emerald',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onUpdateAudioSettings({ muted: !as.muted });
      },
    );
    muteRow.appendChild(muteBtn);

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
    const shakeRow = this.makeSliderRow(
      'SCREENSHAKE INTENSITY',
      rs.screenshakeScale,
      0,
      2,
      0.1,
      (v) => `${Math.round(v * 100)}%`,
      (v) => this.cb.onUpdateRenderSettings({ screenshakeScale: v }),
    );

    // Lighting & Blood toggles
    const lightRow = this.makeOptionRow('DYNAMIC 2D LIGHTING', 'Additive point lights, muzzle blooms & glowing eyes');
    const lightBtn = this.makeBtn(
      rs.lightingEnabled ? 'ON' : 'OFF',
      rs.lightingEnabled ? 'kf-btn kf-btn-sm kf-btn-emerald' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onUpdateRenderSettings({ lightingEnabled: !rs.lightingEnabled });
      },
    );
    lightRow.appendChild(lightBtn);

    const bloodRow = this.makeOptionRow('BLOOD DECALS & GORE', 'Persistent floor splatters and overkill gibs');
    const bloodBtn = this.makeBtn(
      rs.bloodEnabled ? 'ON' : 'OFF',
      rs.bloodEnabled ? 'kf-btn kf-btn-sm kf-btn-emerald' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onUpdateRenderSettings({ bloodEnabled: !rs.bloodEnabled });
      },
    );
    bloodRow.appendChild(bloodBtn);

    // Live Pack Mode Toggle
    const packRow = this.makeOptionRow(
      'ART & AUDIO PACK MODE',
      customPackAvailable
        ? 'Instant zero-restart switch between Built-In Krunked Art and Owned Custom Pack'
        : 'Load an extracted pack folder from the Title Screen to enable Custom Pack',
    );
    const packBtns = document.createElement('div');
    packBtns.style.display = 'flex';
    packBtns.style.gap = '6px';
    const biBtn = this.makeBtn(
      'BUILT-IN ART',
      packMode === 'builtin' ? 'kf-btn kf-btn-sm kf-btn-primary' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        void this.cb.onSetPackMode('builtin');
      },
    );
    const cuBtn = this.makeBtn(
      'CUSTOM PACK',
      packMode === 'custom' ? 'kf-btn kf-btn-sm kf-btn-gold' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        void this.cb.onSetPackMode('custom');
      },
    );
    cuBtn.disabled = !customPackAvailable;
    packBtns.append(biBtn, cuBtn);
    packRow.appendChild(packBtns);

    body.append(
      fpsRow,
      snapRow,
      muteRow,
      masterRow,
      musicRow,
      sfxRow,
      shakeRow,
      lightRow,
      bloodRow,
      packRow,
    );
    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  private makeOptionRow(title: string, subtitle: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kf-option-row';
    const left = document.createElement('div');
    left.innerHTML = `
      <div style="font-weight:800;font-size:12px;color:#fff;">${title}</div>
      <div style="font-size:10px;color:var(--kf-text-dim);">${subtitle}</div>
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
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'kf-option-row';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-weight:800;font-size:12px;color:#fff;">${title}</div>`;

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';

    const valLabel = document.createElement('span');
    valLabel.style.width = '46px';
    valLabel.style.textAlign = 'right';
    valLabel.style.color = 'var(--kf-cyan)';
    valLabel.textContent = format(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'kf-range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      valLabel.textContent = format(v);
      onChange(v);
    });

    right.append(slider, valLabel);
    row.append(left, right);
    return row;
  }

  // ==========================================================================
  // 6. KEYBINDS MODAL
  // ==========================================================================

  private buildKeybinds(save: SaveData, rebindingAction: KeybindAction | null): void {
    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-cyan kf-modal kf-modal-md';
    modal.dataset.testid = 'keybinds-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `<span class="kf-modal-title">KEYBINDS & CONTROLS</span><span class="kf-modal-subtitle">MOUSE LMB FIRE · RMB ABILITY · FULL GAMEPAD SUPPORT</span>`;

    const rightHdr = document.createElement('div');
    rightHdr.style.display = 'flex';
    rightHdr.style.gap = '6px';
    const resetBtn = this.makeBtn('RESET DEFAULTS', 'kf-btn kf-btn-sm kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      this.cb.onResetKeybinds();
    });
    const closeBtn = this.makeBtn('DONE [ESC]', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onCloseOverlay();
    });
    rightHdr.append(resetBtn, closeBtn);
    header.appendChild(rightHdr);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    for (const meta of KEYBIND_ACTIONS) {
      const boundCode = save.keybinds[meta.action] ?? '';
      const listening = rebindingAction === meta.action;
      const row = document.createElement('div');
      row.className = 'kf-keybind-row';

      const lbl = document.createElement('strong');
      lbl.textContent = meta.label;

      const btn = this.makeBtn(
        listening ? 'PRESS ANY KEY...' : formatKeyCode(boundCode),
        listening ? 'kf-btn kf-btn-sm kf-btn-gold' : 'kf-btn kf-btn-sm kf-btn-primary',
        () => {
          this.cb.onPlayUiClick();
          this.cb.onStartRebind(meta.action);
        },
      );
      btn.dataset.testid = `keybind-btn-${meta.action}`;

      const hint = document.createElement('span');
      hint.style.fontSize = '10px';
      hint.style.color = 'var(--kf-text-dim)';
      hint.textContent = `ALT: ${meta.secondaryHint}`;

      row.append(lbl, btn, hint);
      body.appendChild(row);
    }

    modal.append(header, body);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 7. VICTORY / LOOP MODE PROMPT
  // ==========================================================================

  private buildVictory(state: SimState): void {
    const outcast = getOutcastDef(state.player.outcastId);
    const nextLoop = state.loopCount + 1;

    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-gold kf-modal kf-modal-md';
    modal.dataset.testid = 'victory-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div>
        <span class="kf-modal-title" style="color:var(--kf-amber);">${UI_LABELS.victoryTitle}</span>
        <span class="kf-modal-subtitle">${UI_LABELS.victorySubtitle}</span>
      </div>
      <span class="kf-pill kf-pill-gold">KRUNKEDSLAYER</span>
    `;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:10px;color:var(--kf-emerald);font-weight:700;">
        ${outcast.name} VANQUISHED CORRUPTED KRUNKED AT BALDER'S SHRINE!
      </div>
      ${this.renderRunSummaryGrid(state)}
    `;

    const footer = document.createElement('div');
    footer.className = 'kf-modal-footer';

    const loopBtn = this.makeBtn(
      `ENTER LOOP ${nextLoop} (ENDLESS RAGNAROK) ▶`,
      'kf-btn kf-btn-gold',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onStartNextLoop();
      },
    );
    loopBtn.dataset.testid = 'victory-loop-btn';

    const hubBtn = this.makeBtn('RETURN TO HUB', 'kf-btn kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToHub();
    });
    hubBtn.dataset.testid = 'victory-hub-btn';

    footer.append(hubBtn, loopBtn);
    modal.append(header, body, footer);
    this.backdrop.appendChild(modal);
  }

  // ==========================================================================
  // 8. GAME OVER RUN SUMMARY
  // ==========================================================================

  private buildGameOver(state: SimState): void {
    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-crimson kf-modal kf-modal-md';
    modal.dataset.testid = 'gameover-modal';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    header.innerHTML = `
      <div>
        <span class="kf-modal-title" style="color:var(--kf-crimson);">${UI_LABELS.gameoverTitle}</span>
        <span class="kf-modal-subtitle">${UI_LABELS.gameoverSubtitle}</span>
      </div>
      <span class="kf-pill kf-pill-crimson">ACT ${state.act} · LOOP ${state.loopCount}</span>
    `;

    const body = document.createElement('div');
    body.className = 'kf-modal-body';
    body.innerHTML = this.renderRunSummaryGrid(state);

    const footer = document.createElement('div');
    footer.className = 'kf-modal-footer';

    const hubBtn = this.makeBtn('RETURN TO HUB', 'kf-btn', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToHub();
    });
    hubBtn.dataset.testid = 'gameover-hub-btn';

    const retryBtn = this.makeBtn('RETRY RUN ▶', 'kf-btn kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onRetryRun();
    });
    retryBtn.dataset.testid = 'gameover-retry-btn';

    footer.append(hubBtn, retryBtn);
    modal.append(header, body, footer);
    this.backdrop.appendChild(modal);
  }

  private renderRunSummaryGrid(state: SimState): string {
    const rs = state.runStats;
    const cells = [
      { lbl: 'SCORE', val: String(rs.score) },
      { lbl: 'KILLS', val: String(state.player.kills) },
      { lbl: 'ROOMS CLEARED', val: String(rs.roomsCleared) },
      { lbl: 'BOSSES SLAIN', val: `${rs.bossesDefeated.length}/6` },
      { lbl: 'WALLS SHATTERED', val: String(rs.wallsDestroyed) },
      { lbl: 'RUN TIME', val: formatRunTime(rs.elapsedTicks) },
    ];
    return `
      <div class="kf-summary-grid">
        ${cells
          .map(
            (c) => `
          <div class="kf-summary-cell">
            <div class="kf-summary-val">${c.val}</div>
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

  public dispose(): void {
    this.backdrop.remove();
  }
}
