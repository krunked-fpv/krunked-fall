// ============================================================================
// KRUNKEDFALL — GMS2 Texture Payload Decoder (2zoq / fioq / qoif / PNG)
// ============================================================================
// Supports:
//  1. GMS2 `2zoq`: 4B "2zoq" + uint16LE w + uint16LE h + uint32LE uncompSize +
//     BZip2 stream ("BZh...") -> GMS2 custom QOI ("fioq") or standard QOI ("qoif")
//     Uses `seek-bzip` primarily, with an integrated pure-TS BZip2 fallback
//     supporting `blockRandomised` blocks (BZ2_rNums) with full CRC32 verification.
//  2. Raw GMS2 custom QOI ("fioq")
//  3. Raw Standard QOI v1.0 ("qoif")
//  4. Raw PNG ("\x89PNG\r\n\x1a\n")

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const seekBzip = require('seek-bzip') as {
  decode: (data: Uint8Array, expectedSize?: number) => Uint8Array;
};

export interface DecodedRgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export type DecodedTexturePayload =
  | { format: 'png'; width: number; height: number; png: Buffer }
  | { format: 'rgba'; width: number; height: number; rgba: Uint8Array };

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Standard BZip2 specification randomisation table (libbz2 BZ2_rNums[512])
const BZ2_RNUMS = new Uint16Array([
  619, 720, 127, 481, 931, 816, 813, 233, 566, 247, 985, 724, 205, 454, 863, 491,
  741, 242, 949, 214, 733, 859, 335, 708, 621, 574, 73, 654, 730, 472, 419, 436,
  278, 496, 867, 210, 399, 680, 480, 51, 878, 465, 811, 169, 869, 675, 611, 697,
  867, 561, 862, 687, 507, 283, 482, 129, 807, 591, 733, 623, 150, 238, 59, 379,
  684, 877, 625, 169, 643, 105, 170, 607, 520, 932, 727, 476, 693, 425, 174, 647,
  73, 122, 335, 530, 442, 853, 695, 249, 445, 515, 909, 545, 703, 919, 874, 474,
  882, 500, 594, 612, 641, 801, 220, 162, 819, 984, 589, 513, 495, 799, 161, 604,
  958, 533, 221, 400, 386, 867, 600, 782, 382, 596, 414, 171, 516, 375, 682, 485,
  911, 276, 98, 553, 163, 354, 666, 933, 424, 341, 533, 870, 227, 730, 475, 186,
  263, 647, 537, 686, 600, 224, 469, 68, 770, 919, 190, 373, 294, 822, 808, 206,
  184, 943, 795, 384, 383, 461, 404, 758, 839, 887, 715, 67, 618, 276, 204, 918,
  873, 777, 604, 560, 951, 160, 578, 722, 79, 804, 96, 409, 713, 940, 652, 934,
  970, 447, 318, 353, 859, 672, 112, 785, 645, 863, 803, 350, 139, 93, 354, 99,
  820, 908, 609, 772, 154, 274, 580, 184, 79, 626, 630, 742, 653, 282, 762, 623,
  680, 81, 927, 626, 789, 125, 411, 521, 938, 300, 821, 78, 343, 175, 128, 250,
  170, 774, 972, 275, 999, 639, 495, 78, 352, 126, 857, 956, 358, 619, 580, 124,
  737, 594, 701, 612, 669, 112, 134, 694, 363, 992, 809, 743, 168, 974, 944, 375,
  748, 52, 600, 747, 642, 182, 862, 81, 344, 805, 988, 739, 511, 655, 814, 334,
  249, 515, 897, 955, 664, 981, 649, 113, 974, 459, 893, 228, 433, 837, 553, 268,
  926, 240, 102, 654, 459, 51, 686, 754, 806, 760, 493, 403, 415, 394, 687, 700,
  946, 670, 656, 610, 738, 392, 760, 799, 887, 653, 978, 321, 576, 617, 626, 502,
  894, 679, 243, 440, 680, 879, 194, 572, 640, 724, 926, 56, 204, 700, 707, 151,
  457, 449, 797, 195, 791, 558, 945, 679, 297, 59, 87, 824, 713, 663, 412, 693,
  342, 606, 134, 108, 571, 364, 631, 212, 174, 643, 304, 329, 343, 97, 430, 751,
  497, 314, 983, 374, 822, 928, 140, 206, 73, 263, 980, 736, 876, 478, 430, 305,
  170, 514, 364, 692, 829, 82, 855, 953, 676, 246, 369, 970, 294, 750, 807, 827,
  150, 790, 288, 923, 804, 378, 215, 828, 592, 281, 565, 555, 710, 82, 896, 831,
  547, 261, 524, 462, 293, 465, 502, 56, 661, 821, 976, 991, 658, 869, 905, 758,
  745, 193, 768, 550, 608, 933, 378, 286, 215, 979, 792, 961, 61, 688, 793, 644,
  986, 403, 106, 366, 905, 644, 372, 567, 466, 434, 645, 210, 389, 550, 919, 135,
  780, 773, 635, 389, 707, 100, 626, 958, 165, 504, 920, 176, 193, 713, 857, 265,
  203, 50, 668, 108, 645, 990, 626, 197, 510, 357, 358, 850, 858, 364, 936, 638,
]);

