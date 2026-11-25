// ============================================================================
// KRUNKEDFALL — Continuous Swept Collision & Sliding Tilemap Physics
// ============================================================================
// Guarantees ZERO tunneling at any projectile velocity (even >= 35+ px/tick)
// via 2D Amanatides-Woo grid DDA and exact analytical swept segment-vs-circle
// intersection, plus snag-free circle-vs-tilemap sliding resolution.

import { TileKind, type TileMapState } from '../contracts/index.js';
import { getTileAt, isBlockingForMover, isSolidTile } from './tilemap.js';

export interface TileRayHit {
  hit: true;
  t: number;
  x: number;
  y: number;
  tileX: number;
  tileY: number;
  normalX: number;
  normalY: number;
  tileKind: TileKind;
}

export interface CircleSweepHit {
  hit: true;
  t: number;
  x: number;
  y: number;
}

export interface SlideResolution {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hitX: boolean;
  hitY: boolean;
  hitTileX: number;
  hitTileY: number;
}

function isBlockingForProjectile(kind: TileKind, ethereal: boolean): boolean {
  if (ethereal) {
    // Ethereal projectiles pass through interior walls/crates, stopping only at outer bedrock
    return kind === TileKind.WallBedrock;
  }
  return isSolidTile(kind);
}

/**
 * Exact continuous swept segment-vs-tilemap DDA raycast from `(x0, y0)` to `(x1, y1)`.
 * Visits EVERY traversed tile in strict parametric order so projectiles at arbitrary
 * speeds (e.g. 35..100+ px/tick) can never skip or tunnel through a 1-tile wall.
 */
