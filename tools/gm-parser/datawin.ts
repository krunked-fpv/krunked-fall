// ============================================================================
// KRUNKEDFALL — GameMaker Studio 2 `data.win` Chunk Parser
// ============================================================================

import type { SpriteFrameMeta } from '../../src/contracts/index';
import { parseFormChunks, readCString, readPointerList } from './iff';

export interface Gen8Info {
  bytecodeVersion: number;
  gameName: string;
  displayName: string;
  defaultWindowWidth: number;
  defaultWindowHeight: number;
  simHz: number;
  fileSize: number;
}

export interface TxtrEntry {
  index: number;
  width: number;
  height: number;
  dataOffset: number;
  dataEnd: number;
}

export interface TpagEntry extends SpriteFrameMeta {
  offset: number;
}

export interface SprtEntry {
  id: number;
  name: string;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  originX: number;
  originY: number;
  frames: SpriteFrameMeta[];
}

export interface SondEntry {
  id: number;
  name: string;
  flags: number;
  file: string;
  volume: number;
  pitch: number;
  audioId: number;
}

export interface AudoEntry {
  id: number;
  offset: number;
  length: number;
}

export interface DataWinSummary {
  gen8: Gen8Info;
  txtr: TxtrEntry[];
  tpagCount: number;
  sprites: SprtEntry[];
  sounds: SondEntry[];
  audo: AudoEntry[];
  shdrCount: number;
  fontCount: number;
  chunkSizes: Record<string, number>;
}

/**
 * Parses a GameMaker Studio 2 `data.win` binary buffer and extracts metadata
 * for GEN8, TXTR, TPAG, SPRT, SOND, AUDO, SHDR, and FONT chunks.
 */
