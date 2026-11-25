// ============================================================================
// KRUNKEDFALL — Procedural Destructible Dungeon, Hub & Arena World Generator
// ============================================================================
// Generates deterministic, destructible tilemaps per BiomeNodeDef with:
//   - Indestructible outer WallBedrock perimeter (zero OOB escape)
//   - Destructible interior WallDestructible & CoverCrate clusters
//   - Dedicated Outpost Hub with all 8 HubInteractable landmarks
//   - Boss Arenas, Training Grounds, Shops, Campfires, Supply Stashes
//   - Verified BFS spawn-to-exit connectivity via `ensureMapConnectivity()`

import {
  TILE_SIZE,
  TileKind,
  type BiomeNodeDef,
  type HubInteractable,
  type ShopOffer,
  type SimState,
  type TileMapState,
} from '../contracts/index.js';
import { getModDef, getWeaponDef } from '../data/index.js';
import { pickRandomModForNode, pickRandomWeaponForNode } from './combat.js';
import { chance, nextInt, type RngCarrier } from './rng.js';
import {
  computeReachableMask,
  createEmptyTileMap,
  enforceOuterBedrock,
  ensureMapConnectivity,
  isWalkableTile,
  setTileAt,
  tileToWorldCenter,
  worldToTile,
} from './tilemap.js';

export interface GeneratedWorld {
  map: TileMapState;
  spawnPoints: Array<{ x: number; y: number }>;
  chestPoints: Array<{ x: number; y: number }>;
  ammoPoints: Array<{ x: number; y: number }>;
  hubInteractables: HubInteractable[];
}

interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function carveRect(map: TileMapState, x0: number, y0: number, w: number, h: number): void {
  const xStart = Math.max(1, x0);
  const yStart = Math.max(1, y0);
  const xEnd = Math.min(map.width - 2, x0 + w - 1);
  const yEnd = Math.min(map.height - 2, y0 + h - 1);
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      setTileAt(map, x, y, TileKind.Floor);
    }
  }
}

function carveCorridor(
  map: TileMapState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfWidth = 1,
): void {
  let cx = Math.max(2, Math.min(map.width - 3, x0));
  let cy = Math.max(2, Math.min(map.height - 3, y0));
  const tx = Math.max(2, Math.min(map.width - 3, x1));
  const ty = Math.max(2, Math.min(map.height - 3, y1));

  while (cx !== tx) {
    for (let dy = -halfWidth; dy <= halfWidth; dy++) {
      setTileAt(map, cx, cy + dy, TileKind.Floor);
    }
    cx += cx < tx ? 1 : -1;
  }
  while (cy !== ty) {
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      setTileAt(map, cx + dx, cy, TileKind.Floor);
    }
    cy += cy < ty ? 1 : -1;
  }
}

/**
 * Generates the dedicated Three-Rock Outpost Hub (`act0_hub`) with all 8
 * HubInteractable landmarks and an east-side Training Dummy shooting alcove.
 */
