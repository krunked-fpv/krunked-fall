// ============================================================================
// KRUNKEDFALL — Zero-Churn Pixel-Crisp Combat HUD & Dynamic Crosshair
// ============================================================================
// Mutates cached DOM element refs directly (zero innerHTML churn at 120 FPS).
// Covers:
//   - Top-Left: Live Outcast pixel-art portrait, segmented HP bar with white
//     damage-drain trail & hit-rim flash, Shield bar, Ability charge pips,
//     Power meter (glows when ready), XP bar, Level & Gold
//   - Top-Center: Boss Phase 1/Phase 2 HP bar with damage-drain trail + Freeze Storm
//   - Top-Right: Act/Loop/Node banner + Enemies/Exit badge + quick Bench/Pause
//   - Bottom-Left: 2-Slot Weapon Cards with live pixel-art weapon thumbnails,
//     heat gauge, attached mod pips + 6 Ammo Counters with low-ammo warning
//   - Bottom-Center: Reactive Loki portrait commentary toast + [E] prompt
//   - Dynamic Crosshair with hitmarker pulse tracking cursor / twin-stick aim

import {
  AMMO_NAMES,
  type ControllerStatus,
  type SimState,
  type WeaponInstance,
} from '../contracts/index.js';
import {
  getBossDef,
  getModDef,
  getOutcastDef,
  getOverworldNode,
  getWeaponDef,
} from '../data/index.js';
import type { GamepadGlyphSet } from '../input/index.js';
import {
  getLokiPortraitUrl,
  getOutcastPortraitUrl,
  getWeaponThumbUrl,
} from './spritePreview.js';

function formatPromptTag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  return `[${trimmed}]`;
}

function compactAbilityTag(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'SPACE' || upper === '[SPACE]') return '[SPC]';
  return formatPromptTag(raw);
}

export interface CombatHudCallbacks {
  onOpenWorkbench(): void;
  onOpenPause(): void;
  onSwapWeapon(): void;
  onPlayUiClick(): void;
}

const AMMO_SHORT: readonly string[] = ['MEL', 'BUL', 'SHL', 'BLT', 'NRG', 'EXP'];
const TIER_COLORS: readonly string[] = [
  '#92a6bf',
  '#b8c7d9',
  '#3df299',
  '#38e0ff',
  '#c278ff',
  '#ff9c2a',
  '#ff3d5e',
];

export class CombatHud {
  private readonly root: HTMLElement;
  private readonly crosshairEl: HTMLElement;
  private readonly cb: CombatHudCallbacks;
  private visible = false;

  // Cached DOM refs for allocation-free 120 FPS updates
  private readonly tlPanel: HTMLElement;
  private readonly portraitBox: HTMLElement;
  private readonly portraitImg: HTMLImageElement;
  private readonly outcastLabel: HTMLElement;
  private readonly levelGoldLabel: HTMLElement;
  private readonly hpTrail: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly shieldWrap: HTMLElement;
  private readonly shieldFill: HTMLElement;
  private readonly shieldText: HTMLElement;
  private readonly abilityPips: HTMLElement;
  private readonly abilityText: HTMLElement;
  private readonly powerWrap: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly powerText: HTMLElement;
  private readonly xpFill: HTMLElement;

  // Top-Right node banner
  private readonly nodeBannerText: HTMLElement;
  private readonly enemiesLeftPill: HTMLElement;
  private readonly benchQuickBtn: HTMLButtonElement;
  private readonly pauseQuickBtn: HTMLButtonElement;

  // Top-Center Boss & Freeze Storm
  private readonly bossBox: HTMLElement;
  private readonly bossNameEl: HTMLElement;
  private readonly bossPhasePill: HTMLElement;
  private readonly bossHpTrail: HTMLElement;
  private readonly bossHpFill: HTMLElement;
  private readonly bossHpText: HTMLElement;

  private readonly freezeBox: HTMLElement;
  private readonly freezeText: HTMLElement;
  private readonly freezeFill: HTMLElement;

  // Bottom-Left weapons & ammo
  private readonly slotCards: [HTMLElement, HTMLElement];
  private readonly slotThumbs: [HTMLImageElement, HTMLImageElement];
  private readonly slotNames: [HTMLElement, HTMLElement];
  private readonly slotBadges: [HTMLElement, HTMLElement];
  private readonly slotHeatFills: [HTMLElement, HTMLElement];
  private readonly slotModPips: [HTMLElement, HTMLElement];
  private readonly ammoCells: HTMLElement[];
  private readonly ammoVals: HTMLElement[];