// BZip2 MSB-first CRC32 lookup table (polynomial 0x04C11DB7)
const BZ2_CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i << 24;
  for (let bit = 0; bit < 8; bit++) {
    c = (c & 0x80000000) !== 0 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
  }
  BZ2_CRC_TABLE[i] = c >>> 0;
}

class Bz2BitReader {
  private bytePos = 0;
  private bitBuf = 0;
  private bitCount = 0;

  constructor(private readonly data: Uint8Array) {}

  readBits(n: number): number {
    while (this.bitCount < n) {
      if (this.bytePos >= this.data.length) {
        throw new Error('Unexpected EOF while reading BZip2 bitstream');
      }
      this.bitBuf = ((this.bitBuf << 8) | this.data[this.bytePos++]) >>> 0;
      this.bitCount += 8;
    }
    this.bitCount -= n;
    const mask = n === 32 ? 0xffffffff : (1 << n) - 1;
    return (this.bitBuf >>> this.bitCount) & mask;
  }

  readU32(): number {
    const hi = this.readBits(16);
    const lo = this.readBits(16);
    return ((hi << 16) | lo) >>> 0;
  }
}

function mtfDecode(arr: Uint8Array, idx: number): number {
  const val = arr[idx];
  for (let i = idx; i > 0; i--) {
    arr[i] = arr[i - 1];
  }
  arr[0] = val;
  return val;
}

/**
 * Pure-TypeScript BZip2 stream decoder supporting `blockRandomised` blocks
 * (`BZ2_rNums`) with full per-block and stream CRC32 validation.
 */
