// T064 (spec 004; FR-079, SC-006; Amendment C11; research.md R-26; contracts/plain-model-fit.md §7, §12): the gzip
// parity. test/fixtures/gzip-parity.json holds cases cut from a seeded xorshift32 stream, which this file and
// scripts/assets/test_gzip_parity.py generate identically (the fixture's `about` gives the recipe), each with its bytes'
// CRC-32 and the length Python's gzip.compress(data, 9, mtime=0) gives them, the arrival check's measure for its F2 and
// F3. Through glb/gzip.ts, pako's copy of each case carries the header 1f 8b 08 00, MTIME 0, XFL 2, and OS 255, a
// trailer holding the case's CRC-32 and length, and Python's length, so the bytes the site serves are the bytes the caps
// count. A case that fails names itself.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { fit } from "../../src/room/glb/fit";
import { gzip9, gzipBytes } from "../../src/room/glb/gzip";
import { DESK_INPUT, desk } from "../helpers/glb";

type Bounds = readonly [number, number];

/** One case: the recipe for its bytes, their CRC-32, and their expected gzip-9 length. */
interface ParityCase {
  readonly name: string;
  readonly seed: number;
  readonly bytes: number;
  /** Each random run's length. */
  readonly random: Bounds;
  /** Each pattern run's length. */
  readonly pattern: Bounds;
  /** Each pattern's length. */
  readonly period: Bounds;
  /** How many patterns; 0 for random runs alone. */
  readonly pool: number;
  readonly crc32: number;
  readonly gzip9: number;
}

const CASES = (
  JSON.parse(readFileSync(new URL("../fixtures/gzip-parity.json", import.meta.url), "utf8")) as {
    cases: ParityCase[];
  }
).cases;

/** RFC 1952's header as §7 has it: the magic, deflate, no flag (so no file name), MTIME 0, XFL 2 (level 9), OS 255. */
const HEADER = [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 2, 255];

/** Marsaglia's xorshift32 (13, 17, 5), stepped as scripts/assets/test_gzip_parity.py steps it. */
class Xorshift32 {
  private x: number;

  constructor(seed: number) {
    this.x = seed >>> 0;
  }

  next(): number {
    let x = this.x;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.x = x >>> 0;
    return this.x;
  }

  /** lo + (the next value mod (hi − lo + 1)). */
  draw([lo, hi]: Bounds): number {
    return lo + (this.next() % (hi - lo + 1));
  }

  /** n bytes: the next ⌈n / 4⌉ values, each little-endian, the last cut short. */
  randomBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 4) {
      const word = this.next();
      for (let k = 0; k < 4 && i + k < n; k++) out[i + k] = (word >>> (8 * k)) & 0xff;
    }
    return out;
  }
}

/** A case's bytes: its pool of patterns, then rounds of a random run and, with a pool, a pattern's run. */
function caseBytes(c: ParityCase): Uint8Array {
  if (c.random[1] === 0 && (c.pool === 0 || c.pattern[1] === 0)) throw new Error(`${c.name}: its rounds add no bytes`);
  const s = new Xorshift32(c.seed);
  const patterns = Array.from({ length: c.pool }, () => s.randomBytes(s.draw(c.period)));
  const out = new Uint8Array(c.bytes);
  let at = 0;
  const put = (run: Uint8Array): void => {
    if (at < out.length) out.set(run.subarray(0, out.length - at), at);
    at += run.length;
  };
  while (at < out.length) {
    put(s.randomBytes(s.draw(c.random)));
    if (c.pool === 0) continue;
    const pattern = patterns[s.draw([0, c.pool - 1])];
    if (pattern === undefined || pattern.length === 0) throw new Error(`${c.name}: a pattern is empty`);
    const run = new Uint8Array(s.draw(c.pattern));
    for (let i = 0; i < run.length; i += pattern.length) run.set(pattern.subarray(0, run.length - i), i);
    put(run);
  }
  return out;
}

const u32le = (b: Uint8Array, at: number): number =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16) | ((b[at + 3] ?? 0) << 24)) >>> 0;

const byName = (name: string): ParityCase => {
  const c = CASES.find((each) => each.name === name);
  if (c === undefined) throw new Error(`the fixture has no case ${name}`);
  return c;
};

describe("the gzip-9 parity (glb/gzip.ts; contracts/plain-model-fit.md §7)", () => {
  it("holds cases from 0 bytes to past the room's 2,500,000-byte cap, each named once", () => {
    const sizes = CASES.map((c) => c.bytes);
    expect(Math.min(...sizes)).toBe(0);
    expect(Math.max(...sizes)).toBeGreaterThan(2_500_000);
    expect(new Set(CASES.map((c) => c.name)).size).toBe(CASES.length);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s", (name, c) => {
    const data = caseBytes(c);
    const copy = gzip9(data);
    expect([...copy.subarray(0, 10)], `${name}: the header`).toEqual(HEADER);
    const trailer = [u32le(copy, copy.length - 8), u32le(copy, copy.length - 4)];
    expect(trailer, `${name}: the trailer's CRC-32 and length, so these are the fixture's bytes`).toEqual([
      c.crc32,
      c.bytes,
    ]);
    expect(copy.length, `${name}: pako's gzip-9 length beside Python's`).toBe(c.gzip9);
    expect(Buffer.compare(gunzipSync(copy), data), `${name}: the copy inflates to the case's bytes`).toBe(0);
  });
});

describe("the measure fit is given (glb/gzip.ts)", () => {
  it("is the length of the copy, the fit check's gzipBytes", () => {
    const model = desk().bytes;
    const measures = fit(model, DESK_INPUT, { file: "candidate", gzipBytes: gzipBytes(model) }).measures;
    expect(measures.gzipBytes).toBe(gzip9(model).length);
    expect(measures.bytes).toBe(model.length);
    expect(gzipBytes(caseBytes(byName("text-like-300000")))).toBe(byName("text-like-300000").gzip9);
  });

  it("compresses only the bytes a view shows, and leaves them as they were", () => {
    const data = caseBytes(byName("random-1000"));
    const padded = new Uint8Array(data.length + 16).fill(7);
    padded.set(data, 8);
    const view = padded.subarray(8, 8 + data.length);
    expect(gzip9(view)).toEqual(gzip9(data));
    expect(Buffer.compare(view, data)).toBe(0);
  });
});
