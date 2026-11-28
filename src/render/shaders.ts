// ============================================================================
// KRUNKEDFALL — WebGL2 GLSL ES 3.00 Shader Suite (6-Pass 640x360 Pipeline)
// ============================================================================
// Parity shader stack:
//   1. Sprite / World / Tiles / FX (hit-flash, golden shimmer, Bifrost vortex,
//      lava thermal flow, deep-water caustics, shadow silhouette, Phase 2 glow)
//   2. Persistent Floor Decal Decay (sh_trails_fade parity)
//   3. Dynamic 2D Additive Point Lights (sh_add_light parity)
//   4. Lighting & Emissive Composite (sh_lighting parity)
//   5. Title Screen Norse Menu Aurora (shMenuAurora parity)
//   6. Post FX & Crisp Nearest-Neighbor Upscaler (sh_shockwave, sh_frost,
//      sh_snow_gusts, trauma shake, hit/power vignette)

export const FX_MODE_NORMAL = 0;
export const FX_MODE_GOLDEN = 1;
export const FX_MODE_BIFROST = 2;
export const FX_MODE_LAVA = 3;
export const FX_MODE_WATER = 4;
export const FX_MODE_OVERDRIVE = 5;
export const FX_MODE_SHADOW = 6;
export const FX_MODE_GIB_GLOW = 7;

export interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

// ----------------------------------------------------------------------------
// 1. SPRITE & WORLD SHADER (Pass 1, Pass 2 stamps, Pass 3 shadows, Pass 4)
// ----------------------------------------------------------------------------

const SPRITE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aExtra; // x = hitFlash (0..1), y = fxMode

uniform mat4 uProj;

out vec2 vUV;
out vec4 vColor;
out vec2 vExtra;
out vec2 vWorldPos;

void main() {
  vUV = aUV;
  vColor = aColor;
  vExtra = aExtra;
  vWorldPos = aPos;
  gl_Position = uProj * vec4(aPos, 0.0, 1.0);
}
`;

const SPRITE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
in vec4 vColor;
in vec2 vExtra;
in vec2 vWorldPos;

uniform sampler2D uTex;
uniform float uTime;

out vec4 outColor;

vec3 rainbow(float t) {
  return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  int mode = int(vExtra.y + 0.5);
  vec2 uv = vUV;

  // Lava lake thermal heat ripple (sh_surtur_lava_lake parity)
  if (mode == 3) {
    float ripple = sin(vWorldPos.y * 0.25 + uTime * 3.8) * 0.0016;
    float rippleY = cos(vWorldPos.x * 0.22 - uTime * 2.9) * 0.0014;
    uv += vec2(ripple, rippleY);
  }
  // Deep water / acid caustic distortion (sh_deep_water_distort parity)
  else if (mode == 4) {
    float wave = sin(vWorldPos.x * 0.30 + uTime * 3.2) * 0.0015;
    float waveY = sin(vWorldPos.y * 0.28 + uTime * 2.4) * 0.0012;
    uv += vec2(wave, waveY);
  }

  vec4 tex = texture(uTex, uv);
  if (tex.a <= 0.01) discard;

  // Pass 3 grounded shadow silhouette mode
  if (mode == 6) {
    outColor = vec4(vColor.rgb, tex.a * vColor.a);
    return;
  }

  vec4 col = tex * vColor;

  // Golden weapon shimmer
  if (mode == 1) {
    float gleam = smoothstep(0.65, 1.0, sin((vWorldPos.x + vWorldPos.y) * 0.18 - uTime * 6.0));
    col.rgb = mix(col.rgb, vec3(1.0, 0.94, 0.62), gleam * 0.55);
  }
  // Bifrost rainbow vortex shimmer (sh_bifrost parity)
  else if (mode == 2) {
    float angle = atan(vWorldPos.y, vWorldPos.x);
    float band = fract(uTime * 0.75 + (vWorldPos.x - vWorldPos.y) * 0.025 + angle * 0.15);
    vec3 prism = rainbow(band);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = mix(col.rgb, prism * (0.75 + 0.55 * lum), 0.65);
  }
  // Lava incandescent pulse
  else if (mode == 3) {
    float hot = 0.5 + 0.5 * sin(vWorldPos.x * 0.14 + vWorldPos.y * 0.14 - uTime * 4.5);
    col.rgb += vec3(0.22, 0.07, 0.0) * hot;
  }
  // Deep water caustic sparkle
  else if (mode == 4) {
    float caustic = pow(max(0.0, sin(vWorldPos.x * 0.25 + uTime * 2.8) * cos(vWorldPos.y * 0.25 - uTime * 2.1)), 3.0);
    col.rgb += vec3(0.18, 0.34, 0.42) * caustic;
  }
  // Boss Phase 2 overdrive & glowing eye pulse (sh_eyeglow parity)
  else if (mode == 5) {
    float pulse = 0.5 + 0.5 * sin(uTime * 10.0 + vWorldPos.y * 0.25);
    float lum = dot(tex.rgb, vec3(0.3, 0.59, 0.11));
    if (lum > 0.68) {
      col.rgb = mix(col.rgb, vec3(1.0, 0.85, 0.95), 0.35 * pulse);
    } else {
      col.rgb += vec3(0.16, 0.02, 0.12) * pulse;
    }
  }
  // Overkill gib bright edge spark (sh_sprite_split parity)
  else if (mode == 7) {
    col.rgb += vec3(0.22, 0.04, 0.06);
  }

  // 1-tick pure-white hit flash
  if (vExtra.x > 0.001) {
    col.rgb = mix(col.rgb, vec3(1.0, 1.0, 1.0), clamp(vExtra.x, 0.0, 1.0));
  }

  outColor = col;
}
`;

