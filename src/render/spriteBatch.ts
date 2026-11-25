// ============================================================================
// KRUNKEDFALL — Zero-Allocation Pre-Allocated WebGL2 Quad & Light Batcher
// ============================================================================
// Pre-allocates VAO, dynamic VBO, static EBO, and Float32Array once on init.
// Zero per-frame heap or GPU buffer allocations.

import { FX_MODE_NORMAL, type CompiledProgram } from './shaders';

export type BlendMode = 'normal' | 'additive' | 'premultiplied';

// Vertex layout: x, y, u, v, r, g, b, a, extraX, extraY (10 floats = 40 bytes)
const FLOATS_PER_VERTEX = 10;
const VERTS_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
const MAX_QUADS = 8192;

export function makeOrthoMatrix(
  left: number,
  right: number,
  bottom: number,
  top: number,
  out: Float32Array
): Float32Array {
  const rl = right - left;
  const tb = top - bottom;
  out.fill(0);
  out[0] = 2 / rl;
  out[5] = 2 / tb;
  out[10] = -1;
  out[12] = -(right + left) / rl;
  out[13] = -(top + bottom) / tb;
  out[15] = 1;
  return out;
}

export class SpriteBatch {
  private readonly gl: WebGL2RenderingContext;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly ebo: WebGLBuffer;
  private readonly vertices: Float32Array;

  private quadCount = 0;
  private activeProgram: CompiledProgram | null = null;
  private activeTexture: WebGLTexture | null = null;
  private activeBlend: BlendMode = 'normal';
  private activeTime = 0;
  private projMatrix = new Float32Array(16);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.vertices = new Float32Array(MAX_QUADS * VERTS_PER_QUAD * FLOATS_PER_VERTEX);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ebo = gl.createBuffer();
    if (!vao || !vbo || !ebo) {
      throw new Error('[Krunkedfall WebGL2] Failed to allocate SpriteBatch GPU buffers');
    }
    this.vao = vao;
    this.vbo = vbo;
    this.ebo = ebo;

