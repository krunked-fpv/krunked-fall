// ============================================================================
// KRUNKEDFALL — Tilemap Queries, Destructible Walls & BFS Connectivity
// ============================================================================
// Pure deterministic grid operations guaranteeing indestructible outer bedrock,
// progressive crack/shatter wall destruction, and verified BFS reachability.

import {
  TILE_SIZE,
  TileKind,
  type SimState,
  type TileMapState,
} from '../contracts/index.js';
import { getBiomePalette } from '../data/index.js';

export const DEFAULT_DESTRUCTIBLE_WALL_HP = 70;
export const DEFAULT_COVER_CRATE_HP = 35;

export function createEmptyTileMap(
  width: number,
  height: number,
  biomeId: string,
  fillKind: TileKind = TileKind.Floor,
  tileSize = TILE_SIZE,
): TileMapState {
  const total = width * height;
  const tiles = new Uint8Array(total);
  const tileHp = new Uint16Array(total);
  const tileMaxHp = new Uint16Array(total);

  tiles.fill(fillKind);
  if (fillKind === TileKind.WallDestructible) {
    tileHp.fill(DEFAULT_DESTRUCTIBLE_WALL_HP);
    tileMaxHp.fill(DEFAULT_DESTRUCTIBLE_WALL_HP);
  } else if (fillKind === TileKind.CoverCrate) {
    tileHp.fill(DEFAULT_COVER_CRATE_HP);
    tileMaxHp.fill(DEFAULT_COVER_CRATE_HP);
  }

  const map: TileMapState = {
    width,
    height,
    tileSize,
    tiles,
    tileHp,
    tileMaxHp,
    biomeId,
    spawnX: tileToWorldCenter(2, tileSize),
    spawnY: tileToWorldCenter(Math.floor(height / 2), tileSize),
    exitX: tileToWorldCenter(width - 3, tileSize),
    exitY: tileToWorldCenter(Math.floor(height / 2), tileSize),
    exitUnlocked: false,
  };

  enforceOuterBedrock(map);
  return map;
}

export function isOuterPerimeter(map: TileMapState, tileX: number, tileY: number): boolean {
  return tileX <= 0 || tileY <= 0 || tileX >= map.width - 1 || tileY >= map.height - 1;
}

export function enforceOuterBedrock(map: TileMapState): void {
  const { width, height, tiles, tileHp, tileMaxHp } = map;
  for (let x = 0; x < width; x++) {
    const topIdx = x;
    const botIdx = (height - 1) * width + x;
    tiles[topIdx] = TileKind.WallBedrock;
    tileHp[topIdx] = 0;
    tileMaxHp[topIdx] = 0;
    tiles[botIdx] = TileKind.WallBedrock;
    tileHp[botIdx] = 0;
    tileMaxHp[botIdx] = 0;
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width;
    const rightIdx = y * width + (width - 1);
    tiles[leftIdx] = TileKind.WallBedrock;
    tileHp[leftIdx] = 0;
    tileMaxHp[leftIdx] = 0;
    tiles[rightIdx] = TileKind.WallBedrock;
    tileHp[rightIdx] = 0;
    tileMaxHp[rightIdx] = 0;
  }
}

export function isSolidTile(kind: TileKind): boolean {
  return (
    kind === TileKind.WallDestructible ||
    kind === TileKind.WallBedrock ||
    kind === TileKind.CoverCrate
  );
}

export function isBlockingForMover(kind: TileKind, isFlier = false): boolean {
  if (isSolidTile(kind)) return true;
  if (!isFlier && kind === TileKind.PitOrWater) return true;
  return false;
}

export function isWalkableTile(kind: TileKind): boolean {
  return kind === TileKind.Floor || kind === TileKind.Rubble;
}

export function isDestructibleTile(kind: TileKind): boolean {
  return kind === TileKind.WallDestructible || kind === TileKind.CoverCrate;
}

export function worldToTile(coord: number, tileSize = TILE_SIZE): number {
  return Math.floor(coord / tileSize);
}

export function tileToWorldCenter(tileCoord: number, tileSize = TILE_SIZE): number {
  return (tileCoord + 0.5) * tileSize;
}

export function getTileAt(map: TileMapState, tileX: number, tileY: number): TileKind {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return TileKind.WallBedrock;
  }
  return map.tiles[tileY * map.width + tileX] as TileKind;
}

export function setTileAt(
  map: TileMapState,
  tileX: number,
  tileY: number,
  kind: TileKind,
  customHp?: number,
): void {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return;
  }
  // Outer perimeter must always stay indestructible WallBedrock
  if (isOuterPerimeter(map, tileX, tileY) && kind !== TileKind.WallBedrock) {
    return;
  }
  const idx = tileY * map.width + tileX;
  map.tiles[idx] = kind;
  if (kind === TileKind.WallDestructible) {
    const hp = customHp ?? DEFAULT_DESTRUCTIBLE_WALL_HP;
    map.tileHp[idx] = hp;
    map.tileMaxHp[idx] = hp;
  } else if (kind === TileKind.CoverCrate) {
    const hp = customHp ?? DEFAULT_COVER_CRATE_HP;
    map.tileHp[idx] = hp;
    map.tileMaxHp[idx] = hp;
  } else {
    map.tileHp[idx] = 0;
    map.tileMaxHp[idx] = 0;
  }
}

