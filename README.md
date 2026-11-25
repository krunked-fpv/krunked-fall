# KRUNKEDFALL

A crisp, neon-lit 640×360 post-apocalyptic Norse twin-stick pixel-art action roguelite built with TypeScript, a 6-pass WebGL2 pixel-art pipeline, deterministic 60 Hz simulation, and Web Audio synthesis — featuring dual-mode **Built-In Original Krunked Pixel Art** and seamless **Owned Custom Pack** mounting.

## Features
- **640×360 Multi-Pass WebGL2 Pixel-Art Renderer**: Nearest-neighbor crisp scaling, dynamic 2D additive lighting & emissive glows, grounded contact shadows, persistent floor blood/oil/scorch decals, radial explosion shockwave distortion, destructible wall cracking & overkill sprite-split gore, Fimbulwinter frost & snowstorm gusts, shimmering Bifrost portals, and flowing Title Aurora.
- **Full Twin-Stick Roguelite Loop**: Hub Outpost (Loki's Head, Jotunn-Matic 3000 Outcast/Skin selector, branching Yggdrasil Skill Tree, Run Modifiers, Weapondex, Enemydex), branching Overworld Node Map across 3 Acts (Land of the Wolf, Coils of the Serpent, Shadow of Krunked), procedural destructible dungeons, 221-weapon arsenal, 76 composable weapon mods & runes, 8 playable Outcasts with active Abilities & Powers, 6 two-phase mechanical Norse bosses (culminating in Krunked / Corrupted Krunked), anti-camping Fimbulwinter Freeze Storm, and infinite post-clear Loop Mode.
- **Frame-Paced 30 / 60 / 120 FPS + Classic 60 FPS Pixel-Snap**: Pure 60 Hz deterministic simulation decoupled from high-refresh interpolated rendering.

## Commands
```bash
npm install
npm run play           # Start dev server on http://127.0.0.1:4173
npm run extract        # Optional: extract locally owned retail pack into .krunkedfall-assets/
npm run oracle         # Optional: emit local verification oracle
npm run typecheck      # TypeScript strict check
npm run test           # Vitest unit & integration suites
npm run verify:assets  # Gate A: Asset resolution, oracle parity, IP & Brand firewall
npm run verify:sim     # Gate B: Headless deterministic campaign soak
npm run verify:all     # Run Gate A + Gate B
npm run build          # Production build to dist/
npm run export:dna     # Sync Game DNA to C:\KrunkedVault
```
