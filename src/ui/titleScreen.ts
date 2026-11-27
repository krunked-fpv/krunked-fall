// ============================================================================
// KRUNKEDFALL — Sculpted Title Screen (Floats over Live WebGL2 Menu Aurora)
// ============================================================================

import type {
  AssetPackMode,
  ControllerStatus,
  SaveData,
} from '../contracts/index.js';
import { UI_LABELS, getOutcastDef, getSkinDef } from '../data/index.js';
import type { GamepadGlyphSet } from '../input/index.js';
import type { CustomPackImportResult } from '../render/index.js';
import { renderKrunkedfallEmblemSvg, svgIcon } from './icons.js';
import { getOutcastPortraitUrl } from './spritePreview.js';

function formatControllerBadge(status: ControllerStatus | undefined): {
  text: string;
  badgeClass: string;
} | null {
  if (!status) return null;
  if (status.gamepadConnected) {
    let label = 'GAMEPAD';
    const lowName = status.gamepadName.toLowerCase();
    switch (status.gamepadProfile) {
      case 'xbox':
        label = 'XBOX';
        break;
      case 'playstation':
        label = lowName.includes('dualsense')
          ? 'DUALSENSE'
          : lowName.includes('dualshock')
            ? 'DUALSHOCK'
            : 'PLAYSTATION';
        break;
      case 'nintendo':
        label = 'NINTENDO';
        break;
      case 'steamdeck':
        label = 'STEAM DECK';
        break;
      case 'tesla':
        label = 'TESLA GAMEPAD';
        break;
      default:
        label = 'GAMEPAD';
        break;
    }
    const countTag = status.gamepadCount > 1 ? ` ×${status.gamepadCount}` : '';
    const profileMod = status.gamepadProfile === 'tesla' ? 'tesla' : 'gamepad';
    return {
      text: `GAMEPAD READY: ${label}${countTag}`,
      badgeClass: `kf-controller-badge connected ${profileMod}`,
    };
  }
  if (status.touchSensed) {
    return {
      text: status.isTeslaBrowser
        ? 'TESLA TOUCH CONTROLS READY'
        : 'TOUCH CONTROLS READY',
      badgeClass: status.isTeslaBrowser
        ? 'kf-controller-badge tesla'
        : 'kf-controller-badge touch',
    };
  }
  return null;
}

function renderFooterLegendHtml(
  status: ControllerStatus | undefined,
  prompts: GamepadGlyphSet | undefined,
): string {
  if (status?.activeDevice === 'touch') {
    return [
      ['L-STICK', 'MOVE'],
      ['R-STICK', 'AIM & FIRE'],
      ['ARC', 'ABILITY / POWER / SWAP'],
    ]
      .map(
        ([k, lbl]) =>
          `<span class="kf-legend-item"><span class="kf-kbd kf-kbd-gold">${k}</span>${lbl}</span>`,
      )
      .join('');
  }
  if (status?.activeDevice === 'gamepad') {
    const p = prompts;
    const pairs: Array<[string, string]> = [
      [p?.move || 'LS', 'MOVE'],
      [p?.aim || 'RS', 'AIM'],
      [p?.fire || 'RT', 'FIRE'],
      [p?.ability || 'LT', 'ABILITY'],
      [p?.power || 'RB', 'POWER'],
      [p?.swap || 'X', 'SWAP'],
      [p?.workbench || 'VIEW', 'BENCH'],
    ];
    return pairs
      .map(
        ([k, lbl]) =>
          `<span class="kf-legend-item"><span class="kf-kbd kf-kbd-cyan">${k}</span>${lbl}</span>`,
      )
      .join('');
  }
  const kbPairs: Array<[string, string]> = [
    ['WASD', 'MOVE'],
    ['LMB', 'FIRE'],
    ['SPACE', 'ABILITY'],
    ['Q', 'POWER'],
    ['E', 'SWAP / USE'],
    ['TAB', 'WORKBENCH'],
  ];
  return kbPairs
    .map(
      ([k, lbl]) =>
        `<span class="kf-legend-item"><span class="kf-kbd">${k}</span>${lbl}</span>`,
    )
    .join('');
}

