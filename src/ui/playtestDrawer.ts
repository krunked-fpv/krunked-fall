// ============================================================================
// KRUNKEDFALL — Dev-Only F9 Playtest & Operator QA Drawer
// ============================================================================
// Live telemetry (FPS/targetFps/simHz/tick/entities/projectiles/FNV-1a hash),
// instant Act/Node warp, all 6 Bosses + Trigger Phase 2, Outcast/Skin switch,
// Grant Weapon (all 221) / Mod (all 76) / Resources, Trigger Freeze Storm,
// God Mode toggle, Deterministic stepTicks(60), Live Pack Mode, Reset Save.

import type {
  BossId,
  DebugBridge,
  OutcastId,
  RuntimeMetrics,
  SkinId,
} from '../contracts/index.js';
import {
  BOSSES,
  MODS,
  OUTCASTS,
  OVERWORLD_NODES,
  SKINS,
  WEAPONS,
} from '../data/index.js';

export interface PlaytestDrawerCallbacks {
  getBridge(): DebugBridge;
  onClose(): void;
  onPlayUiClick(): void;
}

export class PlaytestDrawer {
  private readonly root: HTMLElement;
  private readonly cb: PlaytestDrawerCallbacks;
  private open = false;
  private built = false;

  // Cached telemetry value nodes (updated smoothly without rebuilding controls!)
  private metricFps!: HTMLElement;
  private metricSim!: HTMLElement;
  private metricTick!: HTMLElement;
  private metricEnt!: HTMLElement;
  private metricProj!: HTMLElement;
  private metricPack!: HTMLElement;
  private metricHash!: HTMLElement;
  private godBtn!: HTMLButtonElement;
  private packToggleBtn!: HTMLButtonElement;
  private lastMetricsUpdateMs = 0;

  constructor(parent: HTMLElement, callbacks: PlaytestDrawerCallbacks) {
    this.cb = callbacks;
    this.root = document.createElement('aside');
    this.root.className = 'kf-playtest-drawer kf-interactive';
    this.root.style.display = 'none';
    this.root.dataset.uiInteractive = 'true';
    this.root.dataset.testid = 'playtest-drawer';
    parent.appendChild(this.root);
  }

  public isOpen(): boolean {
    return this.open;
  }

  public setOpen(open: boolean): void {
    this.open = open;
    this.root.style.display = open ? 'flex' : 'none';
    if (open && !this.built) {
      this.buildControls();
      this.built = true;
    }
    if (open) {
      this.lastMetricsUpdateMs = 0;
    }
  }

  public toggle(): void {
    this.setOpen(!this.open);
  }

  public updateMetrics(metrics: RuntimeMetrics, godMode: boolean, nowMs: number): void {
    if (!this.open || !this.built) return;
    if (nowMs - this.lastMetricsUpdateMs < 80) return;
    this.lastMetricsUpdateMs = nowMs;

    this.metricFps.textContent = `${metrics.fps.toFixed(0)} / ${metrics.targetFps}`;
    this.metricSim.textContent = `${metrics.simHz} Hz`;
    this.metricTick.textContent = String(metrics.tick);
    this.metricEnt.textContent = `${metrics.entityCount} / pk ${metrics.pickupCount}`;
    this.metricProj.textContent = String(metrics.projectileCount);
    this.metricPack.textContent = `${metrics.packMode.toUpperCase()}${metrics.customPackAvailable ? ' ✓' : ''}`;
    this.metricHash.textContent = metrics.stateHash;

    this.godBtn.textContent = godMode ? 'GOD MODE: ON' : 'GOD MODE: OFF';
    this.godBtn.className = godMode
      ? 'kf-btn kf-btn-sm kf-btn-emerald'
      : 'kf-btn kf-btn-sm';

    this.packToggleBtn.textContent =
      metrics.packMode === 'custom' ? 'PACK: CUSTOM → BUILT-IN' : 'PACK: BUILT-IN → CUSTOM';
    this.packToggleBtn.disabled =
      metrics.packMode === 'builtin' && !metrics.customPackAvailable;
  }