/**
 * Applies damage to a single interior tile. Outer bedrock is strictly immune.
 * Emits `wall_crack` when crossing 66% / 33% HP thresholds and shatters to
 * `TileKind.Rubble` with `wall_shatter` when HP reaches 0.
 *
 * Returns `true` if the tile shattered on this hit.
 */
export function damageTile(
  state: SimState,
  tileX: number,
  tileY: number,
  damage: number,
): boolean {
  const map = state.map;
  if (damage <= 0) return false;
  if (isOuterPerimeter(map, tileX, tileY)) return false;
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    return false;
  }

  const idx = tileY * map.width + tileX;
  const kind = map.tiles[idx] as TileKind;
  if (!isDestructibleTile(kind)) {
    return false;
  }

  const maxHp = Math.max(
    1,
    map.tileMaxHp[idx] ||
      (kind === TileKind.CoverCrate ? DEFAULT_COVER_CRATE_HP : DEFAULT_DESTRUCTIBLE_WALL_HP),
  );
  const prevHp = map.tileHp[idx] > 0 ? map.tileHp[idx] : maxHp;
  const prevRatio = prevHp / maxHp;

  const dmgInt = Math.max(1, Math.round(damage));
  const nextHp = Math.max(0, prevHp - dmgInt);
  map.tileHp[idx] = nextHp;
  map.tileMaxHp[idx] = maxHp;

  const cx = tileToWorldCenter(tileX, map.tileSize);
  const cy = tileToWorldCenter(tileY, map.tileSize);

  if (nextHp <= 0) {
    map.tiles[idx] = TileKind.Rubble;
    map.tileHp[idx] = 0;
    state.runStats.wallsDestroyed += 1;
    const palette = getBiomePalette(map.biomeId);
    state.events.push({
      type: 'wall_shatter',
      tileX,
      tileY,
      x: cx,
      y: cy,
      color: kind === TileKind.CoverCrate ? '#b07d4f' : palette.wallFaceColor,
    });
    return true;
  }

  const nextRatio = nextHp / maxHp;
  if ((prevRatio > 0.66 && nextRatio <= 0.66) || (prevRatio > 0.33 && nextRatio <= 0.33)) {
    state.events.push({
      type: 'wall_crack',
      tileX,
      tileY,
      x: cx,
      y: cy,
      ratio: nextRatio,
    });
  }

  return false;
}

/**
 * Damages all destructible tiles overlapping a world-space blast circle.
 * Returns the number of tiles shattered.
 */
export function damageTilesInRadius(
  state: SimState,
  worldX: number,
  worldY: number,
  radius: number,
  damage: number,
): number {
  const map = state.map;
  const ts = map.tileSize;
  const minTx = Math.max(1, Math.floor((worldX - radius) / ts));
  const maxTx = Math.min(map.width - 2, Math.floor((worldX + radius) / ts));
  const minTy = Math.max(1, Math.floor((worldY - radius) / ts));
  const maxTy = Math.min(map.height - 2, Math.floor((worldY + radius) / ts));
  const rSq = (radius + ts * 0.5) * (radius + ts * 0.5);

  let shattered = 0;
  for (let ty = minTy; ty <= maxTy; ty++) {
    const cy = tileToWorldCenter(ty, ts);
    for (let tx = minTx; tx <= maxTx; tx++) {
      const cx = tileToWorldCenter(tx, ts);
      const dx = cx - worldX;
      const dy = cy - worldY;
      const dSq = dx * dx + dy * dy;
      if (dSq > rSq) continue;
      const dist = Math.sqrt(dSq);
      const falloff = Math.max(0.35, 1 - dist / (radius + ts));
      if (damageTile(state, tx, ty, damage * falloff)) {
        shattered += 1;
      }
    }
  }
  return shattered;
}

/**
 * Runs a 4-neighbor BFS from `(map.spawnX, map.spawnY)` to `(map.exitX, map.exitY)`
 * across walkable tiles (`Floor` / `Rubble`) to prove zero-softlock connectivity.
 */
