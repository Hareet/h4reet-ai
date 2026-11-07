// Image headers for the fit check (spec 004 FR-015, FR-022, FR-053; contracts/plain-model-fit.md §4, §5's RX9, §7):
// PNG's IHDR, JPEG's start-of-frame marker with its precision and component count, and WebP's VP8, VP8L, or VP8X with
// its animation flag, found the way the arrival check's parse_png, parse_jpeg, and parse_webp find them
// (tools/gates/arrival_check.py, carried by the Author's patch on feat/003-us1-arrival-check; read, never applied),
// which stays the authority on what else an image may hold. The same reader measures an embedded texture and an image
// card. Pure: no Node, DOM, or three.js, and never a pixel decoded.

export type ImageFormat = "png" | "jpeg" | "webp";

export type ImageHeader =
  | {
      readonly format: "png";
      readonly width: number;
      readonly height: number;
      readonly bitDepth: number;
      readonly colorType: number;
    }
  | {
      readonly format: "jpeg";
      readonly width: number;
      readonly height: number;
      /** The start-of-frame marker: 0xC0 baseline, 0xC1 extended, 0xC2 progressive, and the rest. */
      readonly sof: number;
      readonly precision: number;
      readonly components: number;
    }
  | { readonly format: "webp"; readonly width: number; readonly height: number; readonly animated: boolean };

/** The format the leading bytes name, and the header, or null where it can't be read. */
export interface ImageRead {
  readonly format: ImageFormat | null;
  readonly header: ImageHeader | null;
}

const u16be = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number): number => ((u16be(b, at) << 16) >>> 0) + u16be(b, at + 2);
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number => u16le(b, at) | ((b[at + 2] ?? 0) << 16);
const u32le = (b: Uint8Array, at: number): number => u24le(b, at) + (b[at + 3] ?? 0) * 0x1000000;
const fourcc = (b: Uint8Array, at: number): string => String.fromCharCode(...b.subarray(at, at + 4));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The format from the leading bytes, as each format's signature gives it (the arrival check's `sniff`). */
export function sniff(b: Uint8Array): ImageFormat | null {
  if (PNG_SIGNATURE.every((byte, i) => b[i] === byte)) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WEBP") return "webp";
  return null;
}

export function readImage(b: Uint8Array): ImageRead {
  const format = sniff(b);
  if (format === "png") return { format, header: png(b) };
  if (format === "jpeg") return { format, header: jpeg(b) };
  if (format === "webp") return { format, header: webp(b) };
  return { format: null, header: null };
}

let CRC_TABLE: Uint32Array | null = null;

/** CRC-32 as PNG computes it over a chunk's type and data. */
function crc32(b: Uint8Array): number {
  if (CRC_TABLE === null) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of b) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** IHDR, which PNG puts first: 13 bytes of width, height, bit depth, colour type, then three methods, and its CRC. */
function png(b: Uint8Array): ImageHeader | null {
  if (b.length < 8 + 8 + 13 + 4 || u32be(b, 8) !== 13 || fourcc(b, 12) !== "IHDR") return null;
  if (crc32(b.subarray(12, 29)) !== u32be(b, 29)) return null;
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20), bitDepth: b[24] ?? 0, colorType: b[25] ?? 0 };
}

/** The start-of-frame markers, every coding process's. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** The first start-of-frame segment, walked to as parse_jpeg walks: marker segments, each FF xx (fill bytes aside) and
 *  a big-endian length that counts itself, up to the first scan or the end. */
function jpeg(b: Uint8Array): ImageHeader | null {
  let pos = 2;
  while (pos < b.length) {
    if (b[pos] !== 0xff) return null;
    while (b[pos] === 0xff) pos++;
    if (pos >= b.length) return null;
    const marker = b[pos] ?? 0;
    pos++;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (pos + 2 > b.length) return null;
    const length = u16be(b, pos);
    if (length < 2 || pos + length > b.length) return null;
    if (SOF.has(marker)) {
      if (length < 8) return null;
      return {
        format: "jpeg",
        sof: marker,
        precision: b[pos + 2] ?? 0,
        height: u16be(b, pos + 3),
        width: u16be(b, pos + 5),
        components: b[pos + 7] ?? 0,
      };
    }
    pos += length;
  }
  return null;
}

/** The RIFF chunks, as parse_webp reads them: VP8X's canvas and flags where it's there, else the first bitstream's
 *  size; ANIM or ANMF, or VP8X's animation flag, make it animated. */
function webp(b: Uint8Array): ImageHeader | null {
  const end = Math.min(b.length, 8 + u32le(b, 4));
  let width = 0;
  let height = 0;
  let animated = false;
  let found = false;
  let canvas = false;
  for (let pos = 12; pos + 8 <= end;) {
    const kind = fourcc(b, pos);
    const length = u32le(b, pos + 4);
    const body = pos + 8;
    if (body + length > end) break;
    if (kind === "VP8X" && length >= 10) {
      if ((b[body] ?? 0) & 0x02) animated = true;
      width = 1 + u24le(b, body + 4);
      height = 1 + u24le(b, body + 7);
      found = canvas = true;
    } else if (kind === "ANIM" || kind === "ANMF") {
      animated = true;
    } else if (kind === "VP8L" && length >= 5 && !canvas && !found) {
      if (b[body] !== 0x2f) return null;
      const bits = u32le(b, body + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      found = true;
    } else if (kind === "VP8 " && length >= 10 && !canvas && !found) {
      if (b[body + 3] !== 0x9d || b[body + 4] !== 0x01 || b[body + 5] !== 0x2a) return null;
      width = u16le(b, body + 6) & 0x3fff;
      height = u16le(b, body + 8) & 0x3fff;
      found = true;
    }
    pos = body + length + (length & 1);
  }
  return found ? { format: "webp", width, height, animated } : null;
}