export function generateHubLayout(): GeneratedWorld {
  const width = 38;
  const height = 24;
  const map = createEmptyTileMap(width, height, 'hub', TileKind.Floor, TILE_SIZE);

  // Architectural alcoves & tactical pillars (destructible practice crates on east range)
  const pillars: Array<[number, number]> = [
    [10, 6], [10, 17],
    [24, 6], [24, 17],
  ];
  for (const [px, py] of pillars) {
    setTileAt(map, px, py, TileKind.WallDestructible, 120);
    setTileAt(map, px + 1, py, TileKind.WallDestructible, 120);
  }

  // East shooting range cover crates
  for (let cy = 9; cy <= 14; cy += 2) {
    setTileAt(map, 28, cy, TileKind.CoverCrate, 35);
  }

  map.spawnX = tileToWorldCenter(17, TILE_SIZE);
  map.spawnY = tileToWorldCenter(14, TILE_SIZE);
  map.exitX = tileToWorldCenter(17, TILE_SIZE);
  map.exitY = tileToWorldCenter(4, TILE_SIZE);
  map.exitUnlocked = true;

  ensureMapConnectivity(map);

  const hubInteractables: HubInteractable[] = [
    {
      id: 'bifrost',
      label: 'BIFROST PORTAL',
      x: tileToWorldCenter(17, TILE_SIZE),
      y: tileToWorldCenter(4, TILE_SIZE),
      radius: 26,
    },
    {
      id: 'loki',
      label: "LOKI'S HEAD",
      x: tileToWorldCenter(12, TILE_SIZE),
      y: tileToWorldCenter(9, TILE_SIZE),
      radius: 24,
    },
    {
      id: 'jotunn_matic',
      label: 'JOTUNN-MATIC 3000',
      x: tileToWorldCenter(6, TILE_SIZE),
      y: tileToWorldCenter(12, TILE_SIZE),
      radius: 24,
    },
    {
      id: 'skill_tree',
      label: 'YGGDRASIL SKILL TREE',
      x: tileToWorldCenter(22, TILE_SIZE),
      y: tileToWorldCenter(9, TILE_SIZE),
      radius: 26,
    },
    {
      id: 'modifiers',
      label: 'RUN MODIFIER STONE',
      x: tileToWorldCenter(12, TILE_SIZE),
      y: tileToWorldCenter(18, TILE_SIZE),
      radius: 24,
    },
    {
      id: 'weapondex',
      label: 'WEAPON DATABASE',
      x: tileToWorldCenter(22, TILE_SIZE),
      y: tileToWorldCenter(18, TILE_SIZE),
      radius: 24,
    },
    {
      id: 'enemydex',
      label: 'ENEMY DATABASE',
      x: tileToWorldCenter(26, TILE_SIZE),
      y: tileToWorldCenter(18, TILE_SIZE),
      radius: 24,
    },
    {
      id: 'training_dummy',
      label: 'TRAINING DUMMY',
      x: tileToWorldCenter(33, TILE_SIZE),
      y: tileToWorldCenter(12, TILE_SIZE),
      radius: 22,
    },
  ];

  return {
    map,
    spawnPoints: [{ x: tileToWorldCenter(33, TILE_SIZE), y: tileToWorldCenter(12, TILE_SIZE) }],
    chestPoints: [],
    ammoPoints: [],
    hubInteractables,
  };
}

function generateBossArena(rng: RngCarrier, node: BiomeNodeDef): GeneratedWorld {
  const width = 42;
  const height = 28;
  const map = createEmptyTileMap(width, height, node.biomeId, TileKind.Floor, TILE_SIZE);

  // Chamfer outer arena corners with destructible rock
  for (let dy = 1; dy <= 3; dy++) {
    for (let dx = 1; dx <= 3; dx++) {
      if (dx + dy <= 4) {
        setTileAt(map, dx, dy, TileKind.WallDestructible, 90);
        setTileAt(map, width - 1 - dx, dy, TileKind.WallDestructible, 90);
        setTileAt(map, dx, height - 1 - dy, TileKind.WallDestructible, 90);
        setTileAt(map, width - 1 - dx, height - 1 - dy, TileKind.WallDestructible, 90);
      }
    }
  }

  // Symmetric destructible cover pillars bosses can smash during charges
  const pillarCoords: Array<[number, number]> = [
    [10, 9], [width - 12, 9],
    [10, height - 11], [width - 12, height - 11],
    [Math.floor(width / 2) - 5, Math.floor(height / 2) - 1],
    [Math.floor(width / 2) + 4, Math.floor(height / 2) - 1],
  ];
  for (const [px, py] of pillarCoords) {
    setTileAt(map, px, py, TileKind.WallDestructible, 75);
    setTileAt(map, px + 1, py, TileKind.WallDestructible, 75);
    setTileAt(map, px, py + 1, TileKind.CoverCrate, 35);
    setTileAt(map, px + 1, py + 1, TileKind.CoverCrate, 35);
  }

  // Optional lava / water accent pools on arena flanks
  if (node.palette.hasLavaLake || node.palette.hasWaterDistort) {
    const hazard = node.palette.hasLavaLake ? TileKind.Lava : TileKind.PitOrWater;
    for (let y = 12; y <= 15; y++) {
      setTileAt(map, 4, y, hazard);
      setTileAt(map, width - 5, y, hazard);
    }
  }

  // Scatter a few destructible crates
  for (let i = 0; i < 6; i++) {
    const cx = nextInt(rng, 7, width - 8);
    const cy = nextInt(rng, 7, height - 8);
    if (Math.abs(cx - width / 2) > 4) {
      setTileAt(map, cx, cy, TileKind.CoverCrate, 30);
    }
  }

  // Guaranteed perimeter ammo supply crate positions (outside tick-1 spawn magnet radius)
  const bossAmmoTiles: Array<[number, number]> = [
    [6, Math.floor(height / 2)],
    [width - 7, Math.floor(height / 2)],
    [Math.floor(width / 2) - 8, height - 5],
  ];
  for (const [ax, ay] of bossAmmoTiles) {
    setTileAt(map, ax, ay, TileKind.Floor);
  }

  map.spawnX = tileToWorldCenter(Math.floor(width / 2), TILE_SIZE);
  map.spawnY = tileToWorldCenter(height - 5, TILE_SIZE);
  map.exitX = tileToWorldCenter(Math.floor(width / 2), TILE_SIZE);
  map.exitY = tileToWorldCenter(4, TILE_SIZE);
  map.exitUnlocked = false;

  ensureMapConnectivity(map);
  return {
    map,
    spawnPoints: [{ x: map.exitX, y: tileToWorldCenter(9, TILE_SIZE) }],
    chestPoints: [],
    ammoPoints: bossAmmoTiles.map(([ax, ay]) => ({
      x: tileToWorldCenter(ax, TILE_SIZE),
      y: tileToWorldCenter(ay, TILE_SIZE),
    })),
    hubInteractables: [],
  };
}