function decodeBzip2Full(input: Uint8Array, expectedSize?: number): Uint8Array {
  if (
    input.length < 10 ||
    input[0] !== 0x42 ||
    input[1] !== 0x5a ||
    input[2] !== 0x68
  ) {
    throw new Error('Invalid BZip2 stream magic (expected "BZh")');
  }
  const level = input[3] - 0x30;
  if (level < 1 || level > 9) {
    throw new Error(`Invalid BZip2 block size level: ${level}`);
  }

  const dbufSize = level * 100000;
  const dbuf = new Uint32Array(dbufSize);
  const reader = new Bz2BitReader(input.subarray(4));

  let outBuf = new Uint8Array(expectedSize && expectedSize > 0 ? expectedSize : 65536);
  let outPos = 0;
  const writeByte = (b: number): void => {
    if (outPos >= outBuf.length) {
      const next = new Uint8Array(outBuf.length * 2);
      next.set(outBuf);
      outBuf = next;
    }
    outBuf[outPos++] = b;
  };

  let streamCrc = 0;
  const MAX_HUFCODE_BITS = 20;
  const MAX_SYMBOLS = 258;
  const GROUP_SIZE = 50;

  while (true) {
    const magicHi = reader.readBits(24);
    const magicLo = reader.readBits(24);

    // End-of-stream magic: 0x177245385090 (sqrt(pi))
    if (magicHi === 0x177245 && magicLo === 0x385090) {
      const targetStreamCrc = reader.readU32();
      if (targetStreamCrc !== streamCrc) {
        throw new Error(
          `BZip2 stream CRC mismatch: got 0x${streamCrc.toString(16)}, expected 0x${targetStreamCrc.toString(16)}`,
        );
      }
      break;
    }

    // Block magic: 0x314159265359 (pi)
    if (magicHi !== 0x314159 || magicLo !== 0x265359) {
      throw new Error(
        `Invalid BZip2 block header magic: 0x${magicHi.toString(16)}${magicLo.toString(16)}`,
      );
    }

    const targetBlockCrc = reader.readU32();
    streamCrc = (targetBlockCrc ^ (((streamCrc << 1) | (streamCrc >>> 31)) >>> 0)) >>> 0;

    const randomised = reader.readBits(1) !== 0;
    const origPointer = reader.readBits(24);
    if (origPointer > dbufSize) {
      throw new Error(`BZip2 origPointer ${origPointer} out of bounds (${dbufSize})`);
    }

    // Sparse symbol mapping table
    const tMap = reader.readBits(16);
    const symToByte = new Uint8Array(256);
    let symTotal = 0;
    for (let i = 0; i < 16; i++) {
      if ((tMap & (1 << (15 - i))) !== 0) {
        const subMap = reader.readBits(16);
        const base = i * 16;
        for (let j = 0; j < 16; j++) {
          if ((subMap & (1 << (15 - j))) !== 0) {
            symToByte[symTotal++] = base + j;
          }
        }
      }
    }

    const groupCount = reader.readBits(3);
    if (groupCount < 2 || groupCount > 6) {
      throw new Error(`Invalid BZip2 Huffman group count: ${groupCount}`);
    }

    const nSelectors = reader.readBits(15);
    if (nSelectors === 0) {
      throw new Error('Invalid BZip2 nSelectors: 0');
    }

    const mtfGroup = new Uint8Array(groupCount);
    for (let i = 0; i < groupCount; i++) mtfGroup[i] = i;
    const selectors = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i++) {
      let j = 0;
      while (reader.readBits(1) !== 0) {
        j++;
        if (j >= groupCount) throw new Error('Invalid BZip2 selector index');
      }
      selectors[i] = mtfDecode(mtfGroup, j);
    }

    const symCount = symTotal + 2;
    const groups: Array<{
      minLen: number;
      maxLen: number;
      limit: Float64Array;
      base: Int32Array;
      permute: Uint16Array;
    }> = [];

    for (let g = 0; g < groupCount; g++) {
      const lengths = new Uint8Array(symCount);
      let currLen = reader.readBits(5);
      for (let i = 0; i < symCount; i++) {
        while (true) {
          if (currLen < 1 || currLen > MAX_HUFCODE_BITS) {
            throw new Error(`Invalid BZip2 Huffman code length: ${currLen}`);
          }
          if (reader.readBits(1) === 0) break;
          currLen += reader.readBits(1) === 0 ? 1 : -1;
        }
        lengths[i] = currLen;
      }

      let minLen = lengths[0];
      let maxLen = lengths[0];
      for (let i = 1; i < symCount; i++) {
        if (lengths[i] < minLen) minLen = lengths[i];
        if (lengths[i] > maxLen) maxLen = lengths[i];
      }

      const permute = new Uint16Array(MAX_SYMBOLS);
      const limit = new Float64Array(MAX_HUFCODE_BITS + 2);
      const base = new Int32Array(MAX_HUFCODE_BITS + 1);
      const counts = new Uint16Array(MAX_HUFCODE_BITS + 1);

      let pp = 0;
      for (let len = minLen; len <= maxLen; len++) {
        for (let s = 0; s < symCount; s++) {
          if (lengths[s] === len) {
            permute[pp++] = s;
          }
        }
      }
      for (let s = 0; s < symCount; s++) {
        counts[lengths[s]]++;
      }

      pp = 0;
      let acc = 0;
      for (let len = minLen; len < maxLen; len++) {
        pp += counts[len];
        limit[len] = pp - 1;
        pp <<= 1;
        acc += counts[len];
        base[len + 1] = pp - acc;
      }
      limit[maxLen] = pp + counts[maxLen] - 1;
      limit[maxLen + 1] = Number.MAX_VALUE;
      base[minLen] = 0;

      groups.push({ minLen, maxLen, limit, base, permute });
    }

    // Decode Huffman + RLE-MTF symbols into dbuf
    const byteCount = new Uint32Array(256);
    const mtfSym = new Uint8Array(256);
    for (let i = 0; i < 256; i++) mtfSym[i] = i;

    let runPos = 0;
    let runTotal = 0;
    let dbufCount = 0;
    let selectorIdx = 0;
    let groupRem = 0;
    let curGroup = groups[0];

    while (true) {
      if (groupRem === 0) {
        groupRem = GROUP_SIZE;
        if (selectorIdx >= nSelectors) throw new Error('BZip2 selector overflow');
        curGroup = groups[selectors[selectorIdx++]];
      }
      groupRem--;

      let bits = curGroup.minLen;
      let code = reader.readBits(bits);
      while (code > curGroup.limit[bits]) {
        bits++;
        if (bits > curGroup.maxLen) throw new Error('BZip2 Huffman decode overflow');
        code = (code << 1) | reader.readBits(1);
      }

      const permIdx = code - curGroup.base[bits];
      if (permIdx < 0 || permIdx >= MAX_SYMBOLS) {
        throw new Error('BZip2 Huffman permute index out of range');
      }
      const nextSym = curGroup.permute[permIdx];

      if (nextSym === 0 || nextSym === 1) {
        if (runPos === 0) {
          runPos = 1;
          runTotal = 0;
        }
        runTotal += nextSym === 0 ? runPos : 2 * runPos;
        runPos <<= 1;
        continue;
      }

      if (runPos !== 0) {
        runPos = 0;
        if (dbufCount + runTotal > dbufSize) throw new Error('BZip2 dbuf overflow in run');
        const uc = symToByte[mtfSym[0]];
        byteCount[uc] += runTotal;
        while (runTotal-- > 0) {
          dbuf[dbufCount++] = uc;
        }
      }

      if (nextSym > symTotal) {
        break;
      }

      if (dbufCount >= dbufSize) throw new Error('BZip2 dbuf overflow');
      const uc = symToByte[mtfDecode(mtfSym, nextSym - 1)];
      byteCount[uc]++;
      dbuf[dbufCount++] = uc;
    }

    if (origPointer >= dbufCount) {
      throw new Error(`BZip2 origPointer ${origPointer} >= dbufCount ${dbufCount}`);
    }

    // Build Burrows-Wheeler inverse transform vector
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      const next = sum + byteCount[i];
      byteCount[i] = sum;
      sum = next;
    }
    for (let i = 0; i < dbufCount; i++) {
      const uc = dbuf[i] & 0xff;
      dbuf[byteCount[uc]] |= i << 8;
      byteCount[uc]++;
    }

    // Undo BWT (+ optional blockRandomised) + RLE-4 + compute block CRC32
    let blockCrc = 0xffffffff;
    let pos = dbuf[origPointer];
    let current = pos & 0xff;
    pos >>>= 8;
    let run = -1;
    let rNToGo = 0;
    let rTPos = 0;

    for (let rem = dbufCount; rem > 0; rem--) {
      const previous = current;
      pos = dbuf[pos];
      current = pos & 0xff;
      pos >>>= 8;

      if (randomised) {
        if (rNToGo === 0) {
          rNToGo = BZ2_RNUMS[rTPos];
          rTPos = (rTPos + 1) & 511;
        }
        rNToGo--;
        if (rNToGo === 1) {
          current ^= 1;
        }
      }

      let copies: number;
      let outByte: number;
      if (run++ === 3) {
        copies = current;
        outByte = previous;
        current = -1;
      } else {
        copies = 1;
        outByte = current;
      }

      for (let c = 0; c < copies; c++) {
        blockCrc = (((blockCrc << 8) >>> 0) ^ BZ2_CRC_TABLE[((blockCrc >>> 24) ^ outByte) & 0xff]) >>> 0;
        writeByte(outByte);
      }

      if (current !== previous) {
        run = 0;
      }
    }

    const finalBlockCrc = (~blockCrc) >>> 0;
    if (finalBlockCrc !== targetBlockCrc) {
      throw new Error(
        `BZip2 block CRC mismatch: got 0x${finalBlockCrc.toString(16)}, expected 0x${targetBlockCrc.toString(16)}`,
      );
    }
  }

  return outPos === outBuf.length ? outBuf : outBuf.subarray(0, outPos);
}

