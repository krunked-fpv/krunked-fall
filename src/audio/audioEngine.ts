// ============================================================================
// KRUNKEDFALL — Master Web Audio Engine (Dual-Pack Custom + Built-In Synth)
// ============================================================================
// Manages lazy Web Audio unlock, GainNode bus hierarchy + DynamicsCompressor
// limiter, 24-voice polyphony cap, 25–45ms per-key micro-cooldowns, +/-6–12%
// pitch jitter, stereo panning + distance attenuation, Intro -> A -> B -> Outro
// 350ms crossfade music state machine, and Custom Pack .ogg/.wav playback with
// zero-stutter automatic fallback to Built-In Krunked Synth.

import type {
  AssetPackMode,
  AudioSettings,
  SimEvent,
} from '../contracts/index.js';
import {
  MUSIC_CROSSFADE_SEC,
  SynthMusicEngine,
  type MusicStem,
} from './synthMusic.js';
import { SynthSfxEngine, type UiSoundKind } from './synthSfx.js';

export type AudioUrlResolver = (key: string, kind: 'sfx' | 'music') => string | null;

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  masterVolume: 0.85,
  musicVolume: 0.7,
  sfxVolume: 0.85,
  muted: false,
};

const MAX_SFX_VOICES = 24;
const MAX_SFX_CACHE_ENTRIES = 160;
const MAX_MUSIC_CACHE_ENTRIES = 24;
const PAN_HALF_WIDTH_PX = 320;
const ATTEN_NEAR_PX = 120;
const ATTEN_FALLOFF_PX = 260;
const FAR_CULL_PX = 1100;

interface ActiveSfxVoice {
  id: number;
  key: string;
  priority: number;
  endsAtMs: number;
  stop: () => void;
}

interface CustomBufferDeck {
  source: AudioBufferSourceNode;
  gain: GainNode;
  key: string;
  stem: MusicStem;
}