  private buildControls(): void {
    this.root.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'kf-drawer-header';
    header.innerHTML = `<strong style="color:var(--kf-amber);letter-spacing:0.12em;">[F9] PLAYTEST DRAWER</strong>`;
    const closeBtn = this.makeBtn('✕', 'kf-btn kf-btn-sm kf-btn-danger', () => {
      this.cb.onPlayUiClick();
      this.cb.onClose();
    });
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'kf-drawer-body kf-scroll';

    // 1. Live Telemetry
    const secMetrics = this.makeSection('LIVE RUNTIME TELEMETRY');
    const grid = document.createElement('div');
    grid.className = 'kf-metrics-grid';
    this.metricFps = this.addMetricKv(grid, 'FPS');
    this.metricSim = this.addMetricKv(grid, 'SIM');
    this.metricTick = this.addMetricKv(grid, 'TICK');
    this.metricEnt = this.addMetricKv(grid, 'ENT');
    this.metricProj = this.addMetricKv(grid, 'PROJ');
    this.metricPack = this.addMetricKv(grid, 'PACK');

    const hashBox = document.createElement('div');
    hashBox.className = 'kf-metric-kv';
    hashBox.innerHTML = `<span style="color:var(--kf-text-dim);">FNV-1A</span>`;
    this.metricHash = document.createElement('strong');
    this.metricHash.style.color = 'var(--kf-cyan)';
    hashBox.appendChild(this.metricHash);

    secMetrics.append(grid, hashBox);

    // 2. Act / Node Instant Warp
    const secWarp = this.makeSection('ACT / NODE INSTANT WARP');
    const warpRow = document.createElement('div');
    warpRow.className = 'kf-drawer-row';
    const nodeSel = document.createElement('select');
    nodeSel.className = 'kf-select';
    for (const n of OVERWORLD_NODES) {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `A${n.act} · ${n.displayName} (${n.nodeType})`;
      nodeSel.appendChild(opt);
    }
    nodeSel.value = 'act1_canyon';
    const warpBtn = this.makeBtn('WARP', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().warpToNode(nodeSel.value);
    });
    warpBtn.dataset.testid = 'drawer-warp-btn';
    warpRow.append(nodeSel, warpBtn);
    secWarp.appendChild(warpRow);

