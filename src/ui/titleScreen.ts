// ============================================================================
// KRUNKEDFALL — Title Screen UI (Floats over Live WebGL2 Menu Aurora Canvas)
// ============================================================================

import type { AssetPackMode, SaveData } from '../contracts/index.js';
import { UI_LABELS } from '../data/index.js';
import type { CustomPackImportResult } from '../render/index.js';

export interface TitleScreenCallbacks {
  onNewRun(): void;
  onContinue(): void;
  onOpenOptions(): void;
  onOpenKeybinds(): void;
  onSetPackMode(mode: AssetPackMode): Promise<boolean>;
  onLoadCustomPack(files: FileList): Promise<CustomPackImportResult>;
  onPlayUiClick(): void;
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
  ): void {
    if (!this.visible) return;

    const sig = [
      hasContinue ? '1' : '0',
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
    ].join('|');

    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    this.root.innerHTML = '';

    // Top Emblem
    const header = document.createElement('div');
    header.className = 'kf-title-header';
    header.innerHTML = `
      <div class="kf-title-rune-strip">ᛟ RAGNAROK PROTOCOL // THREE-ROCK PRISON ᛟ</div>
      <h1 class="kf-title-logo">${UI_LABELS.gameTitle}</h1>
      <div class="kf-title-subtitle">${UI_LABELS.gameSubtitle}</div>
    `;
    this.root.appendChild(header);

    // Center Menu Box
    const menuBox = document.createElement('div');
    menuBox.className = 'kf-panel kf-panel-cyan kf-title-menu-box';

    if (hasContinue) {
      const continueBtn = this.makeBtn(
        `${UI_LABELS.continueButton} (${save.selectedOutcast.toUpperCase()})`,
        'kf-btn kf-btn-emerald',
        () => {
          this.cb.onPlayUiClick();
          this.cb.onContinue();
        },
      );
      continueBtn.dataset.testid = 'title-continue-btn';
      menuBox.appendChild(continueBtn);
    }

    const playBtn = this.makeBtn(
      hasContinue ? 'NEW RUN' : 'PLAY / NEW RUN',
      'kf-btn kf-btn-primary',
      () => {
        this.cb.onPlayUiClick();
        this.cb.onNewRun();
      },
    );
    playBtn.dataset.testid = 'title-play-btn';
    menuBox.appendChild(playBtn);

    const optRow = document.createElement('div');
    optRow.className = 'kf-title-btn-row';
    const optBtn = this.makeBtn('OPTIONS', 'kf-btn', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenOptions();
    });
    optBtn.dataset.testid = 'title-options-btn';

    const kbBtn = this.makeBtn('KEYBINDS', 'kf-btn', () => {
      this.cb.onPlayUiClick();
      this.cb.onOpenKeybinds();
    });
    kbBtn.dataset.testid = 'title-keybinds-btn';

    optRow.append(optBtn, kbBtn);
    menuBox.appendChild(optRow);

    // Dual-Mode Art Pack Section
    const packBar = document.createElement('div');
    packBar.className = 'kf-title-pack-bar';

    const packTop = document.createElement('div');
    packTop.className = 'kf-title-pack-top';

    const activePill = document.createElement('span');
    activePill.className =
      packMode === 'custom' ? 'kf-pill kf-pill-gold' : 'kf-pill kf-pill-cyan';
    activePill.textContent =
      packMode === 'custom' ? 'ACTIVE: CUSTOM PACK' : 'ACTIVE: BUILT-IN ART';

    const availPill = document.createElement('span');
    availPill.className = customPackAvailable
      ? 'kf-pill kf-pill-emerald'
      : 'kf-pill';
    availPill.textContent = customPackAvailable
      ? 'CUSTOM PACK READY'
      : 'BUILT-IN STANDALONE';

    packTop.append(activePill, availPill);
    packBar.appendChild(packTop);

    const toggleRow = document.createElement('div');
    toggleRow.className = 'kf-title-pack-actions';

    const builtinBtn = this.makeBtn(
      UI_LABELS.packBuiltinLabel,
      packMode === 'builtin' ? 'kf-btn kf-btn-sm kf-btn-primary' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        void this.handleSwitchPack('builtin');
      },
    );
    builtinBtn.dataset.testid = 'pack-builtin-btn';

    const customBtn = this.makeBtn(
      UI_LABELS.packCustomLabel,
      packMode === 'custom' ? 'kf-btn kf-btn-sm kf-btn-gold' : 'kf-btn kf-btn-sm',
      () => {
        this.cb.onPlayUiClick();
        void this.handleSwitchPack('custom');
      },
    );
    customBtn.disabled = !customPackAvailable || this.busy;
    customBtn.dataset.testid = 'pack-custom-btn';

    toggleRow.append(builtinBtn, customBtn);
    packBar.appendChild(toggleRow);

    // Hidden Folder Picker (<input type="file" webkitdirectory multiple>)
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

    const loadPackBtn = this.makeBtn(
      this.busy ? 'MOUNTING PACK...' : UI_LABELS.loadCustomPackLabel,
      'kf-btn kf-btn-sm kf-btn-gold',
      () => {
        this.cb.onPlayUiClick();
        fileInput.click();
      },
    );
    loadPackBtn.disabled = this.busy;
    loadPackBtn.dataset.testid = 'load-custom-pack-btn';

    packBar.append(loadPackBtn, fileInput);

    if (this.packMessage) {
      const msg = document.createElement('div');
      msg.className = this.packMessageIsError
        ? 'kf-title-pack-msg error'
        : 'kf-title-pack-msg';
      msg.textContent = this.packMessage;
      packBar.appendChild(msg);
    }

    menuBox.appendChild(packBar);
    this.root.appendChild(menuBox);

    // Bottom Telemetry / Controls Strip
    const footer = document.createElement('div');
    footer.className = 'kf-title-footer';
    footer.innerHTML = `
      <span>WASD MOVE · LMB FIRE · SPACE/RMB ABILITY · Q POWER · E SWAP/INTERACT · TAB BENCH</span>
      <span>RUNS ${save.totalRuns} · KILLS ${save.totalKills} · BOSSES ${save.defeatedBosses.length}/6 · BEST LOOP ${save.bestLoop} · [F9] PLAYTEST</span>
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
      this.packMessage = 'Custom Pack unavailable. Use LOAD CUSTOM PACK to mount your folder.';
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