// ----------------------------------------------------------------------------
// FULLSCREEN QUAD VERTEX SHADER (Shared by Passes 2, 5-composite, 6, Aurora)
// ----------------------------------------------------------------------------

const FULLSCREEN_VS = `#version 300 es
precision highp float;

out vec2 vUV;

void main() {
  // Fullscreen triangle covering clip space (-1..1) with zero VBO needed
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  vUV = vec2(x, y) * 0.5 + 0.5;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

// ----------------------------------------------------------------------------
// 2. PERSISTENT FLOOR DECAL FADE SHADER (sh_trails_fade parity)
// ----------------------------------------------------------------------------

const DECAL_FADE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uTex;
uniform float uDecay;

out vec4 outColor;

void main() {
  vec4 c = texture(uTex, vUV);
  float nextA = max(0.0, c.a * uDecay - 0.002);
  if (nextA < 0.01) {
    outColor = vec4(0.0);
  } else {
    outColor = vec4(c.rgb, nextA);
  }
}
`;

// ----------------------------------------------------------------------------
// 3. DYNAMIC 2D ADDITIVE POINT LIGHT SHADER (sh_add_light parity)
// ----------------------------------------------------------------------------

const LIGHT_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aLocalUV; // -1..1
layout(location = 2) in vec4 aColor;   // rgb = light color, a = intensity
layout(location = 3) in vec2 aExtra;   // x = falloffPower, y = flickerPhase

uniform mat4 uProj;

out vec2 vLocalUV;
out vec4 vColor;
out vec2 vExtra;

void main() {
  vLocalUV = aLocalUV;
  vColor = aColor;
  vExtra = aExtra;
  gl_Position = uProj * vec4(aPos, 0.0, 1.0);
}
`;

const LIGHT_FS = `#version 300 es
precision highp float;

in vec2 vLocalUV;
in vec4 vColor;
in vec2 vExtra;

uniform float uTime;

out vec4 outColor;