export function parseDataWin(buffer: Buffer): DataWinSummary {
  const chunks = parseFormChunks(buffer);
  const chunkSizes: Record<string, number> = {};
  for (const [name, chunk] of chunks.entries()) {
    chunkSizes[name] = chunk.length;
  }

  const requireChunk = (name: string) => {
    const chunk = chunks.get(name);
    if (!chunk) {
      throw new Error(`Missing required data.win chunk: ${name}`);
    }
    return chunk;
  };

  // --- GEN8 ---
  const gen8Chunk = requireChunk('GEN8');
  const gOff = gen8Chunk.offset;
  const bytecodeVersion = buffer.readUInt8(gOff + 1);
  const gameName = readCString(buffer, buffer.readUInt32LE(gOff + 40));
  const displayName = readCString(buffer, buffer.readUInt32LE(gOff + 100));
  const defaultWindowWidth = buffer.readUInt32LE(gOff + 60);
  const defaultWindowHeight = buffer.readUInt32LE(gOff + 64);
  let simHz = 60;
  if (gen8Chunk.length >= 244) {
    const rawFps = buffer.readFloatLE(gOff + 240);
    if (Number.isFinite(rawFps) && rawFps > 0 && rawFps <= 240) {
      simHz = Math.round(rawFps);
    }
  }
  const gen8: Gen8Info = {
    bytecodeVersion,
    gameName,
    displayName,
    defaultWindowWidth,
    defaultWindowHeight,
    simHz,
    fileSize: buffer.length,
  };

  // --- TXTR ---
  const txtrChunk = requireChunk('TXTR');
  const txtrPtrs = readPointerList(buffer, txtrChunk.offset);
  const rawTxtr = txtrPtrs.map((ptr, index) => ({
    index,
    width: buffer.readUInt32LE(ptr + 12),
    height: buffer.readUInt32LE(ptr + 16),
    dataOffset: buffer.readUInt32LE(ptr + 24),
  }));
  // Compute exclusive dataEnd bounds by sorting dataOffsets ascending
  const sortedByOffset = [...rawTxtr].sort((a, b) => a.dataOffset - b.dataOffset);
  const endByIndex = new Map<number, number>();
  for (let i = 0; i < sortedByOffset.length; i++) {
    const cur = sortedByOffset[i];
    const nextOffset = i + 1 < sortedByOffset.length ? sortedByOffset[i + 1].dataOffset : txtrChunk.end;
    endByIndex.set(cur.index, nextOffset);
  }
  const txtr: TxtrEntry[] = rawTxtr.map((entry) => ({
    ...entry,
    dataEnd: endByIndex.get(entry.index) ?? txtrChunk.end,
  }));

  // --- TPAG ---
  const tpagChunk = requireChunk('TPAG');
  const tpagPtrs = readPointerList(buffer, tpagChunk.offset);
  const tpagMap = new Map<number, TpagEntry>();
  for (const ptr of tpagPtrs) {
    tpagMap.set(ptr, {
      offset: ptr,
      srcX: buffer.readUInt16LE(ptr + 0),
      srcY: buffer.readUInt16LE(ptr + 2),
      srcW: buffer.readUInt16LE(ptr + 4),
      srcH: buffer.readUInt16LE(ptr + 6),
      tgtX: buffer.readUInt16LE(ptr + 8),
      tgtY: buffer.readUInt16LE(ptr + 10),
      tgtW: buffer.readUInt16LE(ptr + 12),
      tgtH: buffer.readUInt16LE(ptr + 14),
      boundW: buffer.readUInt16LE(ptr + 16),
      boundH: buffer.readUInt16LE(ptr + 18),
      page: buffer.readUInt16LE(ptr + 20),
    });
  }

  // --- SPRT ---
  const sprtChunk = requireChunk('SPRT');
  const sprtPtrs = readPointerList(buffer, sprtChunk.offset);
  const sprites: SprtEntry[] = new Array<SprtEntry>(sprtPtrs.length);
  for (let id = 0; id < sprtPtrs.length; id++) {
    const ptr = sprtPtrs[id];
    const name = readCString(buffer, buffer.readUInt32LE(ptr + 0));
    const width = buffer.readUInt32LE(ptr + 4);
    const height = buffer.readUInt32LE(ptr + 8);
    const bboxLeft = buffer.readInt32LE(ptr + 12);
    const bboxRight = buffer.readInt32LE(ptr + 16);
    const bboxBottom = buffer.readInt32LE(ptr + 20);
    const bboxTop = buffer.readInt32LE(ptr + 24);
    const originX = buffer.readInt32LE(ptr + 48);
    const originY = buffer.readInt32LE(ptr + 52);

    // GMS2 sprite format has -1 marker at +56, version at +60, type at +64,
    // playback metadata at +68..+80, and TPAG count at +84 followed by pointers at +88.
    const specialMarker = buffer.readInt32LE(ptr + 56);
    const tpagListStart = specialMarker === -1 ? ptr + 84 : ptr + 56;
    const frameCount = buffer.readUInt32LE(tpagListStart);
    const frames: SpriteFrameMeta[] = [];
    for (let f = 0; f < frameCount; f++) {
      const tpagPtr = buffer.readUInt32LE(tpagListStart + 4 + f * 4);
      const tpag = tpagMap.get(tpagPtr);
      if (tpag) {
        frames.push({
          page: tpag.page,
          srcX: tpag.srcX,
          srcY: tpag.srcY,
          srcW: tpag.srcW,
          srcH: tpag.srcH,
          tgtX: tpag.tgtX,
          tgtY: tpag.tgtY,
          tgtW: tpag.tgtW,
          tgtH: tpag.tgtH,
          boundW: tpag.boundW,
          boundH: tpag.boundH,
        });
      }
    }

    sprites[id] = {
      id,
      name,
      width,
      height,
      bbox: [bboxLeft, bboxRight, bboxBottom, bboxTop],
      originX,
      originY,
      frames,
    };
  }

  // --- SOND ---
  const sondChunk = requireChunk('SOND');
  const sondPtrs = readPointerList(buffer, sondChunk.offset);
  const sounds: SondEntry[] = new Array<SondEntry>(sondPtrs.length);
  for (let id = 0; id < sondPtrs.length; id++) {
    const ptr = sondPtrs[id];
    const name = readCString(buffer, buffer.readUInt32LE(ptr + 0));
    const flags = buffer.readUInt32LE(ptr + 4);
    const file = readCString(buffer, buffer.readUInt32LE(ptr + 12));
    const volume = buffer.readFloatLE(ptr + 20);
    const rawPitch = buffer.readFloatLE(ptr + 24);
    // In GMS2 SOND entries, pitch 0 means default unity pitch (1.0).
    const pitch = rawPitch > 0 && Number.isFinite(rawPitch) ? rawPitch : 1.0;
    const audioId = buffer.readInt32LE(ptr + 32);
    sounds[id] = { id, name, flags, file, volume, pitch, audioId };
  }

  // --- AUDO ---
  const audoChunk = requireChunk('AUDO');
  const audoPtrs = readPointerList(buffer, audoChunk.offset);
  const audo: AudoEntry[] = new Array<AudoEntry>(audoPtrs.length);
  for (let id = 0; id < audoPtrs.length; id++) {
    const ptr = audoPtrs[id];
    const length = buffer.readUInt32LE(ptr);
    audo[id] = { id, offset: ptr + 4, length };
  }

  // --- SHDR & FONT counts ---
  const shdrChunk = chunks.get('SHDR');
  const shdrCount = shdrChunk ? buffer.readUInt32LE(shdrChunk.offset) : 0;
  const fontChunk = chunks.get('FONT');
  const fontCount = fontChunk ? buffer.readUInt32LE(fontChunk.offset) : 0;

  return {
    gen8,
    txtr,
    tpagCount: tpagPtrs.length,
    sprites,
    sounds,
    audo,
    shdrCount,
    fontCount,
    chunkSizes,
  };
}

/**
 * Returns a zero-copy view of a TXTR page's compressed/encoded image payload.
 */
export function sliceTxtrPayload(buffer: Buffer, entry: TxtrEntry): Buffer {
  return buffer.subarray(entry.dataOffset, entry.dataEnd);
}

/**
 * Returns a zero-copy view of an AUDO embedded RIFF WAV buffer.
 */
export function sliceAudoPayload(buffer: Buffer, entry: AudoEntry): Buffer {
  return buffer.subarray(entry.offset, entry.offset + entry.length);
}