function generateSanctuaryRoom(node: BiomeNodeDef): GeneratedWorld {
  const width = 28;
  const height = 20;
  const map = createEmptyTileMap(width, height, node.biomeId, TileKind.Floor, TILE_SIZE);

  // Decorative destructible crates in corners
  const corners: Array<[number, number]> = [
    [4, 4], [5, 4], [width - 5, 4], [width - 6, 4],
    [4, height - 5], [width - 5, height - 5],
  ];
  for (const [cx, cy] of corners) {
    setTileAt(map, cx, cy, TileKind.CoverCrate, 30);
  }

  map.spawnX = tileToWorldCenter(5, TILE_SIZE);
  map.spawnY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
  map.exitX = tileToWorldCenter(width - 5, TILE_SIZE);
  map.exitY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
  map.exitUnlocked = node.nodeType === 'shop' || node.nodeType === 'campfire';

  ensureMapConnectivity(map);

  const midX = tileToWorldCenter(Math.floor(width / 2), TILE_SIZE);
  const midY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);

  const chestPoints =
    node.nodeType === 'stash'
      ? [
          { x: midX - 44, y: midY - 28 },
          { x: midX, y: midY - 28 },
          { x: midX + 44, y: midY - 28 },
        ]
      : [];

  const spawnPoints =
    node.nodeType === 'stash'
      ? [
          { x: midX - 36, y: midY + 40 },
          { x: midX + 36, y: midY + 40 },
        ]
      : [];

  return {
    map,
    spawnPoints,
    chestPoints,
    ammoPoints: [],
    hubInteractables: [],
  };
}

