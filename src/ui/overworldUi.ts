// ============================================================================
// KRUNKEDFALL — Branching Overworld Tactical Star-Chart (Act 0 -> Act 3)
// ============================================================================
// Super Mario World-style branching route graph with curved Bifrost conduits,
// dedicated left Act Rail (zero banner-node overlap), deterministic relaxation
// layout solver guaranteeing zero node-node overlap across all 45 nodes,
// biome swatch & Boss portrait tactical preview sidebar, and 1-click deploy.

import type {
  ActId,
  BiomeNodeDef,
  ControllerStatus,
  NodeType,
  SimState,
} from '../contracts/index.js';
import type { GamepadGlyphSet } from '../input/index.js';
import {
  ACT_TITLES,
  OVERWORLD_NODES,
  OVERWORLD_NODE_BY_ID,
  getBossDef,
  getEnemyDef,
} from '../data/index.js';
import { svgIcon, type IconName } from './icons.js';
import { getBossPortraitUrl } from './spritePreview.js';

export interface OverworldUiCallbacks {
  onDeployNode(nodeId: string): void;
  onReturnToHub(): void;
  onOpenWorkbench(): void;
  onPlayUiClick(): void;
  onPlayUiConfirm?(): void;
}

const NODE_TYPE_META: Record<NodeType, { label: string; icon: IconName }> = {
  hub: { label: 'HUB', icon: 'hub' },
  training: { label: 'TRAIN', icon: 'target' },
  combat: { label: 'ZONE', icon: 'sword' },
  arena: { label: 'ARENA', icon: 'arena' },
  boss: { label: 'BOSS', icon: 'skull' },
  shop: { label: 'SHOP', icon: 'shop' },
  campfire: { label: 'CAMP', icon: 'flame' },
  stash: { label: 'STASH', icon: 'stash' },
  infinite: { label: 'ENDLESS', icon: 'loop' },
  shrine: { label: 'SHRINE', icon: 'rune' },
};

// Spacious vertical layout sized to fit horizontally within the 1280px map pane
// (960px wide) with a dedicated 196px Left Act Rail so Act banners NEVER touch
// any of the 45 nodes, while vertical height gives generous breathing room.
const CANVAS_W = 960;
const CANVAS_H = 2200;
const ACT_RAIL_RIGHT = 200;
const PLAYFIELD_LEFT = 220;
const PLAYFIELD_RIGHT = CANVAS_W - 20;
const PLAYFIELD_TOP = 64;
const PLAYFIELD_BOTTOM = CANVAS_H - 54;

const MIN_MAP_X = 352;
const MAX_MAP_X = 1184;
const MIN_MAP_Y = 560;
const MAX_MAP_Y = 2416;

interface LayoutNode {
  node: BiomeNodeDef;
  x: number;
  y: number;
  originX: number;
  originY: number;
  halfW: number;
  halfH: number;
}

interface OverworldLayout {
  positions: Map<string, { x: number; y: number }>;
  actBands: Record<ActId, { minY: number; maxY: number; bannerY: number }>;
}

const MIN_PAIR_DX = 96;
const MIN_PAIR_DY = 38;
const GAP_X = 16;
const GAP_Y = 14;

function estimateNodeHalfExtents(node: BiomeNodeDef): { halfW: number; halfH: number } {
  const charCount = Math.max(node.displayName.length, 9);
  const estWidth = Math.max(node.nodeType === 'boss' ? 106 : 92, Math.ceil(charCount * 6.3 + 22));
  return {
    halfW: Math.ceil(estWidth * 0.5),
    halfH: 21,
  };
}

let cachedOverworldLayout: OverworldLayout | null = null;

