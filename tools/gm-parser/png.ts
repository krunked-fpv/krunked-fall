// ============================================================================
// KRUNKEDFALL — Zero-Dependency RGBA-to-PNG Encoder (Node zlib.deflateSync)
// ============================================================================

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Precompute IEEE 802.3 CRC32 lookup table once.
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(chunks: readonly Buffer[]): number {
  let c = 0xffffffff;
  for (const buf of chunks) {
    for (let i = 0; i < buf.length; i++) {
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32([typeBuf, data]), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes a tightly-packed RGBA8 buffer (`width * height * 4` bytes) into a
 * valid standard PNG Buffer using Node's built-in `zlib.deflateSync`.
 */
export function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
  compressionLevel = 1,
): Buffer {
  const expectedBytes = width * height * 4;
  if (rgba.length !== expectedBytes) {
    throw new Error(
      `PNG encode size mismatch: expected ${expectedBytes} bytes for ${width}x${height}, got ${rgba.length}`,
    );
  }

  // IHDR: width(4), height(4), bitDepth(1)=8, colorType(1)=6(RGBA), comp(1)=0, filter(1)=0, interlace(1)=0
  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  // Build scanlines with filter byte 0 (None) per row.
  const stride = width * 4;
  const raw = Buffer.allocUnsafe(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const dstOff = y * (stride + 1);
    const srcOff = y * stride;
    raw[dstOff] = 0;
    raw.set(rgba.subarray(srcOff, srcOff + stride), dstOff + 1);
  }

  const compressed = zlib.deflateSync(raw, { level: compressionLevel });

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}
