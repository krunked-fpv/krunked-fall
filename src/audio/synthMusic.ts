// ============================================================================
// KRUNKEDFALL — Procedural Norse Industrial-Metal / Dark Synthwave Music Engine
// ============================================================================
// Sample-accurate Web Audio step-sequencer with Intro -> Loop A -> Loop B
// (Boss Phase 2 Overdrive) -> Outro state transitions, smooth 350ms crossfades,
// distinct biome/menu/hub/overworld/boss themes, and procedural ambience beds.

export type MusicStem = 'intro' | 'a' | 'b' | 'outro';

export const MUSIC_CROSSFADE_SEC = 0.35;

interface StepPattern {
  /** MIDI note numbers (0 or null = rest). Length = 16 steps (1 bar of 16ths). */
  bass: readonly (number | null)[];
  lead: readonly (number | null)[];
  arp: readonly (number | null)[];
  /** Kick velocity (0..1) per 16th step. */
  kick: readonly number[];
  /** Snare/anvil velocity (0..1) per 16th step. */
  snare: readonly number[];
  /** Hi-hat/metallic percussion velocity (0..1) per 16th step. */
  hat: readonly number[];
  /** Power chord root MIDI notes on accents (null = none). */
  chord?: readonly (number | null)[];
}

interface MusicThemeDef {
  id: string;
  bpmA: number;
  bpmB: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  arpWave: OscillatorType;
  distortBass: boolean;
  dissonantChords: boolean;
  filterCutoffA: number;
  filterCutoffB: number;
  intro: StepPattern;
  loopA: StepPattern;
  loopB: StepPattern;
  outro: StepPattern;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createMetalCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive);
  }
  return curve;
}

// ============================================================================
// NORSE INDUSTRIAL-METAL & DARK SYNTHWAVE THEME LIBRARY
// ============================================================================