function decompressBzip2(bzipStream: Uint8Array, expectedSize?: number): Uint8Array {
  try {
    return seekBzip.decode(bzipStream, expectedSize);
  } catch (err) {
    const code = (err as { errorCode?: number } | null)?.errorCode;
    if (code === -7) {
      // seek-bzip throws errorCode -7 (OBSOLETE_INPUT) on BZip2 blockRandomised blocks.
      return decodeBzip2Full(bzipStream, expectedSize);
    }
    throw err;
  }
}

function isPng(buf: Buffer): boolean {
  if (buf.length < 24) return false;
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Decodes GameMaker Studio 2's custom pre-1.0 QOI format (`"fioq"`).
 */
export function decodeGmQoi(buf: Uint8Array): DecodedRgbaImage {
  if (buf.length < 12) {
    throw new Error(`Invalid GMS2 fioq payload: length ${buf.length} < 12`);
  }
  if (buf[0] !== 0x66 || buf[1] !== 0x69 || buf[2] !== 0x6f || buf[3] !== 0x71) {
    throw new Error('Invalid GMS2 fioq magic');
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint16(4, true);
  const height = view.getUint16(6, true);
  const dataLen = view.getUint32(8, true);
  const end = Math.min(buf.length, 12 + dataLen);

  const totalPixels = width * height;
  const rgba = new Uint8Array(totalPixels * 4);
  const index = new Uint8Array(64 * 4);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let run = 0;
  let p = 12;

  for (let px = 0; px < totalPixels; px++) {
    if (run > 0) {
      run--;
    } else if (p < end) {
      const b1 = buf[p++];
      if ((b1 & 0xc0) === 0x00) {
        const idx = (b1 & 0x3f) << 2;
        r = index[idx];
        g = index[idx + 1];
        b = index[idx + 2];
        a = index[idx + 3];
      } else if ((b1 & 0xe0) === 0x40) {
        run = b1 & 0x1f;
      } else if ((b1 & 0xe0) === 0x60) {
        const b2 = buf[p++];
        run = (((b1 & 0x1f) << 8) | b2) + 32;
      } else if ((b1 & 0xc0) === 0x80) {
        r = (r + (((b1 & 0x30) << 26) >> 30)) & 0xff;
        g = (g + (((b1 & 0x0c) << 28) >> 30)) & 0xff;
        b = (b + (((b1 & 0x03) << 30) >> 30)) & 0xff;
      } else if ((b1 & 0xe0) === 0xc0) {
        const b2 = buf[p++];
        r = (r + (((b1 & 0x1f) << 27) >> 27)) & 0xff;
        g = (g + (((b2 & 0xf0) << 24) >> 28)) & 0xff;
        b = (b + (((b2 & 0x0f) << 28) >> 28)) & 0xff;
      } else if ((b1 & 0xf0) === 0xe0) {
        const b2 = buf[p++];
        const b3 = buf[p++];
        const packed = ((b1 & 0x0f) << 16) | (b2 << 8) | b3;
        r = (r + ((((packed >> 15) & 0x1f) << 27) >> 27)) & 0xff;
        g = (g + ((((packed >> 10) & 0x1f) << 27) >> 27)) & 0xff;
        b = (b + ((((packed >> 5) & 0x1f) << 27) >> 27)) & 0xff;
        a = (a + (((packed & 0x1f) << 27) >> 27)) & 0xff;
      } else {
        if ((b1 & 8) !== 0) r = buf[p++];
        if ((b1 & 4) !== 0) g = buf[p++];
        if ((b1 & 2) !== 0) b = buf[p++];
        if ((b1 & 1) !== 0) a = buf[p++];
      }

      const hashIdx = ((r ^ g ^ b ^ a) & 63) << 2;
      index[hashIdx] = r;
      index[hashIdx + 1] = g;
      index[hashIdx + 2] = b;
      index[hashIdx + 3] = a;
    }

    const out = px << 2;
    rgba[out] = r;
    rgba[out + 1] = g;
    rgba[out + 2] = b;
    rgba[out + 3] = a;
  }

  return { width, height, rgba };
}

/**
 * Decodes standard QOI v1.0 (`"qoif"`) images into tightly-packed RGBA bytes.
 */
export function decodeStandardQoi(buf: Uint8Array): DecodedRgbaImage {
  if (buf.length < 22) {
    throw new Error(`Invalid standard qoif payload: length ${buf.length} < 22`);
  }
  if (buf[0] !== 0x71 || buf[1] !== 0x6f || buf[2] !== 0x69 || buf[3] !== 0x66) {
    throw new Error('Invalid standard qoif magic');
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint32(4, false);
  const height = view.getUint32(8, false);
  const end = buf.length - 8;

  const totalPixels = width * height;
  const rgba = new Uint8Array(totalPixels * 4);
  const index = new Uint8Array(64 * 4);

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let run = 0;
  let p = 14;

  for (let px = 0; px < totalPixels; px++) {
    if (run > 0) {
      run--;
    } else if (p < end) {
      const b1 = buf[p++];
      if (b1 === 0xfe) {
        r = buf[p++];
        g = buf[p++];
        b = buf[p++];
      } else if (b1 === 0xff) {
        r = buf[p++];
        g = buf[p++];
        b = buf[p++];
        a = buf[p++];
      } else if ((b1 & 0xc0) === 0x00) {
        const idx = (b1 & 0x3f) << 2;
        r = index[idx];
        g = index[idx + 1];
        b = index[idx + 2];
        a = index[idx + 3];
      } else if ((b1 & 0xc0) === 0x40) {
        r = (r + (((b1 >> 4) & 0x03) - 2)) & 0xff;
        g = (g + (((b1 >> 2) & 0x03) - 2)) & 0xff;
        b = (b + ((b1 & 0x03) - 2)) & 0xff;
      } else if ((b1 & 0xc0) === 0x80) {
        const b2 = buf[p++];
        const vg = (b1 & 0x3f) - 32;
        r = (r + vg - 8 + ((b2 >> 4) & 0x0f)) & 0xff;
        g = (g + vg) & 0xff;
        b = (b + vg - 8 + (b2 & 0x0f)) & 0xff;
      } else if ((b1 & 0xc0) === 0xc0) {
        run = b1 & 0x3f;
      }

      const hashIdx = ((r * 3 + g * 5 + b * 7 + a * 11) & 63) << 2;
      index[hashIdx] = r;
      index[hashIdx + 1] = g;
      index[hashIdx + 2] = b;
      index[hashIdx + 3] = a;
    }

    const out = px << 2;
    rgba[out] = r;
    rgba[out + 1] = g;
    rgba[out + 2] = b;
    rgba[out + 3] = a;
  }

  return { width, height, rgba };
}

/**
 * Decodes either GMS2 custom QOI (`"fioq"`) or standard QOI (`"qoif"`).
 */
export function decodeQoi(buf: Uint8Array): DecodedRgbaImage {
  if (buf.length < 12) {
    throw new Error(`QOI buffer too short: ${buf.length} bytes`);
  }
  if (buf[0] === 0x66 && buf[1] === 0x69 && buf[2] === 0x6f && buf[3] === 0x71) {
    return decodeGmQoi(buf);
  }
  if (buf[0] === 0x71 && buf[1] === 0x6f && buf[2] === 0x69 && buf[3] === 0x66) {
    return decodeStandardQoi(buf);
  }
  const tag = Buffer.from(buf.subarray(0, 4)).toString('ascii');
  throw new Error(`Unsupported QOI header magic: "${tag}"`);
}

/**
 * Decodes a raw GMS2 TXTR page payload (supports `2zoq` BZip2+QOI, raw `fioq`/`qoif`, or raw PNG).
 */
export function decodeTexturePayload(payload: Buffer): DecodedTexturePayload {
  if (isPng(payload)) {
    const width = payload.readUInt32BE(16);
    const height = payload.readUInt32BE(20);
    return { format: 'png', width, height, png: payload };
  }

  const magic = payload.toString('ascii', 0, 4);
  if (magic === '2zoq') {
    if (payload.length < 16) {
      throw new Error(`Truncated 2zoq texture header (${payload.length} bytes)`);
    }
    const expectedW = payload.readUInt16LE(4);
    const expectedH = payload.readUInt16LE(6);
    const uncompressedSize = payload.readUInt32LE(8);
    const bzipStream = payload.subarray(12);
    const decompressed = decompressBzip2(bzipStream, uncompressedSize);
    const decoded = decodeQoi(decompressed);
    if (decoded.width !== expectedW || decoded.height !== expectedH) {
      throw new Error(
        `2zoq dimension mismatch: header ${expectedW}x${expectedH} vs QOI ${decoded.width}x${decoded.height}`,
      );
    }
    return { format: 'rgba', width: decoded.width, height: decoded.height, rgba: decoded.rgba };
  }

  if (magic === 'fioq' || magic === 'qoif') {
    const decoded = decodeQoi(payload);
    return { format: 'rgba', width: decoded.width, height: decoded.height, rgba: decoded.rgba };
  }

  throw new Error(`Unknown TXTR payload format magic: "${magic}"`);
}
