// ============================================================================
// KRUNKEDFALL — Outpost Hub HUD, Quick-Access Dock & Interactive Station Modals
// ============================================================================
// Covers every Hub station via walk-up [E] OR 1-click Dock:
//   - Loki's Head (dialogue topics + Intro Lore chronicle)
//   - Jotunn-Matic 3000 (8 Outcasts + 10 Skins incl. KRUNKEDSLAYER live update)
//   - Yggdrasil Skill Tree (interactive SVG+DOM glowing node graph)
//   - Bifrost Launch -> Overworld Map
//   - Run Modifiers (10 toggleable modifiers + combined multipliers)
//   - Weapondex (221 weapons searchable/filterable)
//   - Enemydex (120 enemy entries + 6 two-phase Major Bosses)
//   - Challenges (18 progression challenges)

import {
  AMMO_NAMES,
  type HubPanel,
  type OutcastId,
  type SaveData,
  type SimState,
  type SkinId,
} from '../contracts/index.js';
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

  // Local modal UI states (preserved across re-renders)
  private selectedLokiTopic = HUB_LOKI_DIALOGUES[0]?.id ?? 'who_am_i';
  private selectedSkillNodeId = 'skill_fortitude';
  private weaponSearch = '';
  private weaponTierFilter = 'all';
  private weaponAmmoFilter = 'all';
  private weaponDiscoveredOnly = false;
  private enemySearch = '';
  private enemyCategoryFilter = 'all';

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

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) {
      this.lastHudSig = '';
      this.lastModalSig = '';
    }
  }

  public render(state: SimState, save: SaveData): void {
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
      save.completedChallenges.length,
    ].join('|');

    if (hudSig !== this.lastHudSig) {
      this.lastHudSig = hudSig;
      this.renderHubChrome(state, save, nearestStation);
    }

    // 2. Render active Hub Modal Panel (if any)
    if (state.hubPanel === 'none') {
      if (this.modalBackdrop.style.display !== 'none') {
        this.modalBackdrop.style.display = 'none';
        this.modalBackdrop.innerHTML = '';
        this.lastModalSig = '';
      }
      return;
    }

    this.modalBackdrop.style.display = 'flex';
    const modalSig = this.computeModalSignature(state, save);
    if (modalSig !== this.lastModalSig) {
      this.lastModalSig = modalSig;
      this.renderModal(state, save);
    }
  }

  private renderHubChrome(
    state: SimState,
    save: SaveData,
    nearestStation: SimState['hubInteractables'][number] | null,
  ): void {
    const p = state.player;
    const outcast = getOutcastDef(p.outcastId);
    const skin = getSkinDef(p.skinId);

    // Top bar
    this.topEl.innerHTML = '';
    const leftBadge = document.createElement('div');
    leftBadge.className = 'kf-panel kf-hub-badge kf-interactive';
    leftBadge.dataset.uiInteractive = 'true';
    leftBadge.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:10px;height:10px;background:${outcast.accentColor};border:1px solid #fff;"></span>
        <strong style="letter-spacing:0.1em;color:#fff;">THREE-ROCK OUTPOST HUB</strong>
        <span class="kf-pill kf-pill-cyan">${outcast.name} · ${skin.name}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--kf-text-dim);">
        <span>LVL <strong style="color:#fff;">${p.level}</strong></span>
        <span>GOLD <strong style="color:var(--kf-amber);">${p.gold}</strong></span>
        <span>SKILL PTS <strong style="color:var(--kf-emerald);">${p.skillPoints}</strong></span>
        <span>MODIFIERS <strong style="color:var(--kf-gold);">${state.activeModifiers.length}</strong></span>
        <span>LOOP <strong style="color:var(--kf-rune);">${state.loopCount}</strong></span>
      </div>
    `;

    const rightControls = document.createElement('div');
    rightControls.style.display = 'flex';
    rightControls.style.gap = '6px';
    rightControls.className = 'kf-interactive';
    rightControls.dataset.uiInteractive = 'true';

    const deployBtn = this.makeBtn('BIFROST OVERWORLD ▶', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.onLaunchOverworld();
    });
    deployBtn.dataset.testid = 'hub-overworld-top-btn';

    const pauseBtn = this.makeBtn('[ESC] MENU', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenPause();
    });

    rightControls.append(deployBtn, pauseBtn);
    this.topEl.append(leftBadge, rightControls);

    // Walk-up Station Prompt
    if (nearestStation && state.hubPanel === 'none') {
      this.promptEl.style.display = 'flex';
      this.promptEl.innerHTML = '';
      const txt = document.createElement('span');
      txt.innerHTML = `<span class="kf-pill kf-pill-gold">[E]</span> ${nearestStation.label}`;
      const openBtn = this.makeBtn('OPEN', 'kf-btn kf-btn-sm kf-btn-gold', () => {
        this.cb.onPlayUiClick();
        if (nearestStation.id === 'bifrost') {
          this.cb.onLaunchOverworld();
        } else if (nearestStation.id !== 'training_dummy') {
          this.cb.onOpenPanel(nearestStation.id as HubPanel);
        }
      });
      this.promptEl.append(txt);
      if (nearestStation.id !== 'training_dummy') {
        this.promptEl.append(openBtn);
      }
    } else {
      this.promptEl.style.display = 'none';
    }

    // Bottom Quick-Access Hub Dock
    this.dockEl.innerHTML = '';
    const dockItems: Array<{
      label: string;
      cls: string;
      testId: string;
      action: () => void;
    }> = [
      {
        label: 'BIFROST LAUNCH',
        cls: 'kf-btn kf-btn-sm kf-btn-primary',
        testId: 'hub-dock-bifrost',
        action: () => this.cb.onLaunchOverworld(),
      },
      {
        label: "LOKI'S HEAD",
        cls:
          state.hubPanel === 'loki'
            ? 'kf-btn kf-btn-sm kf-btn-emerald'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-loki',
        action: () => this.cb.onOpenPanel('loki'),
      },
      {
        label: 'JOTUNN-MATIC 3000',
        cls:
          state.hubPanel === 'jotunn_matic'
            ? 'kf-btn kf-btn-sm kf-btn-gold'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-jotunn',
        action: () => this.cb.onOpenPanel('jotunn_matic'),
      },
      {
        label: `YGGDRASIL (${p.skillPoints} SP)`,
        cls:
          state.hubPanel === 'skill_tree'
            ? 'kf-btn kf-btn-sm kf-btn-emerald'
            : p.skillPoints > 0
              ? 'kf-btn kf-btn-sm kf-btn-emerald'
              : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-skills',
        action: () => this.cb.onOpenPanel('skill_tree'),
      },
      {
        label: `MODIFIERS (${state.activeModifiers.length})`,
        cls:
          state.hubPanel === 'modifiers'
            ? 'kf-btn kf-btn-sm kf-btn-gold'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-modifiers',
        action: () => this.cb.onOpenPanel('modifiers'),
      },
      {
        label: `WEAPONDEX (${save.discoveredWeapons.length}/${WEAPONS.length})`,
        cls:
          state.hubPanel === 'weapondex'
            ? 'kf-btn kf-btn-sm kf-btn-primary'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-weapondex',
        action: () => this.cb.onOpenPanel('weapondex'),
      },
      {
        label: `ENEMYDEX (${save.discoveredEnemies.length}/${ENEMIES.length})`,
        cls:
          state.hubPanel === 'enemydex'
            ? 'kf-btn kf-btn-sm kf-btn-primary'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-enemydex',
        action: () => this.cb.onOpenPanel('enemydex'),
      },
      {
        label: `CHALLENGES (${save.completedChallenges.length}/${CHALLENGES.length})`,
        cls:
          state.hubPanel === 'challenges'
            ? 'kf-btn kf-btn-sm kf-btn-gold'
            : 'kf-btn kf-btn-sm',
        testId: 'hub-dock-challenges',
        action: () => this.cb.onOpenPanel('challenges'),
      },
      {
        label: '[TAB] WORKBENCH',
        cls: 'kf-btn kf-btn-sm',
        testId: 'hub-dock-workbench',
        action: () => this.cb.onOpenWorkbench(),
      },
    ];

    for (const item of dockItems) {
      const btn = this.makeBtn(item.label, item.cls, () => {
        this.cb.onPlayUiClick();
        item.action();
      });
      btn.dataset.testid = item.testId;
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

  private renderModal(state: SimState, save: SaveData): void {
    this.modalBackdrop.innerHTML = '';

    const modal = document.createElement('div');
    modal.className = 'kf-panel kf-panel-cyan kf-modal';

    const titleMap: Record<Exclude<HubPanel, 'none'>, { title: string; sub: string }> = {
      loki: { title: "LOKI'S HEAD", sub: 'DECAPITATED MASTERMIND · THREE-ROCK LAB' },
      jotunn_matic: { title: UI_LABELS.jotunnMaticTitle, sub: '8 OUTCAST CLONES · 10 ARMOR SKINS' },
      skill_tree: {
        title: UI_LABELS.skillTreeTitle,
        sub: `UNSPENT SKILL POINTS: ${state.player.skillPoints}`,
      },
      modifiers: {
        title: UI_LABELS.modifiersTitle,
        sub: `${state.activeModifiers.length} ACTIVE MODIFIER(S)`,
      },
      weapondex: {
        title: UI_LABELS.weapondexTitle,
        sub: `${save.discoveredWeapons.length} / ${WEAPONS.length} WEAPONS CATALOGUED`,
      },
      enemydex: {
        title: UI_LABELS.enemydexTitle,
        sub: `${save.discoveredEnemies.length} / ${ENEMIES.length} ENTRIES · ${save.defeatedBosses.length}/6 BOSSES SLAIN`,
      },
      challenges: {
        title: UI_LABELS.challengesTitle,
        sub: `${save.completedChallenges.length} / ${CHALLENGES.length} COMPLETED`,
      },
    };

    const panelKey = state.hubPanel;
    if (panelKey === 'none') return;
    const meta = titleMap[panelKey];

    const header = document.createElement('div');
    header.className = 'kf-modal-header';
    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `<span class="kf-modal-title">${meta.title}</span><span class="kf-modal-subtitle">${meta.sub}</span>`;
    const closeBtn = this.makeBtn('CLOSE [ESC]', 'kf-btn kf-btn-sm kf-btn-danger', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenPanel('none');
    });
    closeBtn.dataset.testid = 'hub-modal-close';
    header.append(titleWrap, closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-modal-body kf-scroll';

    switch (panelKey) {
      case 'loki':
        this.buildLokiBody(body);
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

  private buildLokiBody(body: HTMLElement): void {
    const layout = document.createElement('div');
    layout.className = 'kf-loki-layout';

    const topicsCol = document.createElement('div');
    topicsCol.className = 'kf-loki-topics';

    const allTopics: Array<{ id: string; prompt: string; lines: readonly string[] }> = [
      ...HUB_LOKI_DIALOGUES,
      {
        id: 'intro_lore',
        prompt: 'CHRONICLE: HOW RAGNAROK BEGAN',
        lines: INTRO_LORE_LINES,
      },
    ];

    for (const topic of allTopics) {
      const btn = this.makeBtn(
        topic.prompt,
        `kf-btn kf-loki-topic-btn${this.selectedLokiTopic === topic.id ? ' active' : ''}`,
        () => {
          this.cb.onPlayUiClick();
          this.selectedLokiTopic = topic.id;
          this.lastModalSig = '';
        },
      );
      topicsCol.appendChild(btn);
    }

    const activeTopic =
      allTopics.find((t) => t.id === this.selectedLokiTopic) ?? allTopics[0];

    const speechCol = document.createElement('div');
    speechCol.className = 'kf-loki-speech';
    speechCol.innerHTML = `
      <div class="kf-loki-portrait-row">
        <div class="kf-loki-avatar">L</div>
        <div>
          <div style="font-weight:800;color:var(--kf-emerald);letter-spacing:0.1em;">LOKI — SEVERED GOD OF MISCHIEF</div>
          <div style="font-size:11px;color:var(--kf-text-dim);">${activeTopic.prompt}</div>
        </div>
      </div>
    `;

    for (const line of activeTopic.lines) {
      const p = document.createElement('div');
      p.className = 'kf-loki-line';
      p.textContent = `"${line}"`;
      speechCol.appendChild(p);
    }

    layout.append(topicsCol, speechCol);
    body.appendChild(layout);
  }

  // ==========================================================================
  // 2. JOTUNN-MATIC 3000 (8 OUTCASTS + 10 SKINS)
  // ==========================================================================

  private buildJotunnMaticBody(body: HTMLElement, state: SimState, save: SaveData): void {
    const selected = getOutcastDef(state.player.outcastId);
    const primaryWep = getWeaponDef(selected.startingWeaponUniqueId);
    const secondaryWep =
      selected.secondaryWeaponUniqueId !== undefined
        ? getWeaponDef(selected.secondaryWeaponUniqueId)
        : null;

    const outcastGrid = document.createElement('div');
    outcastGrid.className = 'kf-outcast-grid';

    for (const oc of OUTCASTS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `kf-outcast-card${oc.id === selected.id ? ' selected' : ''}`;
      card.dataset.testid = `outcast-card-${oc.id}`;
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <strong style="color:${oc.accentColor};letter-spacing:0.08em;">${oc.name}</strong>
          <span class="kf-pill" style="font-size:9px;padding:1px 5px;">${oc.maxHp} HP</span>
        </div>
        <div style="font-size:10px;color:var(--kf-text-dim);">${oc.title}</div>
        <div style="font-size:10px;color:var(--kf-cyan);margin-top:2px;">${oc.abilityName}</div>
      `;
      card.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.cb.onSelectOutcast(oc.id);
      });
      outcastGrid.appendChild(card);
    }

    const detail = document.createElement('div');
    detail.className = 'kf-outcast-detail';
    detail.innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="display:inline-block;width:12px;height:12px;background:${selected.accentColor};border:1px solid #fff;"></span>
          <strong style="font-size:15px;letter-spacing:0.1em;color:#fff;">${selected.name} — ${selected.title}</strong>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;margin-bottom:8px;color:var(--kf-text-dim);">
          <span>HP <strong style="color:var(--kf-emerald);">${selected.maxHp}</strong></span>
          <span>SPEED <strong style="color:var(--kf-cyan);">${selected.moveSpeed.toFixed(2)}</strong></span>
          <span>CHARGES <strong style="color:var(--kf-amber);">${selected.abilityMaxCharges}</strong></span>
        </div>
        <div style="font-size:11px;color:var(--kf-text-dim);">
          LOADOUT: <strong style="color:#fff;">${primaryWep.name}</strong>${secondaryWep ? ` + <strong style="color:#fff;">${secondaryWep.name}</strong>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="padding:6px 8px;background:var(--kf-bg-2);border-left:3px solid var(--kf-cyan);">
          <div style="font-size:10px;color:var(--kf-cyan);font-weight:800;">ABILITY: ${selected.abilityName}</div>
          <div style="font-size:11px;color:var(--kf-text-dim);">${selected.abilityDesc}</div>
        </div>
        <div style="padding:6px 8px;background:var(--kf-bg-2);border-left:3px solid var(--kf-gold);">
          <div style="font-size:10px;color:var(--kf-amber);font-weight:800;">POWER: ${selected.powerName}</div>
          <div style="font-size:11px;color:var(--kf-text-dim);">${selected.powerDesc}</div>
        </div>
      </div>
    `;

    const skinHeader = document.createElement('div');
    skinHeader.style.display = 'flex';
    skinHeader.style.justifyContent = 'space-between';
    skinHeader.style.alignItems = 'center';
    skinHeader.style.marginBottom = '8px';
    skinHeader.innerHTML = `
      <strong style="color:var(--kf-amber);letter-spacing:0.1em;">OUTCAST SKINS (${SKINS.length} TOTAL · LIVE PREVIEW)</strong>
      <span style="font-size:11px;color:var(--kf-text-dim);">EARNED: ${save.unlockedSkins.length}/${SKINS.length}</span>
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
        <div style="font-size:10px;font-weight:800;color:${sk.id === 'krunkedslayer' ? '#ff2a85' : '#fff'};">${sk.name}</div>
        <div style="font-size:9px;color:${earned ? 'var(--kf-emerald)' : 'var(--kf-text-muted)'};">${isSelected ? 'EQUIPPED' : earned ? 'UNLOCKED' : 'PREVIEW'}</div>
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
  // 3. YGGDRASIL SKILL TREE (INTERACTIVE SVG + DOM NODE GRAPH)
  // ==========================================================================

  private buildSkillTreeBody(body: HTMLElement, state: SimState): void {
    const nodes = getSkillNodesForOutcast(state.player.outcastId);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    if (!nodeById.has(this.selectedSkillNodeId) && nodes.length > 0) {
      this.selectedSkillNodeId = nodes[0].id;
    }

    const layout = document.createElement('div');
    layout.className = 'kf-skill-layout';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'kf-skill-canvas-wrap';

    // SVG Branch Lines
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
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(parentNode.x * 100));
        line.setAttribute('y1', String(parentNode.y * 100));
        line.setAttribute('x2', String(node.x * 100));
        line.setAttribute('y2', String(node.y * 100));
        line.setAttribute(
          'stroke',
          nodeRank > 0
            ? '#58f59a'
            : parentRank > 0
              ? '#39d6ff'
              : '#2a3950',
        );
        line.setAttribute('stroke-width', nodeRank > 0 ? '0.65' : '0.45');
        svg.appendChild(line);
      }
    }
    canvasWrap.appendChild(svg);

    // Clickable Node Buttons
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
      btn.className = `kf-skill-node ${stateClass}${this.selectedSkillNodeId === node.id ? ' selected' : ''}`;
      btn.style.left = `${node.x * 100}%`;
      btn.style.top = `${node.y * 100}%`;
      btn.dataset.testid = `skill-node-${node.id}`;
      btn.innerHTML = `
        <span style="font-weight:800;line-height:1.15;">${node.name}</span>
        <span>${rank}/${node.maxRank}${node.outcastId !== 'shared' ? ' ★' : ''}</span>
      `;
      btn.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        if (this.selectedSkillNodeId === node.id && canBuy) {
          this.cb.onAllocateSkill(node.id);
        } else {
          this.selectedSkillNodeId = node.id;
          this.lastModalSig = '';
        }
      });
      canvasWrap.appendChild(btn);
    }

    // Right Inspector
    const sel = nodeById.get(this.selectedSkillNodeId) ?? nodes[0];
    const selRank = state.skillRanks[sel.id] ?? 0;
    const reqsMet = sel.requires.every((r) => (state.skillRanks[r] ?? 0) > 0);
    const canAllocate =
      reqsMet && selRank < sel.maxRank && state.player.skillPoints >= sel.costPerRank;

    const inspector = document.createElement('div');
    inspector.className = 'kf-skill-inspector';
    inspector.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="kf-pill kf-pill-emerald">SP: ${state.player.skillPoints}</span>
        <span class="kf-pill ${sel.outcastId === 'shared' ? 'kf-pill-cyan' : 'kf-pill-gold'}">
          ${sel.outcastId === 'shared' ? 'SHARED BRANCH' : `${sel.outcastId.toUpperCase()} EXCLUSIVE`}
        </span>
      </div>
      <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:0.08em;">${sel.name}</div>
      <div style="font-size:12px;color:var(--kf-text-dim);line-height:1.45;">${sel.description}</div>
      <div style="font-size:11px;color:var(--kf-cyan);">
        RANK: <strong>${selRank} / ${sel.maxRank}</strong> · COST: <strong>${sel.costPerRank} SP</strong>
      </div>
      <div style="font-size:11px;color:var(--kf-text-dim);">
        PREREQUISITES: ${
          sel.requires.length === 0
            ? '<span style="color:var(--kf-emerald);">NONE (ROOT)</span>'
            : sel.requires
                .map((r) => {
                  const rn = nodeById.get(r);
                  const met = (state.skillRanks[r] ?? 0) > 0;
                  return `<span style="color:${met ? 'var(--kf-emerald)' : 'var(--kf-crimson)'};">${rn?.name ?? r}</span>`;
                })
                .join(', ')
        }
      </div>
    `;

    const allocBtn = this.makeBtn(
      selRank >= sel.maxRank
        ? 'MAX RANK REACHED'
        : !reqsMet
          ? 'PREREQUISITE LOCKED'
          : state.player.skillPoints < sel.costPerRank
            ? `NEED ${sel.costPerRank} SKILL PT(S)`
            : `ALLOCATE RANK (${sel.costPerRank} SP)`,
      canAllocate ? 'kf-btn kf-btn-emerald' : 'kf-btn',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onAllocateSkill(sel.id);
      },
    );
    allocBtn.disabled = !canAllocate;
    allocBtn.dataset.testid = 'skill-allocate-btn';
    inspector.appendChild(allocBtn);

    const tip = document.createElement('div');
    tip.style.fontSize = '10px';
    tip.style.color = 'var(--kf-text-muted)';
    tip.textContent = 'TIP: Click a node to inspect, click again or press ALLOCATE RANK to upgrade.';
    inspector.appendChild(tip);

    layout.append(canvasWrap, inspector);
    body.appendChild(layout);
  }

  // ==========================================================================
  // 4. RUN MODIFIER STONE
  // ==========================================================================

  private buildModifiersBody(body: HTMLElement, state: SimState): void {
    const summary = computeRunModifiers(state.activeModifiers);
    const bar = document.createElement('div');
    bar.className = 'kf-card';
    bar.style.marginBottom = '12px';
    bar.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:11px;justify-content:space-between;">
        <span>ENEMY HP <strong style="color:var(--kf-crimson);">${summary.enemyHpMult.toFixed(2)}x</strong></span>
        <span>ENEMY SPEED <strong style="color:var(--kf-gold);">${summary.enemySpeedMult.toFixed(2)}x</strong></span>
        <span>FREEZE RATE <strong style="color:var(--kf-cyan);">${summary.freezeRateMult.toFixed(2)}x</strong></span>
        <span>LOOT QUALITY <strong style="color:var(--kf-emerald);">+${Math.round(summary.dropQualityBonus * 100)}%</strong></span>
        <span>SCORE MULT <strong style="color:var(--kf-amber);">${summary.scoreMult.toFixed(2)}x</strong></span>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    for (const mod of RUN_MODIFIERS) {
      const active = state.activeModifiers.includes(mod.id);
      const card = document.createElement('div');
      card.className = `kf-card${active ? ' active' : ''}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="color:${active ? 'var(--kf-amber)' : '#fff'};">${mod.name}</strong>
          <span class="kf-pill ${active ? 'kf-pill-gold' : ''}">${active ? 'ACTIVE' : 'OFF'}</span>
        </div>
        <div style="font-size:11px;color:var(--kf-text-dim);">${mod.description}</div>
        <div style="display:flex;gap:8px;font-size:10px;color:var(--kf-text-muted);">
          <span>HP ${mod.enemyHpMult}x</span>
          <span>SPD ${mod.enemySpeedMult}x</span>
          <span>STORM ${mod.freezeRateMult}x</span>
          <span>SCORE ${mod.scoreMult}x</span>
        </div>
      `;
      const btn = this.makeBtn(
        active ? 'DISABLE MODIFIER' : 'ACTIVATE MODIFIER',
        active ? 'kf-btn kf-btn-sm kf-btn-danger' : 'kf-btn kf-btn-sm kf-btn-gold',
        () => {
          this.cb.onPlayUiClick();
          this.cb.onToggleModifier(mod.id);
        },
      );
      btn.dataset.testid = `modifier-toggle-${mod.id}`;
      card.appendChild(btn);
      grid.appendChild(card);
    }

    body.append(bar, grid);
  }

  // ==========================================================================
  // 5. WEAPONDEX (221 WEAPONS)
  // ==========================================================================

  private buildWeapondexBody(body: HTMLElement, save: SaveData): void {
    const discoveredSet = new Set(save.discoveredWeapons);

    const filterBar = document.createElement('div');
    filterBar.className = 'kf-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'kf-input';
    searchInput.placeholder = 'Search 221 weapons by name or ID...';
    searchInput.value = this.weaponSearch;
    searchInput.style.flex = '1';
    searchInput.addEventListener('input', () => {
      this.weaponSearch = searchInput.value;
      this.renderWeapondexList(listContainer, discoveredSet);
    });

    const tierSel = document.createElement('select');
    tierSel.className = 'kf-select';
    tierSel.innerHTML =
      '<option value="all">ALL TIERS</option>' +
      [1, 2, 3, 4, 5, 6].map((t) => `<option value="${t}">TIER ${t}</option>`).join('');
    tierSel.value = this.weaponTierFilter;
    tierSel.addEventListener('change', () => {
      this.weaponTierFilter = tierSel.value;
      this.renderWeapondexList(listContainer, discoveredSet);
    });

    const ammoSel = document.createElement('select');
    ammoSel.className = 'kf-select';
    ammoSel.innerHTML =
      '<option value="all">ALL AMMO</option>' +
      AMMO_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    ammoSel.value = this.weaponAmmoFilter;
    ammoSel.addEventListener('change', () => {
      this.weaponAmmoFilter = ammoSel.value;
      this.renderWeapondexList(listContainer, discoveredSet);
    });

    const discBtn = this.makeBtn(
      this.weaponDiscoveredOnly ? 'SHOWING: DISCOVERED' : 'SHOWING: ALL 221',
      this.weaponDiscoveredOnly ? 'kf-btn kf-btn-sm kf-btn-emerald' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        this.weaponDiscoveredOnly = !this.weaponDiscoveredOnly;
        discBtn.textContent = this.weaponDiscoveredOnly
          ? 'SHOWING: DISCOVERED'
          : 'SHOWING: ALL 221';
        discBtn.className = this.weaponDiscoveredOnly
          ? 'kf-btn kf-btn-sm kf-btn-emerald'
          : 'kf-btn kf-btn-sm';
        this.renderWeapondexList(listContainer, discoveredSet);
      },
    );

    filterBar.append(searchInput, tierSel, ammoSel, discBtn);

    const listContainer = document.createElement('div');
    listContainer.className = 'kf-grid-3';
    this.renderWeapondexList(listContainer, discoveredSet);

    body.append(filterBar, listContainer);
  }

  private renderWeapondexList(container: HTMLElement, discoveredSet: Set<number>): void {
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

    for (const w of filtered) {
      const seen = discoveredSet.has(w.uniqueId);
      const card = document.createElement('div');
      card.className = `kf-card${seen ? '' : ' locked'}`;
      const rof = (60 / Math.max(1, w.cooldown)).toFixed(1);
      const elems: string[] = [];
      if (w.burnTier > 0) elems.push('BURN');
      if (w.freezeTier > 0) elems.push('CRYO');
      if (w.acidTier > 0) elems.push('ACID');
      if (w.explosiveTier > 0) elems.push('BLAST');
      if (w.radioactiveTier > 0) elems.push('RAD');
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
          <strong style="font-size:11px;color:${seen ? '#fff' : 'var(--kf-text-dim)'};">${w.name}</strong>
          <span class="kf-pill ${seen ? 'kf-pill-cyan' : ''}">T${w.weaponTier}</span>
        </div>
        <div style="font-size:10px;color:var(--kf-text-dim);">
          #${w.uniqueId} · ${AMMO_NAMES[w.ammoType]} · ${w.class === 1 ? 'MELEE' : 'RANGED'}
        </div>
        <div style="font-size:10px;color:var(--kf-text-muted);">
          DMG ${w.baseDamage} · ${rof}/s · PROJ ${w.projectileAmount} · ${w.price}G
        </div>
        ${elems.length > 0 ? `<div style="font-size:9px;color:var(--kf-amber);">${elems.join(' · ')}</div>` : ''}
      `;
      container.appendChild(card);
    }

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--kf-text-dim)';
      empty.textContent = 'No weapons match your filter.';
      container.appendChild(empty);
    }
  }

  // ==========================================================================
  // 6. ENEMYDEX (BESTIARY + ALL 6 TWO-PHASE BOSSES)
  // ==========================================================================

  private buildEnemydexBody(body: HTMLElement, save: SaveData): void {
    const discoveredSet = new Set(save.discoveredEnemies);
    const defeatedBossSet = new Set(save.defeatedBosses);

    // Boss Trophy Showcase
    const bossHeader = document.createElement('div');
    bossHeader.style.marginBottom = '8px';
    bossHeader.innerHTML = `<strong style="color:var(--kf-crimson);letter-spacing:0.1em;">MAJOR TWO-PHASE BOSSES (${defeatedBossSet.size}/${BOSSES.length} SLAIN)</strong>`;

    const bossGrid = document.createElement('div');
    bossGrid.className = 'kf-grid-3';
    bossGrid.style.marginBottom = '14px';

    for (const b of BOSSES) {
      const slain = defeatedBossSet.has(b.id);
      const card = document.createElement('div');
      card.className = `kf-card${slain ? ' active' : ''}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:${b.accentColor};font-size:11px;">${b.phase1Name}</strong>
          <span class="kf-pill ${slain ? 'kf-pill-emerald' : 'kf-pill-crimson'}">${slain ? 'SLAIN' : `ACT ${b.act}`}</span>
        </div>
        <div style="font-size:10px;color:${b.phase2Color};">PHASE 2: ${b.phase2Name}</div>
        <div style="font-size:10px;color:var(--kf-text-muted);">HP: ${b.phase1Hp} → ${b.phase2Hp}</div>
      `;
      bossGrid.appendChild(card);
    }

    // Filter bar for full bestiary
    const filterBar = document.createElement('div');
    filterBar.className = 'kf-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'kf-input';
    searchInput.placeholder = `Search ${ENEMIES.length} bestiary entries...`;
    searchInput.value = this.enemySearch;
    searchInput.style.flex = '1';
    searchInput.addEventListener('input', () => {
      this.enemySearch = searchInput.value;
      this.renderEnemydexList(listContainer, discoveredSet);
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
      this.renderEnemydexList(listContainer, discoveredSet);
    });

    filterBar.append(searchInput, catSel);

    const listContainer = document.createElement('div');
    listContainer.className = 'kf-grid-3';
    this.renderEnemydexList(listContainer, discoveredSet);

    body.append(bossHeader, bossGrid, filterBar, listContainer);
  }

  private renderEnemydexList(container: HTMLElement, discoveredSet: Set<string>): void {
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

    for (const e of filtered) {
      const seen = discoveredSet.has(e.id);
      const card = document.createElement('div');
      card.className = `kf-card${seen ? '' : ' locked'}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
          <strong style="font-size:11px;color:${e.tintColor};">${e.name}</strong>
          <span class="kf-pill ${e.isBoss ? 'kf-pill-crimson' : ''}">${e.archetype.toUpperCase()}</span>
        </div>
        <div style="font-size:10px;color:var(--kf-text-dim);">
          HP ${e.maxHp} · DMG ${Math.max(e.contactDamage, e.projectileDamage)} · ACT ${e.actMin}${e.actMax > e.actMin ? `-${e.actMax}` : ''}
        </div>
        <div style="font-size:10px;color:var(--kf-text-muted);">
          XP ${e.xpValue} · GOLD ${e.goldValue}${e.elementResist ? ` · RES ${e.elementResist.toUpperCase()}` : ''}
        </div>
      `;
      container.appendChild(card);
    }
  }

  // ==========================================================================
  // 7. CHALLENGES BOARD
  // ==========================================================================

  private buildChallengesBody(body: HTMLElement, state: SimState, save: SaveData): void {
    const grid = document.createElement('div');
    grid.className = 'kf-grid-2';

    for (const chal of CHALLENGES) {
      const done = save.completedChallenges.includes(chal.id);
      let progressText = done ? 'COMPLETED' : 'IN PROGRESS';
      if (!done && chal.targetType === 'kills') {
        progressText = `${save.totalKills} / ${chal.targetValue}`;
      } else if (!done && chal.targetType === 'mod') {
        progressText = `${state.runStats.modsAttached} / ${chal.targetValue}`;
      } else if (!done && chal.targetType === 'loop') {
        progressText = `LOOP ${Math.max(save.bestLoop, state.loopCount)} / ${chal.targetValue}`;
      }

      const card = document.createElement('div');
      card.className = `kf-card${done ? ' active' : ''}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <strong style="font-size:11px;color:${done ? 'var(--kf-emerald)' : '#fff'};">${chal.description}</strong>
          <span class="kf-pill ${done ? 'kf-pill-emerald' : 'kf-pill-cyan'}">${progressText}</span>
        </div>
        <div style="font-size:10px;color:var(--kf-amber);">
          REWARD: +${chal.rewardGold} GOLD · +${chal.rewardSkillPoints} SKILL PT(S)
        </div>
      `;
      grid.appendChild(card);
    }

    body.appendChild(grid);
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
    this.root.remove();
  }
}