export interface TitleScreenCallbacks {
  onNewRun(): void;
  onContinue(): void;
  onOpenOptions(): void;
  onOpenKeybinds(): void;
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onLoadCustomPack(files: FileList): Promise<CustomPackImportResult>;
  onPlayUiClick(): void;
  onPlayUiConfirm?(): void;
}

export class TitleScreen {
  private readonly root: HTMLElement;
  private readonly cb: TitleScreenCallbacks;
  private visible = false;
  private lastSignature = '';
  private packMessage = '';
  private packMessageIsError = false;
  private busy = false;

  constructor(parent: HTMLElement, callbacks: TitleScreenCallbacks) {
    this.cb = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'kf-title-screen kf-interactive';
    this.root.style.display = 'none';
    this.root.dataset.uiInteractive = 'true';
    parent.appendChild(this.root);
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      this.lastSignature = '';
    }
  }

  public render(
    save: SaveData,
    hasContinue: boolean,
    packMode: AssetPackMode,
    customPackAvailable: boolean,
    controllerStatus?: ControllerStatus,
    prompts?: GamepadGlyphSet,
  ): void {
    if (!this.visible) return;

    const skinId = save.selectedSkins[save.selectedOutcast] ?? 'original';
    const sig = [
      hasContinue ? '1' : '0',
      save.selectedOutcast,
      skinId,
      packMode,
      customPackAvailable ? '1' : '0',
      save.totalKills,
      save.totalRuns,
      save.bestLoop,
      save.discoveredWeapons.length,
      save.defeatedBosses.length,
      this.packMessage,
      this.packMessageIsError ? 'e' : 'o',
      this.busy ? 'b' : 'i',
      controllerStatus?.activeDevice ?? 'keyboard',
      controllerStatus?.gamepadConnected ? 'g1' : 'g0',
      controllerStatus?.gamepadProfile ?? 'generic',
      controllerStatus?.gamepadName ?? '',
      controllerStatus?.gamepadCount ?? 0,
      controllerStatus?.touchSensed ? 't1' : 't0',
      controllerStatus?.isTeslaBrowser ? 'ts1' : 'ts0',
      prompts?.confirm ?? '',
    ].join('|');

    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    this.root.innerHTML = '';

    // ------------------------------------------------------------------------
    // 1. TOP UTILITY BAR (Controller Badge Left | Compact Art Pack Dock Right)
    // ------------------------------------------------------------------------
    const topBar = document.createElement('div');
    topBar.className = 'kf-title-topbar';

    const topLeft = document.createElement('div');
    topLeft.className = 'kf-title-top-left';
    const badgeInfo = formatControllerBadge(controllerStatus);
    if (badgeInfo) {
      const badge = document.createElement('div');
      badge.className = badgeInfo.badgeClass;
      badge.dataset.testid = 'title-controller-badge';
      const dot = document.createElement('span');
      dot.className = 'kf-controller-dot';
      const label = document.createElement('span');
      label.textContent = badgeInfo.text;
      badge.append(dot, label);
      topLeft.appendChild(badge);
    }

    const packDock = document.createElement('div');
    packDock.className = 'kf-title-pack-dock';

    const packPill = document.createElement('div');
    packPill.className = 'kf-title-pack-pill';

    const packLabel = document.createElement('span');
    packLabel.className = 'kf-title-pack-label';
    packLabel.innerHTML = `${svgIcon('pack', 13)} ART PACK`;

    const segGroup = document.createElement('div');
    segGroup.className = 'kf-seg-group';

    const builtinBtn = document.createElement('button');
    builtinBtn.type = 'button';
    builtinBtn.className = `kf-seg-btn${packMode === 'builtin' ? ' active' : ''}`;
    builtinBtn.textContent = 'BUILT-IN';
    builtinBtn.title = UI_LABELS.packBuiltinLabel;
    builtinBtn.dataset.testid = 'pack-builtin-btn';
    builtinBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      void this.handleSwitchPack('builtin');
    });

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = `kf-seg-btn gold${packMode === 'custom' ? ' active' : ''}`;
    customBtn.textContent = customPackAvailable ? 'CUSTOM' : 'CUSTOM';
    customBtn.title = customPackAvailable
      ? UI_LABELS.packCustomLabel
      : 'Mount a Custom Pack folder first';
    customBtn.disabled = !customPackAvailable || this.busy;
    customBtn.dataset.testid = 'pack-custom-btn';
    customBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      void this.handleSwitchPack('custom');
    });

    segGroup.append(builtinBtn, customBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.setAttribute('webkitdirectory', '');
    fileInput.setAttribute('directory', '');
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        void this.handleImportFiles(fileInput.files);
      }
      fileInput.value = '';
    });

    const loadPackBtn = document.createElement('button');
    loadPackBtn.type = 'button';
    loadPackBtn.className = 'kf-btn kf-btn-sm kf-btn-ghost';
    loadPackBtn.innerHTML = `${svgIcon('folder', 13)}<span>${this.busy ? 'MOUNTING...' : 'LOAD'}</span>`;
    loadPackBtn.title = UI_LABELS.loadCustomPackLabel;
    loadPackBtn.disabled = this.busy;
    loadPackBtn.dataset.testid = 'load-custom-pack-btn';
    loadPackBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      fileInput.click();
    });

    packPill.append(packLabel, segGroup, loadPackBtn, fileInput);
    packDock.appendChild(packPill);

    if (this.packMessage) {
      const msg = document.createElement('div');
      msg.className = this.packMessageIsError
        ? 'kf-title-pack-msg error'
        : 'kf-title-pack-msg';
      msg.textContent = this.packMessage;
      packDock.appendChild(msg);
    }

    topBar.append(topLeft, packDock);
    this.root.appendChild(topBar);

    // ------------------------------------------------------------------------
    // 2. CENTER HERO: SCULPTED METALLIC EMBLEM + SLEEK COMMAND MENU
    // ------------------------------------------------------------------------
    const center = document.createElement('div');
    center.className = 'kf-title-center';

    const header = document.createElement('div');
    header.className = 'kf-title-header';
    header.innerHTML = `
      <div class="kf-title-rune-strip" data-testid="title-eyebrow">ᛟ RAGNAROK PROTOCOL · THREE-ROCK PRISON ᛟ</div>
      <div class="kf-emblem-wrap" aria-label="${UI_LABELS.gameTitle}">${renderKrunkedfallEmblemSvg()}</div>
      <div class="kf-title-subtitle" data-testid="title-subtitle">${UI_LABELS.gameSubtitle}</div>
    `;

    const menuBox = document.createElement('div');
    menuBox.className = 'kf-title-menu-box';

    if (hasContinue) {
      const outcast = getOutcastDef(save.selectedOutcast);
      const skin = getSkinDef(skinId);
      const portraitUrl = getOutcastPortraitUrl(outcast.id, skin.id, 40, 0);

      const continueBtn = document.createElement('button');
      continueBtn.type = 'button';
      continueBtn.className = 'kf-title-continue-card';
      continueBtn.dataset.testid = 'title-continue-btn';
      continueBtn.dataset.gpInitial = 'true';
      continueBtn.innerHTML = `
        <div class="kf-title-continue-portrait">
          ${portraitUrl ? `<img class="kf-pixel-img" src="${portraitUrl}" width="36" height="36" alt="${outcast.name}" />` : svgIcon('clone', 22)}
        </div>
        <div class="kf-title-continue-meta">
          <span class="kf-title-continue-kicker">${UI_LABELS.continueButton}</span>
          <span class="kf-title-continue-sub">${outcast.name} · ${skin.name} · ${save.unspentSkillPoints} SP</span>
        </div>
        ${svgIcon('chevronRight', 20)}
      `;
      continueBtn.addEventListener('click', () => {
        (this.cb.onPlayUiConfirm ?? this.cb.onPlayUiClick)();
        this.cb.onContinue();
      });
      menuBox.appendChild(continueBtn);
    }

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'kf-btn kf-btn-lg kf-btn-primary';
    playBtn.innerHTML = `${svgIcon('play', 16)}<span>${hasContinue ? 'START NEW RUN' : 'PLAY / NEW RUN'}</span>`;
    playBtn.dataset.testid = 'title-play-btn';
    if (!hasContinue) {
      playBtn.dataset.gpInitial = 'true';
    }
    playBtn.addEventListener('click', () => {
      (this.cb.onPlayUiConfirm ?? this.cb.onPlayUiClick)();
      this.cb.onNewRun();
    });
    menuBox.appendChild(playBtn);

    const optRow = document.createElement('div');
    optRow.className = 'kf-title-btn-row';

    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'kf-btn';
    optBtn.innerHTML = `${svgIcon('options', 15)}<span>OPTIONS</span>`;
    optBtn.dataset.testid = 'title-options-btn';
    optBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenOptions();
    });

    const kbBtn = document.createElement('button');
    kbBtn.type = 'button';
    kbBtn.className = 'kf-btn';
    kbBtn.innerHTML = `${svgIcon('keybinds', 15)}<span>CONTROLS</span>`;
    kbBtn.dataset.testid = 'title-keybinds-btn';
    kbBtn.addEventListener('click', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenKeybinds();
    });

    optRow.append(optBtn, kbBtn);
    menuBox.appendChild(optRow);

    center.append(header, menuBox);
    this.root.appendChild(center);

    // ------------------------------------------------------------------------
    // 3. BOTTOM KEYCAP LEGEND & CAREER RECORD STRIP
    // ------------------------------------------------------------------------
    const footer = document.createElement('div');
    footer.className = 'kf-title-footer';
    footer.innerHTML = `
      <div class="kf-legend-strip" data-testid="title-controls-legend">${renderFooterLegendHtml(controllerStatus, prompts)}</div>
      <div class="kf-title-records">
        <span>RUNS <strong>${save.totalRuns}</strong></span>
        <span>KILLS <strong>${save.totalKills}</strong></span>
        <span>BOSSES <strong>${save.defeatedBosses.length}/6</strong></span>
        <span>BEST LOOP <strong>${save.bestLoop}</strong></span>
      </div>
    `;
    this.root.appendChild(footer);
  }

  private async handleSwitchPack(mode: AssetPackMode): Promise<void> {
    this.busy = true;
    this.lastSignature = '';
    const ok = await this.cb.onSetPackMode(mode);
    this.busy = false;
    if (ok) {
      this.packMessage =
        mode === 'custom'
          ? 'Switched live to Owned Custom Pack.'
          : 'Switched live to Built-In Krunked Art.';
      this.packMessageIsError = false;
    } else {
      this.packMessage = 'Custom Pack unavailable. Click LOAD to mount your folder.';
      this.packMessageIsError = true;
    }
    this.lastSignature = '';
  }

  private async handleImportFiles(files: FileList): Promise<void> {
    this.busy = true;
    this.packMessage = 'Indexing extracted manifest & texture pages...';
    this.packMessageIsError = false;
    this.lastSignature = '';

    const result = await this.cb.onLoadCustomPack(files);
    this.busy = false;
    if (result.ok) {
      this.packMessage = `Custom Pack mounted (${result.spriteCount} sprites / ${result.pageCount} pages).`;
      this.packMessageIsError = false;
    } else {
      this.packMessage = result.error ?? 'Failed to load Custom Pack folder.';
      this.packMessageIsError = true;
    }
    this.lastSignature = '';
  }

  public dispose(): void {
    this.root.remove();
  }
}