function computeOverworldLayout(): OverworldLayout {
  if (cachedOverworldLayout) return cachedOverworldLayout;

  const items: LayoutNode[] = OVERWORLD_NODES.map((node) => {
    const { halfW, halfH } = estimateNodeHalfExtents(node);
    const nx = (node.mapX - MIN_MAP_X) / (MAX_MAP_X - MIN_MAP_X);
    const ny = (node.mapY - MIN_MAP_Y) / (MAX_MAP_Y - MIN_MAP_Y);
    const usableLeft = PLAYFIELD_LEFT + halfW;
    const usableRight = PLAYFIELD_RIGHT - halfW;
    const ox = usableLeft + nx * (usableRight - usableLeft);
    const oy = PLAYFIELD_TOP + ny * (PLAYFIELD_BOTTOM - PLAYFIELD_TOP);
    return {
      node,
      x: ox,
      y: oy,
      originX: ox,
      originY: oy,
      halfW,
      halfH,
    };
  });

  // Deterministic pairwise minimum-separation relaxation pass
  const ITERATIONS = 220;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const reqDx = Math.max(MIN_PAIR_DX, a.halfW + b.halfW + GAP_X);
        const reqDy = Math.max(MIN_PAIR_DY, a.halfH + b.halfH + GAP_Y);

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < reqDx && absDy < reqDy) {
          anyOverlap = true;
          const penX = reqDx - absDx;
          const penY = reqDy - absDy;

          const normPenX = penX / reqDx;
          const normPenY = penY / reqDy;

          if (normPenY <= normPenX * 1.15) {
            const signY = dy !== 0 ? Math.sign(dy) : a.originY <= b.originY ? 1 : -1;
            const shift = penY * 0.52 + 0.5;
            a.y -= signY * shift;
            b.y += signY * shift;
          } else {
            const signX = dx !== 0 ? Math.sign(dx) : a.originX <= b.originX ? 1 : -1;
            const shift = penX * 0.52 + 0.5;
            a.x -= signX * shift;
            b.x += signX * shift;
          }
        }
      }
    }

    const pull = iter < 80 ? 0.018 : 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (pull > 0) {
        it.x += (it.originX - it.x) * pull;
        it.y += (it.originY - it.y) * pull;
      }
      const minX = PLAYFIELD_LEFT + it.halfW;
      const maxX = PLAYFIELD_RIGHT - it.halfW;
      if (it.x < minX) it.x = minX;
      if (it.x > maxX) it.x = maxX;
      if (it.y < PLAYFIELD_TOP) it.y = PLAYFIELD_TOP;
      if (it.y > PLAYFIELD_BOTTOM) it.y = PLAYFIELD_BOTTOM;
    }

    if (!anyOverlap && iter > 20) break;
  }

  const positions = new Map<string, { x: number; y: number }>();
  const actMinMax: Record<ActId, { minY: number; maxY: number }> = {
    0: { minY: Infinity, maxY: -Infinity },
    1: { minY: Infinity, maxY: -Infinity },
    2: { minY: Infinity, maxY: -Infinity },
    3: { minY: Infinity, maxY: -Infinity },
  };

  for (const it of items) {
    const rx = Math.round(it.x);
    const ry = Math.round(it.y);
    positions.set(it.node.id, { x: rx, y: ry });
    const band = actMinMax[it.node.act];
    if (ry < band.minY) band.minY = ry;
    if (ry > band.maxY) band.maxY = ry;
  }

  const actBands: Record<ActId, { minY: number; maxY: number; bannerY: number }> = {
    3: {
      minY: actMinMax[3].minY,
      maxY: actMinMax[3].maxY,
      bannerY: Math.max(24, actMinMax[3].minY - 22),
    },
    2: {
      minY: actMinMax[2].minY,
      maxY: actMinMax[2].maxY,
      bannerY: Math.round((actMinMax[2].minY + actMinMax[2].maxY) * 0.5 - 22),
    },
    1: {
      minY: actMinMax[1].minY,
      maxY: actMinMax[1].maxY,
      bannerY: Math.round((actMinMax[1].minY + actMinMax[1].maxY) * 0.5 - 22),
    },
    0: {
      minY: actMinMax[0].minY,
      maxY: actMinMax[0].maxY,
      bannerY: Math.min(CANVAS_H - 96, Math.round((actMinMax[0].minY + actMinMax[0].maxY) * 0.5 - 22)),
    },
  };

  const orderedActs: ActId[] = [3, 2, 1, 0];
  for (let i = 1; i < orderedActs.length; i++) {
    const prev = actBands[orderedActs[i - 1]];
    const curr = actBands[orderedActs[i]];
    if (curr.bannerY < prev.bannerY + 86) {
      curr.bannerY = prev.bannerY + 86;
    }
  }

  cachedOverworldLayout = { positions, actBands };
  return cachedOverworldLayout;
}

