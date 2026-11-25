// ============================================================================
// KRUNKEDFALL — Headless Audio Engine & Built-In Asset Pack Verification
// ============================================================================

import { describe, expect, it } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, type SimEvent } from '../src/contracts/index.js';
import {
  buildBuiltinPackPages,
  getBuiltinFontAtlas,
  getBuiltinPackManifest,
  measurePixelText,
} from '../src/assets/index.js';
import {
  AudioEngine,
  DEFAULT_AUDIO_SETTINGS,
  MUSIC_CROSSFADE_SEC,
  resolveSynthTheme,
  type UiSoundKind,
} from '../src/audio/index.js';
import { BOSSES, OVERWORLD_NODES, collectAllLogicalAssetKeys } from '../src/data/index.js';

describe('KRUNKEDFALL Headless Audio Engine & Built-In Pack', () => {
  it('manages headless AudioEngine lifecycle, volume clamping, and Intro -> A -> B -> Outro music state machine', () => {
    const engine = new AudioEngine({
      masterVolume: 1.75,
      musicVolume: -0.5,
      sfxVolume: 0.42,
      muted: false,
    });

    // Constructor clamps volumes into [0, 1]
    expect(engine.getSettings()).toEqual({
      masterVolume: 1,
      musicVolume: 0,
      sfxVolume: 0.42,
      muted: false,
    });

    // applySettings clamps cleanly
    engine.applySettings({
      masterVolume: -2,
      musicVolume: 5,
      sfxVolume: 0.85,
      muted: true,
    });
    expect(engine.getSettings()).toEqual({
      masterVolume: 0,
      musicVolume: 1,
      sfxVolume: 0.85,
      muted: true,
    });

    engine.applySettings({ ...DEFAULT_AUDIO_SETTINGS });
    expect(engine.getSettings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(MUSIC_CROSSFADE_SEC).toBeCloseTo(0.35, 3);

    // Safe unlock & pack switching in headless Node (no AudioContext)
    expect(() => engine.unlock()).not.toThrow();
    expect(() =>
      engine.setPackSource('custom', (key, kind) => `/mock/${kind}/${key}.ogg`),
    ).not.toThrow();
    expect(() => engine.setPackSource('builtin')).not.toThrow();

    // Music state machine: Intro -> A -> B -> Outro -> Stop
    engine.setMusic('music_fenrir_intro');
    expect(engine.getActiveTrack()).toEqual({ trackKey: 'music_fenrir_intro', stem: 'intro' });

    engine.setMusic('music_fenrir_a');
    expect(engine.getActiveTrack()).toEqual({ trackKey: 'music_fenrir_a', stem: 'a' });

    // boss_phase2 without explicit music_change transitions stem to 'b'
    engine.handleEvents(
      [{ type: 'boss_phase2', bossId: 'fenrir', name: 'MELTDOWN FENRIR', x: 200, y: 150 }],
      180,
    );
    expect(engine.getActiveTrack()).toEqual({ trackKey: 'music_fenrir', stem: 'b' });

    // boss_defeated without explicit music_change transitions stem to 'outro'
    engine.handleEvents(
      [{ type: 'boss_defeated', bossId: 'fenrir', name: 'MELTDOWN FENRIR', x: 200, y: 150 }],
      180,
    );
    expect(engine.getActiveTrack()).toEqual({ trackKey: 'music_fenrir', stem: 'outro' });

    // Explicit music_change overrides cleanly
    engine.handleEvents(
      [{ type: 'music_change', trackKey: 'music_krunked_b', stem: 'b', ambienceKey: 'ambience_city' }],
      180,
    );
    expect(engine.getActiveTrack()).toEqual({ trackKey: 'music_krunked_b', stem: 'b' });

    // Empty track stops cleanly
    engine.setMusic('');
    expect(engine.getActiveTrack()).toEqual({ trackKey: '', stem: 'a' });

    // Every UI sound kind executes cleanly without throwing
    const uiKinds: UiSoundKind[] = ['hover', 'click', 'confirm', 'error', 'levelup'];
    for (const kind of uiKinds) {
      expect(() => engine.playUi(kind)).not.toThrow();
    }

    // Verify synth theme resolution for every boss and overworld biome track
    for (const b of BOSSES) {
      expect(resolveSynthTheme(b.musicKeyA)).toBeDefined();
      expect(resolveSynthTheme(b.musicKeyB)).toBeDefined();
    }
    for (const n of OVERWORLD_NODES) {
      expect(resolveSynthTheme(n.musicKey)).toBeDefined();
    }

    // Dispose and verify post-dispose calls remain safe no-ops
    expect(() => engine.dispose()).not.toThrow();
    expect(() => engine.unlock()).not.toThrow();
    expect(() => engine.setMusic('music_hub')).not.toThrow();
    expect(() => engine.playUi('click')).not.toThrow();
  });

  it('handles every single SimEvent union variant cleanly in headless Node', () => {
    const engine = new AudioEngine();
    engine.unlock();

    const allEvents: SimEvent[] = [
      {
        type: 'weapon_fire',
        x: 100,
        y: 100,
        angle: 0,
        weaponUniqueId: 1015,
        ammoType: 1,
        soundKey: 'sfx_wep_1015_fire',
        soundId: 10,
        volume: 1,
        pitch: 1,
        flashFrames: 2,
      },
      { type: 'melee_slash', x: 100, y: 100, angle: 0.4, radius: 28, arc: 1.4, color: '#ffffff' },
      { type: 'projectile_hit', x: 140, y: 100, normalX: -1, normalY: 0, color: '#ffbe0b', isWall: true },
      { type: 'projectile_hit', x: 140, y: 100, normalX: -1, normalY: 0, color: '#ffbe0b', isWall: false },
      {
        type: 'enemy_hit',
        enemyId: 1,
        x: 150,
        y: 100,
        damage: 25,
        isCrit: true,
        element: 'burn',
        dirX: 1,
        dirY: 0,
      },
      {
        type: 'enemy_death',
        enemyId: 1,
        defId: 'bandit',
        x: 150,
        y: 100,
        overkill: true,
        dirX: 1,
        dirY: 0,
        bloodColor: '#d90429',
        isBoss: false,
      },
      { type: 'wall_crack', tileX: 8, tileY: 8, x: 136, y: 136, ratio: 0.5 },
      { type: 'wall_shatter', tileX: 8, tileY: 8, x: 136, y: 136, color: '#7a4b2a' },
      { type: 'explosion', x: 160, y: 110, radius: 56, element: 'explosive', intensity: 1.1 },
      { type: 'player_hit', x: 100, y: 100, damage: 15 },
      { type: 'player_death', x: 100, y: 100 },
      { type: 'ability_trigger', outcastId: 'britta', x: 100, y: 100, angle: 0 },
      { type: 'power_trigger', outcastId: 'stellan', x: 100, y: 100 },
      { type: 'pickup_collect', kind: 'gold', x: 110, y: 100, label: '+20G' },
      { type: 'level_up', level: 2, x: 100, y: 100 },
      { type: 'boss_spawn', bossId: 'krunked', name: 'KRUNKED', x: 200, y: 120 },
      { type: 'boss_phase2', bossId: 'krunked', name: 'CORRUPTED KRUNKED', x: 200, y: 120 },
      { type: 'boss_defeated', bossId: 'krunked', name: 'CORRUPTED KRUNKED', x: 200, y: 120 },
      { type: 'portal_open', x: 300, y: 120 },
      { type: 'freeze_warning', intensity: 0.4 },
      { type: 'freeze_crystal_spawn', x: 240, y: 180 },
      { type: 'floating_text', x: 100, y: 90, text: 'CRIT!', color: '#ffd700', scale: 1.2 },
      { type: 'shell_eject', x: 100, y: 100, vx: -1, vy: -2, kind: 1 },
      { type: 'footstep', x: 100, y: 100, biomeId: 'canyon' },
      { type: 'loki_comment', text: 'KEEP MOVING, MORTAL!' },
      { type: 'music_change', trackKey: 'music_canyon', stem: 'a', ambienceKey: 'ambience_desert' },
      { type: 'screen_shake', trauma: 0.4, dirX: 1, dirY: 0 },
      { type: 'hitstop', ticks: 3 },
    ];

    expect(() => engine.handleEvents(allEvents, 100)).not.toThrow();
    engine.dispose();
  });

  it('validates Built-In Pack manifest completeness across all 293+ logical sprite keys, sounds, music, and bitmap font', () => {
    const pack = buildBuiltinPackPages();
    const manifest = getBuiltinPackManifest();

    expect(manifest).toBe(pack.manifest);
    expect(manifest.packType).toBe('builtin');
    expect(manifest.logicalWidth).toBe(LOGICAL_WIDTH);
    expect(manifest.logicalHeight).toBe(LOGICAL_HEIGHT);
    expect(manifest.pageCount).toBe(pack.pages.length);
    expect(pack.pages.length).toBeGreaterThan(0);

    // Every packed RGBA page has exact width*height*4 bytes and non-transparent art
    for (const page of pack.pages) {
      expect(page.width).toBeGreaterThan(0);
      expect(page.height).toBeGreaterThan(0);
      expect(page.rgba.byteLength).toBe(page.width * page.height * 4);
      let nonZeroAlpha = 0;
      for (let i = 3; i < page.rgba.length; i += 4) {
        if (page.rgba[i] > 0) {
          nonZeroAlpha++;
          if (nonZeroAlpha > 64) break;
        }
      }
      expect(nonZeroAlpha).toBeGreaterThan(64);
    }

    const keys = collectAllLogicalAssetKeys();
    expect(keys.sprites.length).toBeGreaterThanOrEqual(293);

    // Every single logical sprite key resolves cleanly with valid positive dimensions & in-bounds frames
    for (const key of keys.sprites) {
      const resolved = manifest.logicalAliases[key] ?? key;
      const meta = manifest.sprites[resolved] ?? manifest.sprites[key];
      expect(meta, `Built-In Pack missing sprite for logical key: ${key}`).toBeDefined();
      expect(meta.width).toBeGreaterThan(0);
      expect(meta.height).toBeGreaterThan(0);
      expect(meta.frames.length).toBeGreaterThan(0);

      for (const frame of meta.frames) {
        const page = pack.pages[frame.page];
        expect(page, `Sprite ${key} references out-of-range page ${frame.page}`).toBeDefined();
        expect(frame.srcW).toBeGreaterThan(0);
        expect(frame.srcH).toBeGreaterThan(0);
        expect(frame.srcX).toBeGreaterThanOrEqual(0);
        expect(frame.srcY).toBeGreaterThanOrEqual(0);
        expect(frame.srcX + frame.srcW).toBeLessThanOrEqual(page.width);
        expect(frame.srcY + frame.srcH).toBeLessThanOrEqual(page.height);
      }
    }

    // Every logical music & sound key resolves cleanly in Built-In manifest
    for (const mk of keys.music) {
      const resolved = manifest.logicalAliases[mk] ?? mk;
      expect(manifest.music[resolved] ?? manifest.music[mk], `Missing music key: ${mk}`).toBeDefined();
    }
    for (const sk of keys.sounds) {
      const resolved = manifest.logicalAliases[sk] ?? sk;
      expect(manifest.sounds[resolved] ?? manifest.sounds[sk], `Missing sound key: ${sk}`).toBeDefined();
    }

    // Built-In bitmap font atlas
    const font = getBuiltinFontAtlas();
    expect(font.width).toBeGreaterThan(0);
    expect(font.height).toBeGreaterThan(0);
    expect(font.rgba.byteLength).toBe(font.width * font.height * 4);
    expect(measurePixelText('KRUNKEDFALL', 1).width).toBeGreaterThan(40);
    expect(measurePixelText('KRUNKEDFALL', 2).height).toBeGreaterThan(10);
  });
});