void main() {
  float d = length(vLocalUV);
  if (d >= 1.0) discard;
  float falloff = pow(1.0 - d, max(1.1, vExtra.x));
  // Subtle organic flicker when flickerPhase > 0
  float flicker = 1.0;
  if (vExtra.y > 0.01) {
    flicker = 0.92 + 0.08 * sin(uTime * 14.0 + vExtra.y * 19.3) * cos(uTime * 7.3 + vExtra.y);
  }
  float strength = falloff * vColor.a * flicker;
  outColor = vec4(vColor.rgb * strength, strength);
}
`;

// ----------------------------------------------------------------------------
// 4. LIGHTING & EMISSIVE COMPOSITE SHADER (sh_lighting parity)
// ----------------------------------------------------------------------------

const LIGHTING_COMPOSITE_FS = `#version 300 es
precision highp float;

in vec2 vUV;
uniform sampler2D uSceneTex;
uniform sampler2D uLightTex;

out vec4 outColor;

void main() {
  vec4 scene = texture(uSceneTex, vUV);
  vec4 light = texture(uLightTex, vUV);

  // Crisp selective pixel-emissive bloom from bright hot light sources (muzzle/lava/Bifrost/projectiles)
  vec2 texel = vec2(1.0 / 640.0, 1.0 / 360.0);
  vec3 bloom = max(texture(uLightTex, vUV + vec2(texel.x * 2.0, 0.0)).rgb - vec3(1.05), vec3(0.0))
             + max(texture(uLightTex, vUV - vec2(texel.x * 2.0, 0.0)).rgb - vec3(1.05), vec3(0.0))
             + max(texture(uLightTex, vUV + vec2(0.0, texel.y * 2.0)).rgb - vec3(1.05), vec3(0.0))
             + max(texture(uLightTex, vUV - vec2(0.0, texel.y * 2.0)).rgb - vec3(1.05), vec3(0.0));
  bloom *= 0.14;

  // Punchy heavy-metal shadow contrast while preserving crisp silhouette readability
  vec3 baseLight = clamp(light.rgb, vec3(0.36), vec3(2.15));
  vec3 overbright = max(light.rgb - vec3(1.0), vec3(0.0));
  vec3 lit = scene.rgb * baseLight + overbright * (0.34 + 0.60 * scene.rgb) + bloom;

  // Subtle vibrant heavy-metal S-curve contrast & saturation lift
  vec3 luma = vec3(dot(lit, vec3(0.299, 0.587, 0.114)));
  lit = mix(luma, lit, 1.10);
  lit = clamp(lit, vec3(0.0), vec3(1.0));
  outColor = vec4(lit, 1.0);
}
`;

// ----------------------------------------------------------------------------
// 5. TITLE SCREEN NORSE MENU AURORA SHADER (shMenuAurora parity)
// ----------------------------------------------------------------------------

const AURORA_FS = `#version 300 es
precision highp float;

in vec2 vUV;
uniform float uTime;
uniform vec2 uResolution;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise1d(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash21(vec2(i, 1.7)), hash21(vec2(i + 1.0, 1.7)), u);
}

float ridge(float x, float freq, float amp, float seed) {
  float h = sin(x * freq + seed) * 0.55
          + sin(x * freq * 2.13 - seed * 1.4) * 0.28
          + sin(x * freq * 4.71 + seed * 2.2) * 0.17;
  return (h * 0.5 + 0.5) * amp;
}

