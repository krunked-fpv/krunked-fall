// ============================================================================
// KRUNKEDFALL — Audio Subsystem Public Exports
// ============================================================================

export {
  AudioEngine,
  DEFAULT_AUDIO_SETTINGS,
  type AudioUrlResolver,
} from './audioEngine.js';

export {
  SynthMusicEngine,
  MUSIC_CROSSFADE_SEC,
  resolveSynthTheme,
  type MusicStem,
} from './synthMusic.js';

export {
  SynthSfxEngine,
  type SfxPlayOptions,
  type UiSoundKind,
} from './synthSfx.js';