    // Pre-build static quad index buffer once
    const indices = new Uint16Array(MAX_QUADS * INDICES_PER_QUAD);
    for (let i = 0; i < MAX_QUADS; i++) {
      const vi = i * 4;
      const ii = i * 6;
      indices[ii] = vi;
      indices[ii + 1] = vi + 1;
      indices[ii + 2] = vi + 2;
      indices[ii + 3] = vi + 2;
      indices[ii + 4] = vi + 3;
      indices[ii + 5] = vi;
    }

    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const stride = FLOATS_PER_VERTEX * 4;
    // location 0: aPos (vec2)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    // location 1: aUV / aLocalUV (vec2)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    // location 2: aColor (vec4)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    // location 3: aExtra (vec2)
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);

    gl.bindVertexArray(null);
  }

  begin(program: CompiledProgram, projMatrix: Float32Array, timeSec: number, blend: BlendMode = 'normal'): void {
    this.activeProgram = program;
    this.projMatrix.set(projMatrix);
    this.activeTime = timeSec;
    this.activeTexture = null;
    this.quadCount = 0;
    this.setBlend(blend);
  }

  setBlend(blend: BlendMode): void {
    if (this.quadCount > 0 && this.activeBlend !== blend) {
      this.flush();
    }
    this.activeBlend = blend;
    const gl = this.gl;
    gl.enable(gl.BLEND);
    if (blend === 'additive') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else if (blend === 'premultiplied') {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  setTexture(tex: WebGLTexture | null): void {
    if (this.activeTexture !== tex) {
      if (this.quadCount > 0) this.flush();
      this.activeTexture = tex;
    }
  }

  /**
   * Pushes an axis-aligned textured quad (fast path for tiles, UI icons, decals).
   */
  drawQuad(
    tex: WebGLTexture | null,
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r = 1,
    g = 1,
    b = 1,
    a = 1,
    extraX = 0,
    extraY = FX_MODE_NORMAL
  ): void {
    if (this.activeTexture !== tex) {
      if (this.quadCount > 0) this.flush();
      this.activeTexture = tex;
    }
    if (this.quadCount >= MAX_QUADS) {
      this.flush();
    }

    const v = this.vertices;
    let o = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERTEX;
    const x1 = x + w;
    const y1 = y + h;

    // Top-left
    v[o++] = x; v[o++] = y; v[o++] = u0; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;
    // Top-right
    v[o++] = x1; v[o++] = y; v[o++] = u1; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;
    // Bottom-right
    v[o++] = x1; v[o++] = y1; v[o++] = u1; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;
    // Bottom-left
    v[o++] = x; v[o++] = y1; v[o++] = u0; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;

    this.quadCount++;
  }

  /**
   * Pushes a transformed sprite quad aligned strictly to (originX, originY) pivot.
   */
  drawSprite(
    tex: WebGLTexture | null,
    x: number,
    y: number,
    w: number,
    h: number,
    originX: number,
    originY: number,
    scaleX: number,
    scaleY: number,
    rotation: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    r = 1,
    g = 1,
    b = 1,
    a = 1,
    flash = 0,
    fxMode = FX_MODE_NORMAL
  ): void {
    if (this.activeTexture !== tex) {
      if (this.quadCount > 0) this.flush();
      this.activeTexture = tex;
    }
    if (this.quadCount >= MAX_QUADS) {
      this.flush();
    }

    const lx0 = -originX * scaleX;
    const ly0 = -originY * scaleY;
    const lx1 = (w - originX) * scaleX;
    const ly1 = (h - originY) * scaleY;

    let x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number;
    if (rotation === 0) {
      x0 = x + lx0; y0 = y + ly0;
      x1 = x + lx1; y1 = y + ly0;
      x2 = x + lx1; y2 = y + ly1;
      x3 = x + lx0; y3 = y + ly1;
    } else {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      x0 = x + lx0 * cos - ly0 * sin; y0 = y + lx0 * sin + ly0 * cos;
      x1 = x + lx1 * cos - ly0 * sin; y1 = y + lx1 * sin + ly0 * cos;
      x2 = x + lx1 * cos - ly1 * sin; y2 = y + lx1 * sin + ly1 * cos;
      x3 = x + lx0 * cos - ly1 * sin; y3 = y + lx0 * sin + ly1 * cos;
    }

    const v = this.vertices;
    let o = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERTEX;

    v[o++] = x0; v[o++] = y0; v[o++] = u0; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = flash; v[o++] = fxMode;

    v[o++] = x1; v[o++] = y1; v[o++] = u1; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = flash; v[o++] = fxMode;

    v[o++] = x2; v[o++] = y2; v[o++] = u1; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = flash; v[o++] = fxMode;

    v[o++] = x3; v[o++] = y3; v[o++] = u0; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = flash; v[o++] = fxMode;

    this.quadCount++;
  }

  /**
   * Pushes an arbitrary 4-corner quad (for laser beams, slash arc ribbons, telegraph cones).
   */
  drawArbitraryQuad(
    tex: WebGLTexture | null,
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    u0: number, v0: number,
    u1: number, v1: number,
    r: number, g: number, b: number, a: number,
    extraX = 0,
    extraY = FX_MODE_NORMAL
  ): void {
    if (this.activeTexture !== tex) {
      if (this.quadCount > 0) this.flush();
      this.activeTexture = tex;
    }
    if (this.quadCount >= MAX_QUADS) {
      this.flush();
    }

    const v = this.vertices;
    let o = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERTEX;

    v[o++] = x0; v[o++] = y0; v[o++] = u0; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;

    v[o++] = x1; v[o++] = y1; v[o++] = u1; v[o++] = v0;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;

    v[o++] = x2; v[o++] = y2; v[o++] = u1; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;

    v[o++] = x3; v[o++] = y3; v[o++] = u0; v[o++] = v1;
    v[o++] = r; v[o++] = g; v[o++] = b; v[o++] = a;
    v[o++] = extraX; v[o++] = extraY;

    this.quadCount++;
  }

  /**
   * Draws a solid colored line segment using the white pixel UV rect.
   */
  drawLine(
    whiteTex: WebGLTexture,
    u: number,
    vCoord: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness: number,
    r: number,
    g: number,
    b: number,
    a: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const nx = (-dy / len) * (thickness * 0.5);
    const ny = (dx / len) * (thickness * 0.5);
    this.drawArbitraryQuad(
      whiteTex,
      x1 + nx, y1 + ny,
      x2 + nx, y2 + ny,
      x2 - nx, y2 - ny,
      x1 - nx, y1 - ny,
      u, vCoord, u, vCoord,
      r, g, b, a
    );
  }

  /**
   * Draws a circular arc / ring / slash ribbon using segmented quads.
   */
  drawArcRibbon(
    whiteTex: WebGLTexture,
    u: number,
    vCoord: number,
    cx: number,
    cy: number,
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number,
    segments: number,
    r: number,
    g: number,
    b: number,
    a: number,
    taperEnds = false
  ): void {
    const step = (endAngle - startAngle) / segments;
    for (let i = 0; i < segments; i++) {
      const a0 = startAngle + i * step;
      const a1 = a0 + step;
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const taper0 = taperEnds ? Math.sin(t0 * Math.PI) : 1;
      const taper1 = taperEnds ? Math.sin(t1 * Math.PI) : 1;
      const rIn0 = outerR - (outerR - innerR) * taper0;
      const rIn1 = outerR - (outerR - innerR) * taper1;

      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);

      this.drawArbitraryQuad(
        whiteTex,
        cx + c0 * rIn0, cy + s0 * rIn0,
        cx + c0 * outerR, cy + s0 * outerR,
        cx + c1 * outerR, cy + s1 * outerR,
        cx + c1 * rIn1, cy + s1 * rIn1,
        u, vCoord, u, vCoord,
        r, g, b, a
      );
    }
  }

  /**
   * Draws a batched additive 2D point light quad (for Pass 5 lightProgram).
   */
  drawLight(
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    falloffPower = 2.0,
    flickerPhase = 0
  ): void {
    this.drawQuad(
      null,
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2,
      -1,
      -1,
      1,
      1,
      r,
      g,
      b,
      intensity,
      falloffPower,
      flickerPhase
    );
  }

  flush(): void {
    if (this.quadCount === 0 || !this.activeProgram) return;
    const gl = this.gl;
    const prog = this.activeProgram;

    gl.useProgram(prog.program);
    if (prog.uniforms.uProj) {
      gl.uniformMatrix4fv(prog.uniforms.uProj, false, this.projMatrix);
    }
    if (prog.uniforms.uTime) {
      gl.uniform1f(prog.uniforms.uTime, this.activeTime);
    }
    if (prog.uniforms.uTex && this.activeTexture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.activeTexture);
      gl.uniform1i(prog.uniforms.uTex, 0);
    }

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const floatCount = this.quadCount * VERTS_PER_QUAD * FLOATS_PER_VERTEX;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, floatCount));
    gl.drawElements(gl.TRIANGLES, this.quadCount * INDICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    this.quadCount = 0;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ebo);
  }
}
