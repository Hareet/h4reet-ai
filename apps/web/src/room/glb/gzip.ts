// The gzip-9 copy and its length (spec 004 FR-079, FR-010, SC-006; Amendment C11; research.md R-26;
// contracts/plain-model-fit.md §7, room-bundle.md §3.4): pako 2.1.0, a port of stock zlib 1.2.8, at level 9, with the
// header's MTIME 0 and OS 255 and no file name. The compositor writes the copy as `dist/a/<stem>.<hash16>.glb.gz` and
// counts its length; the lookdev page measures a candidate the same way; fit.ts reports the length it is given. Node's
// own zlib isn't used: it is Chromium's fork, whose lengths can differ from those of the stock zlib behind Python's
// `gzip.compress(data, 9, mtime=0)`, spec 003's measure for F2 and F3. The parity test (test/room/gzip.test.ts, with
// scripts/assets/test_gzip_parity.py) holds pako's lengths to Python's. Pure: no Node or DOM API.
import { gzip } from "pako";

/** The copy the site serves for a GLB: its bytes gzipped at level 9, MTIME 0, OS 255. The file stays plain (FR-079). */
export function gzip9(bytes: Uint8Array): Uint8Array {
  // pako writes to the options it is given, so each call gets its own.
  return gzip(bytes, { level: 9, header: { time: 0, os: 255 } });
}

/** §7's gzip-9 bytes: the copy's length, which fit.ts takes as `gzipBytes`, and the caps, the report, and the bundle's
 *  `bytes` count. */
export function gzipBytes(bytes: Uint8Array): number {
  return gzip9(bytes).length;
}
