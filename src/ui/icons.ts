// ============================================================================
// KRUNKEDFALL — Crisp Norse-Cyberpunk Inline SVG Icon & Emblem Library
// ============================================================================
// Pure deterministic SVG strings (zero external assets, instant crisp render
// at any DPR, currentColor inheritance).

export type IconName =
  | 'play'
  | 'continue'
  | 'options'
  | 'keybinds'
  | 'gamepad'
  | 'touch'
  | 'pack'
  | 'folder'
  | 'bifrost'
  | 'loki'
  | 'clone'
  | 'tree'
  | 'modifiers'
  | 'weapondex'
  | 'enemydex'
  | 'challenges'
  | 'workbench'
  | 'pause'
  | 'close'
  | 'hub'
  | 'sword'
  | 'shield'
  | 'heart'
  | 'gold'
  | 'bolt'
  | 'star'
  | 'skull'
  | 'flame'
  | 'ammo'
  | 'spark'
  | 'lock'
  | 'check'
  | 'search'
  | 'trophy'
  | 'loop'
  | 'retry'
  | 'volume'
  | 'mute'
  | 'display'
  | 'chevronRight'
  | 'compass'
  | 'shop'
  | 'stash'
  | 'arena'
  | 'target'
  | 'rune';

const ICON_PATHS: Readonly<Record<IconName, string>> = {
  play: '<polygon points="6,3.5 19.5,12 6,20.5" fill="currentColor"/>',
  continue:
    '<polygon points="4.5,4 14.5,12 4.5,20" fill="currentColor"/><rect x="16.5" y="4.5" width="3" height="15" rx="0.8" fill="currentColor"/>',
  options:
    '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.3M12 19.2v2.3M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  keybinds:
    '<rect x="2.5" y="5.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5.5" y="8.5" width="2.5" height="2.2" fill="currentColor"/><rect x="9.5" y="8.5" width="2.5" height="2.2" fill="currentColor"/><rect x="13.5" y="8.5" width="2.5" height="2.2" fill="currentColor"/><rect x="17" y="8.5" width="1.8" height="2.2" fill="currentColor"/><rect x="7" y="13.2" width="10" height="2.2" rx="0.6" fill="currentColor"/>',
  gamepad:
    '<path d="M6.5 7.5h11a4 4 0 0 1 3.9 4.8l-.8 3.7a2.6 2.6 0 0 1-4.5 1.1l-1.5-1.6H9.4l-1.5 1.6a2.6 2.6 0 0 1-4.5-1.1l-.8-3.7a4 4 0 0 1 3.9-4.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5v3.5M6.25 12.25h3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="15.2" cy="11.2" r="1" fill="currentColor"/><circle cx="17.3" cy="12.8" r="1" fill="currentColor"/>',
  touch:
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/>',
  pack: '<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  folder:
    '<path d="M3 6.5a1.8 1.8 0 0 1 1.8-1.8H9.5l2 2.2h7.7A1.8 1.8 0 0 1 21 8.7v8.8a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.5V6.5Z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  bifrost:
    '<circle cx="12" cy="12" r="8.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3.5c3.5 2.4 5.2 5.4 5.2 8.5 0 3.1-1.7 6.1-5.2 8.5M12 3.5c-3.5 2.4-5.2 5.4-5.2 8.5 0 3.1 1.7 6.1 5.2 8.5M3.5 12h17" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  loki: '<path d="M5 11.5c0-4.2 3.1-7.2 7-7.2s7 3 7 7.2v3.8c0 2.1-1.7 3.7-3.8 3.7H8.8A3.8 3.8 0 0 1 5 15.3v-3.8Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 7.2 3.2 3.2l4.4 1.6M18.5 7.2l2.3-4-4.4 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.2" cy="11.8" r="1.2" fill="currentColor"/><circle cx="14.8" cy="11.8" r="1.2" fill="currentColor"/><path d="M9 15.6c1.5 1.1 4.5 1.1 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  clone:
    '<circle cx="12" cy="7.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 20v-2.2a5.5 5.5 0 0 1 5.5-5.5h2a5.5 5.5 0 0 1 5.5 5.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 5v3M21 5v3M3 16v3M21 16v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  tree: '<path d="M12 21v-8.5M12 12.5 7.2 8.2M12 12.5l4.8-4.3M12 9.2V4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="4.2" r="2" fill="currentColor"/><circle cx="6.8" cy="7.8" r="1.8" fill="currentColor"/><circle cx="17.2" cy="7.8" r="1.8" fill="currentColor"/><path d="M8.5 21h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  modifiers:
    '<polygon points="12,2.5 19.5,6.8 19.5,17.2 12,21.5 4.5,17.2 4.5,6.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 6.5v11M8.5 9.5 12 6.5l3.5 3M8.5 14.5 12 17.5l3.5-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  weapondex:
    '<path d="M3.5 10.5h13l2.2-2.2H21v4.2h-2.8l-1.5 1.8h-4.2l-.8 3.2H8.4l1-3.2H5.5L3.5 12.6v-2.1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  enemydex:
    '<path d="M5.5 11.2a6.5 6.5 0 1 1 13 0c0 2.5-1.4 4.5-2.8 5.4v2.4H8.3v-2.4c-1.4-.9-2.8-2.9-2.8-5.4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9.4" cy="11.2" r="1.4" fill="currentColor"/><circle cx="14.6" cy="11.2" r="1.4" fill="currentColor"/><path d="M10.2 19v-2.2M13.8 19v-2.2" stroke="currentColor" stroke-width="1.6"/>',
  challenges:
    '<path d="M7 4.5h10v5a5 5 0 0 1-10 0v-5Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 6.5H4.2a2.2 2.2 0 0 0 2.2 3.8M17 6.5h2.8a2.2 2.2 0 0 1-2.2 3.8M12 14.5V19M8.5 19.5h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  workbench:
    '<path d="M14.7 6.3a4.5 4.5 0 0 0-5.8 5.8L4 17l3 3 4.9-4.9a4.5 4.5 0 0 0 5.8-5.8l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  pause:
    '<rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/>',
  close:
    '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  hub: '<path d="M3.5 11.2 12 4l8.5 7.2M6 9.8V19.5h12V9.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><rect x="10" y="13.5" width="4" height="6" fill="currentColor"/>',
  sword:
    '<path d="M19.5 4.5 10 14M19.5 4.5l-5 1.2L8.5 11.8l3.7 3.7 6.1-6 1.2-5ZM6.5 12.5l5 5M7.8 16.2 4.5 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  shield:
    '<path d="M12 3 4.5 6.2v5.4c0 4.6 3.2 8.2 7.5 9.4 4.3-1.2 7.5-4.8 7.5-9.4V6.2L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  heart:
    '<path d="M12 20.2 4.6 13.1a4.7 4.7 0 0 1 6.7-6.6l.7.8.7-.8a4.7 4.7 0 0 1 6.7 6.6L12 20.2Z" fill="currentColor"/>',
  gold: '<polygon points="12,3 20,12 12,21 4,12" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="12,7.2 15.8,12 12,16.8 8.2,12" fill="currentColor"/>',
  bolt: '<polygon points="13.5,2.5 5.5,13 11.2,13 10.2,21.5 18.5,10.8 12.8,10.8" fill="currentColor"/>',
  star: '<polygon points="12,2.8 14.8,8.6 21.2,9.5 16.5,14 17.7,20.3 12,17.2 6.3,20.3 7.5,14 2.8,9.5 9.2,8.6" fill="currentColor"/>',
  skull:
    '<path d="M6 11a6 6 0 1 1 12 0c0 2.3-1.2 4.1-2.5 5v2.5h-7V16C7.2 15.1 6 13.3 6 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9.5" cy="11.2" r="1.3" fill="currentColor"/><circle cx="14.5" cy="11.2" r="1.3" fill="currentColor"/><path d="M10.5 18.5v-2M13.5 18.5v-2" stroke="currentColor" stroke-width="1.6"/>',
  flame:
    '<path d="M12.5 2.8c.5 3.6-2.5 5.5-2.5 8.2 0 1.4 1 2.4 2.2 2.4 1.4 0 2.3-1.2 2.3-2.9 2.3 1.7 3.5 4 3.5 6.3a6 6 0 0 1-12 0c0-3.8 2.4-6.8 6.5-14Z" fill="currentColor"/>',
  ammo: '<path d="M7.5 19.5V10.5L9.5 5.5l2 5v9h-4ZM13.5 19.5V10.5l2-5 2 5v9h-4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  spark:
    '<path d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8 12 2.5Z" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  check:
    '<path d="M4.5 12.5 9.5 17.5 19.5 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  search:
    '<circle cx="10.8" cy="10.8" r="6.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.6 15.6 20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  trophy:
    '<path d="M7 4h10v5.5a5 5 0 0 1-10 0V4Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 6H4.2a2 2 0 0 0 1.8 3.6M17 6h2.8A2 2 0 0 1 18 9.6M12 14.5v4.5M8.2 19.5h7.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  loop: '<path d="M17.5 8.5A6.5 6.5 0 1 0 18.2 14M18 4.2v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  retry:
    '<path d="M6.5 8.5A6.5 6.5 0 1 1 5.8 14M6 4.2v4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  volume:
    '<polygon points="4,9.5 8.5,9.5 13.5,5.2 13.5,18.8 8.5,14.5 4,14.5" fill="currentColor"/><path d="M16.5 8.8a4.5 4.5 0 0 1 0 6.4M18.8 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mute: '<polygon points="4,9.5 8.5,9.5 13.5,5.2 13.5,18.8 8.5,14.5 4,14.5" fill="currentColor"/><path d="M16.5 9.2 21 14.8M21 9.2l-4.5 5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  display:
    '<rect x="3" y="4.5" width="18" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 20h7M12 16.5V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chevronRight:
    '<path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  compass:
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><polygon points="15.8,8.2 13.2,13.2 8.2,15.8 10.8,10.8" fill="currentColor"/>',
  shop: '<path d="M4.5 9.5h15l-1.2 10H5.7l-1.2-10ZM8.5 9.5V7a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  stash:
    '<rect x="3.5" y="7" width="17" height="12.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 11.5h17M10.2 11.5v2.5h3.6v-2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  arena:
    '<polygon points="12,2.5 15,8.8 21.5,12 15,15.2 12,21.5 9,15.2 2.5,12 9,8.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  target:
    '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  rune: '<path d="M12 3v18M12 4.5 17.5 9 12 13.5M12 10.5 6.5 15l5.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function svgIcon(name: IconName, size = 15, extraClass = ''): string {
  const path = ICON_PATHS[name] ?? ICON_PATHS.spark;
  const cls = extraClass ? `kf-ico ${extraClass}` : 'kf-ico';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

/**
 * Heavy-Metal Forged-Iron & Molten-Rune Title Emblem for KRUNKEDFALL.
 * Bold chamfered chrome-steel lettering, Viking forge under-glow, horned
 * Bifrost Valknut crest, and thick hard-ink arcade silhouette!
 */
export function renderKrunkedfallEmblemSvg(): string {
  return `
    <svg class="kf-emblem-svg" viewBox="0 0 820 176" role="img" aria-label="KRUNKEDFALL">
      <defs>
        <linearGradient id="kf-title-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="28%" stop-color="#d8eefc"/>
          <stop offset="52%" stop-color="#87adc9"/>
          <stop offset="56%" stop-color="#405670"/>
          <stop offset="78%" stop-color="#8ba6bf"/>
          <stop offset="100%" stop-color="#ffaa40"/>
        </linearGradient>
        <linearGradient id="kf-title-forge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#38e0ff" stop-opacity="0"/>
          <stop offset="14%" stop-color="#38e0ff"/>
          <stop offset="38%" stop-color="#ffd257"/>
          <stop offset="50%" stop-color="#ffffff"/>
          <stop offset="62%" stop-color="#ff8c24"/>
          <stop offset="86%" stop-color="#ff3d5e"/>
          <stop offset="100%" stop-color="#ff3d5e" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="kf-title-crest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9cf7ff"/>
          <stop offset="55%" stop-color="#ffd257"/>
          <stop offset="100%" stop-color="#ff6e26"/>
        </linearGradient>
        <linearGradient id="kf-title-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3a4c63"/>
          <stop offset="100%" stop-color="#111722"/>
        </linearGradient>
        <filter id="kf-title-glow" x="-12%" y="-25%" width="124%" height="165%">
          <feDropShadow dx="0" dy="6" stdDeviation="0" flood-color="#05060c" flood-opacity="1"/>
          <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="#38e0ff" flood-opacity="0.32"/>
          <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#ff7a29" flood-opacity="0.28"/>
        </filter>
      </defs>

      <!-- Forged Horned Viking Iron Crest & Crossed Rune-Blades Behind Crown -->
      <g>
        <path d="M58 34 L356 34 L378 14 L410 4 L442 14 L464 34 L762 34" fill="none" stroke="#060810" stroke-width="6"/>
        <path d="M58 34 L356 34 L378 14 L410 4 L442 14 L464 34 L762 34" fill="none" stroke="url(#kf-title-forge)" stroke-width="2.6"/>
        <!-- Horned iron shield crest center -->
        <path d="M380 28 L358 10 L376 18 Z" fill="#9fb9d1" stroke="#060810" stroke-width="2"/>
        <path d="M440 28 L462 10 L444 18 Z" fill="#9fb9d1" stroke="#060810" stroke-width="2"/>
        <polygon points="410,6 432,24 410,42 388,24" fill="url(#kf-title-iron)" stroke="url(#kf-title-crest)" stroke-width="2.4"/>
        <polygon points="410,12 422,24 410,36 398,24" fill="#09101c" stroke="#38e0ff" stroke-width="1.3"/>
        <path d="M410 14 L410 34 M404 20 L410 15 L416 20 M404 28 L410 33 L416 28" fill="none" stroke="#ffd257" stroke-width="1.8" stroke-linecap="round"/>
      </g>

      <!-- Deep Thick Heavy-Metal Black Arcade Block Extrusion -->
      <text
        x="410"
        y="128"
        text-anchor="middle"
        font-family="Impact, 'Bahnschrift', 'DIN Condensed', 'Arial Black', sans-serif"
        font-size="102"
        font-weight="900"
        letter-spacing="8"
        fill="#05060c"
        stroke="#05060c"
        stroke-width="18"
        stroke-linejoin="miter"
        transform="translate(0, 7)"
      >KRUNKEDFALL</text>

      <!-- Secondary Molten Viking Forge Rim Underlay -->
      <text
        x="410"
        y="128"
        text-anchor="middle"
        font-family="Impact, 'Bahnschrift', 'DIN Condensed', 'Arial Black', sans-serif"
        font-size="102"
        font-weight="900"
        letter-spacing="8"
        fill="#ff7b24"
        stroke="#ff7b24"
        stroke-width="6"
        stroke-linejoin="miter"
        transform="translate(0, 3)"
        opacity="0.9"
      >KRUNKEDFALL</text>

      <!-- Primary Carved Chrome-Steel & Molten-Edge Wordmark -->
      <text
        x="410"
        y="128"
        text-anchor="middle"
        font-family="Impact, 'Bahnschrift', 'DIN Condensed', 'Arial Black', sans-serif"
        font-size="102"
        font-weight="900"
        letter-spacing="8"
        fill="url(#kf-title-metal)"
        stroke="#0b111c"
        stroke-width="3"
        stroke-linejoin="miter"
        filter="url(#kf-title-glow)"
      >KRUNKEDFALL</text>

      <!-- Sharp Specular Horizon Glint Slashing Across Chrome Letters -->
      <rect x="86" y="88" width="648" height="2" fill="#ffffff" opacity="0.24"/>

      <!-- Forged Double-Edged Viking Spear Underline -->
      <rect x="74" y="148" width="672" height="5" fill="#05060c"/>
      <rect x="78" y="149" width="664" height="3" fill="url(#kf-title-forge)"/>
      <polygon points="78,150.5 54,150.5 68,143 68,158" fill="#38e0ff" stroke="#05060c" stroke-width="2"/>
      <polygon points="742,150.5 766,150.5 752,143 752,158" fill="#ff5830" stroke="#05060c" stroke-width="2"/>
      <polygon points="410,141 421,150.5 410,160 399,150.5" fill="#ffd257" stroke="#05060c" stroke-width="2"/>
    </svg>
  `;
}
