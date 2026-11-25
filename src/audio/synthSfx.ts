// ============================================================================
// KRUNKEDFALL — Procedural Web Audio SFX Synthesizer (Built-In Audio Pack)
// ============================================================================
// Crunchy, zero-dependency Web Audio synthesis covering all 6 weapon ammo
// classes, destructible masonry, gore splats, elemental explosions, Norse
// Outcast abilities/powers, boss warnings, Fimbulwinter ice, and crisp UI.

import type { AmmoType, ElementType, OutcastId, PickupState } from '../contracts/index.js';

export type UiSoundKind = 'click' | 'confirm' | 'error' | 'hover' | 'levelup';

export interface SfxPlayOptions {
  /** Base pitch multiplier (already includes jitter from AudioEngine). */
  pitch?: number;
  /** Output gain multiplier (0..2). */
  volume?: number;
  /** Optional deterministic timbre seed (e.g. weaponUniqueId). */
  seed?: number;
}

const MAX_DISTORTION_CURVE_SAMPLES = 512;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Deterministic unit float [0, 1) from integer hash. */
function hashUnit(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

function createDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(MAX_DISTORTION_CURVE_SAMPLES * 4));
  const k = Math.max(1, drive);
  for (let i = 0; i < MAX_DISTORTION_CURVE_SAMPLES; i++) {
    const x = (i * 2) / MAX_DISTORTION_CURVE_SAMPLES - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Procedural Web Audio sound-effects generator.
 * Pre-builds shared noise buffers & waveshaper curves per AudioContext to
 * avoid per-shot allocations and GC stalls during high-ROF fire.
 */
export class SynthSfxEngine {
  private ctx: AudioContext | null = null;
  private whiteNoise: AudioBuffer | null = null;
  private brownNoise: AudioBuffer | null = null;
  private softClipCurve: Float32Array<ArrayBuffer> | null = null;
  private hardClipCurve: Float32Array<ArrayBuffer> | null = null;

  public bindContext(ctx: AudioContext): void {
    if (this.ctx === ctx && this.whiteNoise && this.brownNoise) {
      return;
    }
    this.ctx = ctx;
    this.whiteNoise = this.buildNoiseBuffer(ctx, 1.5, false);
    this.brownNoise = this.buildNoiseBuffer(ctx, 1.5, true);
    this.softClipCurve = createDistortionCurve(18);
    this.hardClipCurve = createDistortionCurve(65);
  }

  public dispose(): void {
    this.ctx = null;
    this.whiteNoise = null;
    this.brownNoise = null;
    this.softClipCurve = null;
    this.hardClipCurve = null;
  }

  private buildNoiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic xorshift32 noise
    let state = brown ? 0x6d2b79f5 : 0x243f6a88;
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const white = ((state >>> 0) / 0xffffffff) * 2 - 1;
      if (brown) {
        lastOut = (lastOut + 0.06 * white) / 1.06;
        data[i] = clamp(lastOut * 3.1, -1, 1);
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  private createNoiseSource(ctx: AudioContext, brown: boolean, offsetRatio = 0): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    const buf = brown ? this.brownNoise : this.whiteNoise;
    if (buf) {
      src.buffer = buf;
      src.loop = true;
    }
    void offsetRatio;
    return src;
  }

  private makeShaper(ctx: AudioContext, hard: boolean): WaveShaperNode {
    const shaper = ctx.createWaveShaper();
    shaper.curve = hard ? this.hardClipCurve : this.softClipCurve;
    shaper.oversample = 'none';
    return shaper;
  }

  /**
   * Synthesize weapon discharge for all 6 KRUNKEDFALL ammo classes.
   * Returns estimated duration in seconds for voice-cap tracking.
   */
  public playWeaponFire(dest: AudioNode, ammoType: AmmoType, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;

    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.4, 2.2);
    const vol = clamp(opts.volume ?? 1, 0.05, 1.8);
    const timbre = hashUnit((opts.seed ?? 1000) * 31 + ammoType * 7);

    switch (ammoType) {
      case 0:
        return this.synthMeleeSwing(ctx, dest, now, pitch, vol, timbre);
      case 1:
        return this.synthBulletShot(ctx, dest, now, pitch, vol, timbre);
      case 2:
        return this.synthShotgunBlast(ctx, dest, now, pitch, vol, timbre);
      case 3:
        return this.synthCrossbowTwang(ctx, dest, now, pitch, vol, timbre);
      case 4:
        return this.synthEnergyPlasma(ctx, dest, now, pitch, vol, timbre);
      case 5:
        return this.synthExplosiveLaunch(ctx, dest, now, pitch, vol, timbre);
    }
  }

  private synthMeleeSwing(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. Air whoosh (swept bandpass noise)
    const noise = this.createNoiseSource(ctx, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.6, now);
    bp.frequency.setValueAtTime((460 + timbre * 220) * pitch, now);
    bp.frequency.exponentialRampToValueAtTime((1650 + timbre * 450) * pitch, now + 0.065);
    bp.frequency.exponentialRampToValueAtTime(340 * pitch, now + 0.17);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.38 * vol, now + 0.035);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(dest);
    noise.start(now, timbre * 0.8);
    noise.stop(now + 0.2);

    // 2. Metallic steel edge ring
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const baseFreq = (740 + timbre * 360) * pitch;
    osc.frequency.setValueAtTime(baseFreq * 1.4, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.14);

    const oGain = ctx.createGain();
    oGain.gain.setValueAtTime(0.001, now);
    oGain.gain.linearRampToValueAtTime(0.18 * vol, now + 0.015);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oGain);
    oGain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.16);

    return 0.21;
  }

  private synthBulletShot(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. Punchy transient crack
    const crack = this.createNoiseSource(ctx, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(1.1, now);
    bp.frequency.setValueAtTime((2400 + timbre * 900) * pitch, now);
    bp.frequency.exponentialRampToValueAtTime(520 * pitch, now + 0.09);

    const shaper = this.makeShaper(ctx, false);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.48 * vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    crack.connect(bp);
    bp.connect(shaper);
    shaper.connect(nGain);
    nGain.connect(dest);
    crack.start(now, timbre * 0.9);
    crack.stop(now + 0.12);

    // 2. Mechanical chamber punch (fast downward pitch drop)
    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime((280 + timbre * 90) * pitch, now);
    body.frequency.exponentialRampToValueAtTime(58 * pitch, now + 0.065);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, now);

    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(0.36 * vol, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    body.connect(lp);
    lp.connect(bGain);
    bGain.connect(dest);
    body.start(now);
    body.stop(now + 0.085);

    return 0.13;
  }

  private synthShotgunBlast(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. Deep cannon-like low thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime((155 + timbre * 30) * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(34 * pitch, now + 0.18);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.65 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

    sub.connect(subGain);
    subGain.connect(dest);
    sub.start(now);
    sub.stop(now + 0.22);

    // 2. Wide crunchy distorted blast noise
    const blast = this.createNoiseSource(ctx, false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime((3600 + timbre * 800) * pitch, now);
    lp.frequency.exponentialRampToValueAtTime(360, now + 0.24);

    const shaper = this.makeShaper(ctx, true);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.54 * vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    blast.connect(lp);
    lp.connect(shaper);
    shaper.connect(nGain);
    nGain.connect(dest);
    blast.start(now, timbre * 0.7);
    blast.stop(now + 0.28);

    // 3. Subtle mid-tail mechanical rattle
    const tail = this.createNoiseSource(ctx, true);
    const tailGain = ctx.createGain();
    tailGain.gain.setValueAtTime(0.32 * vol, now + 0.01);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
    tail.connect(tailGain);
    tailGain.connect(dest);
    tail.start(now, timbre * 0.5);
    tail.stop(now + 0.31);

    return 0.32;
  }

  private synthCrossbowTwang(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. Elastic bowstring twang with pitch glide
    const str = ctx.createOscillator();
    str.type = 'triangle';
    const f0 = (310 + timbre * 130) * pitch;
    str.frequency.setValueAtTime(f0 * 1.55, now);
    str.frequency.exponentialRampToValueAtTime(f0 * 0.78, now + 0.045);
    str.frequency.exponentialRampToValueAtTime(f0 * 0.92, now + 0.14);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(3.2, now);
    bp.frequency.setValueAtTime(f0 * 2.2, now);

    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.45 * vol, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    str.connect(bp);
    bp.connect(sGain);
    sGain.connect(dest);
    str.start(now);
    str.stop(now + 0.18);

    // 2. Crisp latch snap + bolt zip
    const zip = this.createNoiseSource(ctx, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2200 * pitch, now);

    const zGain = ctx.createGain();
    zGain.gain.setValueAtTime(0.28 * vol, now);
    zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    zip.connect(hp);
    hp.connect(zGain);
    zGain.connect(dest);
    zip.start(now, timbre * 0.6);
    zip.stop(now + 0.1);

    return 0.19;
  }

  private synthEnergyPlasma(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. High-voltage downward FM laser/plasma sweep
    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    const startHz = (1650 + timbre * 750) * pitch;
    carrier.frequency.setValueAtTime(startHz, now);
    carrier.frequency.exponentialRampToValueAtTime(210 * pitch, now + 0.14);

    const mod = ctx.createOscillator();
    mod.type = 'square';
    mod.frequency.setValueAtTime((120 + timbre * 90) * pitch, now);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(380 * pitch, now);
    modGain.gain.exponentialRampToValueAtTime(25, now + 0.13);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.0, now);
    bp.frequency.setValueAtTime(startHz * 0.9, now);
    bp.frequency.exponentialRampToValueAtTime(380 * pitch, now + 0.14);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.36 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    carrier.connect(bp);
    bp.connect(gain);
    gain.connect(dest);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 0.17);
    mod.stop(now + 0.17);

    // 2. Electric plasma crackle
    const hiss = this.createNoiseSource(ctx, false);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(3400, now);
    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(0.16 * vol, now);
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    hiss.connect(hp);
    hp.connect(hGain);
    hGain.connect(dest);
    hiss.start(now, timbre * 0.4);
    hiss.stop(now + 0.1);

    return 0.18;
  }

  private synthExplosiveLaunch(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number,
    timbre: number
  ): number {
    // 1. Pneumatic grenade/rocket tube thump ("THWUMP")
    const tube = ctx.createOscillator();
    tube.type = 'triangle';
    tube.frequency.setValueAtTime((190 + timbre * 40) * pitch, now);
    tube.frequency.exponentialRampToValueAtTime(46 * pitch, now + 0.14);

    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.56 * vol, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    tube.connect(tGain);
    tGain.connect(dest);
    tube.start(now);
    tube.stop(now + 0.19);

    // 2. Rocket propellant whoosh ignite
    const hiss = this.createNoiseSource(ctx, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(1.4, now);
    bp.frequency.setValueAtTime(620 * pitch, now);
    bp.frequency.exponentialRampToValueAtTime(1400 * pitch, now + 0.18);

    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(0.001, now);
    hGain.gain.linearRampToValueAtTime(0.32 * vol, now + 0.025);
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    hiss.connect(bp);
    bp.connect(hGain);
    hGain.connect(dest);
    hiss.start(now, timbre * 0.3);
    hiss.stop(now + 0.26);

    return 0.27;
  }

  public playMeleeSlash(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return this.synthMeleeSwing(
      ctx,
      dest,
      ctx.currentTime,
      clamp(opts.pitch ?? 1.08, 0.5, 2.0),
      clamp(opts.volume ?? 0.9, 0.05, 1.5),
      hashUnit(opts.seed ?? 77)
    );
  }

  public playProjectileHit(dest: AudioNode, isWall: boolean, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.5, 2.0);
    const vol = clamp(opts.volume ?? 0.65, 0.05, 1.5);

    if (isWall) {
      // Crisp stone/metal ricochet tick
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1450 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(420 * pitch, now + 0.045);

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(700, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      osc.connect(hp);
      hp.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.065);
      return 0.07;
    }

    const noise = this.createNoiseSource(ctx, false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200 * pitch, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    noise.connect(lp);
    lp.connect(gain);
    gain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.055);
    return 0.06;
  }

  public playWallCrack(dest: AudioNode, ratio: number, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.5, 2.0) * (0.85 + clamp(ratio, 0, 1) * 0.35);
    const vol = clamp(opts.volume ?? 0.85, 0.05, 1.5);

    // Dry brittle rock-fracture snap
    const noise = this.createNoiseSource(ctx, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.4, now);
    bp.frequency.setValueAtTime(1100 * pitch, now);
    bp.frequency.exponentialRampToValueAtTime(340 * pitch, now + 0.11);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.42 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    noise.start(now);
    noise.stop(now + 0.14);

    // Low concrete knock
    const thud = ctx.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(150 * pitch, now);
    thud.frequency.exponentialRampToValueAtTime(62 * pitch, now + 0.07);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.32 * vol, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    thud.connect(tGain);
    tGain.connect(dest);
    thud.start(now);
    thud.stop(now + 0.09);

    return 0.15;
  }

  public playWallShatter(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.5, 1.8);
    const vol = clamp(opts.volume ?? 1.0, 0.05, 1.6);

    // 1. Heavy stone collapse sub impact
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.24);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.55 * vol, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
    sub.connect(sGain);
    sGain.connect(dest);
    sub.start(now);
    sub.stop(now + 0.28);

    // 2. Cascading masonry debris crunch (3 staggered rock chunks)
    const offsets = [0, 0.05, 0.12];
    const freqs = [950, 720, 540];
    for (let i = 0; i < offsets.length; i++) {
      const t = now + offsets[i];
      const debris = this.createNoiseSource(ctx, i === 0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(1.5, t);
      bp.frequency.setValueAtTime(freqs[i] * pitch, t);
      bp.frequency.exponentialRampToValueAtTime(220, t + 0.22);

      const shaper = this.makeShaper(ctx, false);
      const dGain = ctx.createGain();
      dGain.gain.setValueAtTime((0.44 - i * 0.09) * vol, t);
      dGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

      debris.connect(bp);
      bp.connect(shaper);
      shaper.connect(dGain);
      dGain.connect(dest);
      debris.start(t, i * 0.25);
      debris.stop(t + 0.26);
    }

    return 0.4;
  }

  public playExplosion(
    dest: AudioNode,
    radius: number,
    element: ElementType,
    intensity: number,
    opts: SfxPlayOptions = {}
  ): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const scale = clamp((radius / 56) * 0.65 + intensity * 0.35, 0.55, 1.55);
    const pitch = clamp(opts.pitch ?? 1, 0.6, 1.6) / Math.sqrt(scale);
    const vol = clamp((opts.volume ?? 1) * clamp(scale, 0.7, 1.25), 0.1, 1.6);
    const dur = 0.38 * scale;

    // 1. Seismic sub detonation
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(128 * pitch, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + dur);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.74 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.06);

    sub.connect(subGain);
    subGain.connect(dest);
    sub.start(now);
    sub.stop(now + dur + 0.08);

    // 2. Distorted shockwave roar
    const noise = this.createNoiseSource(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400 * pitch, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + dur + 0.08);

    const shaper = this.makeShaper(ctx, true);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.62 * vol, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.1);

    noise.connect(lp);
    lp.connect(shaper);
    shaper.connect(nGain);
    nGain.connect(dest);
    noise.start(now);
    noise.stop(now + dur + 0.12);

    // 3. Elemental overlay
    if (element === 'freeze') {
      this.addCrystalShimmer(ctx, dest, now, pitch * 1.4, vol * 0.45);
    } else if (element === 'lightning') {
      const zap = ctx.createOscillator();
      zap.type = 'sawtooth';
      zap.frequency.setValueAtTime(1900 * pitch, now);
      zap.frequency.exponentialRampToValueAtTime(160, now + 0.18);
      const zGain = ctx.createGain();
      zGain.gain.setValueAtTime(0.28 * vol, now);
      zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      zap.connect(zGain);
      zGain.connect(dest);
      zap.start(now);
      zap.stop(now + 0.21);
    } else if (element === 'acid' || element === 'radioactive') {
      const sizzle = this.createNoiseSource(ctx, false);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(5.5, now);
      bp.frequency.setValueAtTime(element === 'acid' ? 1600 : 2800, now);
      bp.frequency.exponentialRampToValueAtTime(520, now + 0.3);
      const aGain = ctx.createGain();
      aGain.gain.setValueAtTime(0.26 * vol, now);
      aGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      sizzle.connect(bp);
      bp.connect(aGain);
      aGain.connect(dest);
      sizzle.start(now);
      sizzle.stop(now + 0.34);
    }

    return dur + 0.14;
  }

  public playEnemyHit(
    dest: AudioNode,
    isCrit: boolean,
    element: ElementType,
    opts: SfxPlayOptions = {}
  ): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.6, 1.8);
    const vol = clamp(opts.volume ?? 0.78, 0.05, 1.5);

    // Tactile meaty hit thwack
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime((isCrit ? 340 : 210) * pitch, now);
    body.frequency.exponentialRampToValueAtTime(68 * pitch, now + 0.06);

    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime((isCrit ? 0.42 : 0.3) * vol, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    body.connect(bGain);
    bGain.connect(dest);
    body.start(now);
    body.stop(now + 0.08);

    // Crisp impact snap
    const snap = this.createNoiseSource(ctx, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.0, now);
    bp.frequency.setValueAtTime((isCrit ? 2900 : 1700) * pitch, now);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime((isCrit ? 0.32 : 0.2) * vol, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    snap.connect(bp);
    bp.connect(sGain);
    sGain.connect(dest);
    snap.start(now);
    snap.stop(now + 0.06);

    if (isCrit) {
      // Metallic crit zing
      const zing = ctx.createOscillator();
      zing.type = 'sine';
      zing.frequency.setValueAtTime(1320 * pitch, now);
      zing.frequency.exponentialRampToValueAtTime(1980 * pitch, now + 0.075);
      const zGain = ctx.createGain();
      zGain.gain.setValueAtTime(0.24 * vol, now);
      zGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      zing.connect(zGain);
      zGain.connect(dest);
      zing.start(now);
      zing.stop(now + 0.1);
    } else if (element === 'freeze') {
      const ice = ctx.createOscillator();
      ice.type = 'sine';
      ice.frequency.setValueAtTime(2200 * pitch, now);
      const iGain = ctx.createGain();
      iGain.gain.setValueAtTime(0.12 * vol, now);
      iGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      ice.connect(iGain);
      iGain.connect(dest);
      ice.start(now);
      ice.stop(now + 0.07);
    }

    return 0.11;
  }

  public playEnemyDeath(
    dest: AudioNode,
    overkill: boolean,
    isBoss: boolean,
    opts: SfxPlayOptions = {}
  ): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.5, 1.8);
    const vol = clamp(opts.volume ?? 0.9, 0.05, 1.6);

    if (isBoss) {
      return this.playBossDefeated(dest, opts);
    }

    if (overkill) {
      // Juicy overkill gore splat: squelchy resonant bursts + deep pop
      const pop = ctx.createOscillator();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(240 * pitch, now);
      pop.frequency.exponentialRampToValueAtTime(42, now + 0.14);
      const pGain = ctx.createGain();
      pGain.gain.setValueAtTime(0.55 * vol, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      pop.connect(pGain);
      pGain.connect(dest);
      pop.start(now);
      pop.stop(now + 0.18);

      // Wet squelch burst 1 & 2
      for (let i = 0; i < 2; i++) {
        const t = now + i * 0.045;
        const splat = this.createNoiseSource(ctx, false);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.setValueAtTime(4.8, t);
        bp.frequency.setValueAtTime((980 - i * 260) * pitch, t);
        bp.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.14);

        const shaper = this.makeShaper(ctx, false);
        const g = ctx.createGain();
        g.gain.setValueAtTime((0.46 - i * 0.12) * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);

        splat.connect(bp);
        bp.connect(shaper);
        shaper.connect(g);
        g.connect(dest);
        splat.start(t, i * 0.33);
        splat.stop(t + 0.19);
      }
      return 0.25;
    }

    // Standard enemy death crunch + power-down drop
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(52 * pitch, now + 0.16);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(920, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.16);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32 * vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.19);

    return 0.2;
  }

  public playPlayerHit(dest: AudioNode, damage: number, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const intensity = clamp(0.75 + damage * 0.02, 0.75, 1.35);
    const vol = clamp((opts.volume ?? 1.0) * intensity, 0.1, 1.6);

    // Visceral low chest thud + armor scrape
    const thud = ctx.createOscillator();
    thud.type = 'sawtooth';
    thud.frequency.setValueAtTime(165, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(620, now);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.55 * vol, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    thud.connect(lp);
    lp.connect(tGain);
    tGain.connect(dest);
    thud.start(now);
    thud.stop(now + 0.22);

    // Dissonant cyber warning sting
    const sting = ctx.createOscillator();
    sting.type = 'square';
    sting.frequency.setValueAtTime(311, now);
    sting.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.2 * vol, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    sting.connect(sGain);
    sGain.connect(dest);
    sting.start(now);
    sting.stop(now + 0.14);

    return 0.23;
  }

  public playPlayerDeath(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.0, 0.1, 1.6);

    // Heavy Norse funeral horn power-down
    const notes = [146.83, 138.59, 110.0]; // D3 -> C#3 -> A2
    notes.forEach((hz, idx) => {
      const t = now + idx * 0.22;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, t);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.92, t + 0.35);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(750 - idx * 140, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 0.42);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.38 * vol, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(lp);
      lp.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.48);
    });

    return 0.95;
  }

  public playAbility(dest: AudioNode, outcastId: OutcastId, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.7, 1.4);
    const vol = clamp(opts.volume ?? 0.95, 0.1, 1.5);

    switch (outcastId) {
      case 'britta': {
        // Pneumatic cyber-dash jet hiss + punch
        const jet = this.createNoiseSource(ctx, false);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.setValueAtTime(1.8, now);
        bp.frequency.setValueAtTime(600 * pitch, now);
        bp.frequency.exponentialRampToValueAtTime(2800 * pitch, now + 0.11);
        bp.frequency.exponentialRampToValueAtTime(420, now + 0.24);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.45 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        jet.connect(bp);
        bp.connect(g);
        g.connect(dest);
        jet.start(now);
        jet.stop(now + 0.27);
        return 0.28;
      }
      case 'leifi': {
        // Horn Shield metallic gong + low barrier hum
        const gong = ctx.createOscillator();
        gong.type = 'triangle';
        gong.frequency.setValueAtTime(293.66 * pitch, now);
        gong.frequency.exponentialRampToValueAtTime(220 * pitch, now + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.45 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        gong.connect(g);
        g.connect(dest);
        gong.start(now);
        gong.stop(now + 0.36);
        return 0.37;
      }
      case 'gustaf': {
        // Ghost Walk spectral phase shimmer
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(980 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(260 * pitch, now + 0.28);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.32 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.32);
        return 0.33;
      }
      case 'einar':
      case 'gunilla': {
        // Crisp mechanical dual-click servo / twin-slide rack
        for (let i = 0; i < 2; i++) {
          const t = now + i * 0.06;
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.setValueAtTime((520 + i * 260) * pitch, t);
          osc.frequency.exponentialRampToValueAtTime(220 * pitch, t + 0.05);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.28 * vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(g);
          g.connect(dest);
          osc.start(t);
          osc.stop(t + 0.07);
        }
        return 0.16;
      }
      case 'trulls': {
        // Swirling vortex sweep
        const n = this.createNoiseSource(ctx, true);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.setValueAtTime(5.0, now);
        bp.frequency.setValueAtTime(300 * pitch, now);
        bp.frequency.exponentialRampToValueAtTime(1400 * pitch, now + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.42 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        n.connect(bp);
        bp.connect(g);
        g.connect(dest);
        n.start(now);
        n.stop(now + 0.34);
        return 0.35;
      }
      case 'stellan': {
        // Heavy iron wrecking ball swing
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(85 * pitch, now + 0.22);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.38 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.27);
        return 0.28;
      }
      case 'hilda': {
        // Organic druidic sprout chime
        const freqs = [392, 523.25, 659.25];
        freqs.forEach((f, idx) => {
          const t = now + idx * 0.04;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f * pitch, t);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.24 * vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(g);
          g.connect(dest);
          osc.start(t);
          osc.stop(t + 0.18);
        });
        return 0.28;
      }
    }
  }

  public playPower(dest: AudioNode, outcastId: OutcastId, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.05, 0.1, 1.6);
    void outcastId;

    // Epic Norse Berserk Power Activation Roar!
    // 1. Sub shock boom
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.45);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.65 * vol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    sub.connect(subGain);
    subGain.connect(dest);
    sub.start(now);
    sub.stop(now + 0.52);

    // 2. Distorted Norse power-chord roar (D2 + A2 + D3)
    const chord = [73.42, 110.0, 146.83];
    const shaper = this.makeShaper(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, now);
    lp.frequency.exponentialRampToValueAtTime(2600, now + 0.16);
    lp.frequency.exponentialRampToValueAtTime(520, now + 0.58);

    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.001, now);
    cGain.gain.linearRampToValueAtTime(0.38 * vol, now + 0.05);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    shaper.connect(lp);
    lp.connect(cGain);
    cGain.connect(dest);

    for (const hz of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz * 0.96, now);
      osc.frequency.linearRampToValueAtTime(hz, now + 0.09);
      osc.connect(shaper);
      osc.start(now);
      osc.stop(now + 0.64);
    }

    // 3. Guttural filtered roar noise burst
    const roar = this.createNoiseSource(ctx, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(3.2, now);
    bp.frequency.setValueAtTime(360, now);
    bp.frequency.exponentialRampToValueAtTime(1100, now + 0.2);
    bp.frequency.exponentialRampToValueAtTime(280, now + 0.55);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.36 * vol, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    roar.connect(bp);
    bp.connect(rGain);
    rGain.connect(dest);
    roar.start(now);
    roar.stop(now + 0.6);

    return 0.66;
  }

  public playPickup(dest: AudioNode, kind: PickupState['kind'], opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.7, 1.5);
    const vol = clamp(opts.volume ?? 0.78, 0.05, 1.5);

    if (kind === 'gold' || kind === 'chest_gold') {
      const notes = kind === 'chest_gold' ? [987.77, 1318.51, 1567.98] : [1046.5, 1396.91];
      notes.forEach((hz, i) => {
        const t = now + i * 0.045;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(hz * pitch, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.26 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.12);
      });
      return 0.22;
    }

    if (kind === 'hp') {
      const notes = [440, 554.37, 659.25];
      notes.forEach((hz, i) => {
        const t = now + i * 0.05;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(hz * pitch, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.28 * vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(g);
        g.connect(dest);
        osc.start(t);
        osc.stop(t + 0.15);
      });
      return 0.26;
    }

    if (kind === 'ammo') {
      // Crisp mechanical clip click
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(420 * pitch, now);
      osc.frequency.setValueAtTime(680 * pitch, now + 0.03);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.095);
      return 0.1;
    }

    if (kind === 'xp') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(1180 * pitch, now + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.09);
      return 0.1;
    }

    // weapon / mod / chest_weapon / chest_mod
    const triad = [293.66, 440.0, 587.33, 880.0];
    triad.forEach((hz, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz * pitch, t);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(lp);
      lp.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.21);
    });
    return 0.42;
  }

  public playLevelUp(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.0, 0.1, 1.6);

    // Glorious Norse War-Horn (Lur) Fanfare: D3 -> A3 -> D4 -> F4 -> A4!
    const sequence = [
      { hz: 146.83, t: 0.0, dur: 0.2 },
      { hz: 220.0, t: 0.11, dur: 0.22 },
      { hz: 293.66, t: 0.22, dur: 0.25 },
      { hz: 349.23, t: 0.34, dur: 0.26 },
      { hz: 440.0, t: 0.46, dur: 0.56 },
    ];

    for (const note of sequence) {
      const t = now + note.t;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.setValueAtTime(1.8, t);
      lp.frequency.setValueAtTime(420, t);
      lp.frequency.exponentialRampToValueAtTime(2100, t + 0.08);
      lp.frequency.exponentialRampToValueAtTime(780, t + note.dur);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.28 * vol, t + 0.035);
      g.gain.exponentialRampToValueAtTime(0.001, t + note.dur);

      lp.connect(g);
      g.connect(dest);

      // Dual slightly-detuned brass saws for rich Norse horn timbre
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(note.hz, t);
        osc.detune.setValueAtTime(detune, t);
        osc.connect(lp);
        osc.start(t);
        osc.stop(t + note.dur + 0.03);
      }
    }

    // Heroic war-drum timpani hit on the climax
    const drum = ctx.createOscillator();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(110, now + 0.46);
    drum.frequency.exponentialRampToValueAtTime(44, now + 0.82);
    const dGain = ctx.createGain();
    dGain.gain.setValueAtTime(0.5 * vol, now + 0.46);
    dGain.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
    drum.connect(dGain);
    dGain.connect(dest);
    drum.start(now + 0.46);
    drum.stop(now + 0.9);

    return 1.05;
  }

  public playBossSpawn(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.05, 0.1, 1.6);

    // Ominous mechanical Gjallarhorn blast (D2 + Ab2 tritone!)
    const shaper = this.makeShaper(ctx, false);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(280, now);
    lp.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
    lp.frequency.exponentialRampToValueAtTime(340, now + 1.0);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.45 * vol, now + 0.14);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.05);

    shaper.connect(lp);
    lp.connect(g);
    g.connect(dest);

    for (const hz of [73.42, 74.1, 103.83]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, now);
      osc.connect(shaper);
      osc.start(now);
      osc.stop(now + 1.08);
    }

    return 1.1;
  }

  public playBossPhase2(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.1, 0.1, 1.6);

    // 1. Industrial warning siren sweep (2 urgent rises)
    const siren = ctx.createOscillator();
    siren.type = 'sawtooth';
    siren.frequency.setValueAtTime(340, now);
    siren.frequency.exponentialRampToValueAtTime(920, now + 0.34);
    siren.frequency.exponentialRampToValueAtTime(380, now + 0.54);
    siren.frequency.exponentialRampToValueAtTime(1060, now + 0.86);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2.6, now);
    bp.frequency.setValueAtTime(760, now);

    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.001, now);
    sGain.gain.linearRampToValueAtTime(0.36 * vol, now + 0.08);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.96);

    siren.connect(bp);
    bp.connect(sGain);
    sGain.connect(dest);
    siren.start(now);
    siren.stop(now + 0.98);

    // 2. Massive cyber-beast distorted roar + shockwave
    const roar = this.createNoiseSource(ctx, true);
    const shaper = this.makeShaper(ctx, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, now);
    lp.frequency.exponentialRampToValueAtTime(260, now + 0.95);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.55 * vol, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.98);

    roar.connect(shaper);
    shaper.connect(lp);
    lp.connect(rGain);
    rGain.connect(dest);
    roar.start(now);
    roar.stop(now + 1.0);

    return 1.02;
  }

  public playBossDefeated(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 1.1, 0.1, 1.6);

    // Seismic detonation + triumphant Nordic chord swell (D3 + A3 + D4 + F#4)
    this.playExplosion(dest, 110, 'explosive', 1.4, { volume: vol * 0.85 });

    const chord = [146.83, 220.0, 293.66, 369.99];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, now + 0.12);
    lp.frequency.exponentialRampToValueAtTime(2400, now + 0.45);
    lp.frequency.exponentialRampToValueAtTime(600, now + 1.25);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now + 0.1);
    g.gain.linearRampToValueAtTime(0.32 * vol, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

    lp.connect(g);
    g.connect(dest);

    for (const hz of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, now + 0.1);
      osc.connect(lp);
      osc.start(now + 0.1);
      osc.stop(now + 1.34);
    }

    return 1.35;
  }

  public playPortalOpen(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp(opts.volume ?? 0.9, 0.1, 1.5);

    // Shimmering Bifrost Lydian cascade
    const notes = [293.66, 369.99, 440.0, 554.37, 587.33, 739.99, 880.0];
    notes.forEach((hz, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.34);
    });
    return 0.72;
  }

  public playFreezeWarning(dest: AudioNode, intensity: number, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const vol = clamp((opts.volume ?? 0.85) * clamp(0.6 + intensity * 0.5, 0.6, 1.25), 0.1, 1.5);

    // Chilling howling Fimbulwinter gust + brittle ice crackle
    const wind = this.createNoiseSource(ctx, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(6.0, now);
    bp.frequency.setValueAtTime(850, now);
    bp.frequency.exponentialRampToValueAtTime(2200, now + 0.25);
    bp.frequency.exponentialRampToValueAtTime(680, now + 0.58);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.32 * vol, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    wind.connect(bp);
    bp.connect(g);
    g.connect(dest);
    wind.start(now);
    wind.stop(now + 0.62);

    this.addCrystalShimmer(ctx, dest, now + 0.04, 1.0, vol * 0.55);
    return 0.64;
  }

  public playFreezeCrystal(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.7, 1.5);
    const vol = clamp(opts.volume ?? 0.82, 0.1, 1.5);
    this.addCrystalShimmer(ctx, dest, now, pitch, vol);
    return 0.36;
  }

  private addCrystalShimmer(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    pitch: number,
    vol: number
  ): void {
    const chimes = [1760, 2349.32, 3135.96];
    chimes.forEach((hz, idx) => {
      const t = now + idx * 0.032;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz * pitch, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playShellEject(dest: AudioNode, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.7, 1.5);
    const vol = clamp(opts.volume ?? 0.3, 0.02, 0.8);

    // Subtle brass casing clink
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3400 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(2600 * pitch, now + 0.035);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.05);
    return 0.055;
  }

  public playFootstep(dest: AudioNode, biomeId: string, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.7, 1.4);
    const vol = clamp(opts.volume ?? 0.22, 0.02, 0.7);

    const isIceOrSnow = biomeId.includes('ice') || biomeId.includes('jotun') || biomeId.includes('cold');
    const isWet = biomeId.includes('sewer') || biomeId.includes('swamp') || biomeId.includes('sulfur');
    const centerHz = isIceOrSnow ? 1900 : isWet ? 780 : 540;

    const noise = this.createNoiseSource(ctx, !isIceOrSnow);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(isWet ? 3.5 : 1.8, now);
    bp.frequency.setValueAtTime(centerHz * pitch, now);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

    noise.connect(bp);
    bp.connect(g);
    g.connect(dest);
    noise.start(now);
    noise.stop(now + 0.055);
    return 0.06;
  }

  public playUi(dest: AudioNode, kind: UiSoundKind, opts: SfxPlayOptions = {}): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const pitch = clamp(opts.pitch ?? 1, 0.75, 1.4);
    const vol = clamp(opts.volume ?? 0.75, 0.05, 1.4);

    switch (kind) {
      case 'hover': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(1120 * pitch, now + 0.02);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
        osc.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.032);
        return 0.035;
      }
      case 'click': {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(660 * pitch, now);
        osc.frequency.exponentialRampToValueAtTime(320 * pitch, now + 0.04);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2200, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.24 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(lp);
        lp.connect(g);
        g.connect(dest);
        osc.start(now);
        osc.stop(now + 0.055);
        return 0.06;
      }
      case 'confirm': {
        const notes = [587.33, 880.0];
        notes.forEach((hz, i) => {
          const t = now + i * 0.045;
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(hz * pitch, t);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.26 * vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
          osc.connect(g);
          g.connect(dest);
          osc.start(t);
          osc.stop(t + 0.12);
        });
        return 0.18;
      }
      case 'error': {
        for (let i = 0; i < 2; i++) {
          const t = now + i * 0.075;
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime((190 - i * 32) * pitch, t);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(750, t);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.28 * vol, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.068);
          osc.connect(lp);
          lp.connect(g);
          g.connect(dest);
          osc.start(t);
          osc.stop(t + 0.075);
        }
        return 0.17;
      }
      case 'levelup':
        return this.playLevelUp(dest, opts);
    }
  }
}