    // 3. Direct Boss Spawner + Phase 2 Trigger
    const secBoss = this.makeSection('DIRECT BOSS SPAWN (ALL 6)');
    const bossRow = document.createElement('div');
    bossRow.className = 'kf-drawer-row';
    for (const b of BOSSES) {
      const btn = this.makeBtn(b.id.replace('_', ' ').toUpperCase(), 'kf-btn kf-btn-sm kf-btn-danger', () => {
        this.cb.onPlayUiClick();
        this.cb.getBridge().spawnBoss(b.id as BossId);
      });
      btn.dataset.testid = `drawer-boss-${b.id}`;
      bossRow.appendChild(btn);
    }
    const p2Btn = this.makeBtn('⚡ TRIGGER PHASE 2', 'kf-btn kf-btn-sm kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().triggerBossPhase2();
    });
    p2Btn.dataset.testid = 'drawer-boss-phase2';
    secBoss.append(bossRow, p2Btn);

    // 4. Outcast & Skin Switcher
    const secOutcast = this.makeSection('OUTCAST & SKIN SWITCHER');
    const ocRow = document.createElement('div');
    ocRow.className = 'kf-drawer-row';
    const ocSel = document.createElement('select');
    ocSel.className = 'kf-select';
    for (const o of OUTCASTS) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name} (${o.title})`;
      ocSel.appendChild(opt);
    }
    const ocBtn = this.makeBtn('SET', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().setOutcast(ocSel.value as OutcastId);
    });
    ocRow.append(ocSel, ocBtn);

    const skRow = document.createElement('div');
    skRow.className = 'kf-drawer-row';
    const skSel = document.createElement('select');
    skSel.className = 'kf-select';
    for (const s of SKINS) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      skSel.appendChild(opt);
    }
    const skBtn = this.makeBtn('SKIN', 'kf-btn kf-btn-sm kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().setSkin(skSel.value as SkinId);
    });
    skRow.append(skSel, skBtn);
    secOutcast.append(ocRow, skRow);

    // 5. Grant Weapon (221) & Mod (76)
    const secGear = this.makeSection('GRANT WEAPON (221) & MOD (76)');
    const wepSearch = document.createElement('input');
    wepSearch.type = 'text';
    wepSearch.className = 'kf-input';
    wepSearch.placeholder = 'Filter weapon by name or uniqueId...';

    const wepRow = document.createElement('div');
    wepRow.className = 'kf-drawer-row';
    const wepSel = document.createElement('select');
    wepSel.className = 'kf-select';
    const populateWeapons = (q: string): void => {
      const low = q.trim().toLowerCase();
      wepSel.innerHTML = '';
      for (const w of WEAPONS) {
        if (low && !w.name.toLowerCase().includes(low) && !String(w.uniqueId).includes(low)) {
          continue;
        }
        const opt = document.createElement('option');
        opt.value = String(w.uniqueId);
        opt.textContent = `#${w.uniqueId} T${w.weaponTier} ${w.name}`;
        wepSel.appendChild(opt);
      }
    };
    populateWeapons('');
    wepSearch.addEventListener('input', () => populateWeapons(wepSearch.value));

    const giveWep0 = this.makeBtn('SLOT 1', 'kf-btn kf-btn-sm kf-btn-emerald', () => {
      this.cb.onPlayUiClick();
      const uid = Number(wepSel.value);
      if (Number.isFinite(uid)) this.cb.getBridge().grantWeapon(uid, 0);
    });
    const giveWep1 = this.makeBtn('SLOT 2', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      const uid = Number(wepSel.value);
      if (Number.isFinite(uid)) this.cb.getBridge().grantWeapon(uid, 1);
    });
    wepRow.append(wepSel, giveWep0, giveWep1);

    const modRow = document.createElement('div');
    modRow.className = 'kf-drawer-row';
    const modSel = document.createElement('select');
    modSel.className = 'kf-select';
    for (const m of MODS) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `T${m.tier} ${m.name}`;
      modSel.appendChild(opt);
    }
    const attachModBtn = this.makeBtn('ATTACH', 'kf-btn kf-btn-sm kf-btn-emerald', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().grantMod(modSel.value, true);
    });
    const bagModBtn = this.makeBtn('+BAG', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().grantMod(modSel.value, false);
    });
    modRow.append(modSel, attachModBtn, bagModBtn);
    secGear.append(wepSearch, wepRow, modRow);

    // 6. Resources & Simulation Controls
    const secSim = this.makeSection('RESOURCES, STORM & DETERMINISM');
    const resRow = document.createElement('div');
    resRow.className = 'kf-drawer-row';
    resRow.append(
      this.makeBtn('+500 GOLD', 'kf-btn kf-btn-sm kf-btn-gold', () => {
        this.cb.onPlayUiClick();
        this.cb.getBridge().grantResources({ gold: 500 });
      }),
      this.makeBtn('+AMMO', 'kf-btn kf-btn-sm', () => {
        this.cb.onPlayUiClick();
        this.cb.getBridge().grantResources({ ammo: 200 });
      }),
      this.makeBtn('+3 SP', 'kf-btn kf-btn-sm kf-btn-emerald', () => {
        this.cb.onPlayUiClick();
        this.cb.getBridge().grantResources({ skillPoints: 3 });
      }),
      this.makeBtn('FULL HP', 'kf-btn kf-btn-sm kf-btn-emerald', () => {
        this.cb.onPlayUiClick();
        this.cb.getBridge().grantResources({ hp: 9999 });
      }),
    );

    const simRow = document.createElement('div');
    simRow.className = 'kf-drawer-row';
    const stormBtn = this.makeBtn('FREEZE STORM', 'kf-btn kf-btn-sm kf-btn-primary', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().triggerFreezeStorm(0.85);
    });
    const clearStormBtn = this.makeBtn('CLEAR STORM', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().triggerFreezeStorm(0);
    });
    this.godBtn = this.makeBtn('GOD MODE: OFF', 'kf-btn kf-btn-sm', () => {
      this.cb.onPlayUiClick();
      const b = this.cb.getBridge();
      b.setGodMode(!b.getState().godMode);
    });
    const stepBtn = this.makeBtn('STEP +60 TICKS', 'kf-btn kf-btn-sm kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().stepTicks(60);
    });
    stepBtn.dataset.testid = 'drawer-step-60';
    simRow.append(stormBtn, clearStormBtn, this.godBtn, stepBtn);

    const sysRow = document.createElement('div');
    sysRow.className = 'kf-drawer-row';
    this.packToggleBtn = this.makeBtn('TOGGLE PACK', 'kf-btn kf-btn-sm kf-btn-gold', () => {
      this.cb.onPlayUiClick();
      const b = this.cb.getBridge();
      const cur = b.getMetrics().packMode;
      void b.setPackMode(cur === 'custom' ? 'builtin' : 'custom');
    });
    const resetSaveBtn = this.makeBtn('RESET SAVE', 'kf-btn kf-btn-sm kf-btn-danger', () => {
      this.cb.onPlayUiClick();
      this.cb.getBridge().resetSave();
    });
    sysRow.append(this.packToggleBtn, resetSaveBtn);

    secSim.append(resRow, simRow, sysRow);

    body.append(secMetrics, secWarp, secBoss, secOutcast, secGear, secSim);
    this.root.append(header, body);
  }

  private makeSection(title: string): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'kf-drawer-section';
    const hdr = document.createElement('div');
    hdr.className = 'kf-drawer-section-title';
    hdr.textContent = title;
    sec.appendChild(hdr);
    return sec;
  }

  private addMetricKv(parent: HTMLElement, label: string): HTMLElement {
    const kv = document.createElement('div');
    kv.className = 'kf-metric-kv';
    kv.innerHTML = `<span style="color:var(--kf-text-dim);">${label}</span>`;
    const val = document.createElement('strong');
    val.textContent = '-';
    kv.appendChild(val);
    parent.appendChild(kv);
    return val;
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