function generateTrainingRoom(node: BiomeNodeDef): GeneratedWorld {
  const width = 36;
  const height = 22;
  const map = createEmptyTileMap(width, height, node.biomeId, TileKind.Floor, TILE_SIZE);

  // Firing range lanes with destructible barriers & cover crates
  for (let laneY = 6; laneY <= 16; laneY += 5) {
    setTileAt(map, 14, laneY, TileKind.WallDestructible, 60);
    setTileAt(map, 14, laneY + 1, TileKind.CoverCrate, 30);
    setTileAt(map, 22, laneY, TileKind.CoverCrate, 30);
  }

  map.spawnX = tileToWorldCenter(4, TILE_SIZE);
  map.spawnY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
  map.exitX = tileToWorldCenter(width - 4, TILE_SIZE);
  map.exitY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
  map.exitUnlocked = false;

  ensureMapConnectivity(map);

  const spawnPoints = [
    { x: tileToWorldCenter(18, TILE_SIZE), y: tileToWorldCenter(6, TILE_SIZE) },
    { x: tileToWorldCenter(25, TILE_SIZE), y: tileToWorldCenter(11, TILE_SIZE) },
    { x: tileToWorldCenter(18, TILE_SIZE), y: tileToWorldCenter(16, TILE_SIZE) },
    { x: tileToWorldCenter(28, TILE_SIZE), y: tileToWorldCenter(7, TILE_SIZE) },
    { x: tileToWorldCenter(28, TILE_SIZE), y: tileToWorldCenter(15, TILE_SIZE) },
  ];

  return {
    map,
    spawnPoints,
    chestPoints: [{ x: tileToWorldCenter(26, TILE_SIZE), y: tileToWorldCenter(11, TILE_SIZE) }],
    ammoPoints: [],
    hubInteractables: [],
  };
}

