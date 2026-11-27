// ============================================================================
// KRUNKEDFALL — Outpost Hub HUD, Sleek Dock & Interactive Station Modals
// ============================================================================
// Covers every Hub station via walk-up [E] OR 1-click Dock:
//   - Loki's Head (live animated portrait tank + dialogue + Intro Lore)
//   - Jotunn-Matic 3000 (8 Outcasts with portraits/stat bars/loadouts + 10 Skins)
//   - Yggdrasil Skill Tree (glowing curved SVG constellation + rank ladder)
//   - Bifrost Launch -> Overworld Map
//   - Run Modifiers (threat summary + tactile runestone switches)
//   - Weapondex (221 weapons with live pixel-art thumbnails + telemetry bar)
//   - Enemydex (6 Two-Phase Boss trophy portraits + 129 bestiary portraits)
//   - Challenges (18 progression trials with visual progress bars)

import {
  AMMO_NAMES,
  type ControllerStatus,
  type HubPanel,
  type OutcastId,
  type SaveData,
  type SimState,
  type SkinId,
  type WeaponDef,
} from '../contracts/index.js';
import type { GamepadGlyphSet } from '../input/index.js';
import {
  BOSSES,
  CHALLENGES,
  ENEMIES,
  HUB_LOKI_DIALOGUES,
  INTRO_LORE_LINES,
  OUTCASTS,
  RUN_MODIFIERS,
  SKINS,
  UI_LABELS,
  WEAPONS,
  getOutcastDef,
  getSkillNodesForOutcast,
  getSkinDef,
  getWeaponDef,
} from '../data/index.js';
import { computeRunModifiers } from '../sim/index.js';
import { svgIcon, type IconName } from './icons.js';
import {
  drawSpriteToCanvas,
  getBossPortraitUrl,
  getEnemyPortraitUrl,
  getOutcastPortraitUrl,
  getWeaponThumbUrl,
} from './spritePreview.js';

const TIER_COLORS: readonly string[] = [
  '#8da4be',
  '#b8c9dc',
  '#3df299',
  '#38e0ff',
  '#c278ff',
  '#ff9c2a',
  '#ff3d5e',
];

function stripBrackets(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1);
  return t;
}

function formatPromptTag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;
  return `[${trimmed}]`;
}

function formatRankValue(effectKey: string, val: number): string {
  if (effectKey.includes('mult') || effectKey.includes('scale')) {
    const pct = Math.round((val - 1) * 100);
    if (pct > 0) return `+${pct}%`;
    if (pct < 0) return `${pct}%`;
    return `${val.toFixed(2)}×`;
  }
  if (effectKey.includes('chance') || effectKey.includes('rate') || effectKey.includes('reduc')) {
    if (val > 0 && val <= 1) return `+${Math.round(val * 100)}%`;
  }
  return Number.isInteger(val) ? `+${val}` : `+${val.toFixed(2)}`;
}

export interface HubUiCallbacks {
  onOpenPanel(panel: HubPanel): void;
  onLaunchOverworld(): void;
  onOpenWorkbench(): void;
  onOpenPause(): void;
  onSelectOutcast(outcastId: OutcastId): void;
  onSelectSkin(skinId: SkinId): void;
  onAllocateSkill(nodeId: string): boolean;
  onToggleModifier(modifierId: string): void;
  onPlayUiClick(): void;
  onPlayUiConfirm?(): void;
  onPlayUiError?(): void;
}

export class HubUi {
  private readonly root: HTMLElement;
  private readonly topEl: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly dockEl: HTMLElement;
  private readonly modalBackdrop: HTMLElement;
  private readonly cb: HubUiCallbacks;

  private visible = false;
  private lastHudSig = '';
  private lastModalSig = '';
  private lastOpenPanel: HubPanel = 'none';

  // Local modal UI states (preserved across re-renders)
  private selectedLokiTopic = HUB_LOKI_DIALOGUES[0]?.id ?? 'who_am_i';
  private selectedSkillNodeId = 'skill_fortitude';
  private weaponSearch = '';
  private weaponTierFilter = 'all';
  private weaponAmmoFilter = 'all';
  private weaponDiscoveredOnly = false;
  private selectedWeaponId: number = WEAPONS[0]?.uniqueId ?? 0;
  private enemySearch = '';
  private enemyCategoryFilter = 'all';

  // Animated pixel-art portrait canvases inside open Hub modals
  private jotunnPreviewCanvas: HTMLCanvasElement | null = null;
  private jotunnPreviewFrame = -1;
  private lokiCanvas: HTMLCanvasElement | null = null;
  private lokiFrame = -1;

