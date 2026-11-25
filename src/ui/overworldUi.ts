// ============================================================================
// KRUNKEDFALL — Branching Overworld Node Map UI (Act 0 -> Act 1 -> Act 2 -> Act 3)
// ============================================================================
// Super Mario World-style branching route graph with glowing SVG connections,
// cleared/unlocked/boss/shop/campfire/stash/arena/infinite node indicators,
// tactical node preview sidebar, and click-to-deploy via Bifrost.

import type { ActId, BiomeNodeDef, NodeType, SimState } from '../contracts/index.js';
import {
  ACT_TITLES,
  OVERWORLD_NODES,
  OVERWORLD_NODE_BY_ID,
  getBossDef,
  getEnemyDef,
} from '../data/index.js';

export interface OverworldUiCallbacks {
  onDeployNode(nodeId: string): void;
  onReturnToHub(): void;
  onOpenWorkbench(): void;
  onPlayUiClick(): void;
}

const NODE_TYPE_GLYPH: Record<NodeType, string> = {
  hub: '⌂ HUB',
  training: '◎ TRAIN',
  combat: '⚔ ZONE',
  arena: '✦ ARENA',
  boss: '☠ BOSS',
  shop: '$ SHOP',
  campfire: '▲ CAMP',
  stash: '◆ STASH',
  infinite: '∞ ENDLESS',
  shrine: '★ SHRINE',
};

const CANVAS_W = 980;
const CANVAS_H = 1120;
const MIN_MAP_X = 320;
const MAX_MAP_X = 1220;
const MIN_MAP_Y = 510;
const MAX_MAP_Y = 2470;