const MENU_THEME: MusicThemeDef = {
  id: 'menu',
  bpmA: 92,
  bpmB: 100,
  bassWave: 'triangle',
  leadWave: 'sine',
  arpWave: 'triangle',
  distortBass: false,
  dissonantChords: false,
  filterCutoffA: 1200,
  filterCutoffB: 1650,
  intro: {
    bass: [38, null, null, null, null, null, null, null, 38, null, null, null, 45, null, null, null],
    lead: [null, null, null, null, null, null, null, null, 62, null, null, null, 69, null, null, null],
    arp: [62, null, 69, null, 74, null, 69, null, 62, null, 69, null, 76, null, 74, null],
    kick: [0.6, 0, 0, 0, 0, 0, 0, 0, 0.55, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0.15, 0, 0, 0, 0.15, 0, 0, 0, 0.15, 0, 0, 0, 0.2, 0],
  },
  loopA: {
    // Atmospheric Nordic Aurora arpeggio + deep sub bass in D minor / Dorian
    bass: [38, null, null, null, 38, null, null, null, 34, null, null, null, 36, null, 33, null],
    lead: [62, null, null, null, 69, null, null, 67, 65, null, null, null, 64, null, 62, null],
    arp: [62, 69, 74, 76, 77, 74, 69, 74, 70, 74, 77, 81, 79, 76, 72, 69],
    kick: [0.65, 0, 0, 0, 0, 0, 0, 0, 0.55, 0, 0, 0, 0, 0, 0.3, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.35, 0, 0, 0],
    hat: [0.2, 0, 0.12, 0, 0.22, 0, 0.12, 0, 0.2, 0, 0.12, 0, 0.22, 0, 0.16, 0],
    chord: [50, null, null, null, null, null, null, null, 46, null, null, null, 48, null, null, null],
  },
  loopB: {
    bass: [38, null, 38, null, 38, null, 41, null, 34, null, 34, null, 36, null, 33, null],
    lead: [74, null, null, 72, 69, null, 67, null, 65, null, 67, null, 69, null, null, null],
    arp: [62, 69, 74, 77, 81, 77, 74, 69, 70, 74, 77, 81, 79, 76, 72, 69],
    kick: [0.75, 0, 0, 0, 0.4, 0, 0, 0, 0.7, 0, 0, 0, 0.4, 0, 0.35, 0],
    snare: [0, 0, 0, 0, 0.45, 0, 0, 0, 0, 0, 0, 0, 0.45, 0, 0, 0],
    hat: [0.25, 0.1, 0.2, 0.1, 0.25, 0.1, 0.2, 0.1, 0.25, 0.1, 0.2, 0.1, 0.25, 0.1, 0.22, 0.1],
    chord: [50, null, null, null, null, null, null, null, 46, null, null, null, 48, null, null, null],
  },
  outro: {
    bass: [38, null, null, null, null, null, null, null, 38, null, null, null, null, null, null, null],
    lead: [69, null, null, null, 62, null, null, null, null, null, null, null, null, null, null, null],
    arp: [62, null, 69, null, 74, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const HUB_THEME: MusicThemeDef = {
  id: 'hub',
  bpmA: 88,
  bpmB: 96,
  bassWave: 'triangle',
  leadWave: 'triangle',
  arpWave: 'sine',
  distortBass: false,
  dissonantChords: false,
  filterCutoffA: 1100,
  filterCutoffB: 1450,
  intro: {
    bass: [45, null, null, null, 45, null, null, null, 43, null, null, null, 45, null, null, null],
    lead: [null, null, null, null, 57, null, 60, null, 64, null, null, null, 62, null, null, null],
    arp: [57, null, 64, null, 60, null, 64, null, 55, null, 62, null, 57, null, 64, null],
    kick: [0.55, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
    hat: [0, 0, 0.18, 0, 0, 0, 0.18, 0, 0, 0, 0.18, 0, 0, 0, 0.18, 0],
  },
  loopA: {
    // Campfire dark Norse folk synth in A minor
    bass: [45, null, null, 45, 40, null, null, null, 41, null, null, 41, 43, null, 40, null],
    lead: [69, null, 67, null, 64, null, 60, null, 62, null, 64, 62, 60, null, 57, null],
    arp: [57, 64, 60, 64, 57, 64, 62, 64, 53, 60, 57, 60, 55, 62, 59, 62],
    kick: [0.6, 0, 0, 0, 0, 0, 0.35, 0, 0.55, 0, 0, 0, 0, 0, 0.3, 0],
    snare: [0, 0, 0, 0, 0.32, 0, 0, 0, 0, 0, 0, 0, 0.34, 0, 0, 0],
    hat: [0.16, 0, 0.22, 0, 0.16, 0, 0.22, 0, 0.16, 0, 0.22, 0, 0.16, 0, 0.24, 0],
  },
  loopB: {
    bass: [45, null, 45, null, 40, null, 40, null, 41, null, 41, null, 43, null, 40, null],
    lead: [69, null, 72, null, 71, null, 69, null, 65, null, 67, null, 64, null, 60, null],
    arp: [57, 64, 69, 64, 60, 64, 69, 64, 53, 60, 65, 60, 55, 62, 67, 62],
    kick: [0.68, 0, 0, 0, 0, 0, 0.4, 0, 0.65, 0, 0, 0, 0, 0, 0.38, 0],
    snare: [0, 0, 0, 0, 0.42, 0, 0, 0, 0, 0, 0, 0, 0.42, 0, 0, 0],
    hat: [0.2, 0.1, 0.24, 0.1, 0.2, 0.1, 0.24, 0.1, 0.2, 0.1, 0.24, 0.1, 0.2, 0.1, 0.24, 0.1],
  },
  outro: {
    bass: [45, null, null, null, null, null, null, null, 33, null, null, null, null, null, null, null],
    lead: [64, null, null, null, 57, null, null, null, null, null, null, null, null, null, null, null],
    arp: [57, null, 60, null, 64, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.55, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const OVERWORLD_THEME: MusicThemeDef = {
  id: 'worldmap',
  bpmA: 110,
  bpmB: 122,
  bassWave: 'sawtooth',
  leadWave: 'sawtooth',
  arpWave: 'triangle',
  distortBass: false,
  dissonantChords: false,
  filterCutoffA: 1350,
  filterCutoffB: 1950,
  intro: {
    bass: [38, null, 38, null, 38, null, 38, null, 41, null, 41, null, 45, null, 43, null],
    lead: [null, null, null, null, null, null, null, null, 62, null, null, null, 65, null, 64, null],
    arp: [50, null, 57, null, 50, null, 57, null, 53, null, 57, null, 55, null, 57, null],
    kick: [0.85, 0, 0, 0.45, 0.75, 0, 0, 0, 0.85, 0, 0, 0.45, 0.75, 0, 0.55, 0.55],
    snare: [0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0.65, 0, 0.4, 0],
    hat: [0.2, 0, 0.25, 0, 0.2, 0, 0.25, 0, 0.2, 0, 0.25, 0, 0.2, 0, 0.3, 0.2],
  },
  loopA: {
    // Driving Norse war drums + rallying horn ostinato in D Phrygian
    bass: [38, 38, null, 38, 39, null, 38, null, 38, 38, null, 38, 41, null, 43, null],
    lead: [62, null, null, 65, 63, null, 62, null, 69, null, null, 67, 65, null, 63, 62],
    arp: [50, 57, 50, 57, 51, 57, 50, 57, 50, 57, 53, 57, 55, 57, 51, 50],
    kick: [0.9, 0, 0.5, 0, 0.8, 0, 0.4, 0, 0.9, 0, 0.5, 0.45, 0.8, 0, 0.6, 0],
    snare: [0, 0, 0, 0, 0.7, 0, 0, 0.25, 0, 0, 0, 0, 0.75, 0, 0, 0.35],
    hat: [0.22, 0.1, 0.28, 0.1, 0.22, 0.1, 0.28, 0.1, 0.22, 0.1, 0.28, 0.1, 0.22, 0.1, 0.32, 0.15],
    chord: [50, null, null, null, 51, null, null, null, 50, null, null, null, 53, null, null, null],
  },
  loopB: {
    bass: [38, 38, 38, 38, 39, 39, 38, 38, 38, 38, 41, 41, 43, 43, 41, 39],
    lead: [74, null, 72, null, 70, null, 69, null, 67, null, 65, null, 63, null, 62, null],
    arp: [62, 69, 65, 69, 63, 69, 62, 69, 62, 69, 65, 69, 67, 69, 63, 62],
    kick: [0.95, 0.5, 0.7, 0.5, 0.9, 0, 0.6, 0.5, 0.95, 0.5, 0.7, 0.5, 0.9, 0.5, 0.7, 0.5],
    snare: [0, 0, 0, 0, 0.82, 0, 0, 0.3, 0, 0, 0, 0, 0.85, 0, 0.4, 0.4],
    hat: [0.3, 0.2, 0.35, 0.2, 0.3, 0.2, 0.35, 0.2, 0.3, 0.2, 0.35, 0.2, 0.3, 0.2, 0.38, 0.25],
    chord: [50, null, null, null, 51, null, 50, null, 53, null, null, null, 55, null, 51, null],
  },
  outro: {
    bass: [38, null, null, null, 38, null, null, null, 38, null, null, null, null, null, null, null],
    lead: [69, null, null, null, 62, null, null, null, null, null, null, null, null, null, null, null],
    arp: [50, null, 57, null, 62, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.85, 0, 0, 0, 0.75, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.6, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const ACT1_THEME: MusicThemeDef = {
  id: 'act1',
  bpmA: 128,
  bpmB: 138,
  bassWave: 'sawtooth',
  leadWave: 'sawtooth',
  arpWave: 'square',
  distortBass: true,
  dissonantChords: false,
  filterCutoffA: 1650,
  filterCutoffB: 2400,
  intro: {
    bass: [40, 40, null, 40, 40, null, 43, null, 40, 40, null, 40, 47, 45, 43, 41],
    lead: [null, null, null, null, 64, null, 67, null, 71, null, null, null, 70, null, 67, null],
    arp: [52, null, 59, null, 64, null, 59, null, 52, null, 59, null, 67, null, 64, null],
    kick: [0.9, 0, 0, 0, 0.75, 0, 0, 0, 0.9, 0, 0, 0.5, 0.85, 0, 0.6, 0.6],
    snare: [0, 0, 0, 0, 0.72, 0, 0, 0, 0, 0, 0, 0, 0.78, 0.35, 0.45, 0.55],
    hat: [0.25, 0.12, 0.3, 0.12, 0.25, 0.12, 0.3, 0.12, 0.25, 0.12, 0.3, 0.12, 0.3, 0.2, 0.35, 0.25],
  },
  loopA: {
    // Act 1 Wasteland Cyberpunk-Metal in E minor/Phrygian
    bass: [40, 40, 52, 40, 40, 40, 43, 40, 41, 41, 53, 41, 43, 40, 47, 45],
    lead: [64, null, 67, null, 71, null, 67, 64, 65, null, 64, null, 62, null, 59, null],
    arp: [64, 59, 64, 67, 71, 67, 64, 59, 65, 60, 65, 69, 67, 62, 59, 62],
    kick: [0.95, 0, 0, 0.6, 0.85, 0, 0.45, 0, 0.95, 0, 0.55, 0, 0.85, 0, 0.6, 0],
    snare: [0, 0, 0, 0, 0.82, 0, 0, 0, 0, 0, 0, 0, 0.85, 0, 0, 0.32],
    hat: [0.28, 0.15, 0.32, 0.15, 0.28, 0.15, 0.32, 0.15, 0.28, 0.15, 0.32, 0.15, 0.28, 0.15, 0.35, 0.2],
    chord: [52, null, null, null, null, null, 55, null, 53, null, null, null, 55, null, 52, null],
  },
  loopB: {
    bass: [40, 40, 40, 40, 43, 43, 40, 40, 41, 41, 41, 41, 47, 45, 43, 41],
    lead: [76, null, 79, null, 76, 74, 71, null, 72, null, 71, null, 67, 65, 64, null],
    arp: [64, 71, 76, 71, 67, 71, 76, 71, 65, 72, 77, 72, 67, 74, 79, 74],
    kick: [0.95, 0.6, 0.85, 0.6, 0.95, 0, 0.7, 0.6, 0.95, 0.6, 0.85, 0.6, 0.95, 0.6, 0.8, 0.6],
    snare: [0, 0, 0, 0, 0.9, 0, 0, 0.35, 0, 0, 0, 0, 0.92, 0, 0.45, 0.45],
    hat: [0.35, 0.22, 0.38, 0.22, 0.35, 0.22, 0.38, 0.22, 0.35, 0.22, 0.38, 0.22, 0.35, 0.22, 0.42, 0.3],
    chord: [52, null, 52, null, 55, null, 52, null, 53, null, 53, null, 59, null, 55, null],
  },
  outro: {
    bass: [40, null, null, null, 43, null, null, null, 40, null, null, null, null, null, null, null],
    lead: [71, null, null, null, 64, null, null, null, null, null, null, null, null, null, null, null],
    arp: [64, null, 59, null, 52, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.9, 0, 0, 0, 0.7, 0, 0, 0, 0.95, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.7, 0, 0, 0, 0.85, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const ACT2_THEME: MusicThemeDef = {
  id: 'act2',
  bpmA: 132,
  bpmB: 144,
  bassWave: 'sawtooth',
  leadWave: 'square',
  arpWave: 'sawtooth',
  distortBass: true,
  dissonantChords: true,
  filterCutoffA: 1550,
  filterCutoffB: 2350,
  intro: {
    bass: [37, null, 37, 38, 37, null, 43, null, 37, null, 37, 38, 44, 43, 40, 38],
    lead: [null, null, null, null, 61, null, 67, null, 64, null, 62, null, 61, null, null, null],
    arp: [49, 56, 61, 56, 50, 56, 61, 56, 49, 56, 62, 56, 55, 56, 61, 56],
    kick: [0.9, 0, 0.5, 0, 0.85, 0, 0, 0, 0.9, 0, 0.5, 0.5, 0.85, 0.5, 0.65, 0.65],
    snare: [0, 0, 0, 0, 0.78, 0, 0, 0, 0, 0, 0, 0, 0.82, 0, 0.5, 0.5],
    hat: [0.25, 0.14, 0.3, 0.14, 0.25, 0.14, 0.3, 0.14, 0.25, 0.14, 0.3, 0.14, 0.3, 0.22, 0.35, 0.28],
  },
  loopA: {
    // Act 2 Coils of the Serpent — C# Phrygian industrial groove with tritone bite
    bass: [37, 37, 49, 37, 38, 37, 43, 37, 37, 37, 49, 37, 40, 38, 44, 43],
    lead: [61, null, 62, null, 67, null, 64, 62, 61, null, 68, null, 67, null, 62, null],
    arp: [61, 68, 62, 68, 61, 67, 64, 67, 61, 68, 70, 68, 67, 64, 62, 61],
    kick: [0.95, 0, 0.55, 0, 0.85, 0, 0.5, 0.45, 0.95, 0, 0.55, 0, 0.85, 0, 0.65, 0],
    snare: [0, 0, 0, 0, 0.85, 0, 0, 0.25, 0, 0, 0, 0, 0.88, 0, 0, 0.35],
    hat: [0.28, 0.16, 0.34, 0.16, 0.28, 0.16, 0.34, 0.16, 0.28, 0.16, 0.34, 0.16, 0.28, 0.16, 0.38, 0.22],
    chord: [49, null, null, null, 50, null, 55, null, 49, null, null, null, 56, null, 50, null],
  },
  loopB: {
    bass: [37, 37, 37, 38, 37, 37, 43, 43, 37, 37, 38, 38, 44, 43, 40, 38],
    lead: [73, null, 74, null, 79, null, 76, 74, 73, null, 80, null, 79, 76, 74, 73],
    arp: [61, 68, 73, 68, 62, 68, 74, 68, 67, 73, 79, 73, 68, 74, 80, 74],
    kick: [0.98, 0.65, 0.85, 0.65, 0.95, 0, 0.75, 0.65, 0.98, 0.65, 0.85, 0.65, 0.95, 0.65, 0.85, 0.65],
    snare: [0, 0, 0, 0, 0.92, 0, 0, 0.4, 0, 0, 0, 0, 0.95, 0, 0.5, 0.5],
    hat: [0.34, 0.22, 0.4, 0.22, 0.34, 0.22, 0.4, 0.22, 0.34, 0.22, 0.4, 0.22, 0.34, 0.22, 0.44, 0.32],
    chord: [49, null, 50, null, 55, null, 49, null, 56, null, 55, null, 50, null, 49, null],
  },
  outro: {
    bass: [37, null, null, null, 43, null, null, null, 37, null, null, null, null, null, null, null],
    lead: [67, null, null, null, 61, null, null, null, null, null, null, null, null, null, null, null],
    arp: [61, null, 56, null, 49, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.9, 0, 0, 0, 0.8, 0, 0, 0, 0.95, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.75, 0, 0, 0, 0.88, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

const ACT3_THEME: MusicThemeDef = {
  id: 'act3',
  bpmA: 140,
  bpmB: 152,
  bassWave: 'sawtooth',
  leadWave: 'sawtooth',
  arpWave: 'sawtooth',
  distortBass: true,
  dissonantChords: true,
  filterCutoffA: 1900,
  filterCutoffB: 2800,
  intro: {
    bass: [36, 36, 36, null, 37, 37, 36, null, 36, 36, 42, null, 43, 42, 40, 37],
    lead: [60, null, null, null, 64, null, 67, null, 68, null, 67, null, 64, null, 61, null],
    arp: [48, 55, 60, 55, 49, 55, 61, 55, 52, 55, 64, 55, 55, 60, 67, 60],
    kick: [0.95, 0.55, 0.7, 0, 0.9, 0, 0.6, 0.5, 0.95, 0.55, 0.7, 0.55, 0.9, 0.6, 0.8, 0.7],
    snare: [0, 0, 0, 0, 0.85, 0, 0, 0.3, 0, 0, 0, 0, 0.9, 0.4, 0.5, 0.6],
    hat: [0.3, 0.18, 0.36, 0.18, 0.3, 0.18, 0.36, 0.18, 0.3, 0.18, 0.36, 0.18, 0.35, 0.25, 0.4, 0.32],
  },
  loopA: {
    // Act 3 Shadow of Krunked — C Phrygian Dominant apocalyptic metal gallop
    bass: [36, 36, 36, 48, 37, 36, 40, 36, 36, 36, 42, 36, 43, 40, 37, 36],
    lead: [60, null, 64, null, 67, null, 68, 67, 64, null, 61, null, 60, null, 55, null],
    arp: [60, 64, 67, 72, 68, 67, 64, 61, 60, 64, 67, 73, 72, 68, 67, 64],
    kick: [0.95, 0.55, 0.75, 0, 0.9, 0, 0.65, 0.5, 0.95, 0.55, 0.75, 0, 0.9, 0.5, 0.75, 0.5],
    snare: [0, 0, 0, 0, 0.88, 0, 0, 0.32, 0, 0, 0, 0, 0.92, 0, 0, 0.4],
    hat: [0.32, 0.2, 0.38, 0.2, 0.32, 0.2, 0.38, 0.2, 0.32, 0.2, 0.38, 0.2, 0.32, 0.2, 0.42, 0.28],
    chord: [48, null, null, null, 49, null, 52, null, 48, null, 54, null, 55, null, 49, null],
  },
  loopB: {
    bass: [36, 36, 36, 37, 36, 36, 42, 42, 36, 36, 43, 43, 44, 43, 40, 37],
    lead: [72, null, 76, null, 79, null, 80, 79, 76, null, 73, null, 72, 68, 67, 64],
    arp: [60, 67, 72, 76, 73, 68, 72, 76, 66, 72, 78, 72, 67, 72, 79, 76],
    kick: [1.0, 0.72, 0.9, 0.72, 1.0, 0.65, 0.85, 0.72, 1.0, 0.72, 0.9, 0.72, 1.0, 0.72, 0.9, 0.72],
    snare: [0, 0, 0, 0, 0.95, 0, 0.4, 0.4, 0, 0, 0, 0, 0.98, 0.4, 0.55, 0.55],
    hat: [0.38, 0.26, 0.44, 0.26, 0.38, 0.26, 0.44, 0.26, 0.38, 0.26, 0.44, 0.26, 0.38, 0.26, 0.46, 0.36],
    chord: [48, null, 49, null, 54, null, 48, null, 55, null, 56, null, 52, null, 49, null],
  },
  outro: {
    bass: [36, null, null, null, 37, null, null, null, 36, null, null, null, null, null, null, null],
    lead: [67, null, null, null, 60, null, null, null, null, null, null, null, null, null, null, null],
    arp: [60, null, 55, null, 48, null, null, null, null, null, null, null, null, null, null, null],
    kick: [0.95, 0, 0, 0, 0.85, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.8, 0, 0, 0, 0.95, 0, 0, 0, 0, 0, 0, 0],
    hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

/** Helper that builds a distinct high-octane two-phase Boss theme around a root MIDI note & BPM. */
function makeBossTheme(
  id: string,
  rootMidi: number,
  bpmA: number,
  bpmB: number,
  leadWave: OscillatorType,
  arpWave: OscillatorType
): MusicThemeDef {
  const r = rootMidi; // e.g. 38 = D2
  const rUp = r + 12;
  const r2 = r + 24;
  return {
    id,
    bpmA,
    bpmB,
    bassWave: 'sawtooth',
    leadWave,
    arpWave,
    distortBass: true,
    dissonantChords: true,
    filterCutoffA: 2100,
    filterCutoffB: 3400,
    intro: {
      // Dramatic war-drum & dissonant horn build-up leading straight into Loop A
      bass: [r, null, r, null, r, null, r + 1, null, r, r, null, r + 6, r + 7, r + 6, r + 3, r + 1],
      lead: [r2, null, null, null, r2 + 1, null, null, null, r2 + 6, null, r2 + 7, null, r2 + 10, null, r2 + 7, null],
      arp: [rUp, rUp + 7, r2, rUp + 7, rUp + 1, rUp + 7, r2 + 1, rUp + 7, rUp + 6, rUp + 7, r2, rUp + 6, rUp + 7, r2, r2 + 1, r2 + 6],
      kick: [0.95, 0, 0.7, 0, 0.95, 0, 0.7, 0.55, 0.95, 0.65, 0.85, 0.65, 1.0, 0.75, 0.9, 0.85],
      snare: [0, 0, 0, 0, 0.85, 0, 0, 0, 0, 0, 0, 0, 0.95, 0.55, 0.7, 0.85],
      hat: [0.3, 0.2, 0.35, 0.2, 0.3, 0.2, 0.35, 0.2, 0.35, 0.25, 0.4, 0.25, 0.4, 0.3, 0.45, 0.4],
      chord: [rUp, null, null, null, rUp + 1, null, null, null, rUp + 6, null, null, null, rUp + 7, null, rUp + 1, null],
    },
    loopA: {
      // Phase 1 Boss — Driving Norse industrial metal with aggressive syncopation
      bass: [r, r, rUp, r, r + 1, r, r + 6, r, r, r, r + 3, r, r + 7, r + 6, r + 3, r + 1],
      lead: [r2, null, r2 + 3, null, r2 + 7, null, r2 + 6, r2 + 3, r2 + 1, null, r2 + 7, null, r2 + 6, null, r2 + 3, r2 + 1],
      arp: [r2, r2 + 7, r2 + 3, r2 + 7, r2 + 1, r2 + 6, r2 + 7, r2 + 6, r2, r2 + 7, r2 + 10, r2 + 7, r2 + 6, r2 + 3, r2 + 1, r2],
      kick: [1.0, 0.6, 0.8, 0, 0.95, 0, 0.7, 0.6, 1.0, 0.6, 0.8, 0.55, 0.95, 0, 0.8, 0.6],
      snare: [0, 0, 0, 0, 0.92, 0, 0, 0.35, 0, 0, 0, 0, 0.95, 0, 0.35, 0.45],
      hat: [0.34, 0.2, 0.4, 0.2, 0.34, 0.2, 0.4, 0.2, 0.34, 0.2, 0.4, 0.2, 0.34, 0.2, 0.44, 0.3],
      chord: [rUp, null, null, null, rUp + 1, null, rUp + 6, null, rUp, null, rUp + 3, null, rUp + 7, null, rUp + 1, null],
    },
    loopB: {
      // Phase 2 OVERDRIVE — Blistering double-kick 16ths + dissonant Norse power chords!
      bass: [r, r, r, r + 1, r, r, r + 6, r + 6, r, r, r + 7, r + 7, r + 8, r + 7, r + 6, r + 1],
      lead: [r2 + 12, r2 + 10, r2 + 7, null, r2 + 13, r2 + 12, r2 + 7, r2 + 6, r2 + 12, null, r2 + 15, r2 + 13, r2 + 12, r2 + 10, r2 + 7, r2 + 6],
      arp: [r2, r2 + 7, r2 + 12, r2 + 13, r2 + 12, r2 + 7, r2 + 6, r2 + 12, r2 + 1, r2 + 7, r2 + 13, r2 + 15, r2 + 13, r2 + 12, r2 + 7, r2 + 6],
      kick: [1.0, 0.82, 0.92, 0.82, 1.0, 0.78, 0.92, 0.82, 1.0, 0.82, 0.92, 0.82, 1.0, 0.82, 0.95, 0.85],
      snare: [0, 0, 0, 0, 0.98, 0, 0.45, 0.45, 0, 0, 0.4, 0, 1.0, 0.5, 0.65, 0.7],
      hat: [0.42, 0.3, 0.46, 0.3, 0.42, 0.3, 0.46, 0.3, 0.42, 0.3, 0.46, 0.3, 0.44, 0.34, 0.5, 0.42],
      chord: [rUp, null, rUp + 1, null, rUp + 6, null, rUp, null, rUp + 7, null, rUp + 8, null, rUp + 6, null, rUp + 1, null],
    },
    outro: {
      // Decisive Norse victory cadence resolving to triumphant major/fifth
      bass: [r + 7, null, null, null, r + 5, null, null, null, r, null, null, null, null, null, null, null],
      lead: [r2 + 7, null, null, null, r2 + 4, null, null, null, r2, null, null, null, null, null, null, null],
      arp: [r2, null, r2 + 4, null, r2 + 7, null, r2 + 12, null, null, null, null, null, null, null, null, null],
      kick: [1.0, 0, 0, 0, 0.9, 0, 0, 0, 1.0, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0.85, 0, 0, 0, 0.95, 0, 0, 0, 0, 0, 0, 0],
      hat: [0.35, 0, 0, 0, 0.35, 0, 0, 0, 0.45, 0, 0, 0, 0, 0, 0, 0],
      chord: [rUp + 7, null, null, null, rUp + 5, null, null, null, rUp, null, null, null, null, null, null, null],
    },
  };
}

const BOSS_THEMES: Record<string, MusicThemeDef> = {
  fenrir: makeBossTheme('boss_fenrir', 38, 144, 158, 'sawtooth', 'square'),      // D2
  skadi: makeBossTheme('boss_skadi', 42, 138, 152, 'triangle', 'sine'),          // F#2 glacial
  loki_body: makeBossTheme('boss_loki_body', 40, 142, 156, 'square', 'sawtooth'), // E2 glitchy
  hel: makeBossTheme('boss_hel', 36, 136, 150, 'sawtooth', 'triangle'),          // C2 doom
  surtur: makeBossTheme('boss_surtur', 35, 146, 160, 'sawtooth', 'sawtooth'),    // B1 volcanic
  krunked: makeBossTheme('boss_krunked', 38, 150, 166, 'sawtooth', 'sawtooth'),  // D2 Final Ragnarok!
};

/** Resolve any logical KRUNKEDFALL music key to its procedural theme definition. */
export function resolveSynthTheme(trackKey: string): MusicThemeDef {
  const k = trackKey.toLowerCase();
  if (k.includes('krunked')) return BOSS_THEMES.krunked;
  if (k.includes('fenrir')) return BOSS_THEMES.fenrir;
  if (k.includes('skadi')) return BOSS_THEMES.skadi;
  if (k.includes('loki')) return BOSS_THEMES.loki_body;
  if (k.includes('surtur')) return BOSS_THEMES.surtur;
  if (k.includes('hel_intro') || k.includes('hel_a') || k.includes('hel_b') || k.includes('hel_outro') || k === 'music_hel') {
    return BOSS_THEMES.hel;
  }
  if (k.includes('menu') || k.includes('title') || k.includes('victory') || k.includes('gameover')) {
    return MENU_THEME;
  }
  if (k.includes('hub') || k.includes('shop') || k.includes('campfire')) {
    return HUB_THEME;
  }
  if (k.includes('worldmap') || k.includes('overworld') || k.includes('map')) {
    return OVERWORLD_THEME;
  }
  if (
    k.includes('ashwastes') ||
    k.includes('lavaland') ||
    k.includes('muspelheim') ||
    k.includes('shrine') ||
    k.includes('cindercity') ||
    k.includes('redhall') ||
    k.includes('sulfurlake') ||
    k.includes('trenches') ||
    k.includes('act3')
  ) {
    return ACT3_THEME;
  }
  if (
    k.includes('forest') ||
    k.includes('losttemple') ||
    k.includes('helheim') ||
    k.includes('mushroom') ||
    k.includes('deadlands') ||
    k.includes('grassland') ||
    k.includes('lab') ||
    k.includes('military') ||
    k.includes('act2')
  ) {
    return ACT2_THEME;
  }
  // Act 1 biomes (canyon, dunes, sewer, saltpan, darkcity, jotunheim, arena, etc.)
  return ACT1_THEME;
}

interface SynthDeck {
  gainNode: GainNode;
  theme: MusicThemeDef;
  trackKey: string;
  stem: MusicStem;
  stepIndex: number;
  nextStepTime: number;
  active: boolean;
}

/**
 * Procedural Web Audio step-sequencer & ambient-bed synthesizer.
 * Handles Intro -> Loop A -> Loop B -> Outro with 350ms smooth crossfades.
 */
export class SynthMusicEngine {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private metalCurve: Float32Array<ArrayBuffer> | null = null;

  private activeDeck: SynthDeck | null = null;
  private fadingDecks: Array<{ gainNode: GainNode; disposeAt: number }> = [];
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;

  private ambienceNodes: {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    key: string;
  } | null = null;

  private onStemAutoAdvance?: (trackKey: string, nextStem: MusicStem) => void;

  public setStemAdvanceCallback(cb: (trackKey: string, nextStem: MusicStem) => void): void {
    this.onStemAutoAdvance = cb;
  }

  public isPlaying(): boolean {
    return this.activeDeck !== null && this.activeDeck.active;
  }

  public hasAmbience(): boolean {
    return this.ambienceNodes !== null;
  }

  public bindContext(ctx: AudioContext, musicBus: GainNode, ambienceBus: GainNode): void {
    if (this.ctx === ctx && this.musicBus === musicBus) return;
    this.ctx = ctx;
    this.musicBus = musicBus;
    this.ambienceBus = ambienceBus;
    this.noiseBuffer = this.buildNoiseBuffer(ctx, 2.0);
    this.metalCurve = createMetalCurve(3.6);
  }

  private buildNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const sr = ctx.sampleRate || 44100;
    const len = Math.max(1, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    let s = 0x517cc1b7;
    for (let i = 0; i < len; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      ch[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
    }
    return buf;
  }

  /**
   * Transition smoothly (350ms crossfade) to a built-in synth track + stem.
   */
  public play(trackKey: string, stem: MusicStem = 'a', crossfadeSec = MUSIC_CROSSFADE_SEC): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;

    const now = ctx.currentTime;
    const theme = resolveSynthTheme(trackKey);

    // Fade out any currently active deck smoothly over crossfadeSec
    if (this.activeDeck) {
      this.fadeOutDeck(this.activeDeck, now, crossfadeSec);
      this.activeDeck = null;
    }

    const deckGain = ctx.createGain();
    deckGain.gain.setValueAtTime(0.0001, now);
    deckGain.gain.linearRampToValueAtTime(1.0, now + Math.max(0.02, crossfadeSec));
    deckGain.connect(bus);

    this.activeDeck = {
      gainNode: deckGain,
      theme,
      trackKey,
      stem,
      stepIndex: 0,
      nextStepTime: now + 0.03,
      active: true,
    };

    this.ensureSchedulerRunning();
  }

  /** Smoothly fade out synth music (e.g., when switching to a Custom Pack .ogg track). */
  public stop(crossfadeSec = MUSIC_CROSSFADE_SEC): void {
    const ctx = this.ctx;
    if (this.activeDeck && ctx) {
      this.fadeOutDeck(this.activeDeck, ctx.currentTime, crossfadeSec);
    }
    this.activeDeck = null;
    if (this.schedulerTimer !== null && this.fadingDecks.length === 0) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private fadeOutDeck(deck: SynthDeck, now: number, crossfadeSec: number): void {
    deck.active = false;
    const g = deck.gainNode.gain;
    try {
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now);
      g.linearRampToValueAtTime(0.0001, now + Math.max(0.02, crossfadeSec));
    } catch {
      // Ignore if context is closing
    }
    this.fadingDecks.push({
      gainNode: deck.gainNode,
      disposeAt: now + crossfadeSec + 0.15,
    });
  }

  private ensureSchedulerRunning(): void {
    if (this.schedulerTimer !== null) return;
    this.schedulerTimer = setInterval(() => {
      this.tickScheduler();
    }, 25);
  }

  private tickScheduler(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;

    // Clean up finished fading decks
    for (let i = this.fadingDecks.length - 1; i >= 0; i--) {
      if (now >= this.fadingDecks[i].disposeAt) {
        try {
          this.fadingDecks[i].gainNode.disconnect();
        } catch {
          // Already disconnected
        }
        this.fadingDecks.splice(i, 1);
      }
    }

    const deck = this.activeDeck;
    if (!deck || !deck.active) {
      if (this.fadingDecks.length === 0 && this.schedulerTimer !== null) {
        clearInterval(this.schedulerTimer);
        this.schedulerTimer = null;
      }
      return;
    }

    if (ctx.state !== 'running') {
      // Keep nextStepTime aligned so resuming doesn't burst stale steps
      deck.nextStepTime = now + 0.04;
      return;
    }

    // Clamp drift if tab was backgrounded
    if (deck.nextStepTime < now - 0.25) {
      deck.nextStepTime = now + 0.03;
    }

    const lookaheadSec = 0.13;
    while (deck.active && deck.nextStepTime < now + lookaheadSec) {
      this.scheduleStep(ctx, deck, deck.nextStepTime);
      const bpm = deck.stem === 'b' ? deck.theme.bpmB : deck.theme.bpmA;
      const stepDur = 60 / bpm / 4; // 16th note
      deck.nextStepTime += stepDur;
      deck.stepIndex++;

      if (deck.stepIndex >= 16) {
        deck.stepIndex = 0;
        if (deck.stem === 'intro') {
          // Seamless Intro -> Loop A transition at the exact bar boundary!
          deck.stem = 'a';
          this.onStemAutoAdvance?.(deck.trackKey, 'a');
        } else if (deck.stem === 'outro') {
          // Outro finishes cleanly after 1 bar
          deck.active = false;
          this.fadeOutDeck(deck, deck.nextStepTime, 0.25);
          this.activeDeck = null;
          break;
        }
      }
    }
  }

  private getPatternForDeck(deck: SynthDeck): StepPattern {
    switch (deck.stem) {
      case 'intro':
        return deck.theme.intro;
      case 'b':
        return deck.theme.loopB;
      case 'outro':
        return deck.theme.outro;
      case 'a':
      default:
        return deck.theme.loopA;
    }
  }

  private scheduleStep(ctx: AudioContext, deck: SynthDeck, time: number): void {
    const pattern = this.getPatternForDeck(deck);
    const idx = deck.stepIndex & 15;
    const bpm = deck.stem === 'b' ? deck.theme.bpmB : deck.theme.bpmA;
    const stepDur = 60 / bpm / 4;
    const dest = deck.gainNode;
    const isOverdrive = deck.stem === 'b';
    const cutoff = isOverdrive ? deck.theme.filterCutoffB : deck.theme.filterCutoffA;

    // 1. Kick drum
    const kickVel = pattern.kick[idx] ?? 0;
    if (kickVel > 0) {
      this.triggerKick(ctx, dest, time, kickVel * (isOverdrive ? 0.34 : 0.28));
    }

    // 2. Industrial Snare / War-drum
    const snareVel = pattern.snare[idx] ?? 0;
    if (snareVel > 0) {
      this.triggerSnare(ctx, dest, time, snareVel * 0.22);
    }

    // 3. Metallic Hi-hat / Percussion
    const hatVel = pattern.hat[idx] ?? 0;
    if (hatVel > 0) {
      this.triggerHat(ctx, dest, time, hatVel * 0.11);
    }

    // 4. Driving Cyberpunk-Metal Bassline
    const bassNote = pattern.bass[idx];
    if (bassNote !== null && bassNote !== undefined) {
      this.triggerBass(ctx, dest, time, midiToHz(bassNote), stepDur * 1.45, deck.theme, cutoff, isOverdrive);
    }

    // 5. Norse Arpeggio layer
    const arpNote = pattern.arp[idx];
    if (arpNote !== null && arpNote !== undefined) {
      this.triggerArp(ctx, dest, time, midiToHz(arpNote), stepDur * 1.15, deck.theme.arpWave, cutoff);
    }

    // 6. Distortion Lead / Nordic Horn Melody
    const leadNote = pattern.lead[idx];
    if (leadNote !== null && leadNote !== undefined) {
      this.triggerLead(ctx, dest, time, midiToHz(leadNote), stepDur * 2.4, deck.theme.leadWave, cutoff, isOverdrive);
    }

    // 7. Norse Power Chords (Root + Fifth + optional dissonant tritone/minor-2nd in Phase B!)
    const chordRoot = pattern.chord?.[idx];
    if (chordRoot !== null && chordRoot !== undefined) {
      this.triggerPowerChord(
        ctx,
        dest,
        time,
        chordRoot,
        stepDur * 3.6,
        deck.theme.dissonantChords && isOverdrive,
        cutoff
      );
    }
  }

  private triggerKick(ctx: AudioContext, dest: AudioNode, time: number, gainVal: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(142, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, time);
    g.gain.exponentialRampToValueAtTime(0.0008, time + 0.16);

    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private triggerSnare(ctx: AudioContext, dest: AudioNode, time: number, gainVal: number): void {
    if (this.noiseBuffer) {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(1.2, time);
      bp.frequency.setValueAtTime(1650, time);

      const g = ctx.createGain();
      g.gain.setValueAtTime(gainVal, time);
      g.gain.exponentialRampToValueAtTime(0.0008, time + 0.13);

      n.connect(bp);
      bp.connect(g);
      g.connect(dest);
      n.start(time, (time * 1.7) % 1.2);
      n.stop(time + 0.14);
    }

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, time);
    body.frequency.exponentialRampToValueAtTime(115, time + 0.06);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(gainVal * 0.75, time);
    bg.gain.exponentialRampToValueAtTime(0.0008, time + 0.08);
    body.connect(bg);
    bg.connect(dest);
    body.start(time);
    body.stop(time + 0.09);
  }

  private triggerHat(ctx: AudioContext, dest: AudioNode, time: number, gainVal: number): void {
    if (!this.noiseBuffer) return;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6800, time);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, time);
    g.gain.exponentialRampToValueAtTime(0.0008, time + 0.045);

    n.connect(hp);
    hp.connect(g);
    g.connect(dest);
    n.start(time, (time * 3.1) % 1.4);
    n.stop(time + 0.052);
  }

  private triggerBass(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    hz: number,
    dur: number,
    theme: MusicThemeDef,
    cutoff: number,
    overdrive: boolean
  ): void {
    const osc = ctx.createOscillator();
    osc.type = theme.bassWave;
    osc.frequency.setValueAtTime(hz, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(overdrive ? 3.4 : 2.0, time);
    lp.frequency.setValueAtTime(Math.min(cutoff * 0.85, 1600), time);
    lp.frequency.exponentialRampToValueAtTime(240, time + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.linearRampToValueAtTime(overdrive ? 0.2 : 0.17, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    if (theme.distortBass && this.metalCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.metalCurve;
      osc.connect(shaper);
      shaper.connect(lp);
    } else {
      osc.connect(lp);
    }
    lp.connect(g);
    g.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerArp(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    hz: number,
    dur: number,
    wave: OscillatorType,
    cutoff: number
  ): void {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz, time);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, time);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.linearRampToValueAtTime(0.075, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerLead(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    hz: number,
    dur: number,
    wave: OscillatorType,
    cutoff: number,
    overdrive: boolean
  ): void {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(2.2, time);
    lp.frequency.setValueAtTime(cutoff * 1.2, time);
    lp.frequency.exponentialRampToValueAtTime(520, time + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.linearRampToValueAtTime(overdrive ? 0.115 : 0.095, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    if (overdrive && this.metalCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.metalCurve;
      shaper.connect(lp);
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.setValueAtTime(hz, time);
        osc.detune.setValueAtTime(detune, time);
        osc.connect(shaper);
        osc.start(time);
        osc.stop(time + dur + 0.02);
      }
    } else {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(hz, time);
      osc.connect(lp);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    lp.connect(g);
    g.connect(dest);
  }

  private triggerPowerChord(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    rootMidi: number,
    dur: number,
    dissonant: boolean,
    cutoff: number
  ): void {
    // Power chord: Root + Fifth (+ Tritone / Octave for boss Phase B dissonance!)
    const intervals = dissonant ? [0, 6, 7, 12] : [0, 7, 12];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, time);
    lp.frequency.exponentialRampToValueAtTime(420, time + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, time);
    g.gain.linearRampToValueAtTime(dissonant ? 0.07 : 0.055, time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    let inputNode: AudioNode = lp;
    if (dissonant && this.metalCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.metalCurve;
      shaper.connect(lp);
      inputNode = shaper;
    }

    lp.connect(g);
    g.connect(dest);

    for (const semitones of intervals) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(midiToHz(rootMidi + semitones), time);
      osc.connect(inputNode);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }
  }

  // ==========================================================================
  // PROCEDURAL BIOME AMBIENCE BED
  // ==========================================================================

  public setAmbience(ambienceKey: string | undefined, crossfadeSec = MUSIC_CROSSFADE_SEC): void {
    const ctx = this.ctx;
    const bus = this.ambienceBus;
    if (!ctx || !bus) return;

    const normalized = ambienceKey?.trim().toLowerCase() ?? '';
    if (this.ambienceNodes && this.ambienceNodes.key === normalized) {
      return;
    }

    this.stopAmbience(crossfadeSec);

    if (!normalized || !this.noiseBuffer) {
      return;
    }

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    let targetGain = 0.09;
    if (normalized.includes('snow') || normalized.includes('ice') || normalized.includes('frost')) {
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(4.5, now);
      filter.frequency.setValueAtTime(normalized.includes('heavy') ? 1350 : 920, now);
      targetGain = normalized.includes('heavy') ? 0.14 : 0.08;
    } else if (normalized.includes('lava') || normalized.includes('muspel') || normalized.includes('fire')) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      targetGain = 0.14;
    } else if (normalized.includes('campfire') || normalized.includes('hub')) {
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(1.8, now);
      filter.frequency.setValueAtTime(480, now);
      targetGain = 0.06;
    } else if (normalized.includes('sewer') || normalized.includes('cave')) {
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(3.0, now);
      filter.frequency.setValueAtTime(320, now);
      targetGain = 0.08;
    } else {
      // Wasteland wind
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(2.6, now);
      filter.frequency.setValueAtTime(640, now);
      targetGain = 0.07;
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(targetGain, now + Math.max(0.05, crossfadeSec));

    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(now);

    this.ambienceNodes = { source: src, filter, gain, key: normalized };
  }

  public stopAmbience(crossfadeSec = MUSIC_CROSSFADE_SEC): void {
    const prev = this.ambienceNodes;
    this.ambienceNodes = null;
    if (!prev || !this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(Math.max(0.0001, prev.gain.gain.value), now);
      prev.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.02, crossfadeSec));
      prev.source.stop(now + crossfadeSec + 0.05);
    } catch {
      // Ignore already-stopped source
    }
  }

  public dispose(): void {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.stop(0.02);
    this.stopAmbience(0.02);
    for (const deck of this.fadingDecks) {
      try {
        deck.gainNode.disconnect();
      } catch {
        // Ignore
      }
    }
    this.fadingDecks = [];
    this.ctx = null;
    this.musicBus = null;
    this.ambienceBus = null;
    this.noiseBuffer = null;
    this.metalCurve = null;
  }
}