void main() {
  // Quantize strictly to native 640x360 pixel art grid
  vec2 px = floor(vUV * uResolution);
  vec2 uv = (px + 0.5) / uResolution;

  // Deep Arctic midnight twilight sky gradient
  vec3 skyBot = vec3(0.055, 0.125, 0.215);
  vec3 skyMid = vec3(0.028, 0.058, 0.135);
  vec3 skyTop = vec3(0.012, 0.016, 0.052);
  vec3 col = mix(skyBot, skyMid, smoothstep(0.06, 0.48, uv.y));
  col = mix(col, skyTop, smoothstep(0.48, 0.96, uv.y));

  // Gently attenuate stars behind the top emblem zone so the wordmark pops cleanly
  float titleBannerBand = smoothstep(0.66, 0.74, uv.y) * (1.0 - smoothstep(0.91, 0.96, uv.y));
  float starBannerAtten = 1.0 - 0.85 * titleBannerBand;

  // Fine 1px pixel stars with gentle twinkle & subtle color temperature variation
  vec2 starCell = floor(px);
  float starRnd = hash21(starCell);
  if (starRnd > 0.9968 && uv.y > 0.28) {
    float tw = 0.42 + 0.58 * sin(uTime * (2.2 + fract(starRnd * 31.0) * 2.5) + starRnd * 140.0);
    vec3 starTint = mix(vec3(0.68, 0.90, 1.0), vec3(1.0, 0.86, 0.68), fract(starRnd * 73.1));
    col += starTint * tw * 0.78 * smoothstep(0.28, 0.62, uv.y) * starBannerAtten;
  }

  // Sweeping multi-curtain Norse Aurora Borealis with silk vertical ray pillars
  float t = uTime * 0.34;
  vec3 aurora = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float waveX = uv.x * (2.6 + fi * 0.85) + t * (0.52 - fi * 0.14) + fi * 2.35;
    float curtainY = 0.46 + fi * 0.078
                   + sin(waveX) * 0.068
                   + cos(waveX * 1.72 - t * 0.88) * 0.032;
    float dy = uv.y - curtainY;
    // Sharp bright lower edge, tall silky upward fade
    float mask = exp(-abs(dy) * (dy > 0.0 ? 4.4 : 26.0));
    float rayFold = sin(uv.x * (36.0 + fi * 18.0) + sin(uv.x * 6.5 + t * 1.6) * 2.6 - t * 2.1);
    float rays = 0.58 + 0.42 * rayFold;
    float shimmer = 0.72 + 0.28 * noise1d(uv.x * 18.0 + t * 2.0 + fi * 11.0);
    float band = mask * rays * shimmer;

    vec3 lowC = mix(vec3(0.10, 0.96, 0.66), vec3(0.16, 0.86, 1.0), fi * 0.42);
    vec3 highC = mix(vec3(0.46, 0.22, 0.92), vec3(0.92, 0.24, 0.64), fi * 0.45);
    vec3 ribbonCol = mix(lowC, highC, clamp(dy * 3.8 + 0.18, 0.0, 1.0));
    aurora += ribbonCol * band * (0.64 - fi * 0.13);
  }
  // Subtle high-bit pixel-art tone stepping (smooth silk, zero harsh rings)
  aurora = floor(aurora * 28.0 + 0.5) / 28.0;
  col += aurora * 0.86;

  // Distant Bifrost Pillar & Horizon Pulse Beacon behind central fjord pass
  float pillarDx = abs(uv.x - 0.5);
  float bifrostBeam = exp(-pillarDx * 30.0) * smoothstep(0.10, 0.28, uv.y) * smoothstep(0.95, 0.28, uv.y);
  float beamShimmer = 0.75 + 0.25 * sin(uTime * 3.6 - uv.y * 16.0);
  vec3 beamPrism = mix(vec3(0.18, 0.92, 1.0), vec3(0.98, 0.42, 0.85), 0.5 + 0.5 * sin(uTime * 1.4 + uv.y * 5.0));
  col += beamPrism * bifrostBeam * beamShimmer * 0.42;

  float beaconDist = length((uv - vec2(0.5, 0.22)) * vec2(1.55, 1.10));
  float beacon = exp(-beaconDist * 4.2) * (0.62 + 0.20 * sin(uTime * 2.4));
  col += vec3(0.18, 0.86, 1.0) * beacon * 0.62;

  // Warm forge embers rising softly along the lower flanks (behind pixel-art cliffs)
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer + 1);
    vec2 snowPx = px + vec2(floor(uTime * (15.0 * fl)), floor(-uTime * (8.0 * fl)));
    float grid = 34.0 - fl * 8.0;
    vec2 cell = floor(snowPx / grid);
    vec2 local = mod(snowPx, grid);
    float rnd = hash21(cell + fl * 53.0);
    if (rnd > 0.945 && local.x < 1.0 && local.y < 1.0) {
      vec3 moteCol = rnd > 0.978 ? vec3(1.0, 0.62, 0.22) : vec3(0.84, 0.96, 1.0);
      col = mix(col, moteCol, (0.38 + fl * 0.14) * (0.35 + 0.65 * starBannerAtten));
    }
  }

  // Subtle dark edge vignette framing the composition
  vec2 vig = (uv - 0.5) * vec2(1.18, 1.28);
  col *= clamp(1.06 - dot(vig, vig) * 0.44, 0.48, 1.0);

  outColor = vec4(col, 1.0);
}
`;

// ----------------------------------------------------------------------------
// 6. SCREEN-SPACE POST FX & CRISP NEAREST UPSCALER (Pass 6)
// ----------------------------------------------------------------------------

const POST_FX_FS = `#version 300 es
precision highp float;