function stripBrackets(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1);
  return t;
}

export class OverworldUi {
  private readonly root: HTMLElement;
  private readonly cb: OverworldUiCallbacks;
  private visible = false;
  private selectedNodeId = 'act1_canyon';
  private actFilter: ActId | 'all' = 'all';
  private lastSig = '';
  private mapWrapRef: HTMLElement | null = null;

  constructor(parent: HTMLElement, callbacks: OverworldUiCallbacks) {
    this.cb = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'kf-overworld-screen kf-interactive';
    this.root.style.display = 'none';
    this.root.dataset.uiInteractive = 'true';
    parent.appendChild(this.root);
  }

  private playConfirm(): void {
    if (this.cb.onPlayUiConfirm) this.cb.onPlayUiConfirm();
    else this.cb.onPlayUiClick();
  }

  public setVisible(visible: boolean, state?: SimState): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
    if (visible && state) {
      // Prioritize unlocked uncleared combat/boss frontier node (e.g. Bandit Canyon)
      const combatFrontier = state.unlockedNodeIds.find((id) => {
        if (state.clearedNodeIds.includes(id)) return false;
        const n = OVERWORLD_NODE_BY_ID.get(id);
        return Boolean(
          n && (n.nodeType === 'combat' || n.nodeType === 'boss' || n.nodeType === 'arena'),
        );
      });
      const anyFrontier = state.unlockedNodeIds.find(
        (id) => !state.clearedNodeIds.includes(id) && id !== 'act0_hub',
      );
      const candidate =
        combatFrontier ??
        anyFrontier ??
        state.currentNodeId ??
        'act1_canyon';
      this.selectedNodeId = OVERWORLD_NODE_BY_ID.has(candidate)
        ? candidate
        : 'act1_canyon';
      this.lastSig = '';
    }
  }

  public render(
    state: SimState,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    if (!this.visible) return;

    const activeDevice = controllerStatus?.activeDevice ?? 'keyboard';
    const sig = [
      state.currentNodeId,
      state.clearedNodeIds.join(','),
      state.unlockedNodeIds.join(','),
      state.loopCount,
      state.player.gold,
      this.selectedNodeId,
      String(this.actFilter),
      activeDevice,
      controllerStatus?.gamepadProfile ?? 'generic',
      prompts?.workbench ?? '',
      prompts?.cancel ?? '',
    ].join('|');

    if (sig === this.lastSig) return;
    const prevScrollTop = this.mapWrapRef?.scrollTop ?? null;
    const prevScrollLeft = this.mapWrapRef?.scrollLeft ?? null;
    this.lastSig = sig;

    const clearedSet = new Set(state.clearedNodeIds);
    const unlockedSet = new Set(state.unlockedNodeIds);
    const layout = computeOverworldLayout();
    const posMap = layout.positions;

    this.root.innerHTML = '';

    // 1. Sleek Single-Line Header Bar (Zero Wrapping at 1280px!)
    const header = document.createElement('div');
    header.className = 'kf-overworld-header';

    const brand = document.createElement('div');
    brand.className = 'kf-overworld-brand';
    brand.innerHTML = `
      <div class="kf-modal-icon-badge" style="width:28px;height:28px;">${svgIcon('bifrost', 16)}</div>
      <div style="display:flex;align-items:center;gap:10px;white-space:nowrap;">
        <strong style="font-family:var(--kf-font-display);font-size:15px;color:#fff;letter-spacing:0.12em;">BIFROST MAP</strong>
        <span class="kf-pill kf-pill-cyan">LOOP ${state.loopCount}</span>
        <span class="kf-pill">${state.clearedNodeIds.length}/${OVERWORLD_NODES.length}</span>
        <span class="kf-pill kf-pill-gold">${svgIcon('gold', 11)} ${state.player.gold}G</span>
      </div>
    `;

    const actsBar = document.createElement('div');
    actsBar.className = 'kf-seg-group kf-overworld-acts';
    const actTabs: Array<{ val: ActId | 'all'; label: string }> = [
      { val: 'all', label: 'ALL' },
      { val: 0, label: 'HUB' },
      { val: 1, label: 'ACT I' },
      { val: 2, label: 'ACT II' },
      { val: 3, label: 'ACT III' },
    ];
    for (const tab of actTabs) {
      const isSelected = this.actFilter === tab.val;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kf-seg-btn${isSelected ? ' active' : ''}`;
      btn.textContent = tab.label;
      btn.dataset.testid = `overworld-act-${tab.val}`;
      btn.dataset.gpTabGroup = 'overworld-acts';
      if (isSelected) {
        btn.dataset.gpTabActive = 'true';
      }
      btn.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.actFilter = tab.val;
        this.lastSig = '';
        this.scrollToAct(tab.val);
      });
      actsBar.appendChild(btn);
    }

    const actionsRight = document.createElement('div');
    actionsRight.className = 'kf-overworld-actions';

    const benchKey =
      activeDevice === 'touch'
        ? ''
        : stripBrackets(prompts?.workbench ?? 'TAB');
    const benchBtn = document.createElement('button');
    benchBtn.type = 'button';
    benchBtn.className = 'kf-btn kf-btn-sm';
    benchBtn.innerHTML = `${svgIcon('workbench', 13)}<span>BENCH</span>${benchKey ? `<span class="kf-kbd">${benchKey}</span>` : ''}`;
    benchBtn.dataset.testid = 'overworld-workbench-btn';
    benchBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenWorkbench();
    });

    const hubKey =
      activeDevice === 'gamepad' && prompts ? stripBrackets(prompts.cancel) : '';
    const hubBtn = document.createElement('button');
    hubBtn.type = 'button';
    hubBtn.className = 'kf-btn kf-btn-sm kf-btn-gold';
    hubBtn.innerHTML = `${svgIcon('hub', 13)}<span>HUB</span>${hubKey ? `<span class="kf-kbd kf-kbd-gold">${hubKey}</span>` : ''}`;
    hubBtn.dataset.testid = 'overworld-return-hub';
    hubBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToHub();
    });

    actionsRight.append(benchBtn, hubBtn);
    header.append(brand, actsBar, actionsRight);

    // 2. Main Split (Map Star-Chart + Tactical Inspector Sidebar)
    const main = document.createElement('div');
    main.className = 'kf-overworld-main';

    const mapWrap = document.createElement('div');
    mapWrap.className = 'kf-overworld-map-wrap kf-scroll';
    this.mapWrapRef = mapWrap;

    const canvas = document.createElement('div');
    canvas.className = 'kf-overworld-canvas';
    canvas.style.width = `${CANVAS_W}px`;
    canvas.style.height = `${CANVAS_H}px`;

    // Dedicated Left Act Rail
    const actRail = document.createElement('div');
    actRail.className = 'kf-overworld-act-rail';
    actRail.style.width = `${ACT_RAIL_RIGHT}px`;
    canvas.appendChild(actRail);

    const actBanners: Array<{ act: ActId; tag: string; color: string }> = [
      { act: 3, tag: 'ACT III', color: '#ff3d5e' },
      { act: 2, tag: 'ACT II', color: '#3df299' },
      { act: 1, tag: 'ACT I', color: '#ff9c2a' },
      { act: 0, tag: 'ACT 0', color: '#38e0ff' },
    ];
    for (const b of actBanners) {
      const band = layout.actBands[b.act];
      const lbl = document.createElement('div');
      lbl.className = 'kf-overworld-act-banner';
      lbl.style.top = `${band.bannerY}px`;
      lbl.style.borderLeftColor = b.color;
      lbl.style.color = b.color;
      const fullTitle = ACT_TITLES[b.act];
      const parts = fullTitle.split(' — ');
      lbl.innerHTML =
        parts.length === 2
          ? `<div class="kf-act-banner-kicker">${parts[0]}</div><div class="kf-act-banner-name">${parts[1]}</div>`
          : `<div class="kf-act-banner-kicker">${b.tag}</div><div class="kf-act-banner-name">${fullTitle}</div>`;
      canvas.appendChild(lbl);
    }

    // SVG Curved Bifrost Route Connections
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'kf-overworld-svg');
    svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);

    const dividerPairs: Array<[ActId, ActId]> = [
      [3, 2],
      [2, 1],
      [1, 0],
    ];
    for (const [upperAct, lowerAct] of dividerPairs) {
      const divY = Math.round(
        (layout.actBands[upperAct].maxY + layout.actBands[lowerAct].minY) * 0.5,
      );
      const hr = document.createElementNS(svgNS, 'line');
      hr.setAttribute('x1', String(ACT_RAIL_RIGHT));
      hr.setAttribute('y1', String(divY));
      hr.setAttribute('x2', String(CANVAS_W));
      hr.setAttribute('y2', String(divY));
      hr.setAttribute('stroke', 'rgba(84, 118, 162, 0.24)');
      hr.setAttribute('stroke-width', '1');
      hr.setAttribute('stroke-dasharray', '5 7');
      svg.appendChild(hr);
    }

    const drawnEdges = new Set<string>();
    for (const node of OVERWORLD_NODES) {
      const fromPos = posMap.get(node.id)!;
      for (const targetId of node.connections) {
        const edgeKey = node.id < targetId ? `${node.id}::${targetId}` : `${targetId}::${node.id}`;
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);

        const targetPos = posMap.get(targetId);
        if (!targetPos) continue;

        const bothCleared = clearedSet.has(node.id) && clearedSet.has(targetId);
        const reachableEdge =
          (clearedSet.has(node.id) || unlockedSet.has(node.id)) &&
          (clearedSet.has(targetId) || unlockedSet.has(targetId));

        const dx = targetPos.x - fromPos.x;
        const dy = targetPos.y - fromPos.y;
        const len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(22, len * 0.12) * (fromPos.x <= targetPos.x ? 1 : -1);
        const mx = (fromPos.x + targetPos.x) * 0.5 - (dy / len) * bend * 0.45;
        const my = (fromPos.y + targetPos.y) * 0.5 + (dx / len) * bend * 0.45;

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${fromPos.x} ${fromPos.y} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${targetPos.x} ${targetPos.y}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute(
          'stroke',
          bothCleared ? '#3df299' : reachableEdge ? '#38e0ff' : '#26364c',
        );
        path.setAttribute('stroke-width', bothCleared ? '3.2' : reachableEdge ? '2.4' : '1.5');
        path.setAttribute('opacity', bothCleared ? '0.9' : reachableEdge ? '0.92' : '0.6');
        if (!bothCleared && reachableEdge) {
          path.setAttribute('class', 'kf-route-frontier');
        }
        svg.appendChild(path);
      }
    }
    canvas.appendChild(svg);

    // Interactive Star-Chart Nodes
    for (const node of OVERWORLD_NODES) {
      const pos = posMap.get(node.id)!;
      const isCleared = clearedSet.has(node.id);
      const isUnlocked = unlockedSet.has(node.id) || isCleared;
      const isCurrent = state.currentNodeId === node.id;
      const isSelected = this.selectedNodeId === node.id;
      const dimmed = this.actFilter !== 'all' && node.act !== this.actFilter;
      const typeMeta = NODE_TYPE_META[node.nodeType];

      const btn = document.createElement('button');
      btn.type = 'button';
      const classes = ['kf-map-node', node.nodeType];
      if (isCleared) classes.push('cleared');
      else if (isUnlocked) classes.push('unlocked');
      if (isCurrent) classes.push('current');
      if (isSelected) classes.push('selected');
      btn.className = classes.join(' ');
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
      btn.style.opacity = dimmed ? '0.26' : '1';
      btn.dataset.testid = `map-node-${node.id}`;
      btn.innerHTML = `
        <span class="kf-map-node-type">${svgIcon(isCleared ? 'check' : typeMeta.icon, 10)} ${typeMeta.label}</span>
        <span style="white-space:nowrap;">${node.displayName}</span>
      `;

      btn.addEventListener('click', () => {
        if (this.selectedNodeId === node.id && isUnlocked) {
          this.playConfirm();
          this.cb.onDeployNode(node.id);
        } else {
          this.cb.onPlayUiClick();
          this.selectedNodeId = node.id;
          this.lastSig = '';
        }
      });

      btn.addEventListener('dblclick', () => {
        if (isUnlocked) {
          this.playConfirm();
          this.cb.onDeployNode(node.id);
        }
      });

      canvas.appendChild(btn);
    }

    mapWrap.appendChild(canvas);

    // 3. Tactical Node Preview Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'kf-overworld-sidebar kf-scroll';
    const selNode = OVERWORLD_NODE_BY_ID.get(this.selectedNodeId) ?? OVERWORLD_NODES[0];
    const selCleared = clearedSet.has(selNode.id);
    const selUnlocked = unlockedSet.has(selNode.id) || selCleared;
    const bossDef = selNode.bossId ? getBossDef(selNode.bossId) : null;
    const selTypeMeta = NODE_TYPE_META[selNode.nodeType];

    const statusPill = selCleared
      ? `<span class="kf-pill kf-pill-emerald">${svgIcon('check', 11)} CLEARED</span>`
      : selUnlocked
        ? `<span class="kf-pill kf-pill-cyan">${svgIcon('bifrost', 11)} LOCKED ON</span>`
        : `<span class="kf-pill">${svgIcon('lock', 11)} SEALED</span>`;

    const skullCount = Math.max(1, Math.min(6, selNode.difficultyTier));
    const skullsHtml = Array.from({ length: 6 }, (_, i) =>
      `<span class="${i < skullCount ? '' : 'dim'}">${svgIcon('skull', 12)}</span>`,
    ).join('');

    const pal = selNode.palette;
    const swatchGrad = `linear-gradient(90deg, ${pal.floorColorA} 0%, ${pal.floorColorB} 45%, ${pal.wallTopColor} 78%, ${pal.wallFaceColor} 100%)`;

    const headerCard = document.createElement('div');
    headerCard.className = 'kf-biome-header-card';
    headerCard.innerHTML = `
      <div class="kf-biome-swatch-bar" style="background:${swatchGrad};"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:7px;margin-top:2px;">
        <span class="kf-pill kf-pill-gold">${svgIcon(selTypeMeta.icon, 11)} ${selTypeMeta.label}</span>
        ${statusPill}
      </div>
      <div style="font-family:var(--kf-font-display);font-size:19px;font-weight:800;color:#fff;letter-spacing:0.08em;line-height:1.15;">${selNode.displayName}</div>
      <div style="font-size:11.5px;color:var(--kf-cyan);margin-top:3px;">${ACT_TITLES[selNode.act]}</div>
    `;

    const intelCard = document.createElement('div');
    intelCard.className = 'kf-card';
    intelCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
        <span style="color:var(--kf-text-dim);">THREAT TIER</span>
        <span class="kf-skulls" title="Tier ${selNode.difficultyTier}">${skullsHtml}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
        <span style="color:var(--kf-text-dim);">WEATHER</span>
        <strong style="font-family:var(--kf-font);color:#eef6ff;">${pal.weather.toUpperCase()}</strong>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:var(--kf-text-dim);">DESTRUCTIBLE COVER</span>
          <strong style="font-family:var(--kf-font);color:var(--kf-amber);">${Math.round(selNode.destructibleRatio * 100)}%</strong>
        </div>
        <div class="kf-progress-track">
          <div class="kf-progress-fill gold" style="width:${Math.round(selNode.destructibleRatio * 100)}%;"></div>
        </div>
      </div>
    `;

    sidebar.append(headerCard, intelCard);

    if (bossDef) {
      const bossPortrait = getBossPortraitUrl(bossDef.spritePhase1Key, 56);
      const bossCard = document.createElement('div');
      bossCard.className = 'kf-boss-trophy-card';
      bossCard.style.borderColor = bossDef.phase2Color;
      bossCard.innerHTML = `
        <div class="kf-boss-portrait">
          ${bossPortrait ? `<img class="kf-pixel-img" src="${bossPortrait}" width="48" height="48" alt="${bossDef.phase1Name}">` : svgIcon('skull', 24)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--kf-font-display);font-size:10px;color:${bossDef.phase2Color};font-weight:800;letter-spacing:0.12em;">MAJOR TWO-PHASE BOSS</div>
          <div style="font-family:var(--kf-font-display);font-size:14px;font-weight:800;color:${bossDef.accentColor};">${bossDef.phase1Name}</div>
          <div style="font-size:11px;color:var(--kf-text-dim);">P2 → <strong style="color:${bossDef.phase2Color};">${bossDef.phase2Name}</strong></div>
        </div>
      `;
      sidebar.appendChild(bossCard);
    }

    // Hostiles Detected Chips
    const hostilesCard = document.createElement('div');
    hostilesCard.className = 'kf-card';
    const enemyChips = selNode.enemyPool
      .slice(0, 6)
      .map((eid) => {
        const ed = getEnemyDef(eid);
        return `<span class="kf-pill" style="border-color:${ed.tintColor}55;color:${ed.tintColor};">${ed.name}</span>`;
      })
      .join('');
    hostilesCard.innerHTML = `
      <div style="font-family:var(--kf-font-display);font-size:10.5px;color:var(--kf-text-dim);font-weight:800;letter-spacing:0.1em;">HOSTILES DETECTED</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:2px;">
        ${enemyChips || '<span class="kf-pill kf-pill-emerald">SAFE ZONE</span>'}
      </div>
    `;
    sidebar.appendChild(hostilesCard);

    // Clickable Connected Route Chips
    const routesCard = document.createElement('div');
    routesCard.className = 'kf-card';
    const routesTitle = document.createElement('div');
    routesTitle.style.fontFamily = 'var(--kf-font-display)';
    routesTitle.style.fontSize = '10.5px';
    routesTitle.style.color = 'var(--kf-text-dim)';
    routesTitle.style.fontWeight = '800';
    routesTitle.style.letterSpacing = '0.1em';
    routesTitle.textContent = 'CONNECTED ROUTES';
    const routesRow = document.createElement('div');
    routesRow.style.display = 'flex';
    routesRow.style.flexWrap = 'wrap';
    routesRow.style.gap = '5px';
    routesRow.style.marginTop = '3px';
    for (const cid of selNode.connections) {
      const targetNode = OVERWORLD_NODE_BY_ID.get(cid);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'kf-btn kf-btn-sm kf-btn-ghost';
      chip.style.padding = '3px 8px';
      chip.style.fontSize = '10px';
      chip.textContent = targetNode?.displayName ?? cid;
      chip.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.selectedNodeId = cid;
        this.lastSig = '';
      });
      routesRow.appendChild(chip);
    }
    routesCard.append(routesTitle, routesRow);
    sidebar.appendChild(routesCard);

    // Hero Deploy CTA
    const deployBtn = document.createElement('button');
    deployBtn.type = 'button';
    deployBtn.className = selUnlocked
      ? selNode.nodeType === 'boss'
        ? 'kf-btn kf-btn-danger kf-btn-lg'
        : 'kf-btn kf-btn-primary kf-btn-lg'
      : 'kf-btn';
    deployBtn.disabled = !selUnlocked;
    deployBtn.dataset.testid = 'overworld-deploy-btn';
    deployBtn.style.marginTop = 'auto';
    deployBtn.style.fontSize = '13px';
    deployBtn.style.padding = '11px 14px';
    deployBtn.innerHTML = selUnlocked
      ? selNode.nodeType === 'hub'
        ? `${svgIcon('hub', 15)}<span>RETURN TO OUTPOST HUB</span>`
        : `${svgIcon(selNode.nodeType === 'boss' ? 'skull' : 'bifrost', 15)}<span>DEPLOY · ${selNode.displayName}</span>`
      : `${svgIcon('lock', 14)}<span>CLEAR ADJACENT NODE</span>`;
    deployBtn.addEventListener('click', () => {
      if (!selUnlocked) return;
      this.playConfirm();
      this.cb.onDeployNode(selNode.id);
    });
    sidebar.appendChild(deployBtn);

    main.append(mapWrap, sidebar);
    this.root.append(header, main);

    if (prevScrollTop !== null && prevScrollLeft !== null) {
      mapWrap.scrollTop = prevScrollTop;
      mapWrap.scrollLeft = prevScrollLeft;
    } else {
      const selPos = posMap.get(selNode.id);
      if (selPos) {
        mapWrap.scrollTop = Math.max(0, selPos.y - mapWrap.clientHeight * 0.55);
      }
    }
  }

  private scrollToAct(act: ActId | 'all'): void {
    if (!this.mapWrapRef) return;
    if (act === 'all') return;
    const layout = computeOverworldLayout();
    const band = layout.actBands[act];
    this.mapWrapRef.scrollTop = Math.max(0, band.minY - 72);
  }

  public dispose(): void {
    this.root.remove();
  }
}
