// ============================================================================
// KRUNKEDFALL — GameMaker Studio 2 IFF ("FORM") Binary Reader
// ============================================================================

export interface IffChunk {
  name: string;
  /** Byte offset of the chunk payload (immediately after the 8-byte header). */
  offset: number;
  /** Byte length of the chunk payload. */
  length: number;
  /** Exclusive end byte offset (`offset + length`). */
  end: number;
}

/**
 * Parses a top-level GameMaker Studio 2 `FORM` IFF container and returns all
 * top-level chunks indexed by their 4-byte ASCII FourCC tag.
 */
export function parseFormChunks(buffer: Buffer): Map<string, IffChunk> {
  if (buffer.length < 8) {
    throw new Error(`Invalid data.win: buffer too small (${buffer.length} bytes)`);
  }
  const magic = buffer.toString('ascii', 0, 4);
  if (magic !== 'FORM') {
    throw new Error(`Invalid data.win: expected FORM magic, got "${magic}"`);
  }
  const formLength = buffer.readUInt32LE(4);
  const formEnd = Math.min(buffer.length, 8 + formLength);

  const chunks = new Map<string, IffChunk>();
  let pos = 8;
  while (pos + 8 <= formEnd) {
    const name = buffer.toString('ascii', pos, pos + 4);
    const length = buffer.readUInt32LE(pos + 4);
    const offset = pos + 8;
    const end = offset + length;
    if (end > buffer.length) {
      throw new Error(
        `Truncated IFF chunk "${name}": ends at ${end} > buffer length ${buffer.length}`,
      );
    }
    chunks.set(name, { name, offset, length, end });
    pos = end;
  }

  return chunks;
}

/**
 * Reads a GMS2 pointer list starting at `chunkOffset`:
 * `uint32LE count` followed by `count` `uint32LE` absolute file offsets.
 */
export function readPointerList(buffer: Buffer, chunkOffset: number): number[] {
  const count = buffer.readUInt32LE(chunkOffset);
  const pointers = new Array<number>(count);
  let cursor = chunkOffset + 4;
  for (let i = 0; i < count; i++) {
    pointers[i] = buffer.readUInt32LE(cursor);
    cursor += 4;
  }
  return pointers;
}

/**
 * Reads a null-terminated UTF-8 string at an absolute file offset inside `data.win`.
 * Returns an empty string when `offset === 0` or out of bounds.
 */
export function readCString(buffer: Buffer, offset: number): string {
  if (offset <= 0 || offset >= buffer.length) {
    return '';
  }
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end++;
  }
  return buffer.toString('utf8', offset, end);
}