in vec2 vUV;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uShakeOffset;
uniform int uShockwaveCount;
uniform vec4 uShockwaves[8]; // xy = uv center, z = radius (uv), w = strength
uniform float uFrostIntensity; // 0..1 Fimbulwinter frost border
uniform float uSnowIntensity;  // 0..1 snowstorm diagonal gusts
uniform float uDamageFlash;    // 0..1 hit crimson pulse
uniform float uLowHpPulse;     // 0..1 critical HP heartbeat
uniform float uPowerGlow;      // 0..1 Outcast Power overdrive aura

out vec4 outColor;

float hash2(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  // Snap UV to exact 640x360 texel centers so upscaling is 100% razor-sharp!
  vec2 baseUV = (floor(vUV * uResolution) + 0.5) / uResolution;
  vec2 sampleUV = baseUV + uShakeOffset / uResolution;

  float shockRim = 0.0;
  float aspect = uResolution.x / uResolution.y;

  // Radial Shockwave Distortion rings (sh_shockwave parity)
  for (int i = 0; i < 8; i++) {
    if (i >= uShockwaveCount) break;
    vec4 sw = uShockwaves[i];
    vec2 delta = sampleUV - sw.xy;
    vec2 scaled = vec2(delta.x * aspect, delta.y);
    float dist = length(scaled);
    float ringDist = abs(dist - sw.z);
    float bandWidth = 0.045;
    if (ringDist < bandWidth && dist > 0.001) {
      float falloff = 1.0 - (ringDist / bandWidth);
      float push = sin(falloff * 3.14159) * sw.w * 0.018;
      vec2 dir = normalize(scaled);
      sampleUV -= vec2(dir.x / aspect, dir.y) * push;
      shockRim += falloff * sw.w * 0.35;
    }
  }

  // Re-quantize distorted UV to 640x360 grid to keep pixel-art crispness
  sampleUV = (floor(clamp(sampleUV, vec2(0.0005), vec2(0.9995)) * uResolution) + 0.5) / uResolution;
  vec3 col = texture(uTex, sampleUV).rgb;

  // Crisp bright rim glint along shockwave wavefront
  col += vec3(0.85, 0.92, 1.0) * shockRim;

  // Crisp 640x360-Quantized Diagonal Pixel Snow Gusts & Twinkling Flakes (sh_snow_gusts parity)
  if (uSnowIntensity > 0.01) {
    vec2 px = floor(vUV * uResolution);

    // 1. Razor-sharp 1px-2px diagonal blowing snow streaks (slope -1/2 across pixel grid)
    float diagCoord = floor(px.x + px.y * 2.0 + uTime * 250.0);
    float perpCoord = floor(px.y * 2.0 - px.x * 0.5);
    float laneIdx = floor(perpCoord / 7.0);
    float segIdx = floor(diagCoord / 44.0);
    float laneRnd = hash2(vec2(segIdx, laneIdx + 3.0));
    float inLane = step(mod(perpCoord, 7.0), 1.1);
    float dashLen = 8.0 + floor(laneRnd * 10.0);
    float diagStreak = step(0.74, laneRnd) * inLane * step(mod(diagCoord, 44.0), dashLen);

    // 2. Crisp pixel-stepped icy wind shear ribbons (zero blurry soft ellipses)
    float windRow = floor(px.y / 3.0);
    float windShift = px.x + floor(px.y * 0.5) + floor(uTime * 190.0);
    float windCell = floor(windShift / 40.0);
    float windRnd = hash2(vec2(windCell, windRow + 29.0));
    float windBand = step(0.84, windRnd)
                   * step(mod(px.y, 3.0), 0.9)
                   * step(mod(windShift, 40.0), 14.0 + floor(windRnd * 8.0));

    // 3. Multi-layer twinkling 1px & 2x2 pixel snowflakes
    vec2 flPx1 = px + vec2(floor(uTime * 175.0), floor(-uTime * 86.0));
    vec2 cell1 = floor(flPx1 / 12.0);
    vec2 loc1 = mod(flPx1, 12.0);
    float rnd1 = hash2(cell1);
    float twinkle1 = 0.62 + 0.38 * step(0.45, fract(uTime * 4.0 + rnd1 * 19.0));
    float flake1 = step(0.915, rnd1) * step(loc1.x, 1.5) * step(loc1.y, 1.5) * twinkle1;

    vec2 flPx2 = px + vec2(floor(uTime * 108.0), floor(-uTime * 52.0));
    vec2 cell2 = floor(flPx2 / 16.0);
    vec2 loc2 = mod(flPx2, 16.0);
    float rnd2 = hash2(cell2 + vec2(41.0, 17.0));
    float twinkle2 = 0.55 + 0.45 * step(0.5, fract(uTime * 3.0 + rnd2 * 23.0));
    float flake2 = step(0.905, rnd2) * step(loc2.x, 0.9) * step(loc2.y, 0.9) * twinkle2;

    float snowAlpha = clamp(
      (diagStreak * 0.44 + windBand * 0.24 + flake1 * 0.72 + flake2 * 0.56) * uSnowIntensity,
      0.0,
      0.78
    );
    vec3 snowCol = mix(vec3(0.72, 0.92, 1.0), vec3(0.96, 0.99, 1.0), clamp(flake1 + diagStreak * 0.55, 0.0, 1.0));
    col = mix(col, snowCol, snowAlpha);
  }

  // Progressive Crisp Pixel-Art Fimbulwinter Frost Border (sh_frost parity)
  if (uFrostIntensity > 0.01) {
    vec2 edge = abs(baseUV - 0.5) * 2.0; // 0 at center, 1 at border
    float edgeDist = max(edge.x, edge.y);
    float crystalNoise = hash2(floor(vUV * uResolution * 0.25)) * 0.14
                       + sin(baseUV.x * 42.0) * cos(baseUV.y * 28.0) * 0.06;
    float rawFrost = smoothstep(1.08 - uFrostIntensity * 0.52, 1.02, edgeDist + crystalNoise * uFrostIntensity);
    float frostMask = floor(rawFrost * 5.0 + 0.5) / 5.0;
    vec3 iceTint = mix(vec3(0.42, 0.84, 1.0), vec3(0.92, 0.98, 1.0), smoothstep(0.4, 0.95, frostMask));
    // Cold desaturation as Fimbulwinter escalates
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(gray * 0.85, gray * 0.95, gray * 1.12), uFrostIntensity * 0.22);
    col = mix(col, iceTint, clamp(frostMask * (0.55 + 0.4 * uFrostIntensity), 0.0, 0.88));
  }

  // Outcast Power Overdrive golden-cyan edge aura
  if (uPowerGlow > 0.01) {
    vec2 dv = (baseUV - 0.5) * 2.0;
    float rim = smoothstep(0.62, 1.15, length(dv));
    float pulse = 0.7 + 0.3 * sin(uTime * 14.0);
    col += vec3(0.28, 0.78, 1.0) * rim * uPowerGlow * 0.32 * pulse;
  }

  // Hit damage flash & Low-HP heartbeat border
  float redVignette = max(uDamageFlash * 0.55, uLowHpPulse * (0.28 + 0.16 * sin(uTime * 7.5)));
  if (redVignette > 0.01) {
    vec2 dv = (baseUV - 0.5) * 2.0;
    float rim = smoothstep(0.55, 1.2, length(dv));
    col = mix(col, vec3(0.95, 0.12, 0.18), clamp(rim * redVignette, 0.0, 0.65));
  }

  // Subtle atmospheric corner vignette (keeps pixel art razor-sharp & center bright)
  vec2 vigDelta = (baseUV - 0.5) * vec2(1.18, 1.24);
  float vigMask = mix(1.0, 0.86, smoothstep(0.68, 1.32, length(vigDelta)));
  col *= vigMask;

  outColor = vec4(clamp(col, vec3(0.0), vec3(1.0)), 1.0);
}
`;

// ----------------------------------------------------------------------------
// SHADER COMPILATION & PROGRAM SUITE BUILDER
// ----------------------------------------------------------------------------

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`[Krunkedfall WebGL2] Failed to allocate shader: ${label}`);
  }
  gl.shaderSource(shader, source.trimStart());
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`[Krunkedfall WebGL2] Shader compile error (${label}):\n${log}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  label: string,
  uniformNames: readonly string[]
): CompiledProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource, `${label}:VS`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource, `${label}:FS`);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`[Krunkedfall WebGL2] Failed to create program: ${label}`);
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    throw new Error(`[Krunkedfall WebGL2] Program link error (${label}):\n${log}`);
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

