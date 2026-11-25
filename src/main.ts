// ============================================================================
// KRUNKEDFALL — Browser Entrypoint (src/main.ts)
// ============================================================================

import './styles/main.css';
import { GameApp } from './app/index.js';

async function boot(): Promise<void> {
  const appRoot = document.getElementById('app');
  const canvas = document.getElementById('game-canvas');
  const uiRoot = document.getElementById('ui-root');

  if (
    !(appRoot instanceof HTMLElement) ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(uiRoot instanceof HTMLElement)
  ) {
    throw new Error('[KRUNKEDFALL] Missing required #app, #game-canvas, or #ui-root mount elements.');
  }

  const app = new GameApp(appRoot, canvas, uiRoot);
  await app.init();

  window.addEventListener('beforeunload', () => {
    app.dispose();
  });
}

boot().catch((err) => {
  console.error('[KRUNKEDFALL] Fatal startup error:', err);
  const uiRoot = document.getElementById('ui-root');
  if (uiRoot) {
    uiRoot.innerHTML = `
      <div class="kf-modal-backdrop kf-interactive">
        <div class="kf-panel kf-panel-crimson kf-modal kf-modal-sm" style="padding:18px;">
          <h2 style="margin:0 0 8px;color:#ff3a4e;letter-spacing:0.1em;">KRUNKEDFALL INITIALIZATION FAILED</h2>
          <pre style="margin:0;white-space:pre-wrap;font-size:11px;color:#eaf2fb;">${String(err)}</pre>
        </div>
      </div>
    `;
  }
});