function generateCombatDungeon(rng: RngCarrier, node: BiomeNodeDef): GeneratedWorld {
  const isArena = node.nodeType === 'arena';
  const rc = Math.max(1, Math.min(4, node.roomCount || 2));
  const width = isArena ? 38 : 30 + rc * 7;
  const height = isArena ? 26 : 20 + rc * 4;

  // Start filled with destructible stone walls so combat feels richly carved & breachable
  const map = createEmptyTileMap(
    width,
    height,
    node.biomeId,
    isArena ? TileKind.Floor : TileKind.WallDestructible,
    TILE_SIZE,
  );

  const rooms: RoomRect[] = [];

  if (isArena) {
    // Open coliseum with radial destructible cover rings
    for (let i = 0; i < 4; i++) {
      const rx = i % 2 === 0 ? 9 : width - 12;
      const ry = i < 2 ? 7 : height - 10;
      setTileAt(map, rx, ry, TileKind.WallDestructible, 70);
      setTileAt(map, rx + 1, ry, TileKind.WallDestructible, 70);
      setTileAt(map, rx, ry + 1, TileKind.CoverCrate, 35);
      setTileAt(map, rx + 1, ry + 1, TileKind.CoverCrate, 35);
    }
    map.spawnX = tileToWorldCenter(5, TILE_SIZE);
    map.spawnY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
    map.exitX = tileToWorldCenter(width - 5, TILE_SIZE);
    map.exitY = tileToWorldCenter(Math.floor(height / 2), TILE_SIZE);
  } else {
    const targetRooms = Math.max(4, rc * 2 + 2);
    for (let i = 0; i < targetRooms; i++) {
      const rw = nextInt(rng, 7, 12);
      const rh = nextInt(rng, 6, 9);
      const rx = nextInt(rng, 2, Math.max(2, width - rw - 3));
      const ry = nextInt(rng, 2, Math.max(2, height - rh - 3));
      carveRect(map, rx, ry, rw, rh);
      rooms.push({
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
      });
    }

    // Sort rooms west-to-east so spawn -> exit spans the full dungeon naturally
    rooms.sort((a, b) => a.cx - b.cx);
    for (let i = 1; i < rooms.length; i++) {
      carveCorridor(map, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy, 1);
      // Extra loop corridor for fun flanking routes
      if (i >= 2 && chance(rng, 0.45)) {
        carveCorridor(map, rooms[i - 2].cx, rooms[i - 2].cy, rooms[i].cx, rooms[i].cy, 1);
      }
    }

    const startRoom = rooms[0];
    const endRoom = rooms[rooms.length - 1];
    map.spawnX = tileToWorldCenter(startRoom.cx, TILE_SIZE);
    map.spawnY = tileToWorldCenter(startRoom.cy, TILE_SIZE);
    map.exitX = tileToWorldCenter(endRoom.cx, TILE_SIZE);
    map.exitY = tileToWorldCenter(endRoom.cy, TILE_SIZE);

    // Scatter interior destructible cover pillars & crates proportional to destructibleRatio
    const coverChance = Math.max(0.04, Math.min(0.18, node.destructibleRatio * 0.28));
    for (let i = 0; i < rooms.length; i++) {
      const rm = rooms[i];
      for (let ty = rm.y + 1; ty < rm.y + rm.h - 1; ty++) {
        for (let tx = rm.x + 1; tx < rm.x + rm.w - 1; tx++) {
          const distSpawn = Math.hypot(tx - startRoom.cx, ty - startRoom.cy);
          const distExit = Math.hypot(tx - endRoom.cx, ty - endRoom.cy);
          if (distSpawn < 3.5 || distExit < 3.5) continue;
          if (chance(rng, coverChance)) {
            const isCrate = chance(rng, 0.55);
            setTileAt(
              map,
              tx,
              ty,
              isCrate ? TileKind.CoverCrate : TileKind.WallDestructible,
              isCrate ? 35 : 70,
            );
          }
        }
      }
    }

    // Biome hazards (Lava pools / Water pits) placed sparingly away from spawn & exit
    if (node.palette.hasLavaLake || node.palette.hasWaterDistort) {
      const hazard = node.palette.hasLavaLake ? TileKind.Lava : TileKind.PitOrWater;
      const poolCount = nextInt(rng, 1, 3);
      for (let p = 0; p < poolCount; p++) {
        const rm = rooms[nextInt(rng, 0, rooms.length - 1)];
        const px = nextInt(rng, rm.x + 1, Math.max(rm.x + 1, rm.x + rm.w - 3));
        const py = nextInt(rng, rm.y + 1, Math.max(rm.y + 1, rm.y + rm.h - 3));
        if (Math.hypot(px - startRoom.cx, py - startRoom.cy) < 4) continue;
        if (Math.hypot(px - endRoom.cx, py - endRoom.cy) < 4) continue;
        setTileAt(map, px, py, hazard);
        setTileAt(map, px + 1, py, hazard);
      }
    }
  }

  enforceOuterBedrock(map);
  ensureMapConnectivity(map);

  // Collect verified BFS-reachable spawn & chest points
  const reachable = computeReachableMask(map);
  const reachableTiles: Array<{ tx: number; ty: number }> = [];
  const spawnTx = worldToTile(map.spawnX, TILE_SIZE);
  const spawnTy = worldToTile(map.spawnY, TILE_SIZE);
  const exitTx = worldToTile(map.exitX, TILE_SIZE);
  const exitTy = worldToTile(map.exitY, TILE_SIZE);

  for (let ty = 2; ty < height - 2; ty++) {
    for (let tx = 2; tx < width - 2; tx++) {
      const idx = ty * width + tx;
      if (!reachable[idx] || !isWalkableTile(map.tiles[idx] as TileKind)) continue;
      if (Math.hypot(tx - spawnTx, ty - spawnTy) < 7) continue;
      reachableTiles.push({ tx, ty });
    }
  }

  const spawnPoints: Array<{ x: number; y: number }> = [];
  const chestPoints: Array<{ x: number; y: number }> = [];
  const ammoPoints: Array<{ x: number; y: number }> = [];

  if (isArena) {
    // 3 guaranteed perimeter ammo supply pickups for Combat Arenas
    const arenaAmmoTiles: Array<[number, number]> = [
      [Math.floor(width / 2), 4],
      [Math.floor(width / 2), height - 5],
      [width - 9, 8],
    ];
    for (const [ax, ay] of arenaAmmoTiles) {
      setTileAt(map, ax, ay, TileKind.Floor);
      ammoPoints.push({
        x: tileToWorldCenter(ax, TILE_SIZE),
        y: tileToWorldCenter(ay, TILE_SIZE),
      });
    }
  }

  if (reachableTiles.length > 0) {
    const desiredSpawns = Math.min(24, Math.max(6, Math.floor(reachableTiles.length / 10)));
    for (let i = 0; i < desiredSpawns; i++) {
      const chosen = reachableTiles[nextInt(rng, 0, reachableTiles.length - 1)];
      spawnPoints.push({
        x: tileToWorldCenter(chosen.tx, TILE_SIZE),
        y: tileToWorldCenter(chosen.ty, TILE_SIZE),
      });
    }

    // Place 1-2 treasure chests at reachable tiles away from spawn/exit
    const chestCount = isArena ? 1 : 2;
    for (let c = 0; c < chestCount; c++) {
      const chosen = reachableTiles[nextInt(rng, 0, reachableTiles.length - 1)];
      if (Math.hypot(chosen.tx - exitTx, chosen.ty - exitTy) > 2) {
        chestPoints.push({
          x: tileToWorldCenter(chosen.tx, TILE_SIZE),
          y: tileToWorldCenter(chosen.ty, TILE_SIZE),
        });
      }
    }

    // Place 2-3 guaranteed BFS-reachable ammo supply pickups in non-arena combat dungeons
    if (!isArena) {
      const ammoCount = rc >= 3 ? 3 : 2;
      for (let a = 0; a < ammoCount; a++) {
        const chosen = reachableTiles[nextInt(rng, 0, reachableTiles.length - 1)];
        ammoPoints.push({
          x: tileToWorldCenter(chosen.tx, TILE_SIZE),
          y: tileToWorldCenter(chosen.ty, TILE_SIZE),
        });
      }
    }
  }

  if (spawnPoints.length === 0) {
    spawnPoints.push({ x: map.exitX, y: map.exitY });
  }

  return {
    map,
    spawnPoints,
    chestPoints,
    ammoPoints,
    hubInteractables: [],
  };
}