type AudioContextCtor = new () => AudioContext;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getAudioContextConstructor(): AudioContextCtor | null {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const STEM_SUFFIX_RE = /^(.*)_(intro|a|b|outro)$/i;

function parseTrackAndStem(
  rawTrackKey: string,
  explicitStem?: MusicStem
): {
  trackKey: string;
  baseKey: string;
  stem: MusicStem;
  hadSuffix: boolean;
} {
  const trimmed = rawTrackKey.trim();
  const match = STEM_SUFFIX_RE.exec(trimmed);
  if (match) {
    const suffixStem = match[2].toLowerCase() as MusicStem;
    return {
      trackKey: trimmed,
      baseKey: match[1],
      stem: explicitStem ?? suffixStem,
      hadSuffix: true,
    };
  }
  return {
    trackKey: trimmed,
    baseKey: trimmed,
    stem: explicitStem ?? 'a',
    hadSuffix: false,
  };
}

export class AudioEngine {
  private settings: AudioSettings;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;

  private readonly synthSfx = new SynthSfxEngine();
  private readonly synthMusic = new SynthMusicEngine();

  private packMode: AssetPackMode = 'builtin';
  private resolveAudioUrl: AudioUrlResolver | null = null;

  // Dynamic Music State Machine
  private activeTrackKey = '';
  private activeBaseKey = '';
  private activeStem: MusicStem = 'a';
  private activeTrackHadSuffix = false;
  private activeAmbienceKey = '';
  private musicTransitionToken = 0;
  private ambienceTransitionToken = 0;

  private customMusicDeck: CustomBufferDeck | null = null;
  private customAmbienceDeck: CustomBufferDeck | null = null;

  // Decoded buffer caches (URL -> AudioBuffer | null when failed)
  private readonly sfxBufferCache = new Map<string, AudioBuffer | null>();
  private readonly musicBufferCache = new Map<string, AudioBuffer | null>();
  private readonly inflightBuffers = new Map<string, Promise<AudioBuffer | null>>();

  // SFX Polyphony, Cooldowns & Deterministic Pitch Jitter PRNG
  private readonly activeVoices: ActiveSfxVoice[] = [];
  private readonly cooldownsMs = new Map<string, number>();
  private nextVoiceId = 1;
  private jitterState = 0x9e3779b9;
  private disposed = false;

  constructor(initialSettings?: Partial<AudioSettings>) {
    this.settings = {
      masterVolume: clamp(initialSettings?.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume, 0, 1),
      musicVolume: clamp(initialSettings?.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume, 0, 1),
      sfxVolume: clamp(initialSettings?.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume, 0, 1),
      muted: Boolean(initialSettings?.muted ?? DEFAULT_AUDIO_SETTINGS.muted),
    };

    this.synthMusic.setStemAdvanceCallback((_trackKey, nextStem) => {
      if (this.disposed) return;
      this.activeStem = nextStem;
      if (this.activeTrackHadSuffix && this.activeBaseKey) {
        this.activeTrackKey = `${this.activeBaseKey}_${nextStem}`;
      }
    });
  }

  /**
   * Lazily initializes and resumes the Web Audio API context on first user gesture.
   * Safe no-op in headless environments where AudioContext is unavailable.
   */
  public unlock(): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        const res = ctx.resume();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Autoplay restriction still pending next gesture
          });
        }
      } catch {
        // Ignore resume errors in restricted environments
      }
    }

    // Start any music/ambience requested prior to unlock (idempotent across repeated gestures)
    if (this.activeTrackKey && !this.customMusicDeck && !this.synthMusic.isPlaying()) {
      this.startActiveMusic(0.15);
    }
    if (this.activeAmbienceKey && !this.customAmbienceDeck && !this.synthMusic.hasAmbience()) {
      this.startActiveAmbience(0.2);
    }
  }

  public applySettings(settings: AudioSettings): void {
    this.settings = {
      masterVolume: clamp(settings.masterVolume, 0, 1),
      musicVolume: clamp(settings.musicVolume, 0, 1),
      sfxVolume: clamp(settings.sfxVolume, 0, 1),
      muted: Boolean(settings.muted),
    };
    this.syncBusGains();
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * Switch live between Built-In Krunked Synth and Custom Pack (.ogg / .wav) audio.
   */
  public setPackSource(mode: AssetPackMode, resolveAudioUrl?: AudioUrlResolver): void {
    if (this.disposed) return;
    const nextResolver = resolveAudioUrl ?? null;
    const changed = this.packMode !== mode || this.resolveAudioUrl !== nextResolver;
    this.packMode = mode;
    this.resolveAudioUrl = nextResolver;

    if (!changed) return;

    // Clear URL caches when switching source so fresh Blob/dev URLs take effect immediately
    this.sfxBufferCache.clear();
    this.musicBufferCache.clear();
    this.inflightBuffers.clear();

    // Smoothly re-route active music & ambience across the pack boundary
    if (this.ctx) {
      if (this.activeTrackKey) {
        this.startActiveMusic(MUSIC_CROSSFADE_SEC);
      }
      if (this.activeAmbienceKey) {
        this.startActiveAmbience(MUSIC_CROSSFADE_SEC);
      }
    }
  }

  /**
   * Transition the dynamic soundtrack state machine (Intro -> Loop A -> Loop B -> Outro)
   * with a smooth 350ms crossfade and optional biome ambience bed.
   */
  public setMusic(
    trackKey: string,
    stem?: MusicStem,
    ambienceKey?: string
  ): void {
    if (this.disposed) return;

    const trimmed = trackKey.trim();
    if (!trimmed) {
      this.activeTrackKey = '';
      this.activeBaseKey = '';
      this.activeStem = 'a';
      this.activeTrackHadSuffix = false;
      this.musicTransitionToken++;
      this.stopCustomMusicDeck(MUSIC_CROSSFADE_SEC);
      this.synthMusic.stop(MUSIC_CROSSFADE_SEC);
      if (ambienceKey !== undefined) {
        this.updateAmbience(ambienceKey);
      }
      return;
    }

    const parsed = parseTrackAndStem(trimmed, stem);
    const sameTrack =
      this.activeBaseKey === parsed.baseKey &&
      this.activeStem === parsed.stem &&
      this.activeTrackKey !== '';

    this.activeTrackKey = parsed.trackKey;
    this.activeBaseKey = parsed.baseKey;
    this.activeStem = parsed.stem;
    this.activeTrackHadSuffix = parsed.hadSuffix;

    if (ambienceKey !== undefined) {
      this.updateAmbience(ambienceKey);
    }

    if (sameTrack) {
      return;
    }

    if (this.ctx) {
      this.startActiveMusic(MUSIC_CROSSFADE_SEC);
    }
  }

  public getActiveTrack(): { trackKey: string; stem: string } {
    return {
      trackKey: this.activeTrackKey,
      stem: this.activeStem,
    };
  }

  /**
   * Consume a simulation tick's SimEvent[] batch and dispatch spatialized SFX
   * and dynamic music transitions. Safe no-op in headless environments.
   */
  public handleEvents(events: readonly SimEvent[], listenerX: number): void {
    if (this.disposed || events.length === 0) return;

    const hasExplicitMusicChange = events.some((ev) => ev.type === 'music_change');

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      switch (ev.type) {
        case 'music_change':
          this.setMusic(ev.trackKey, ev.stem, ev.ambienceKey);
          break;

        case 'weapon_fire': {
          const cdKey = `fire:${ev.soundKey ?? ev.ammoType}`;
          if (!this.checkCooldown(cdKey, 35)) break;
          const basePitch = clamp(ev.pitch || 1, 0.45, 2.1);
          const jitteredPitch = basePitch * this.nextPitchMult(0.09);
          const candidates: string[] = [];
          if (ev.soundKey) candidates.push(ev.soundKey);
          candidates.push(`sfx_wep_${ev.weaponUniqueId}_fire`);
          this.dispatchSfx({
            key: cdKey,
            customKeys: candidates,
            priority: 2,
            eventX: ev.x,
            listenerX,
            volume: clamp(ev.volume || 1, 0.1, 1.5),
            pitch: jitteredPitch,
            synth: (dest, vol, pitch) =>
              this.synthSfx.playWeaponFire(dest, ev.ammoType, {
                volume: vol,
                pitch,
                seed: ev.weaponUniqueId,
              }),
          });
          break;
        }

        case 'melee_slash': {
          if (!this.checkCooldown('melee_slash', 40)) break;
          this.dispatchSfx({
            key: 'melee_slash',
            customKeys: ['sfx_melee_slash'],
            priority: 2,
            eventX: ev.x,
            listenerX,
            volume: 0.9,
            pitch: this.nextPitchMult(0.1),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playMeleeSlash(dest, { volume: vol, pitch }),
          });
          break;
        }

        case 'projectile_hit': {
          const cdKey = ev.isWall ? 'proj_hit_wall' : 'proj_hit_body';
          if (!this.checkCooldown(cdKey, 30)) break;
          this.dispatchSfx({
            key: cdKey,
            customKeys: [ev.isWall ? 'sfx_hit_wall' : 'sfx_hit_body'],
            priority: 1,
            eventX: ev.x,
            listenerX,
            volume: ev.isWall ? 0.58 : 0.45,
            pitch: this.nextPitchMult(0.12),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playProjectileHit(dest, ev.isWall, { volume: vol, pitch }),
          });
          break;
        }

        case 'enemy_hit': {
          const cdKey = ev.isCrit ? 'enemy_hit_crit' : 'enemy_hit';
          if (!this.checkCooldown(cdKey, 30)) break;
          this.dispatchSfx({
            key: cdKey,
            customKeys: [ev.isCrit ? 'sfx_enemy_crit' : 'sfx_enemy_hit'],
            priority: ev.isCrit ? 2 : 1,
            eventX: ev.x,
            listenerX,
            volume: ev.isCrit ? 0.9 : 0.72,
            pitch: this.nextPitchMult(0.1),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playEnemyHit(dest, ev.isCrit, ev.element, { volume: vol, pitch }),
          });
          break;
        }

        case 'enemy_death': {
          const cdKey = ev.overkill ? 'enemy_death_overkill' : 'enemy_death';
          if (!ev.isBoss && !this.checkCooldown(cdKey, 25)) break;
          this.dispatchSfx({
            key: cdKey,
            customKeys: [
              ev.isBoss
                ? 'sfx_boss_defeated'
                : ev.overkill
                  ? 'sfx_enemy_overkill'
                  : 'sfx_enemy_death',
            ],
            priority: ev.isBoss ? 5 : ev.overkill ? 3 : 2,
            eventX: ev.x,
            listenerX,
            volume: ev.isBoss ? 1.15 : ev.overkill ? 0.95 : 0.8,
            pitch: this.nextPitchMult(0.11),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playEnemyDeath(dest, ev.overkill, ev.isBoss, { volume: vol, pitch }),
          });
          break;
        }

        case 'wall_crack': {
          if (!this.checkCooldown('wall_crack', 40)) break;
          this.dispatchSfx({
            key: 'wall_crack',
            customKeys: ['sfx_wall_crack'],
            priority: 2,
            eventX: ev.x,
            listenerX,
            volume: 0.82,
            pitch: this.nextPitchMult(0.1),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playWallCrack(dest, ev.ratio, { volume: vol, pitch }),
          });
          break;
        }

        case 'wall_shatter': {
          if (!this.checkCooldown('wall_shatter', 35)) break;
          this.dispatchSfx({
            key: 'wall_shatter',
            customKeys: ['sfx_wall_shatter'],
            priority: 3,
            eventX: ev.x,
            listenerX,
            volume: 1.0,
            pitch: this.nextPitchMult(0.09),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playWallShatter(dest, { volume: vol, pitch }),
          });
          break;
        }

        case 'explosion': {
          if (!this.checkCooldown('explosion', 25)) break;
          this.dispatchSfx({
            key: 'explosion',
            customKeys: ['sfx_explosion'],
            priority: 4,
            eventX: ev.x,
            listenerX,
            volume: clamp(0.85 + ev.intensity * 0.25, 0.7, 1.3),
            pitch: this.nextPitchMult(0.1),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playExplosion(dest, ev.radius, ev.element, ev.intensity, {
                volume: vol,
                pitch,
              }),
          });
          break;
        }

        case 'player_hit': {
          if (!this.checkCooldown('player_hit', 35)) break;
          this.dispatchSfx({
            key: 'player_hit',
            customKeys: ['sfx_player_hit'],
            priority: 4,
            eventX: listenerX,
            listenerX,
            volume: 1.0,
            pitch: this.nextPitchMult(0.07),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playPlayerHit(dest, ev.damage, { volume: vol, pitch }),
          });
          break;
        }

        case 'player_death': {
          this.dispatchSfx({
            key: 'player_death',
            customKeys: ['sfx_player_death'],
            priority: 5,
            eventX: listenerX,
            listenerX,
            volume: 1.05,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playPlayerDeath(dest, { volume: vol }),
          });
          break;
        }

        case 'ability_trigger': {
          this.dispatchSfx({
            key: `ability:${ev.outcastId}`,
            customKeys: [`sfx_ability_${ev.outcastId}`, 'sfx_ability'],
            priority: 3,
            eventX: ev.x,
            listenerX,
            volume: 0.95,
            pitch: this.nextPitchMult(0.07),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playAbility(dest, ev.outcastId, { volume: vol, pitch }),
          });
          break;
        }

        case 'power_trigger': {
          this.dispatchSfx({
            key: `power:${ev.outcastId}`,
            customKeys: [`sfx_power_${ev.outcastId}`, 'sfx_power'],
            priority: 5,
            eventX: listenerX,
            listenerX,
            volume: 1.05,
            pitch: this.nextPitchMult(0.06),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playPower(dest, ev.outcastId, { volume: vol, pitch }),
          });
          break;
        }

        case 'pickup_collect': {
          const cdKey = `pickup:${ev.kind}`;
          if (!this.checkCooldown(cdKey, 30)) break;
          this.dispatchSfx({
            key: cdKey,
            customKeys: [`sfx_pickup_${ev.kind}`, 'sfx_pickup'],
            priority: 2,
            eventX: ev.x,
            listenerX,
            volume: 0.82,
            pitch: this.nextPitchMult(0.07),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playPickup(dest, ev.kind, { volume: vol, pitch }),
          });
          break;
        }

        case 'level_up': {
          this.dispatchSfx({
            key: 'level_up',
            customKeys: ['sfx_level_up'],
            priority: 5,
            eventX: listenerX,
            listenerX,
            volume: 1.05,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playLevelUp(dest, { volume: vol }),
          });
          break;
        }

        case 'boss_spawn': {
          this.dispatchSfx({
            key: 'boss_spawn',
            customKeys: [`sfx_boss_${ev.bossId}_spawn`, 'sfx_boss_spawn'],
            priority: 5,
            eventX: ev.x,
            listenerX,
            volume: 1.08,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playBossSpawn(dest, { volume: vol }),
          });
          break;
        }

        case 'boss_phase2': {
          this.dispatchSfx({
            key: 'boss_phase2',
            customKeys: [`sfx_boss_${ev.bossId}_phase2`, 'sfx_boss_phase2'],
            priority: 5,
            eventX: ev.x,
            listenerX,
            volume: 1.12,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playBossPhase2(dest, { volume: vol }),
          });
          if (!hasExplicitMusicChange) {
            this.setMusic(`music_${ev.bossId}`, 'b');
          }
          break;
        }

        case 'boss_defeated': {
          this.dispatchSfx({
            key: 'boss_defeated',
            customKeys: [`sfx_boss_${ev.bossId}_defeated`, 'sfx_boss_defeated'],
            priority: 5,
            eventX: ev.x,
            listenerX,
            volume: 1.15,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playBossDefeated(dest, { volume: vol }),
          });
          if (!hasExplicitMusicChange && this.activeBaseKey.includes(ev.bossId)) {
            this.setMusic(`music_${ev.bossId}`, 'outro');
          }
          break;
        }

        case 'portal_open': {
          this.dispatchSfx({
            key: 'portal_open',
            customKeys: ['sfx_portal_open'],
            priority: 4,
            eventX: ev.x,
            listenerX,
            volume: 0.95,
            pitch: 1.0,
            synth: (dest, vol) => this.synthSfx.playPortalOpen(dest, { volume: vol }),
          });
          break;
        }

        case 'freeze_warning': {
          if (!this.checkCooldown('freeze_warning', 45)) break;
          this.dispatchSfx({
            key: 'freeze_warning',
            customKeys: ['sfx_freeze_warning'],
            priority: 3,
            eventX: listenerX,
            listenerX,
            volume: 0.85,
            pitch: this.nextPitchMult(0.08),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playFreezeWarning(dest, ev.intensity, { volume: vol, pitch }),
          });
          break;
        }

        case 'freeze_crystal_spawn': {
          if (!this.checkCooldown('freeze_crystal', 40)) break;
          this.dispatchSfx({
            key: 'freeze_crystal',
            customKeys: ['sfx_freeze_crystal'],
            priority: 2,
            eventX: ev.x,
            listenerX,
            volume: 0.8,
            pitch: this.nextPitchMult(0.1),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playFreezeCrystal(dest, { volume: vol, pitch }),
          });
          break;
        }

        case 'shell_eject': {
          if (!this.checkCooldown('shell_eject', 45)) break;
          this.dispatchSfx({
            key: 'shell_eject',
            customKeys: ['sfx_shell_eject'],
            priority: 0,
            eventX: ev.x,
            listenerX,
            volume: 0.3,
            pitch: this.nextPitchMult(0.12),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playShellEject(dest, { volume: vol, pitch }),
          });
          break;
        }

        case 'footstep': {
          if (!this.checkCooldown('footstep', 45)) break;
          this.dispatchSfx({
            key: 'footstep',
            customKeys: ['sfx_footstep'],
            priority: 0,
            eventX: ev.x,
            listenerX,
            volume: 0.25,
            pitch: this.nextPitchMult(0.11),
            synth: (dest, vol, pitch) =>
              this.synthSfx.playFootstep(dest, ev.biomeId, { volume: vol, pitch }),
          });
          break;
        }

        case 'floating_text':
        case 'loki_comment':
        case 'screen_shake':
        case 'hitstop':
          // Non-audio visual/feedback events
          break;

        default: {
          const _exhaustive: never = ev;
          void _exhaustive;
          break;
        }
      }
    }
  }

  public playUi(kind: UiSoundKind): void {
    if (this.disposed) return;
    if (kind === 'hover') {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (!this.checkCooldown('ui_hover', 55)) return;
    }
    if (kind === 'click' && !this.checkCooldown('ui_click', 25)) return;

    const pitch = kind === 'levelup' ? 1.0 : this.nextPitchMult(0.06);
    this.dispatchSfx({
      key: `ui:${kind}`,
      customKeys: [`sfx_ui_${kind}`],
      priority: kind === 'levelup' ? 5 : 3,
      eventX: 0,
      listenerX: 0,
      volume: kind === 'hover' ? 0.55 : 0.85,
      pitch,
      synth: (dest, vol, p) => this.synthSfx.playUi(dest, kind, { volume: vol, pitch: p }),
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.musicTransitionToken++;
    this.ambienceTransitionToken++;

    for (let i = 0; i < this.activeVoices.length; i++) {
      try {
        this.activeVoices[i].stop();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.activeVoices.length = 0;
    this.cooldownsMs.clear();

    this.stopCustomMusicDeck(0.01);
    this.stopCustomAmbienceDeck(0.01);
    this.synthMusic.dispose();
    this.synthSfx.dispose();

    this.sfxBufferCache.clear();
    this.musicBufferCache.clear();
    this.inflightBuffers.clear();

    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      this.masterGain = null;
      this.limiter = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.ambienceBus = null;
      try {
        const res = ctx.close();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Ignore close errors
          });
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  // ==========================================================================
  // INTERNAL WEB AUDIO GRAPH & BUS MANAGEMENT
  // ==========================================================================

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;

    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;

    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }

    const masterGain = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-10, ctx.currentTime);
    limiter.knee.setValueAtTime(12, ctx.currentTime);
    limiter.ratio.setValueAtTime(8, ctx.currentTime);
    limiter.attack.setValueAtTime(0.003, ctx.currentTime);
    limiter.release.setValueAtTime(0.12, ctx.currentTime);

    const musicBus = ctx.createGain();
    const sfxBus = ctx.createGain();
    const ambienceBus = ctx.createGain();

    // Clean bus hierarchy with protective limiter before master output
    musicBus.connect(limiter);
    sfxBus.connect(limiter);
    ambienceBus.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.limiter = limiter;
    this.musicBus = musicBus;
    this.sfxBus = sfxBus;
    this.ambienceBus = ambienceBus;

    this.synthSfx.bindContext(ctx);
    this.synthMusic.bindContext(ctx, musicBus, ambienceBus);
    this.syncBusGains(true);

    return ctx;
  }

  private syncBusGains(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain || !this.musicBus || !this.sfxBus || !this.ambienceBus) {
      return;
    }
    const now = ctx.currentTime;
    const masterTarget = this.settings.muted ? 0 : this.settings.masterVolume;
    const musicTarget = this.settings.musicVolume;
    const sfxTarget = this.settings.sfxVolume;
    const ambTarget = this.settings.musicVolume * 0.45;

    if (immediate) {
      this.masterGain.gain.setValueAtTime(masterTarget, now);
      this.musicBus.gain.setValueAtTime(musicTarget, now);
      this.sfxBus.gain.setValueAtTime(sfxTarget, now);
      this.ambienceBus.gain.setValueAtTime(ambTarget, now);
    } else {
      const tc = 0.015;
      this.masterGain.gain.setTargetAtTime(masterTarget, now, tc);
      this.musicBus.gain.setTargetAtTime(musicTarget, now, tc);
      this.sfxBus.gain.setTargetAtTime(sfxTarget, now, tc);
      this.ambienceBus.gain.setTargetAtTime(ambTarget, now, tc);
    }
  }

  // ==========================================================================
  // SFX DISPATCH, POLYPHONY CAP, COOLDOWNS & SPATIALIZATION
  // ==========================================================================

  private checkCooldown(key: string, cooldownMs: number): boolean {
    const t = nowMs();
    const prev = this.cooldownsMs.get(key);
    if (prev !== undefined && t - prev < cooldownMs) {
      return false;
    }
    this.cooldownsMs.set(key, t);
    return true;
  }

  /** Deterministic jitter multiplier in [1 - range, 1 + range] (e.g. +/- 6–12%). */
  private nextPitchMult(range: number): number {
    let s = this.jitterState;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.jitterState = s >>> 0;
    const unit = ((s >>> 0) / 0xffffffff) * 2 - 1; // [-1, 1]
    return 1 + unit * range;
  }

  private pruneAndReserveVoiceSlot(priority: number): boolean {
    const t = nowMs();
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      if (t >= this.activeVoices[i].endsAtMs) {
        this.activeVoices.splice(i, 1);
      }
    }

    if (this.activeVoices.length < MAX_SFX_VOICES) {
      return true;
    }

    // Find oldest lowest-priority voice to steal
    let victimIndex = -1;
    let lowestPrio = priority;
    for (let i = 0; i < this.activeVoices.length; i++) {
      const v = this.activeVoices[i];
      if (v.priority < lowestPrio || (priority >= 3 && v.priority <= lowestPrio && victimIndex === -1)) {
        lowestPrio = v.priority;
        victimIndex = i;
      }
    }

    if (victimIndex === -1) {
      return false;
    }

    const [victim] = this.activeVoices.splice(victimIndex, 1);
    try {
      victim.stop();
    } catch {
      // Already stopped
    }
    return true;
  }

  private dispatchSfx(params: {
    key: string;
    customKeys: string[];
    priority: number;
    eventX: number;
    listenerX: number;
    volume: number;
    pitch: number;
    synth: (dest: AudioNode, volume: number, pitch: number) => number;
  }): void {
    const ctx = this.ctx;
    const sfxBus = this.sfxBus;
    if (!ctx || !sfxBus) return;
    if (ctx.state === 'suspended') return;

    const dx = params.eventX - params.listenerX;
    const absDx = Math.abs(dx);
    if (absDx > FAR_CULL_PX && params.priority <= 1) {
      return;
    }

    const attenuation =
      absDx <= ATTEN_NEAR_PX
        ? 1.0
        : clamp(1 / (1 + Math.pow((absDx - ATTEN_NEAR_PX) / ATTEN_FALLOFF_PX, 1.35)), 0.1, 1.0);
    const panValue = clamp(dx / PAN_HALF_WIDTH_PX, -0.85, 0.85);

    if (!this.pruneAndReserveVoiceSlot(params.priority)) {
      return;
    }

    // Build per-voice gain + StereoPannerNode
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(attenuation, ctx.currentTime);

    let outputNode: AudioNode = voiceGain;
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(panValue, ctx.currentTime);
      voiceGain.connect(panner);
      panner.connect(sfxBus);
    } else {
      voiceGain.connect(sfxBus);
    }

    const voiceId = this.nextVoiceId++;
    let bufferSrc: AudioBufferSourceNode | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let cleaned = false;

    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      try {
        if (bufferSrc) {
          bufferSrc.onended = null;
          bufferSrc.stop();
          bufferSrc.disconnect();
        }
      } catch {
        // Ignore already-stopped source
      }
      try {
        voiceGain.gain.cancelScheduledValues(ctx.currentTime);
        voiceGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        voiceGain.disconnect();
        if (panner) panner.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      const idx = this.activeVoices.findIndex((v) => v.id === voiceId);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
    };

    // Attempt Custom Pack WAV buffer first when in Custom Pack mode
    const customBuffer = this.tryGetCustomSfxBuffer(params.customKeys);
    let durationSec = 0.2;

    if (customBuffer) {
      bufferSrc = ctx.createBufferSource();
      bufferSrc.buffer = customBuffer;
      bufferSrc.playbackRate.setValueAtTime(clamp(params.pitch, 0.4, 2.5), ctx.currentTime);
      voiceGain.gain.setValueAtTime(attenuation * clamp(params.volume, 0.05, 1.6), ctx.currentTime);
      bufferSrc.connect(voiceGain);
      bufferSrc.onended = cleanup;
      bufferSrc.start(ctx.currentTime);
      durationSec = customBuffer.duration / Math.max(0.4, params.pitch);
    } else {
      durationSec = params.synth(outputNode, params.volume, params.pitch);
      // Schedule node cleanup once synth voice finishes
      const cleanupDelayMs = Math.max(80, Math.ceil((durationSec + 0.06) * 1000));
      cleanupTimer = setTimeout(cleanup, cleanupDelayMs);
    }

    this.activeVoices.push({
      id: voiceId,
      key: params.key,
      priority: params.priority,
      endsAtMs: nowMs() + Math.max(60, Math.ceil(durationSec * 1000)),
      stop: cleanup,
    });
  }

  private tryGetCustomSfxBuffer(keys: string[]): AudioBuffer | null {
    if (this.packMode !== 'custom' || !this.resolveAudioUrl || !this.ctx) {
      return null;
    }

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k) continue;
      const url = this.resolveAudioUrl(k, 'sfx');
      if (!url) continue;

      if (this.sfxBufferCache.has(url)) {
        const cached = this.sfxBufferCache.get(url);
        if (cached) return cached;
        continue; // Failed decode previously -> try next candidate or synth fallback
      }

      // Kick off warm-cache decode in background; return null for immediate synth fallback
      void this.fetchAndDecodeBuffer(url, 'sfx');
      return null;
    }
    return null;
  }

  // ==========================================================================
  // DYNAMIC MUSIC & AMBIENCE STATE MACHINE (CUSTOM PACK + SYNTH FALLBACK)
  // ==========================================================================

  private resolveCustomMusicUrl(baseKey: string, fullKey: string, stem: MusicStem): string | null {
    if (this.packMode !== 'custom' || !this.resolveAudioUrl) return null;
    const candidates = [
      `${baseKey}_${stem}`,
      fullKey,
      baseKey,
    ];
    for (let i = 0; i < candidates.length; i++) {
      const k = candidates[i];
      if (!k) continue;
      const url = this.resolveAudioUrl(k, 'music');
      if (url) return url;
    }
    return null;
  }

  private startActiveMusic(crossfadeSec: number): void {
    const ctx = this.ctx;
    const musicBus = this.musicBus;
    if (!ctx || !musicBus || !this.activeBaseKey) return;

    const token = ++this.musicTransitionToken;
    const baseKey = this.activeBaseKey;
    const fullKey = this.activeTrackKey;
    const stem = this.activeStem;

    const customUrl = this.resolveCustomMusicUrl(baseKey, fullKey, stem);
    if (!customUrl) {
      this.stopCustomMusicDeck(crossfadeSec);
      this.synthMusic.play(baseKey, stem, crossfadeSec);
      return;
    }

    // If buffer is already decoded in cache, crossfade directly!
    if (this.musicBufferCache.has(customUrl)) {
      const buf = this.musicBufferCache.get(customUrl);
      if (buf) {
        this.playCustomMusicBuffer(buf, baseKey, stem, crossfadeSec, token);
      } else {
        this.stopCustomMusicDeck(crossfadeSec);
        this.synthMusic.play(baseKey, stem, crossfadeSec);
      }
      return;
    }

    // Start Built-In Synth immediately so there is zero silence during async fetch,
    // then crossfade smoothly into the Custom Pack .ogg once decoded!
    this.synthMusic.play(baseKey, stem, crossfadeSec);

    void this.fetchAndDecodeBuffer(customUrl, 'music').then((buf) => {
      if (this.disposed || token !== this.musicTransitionToken || this.packMode !== 'custom') {
        return;
      }
      if (!buf || !this.ctx || !this.musicBus) {
        return; // Keep Built-In Synth running seamlessly
      }
      this.playCustomMusicBuffer(buf, baseKey, stem, crossfadeSec, token);
    });
  }

  private playCustomMusicBuffer(
    buffer: AudioBuffer,
    baseKey: string,
    stem: MusicStem,
    crossfadeSec: number,
    token: number
  ): void {
    const ctx = this.ctx;
    const musicBus = this.musicBus;
    if (!ctx || !musicBus) return;

    const now = ctx.currentTime;
    this.synthMusic.stop(crossfadeSec);
    this.stopCustomMusicDeck(crossfadeSec);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = stem === 'a' || stem === 'b';

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1.0, now + Math.max(0.02, crossfadeSec));

    src.connect(gain);
    gain.connect(musicBus);
    src.start(now);

    const deck: CustomBufferDeck = { source: src, gain, key: baseKey, stem };
    this.customMusicDeck = deck;

    if (stem === 'intro') {
      // Pre-fetch Loop A immediately so Intro -> Loop A handoff is seamless!
      const nextUrl = this.resolveCustomMusicUrl(baseKey, `${baseKey}_a`, 'a');
      if (nextUrl && !this.musicBufferCache.has(nextUrl)) {
        void this.fetchAndDecodeBuffer(nextUrl, 'music');
      }

      src.onended = () => {
        if (this.disposed || token !== this.musicTransitionToken) return;
        if (this.customMusicDeck !== deck) return;
        this.activeStem = 'a';
        if (this.activeTrackHadSuffix) {
          this.activeTrackKey = `${baseKey}_a`;
        }
        this.startActiveMusic(0.08);
      };
    } else if (stem === 'outro') {
      src.onended = () => {
        if (this.customMusicDeck === deck) {
          this.customMusicDeck = null;
        }
      };
    }
  }

  private stopCustomMusicDeck(crossfadeSec: number): void {
    const deck = this.customMusicDeck;
    this.customMusicDeck = null;
    if (!deck || !this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      deck.source.onended = null;
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(Math.max(0.0001, deck.gain.gain.value), now);
      deck.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.02, crossfadeSec));
      deck.source.stop(now + crossfadeSec + 0.05);
    } catch {
      // Already stopped
    }
  }

  private updateAmbience(ambienceKey: string): void {
    const trimmed = ambienceKey.trim();
    if (this.activeAmbienceKey === trimmed) return;
    this.activeAmbienceKey = trimmed;
    if (this.ctx) {
      this.startActiveAmbience(MUSIC_CROSSFADE_SEC);
    }
  }

  private startActiveAmbience(crossfadeSec: number): void {
    const ctx = this.ctx;
    const ambBus = this.ambienceBus;
    if (!ctx || !ambBus) return;

    const token = ++this.ambienceTransitionToken;
    const key = this.activeAmbienceKey;
    if (!key) {
      this.stopCustomAmbienceDeck(crossfadeSec);
      this.synthMusic.stopAmbience(crossfadeSec);
      return;
    }

    const customUrl =
      this.packMode === 'custom' && this.resolveAudioUrl
        ? (this.resolveAudioUrl(key, 'music') ?? this.resolveAudioUrl(key, 'sfx'))
        : null;

    if (!customUrl) {
      this.stopCustomAmbienceDeck(crossfadeSec);
      this.synthMusic.setAmbience(key, crossfadeSec);
      return;
    }

    this.synthMusic.setAmbience(key, crossfadeSec);

    void this.fetchAndDecodeBuffer(customUrl, 'music').then((buf) => {
      if (this.disposed || token !== this.ambienceTransitionToken || this.packMode !== 'custom') {
        return;
      }
      if (!buf || !this.ctx || !this.ambienceBus) return;

      const now = this.ctx.currentTime;
      this.synthMusic.stopAmbience(crossfadeSec);
      this.stopCustomAmbienceDeck(crossfadeSec);

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1.0, now + Math.max(0.05, crossfadeSec));

      src.connect(gain);
      gain.connect(this.ambienceBus);
      src.start(now);

      this.customAmbienceDeck = { source: src, gain, key, stem: 'a' };
    });
  }

  private stopCustomAmbienceDeck(crossfadeSec: number): void {
    const deck = this.customAmbienceDeck;
    this.customAmbienceDeck = null;
    if (!deck || !this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      deck.gain.gain.cancelScheduledValues(now);
      deck.gain.gain.setValueAtTime(Math.max(0.0001, deck.gain.gain.value), now);
      deck.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.02, crossfadeSec));
      deck.source.stop(now + crossfadeSec + 0.05);
    } catch {
      // Ignore already-stopped source
    }
  }

  // ==========================================================================
  // ASYNC CUSTOM PACK AUDIO FETCH & DECODE WITH BOUNDED CACHE
  // ==========================================================================

  private fetchAndDecodeBuffer(
    url: string,
    kind: 'sfx' | 'music'
  ): Promise<AudioBuffer | null> {
    const cache = kind === 'sfx' ? this.sfxBufferCache : this.musicBufferCache;
    if (cache.has(url)) {
      return Promise.resolve(cache.get(url) ?? null);
    }

    const existing = this.inflightBuffers.get(url);
    if (existing) return existing;

    const ctx = this.ctx;
    if (!ctx || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          this.putCache(cache, url, null, kind);
          return null;
        }
        const arrayBuf = await response.arrayBuffer();
        if (this.disposed || !this.ctx) return null;
        const decoded = await this.ctx.decodeAudioData(arrayBuf.slice(0));
        this.putCache(cache, url, decoded, kind);
        return decoded;
      } catch {
        this.putCache(cache, url, null, kind);
        return null;
      } finally {
        this.inflightBuffers.delete(url);
      }
    })();

    this.inflightBuffers.set(url, promise);
    return promise;
  }

  private putCache(
    cache: Map<string, AudioBuffer | null>,
    url: string,
    buf: AudioBuffer | null,
    kind: 'sfx' | 'music'
  ): void {
    const maxEntries = kind === 'sfx' ? MAX_SFX_CACHE_ENTRIES : MAX_MUSIC_CACHE_ENTRIES;
    if (cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(url, buf);
  }
}