  constructor(parent: HTMLElement, callbacks: HubUiCallbacks) {
    this.cb = callbacks;
    this.root = document.createElement('div');
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.display = 'none';
    this.root.style.pointerEvents = 'none';

    this.topEl = document.createElement('div');
    this.topEl.className = 'kf-hub-top';

    this.promptEl = document.createElement('div');
    this.promptEl.className = 'kf-panel kf-panel-gold kf-hub-station-prompt kf-interactive';
    this.promptEl.style.display = 'none';
    this.promptEl.dataset.uiInteractive = 'true';

    this.dockEl = document.createElement('div');
    this.dockEl.className = 'kf-panel kf-panel-cyan kf-hub-dock kf-interactive';
    this.dockEl.dataset.uiInteractive = 'true';

    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'kf-modal-backdrop kf-interactive';
    this.modalBackdrop.style.display = 'none';
    this.modalBackdrop.dataset.uiInteractive = 'true';
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) {
        this.cb.onPlayUiClick();
        this.cb.onOpenPanel('none');
      }
    });

    this.root.append(this.topEl, this.promptEl, this.dockEl, this.modalBackdrop);
    parent.appendChild(this.root);
  }

  private playConfirm(): void {
    if (this.cb.onPlayUiConfirm) this.cb.onPlayUiConfirm();
    else this.cb.onPlayUiClick();
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.lastHudSig = '';
      this.lastModalSig = '';
      this.lastOpenPanel = 'none';
      this.jotunnPreviewCanvas = null;
      this.jotunnPreviewFrame = -1;
      this.lokiCanvas = null;
      this.lokiFrame = -1;
    }
  }

  public render(
    state: SimState,
    save: SaveData,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    if (!this.visible) return;

    // 1. Check nearby Hub station for walk-up prompt
    const p = state.player;
    let nearestStation = null;
    let bestDist = Infinity;
    for (let i = 0; i < state.hubInteractables.length; i++) {
      const st = state.hubInteractables[i];
      const d = Math.hypot(st.x - p.x, st.y - p.y);
      if (d <= st.radius + p.radius + 18 && d < bestDist) {
        bestDist = d;
        nearestStation = st;
      }
    }

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const promptKey = `${activeDevice}:${controllerStatus?.gamepadProfile ?? 'generic'}:${prompts?.interact ?? ''}:${prompts?.workbench ?? ''}:${prompts?.pause ?? ''}:${prompts?.cancel ?? ''}`;

    const hudSig = [
      p.outcastId,
      p.skinId,
      p.level,
      p.gold,
      p.skillPoints,
      state.activeModifiers.length,
      state.hubPanel,
      nearestStation?.id ?? 'none',
      state.loopCount,
      save.discoveredWeapons.length,
      save.discoveredEnemies.length,
      save.completedChallenges.length,
      promptKey,
    ].join('|');

    if (hudSig !== this.lastHudSig) {
      this.lastHudSig = hudSig;
      this.renderHubChrome(state, save, nearestStation, controllerStatus, prompts);
    }

    // 2. Render active Hub Modal Panel (if any)
    if (state.hubPanel === 'none') {
      if (this.modalBackdrop.style.display !== 'none') {
        this.modalBackdrop.style.display = 'none';
        this.modalBackdrop.classList.remove('kf-entering');
        this.modalBackdrop.innerHTML = '';
        this.lastModalSig = '';
        this.lastOpenPanel = 'none';
        this.jotunnPreviewCanvas = null;
        this.jotunnPreviewFrame = -1;
        this.lokiCanvas = null;
        this.lokiFrame = -1;
      }
      return;
    }

    this.modalBackdrop.style.display = 'flex';
    const modalSig = `${this.computeModalSignature(state, save)}|${promptKey}`;
    if (modalSig !== this.lastModalSig) {
      const isFreshPanel = state.hubPanel !== this.lastOpenPanel;
      this.lastModalSig = modalSig;
      this.lastOpenPanel = state.hubPanel;
      this.renderModal(state, save, isFreshPanel, controllerStatus, prompts);
    } else if (state.hubPanel === 'jotunn_matic' && this.jotunnPreviewCanvas) {
      const animFrame = Math.floor(state.tick / 14) % 4;
      if (animFrame !== this.jotunnPreviewFrame) {
        this.jotunnPreviewFrame = animFrame;
        const outcast = getOutcastDef(p.outcastId);
        drawSpriteToCanvas(this.jotunnPreviewCanvas, outcast.spriteKey, {
          frameIndex: animFrame,
          skinId: p.skinId,
          fixedScale: 4,
        });
      }
    } else if (state.hubPanel === 'loki' && this.lokiCanvas) {
      const animFrame = Math.floor(state.tick / 18) % 4;
      if (animFrame !== this.lokiFrame) {
        this.lokiFrame = animFrame;
        drawSpriteToCanvas(this.lokiCanvas, 'hub_loki', {
          frameIndex: animFrame,
          padding: 4,
        });
      }
    }
  }

  private renderHubChrome(
    state: SimState,
    save: SaveData,
    nearestStation: SimState['hubInteractables'][number] | null,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    const p = state.player;
    const outcast = getOutcastDef(p.outcastId);
    const skin = getSkinDef(p.skinId);
    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';

    const pauseKey =
      activeDevice === 'touch'
        ? ''
        : stripBrackets(prompts?.pause ?? 'ESC');
    const interactKey =
      activeDevice === 'touch'
        ? 'USE'
        : stripBrackets(prompts?.interact ?? 'E');
    const benchKey =
      activeDevice === 'touch'
        ? ''
        : stripBrackets(prompts?.workbench ?? 'TAB');

    // ---- TOP BAR ----
    this.topEl.innerHTML = '';

    const leftBadge = document.createElement('div');
    leftBadge.className = 'kf-panel kf-panel-cyan kf-hub-badge kf-interactive';
    leftBadge.dataset.uiInteractive = 'true';

    const portraitUrl = getOutcastPortraitUrl(p.outcastId, p.skinId, 38);
    const portraitBox = document.createElement('div');
    portraitBox.className = 'kf-hub-portrait';
    portraitBox.style.borderColor = outcast.accentColor;
    if (portraitUrl) {
      const img = document.createElement('img');
      img.src = portraitUrl;
      img.width = 34;
      img.height = 34;
      img.className = 'kf-pixel-img';
      img.alt = outcast.name;
      portraitBox.appendChild(img);
    } else {
      portraitBox.innerHTML = svgIcon('clone', 18);
    }

    const metaCol = document.createElement('div');
    metaCol.className = 'kf-hub-badge-meta';
    metaCol.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong style="font-family:var(--kf-font-display);font-size:14px;letter-spacing:0.12em;color:#fff;">THREE-ROCK OUTPOST</strong>
        <span class="kf-pill kf-pill-cyan" style="border-color:${outcast.accentColor};color:#eef8ff;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:1px;background:${outcast.accentColor};"></span>
          ${outcast.name} · ${skin.name}
        </span>
      </div>
      <div class="kf-hub-stat-row">
        <span class="kf-hub-stat-chip">${svgIcon('star', 12)} LVL <strong style="color:#fff;">${p.level}</strong></span>
        <span class="kf-hub-stat-chip" style="color:var(--kf-amber);">${svgIcon('gold', 12)} <strong>${p.gold}G</strong></span>
        <span class="kf-hub-stat-chip" style="color:${p.skillPoints > 0 ? 'var(--kf-emerald)' : 'var(--kf-text-dim)'};">${svgIcon('tree', 12)} <strong>${p.skillPoints} SP</strong></span>
        <span class="kf-hub-stat-chip" style="color:${state.activeModifiers.length > 0 ? 'var(--kf-gold)' : 'var(--kf-text-dim)'};">${svgIcon('modifiers', 12)} <strong>${state.activeModifiers.length}</strong> MODS</span>
        ${state.loopCount > 0 ? `<span class="kf-hub-stat-chip" style="color:var(--kf-rune);">${svgIcon('loop', 12)} LOOP <strong>${state.loopCount}</strong></span>` : ''}
      </div>
    `;
    leftBadge.append(portraitBox, metaCol);

    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.alignItems = 'center';
    rightControls.style.gap = '8px';
    rightControls.className = 'kf-interactive';
    rightControls.dataset.uiInteractive = 'true';

    const deployBtn = this.makeHtmlBtn(
      `${svgIcon('bifrost', 15)}<span>BIFROST MAP</span>${svgIcon('chevronRight', 13)}`,
      'kf-btn kf-btn-sm kf-btn-primary',
      () => {
        this.playConfirm();
        this.cb.onLaunchOverworld();
      },
    );
    deployBtn.dataset.testid = 'hub-overworld-top-btn';

    const pauseBtn = this.makeHtmlBtn(
      `${svgIcon('pause', 13)}<span>MENU</span>${pauseKey ? `<span class="kf-kbd">${pauseKey}</span>` : ''}`,
      'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onOpenPause();
      },
    );

    rightControls.append(deployBtn, pauseBtn);
    this.topEl.append(leftBadge, rightControls);

    // ---- WALK-UP STATION PROMPT ----
    if (nearestStation && state.hubPanel === 'none') {
      this.promptEl.style.display = 'flex';
      this.promptEl.innerHTML = '';
      const txt = document.createElement('span');
      txt.style.display = 'inline-flex';
      txt.style.alignItems = 'center';
      txt.style.gap = '8px';
      txt.innerHTML = `<span class="kf-kbd kf-kbd-gold">${interactKey}</span><span>${nearestStation.label}</span>`;
      this.promptEl.append(txt);

      if (nearestStation.id !== 'training_dummy') {
        const openBtn = this.makeHtmlBtn(
          `<span>OPEN</span>${svgIcon('chevronRight', 12)}`,
          'kf-btn kf-btn-sm kf-btn-gold',
          () => {
            this.playConfirm();
            if (nearestStation.id === 'bifrost') {
              this.cb.onLaunchOverworld();
            } else {
              this.cb.onOpenPanel(nearestStation.id as HubPanel);
            }
          },
        );
        this.promptEl.append(openBtn);
      }
    } else {
      this.promptEl.style.display = 'none';
    }

    // ---- SLEEK SINGLE-ROW QUICK-ACCESS HUB DOCK ----
    this.dockEl.innerHTML = '';
    type DockEntry =
      | { sep: true }
      | {
          sep?: false;
          icon: IconName;
          label: string;
          badge?: string;
          badgeClass?: string;
          keyHint?: string;
          extraClass?: string;
          testId: string;
          action: () => void;
          isConfirm?: boolean;
        };

    const dockEntries: DockEntry[] = [
      {
        icon: 'bifrost',
        label: 'BIFROST',
        extraClass: 'primary',
        testId: 'hub-dock-bifrost',
        action: () => this.cb.onLaunchOverworld(),
        isConfirm: true,
      },
      { sep: true },
      {
        icon: 'loki',
        label: 'LOKI',
        extraClass: state.hubPanel === 'loki' ? 'active' : '',
        testId: 'hub-dock-loki',
        action: () => this.cb.onOpenPanel('loki'),
      },
      {
        icon: 'clone',
        label: 'CLONES',
        extraClass: state.hubPanel === 'jotunn_matic' ? 'active' : '',
        testId: 'hub-dock-jotunn',
        action: () => this.cb.onOpenPanel('jotunn_matic'),
      },
      {
        icon: 'tree',
        label: 'YGGDRASIL',
        badge: p.skillPoints > 0 ? `${p.skillPoints}` : undefined,
        badgeClass: p.skillPoints > 0 ? 'sp' : '',
        extraClass:
          state.hubPanel === 'skill_tree'
            ? 'active'
            : p.skillPoints > 0
              ? 'notify'
              : '',
        testId: 'hub-dock-skills',
        action: () => this.cb.onOpenPanel('skill_tree'),
      },
      {
        icon: 'modifiers',
        label: 'MODS',
        badge: state.activeModifiers.length > 0 ? `${state.activeModifiers.length}` : undefined,
        badgeClass: 'gold',
        extraClass: state.hubPanel === 'modifiers' ? 'active' : '',
        testId: 'hub-dock-modifiers',
        action: () => this.cb.onOpenPanel('modifiers'),
      },
      { sep: true },
      {
        icon: 'weapondex',
        label: 'ARSENAL',
        badge: `${save.discoveredWeapons.length}/${WEAPONS.length}`,
        extraClass: state.hubPanel === 'weapondex' ? 'active' : '',
        testId: 'hub-dock-weapondex',
        action: () => this.cb.onOpenPanel('weapondex'),
      },
      {
        icon: 'enemydex',
        label: 'BESTIARY',
        badge: `${save.discoveredEnemies.length}/${ENEMIES.length}`,
        extraClass: state.hubPanel === 'enemydex' ? 'active' : '',
        testId: 'hub-dock-enemydex',
        action: () => this.cb.onOpenPanel('enemydex'),
      },
      {
        icon: 'challenges',
        label: 'TRIALS',
        badge: `${save.completedChallenges.length}/${CHALLENGES.length}`,
        extraClass: state.hubPanel === 'challenges' ? 'active' : '',
        testId: 'hub-dock-challenges',
        action: () => this.cb.onOpenPanel('challenges'),
      },
      { sep: true },
      {
        icon: 'workbench',
        label: 'BENCH',
        keyHint: benchKey || undefined,
        testId: 'hub-dock-workbench',
        action: () => this.cb.onOpenWorkbench(),
      },
    ];

    for (const entry of dockEntries) {
      if (entry.sep) {
        const sep = document.createElement('span');
        sep.className = 'kf-dock-sep';
        this.dockEl.appendChild(sep);
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-dock-btn${entry.extraClass ? ` ${entry.extraClass}` : ''}`;
      btn.dataset.testid = entry.testId;
      btn.innerHTML =
        svgIcon(entry.icon, 14) +
        `<span>${entry.label}</span>` +
        (entry.badge
          ? `<span class="kf-dock-badge${entry.badgeClass ? ` ${entry.badgeClass}` : ''}">${entry.badge}</span>`
          : '') +
        (entry.keyHint
          ? `<span class="kf-kbd" style="height:17px;font-size:9px;padding:0 4px;">${entry.keyHint}</span>`
          : '');
      btn.addEventListener('click', () => {
        if (entry.isConfirm) this.playConfirm();
        else this.cb.onPlayUiClick();
        entry.action();
      });
      this.dockEl.appendChild(btn);
    }
  }

  private computeModalSignature(state: SimState, save: SaveData): string {
    const p = state.player;
    const ranksSig = Object.entries(state.skillRanks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    return [
      state.hubPanel,
      p.outcastId,
      p.skinId,
      p.skillPoints,
      p.gold,
      ranksSig,
      state.activeModifiers.join(','),
      save.unlockedSkins.join(','),
      save.discoveredWeapons.length,
      save.discoveredEnemies.length,
      save.defeatedBosses.join(','),
      save.completedChallenges.join(','),
      this.selectedLokiTopic,
      this.selectedSkillNodeId,
      this.weaponSearch,
      this.weaponTierFilter,
      this.weaponAmmoFilter,
      this.weaponDiscoveredOnly ? '1' : '0',
      this.enemySearch,
      this.enemyCategoryFilter,
    ].join('|');
  }

  private renderModal(
    state: SimState,
    save: SaveData,
    isFreshPanel: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    this.modalBackdrop.classList.toggle('kf-entering', isFreshPanel);
    this.modalBackdrop.innerHTML = '';
    this.jotunnPreviewCanvas = null;
    this.jotunnPreviewFrame = -1;
    this.lokiCanvas = null;
    this.lokiFrame = -1;

    const panelKey = state.hubPanel;
    if (panelKey === 'none') return;

    const panelMeta: Record<
      Exclude<HubPanel, 'none'>,
      {
        title: string;
        sub: string;
        panelClass: string;
        badgeClass: string;
        icon: IconName;
      }
    > = {
      loki: {
        title: "LOKI'S HEAD",
        sub: 'DECAPITATED MASTERMIND · THREE-ROCK LAB',
        panelClass: 'kf-panel-emerald',
        badgeClass: 'emerald',
        icon: 'loki',
      },
      jotunn_matic: {
        title: UI_LABELS.jotunnMaticTitle,
        sub: '8 OUTCAST CLONES · 10 ARMOR SKINS',
        panelClass: 'kf-panel-gold',
        badgeClass: 'gold',
        icon: 'clone',
      },
      skill_tree: {
        title: UI_LABELS.skillTreeTitle,
        sub: `UNSPENT SKILL POINTS: ${state.player.skillPoints} SP`,
        panelClass: 'kf-panel-emerald',
        badgeClass: 'emerald',
        icon: 'tree',
      },
      modifiers: {
        title: UI_LABELS.modifiersTitle,
        sub: `${state.activeModifiers.length} ACTIVE MODIFIER${state.activeModifiers.length === 1 ? '' : 'S'}`,
        panelClass: 'kf-panel-crimson',
        badgeClass: 'crimson',
        icon: 'modifiers',
      },
      weapondex: {
        title: UI_LABELS.weapondexTitle,
        sub: `${save.discoveredWeapons.length} / ${WEAPONS.length} WEAPONS CATALOGUED`,
        panelClass: 'kf-panel-cyan',
        badgeClass: '',
        icon: 'weapondex',
      },
      enemydex: {
        title: UI_LABELS.enemydexTitle,
        sub: `${save.discoveredEnemies.length} / ${ENEMIES.length} ENTRIES · ${save.defeatedBosses.length}/6 BOSSES SLAIN`,
        panelClass: 'kf-panel-crimson',
        badgeClass: 'crimson',
        icon: 'enemydex',
      },
      challenges: {
        title: UI_LABELS.challengesTitle,
        sub: `${save.completedChallenges.length} / ${CHALLENGES.length} TRIALS COMPLETED`,
        panelClass: 'kf-panel-gold',
        badgeClass: 'gold',
        icon: 'challenges',
      },
    };

    const meta = panelMeta[panelKey];
    const modal = document.createElement('div');
    modal.className = [
      'kf-panel',
      meta.panelClass,
      'kf-modal',
      panelKey === 'skill_tree' ? 'kf-modal-skill' : '',
      isFreshPanel ? 'kf-entering' : '',
    ]
      .filter(Boolean)
      .join(' ');
    modal.dataset.testid = `hub-modal-${panelKey}`;

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const closeKey =
      activeDevice === 'touch'
        ? ''
        : activeDevice === 'gamepad' && prompts
          ? stripBrackets(formatPromptTag(prompts.cancel))
          : 'ESC';

    const header = document.createElement('div');
    header.className = 'kf-modal-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'kf-modal-title-group';
    titleGroup.innerHTML = `
      <div class="kf-modal-icon-badge ${meta.badgeClass}">${svgIcon(meta.icon, 18)}</div>
      <div style="min-width:0;">
        <div class="kf-modal-title">${meta.title}</div>
        <span class="kf-modal-subtitle">${meta.sub}</span>
      </div>
    `;

    const closeBtn = this.makeHtmlBtn(
      `${svgIcon('close', 13)}<span>CLOSE</span>${closeKey ? `<span class="kf-kbd">${closeKey}</span>` : ''}`,
      'kf-btn kf-btn-sm kf-btn-danger',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onOpenPanel('none');
      },
    );
    closeBtn.dataset.testid = 'hub-modal-close';
    header.append(titleGroup, closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    switch (panelKey) {
      case 'loki':
        this.buildLokiBody(body, state);
        break;
      case 'jotunn_matic':
        this.buildJotunnMaticBody(body, state, save);
        break;
      case 'skill_tree':
        this.buildSkillTreeBody(body, state);
        break;
      case 'modifiers':
        this.buildModifiersBody(body, state);
        break;
      case 'weapondex':
        this.buildWeapondexBody(body, save);
        break;
      case 'enemydex':
        this.buildEnemydexBody(body, save);
        break;
      case 'challenges':
        this.buildChallengesBody(body, state, save);
        break;
    }

    modal.append(header, body);
    this.modalBackdrop.appendChild(modal);
  }

  // ==========================================================================
  // 1. LOKI'S HEAD
  // ==========================================================================

  private buildLokiBody(body: HTMLElement, state: SimState): void {
    const layout = document.createElement('div');
    layout.className = 'kf-loki-layout';

    const topicsCol = document.createElement('div');
    topicsCol.className = 'kf-loki-topics';

    const allTopics: Array<{ id: string; prompt: string; lines: readonly string[]; isLore?: boolean }> = [
      ...HUB_LOKI_DIALOGUES,
      {
        id: 'intro_lore',
        prompt: 'CHRONICLE: HOW RAGNAROK BEGAN',
        lines: INTRO_LORE_LINES,
        isLore: true,
      },
    ];

    allTopics.forEach((topic, idx) => {
      const isSelected = this.selectedLokiTopic === topic.id;
      const num = String(idx + 1).padStart(2, '0');
      const btn = this.makeHtmlBtn(
        `<span style="font-family:var(--kf-font);font-size:10px;opacity:0.65;margin-right:2px;">${num}</span><span style="flex:1;">${topic.prompt}</span>`,
        `kf-btn kf-loki-topic-btn${isSelected ? ' active' : ''}`,
        () => {
          this.cb.onPlayUiClick();
          this.selectedLokiTopic = topic.id;
          this.lastModalSig = '';
        },
      );
      btn.dataset.testid = `loki-topic-${topic.id}`;
      btn.dataset.gpTabGroup = 'loki-topics';
      if (isSelected) {
        btn.dataset.gpTabActive = 'true';
        btn.dataset.gpInitial = 'true';
      }
      topicsCol.appendChild(btn);
    });

    const activeTopic =
      allTopics.find((t) => t.id === this.selectedLokiTopic) ?? allTopics[0];

    const speechCol = document.createElement('div');
    speechCol.className = 'kf-loki-speech';

    const portraitRow = document.createElement('div');
    portraitRow.className = 'kf-loki-portrait-row';

    const tank = document.createElement('div');
    tank.className = 'kf-loki-tank';
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = 'kf-pixel-img';
    canvas.style.width = '58px';
    canvas.style.height = '58px';
    const animFrame = Math.floor(state.tick / 18) % 4;
    this.lokiCanvas = canvas;
    this.lokiFrame = animFrame;
    drawSpriteToCanvas(canvas, 'hub_loki', { frameIndex: animFrame, padding: 4 });
    tank.appendChild(canvas);

    const speakerInfo = document.createElement('div');
    speakerInfo.style.flex = '1';
    speakerInfo.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong style="font-family:var(--kf-font-display);font-size:15px;color:var(--kf-emerald);letter-spacing:0.12em;">LOKI — SEVERED GOD OF MISCHIEF</strong>
        <span class="kf-pill kf-pill-emerald">BIO-JAR ONLINE</span>
      </div>
      <div style="font-size:11.5px;color:var(--kf-text-dim);margin-top:3px;">${activeTopic.prompt}</div>
    `;

    portraitRow.append(tank, speakerInfo);
    speechCol.appendChild(portraitRow);

    activeTopic.lines.forEach((line, idx) => {
      const p = document.createElement('div');
      p.className = 'kf-loki-line';
      if (activeTopic.isLore) {
        p.innerHTML = `<span style="font-family:var(--kf-font);font-size:10px;color:var(--kf-emerald);margin-right:8px;opacity:0.8;">[${String(idx + 1).padStart(2, '0')}]</span>${line}`;
      } else {
        p.textContent = `"${line}"`;
      }
      speechCol.appendChild(p);
    });

    layout.append(topicsCol, speechCol);
    body.appendChild(layout);
  }

  // ==========================================================================
  // 2. JOTUNN-MATIC 3000 (8 OUTCASTS + 10 SKINS)
  // ==========================================================================

  private buildJotunnMaticBody(body: HTMLElement, state: SimState, save: SaveData): void {
    const selected = getOutcastDef(state.player.outcastId);
    const activeSkin = getSkinDef(state.player.skinId);
    const primaryWep = getWeaponDef(selected.startingWeaponUniqueId);
    const secondaryWep =
      selected.secondaryWeaponUniqueId !== undefined
        ? getWeaponDef(selected.secondaryWeaponUniqueId)
        : null;

    // 8 Outcast Selection Cards with Live Pixel-Art Portraits
    const outcastGrid = document.createElement('div');
    outcastGrid.className = 'kf-outcast-grid';

    for (const oc of OUTCASTS) {
      const isSelected = oc.id === selected.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kf-outcast-card${isSelected ? ' selected' : ''}`;
      card.dataset.testid = `outcast-card-${oc.id}`;

      const thumbUrl = getOutcastPortraitUrl(
        oc.id,
        isSelected ? activeSkin.id : 'original',
        42,
      );
      card.innerHTML = `
        <div class="kf-outcast-thumb" style="border-color:${isSelected ? 'var(--kf-amber)' : `${oc.accentColor}66`};">
          ${thumbUrl ? `<img class="kf-pixel-img" src="${thumbUrl}" width="38" height="38" alt="${oc.name}">` : svgIcon('clone', 18)}
        </div>
        <div class="kf-outcast-card-info">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
            <strong style="font-family:var(--kf-font-display);font-size:13px;color:${oc.accentColor};letter-spacing:0.08em;">${oc.name}</strong>
            <span class="kf-pill" style="font-size:9px;padding:1px 5px;">${oc.maxHp} HP</span>
          </div>
          <div style="font-size:10.5px;color:var(--kf-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${oc.title}</div>
          <div style="font-family:var(--kf-font-display);font-size:10px;color:var(--kf-cyan);letter-spacing:0.04em;">${oc.abilityName}</div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.playConfirm();
        this.cb.onSelectOutcast(oc.id);
      });
      outcastGrid.appendChild(card);
    }

    // Selected Outcast Telemetry + Live 4× Cryo-Chamber
    const detail = document.createElement('div');
    detail.className = 'kf-outcast-detail';

    const hpPct = Math.min(100, Math.round((selected.maxHp / 150) * 100));
    const spdPct = Math.min(100, Math.round((selected.moveSpeed / 3.8) * 100));
    const chgPct = Math.min(100, Math.round((selected.abilityMaxCharges / 3) * 100));

    const primThumb = getWeaponThumbUrl(primaryWep.ammoType, primaryWep.class, primaryWep.uniqueId, false, 44, 24);
    const secThumb = secondaryWep
      ? getWeaponThumbUrl(secondaryWep.ammoType, secondaryWep.class, secondaryWep.uniqueId, false, 44, 24)
      : '';

    const infoCol = document.createElement('div');
    infoCol.className = 'kf-outcast-info-col';
    infoCol.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;flex-wrap:wrap;">
          <span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:${selected.accentColor};box-shadow:0 0 10px ${selected.accentColor};"></span>
          <strong style="font-family:var(--kf-font-display);font-size:17px;letter-spacing:0.1em;color:#fff;">${selected.name} — ${selected.title}</strong>
        </div>

        <div class="kf-outcast-stats-bars">
          <div class="kf-mini-stat">
            <div class="kf-mini-stat-top"><span>VITALITY</span><strong style="color:var(--kf-emerald);">${selected.maxHp} HP</strong></div>
            <div class="kf-mini-stat-bar"><div class="kf-mini-stat-fill" style="width:${hpPct}%;background:linear-gradient(90deg,#25c97a,#3df299);"></div></div>
          </div>
          <div class="kf-mini-stat">
            <div class="kf-mini-stat-top"><span>AGILITY</span><strong style="color:var(--kf-cyan);">${selected.moveSpeed.toFixed(2)}</strong></div>
            <div class="kf-mini-stat-bar"><div class="kf-mini-stat-fill" style="width:${spdPct}%;background:linear-gradient(90deg,#1ea5d6,#38e0ff);"></div></div>
          </div>
          <div class="kf-mini-stat">
            <div class="kf-mini-stat-top"><span>CHARGES</span><strong style="color:var(--kf-amber);">${selected.abilityMaxCharges}×</strong></div>
            <div class="kf-mini-stat-bar"><div class="kf-mini-stat-fill" style="width:${chgPct}%;background:linear-gradient(90deg,#ff9c2a,#ffd257);"></div></div>
          </div>
        </div>
      </div>

      <div class="kf-outcast-loadout-row">
        <span style="font-family:var(--kf-font-display);font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--kf-text-muted);">STARTING KIT</span>
        <div class="kf-loadout-chip">
          ${primThumb ? `<img class="kf-pixel-img" src="${primThumb}" width="34" height="20" alt="">` : ''}
          <span>${primaryWep.name}</span>
        </div>
        ${
          secondaryWep
            ? `<div class="kf-loadout-chip">
                ${secThumb ? `<img class="kf-pixel-img" src="${secThumb}" width="34" height="20" alt="">` : ''}
                <span>${secondaryWep.name}</span>
              </div>`
            : ''
        }
      </div>

      <div class="kf-outcast-kit-grid">
        <div class="kf-kit-box">
          <div style="display:flex;align-items:center;gap:5px;font-family:var(--kf-font-display);font-size:11px;color:var(--kf-cyan);font-weight:800;letter-spacing:0.08em;">
            ${svgIcon('bolt', 13)} ABILITY · ${selected.abilityName}
          </div>
          <div style="font-size:11.5px;color:var(--kf-text-dim);line-height:1.4;">${selected.abilityDesc}</div>
        </div>
        <div class="kf-kit-box power">
          <div style="display:flex;align-items:center;gap:5px;font-family:var(--kf-font-display);font-size:11px;color:var(--kf-amber);font-weight:800;letter-spacing:0.08em;">
            ${svgIcon('flame', 13)} POWER · ${selected.powerName}
          </div>
          <div style="font-size:11.5px;color:var(--kf-text-dim);line-height:1.4;">${selected.powerDesc}</div>
        </div>
      </div>
    `;

    // Live 4× Cryo-Preview Chamber
    const previewPanel = document.createElement('div');
    previewPanel.className = 'kf-outcast-preview-panel';
    const isSlayer = activeSkin.id === 'krunkedslayer';
    const glowColor = isSlayer
      ? '#00ff9f'
      : activeSkin.id === 'original'
        ? selected.accentColor
        : activeSkin.paletteSwap[0];
    const borderCol = isSlayer ? '#ff2a85' : glowColor;

    const previewHeader = document.createElement('div');
    previewHeader.className = 'kf-outcast-preview-header';
    previewHeader.innerHTML = `
      <span style="font-family:var(--kf-font-display);font-size:10px;letter-spacing:0.14em;color:var(--kf-text-dim);font-weight:800;">CRYO CHAMBER 4×</span>
      <span class="kf-pill" style="font-size:9.5px;padding:1px 6px;border-color:${borderCol};color:${isSlayer ? '#ff2a85' : glowColor};">${activeSkin.name}</span>
    `;

    const stage = document.createElement('div');
    stage.className = 'kf-outcast-preview-stage';
    stage.style.borderColor = borderCol;
    stage.style.background = `radial-gradient(circle at 50% 56%, ${glowColor}2c 0%, #0d1320 62%, #070a11 100%)`;

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 96;
    previewCanvas.height = 96;
    previewCanvas.className = 'kf-outcast-preview-canvas';
    previewCanvas.dataset.testid = 'jotunn-preview-canvas';
    previewCanvas.setAttribute(
      'aria-label',
      `${selected.name} pixel-art preview (${activeSkin.name} skin)`,
    );
    stage.appendChild(previewCanvas);

    const previewFoot = document.createElement('div');
    previewFoot.className = 'kf-outcast-preview-foot';
    previewFoot.innerHTML = `
      <div class="kf-swatch-row" style="width:100%;">
        <span class="kf-swatch" style="background:${activeSkin.paletteSwap[0]};"></span>
        <span class="kf-swatch" style="background:${activeSkin.paletteSwap[1]};"></span>
        <span class="kf-swatch" style="background:${activeSkin.paletteSwap[2]};"></span>
      </div>
      <div style="font-size:10px;color:${isSlayer ? '#00ff9f' : 'var(--kf-text-dim)'};text-align:center;line-height:1.3;">
        ${activeSkin.unlockCondition}
      </div>
    `;

    previewPanel.append(previewHeader, stage, previewFoot);
    detail.append(infoCol, previewPanel);

    const animFrame = Math.floor(state.tick / 14) % 4;
    this.jotunnPreviewCanvas = previewCanvas;
    this.jotunnPreviewFrame = animFrame;
    drawSpriteToCanvas(previewCanvas, selected.spriteKey, {
      frameIndex: animFrame,
      skinId: activeSkin.id,
      fixedScale: 4,
    });

    // Skins Section
    const skinHeader = document.createElement('div');
    skinHeader.style.display = 'flex';
    skinHeader.style.justifyContent = 'space-between';
    skinHeader.style.alignItems = 'center';
    skinHeader.style.marginBottom = '8px';
    skinHeader.innerHTML = `
      <strong style="font-family:var(--kf-font-display);font-size:13px;color:var(--kf-amber);letter-spacing:0.12em;">ARMOR SKINS (${SKINS.length} TOTAL · LIVE SWAP)</strong>
      <span class="kf-pill kf-pill-gold">EARNED ${save.unlockedSkins.length}/${SKINS.length}</span>
    `;

    const skinGrid = document.createElement('div');
    skinGrid.className = 'kf-skin-grid';

    for (const sk of SKINS) {
      const earned = save.unlockedSkins.includes(sk.id);
      const isSelected = state.player.skinId === sk.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kf-skin-card${isSelected ? ' selected' : ''}`;
      card.dataset.testid = `skin-card-${sk.id}`;
      card.title = sk.unlockCondition;
      card.innerHTML = `
        <div class="kf-swatch-row">
          <span class="kf-swatch" style="background:${sk.paletteSwap[0]};"></span>
          <span class="kf-swatch" style="background:${sk.paletteSwap[1]};"></span>
          <span class="kf-swatch" style="background:${sk.paletteSwap[2]};"></span>
        </div>
        <div style="font-family:var(--kf-font-display);font-size:11.5px;font-weight:800;letter-spacing:0.06em;color:${sk.id === 'krunkedslayer' ? '#ff2a85' : '#fff'};">${sk.name}</div>
        <div style="font-family:var(--kf-font);font-size:9.5px;color:${isSelected ? 'var(--kf-emerald)' : earned ? 'var(--kf-cyan)' : 'var(--kf-text-muted)'};">
          ${isSelected ? '● EQUIPPED' : earned ? 'UNLOCKED' : 'PREVIEW'}
        </div>
      `;
      card.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.cb.onSelectSkin(sk.id);
      });
      skinGrid.appendChild(card);
    }

    body.append(outcastGrid, detail, skinHeader, skinGrid);
  }

  // ==========================================================================
  // 3. YGGDRASIL SKILL TREE (CONSTELLATION + RANK LADDER)
  // ==========================================================================

  private buildSkillTreeBody(body: HTMLElement, state: SimState): void {
    const outcast = getOutcastDef(state.player.outcastId);
    const nodes = getSkillNodesForOutcast(state.player.outcastId);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    if (!nodeById.has(this.selectedSkillNodeId) && nodes.length > 0) {
      this.selectedSkillNodeId = nodes[0].id;
    }

    const layout = document.createElement('div');
    layout.className = 'kf-skill-layout';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'kf-skill-canvas-wrap';

    const crownLabel = document.createElement('div');
    crownLabel.className = 'kf-skill-crown-label';
    crownLabel.textContent = `★ ${outcast.name} EXCLUSIVE CROWN`;
    canvasWrap.appendChild(crownLabel);

    // SVG Glowing Branch Conduits
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'kf-skill-svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');

    for (const node of nodes) {
      const nodeRank = state.skillRanks[node.id] ?? 0;
      for (const reqId of node.requires) {
        const parentNode = nodeById.get(reqId);
        if (!parentNode) continue;
        const parentRank = state.skillRanks[parentNode.id] ?? 0;
        const isOutcastCrownLink =
          parentNode.outcastId === 'shared' && node.outcastId !== 'shared';

        const x1 = parentNode.x * 100;
        const y1 = parentNode.y * 100;
        const x2 = node.x * 100;
        const y2 = node.y * 100;

        const path = document.createElementNS(svgNS, 'path');
        if (isOutcastCrownLink) {
          path.setAttribute('d', `M ${x1} ${y1} C 4 74, 4 24, ${x2} ${y2}`);
        } else {
          const midY = (y1 + y2) * 0.5;
          path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
        }
        path.setAttribute('fill', 'none');

        const active = nodeRank > 0;
        const frontier = !active && parentRank > 0;
        const strokeCol = active
          ? node.outcastId !== 'shared'
            ? '#ffd257'
            : '#3df299'
          : frontier
            ? '#38e0ff'
            : '#28384f';
        path.setAttribute('stroke', strokeCol);
        path.setAttribute('stroke-width', active ? '0.72' : frontier ? '0.56' : '0.42');
        path.setAttribute('opacity', active ? '0.92' : frontier ? '0.82' : '0.52');
        if (frontier || isOutcastCrownLink) {
          path.setAttribute('stroke-dasharray', '1.6 1.1');
        }
        svg.appendChild(path);
      }
    }
    canvasWrap.appendChild(svg);

    const crownDivider = document.createElement('div');
    crownDivider.className = 'kf-skill-crown-divider';
    canvasWrap.appendChild(crownDivider);

    // Clickable Constellation Nodes with Visual Rank Pips
    for (const node of nodes) {
      const rank = state.skillRanks[node.id] ?? 0;
      const reqsMet = node.requires.every((r) => (state.skillRanks[r] ?? 0) > 0);
      const canBuy =
        reqsMet && rank < node.maxRank && state.player.skillPoints >= node.costPerRank;

      let stateClass = '';
      if (rank >= node.maxRank) stateClass = 'maxed';
      else if (rank > 0) stateClass = 'ranked';
      else if (canBuy) stateClass = 'available';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = [
        'kf-skill-node',
        stateClass,
        node.outcastId !== 'shared' ? 'outcast-exclusive' : '',
        this.selectedSkillNodeId === node.id ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ');
      btn.style.left = `${node.x * 100}%`;
      btn.style.top = `${node.y * 100}%`;
      btn.dataset.testid = `skill-node-${node.id}`;

      const pipsHtml = Array.from({ length: node.maxRank }, (_, i) =>
        `<span class="kf-skill-pip${i < rank ? ' filled' : ''}"></span>`,
      ).join('');

      btn.innerHTML = `
        <span class="kf-skill-node-name">${node.outcastId !== 'shared' ? '★ ' : ''}${node.name}</span>
        <div class="kf-skill-pips">${pipsHtml}</div>
      `;
      btn.addEventListener('click', () => {
        if (this.selectedSkillNodeId === node.id && canBuy) {
          this.playConfirm();
          this.cb.onAllocateSkill(node.id);
        } else {
          this.cb.onPlayUiClick();
          this.selectedSkillNodeId = node.id;
          this.lastModalSig = '';
        }
      });
      canvasWrap.appendChild(btn);
    }

    // Right Inspector with Rank Ladder
    const sel = nodeById.get(this.selectedSkillNodeId) ?? nodes[0];
    const selRank = state.skillRanks[sel.id] ?? 0;
    const reqsMet = sel.requires.every((r) => (state.skillRanks[r] ?? 0) > 0);
    const canAllocate =
      reqsMet && selRank < sel.maxRank && state.player.skillPoints >= sel.costPerRank;

    const ladderHtml = Array.from({ length: sel.maxRank }, (_, idx) => {
      const rankNum = idx + 1;
      const reached = selRank >= rankNum;
      const isNext = selRank + 1 === rankNum;
      const val = sel.valuesPerRank[idx];
      const valStr = val !== undefined ? formatRankValue(sel.effectKey, val) : `RANK ${rankNum}`;
      return `
        <div class="kf-rank-step${reached ? ' reached' : isNext ? ' next' : ''}">
          <span>${reached ? '✓ ' : isNext ? '▸ ' : ''}RANK ${rankNum}</span>
          <strong>${valStr}</strong>
        </div>
      `;
    }).join('');

    const prereqHtml =
      sel.requires.length === 0
        ? `<span class="kf-pill kf-pill-emerald">${svgIcon('check', 11)} ROOT NODE</span>`
        : sel.requires
            .map((r) => {
              const rn = nodeById.get(r);
              const met = (state.skillRanks[r] ?? 0) > 0;
              return `<span class="kf-pill ${met ? 'kf-pill-emerald' : 'kf-pill-crimson'}">${svgIcon(met ? 'check' : 'lock', 11)} ${rn?.name ?? r}</span>`;
            })
            .join(' ');

    const inspector = document.createElement('div');
    inspector.className = 'kf-skill-inspector';
    inspector.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="kf-pill kf-pill-emerald">${svgIcon('tree', 11)} ${state.player.skillPoints} SP</span>
        <span class="kf-pill ${sel.outcastId === 'shared' ? 'kf-pill-cyan' : 'kf-pill-gold'}">
          ${sel.outcastId === 'shared' ? 'SHARED BRANCH' : `${sel.outcastId.toUpperCase()} CROWN`}
        </span>
      </div>
      <div>
        <div style="font-family:var(--kf-font-display);font-size:18px;font-weight:800;color:#fff;letter-spacing:0.1em;line-height:1.15;">${sel.name}</div>
        <div style="font-family:var(--kf-font);font-size:10.5px;color:var(--kf-cyan);margin-top:3px;">
          RANK ${selRank} / ${sel.maxRank} · COST ${sel.costPerRank} SP
        </div>
      </div>
      <div style="font-size:12.5px;color:var(--kf-text-dim);line-height:1.5;">${sel.description}</div>
      <div class="kf-rank-ladder">${ladderHtml}</div>
      <div>
        <div style="font-family:var(--kf-font-display);font-size:10px;font-weight:700;letter-spacing:0.1em;color:var(--kf-text-muted);margin-bottom:5px;">PREREQUISITES</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">${prereqHtml}</div>
      </div>
    `;

    const allocBtn = this.makeHtmlBtn(
      selRank >= sel.maxRank
        ? `${svgIcon('star', 14)}<span>MAX RANK REACHED</span>`
        : !reqsMet
          ? `${svgIcon('lock', 14)}<span>PREREQUISITE LOCKED</span>`
          : state.player.skillPoints < sel.costPerRank
            ? `${svgIcon('lock', 14)}<span>NEED ${sel.costPerRank} SKILL PT</span>`
            : `${svgIcon('spark', 14)}<span>ALLOCATE RANK (${sel.costPerRank} SP)</span>`,
      canAllocate ? 'kf-btn kf-btn-emerald' : 'kf-btn',
      () => {
        if (this.cb.onAllocateSkill(sel.id)) {
          this.playConfirm();
        } else {
          (this.cb.onPlayUiError ?? this.cb.onPlayUiClick)();
        }
      },
    );
    allocBtn.disabled = !canAllocate;
    allocBtn.dataset.testid = 'skill-allocate-btn';
    allocBtn.style.marginTop = 'auto';
    inspector.appendChild(allocBtn);

    const tip = document.createElement('div');
    tip.style.fontSize = '10.5px';
    tip.style.color = 'var(--kf-text-muted)';
    tip.textContent = 'Click a node to inspect. Click again or press Allocate to invest SP.';
    inspector.appendChild(tip);

    layout.append(canvasWrap, inspector);
    body.appendChild(layout);
  }

  // ==========================================================================
  // 4. RUN MODIFIER STONE
  // ==========================================================================

  private buildModifiersBody(body: HTMLElement, state: SimState): void {
    const summary = computeRunModifiers(state.activeModifiers);
    const threatBar = document.createElement('div');
    threatBar.className = 'kf-threat-bar';
    threatBar.innerHTML = `
      <div class="kf-threat-stat">
        <span class="kf-threat-stat-lbl">ENEMY VITALITY</span>
        <span class="kf-threat-stat-val" style="color:var(--kf-crimson);">${summary.enemyHpMult.toFixed(2)}×</span>
      </div>
      <div class="kf-threat-stat">
        <span class="kf-threat-stat-lbl">ENEMY SPEED</span>
        <span class="kf-threat-stat-val" style="color:var(--kf-gold);">${summary.enemySpeedMult.toFixed(2)}×</span>
      </div>
      <div class="kf-threat-stat">
        <span class="kf-threat-stat-lbl">STORM RATE</span>
        <span class="kf-threat-stat-val" style="color:var(--kf-cyan);">${summary.freezeRateMult.toFixed(2)}×</span>
      </div>
      <div class="kf-threat-stat">
        <span class="kf-threat-stat-lbl">LOOT QUALITY</span>
        <span class="kf-threat-stat-val" style="color:var(--kf-emerald);">+${Math.round(summary.dropQualityBonus * 100)}%</span>
      </div>
      <div class="kf-threat-stat">
        <span class="kf-threat-stat-lbl">SCORE MULT</span>
        <span class="kf-threat-stat-val" style="color:var(--kf-amber);">${summary.scoreMult.toFixed(2)}×</span>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    for (const mod of RUN_MODIFIERS) {
      const active = state.activeModifiers.includes(mod.id);
      const card = document.createElement('div');
      card.className = `kf-card${active ? ' active' : ''}`;

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'center';
      topRow.style.gap = '10px';

      const titleDiv = document.createElement('div');
      titleDiv.style.display = 'flex';
      titleDiv.style.alignItems = 'center';
      titleDiv.style.gap = '7px';
      titleDiv.innerHTML = `
        <span style="color:${active ? 'var(--kf-amber)' : 'var(--kf-text-muted)'};">${svgIcon('rune', 15)}</span>
        <strong style="font-family:var(--kf-font-display);font-size:14px;letter-spacing:0.08em;color:${active ? 'var(--kf-amber)' : '#fff'};">${mod.name}</strong>
      `;

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = `kf-toggle gold${active ? ' on' : ''}`;
      toggleBtn.dataset.testid = `modifier-toggle-${mod.id}`;
      toggleBtn.innerHTML = `
        <span class="kf-toggle-track"><span class="kf-toggle-thumb"></span></span>
        <span>${active ? 'ACTIVE' : 'OFF'}</span>
      `;
      toggleBtn.addEventListener('click', () => {
        if (!active) this.playConfirm();
        else this.cb.onPlayUiClick();
        this.cb.onToggleModifier(mod.id);
      });
      topRow.append(titleDiv, toggleBtn);

      const desc = document.createElement('div');
      desc.style.fontSize = '12px';
      desc.style.color = 'var(--kf-text-dim)';
      desc.style.lineHeight = '1.42';
      desc.textContent = mod.description;

      const pills = document.createElement('div');
      pills.style.display = 'flex';
      pills.style.flexWrap = 'wrap';
      pills.style.gap = '6px';
      pills.style.marginTop = '2px';
      pills.innerHTML = `
        <span class="kf-pill${mod.enemyHpMult > 1 ? ' kf-pill-crimson' : ''}">HP ${mod.enemyHpMult}×</span>
        <span class="kf-pill${mod.enemySpeedMult > 1 ? ' kf-pill-gold' : ''}">SPD ${mod.enemySpeedMult}×</span>
        <span class="kf-pill${mod.freezeRateMult > 1 ? ' kf-pill-cyan' : ''}">STORM ${mod.freezeRateMult}×</span>
        <span class="kf-pill kf-pill-emerald">SCORE ${mod.scoreMult}×</span>
      `;

      card.append(topRow, desc, pills);
      grid.appendChild(card);
    }

    body.append(threatBar, grid);
  }

  // ==========================================================================
  // 5. WEAPONDEX (221 WEAPONS WITH PIXEL ART & SPOTLIGHT TELEMETRY)
  // ==========================================================================

  private buildWeapondexBody(body: HTMLElement, save: SaveData): void {
    const discoveredSet = new Set(save.discoveredWeapons);

    // Spotlight Telemetry Inspector
    const spotlightEl = document.createElement('div');
    spotlightEl.style.marginBottom = '12px';

    const renderSpotlight = (w: WeaponDef): void => {
      const seen = discoveredSet.has(w.uniqueId);
      const tierCol = TIER_COLORS[w.weaponTier] ?? '#fff';
      const thumb = getWeaponThumbUrl(w.ammoType, w.class, w.uniqueId, false, 96, 56);
      const rof = (60 / Math.max(1, w.cooldown)).toFixed(2);
      const elems: string[] = [];
      if (w.burnTier > 0) elems.push(`BURN ${w.burnTier}`);
      if (w.freezeTier > 0) elems.push(`CRYO ${w.freezeTier}`);
      if (w.acidTier > 0) elems.push(`ACID ${w.acidTier}`);
      if (w.explosiveTier > 0) elems.push(`BLAST ${w.explosiveTier}`);
      if (w.radioactiveTier > 0) elems.push(`RAD ${w.radioactiveTier}`);

      const isPureMelee = w.ammoType === 0 && w.class === 1;
      spotlightEl.innerHTML = `
        <div class="kf-wb-showcase" style="border-color:${tierCol}66;padding:10px 14px;">
          <div class="kf-wb-weapon-stage" style="width:96px;height:60px;border-color:${tierCol}88;">
            ${thumb ? `<img class="kf-pixel-img" src="${thumb}" width="84" height="50" alt="${w.name}">` : svgIcon('weapondex', 24)}
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-family:var(--kf-font-display);font-size:16px;letter-spacing:0.08em;color:#fff;">${w.name}</strong>
              <span class="kf-pill" style="border-color:${tierCol};color:${tierCol};">TIER ${w.weaponTier}</span>
              <span class="kf-pill kf-pill-cyan">${AMMO_NAMES[w.ammoType]}</span>
              ${isPureMelee ? '' : `<span class="kf-pill">${w.class === 1 ? 'MELEE' : 'RANGED'}</span>`}
              <span class="kf-pill ${seen ? 'kf-pill-emerald' : ''}">${seen ? 'DISCOVERED' : 'UNSEEN'}</span>
              ${elems.map((e) => `<span class="kf-pill kf-pill-gold">${e}</span>`).join('')}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:14px;font-family:var(--kf-font);font-size:11px;color:var(--kf-text-dim);">
              <span>ID <strong style="color:#fff;">#${w.uniqueId}</strong></span>
              <span>DMG <strong style="color:var(--kf-emerald);">${w.baseDamage}</strong></span>
              <span>ROF <strong style="color:var(--kf-cyan);">${rof}/s</strong></span>
              <span>PROJ <strong style="color:#fff;">${w.projectileAmount}</strong></span>
              <span>SPREAD <strong style="color:#fff;">${w.projectileSpread.toFixed(1)}°</strong></span>
              <span>HEAT <strong style="color:var(--kf-amber);">${Math.round(w.overheat * 100)}%</strong></span>
              <span>VALUE <strong style="color:var(--kf-amber);">${w.price}G</strong></span>
            </div>
          </div>
        </div>
      `;
    };

    const initialWep =
      WEAPONS.find((w) => w.uniqueId === this.selectedWeaponId) ?? WEAPONS[0];
    if (initialWep) renderSpotlight(initialWep);

    // Filter Bar
    const filterBar = document.createElement('div');
    filterBar.className = 'kf-filter-bar';

    const countPill = document.createElement('span');
    countPill.className = 'kf-pill kf-pill-cyan';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'kf-input';
    searchInput.placeholder = 'Search 221 weapons by name or ID...';
    searchInput.value = this.weaponSearch;
    searchInput.style.flex = '1';
    searchInput.style.minWidth = '180px';
    searchInput.addEventListener('input', () => {
      this.weaponSearch = searchInput.value;
      this.renderWeapondexList(listContainer, discoveredSet, countPill, renderSpotlight);
    });

    const tierSel = document.createElement('select');
    tierSel.className = 'kf-select';
    tierSel.innerHTML =
      '<option value="all">ALL TIERS</option>' +
      [1, 2, 3, 4, 5, 6].map((t) => `<option value="${t}">TIER ${t}</option>`).join('');
    tierSel.value = this.weaponTierFilter;
    tierSel.addEventListener('change', () => {
      this.weaponTierFilter = tierSel.value;
      this.renderWeapondexList(listContainer, discoveredSet, countPill, renderSpotlight);
    });

    const ammoSel = document.createElement('select');
    ammoSel.className = 'kf-select';
    ammoSel.innerHTML =
      '<option value="all">ALL AMMO</option>' +
      AMMO_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    ammoSel.value = this.weaponAmmoFilter;
    ammoSel.addEventListener('change', () => {
      this.weaponAmmoFilter = ammoSel.value;
      this.renderWeapondexList(listContainer, discoveredSet, countPill, renderSpotlight);
    });

    const discBtn = this.makeBtn(
      this.weaponDiscoveredOnly ? 'DISCOVERED ONLY' : 'ALL 221',
      this.weaponDiscoveredOnly ? 'kf-btn kf-btn-sm kf-btn-emerald' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.weaponDiscoveredOnly = !this.weaponDiscoveredOnly;
        discBtn.textContent = this.weaponDiscoveredOnly ? 'DISCOVERED ONLY' : 'ALL 221';
        discBtn.className = this.weaponDiscoveredOnly
          ? 'kf-btn kf-btn-sm kf-btn-emerald'
          : 'kf-btn kf-btn-sm';
        this.renderWeapondexList(listContainer, discoveredSet, countPill, renderSpotlight);
      },
    );

    filterBar.append(searchInput, tierSel, ammoSel, discBtn, countPill);

    const listContainer = document.createElement('div');
    listContainer.className = 'kf-grid-3';
    this.renderWeapondexList(listContainer, discoveredSet, countPill, renderSpotlight);

    body.append(spotlightEl, filterBar, listContainer);
  }

  private renderWeapondexList(
    container: HTMLElement,
    discoveredSet: Set<number>,
    countPill: HTMLElement,
    onInspect: (w: WeaponDef) => void,
  ): void {
    container.innerHTML = '';
    const q = this.weaponSearch.trim().toLowerCase();
    const filtered = WEAPONS.filter((w) => {
      if (this.weaponDiscoveredOnly && !discoveredSet.has(w.uniqueId)) return false;
      if (this.weaponTierFilter !== 'all' && String(w.weaponTier) !== this.weaponTierFilter) {
        return false;
      }
      if (this.weaponAmmoFilter !== 'all' && String(w.ammoType) !== this.weaponAmmoFilter) {
        return false;
      }
      if (q && !w.name.toLowerCase().includes(q) && !String(w.uniqueId).includes(q)) {
        return false;
      }
      return true;
    });

    countPill.textContent = `${filtered.length} SHOWN`;

    for (const w of filtered) {
      const seen = discoveredSet.has(w.uniqueId);
      const tierCol = TIER_COLORS[w.weaponTier] ?? '#8da4be';
      const thumbUrl = getWeaponThumbUrl(w.ammoType, w.class, w.uniqueId, false, 56, 36);
      const rof = (60 / Math.max(1, w.cooldown)).toFixed(1);
      const elems: string[] = [];
      if (w.burnTier > 0) elems.push('BURN');
      if (w.freezeTier > 0) elems.push('CRYO');
      if (w.acidTier > 0) elems.push('ACID');
      if (w.explosiveTier > 0) elems.push('BLAST');
      if (w.radioactiveTier > 0) elems.push('RAD');

      const card = document.createElement('div');
      card.className = `kf-dex-card clickable${seen ? '' : ' locked'}`;
      card.style.setProperty('--kf-tier-col', tierCol);
      if (this.selectedWeaponId === w.uniqueId) {
        card.style.borderColor = tierCol;
      }
      card.innerHTML = `
        <div class="kf-dex-thumb">
          ${thumbUrl ? `<img class="kf-pixel-img" src="${thumbUrl}" width="50" height="32" alt="">` : svgIcon('weapondex', 18)}
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong style="font-family:var(--kf-font-display);font-size:12px;letter-spacing:0.04em;color:${seen ? '#fff' : 'var(--kf-text-dim)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.name}</strong>
            <span class="kf-pill" style="font-size:9px;padding:1px 5px;border-color:${tierCol};color:${tierCol};">T${w.weaponTier}</span>
          </div>
          <div style="font-family:var(--kf-font);font-size:9.5px;color:var(--kf-text-dim);">
            #${w.uniqueId} · ${AMMO_NAMES[w.ammoType]}${w.ammoType === 0 && w.class === 1 ? '' : ` · ${w.class === 1 ? 'MELEE' : 'RANGED'}`}
          </div>
          <div style="font-family:var(--kf-font);font-size:9.5px;color:var(--kf-text-muted);">
            DMG <strong style="color:#dce8f8;">${w.baseDamage}</strong> · ${rof}/s · ${w.price}G
            ${elems.length > 0 ? ` · <span style="color:var(--kf-amber);">${elems.join('/')}</span>` : ''}
          </div>
        </div>
      `;
      card.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.selectedWeaponId = w.uniqueId;
        onInspect(w);
      });
      container.appendChild(card);
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--kf-text-dim)';
      empty.style.padding = '12px';
      empty.textContent = 'No weapons match your current filter.';
      container.appendChild(empty);
    }
  }

  // ==========================================================================
  // 6. ENEMYDEX (BESTIARY + 6 TWO-PHASE BOSS TROPHY PORTRAITS)
  // ==========================================================================

  private buildEnemydexBody(body: HTMLElement, save: SaveData): void {
    const discoveredSet = new Set(save.discoveredEnemies);
    const defeatedBossSet = new Set(save.defeatedBosses);

    const bossHeader = document.createElement('div');
    bossHeader.style.display = 'flex';
    bossHeader.style.justifyContent = 'space-between';
    bossHeader.style.alignItems = 'center';
    bossHeader.style.marginBottom = '9px';
    bossHeader.innerHTML = `
      <strong style="font-family:var(--kf-font-display);font-size:13.5px;color:var(--kf-crimson);letter-spacing:0.12em;">MAJOR TWO-PHASE BOSSES</strong>
      <span class="kf-pill kf-pill-gold">${svgIcon('trophy', 11)} ${defeatedBossSet.size} / ${BOSSES.length} SLAIN</span>
    `;

    const bossGrid = document.createElement('div');
    bossGrid.className = 'kf-grid-3';
    bossGrid.style.marginBottom = '14px';

    for (const b of BOSSES) {
      const slain = defeatedBossSet.has(b.id);
      const portrait = getBossPortraitUrl(b.spritePhase1Key, 52);
      const card = document.createElement('div');
      card.className = `kf-boss-trophy-card${slain ? ' slain' : ''}`;
      card.innerHTML = `
        <div class="kf-boss-portrait">
          ${portrait ? `<img class="kf-pixel-img" src="${portrait}" width="48" height="48" alt="${b.phase1Name}">` : svgIcon('skull', 24)}
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong style="font-family:var(--kf-font-display);font-size:12px;color:${b.accentColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.phase1Name}</strong>
            <span class="kf-pill ${slain ? 'kf-pill-gold' : 'kf-pill-crimson'}" style="font-size:9px;padding:1px 5px;">${slain ? 'SLAIN' : `ACT ${b.act}`}</span>
          </div>
          <div style="font-size:10.5px;color:${b.phase2Color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">P2 → ${b.phase2Name}</div>
          <div style="font-family:var(--kf-font);font-size:10px;color:var(--kf-text-dim);">HP ${b.phase1Hp} → ${b.phase2Hp}</div>
        </div>
      `;
      bossGrid.appendChild(card);
    }

    const filterBar = document.createElement('div');
    filterBar.className = 'kf-filter-bar';

    const countPill = document.createElement('span');
    countPill.className = 'kf-pill kf-pill-crimson';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'kf-input';
    searchInput.placeholder = `Search ${ENEMIES.length} bestiary entries...`;
    searchInput.value = this.enemySearch;
    searchInput.style.flex = '1';
    searchInput.style.minWidth = '180px';
    searchInput.addEventListener('input', () => {
      this.enemySearch = searchInput.value;
      this.renderEnemydexList(listContainer, discoveredSet, countPill);
    });

    const catSel = document.createElement('select');
    catSel.className = 'kf-select';
    catSel.innerHTML = `
      <option value="all">ALL ENTRIES (${ENEMIES.length})</option>
      <option value="act1">ACT I</option>
      <option value="act2">ACT II</option>
      <option value="act3">ACT III</option>
      <option value="boss">BOSS PHASES (12)</option>
      <option value="discovered">DISCOVERED ONLY</option>
    `;
    catSel.value = this.enemyCategoryFilter;
    catSel.addEventListener('change', () => {
      this.enemyCategoryFilter = catSel.value;
      this.renderEnemydexList(listContainer, discoveredSet, countPill);
    });

    filterBar.append(searchInput, catSel, countPill);

    const listContainer = document.createElement('div');
    listContainer.className = 'kf-grid-3';
    this.renderEnemydexList(listContainer, discoveredSet, countPill);

    body.append(bossHeader, bossGrid, filterBar, listContainer);
  }

  private renderEnemydexList(
    container: HTMLElement,
    discoveredSet: Set<string>,
    countPill: HTMLElement,
  ): void {
    container.innerHTML = '';
    const q = this.enemySearch.trim().toLowerCase();
    const filtered = ENEMIES.filter((e) => {
      if (this.enemyCategoryFilter === 'boss' && !e.isBoss) return false;
      if (this.enemyCategoryFilter === 'act1' && !(e.actMin <= 1 && e.actMax >= 1)) return false;
      if (this.enemyCategoryFilter === 'act2' && !(e.actMin <= 2 && e.actMax >= 2)) return false;
      if (this.enemyCategoryFilter === 'act3' && !(e.actMin <= 3 && e.actMax >= 3)) return false;
      if (this.enemyCategoryFilter === 'discovered' && !discoveredSet.has(e.id)) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.archetype.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    countPill.textContent = `${filtered.length} SHOWN`;

    for (const e of filtered) {
      const seen = discoveredSet.has(e.id);
      const portrait = getEnemyPortraitUrl(e.spriteKey, e.tintColor, 42);
      const card = document.createElement('div');
      card.className = `kf-dex-card${seen ? '' : ' locked'}`;
      card.style.setProperty('--kf-tier-col', e.isBoss ? '#ff3d5e' : e.tintColor);
      card.innerHTML = `
        <div class="kf-dex-thumb kf-dex-thumb-sq">
          ${portrait ? `<img class="kf-pixel-img" src="${portrait}" width="40" height="40" alt="">` : svgIcon('enemydex', 18)}
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong style="font-family:var(--kf-font-display);font-size:12px;color:${e.tintColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.name}</strong>
            <span class="kf-pill ${e.isBoss ? 'kf-pill-crimson' : ''}" style="font-size:8.5px;padding:1px 5px;">${e.archetype.toUpperCase()}</span>
          </div>
          <div style="font-family:var(--kf-font);font-size:9.5px;color:var(--kf-text-dim);">
            HP ${e.maxHp} · DMG ${Math.max(e.contactDamage, e.projectileDamage)} · ACT ${e.actMin}${e.actMax > e.actMin ? `-${e.actMax}` : ''}
          </div>
          <div style="font-family:var(--kf-font);font-size:9.5px;color:var(--kf-text-muted);">
            XP ${e.xpValue} · ${e.goldValue}G${e.elementResist ? ` · RES ${e.elementResist.toUpperCase()}` : ''}
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  }

  // ==========================================================================
  // 7. CHALLENGES BOARD (18 TRIALS WITH PROGRESS BARS)
  // ==========================================================================

  private buildChallengesBody(body: HTMLElement, state: SimState, save: SaveData): void {
    const doneCount = save.completedChallenges.length;
    const totalCount = CHALLENGES.length;
    const overallPct = Math.round((doneCount / Math.max(1, totalCount)) * 100);

    const summaryCard = document.createElement('div');
    summaryCard.className = 'kf-card';
    summaryCard.style.marginBottom = '12px';
    summaryCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <strong style="font-family:var(--kf-font-display);font-size:13px;letter-spacing:0.1em;color:var(--kf-amber);">
          ${svgIcon('trophy', 14)} OVERALL CAMPAIGN TRIALS
        </strong>
        <span style="font-family:var(--kf-font);font-size:12px;font-weight:800;color:#fff;">${doneCount} / ${totalCount} (${overallPct}%)</span>
      </div>
      <div class="kf-progress-track" style="height:8px;">
        <div class="kf-progress-fill gold" style="width:${overallPct}%;"></div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    const iconForType: Record<string, IconName> = {
      kills: 'skull',
      mod: 'workbench',
      node: 'compass',
      boss: 'trophy',
      loop: 'loop',
    };

    for (const chal of CHALLENGES) {
      const done = save.completedChallenges.includes(chal.id);
      let progressText = done ? 'COMPLETED' : 'ACTIVE';
      let pct = done ? 100 : 0;

      if (!done && chal.targetType === 'kills' && typeof chal.targetValue === 'number') {
        progressText = `${save.totalKills} / ${chal.targetValue}`;
        pct = Math.min(100, Math.round((save.totalKills / Math.max(1, chal.targetValue)) * 100));
      } else if (!done && chal.targetType === 'mod' && typeof chal.targetValue === 'number') {
        progressText = `${state.runStats.modsAttached} / ${chal.targetValue}`;
        pct = Math.min(100, Math.round((state.runStats.modsAttached / Math.max(1, chal.targetValue)) * 100));
      } else if (!done && chal.targetType === 'loop' && typeof chal.targetValue === 'number') {
        const curLoop = Math.max(save.bestLoop, state.loopCount);
        progressText = `LOOP ${curLoop} / ${chal.targetValue}`;
        pct = Math.min(100, Math.round((curLoop / Math.max(1, chal.targetValue)) * 100));
      }

      const ico = iconForType[chal.targetType] ?? 'star';
      const card = document.createElement('div');
      card.className = `kf-card${done ? ' done' : ''}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="color:${done ? 'var(--kf-emerald)' : 'var(--kf-cyan)'};">${svgIcon(done ? 'check' : ico, 15)}</span>
            <strong style="font-family:var(--kf-font-display);font-size:12.5px;letter-spacing:0.04em;color:${done ? 'var(--kf-emerald)' : '#fff'};">${chal.description}</strong>
          </div>
          <span class="kf-pill ${done ? 'kf-pill-emerald' : 'kf-pill-cyan'}">${progressText}</span>
        </div>
        <div class="kf-progress-track">
          <div class="kf-progress-fill${done ? ' gold' : ''}" style="width:${pct}%;"></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-family:var(--kf-font);font-size:10.5px;color:var(--kf-amber);">
          <span>${svgIcon('gold', 11)} +${chal.rewardGold}G</span>
          <span>${svgIcon('tree', 11)} +${chal.rewardSkillPoints} SP</span>
        </div>
      `;
      grid.appendChild(card);
    }

    body.append(summaryCard, grid);
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
    this.root.remove();
  }
}