export function verifyMapConnectivity(map: TileMapState): boolean {
  const { width, height, tileSize } = map;
  if (width < 3 || height < 3) return false;

  const sx = worldToTile(map.spawnX, tileSize);
  const sy = worldToTile(map.spawnY, tileSize);
  const ex = worldToTile(map.exitX, tileSize);
  const ey = worldToTile(map.exitY, tileSize);

  if (sx <= 0 || sy <= 0 || sx >= width - 1 || sy >= height - 1) return false;
  if (ex <= 0 || ey <= 0 || ex >= width - 1 || ey >= height - 1) return false;

  if (!isWalkableTile(getTileAt(map, sx, sy))) return false;
  if (!isWalkableTile(getTileAt(map, ex, ey))) return false;
  if (sx === ex && sy === ey) return true;

  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const startIdx = sy * width + sx;
  const targetIdx = ey * width + ex;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const cur = queue[head++];
    if (cur === targetIdx) return true;

    const cx = cur % width;
    const cy = (cur - cx) / width;

    // 4 cardinal neighbors
    if (cx > 1) {
      const nIdx = cur - 1;
      if (!visited[nIdx] && isWalkableTile(map.tiles[nIdx] as TileKind)) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    if (cx < width - 2) {
      const nIdx = cur + 1;
      if (!visited[nIdx] && isWalkableTile(map.tiles[nIdx] as TileKind)) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    if (cy > 1) {
      const nIdx = cur - width;
      if (!visited[nIdx] && isWalkableTile(map.tiles[nIdx] as TileKind)) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
    if (cy < height - 2) {
      const nIdx = cur + width;
      if (!visited[nIdx] && isWalkableTile(map.tiles[nIdx] as TileKind)) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }

  return false;
}

/**
 * Computes a Uint8Array reachability mask (1 = reachable from spawn) across the
 * tilemap using 4-neighbor BFS over walkable tiles.
 */
export function computeReachableMask(map: TileMapState): Uint8Array {
  const { width, height, tileSize } = map;
  const total = width * height;
  const visited = new Uint8Array(total);
  const sx = Math.max(1, Math.min(width - 2, worldToTile(map.spawnX, tileSize)));
  const sy = Math.max(1, Math.min(height - 2, worldToTile(map.spawnY, tileSize)));
  if (!isWalkableTile(getTileAt(map, sx, sy))) {
    return visited;
  }

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const startIdx = sy * width + sx;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;

    const neighbors = [
      cx > 1 ? cur - 1 : -1,
      cx < width - 2 ? cur + 1 : -1,
      cy > 1 ? cur - width : -1,
      cy < height - 2 ? cur + width : -1,
    ];
    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx >= 0 && !visited[nIdx] && isWalkableTile(map.tiles[nIdx] as TileKind)) {
        visited[nIdx] = 1;
        queue[tail++] = nIdx;
      }
    }
  }
  return visited;
}

/**
 * Guarantees connectivity between spawn and exit by clearing safe 3x3 pads and
 * carving a fallback 2-tile-wide interior corridor whenever BFS fails.
 */
export function ensureMapConnectivity(map: TileMapState): boolean {
  const { width, height, tileSize } = map;
  const sx = Math.max(2, Math.min(width - 3, worldToTile(map.spawnX, tileSize)));
  const sy = Math.max(2, Math.min(height - 3, worldToTile(map.spawnY, tileSize)));
  const ex = Math.max(2, Math.min(width - 3, worldToTile(map.exitX, tileSize)));
  const ey = Math.max(2, Math.min(height - 3, worldToTile(map.exitY, tileSize)));

  map.spawnX = tileToWorldCenter(sx, tileSize);
  map.spawnY = tileToWorldCenter(sy, tileSize);
  map.exitX = tileToWorldCenter(ex, tileSize);
  map.exitY = tileToWorldCenter(ey, tileSize);

  // Clear 3x3 pads around spawn and exit
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      setTileAt(map, sx + dx, sy + dy, TileKind.Floor);
      setTileAt(map, ex + dx, ey + dy, TileKind.Floor);
    }
  }

  if (verifyMapConnectivity(map)) {
    enforceOuterBedrock(map);
    return true;
  }

  // Fallback corridor carving (2 tiles wide so movers never snag)
  let cx = sx;
  let cy = sy;
  while (cx !== ex) {
    setTileAt(map, cx, cy, TileKind.Floor);
    if (cy + 1 < height - 1) setTileAt(map, cx, cy + 1, TileKind.Floor);
    cx += cx < ex ? 1 : -1;
  }
  while (cy !== ey) {
    setTileAt(map, cx, cy, TileKind.Floor);
    if (cx + 1 < width - 1) setTileAt(map, cx + 1, cy, TileKind.Floor);
    cy += cy < ey ? 1 : -1;
  }
  setTileAt(map, ex, ey, TileKind.Floor);
  enforceOuterBedrock(map);
  return verifyMapConnectivity(map);
}

/**
 * Finds the nearest walkable tile center to `(worldX, worldY)` so entities,
 * chests, and crystals never spawn inside walls.
 */
export function findNearestWalkablePos(
  map: TileMapState,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  const ts = map.tileSize;
  const tx0 = Math.max(1, Math.min(map.width - 2, worldToTile(worldX, ts)));
  const ty0 = Math.max(1, Math.min(map.height - 2, worldToTile(worldY, ts)));

  if (isWalkableTile(getTileAt(map, tx0, ty0))) {
    return { x: tileToWorldCenter(tx0, ts), y: tileToWorldCenter(ty0, ts) };
  }

  const maxRing = Math.max(map.width, map.height);
  for (let r = 1; r <= maxRing; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (tx <= 0 || ty <= 0 || tx >= map.width - 1 || ty >= map.height - 1) continue;
        if (isWalkableTile(getTileAt(map, tx, ty))) {
          return { x: tileToWorldCenter(tx, ts), y: tileToWorldCenter(ty, ts) };
        }
      }
    }
  }

  return { x: map.spawnX, y: map.spawnY };
}