  // Bottom-Center toast & prompt
  private readonly lokiToastEl: HTMLElement;
  private readonly lokiToastText: HTMLElement;
  private readonly promptEl: HTMLElement;

  // Lightweight change-detection caches (zero unnecessary DOM writes)
  private lastPortraitSig = '';
  private lastAbilitySig = '';
  private lastModSigs: [string, string] = ['', ''];
  private lastWeaponThumbSigs: [string, string] = ['', ''];
  private lastBenchLabel = '[TAB] BENCH';
  private lastPauseLabel = '[ESC] PAUSE';
  private lastPlayerHpPct = 100;
  private lastBossId = -1;
  private lastBossHpPct = 100;
  private lastShotsHit = 0;
  private hitMarkerUntilMs = 0;

  constructor(parent: HTMLElement, callbacks: CombatHudCallbacks) {
    this.cb = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'kf-combat-hud';
    this.root.style.display = 'none';

    // ---- TOP-LEFT: Player Vitals with Live Portrait & Damage Trail ----
    const tl = document.createElement('div');
    tl.className = 'kf-panel kf-panel-cyan kf-hud-tl';
    this.tlPanel = tl;

    const vitalsHead = document.createElement('div');
    vitalsHead.className = 'kf-hud-vitals-head';

    this.portraitBox = document.createElement('div');
    this.portraitBox.className = 'kf-hud-portrait';
    this.portraitImg = document.createElement('img');
    this.portraitImg.width = 30;
    this.portraitImg.height = 30;
    this.portraitImg.className = 'kf-pixel-img';
    this.portraitImg.alt = '';
    this.portraitBox.appendChild(this.portraitImg);

    const vitalsId = document.createElement('div');
    vitalsId.className = 'kf-hud-vitals-id';

    const headerRow = document.createElement('div');
    headerRow.className = 'kf-vitals-row';
    this.outcastLabel = document.createElement('strong');
    this.outcastLabel.style.fontFamily = 'var(--kf-font-display)';
    this.outcastLabel.style.fontSize = '12px';
    this.outcastLabel.style.letterSpacing = '0.08em';

    this.levelGoldLabel = document.createElement('span');
    this.levelGoldLabel.style.fontFamily = 'var(--kf-font)';
    this.levelGoldLabel.style.fontSize = '11px';
    this.levelGoldLabel.style.fontWeight = '800';
    this.levelGoldLabel.style.color = 'var(--kf-amber)';
    headerRow.append(this.outcastLabel, this.levelGoldLabel);

    // HP Bar with White Damage-Drain Trail
    const hpTrack = document.createElement('div');
    hpTrack.className = 'kf-bar-track kf-bar-track-lg';
    this.hpTrail = document.createElement('div');
    this.hpTrail.className = 'kf-bar-trail';
    this.hpTrail.style.width = '100%';
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'kf-bar-fill';
    this.hpFill.style.background = '#e63946';
    const hpSeg = document.createElement('div');
    hpSeg.className = 'kf-bar-segments';
    this.hpText = document.createElement('div');
    this.hpText.className = 'kf-bar-label';
    hpTrack.append(this.hpTrail, this.hpFill, hpSeg, this.hpText);

    vitalsId.append(headerRow, hpTrack);
    vitalsHead.append(this.portraitBox, vitalsId);

    // Shield Bar
    this.shieldWrap = document.createElement('div');
    this.shieldWrap.className = 'kf-bar-track kf-bar-track-sm';
    this.shieldWrap.style.display = 'none';
    this.shieldFill = document.createElement('div');
    this.shieldFill.className = 'kf-bar-fill';
    this.shieldFill.style.background = '#38e0ff';
    this.shieldText = document.createElement('div');
    this.shieldText.className = 'kf-bar-label';
    this.shieldWrap.append(this.shieldFill, this.shieldText);

    // Ability Pips + Power Charge
    const abilRow = document.createElement('div');
    abilRow.className = 'kf-ability-row';
    this.abilityPips = document.createElement('div');
    this.abilityPips.style.display = 'flex';
    this.abilityPips.style.gap = '3px';
    this.abilityText = document.createElement('span');
    this.abilityText.style.fontFamily = 'var(--kf-font)';
    this.abilityText.style.fontSize = '9.5px';
    this.abilityText.style.color = 'var(--kf-cyan)';

    this.powerWrap = document.createElement('div');
    this.powerWrap.className = 'kf-bar-track kf-power-meter';
    this.powerFill = document.createElement('div');
    this.powerFill.className = 'kf-bar-fill';
    this.powerFill.style.background = '#ff9c2a';
    this.powerText = document.createElement('div');
    this.powerText.className = 'kf-bar-label';
    this.powerWrap.append(this.powerFill, this.powerText);
    abilRow.append(this.abilityPips, this.abilityText, this.powerWrap);

    // XP Strip
    const xpTrack = document.createElement('div');
    xpTrack.className = 'kf-bar-track kf-bar-track-sm';
    xpTrack.style.height = '4px';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'kf-bar-fill';
    this.xpFill.style.background = '#3df299';
    xpTrack.append(this.xpFill);

    tl.append(vitalsHead, this.shieldWrap, abilRow, xpTrack);

    // ---- TOP-RIGHT: Node Banner & Quick Buttons ----
    const tr = document.createElement('div');
    tr.className = 'kf-hud-tr';
    const banner = document.createElement('div');
    banner.className = 'kf-panel kf-hud-node-banner';
    this.nodeBannerText = document.createElement('span');
    this.enemiesLeftPill = document.createElement('span');
    this.enemiesLeftPill.className = 'kf-pill kf-pill-cyan';
    banner.append(this.nodeBannerText, this.enemiesLeftPill);

    const trBtns = document.createElement('div');
    trBtns.style.display = 'flex';
    trBtns.style.gap = '6px';
    trBtns.className = 'kf-interactive';
    trBtns.dataset.uiInteractive = 'true';

    const benchQuick = document.createElement('button');
    benchQuick.type = 'button';
    benchQuick.className = 'kf-btn kf-btn-sm';
    benchQuick.textContent = '[TAB] BENCH';
    benchQuick.dataset.testid = 'hud-workbench-btn';
    benchQuick.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenWorkbench();
    });
    this.benchQuickBtn = benchQuick;

    const pauseQuick = document.createElement('button');
    pauseQuick.type = 'button';
    pauseQuick.className = 'kf-btn kf-btn-sm';
    pauseQuick.textContent = '[ESC] PAUSE';
    pauseQuick.dataset.testid = 'hud-pause-btn';
    pauseQuick.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenPause();
    });
    this.pauseQuickBtn = pauseQuick;

    trBtns.append(benchQuick, pauseQuick);
    tr.append(banner, trBtns);

    // ---- TOP-CENTER: Boss 2-Phase HP Bar (with Drain Trail) & Freeze Storm ----
    const tc = document.createElement('div');
    tc.className = 'kf-hud-tc';

    this.bossBox = document.createElement('div');
    this.bossBox.className = 'kf-boss-bar-box';
    this.bossBox.style.display = 'none';
    this.bossBox.dataset.testid = 'boss-hp-bar';

    const bossHeader = document.createElement('div');
    bossHeader.className = 'kf-boss-title-row';
    this.bossNameEl = document.createElement('span');
    this.bossPhasePill = document.createElement('span');
    this.bossPhasePill.className = 'kf-pill kf-pill-crimson';
    bossHeader.append(this.bossNameEl, this.bossPhasePill);

    const bossTrack = document.createElement('div');
    bossTrack.className = 'kf-bar-track kf-bar-track-lg';
    this.bossHpTrail = document.createElement('div');
    this.bossHpTrail.className = 'kf-bar-trail';
    this.bossHpTrail.style.width = '100%';
    this.bossHpFill = document.createElement('div');
    this.bossHpFill.className = 'kf-bar-fill';
    this.bossHpFill.style.background = '#ff3d5e';
    const bossSeg = document.createElement('div');
    bossSeg.className = 'kf-bar-segments';
    this.bossHpText = document.createElement('div');
    this.bossHpText.className = 'kf-bar-label';
    bossTrack.append(this.bossHpTrail, this.bossHpFill, bossSeg, this.bossHpText);
    this.bossBox.append(bossHeader, bossTrack);

    this.freezeBox = document.createElement('div');
    this.freezeBox.className = 'kf-freeze-bar-box';
    this.freezeBox.style.display = 'none';
    this.freezeBox.dataset.testid = 'freeze-storm-bar';
    this.freezeText = document.createElement('div');
    this.freezeText.className = 'kf-freeze-label';
    const freezeTrack = document.createElement('div');
    freezeTrack.className = 'kf-bar-track kf-bar-track-sm';
    this.freezeFill = document.createElement('div');
    this.freezeFill.className = 'kf-bar-fill';
    this.freezeFill.style.background = '#38e0ff';
    freezeTrack.append(this.freezeFill);
    this.freezeBox.append(this.freezeText, freezeTrack);

    tc.append(this.bossBox, this.freezeBox);

    // ---- BOTTOM-LEFT: 2-Slot Weapon Cards (with Pixel Sprites) + 6 Ammo Counters ----
    const bl = document.createElement('div');
    bl.className = 'kf-hud-bl';

    const slotsRow = document.createElement('div');
    slotsRow.className = 'kf-weapon-slots kf-interactive';
    slotsRow.dataset.uiInteractive = 'true';

    const cards: HTMLElement[] = [];
    const thumbs: HTMLImageElement[] = [];
    const names: HTMLElement[] = [];
    const badges: HTMLElement[] = [];
    const heats: HTMLElement[] = [];
    const mods: HTMLElement[] = [];

    for (let s = 0; s < 2; s++) {
      const card = document.createElement('div');
      card.className = 'kf-weapon-card';
      card.style.cursor = 'pointer';
      card.title = 'Click or press E / 1 / 2 to swap weapon';
      card.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.cb.onSwapWeapon();
      });

      const mainRow = document.createElement('div');
      mainRow.className = 'kf-weapon-card-main';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'kf-weapon-hud-thumb';
      const thumbImg = document.createElement('img');
      thumbImg.width = 34;
      thumbImg.height = 20;
      thumbImg.className = 'kf-pixel-img';
      thumbImg.alt = '';
      thumbWrap.appendChild(thumbImg);

      const textWrap = document.createElement('div');
      textWrap.style.flex = '1';
      textWrap.style.minWidth = '0';
      textWrap.style.display = 'flex';
      textWrap.style.flexDirection = 'column';
      textWrap.style.gap = '3px';

      const topLine = document.createElement('div');
      topLine.style.display = 'flex';
      topLine.style.justifyContent = 'space-between';
      topLine.style.alignItems = 'center';
      topLine.style.gap = '4px';

      const wName = document.createElement('strong');
      wName.style.fontFamily = 'var(--kf-font-display)';
      wName.style.fontSize = '11px';
      wName.style.letterSpacing = '0.04em';
      wName.style.whiteSpace = 'nowrap';
      wName.style.overflow = 'hidden';
      wName.style.textOverflow = 'ellipsis';

      const wBadge = document.createElement('span');
      wBadge.className = 'kf-pill';
      wBadge.style.fontSize = '9px';
      wBadge.style.padding = '1px 4px';
      topLine.append(wName, wBadge);

      const modRow = document.createElement('div');
      modRow.className = 'kf-mod-pips';

      textWrap.append(topLine, modRow);
      mainRow.append(thumbWrap, textWrap);

      const heatTrack = document.createElement('div');
      heatTrack.className = 'kf-bar-track kf-bar-track-sm';
      heatTrack.style.height = '4px';
      const heatFill = document.createElement('div');
      heatFill.className = 'kf-bar-fill';
      heatFill.style.background = '#ff9c2a';
      heatTrack.append(heatFill);

      card.append(mainRow, heatTrack);
      slotsRow.appendChild(card);

      cards.push(card);
      thumbs.push(thumbImg);
      names.push(wName);
      badges.push(wBadge);
      heats.push(heatFill);
      mods.push(modRow);
    }

    this.slotCards = [cards[0], cards[1]];
    this.slotThumbs = [thumbs[0], thumbs[1]];
    this.slotNames = [names[0], names[1]];
    this.slotBadges = [badges[0], badges[1]];
    this.slotHeatFills = [heats[0], heats[1]];
    this.slotModPips = [mods[0], mods[1]];

    const ammoStrip = document.createElement('div');
    ammoStrip.className = 'kf-panel kf-ammo-strip';
    this.ammoCells = [];
    this.ammoVals = [];
    for (let a = 0; a < 6; a++) {
      const cell = document.createElement('div');
      cell.className = 'kf-ammo-cell';
      cell.title = AMMO_NAMES[a];
      const lbl = document.createElement('span');
      lbl.style.fontSize = '8px';
      lbl.style.color = 'var(--kf-text-muted)';
      lbl.textContent = AMMO_SHORT[a];
      const val = document.createElement('strong');
      val.style.fontSize = '10px';
      cell.append(lbl, val);
      ammoStrip.appendChild(cell);
      this.ammoCells.push(cell);
      this.ammoVals.push(val);
    }

    bl.append(slotsRow, ammoStrip);

    // ---- BOTTOM-CENTER: Loki Portrait Toast & Contextual [E] Prompt ----
    const bc = document.createElement('div');
    bc.className = 'kf-hud-bc';

    this.lokiToastEl = document.createElement('div');
    this.lokiToastEl.className = 'kf-loki-toast';
    this.lokiToastEl.style.display = 'none';

    const lokiAvatar = document.createElement('div');
    lokiAvatar.className = 'kf-loki-toast-avatar';
    const lokiUrl = getLokiPortraitUrl(30);
    if (lokiUrl) {
      const lImg = document.createElement('img');
      lImg.src = lokiUrl;
      lImg.width = 28;
      lImg.height = 28;
      lImg.className = 'kf-pixel-img';
      lImg.alt = 'Loki';
      lokiAvatar.appendChild(lImg);
    } else {
      lokiAvatar.textContent = 'L';
    }

    this.lokiToastText = document.createElement('span');
    this.lokiToastEl.append(lokiAvatar, this.lokiToastText);

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'kf-interact-prompt';
    this.promptEl.style.display = 'none';

    bc.append(this.lokiToastEl, this.promptEl);

    // Dynamic Crosshair
    this.crosshairEl = document.createElement('div');
    this.crosshairEl.className = 'kf-crosshair';
    const core = document.createElement('div');
    core.className = 'kf-crosshair-core';
    this.crosshairEl.appendChild(core);

    this.root.append(tl, tr, tc, bl, bc);
    parent.append(this.root, this.crosshairEl);
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.crosshairEl.classList.remove('visible');
      this.crosshairEl.classList.remove('hit');
    }
  }

  public update(
    state: SimState,
    cursor: { x: number; y: number; visible: boolean; isStickAim?: boolean; isStick?: boolean },
    showCrosshair: boolean,
    prompts?: GamepadGlyphSet,
    controllerStatus?: ControllerStatus,
  ): void {
    if (!this.visible) return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const benchLabel =
      activeDevice === 'touch'
        ? 'BENCH'
        : prompts
          ? `${formatPromptTag(prompts.workbench)} BENCH`
          : '[TAB] BENCH';
    if (benchLabel !== this.lastBenchLabel) {
      this.lastBenchLabel = benchLabel;
      this.benchQuickBtn.textContent = benchLabel;
    }

    const pauseLabel =
      activeDevice === 'touch'
        ? 'PAUSE'
        : prompts
          ? `${formatPromptTag(prompts.pause)} PAUSE`
          : '[ESC] PAUSE';
    if (pauseLabel !== this.lastPauseLabel) {
      this.lastPauseLabel = pauseLabel;
      this.pauseQuickBtn.textContent = pauseLabel;
    }

    const abilityReadyLabel =
      activeDevice === 'touch'
        ? 'ABIL'
        : prompts
          ? compactAbilityTag(prompts.ability)
          : '[SPC]';
    const powerReadyLabel =
      activeDevice === 'touch'
        ? 'PWR READY!'
        : prompts
          ? `${formatPromptTag(prompts.power)} POWER READY!`
          : '[Q] POWER READY!';
    const interactTag =
      activeDevice === 'touch'
        ? '[USE]'
        : prompts
          ? formatPromptTag(prompts.interact)
          : '[E]';

    const p = state.player;
    const outcast = getOutcastDef(p.outcastId);
    const node = getOverworldNode(state.currentNodeId);

    // Top-Left Portrait (memoized)
    const pSig = `${p.outcastId}|${p.skinId}`;
    if (pSig !== this.lastPortraitSig) {
      this.lastPortraitSig = pSig;
      this.portraitBox.style.borderColor = outcast.accentColor;
      const url = getOutcastPortraitUrl(p.outcastId, p.skinId, 32);
      if (url) {
        this.portraitImg.src = url;
        this.portraitImg.style.display = 'block';
      } else {
        this.portraitImg.style.display = 'none';
      }
    }

    this.outcastLabel.textContent = `${outcast.name} · LVL ${p.level}`;
    this.levelGoldLabel.textContent = `${p.gold}G`;

    // Player HP bar + delayed white damage-drain trail + hit pulse
    const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
    this.hpFill.style.width = `${hpPct.toFixed(1)}%`;
    this.hpTrail.style.width = `${hpPct.toFixed(1)}%`;
    this.hpFill.style.background =
      hpPct <= 25 ? '#ff2a4b' : hpPct <= 55 ? '#ff9c2a' : '#e63946';
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp} HP${state.godMode ? ' [GOD]' : ''}`;
    this.tlPanel.classList.toggle('kf-hud-damaged', p.hitFlashTicks > 0 || hpPct < this.lastPlayerHpPct - 0.5);
    this.lastPlayerHpPct = hpPct;

    if (p.maxShield > 0) {
      this.shieldWrap.style.display = 'block';
      const shPct = Math.max(0, Math.min(100, (p.shield / p.maxShield) * 100));
      this.shieldFill.style.width = `${shPct.toFixed(1)}%`;
      this.shieldText.textContent = `${Math.ceil(p.shield)} / ${p.maxShield} SHD`;
    } else {
      this.shieldWrap.style.display = 'none';
    }

    const abilSig = `${p.abilityCharges}/${p.abilityMaxCharges}`;
    if (abilSig !== this.lastAbilitySig) {
      this.lastAbilitySig = abilSig;
      this.abilityPips.innerHTML = '';
      for (let i = 0; i < p.abilityMaxCharges; i++) {
        const pip = document.createElement('span');
        pip.className = i < p.abilityCharges ? 'kf-pip ready' : 'kf-pip';
        this.abilityPips.appendChild(pip);
      }
    }
    this.abilityText.textContent =
      p.abilityCharges > 0
        ? abilityReadyLabel
        : `${(p.abilityCooldown / 60).toFixed(1)}s`;

    const pwrRatio = Math.max(
      0,
      Math.min(1, p.powerCharge / Math.max(1, p.powerChargeRequired)),
    );
    this.powerFill.style.width = `${(pwrRatio * 100).toFixed(1)}%`;
    const pwrReady = pwrRatio >= 1;
    this.powerWrap.classList.toggle('kf-power-ready', pwrReady);
    this.powerFill.style.background =
      p.powerActiveTicks > 0 ? '#3df299' : pwrReady ? '#ffd257' : '#ff9c2a';
    this.powerText.textContent =
      p.powerActiveTicks > 0
        ? `ACTIVE ${(p.powerActiveTicks / 60).toFixed(1)}s`
        : pwrReady
          ? powerReadyLabel
          : `PWR ${Math.floor(pwrRatio * 100)}%`;

    const xpPct = Math.max(0, Math.min(100, (p.xp / Math.max(1, p.xpToNext)) * 100));
    this.xpFill.style.width = `${xpPct.toFixed(1)}%`;

    // Top-Right Node Banner
    const loopTag = state.loopCount > 0 ? ` · LOOP ${state.loopCount}` : '';
    this.nodeBannerText.textContent = `ACT ${state.act} · ${node.displayName}${loopTag}`;
    if (state.map.exitUnlocked) {
      this.enemiesLeftPill.className = 'kf-pill kf-pill-emerald';
      this.enemiesLeftPill.textContent = 'EXIT OPEN';
    } else {
      this.enemiesLeftPill.className = 'kf-pill kf-pill-crimson';
      this.enemiesLeftPill.textContent = `${state.enemies.length} FOES`;
    }

    // Top-Center Boss Phase 1 / Phase 2 Bar with Damage-Drain Trail
    const activeBoss = state.enemies.find((e) => e.isBoss && e.hp > 0);
    if (activeBoss && activeBoss.bossId) {
      const bDef = getBossDef(activeBoss.bossId);
      const isP2 = activeBoss.bossPhase === 2;
      this.bossBox.style.display = 'block';
      this.bossBox.classList.toggle('phase2', isP2);
      this.bossNameEl.textContent = isP2 ? bDef.phase2Name : bDef.phase1Name;
      this.bossNameEl.style.color = isP2 ? bDef.phase2Color : bDef.accentColor;
      this.bossPhasePill.textContent = isP2 ? 'PHASE II' : 'PHASE I';
      const bPct = Math.max(0, Math.min(100, (activeBoss.hp / Math.max(1, activeBoss.maxHp)) * 100));
      if (this.lastBossId !== activeBoss.id || bPct > this.lastBossHpPct + 10) {
        // Instant snap on new boss or Phase 2 full heal
        this.bossHpTrail.style.transition = 'none';
        this.bossHpTrail.style.width = `${bPct.toFixed(1)}%`;
        void this.bossHpTrail.offsetWidth;
        this.bossHpTrail.style.transition = '';
      } else {
        this.bossHpTrail.style.width = `${bPct.toFixed(1)}%`;
      }
      this.lastBossId = activeBoss.id;
      this.lastBossHpPct = bPct;
      this.bossHpFill.style.width = `${bPct.toFixed(1)}%`;
      this.bossHpFill.style.background = isP2 ? bDef.phase2Color : bDef.accentColor;
      this.bossHpText.textContent = `${Math.ceil(activeBoss.hp)} / ${activeBoss.maxHp}`;
    } else {
      this.bossBox.style.display = 'none';
      this.lastBossId = -1;
    }

    // Freeze Storm Warning Meter
    const fs = state.freezeStorm;
    const warnRatio = fs.timerTicks / Math.max(1, fs.thresholdTicks);
    if (fs.active || fs.intensity > 0 || fs.warningShown || warnRatio >= 0.65) {
      this.freezeBox.style.display = 'flex';
      const pct = fs.active ? Math.max(10, fs.intensity * 100) : Math.min(100, warnRatio * 100);
      this.freezeFill.style.width = `${pct.toFixed(1)}%`;
      this.freezeText.textContent = fs.active
        ? `FIMBULWINTER ACTIVE · ${fs.crystals.length} FROST CRYSTAL(S) · ${Math.round(fs.intensity * 100)}%`
        : 'FIMBULWINTER APPROACHING — KEEP MOVING!';
    } else {
      this.freezeBox.style.display = 'none';
    }

    // Bottom-Left 2-Slot Weapons
    this.updateWeaponCard(0, p.weapons[0], p.activeSlot === 0);
    this.updateWeaponCard(1, p.weapons[1], p.activeSlot === 1);

    // 6 Ammo Counters with Low-Ammo Warning
    const activeWep = p.weapons[p.activeSlot];
    const activeAmmoType = activeWep ? getWeaponDef(activeWep.uniqueId).ammoType : 0;
    for (let a = 0; a < 6; a++) {
      const count = p.ammo[a];
      const isLow = a > 0 && count <= 10;
      this.ammoCells[a].classList.toggle('active', a === activeAmmoType);
      this.ammoCells[a].classList.toggle('low', isLow && a === activeAmmoType);
      this.ammoVals[a].textContent = a === 0 ? '∞' : String(count);
    }

    // Loki Toast
    if (state.lokiToast && state.lokiToast.ticksLeft > 0) {
      this.lokiToastEl.style.display = 'flex';
      this.lokiToastText.textContent = state.lokiToast.text;
    } else {
      this.lokiToastEl.style.display = 'none';
    }

    // Contextual Interact Pickup / Exit Prompt
    let promptText = '';
    if (state.map.exitUnlocked && Math.hypot(p.x - state.map.exitX, p.y - state.map.exitY) <= 44) {
      promptText = `${interactTag} ENTER BIFROST PORTAL → OVERWORLD`;
    } else {
      for (let i = 0; i < state.pickups.length; i++) {
        const pk = state.pickups[i];
        if (pk.kind === 'weapon' && pk.weaponUniqueId !== undefined) {
          if (Math.hypot(pk.x - p.x, pk.y - p.y) <= p.radius + 24) {
            const wDef = getWeaponDef(pk.weaponUniqueId);
            promptText = `${interactTag} EQUIP ${wDef.name} (T${wDef.weaponTier})`;
            break;
          }
        }
      }
    }

    if (promptText) {
      this.promptEl.style.display = 'block';
      this.promptEl.textContent = promptText;
    } else {
      this.promptEl.style.display = 'none';
    }

    // Hitmarker flash on shotsHit increment
    if (p.shotsHit > this.lastShotsHit) {
      this.hitMarkerUntilMs = nowMs + 95;
    }
    this.lastShotsHit = p.shotsHit;

    // Dynamic Crosshair / Twin-Stick Projected Aim Reticle
    const isStickAim = Boolean(
      cursor.isStickAim ||
        cursor.isStick ||
        activeDevice === 'gamepad' ||
        activeDevice === 'touch',
    );
    if (showCrosshair && cursor.visible) {
      const wepDef = activeWep ? getWeaponDef(activeWep.uniqueId) : null;
      this.crosshairEl.classList.add('visible');
      this.crosshairEl.classList.toggle('kf-crosshair-stick', isStickAim);
      this.crosshairEl.classList.toggle('hit', nowMs < this.hitMarkerUntilMs);
      this.crosshairEl.style.left = `${cursor.x}px`;
      this.crosshairEl.style.top = `${cursor.y}px`;
      this.crosshairEl.style.color = wepDef?.crosshairColor || '#38e0ff';
      const recoilScale = activeWep ? 1 + Math.min(0.4, Math.abs(activeWep.recoilOffset) * 0.04) : 1;
      this.crosshairEl.style.transform = `scale(${recoilScale.toFixed(2)})`;
    } else {
      this.crosshairEl.classList.remove('visible');
      this.crosshairEl.classList.remove('kf-crosshair-stick');
      this.crosshairEl.classList.remove('hit');
    }
  }

  private updateWeaponCard(
    slot: 0 | 1,
    inst: WeaponInstance | null,
    isActive: boolean,
  ): void {
    const card = this.slotCards[slot];
    card.classList.toggle('active', isActive);
    card.classList.toggle('golden', Boolean(inst?.golden));

    if (!inst) {
      this.slotNames[slot].textContent = `[${slot + 1}] EMPTY SLOT`;
      this.slotNames[slot].style.color = 'var(--kf-text-muted)';
      this.slotBadges[slot].textContent = '---';
      this.slotHeatFills[slot].style.width = '0%';
      if (this.lastWeaponThumbSigs[slot] !== 'empty') {
        this.lastWeaponThumbSigs[slot] = 'empty';
        this.slotThumbs[slot].style.display = 'none';
      }
      if (this.lastModSigs[slot] !== 'empty') {
        this.lastModSigs[slot] = 'empty';
        this.slotModPips[slot].innerHTML = '';
      }
      return;
    }

    const def = getWeaponDef(inst.uniqueId);
    const tierCol = TIER_COLORS[def.weaponTier] ?? '#fff';

    const thumbSig = `${inst.uniqueId}|${inst.golden ? 'g' : 'n'}`;
    if (thumbSig !== this.lastWeaponThumbSigs[slot]) {
      this.lastWeaponThumbSigs[slot] = thumbSig;
      const url = getWeaponThumbUrl(def.ammoType, def.class, def.uniqueId, inst.golden, 44, 24);
      if (url) {
        this.slotThumbs[slot].src = url;
        this.slotThumbs[slot].style.display = 'block';
      } else {
        this.slotThumbs[slot].style.display = 'none';
      }
    }

    this.slotNames[slot].textContent = `${inst.golden ? '★ ' : ''}[${slot + 1}] ${def.name}`;
    this.slotNames[slot].style.color = inst.golden ? 'var(--kf-amber)' : '#fff';
    this.slotBadges[slot].textContent = `T${def.weaponTier}`;
    this.slotBadges[slot].style.borderColor = tierCol;
    this.slotBadges[slot].style.color = tierCol;

    const heatPct = Math.max(0, Math.min(100, inst.overheat * 100));
    this.slotHeatFills[slot].style.width = `${heatPct.toFixed(0)}%`;
    this.slotHeatFills[slot].style.background =
      inst.overheatedLockTicks > 0 ? '#ff3d5e' : heatPct > 70 ? '#ff6d00' : '#ff9c2a';

    const modSig = inst.mods.join(',');
    if (modSig !== this.lastModSigs[slot]) {
      this.lastModSigs[slot] = modSig;
      this.slotModPips[slot].innerHTML = '';
      for (const modId of inst.mods) {
        const mDef = getModDef(modId);
        const pip = document.createElement('span');
        pip.className = 'kf-mod-pip';
        pip.style.background = mDef.accentColor;
        pip.title = mDef.name;
        this.slotModPips[slot].appendChild(pip);
      }
    }
  }

  public dispose(): void {
    this.root.remove();
    this.crosshairEl.remove();
  }
}