export interface ShaderSuite {
  sprite: CompiledProgram;
  decalFade: CompiledProgram;
  light: CompiledProgram;
  lightingComposite: CompiledProgram;
  aurora: CompiledProgram;
  postFx: CompiledProgram;
  dispose(gl: WebGL2RenderingContext): void;
}

export function createShaderSuite(gl: WebGL2RenderingContext): ShaderSuite {
  const sprite = linkProgram(gl, SPRITE_VS, SPRITE_FS, 'sprite', ['uProj', 'uTex', 'uTime']);
  const decalFade = linkProgram(gl, FULLSCREEN_VS, DECAL_FADE_FS, 'decalFade', ['uTex', 'uDecay']);
  const light = linkProgram(gl, LIGHT_VS, LIGHT_FS, 'light', ['uProj', 'uTime']);
  const lightingComposite = linkProgram(
    gl,
    FULLSCREEN_VS,
    LIGHTING_COMPOSITE_FS,
    'lightingComposite',
    ['uSceneTex', 'uLightTex']
  );
  const aurora = linkProgram(gl, FULLSCREEN_VS, AURORA_FS, 'aurora', ['uTime', 'uResolution']);
  const postFx = linkProgram(gl, FULLSCREEN_VS, POST_FX_FS, 'postFx', [
    'uTex',
    'uResolution',
    'uTime',
    'uShakeOffset',
    'uShockwaveCount',
    'uShockwaves',
    'uFrostIntensity',
    'uSnowIntensity',
    'uDamageFlash',
    'uLowHpPulse',
    'uPowerGlow',
  ]);

  return {
    sprite,
    decalFade,
    light,
    lightingComposite,
    aurora,
    postFx,
    dispose(ctx: WebGL2RenderingContext) {
      ctx.deleteProgram(sprite.program);
      ctx.deleteProgram(decalFade.program);
      ctx.deleteProgram(light.program);
      ctx.deleteProgram(lightingComposite.program);
      ctx.deleteProgram(aurora.program);
      ctx.deleteProgram(postFx.program);
    },
  };
}