export function sweepProjectileVsTilemap(
  map: TileMapState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius = 0,
  ethereal = false,
): TileRayHit | null {
  const ts = map.tileSize;
  const dx = x1 - x0;
  const dy = y1 - y0;

  let tx = Math.floor(x0 / ts);
  let ty = Math.floor(y0 / ts);

  const startKind = getTileAt(map, tx, ty);
  if (isBlockingForProjectile(startKind, ethereal)) {
    const len = Math.hypot(dx, dy);
    return {
      hit: true,
      t: 0,
      x: x0,
      y: y0,
      tileX: tx,
      tileY: ty,
      normalX: len > 1e-6 ? -dx / len : 0,
      normalY: len > 1e-6 ? -dy / len : -1,
      tileKind: startKind,
    };
  }

  const endTx = Math.floor(x1 / ts);
  const endTy = Math.floor(y1 / ts);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(ts / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(ts / dy) : Infinity;

  let tMaxX: number;
  if (dx > 0) {
    tMaxX = ((tx + 1) * ts - x0) / dx;
  } else if (dx < 0) {
    tMaxX = (tx * ts - x0) / dx;
  } else {
    tMaxX = Infinity;
  }

  let tMaxY: number;
  if (dy > 0) {
    tMaxY = ((ty + 1) * ts - y0) / dy;
  } else if (dy < 0) {
    tMaxY = (ty * ts - y0) / dy;
  } else {
    tMaxY = Infinity;
  }

  const maxSteps = Math.abs(endTx - tx) + Math.abs(endTy - ty) + 4;
  let lastNormalX = 0;
  let lastNormalY = 0;
  let tCurrent = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (tMaxX <= tMaxY) {
      if (tMaxX > 1.0 + 1e-9) break;
      tCurrent = tMaxX < 0 ? 0 : tMaxX;
      tx += stepX;
      tMaxX += tDeltaX;
      lastNormalX = -stepX;
      lastNormalY = 0;
    } else {
      if (tMaxY > 1.0 + 1e-9) break;
      tCurrent = tMaxY < 0 ? 0 : tMaxY;
      ty += stepY;
      tMaxY += tDeltaY;
      lastNormalX = 0;
      lastNormalY = -stepY;
    }

    const kind = getTileAt(map, tx, ty);
    if (isBlockingForProjectile(kind, ethereal)) {
      const clampedT = tCurrent < 0 ? 0 : tCurrent > 1 ? 1 : tCurrent;
      return {
        hit: true,
        t: clampedT,
        x: x0 + dx * clampedT,
        y: y0 + dy * clampedT,
        tileX: tx,
        tileY: ty,
        normalX: lastNormalX,
        normalY: lastNormalY,
        tileKind: kind,
      };
    }

    if (tx === endTx && ty === endTy) {
      break;
    }
  }

  // Secondary endpoint circle check for wide projectiles grazing wall edges
  if (radius > 0.5) {
    const checkR = Math.min(radius, ts * 0.45);
    const minTx = Math.floor((x1 - checkR) / ts);
    const maxTx = Math.floor((x1 + checkR) / ts);
    const minTy = Math.floor((y1 - checkR) / ts);
    const maxTy = Math.floor((y1 + checkR) / ts);

    for (let cy = minTy; cy <= maxTy; cy++) {
      for (let cx = minTx; cx <= maxTx; cx++) {
        const kind = getTileAt(map, cx, cy);
        if (!isBlockingForProjectile(kind, ethereal)) continue;
        const nearestX = Math.max(cx * ts, Math.min(x1, (cx + 1) * ts));
        const nearestY = Math.max(cy * ts, Math.min(y1, (cy + 1) * ts));
        const ox = x1 - nearestX;
        const oy = y1 - nearestY;
        const distSq = ox * ox + oy * oy;
        if (distSq < checkR * checkR) {
          const dist = Math.sqrt(distSq);
          let nx = 0;
          let ny = 0;
          if (dist > 1e-5) {
            nx = ox / dist;
            ny = oy / dist;
          } else {
            nx = Math.abs(dx) >= Math.abs(dy) ? -Math.sign(dx) : 0;
            ny = Math.abs(dy) > Math.abs(dx) ? -Math.sign(dy) : 0;
          }
          return {
            hit: true,
            t: 1,
            x: nearestX,
            y: nearestY,
            tileX: cx,
            tileY: cy,
            normalX: nx,
            normalY: ny,
            tileKind: kind,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Analytical swept segment `(x0, y0) -> (x1, y1)` vs circle `(cx, cy, combinedRadius)`.
 * Guarantees fast projectiles never skip past small targets.
 */
export function sweepSegmentVsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  combinedRadius: number,
): CircleSweepHit | null {
  const rSq = combinedRadius * combinedRadius;
  const fx = x0 - cx;
  const fy = y0 - cy;

  // Already intersecting at segment start
  if (fx * fx + fy * fy <= rSq) {
    return { hit: true, t: 0, x: x0, y: y0 };
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) {
    return null;
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - rSq;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return null;
  }

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) {
    return { hit: true, t: t1, x: x0 + dx * t1, y: y0 + dy * t1 };
  }

  const t2 = (-b + sqrtDisc) / (2 * a);
  if (t1 < 0 && t2 >= 0) {
    return { hit: true, t: 0, x: x0, y: y0 };
  }

  return null;
}

/**
 * Checks clean line-of-sight between two world points against solid walls.
 */
export function hasLineOfSight(
  map: TileMapState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  return sweepProjectileVsTilemap(map, x0, y0, x1, y1, 0, false) === null;
}

function depenetrateCircleFromTiles(
  map: TileMapState,
  x: number,
  y: number,
  radius: number,
  isFlier: boolean,
): { x: number; y: number; collided: boolean; tileX: number; tileY: number } {
  const ts = map.tileSize;
  let rx = x;
  let ry = y;
  let collided = false;
  let hitTileX = -1;
  let hitTileY = -1;

  for (let pass = 0; pass < 2; pass++) {
    const minTx = Math.floor((rx - radius) / ts);
    const maxTx = Math.floor((rx + radius) / ts);
    const minTy = Math.floor((ry - radius) / ts);
    const maxTy = Math.floor((ry + radius) / ts);

    let movedInPass = false;
    for (let ty = minTy; ty <= maxTy; ty++) {
      const tileTop = ty * ts;
      const tileBot = tileTop + ts;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const kind = getTileAt(map, tx, ty);
        if (!isBlockingForMover(kind, isFlier)) continue;

        const tileLeft = tx * ts;
        const tileRight = tileLeft + ts;
        const nearestX = Math.max(tileLeft, Math.min(rx, tileRight));
        const nearestY = Math.max(tileTop, Math.min(ry, tileBot));

        const ox = rx - nearestX;
        const oy = ry - nearestY;
        const distSq = ox * ox + oy * oy;

        if (distSq < radius * radius - 1e-6) {
          collided = true;
          hitTileX = tx;
          hitTileY = ty;
          movedInPass = true;

          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            rx += (ox / dist) * push;
            ry += (oy / dist) * push;
          } else {
            // Center lies inside tile — push out along shallowest axis
            const cx = tileLeft + ts * 0.5;
            const cy = tileTop + ts * 0.5;
            const ddx = rx - cx;
            const ddy = ry - cy;
            if (Math.abs(ddx) >= Math.abs(ddy)) {
              rx = ddx >= 0 ? tileRight + radius : tileLeft - radius;
            } else {
              ry = ddy >= 0 ? tileBot + radius : tileTop - radius;
            }
          }
        }
      }
    }
    if (!movedInPass) break;
  }

  return { x: rx, y: ry, collided, tileX: hitTileX, tileY: hitTileY };
}

/**
 * Smooth circle-vs-tilemap sliding resolution with substepping for fast dashes
 * and strict inner-bedrock clamping so entities never snag or escape bounds.
 */
export function resolveCircleVsTilemap(
  map: TileMapState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  radius: number,
  isFlier = false,
): SlideResolution {
  const ts = map.tileSize;
  const totalMove = Math.hypot(vx, vy);
  const maxStep = Math.max(2, radius * 0.75);
  const steps = Math.max(1, Math.ceil(totalMove / maxStep));
  const stepVx = vx / steps;
  const stepVy = vy / steps;

  let curX = x;
  let curY = y;
  let outVx = vx;
  let outVy = vy;
  let hitX = false;
  let hitY = false;
  let hitTileX = -1;
  let hitTileY = -1;

  for (let s = 0; s < steps; s++) {
    // Move and resolve X
    if (stepVx !== 0) {
      const targetX = curX + stepVx;
      const resX = depenetrateCircleFromTiles(map, targetX, curY, radius, isFlier);
      if (Math.abs(resX.x - targetX) > 1e-4) {
        hitX = true;
        hitTileX = resX.tileX;
        hitTileY = resX.tileY;
        outVx = 0;
      }
      curX = resX.x;
      curY = resX.y;
    }

    // Move and resolve Y
    if (stepVy !== 0) {
      const targetY = curY + stepVy;
      const resY = depenetrateCircleFromTiles(map, curX, targetY, radius, isFlier);
      if (Math.abs(resY.y - targetY) > 1e-4) {
        hitY = true;
        if (hitTileX < 0) {
          hitTileX = resY.tileX;
          hitTileY = resY.tileY;
        }
        outVy = 0;
      }
      curX = resY.x;
      curY = resY.y;
    }
  }

  // Final safety depenetration and hard clamp strictly inside outer bedrock ring
  const finalDepen = depenetrateCircleFromTiles(map, curX, curY, radius, isFlier);
  curX = finalDepen.x;
  curY = finalDepen.y;

  const minX = ts + radius;
  const maxX = (map.width - 1) * ts - radius;
  const minY = ts + radius;
  const maxY = (map.height - 1) * ts - radius;

  if (curX < minX) {
    curX = minX;
    hitX = true;
    outVx = 0;
  } else if (curX > maxX) {
    curX = maxX;
    hitX = true;
    outVx = 0;
  }

  if (curY < minY) {
    curY = minY;
    hitY = true;
    outVy = 0;
  } else if (curY > maxY) {
    curY = maxY;
    hitY = true;
    outVy = 0;
  }

  return {
    x: curX,
    y: curY,
    vx: outVx,
    vy: outVy,
    hitX,
    hitY,
    hitTileX,
    hitTileY,
  };
}