function projectNodePos(node: BiomeNodeDef): { x: number; y: number } {
  const nx = (node.mapX - MIN_MAP_X) / (MAX_MAP_X - MIN_MAP_X);
  const ny = (node.mapY - MIN_MAP_Y) / (MAX_MAP_Y - MIN_MAP_Y);
  return {
    x: Math.round(70 + nx * (CANVAS_W - 140)),
    y: Math.round(52 + ny * (CANVAS_H - 104)),
  };
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

  public setVisible(visible: boolean, state?: SimState): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
    if (visible && state) {
      // Focus nearest unlocked frontier node automatically
      const candidate =
        state.unlockedNodeIds.find(
          (id) => !state.clearedNodeIds.includes(id) && id !== 'act0_hub',
        ) ??
        state.currentNodeId ??
        'act1_canyon';
      this.selectedNodeId = OVERWORLD_NODE_BY_ID.has(candidate)
        ? candidate
        : 'act1_canyon';
      this.lastSig = '';
    }
  }

  public render(state: SimState): void {
    if (!this.visible) return;

    const sig = [
      state.currentNodeId,
      state.clearedNodeIds.join(','),
      state.unlockedNodeIds.join(','),
      state.loopCount,
      state.player.gold,
      this.selectedNodeId,
      String(this.actFilter),
    ].join('|');

    if (sig === this.lastSig) return;
    const prevScrollTop = this.mapWrapRef?.scrollTop ?? null;
    const prevScrollLeft = this.mapWrapRef?.scrollLeft ?? null;
    this.lastSig = sig;

    const clearedSet = new Set(state.clearedNodeIds);
    const unlockedSet = new Set(state.unlockedNodeIds);

    this.root.innerHTML = '';

    // 1. Header Bar
    const header = document.createElement('div');
    header.className = 'kf-overworld-header';

    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <strong style="font-size:15px;color:var(--kf-cyan);letter-spacing:0.12em;">BIFROST OVERWORLD MAP</strong>
      <span style="margin-left:10px;font-size:11px;color:var(--kf-text-dim);">
        LOOP ${state.loopCount} · CLEARED ${state.clearedNodeIds.length}/${OVERWORLD_NODES.length} · GOLD ${state.player.gold}
      </span>
    `;

    const actsBar = document.createElement('div');
    actsBar.className = 'kf-overworld-acts';
    const actTabs: Array<{ val: ActId | 'all'; label: string }> = [
      { val: 'all', label: 'ALL ACTS' },
      { val: 0, label: 'ACT 0 HUB' },
      { val: 1, label: 'ACT I WOLF' },
      { val: 2, label: 'ACT II SERPENT' },
      { val: 3, label: 'ACT III KRUNKED' },
    ];
    for (const tab of actTabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        this.actFilter === tab.val ? 'kf-btn kf-btn-sm kf-btn-primary' : 'kf-btn kf-btn-sm';
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        this.actFilter = tab.val;
        this.lastSig = '';
        this.scrollToAct(tab.val);
      });
      actsBar.appendChild(btn);
    }

    const actionsRight = document.createElement('div');
    actionsRight.style.display = 'flex';
    actionsRight.style.gap = '6px';

    const benchBtn = document.createElement('button');
    benchBtn.type = 'button';
    benchBtn.className = 'kf-btn kf-btn-sm';
    benchBtn.textContent = '[TAB] WORKBENCH';
    benchBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenWorkbench();
    });

    const hubBtn = document.createElement('button');
    hubBtn.type = 'button';
    hubBtn.className = 'kf-btn kf-btn-sm kf-btn-gold';
    hubBtn.textContent = 'RETURN TO HUB';
    hubBtn.dataset.testid = 'overworld-return-hub';
    hubBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onReturnToHub();
    });

    actionsRight.append(benchBtn, hubBtn);
    header.append(titleWrap, actsBar, actionsRight);

    // 2. Main Split (Map Graph + Tactical Inspector Sidebar)
    const main = document.createElement('div');
    main.className = 'kf-overworld-main';

    const mapWrap = document.createElement('div');
    mapWrap.className = 'kf-overworld-map-wrap kf-scroll';
    this.mapWrapRef = mapWrap;

    const canvas = document.createElement('div');
    canvas.className = 'kf-overworld-canvas';

    // Act Zone Watermarks
    const actBanners: Array<{ act: ActId; y: number; color: string }> = [
      { act: 3, y: 120, color: '#ff3a4e' },
      { act: 2, y: 500, color: '#58f59a' },
      { act: 1, y: 820, color: '#ff9b35' },
      { act: 0, y: 1030, color: '#39d6ff' },
    ];
    for (const b of actBanners) {
      const lbl = document.createElement('div');
      lbl.style.position = 'absolute';
      lbl.style.left = '18px';
      lbl.style.top = `${b.y}px`;
      lbl.style.fontSize = '11px';
      lbl.style.fontWeight = '800';
      lbl.style.letterSpacing = '0.2em';
      lbl.style.color = b.color;
      lbl.style.opacity = '0.62';
      lbl.style.pointerEvents = 'none';
      lbl.textContent = ACT_TITLES[b.act];
      canvas.appendChild(lbl);
    }

    // SVG Branching Route Connections
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'kf-overworld-svg');
    svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);

    const drawnEdges = new Set<string>();
    const posMap = new Map<string, { x: number; y: number }>();
    for (const node of OVERWORLD_NODES) {
      posMap.set(node.id, projectNodePos(node));
    }

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

        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(fromPos.x));
        line.setAttribute('y1', String(fromPos.y));
        line.setAttribute('x2', String(targetPos.x));
        line.setAttribute('y2', String(targetPos.y));
        line.setAttribute(
          'stroke',
          bothCleared ? '#58f59a' : reachableEdge ? '#39d6ff' : '#26354a',
        );
        line.setAttribute('stroke-width', bothCleared ? '3' : reachableEdge ? '2.2' : '1.5');
        if (!bothCleared && reachableEdge) {
          line.setAttribute('stroke-dasharray', '6 4');
        }
        svg.appendChild(line);
      }
    }
    canvas.appendChild(svg);

    // Interactive Nodes
    for (const node of OVERWORLD_NODES) {
      const pos = posMap.get(node.id)!;
      const isCleared = clearedSet.has(node.id);
      const isUnlocked = unlockedSet.has(node.id) || isCleared;
      const isCurrent = state.currentNodeId === node.id;
      const isSelected = this.selectedNodeId === node.id;
      const dimmed = this.actFilter !== 'all' && node.act !== this.actFilter;

      const btn = document.createElement('button');
      btn.type = 'button';
      const classes = ['kf-map-node'];
      if (node.nodeType === 'boss') classes.push('boss');
      if (isCleared) classes.push('cleared');
      else if (isUnlocked) classes.push('unlocked');
      if (isCurrent) classes.push('current');
      if (isSelected) classes.push('selected');
      btn.className = classes.join(' ');
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
      btn.style.opacity = dimmed ? '0.28' : '1';
      btn.dataset.testid = `map-node-${node.id}`;
      btn.innerHTML = `
        <span style="font-size:8px;opacity:0.85;">${NODE_TYPE_GLYPH[node.nodeType]}</span>
        <span style="white-space:nowrap;">${node.displayName}</span>
      `;

      btn.addEventListener('click', () => {
        this.cb.onPlayUiClick();
        if (this.selectedNodeId === node.id && isUnlocked) {
          this.cb.onDeployNode(node.id);
        } else {
          this.selectedNodeId = node.id;
          this.lastSig = '';
        }
      });

      btn.addEventListener('dblclick', () => {
        if (isUnlocked) {
          this.cb.onPlayUiClick();
          this.cb.onDeployNode(node.id);
        }
      });

      canvas.appendChild(btn);
    }

    mapWrap.appendChild(canvas);

    // 3. Tactical Node Preview Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'kf-overworld-sidebar';
    const selNode = OVERWORLD_NODE_BY_ID.get(this.selectedNodeId) ?? OVERWORLD_NODES[0];
    const selCleared = clearedSet.has(selNode.id);
    const selUnlocked = unlockedSet.has(selNode.id) || selCleared;
    const bossDef = selNode.bossId ? getBossDef(selNode.bossId) : null;

    const statusPill = selCleared
      ? '<span class="kf-pill kf-pill-emerald">CLEARED</span>'
      : selUnlocked
        ? '<span class="kf-pill kf-pill-cyan">BIFROST LOCKED ON</span>'
        : '<span class="kf-pill">PATH SEALED</span>';

    const enemyNames = selNode.enemyPool
      .slice(0, 6)
      .map((eid) => getEnemyDef(eid).name)
      .join(', ');

    sidebar.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
          <span class="kf-pill kf-pill-gold">${NODE_TYPE_GLYPH[selNode.nodeType]}</span>
          ${statusPill}
        </div>
        <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:0.08em;">${selNode.displayName}</div>
        <div style="font-size:11px;color:var(--kf-cyan);margin-top:2px;">${ACT_TITLES[selNode.act]}</div>
      </div>

      <div class="kf-card">
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span style="color:var(--kf-text-dim);">DIFFICULTY TIER</span>
          <strong>${selNode.difficultyTier}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span style="color:var(--kf-text-dim);">BIOME WEATHER</span>
          <strong>${selNode.palette.weather.toUpperCase()}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span style="color:var(--kf-text-dim);">DESTRUCTIBLE COVER</span>
          <strong>${Math.round(selNode.destructibleRatio * 100)}%</strong>
        </div>
      </div>

      ${
        bossDef
          ? `
        <div class="kf-card" style="border-color:${bossDef.phase2Color};background:#250c15;">
          <div style="font-size:10px;color:${bossDef.phase2Color};font-weight:800;letter-spacing:0.1em;">MAJOR TWO-PHASE BOSS</div>
          <div style="font-size:13px;font-weight:800;color:${bossDef.accentColor};">${bossDef.phase1Name}</div>
          <div style="font-size:11px;color:var(--kf-text-dim);">PHASE 2 → <strong style="color:${bossDef.phase2Color};">${bossDef.phase2Name}</strong></div>
        </div>
      `
          : ''
      }

      <div class="kf-card">
        <div style="font-size:10px;color:var(--kf-text-dim);font-weight:800;letter-spacing:0.08em;">HOSTILES DETECTED</div>
        <div style="font-size:11px;color:var(--kf-text);line-height:1.45;">${enemyNames || 'SAFE ZONE'}</div>
      </div>

      <div class="kf-card">
        <div style="font-size:10px;color:var(--kf-text-dim);font-weight:800;letter-spacing:0.08em;">CONNECTED ROUTES</div>
        <div style="font-size:11px;color:var(--kf-cyan);line-height:1.45;">
          ${selNode.connections.map((cid) => OVERWORLD_NODE_BY_ID.get(cid)?.displayName ?? cid).join(' · ')}
        </div>
      </div>
    `;

    const deployBtn = document.createElement('button');
    deployBtn.type = 'button';
    deployBtn.className = selUnlocked
      ? selNode.nodeType === 'boss'
        ? 'kf-btn kf-btn-danger'
        : 'kf-btn kf-btn-primary'
      : 'kf-btn';
    deployBtn.disabled = !selUnlocked;
    deployBtn.dataset.testid = 'overworld-deploy-btn';
    deployBtn.textContent = selUnlocked
      ? selNode.nodeType === 'hub'
        ? 'RETURN TO OUTPOST HUB'
        : `DEPLOY TO ${selNode.displayName}`
      : 'CLEAR AN ADJACENT NODE FIRST';
    deployBtn.addEventListener('click', () => {
      if (!selUnlocked) return;
      this.cb.onPlayUiClick();
      this.cb.onDeployNode(selNode.id);
    });
    sidebar.appendChild(deployBtn);

    main.append(mapWrap, sidebar);
    this.root.append(header, main);

    // Restore scroll or auto-center selected node on initial open
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
    if (act === 3) this.mapWrapRef.scrollTop = 0;
    else if (act === 2) this.mapWrapRef.scrollTop = 360;
    else if (act === 1) this.mapWrapRef.scrollTop = 680;
    else if (act === 0) this.mapWrapRef.scrollTop = 900;
  }

  public dispose(): void {
    this.root.remove();
  }
}