/**
 * Generates the tilemap, verified spawn points, chest spots, and Hub landmarks
 * for any Overworld `BiomeNodeDef`.
 */
export function generateNodeMap(rng: RngCarrier, node: BiomeNodeDef): GeneratedWorld {
  switch (node.nodeType) {
    case 'hub':
      return generateHubLayout();
    case 'boss':
      return generateBossArena(rng, node);
    case 'shop':
    case 'campfire':
    case 'stash':
      return generateSanctuaryRoom(node);
    case 'training':
      return generateTrainingRoom(node);
    case 'combat':
    case 'arena':
    case 'infinite':
    case 'shrine':
      return generateCombatDungeon(rng, node);
  }
}

/**
 * Generates deterministic Weapon Shop offers scaled to current Act & Loop.
 */
export function generateShopOffers(state: SimState): ShopOffer[] {
  const wep1Id = pickRandomWeaponForNode(state);
  let wep2Id = pickRandomWeaponForNode(state);
  if (wep2Id === wep1Id) {
    wep2Id = pickRandomWeaponForNode(state);
  }
  const modId = pickRandomModForNode(state);

  const w1 = getWeaponDef(wep1Id);
  const w2 = getWeaponDef(wep2Id);
  const mod = getModDef(modId);

  const activeWeapon = state.player.weapons[state.player.activeSlot];
  const activeDef = activeWeapon ? getWeaponDef(activeWeapon.uniqueId) : w1;
  const goldenPrice = Math.max(180, (activeDef.goldenCost || 4) * 55);

  return [
    {
      id: `shop_wep_${w1.uniqueId}`,
      kind: 'weapon',
      name: w1.name,
      price: Math.max(80, w1.price),
      weaponUniqueId: w1.uniqueId,
      purchased: false,
    },
    {
      id: `shop_wep_${w2.uniqueId}_2`,
      kind: 'weapon',
      name: w2.name,
      price: Math.max(80, w2.price),
      weaponUniqueId: w2.uniqueId,
      purchased: false,
    },
    {
      id: `shop_mod_${mod.id}`,
      kind: 'mod',
      name: mod.name,
      price: Math.max(100, mod.price),
      modId: mod.id,
      purchased: false,
    },
    {
      id: 'shop_heal',
      kind: 'heal',
      name: 'FULL MEDKIT REPAIR',
      price: 60 + state.act * 20,
      purchased: false,
    },
    {
      id: 'shop_ammo',
      kind: 'ammo',
      name: 'FULL AMMO CRATE',
      price: 50 + state.act * 15,
      purchased: false,
    },
    {
      id: 'shop_golden',
      kind: 'golden_upgrade',
      name: `GOLDEN UPGRADE (${activeDef.name})`,
      price: goldenPrice,
      purchased: Boolean(activeWeapon?.golden),
    },
  ];
}
