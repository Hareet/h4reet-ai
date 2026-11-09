// Strict JSON for a GLB's JSON chunk (spec 004 FR-015; contracts/plain-model-fit.md §4, RX2): a port of the arrival
// check's `strict_json` (tools/gates/arrival_check.py, carried by the Author's patch on feat/003-us1-arrival-check;
// read, never applied), which decodes UTF-8 strictly and parses with Python's json, refusing a duplicate key, NaN, and
// Infinity. JavaScript's JSON.parse keeps the last of two equal keys and can't tell 3 from 3.0, so this reads it itself:
// - UTF-8 as Python's strict codec reads it: no overlong form, surrogate, or code point past U+10FFFF; a byte-order
//   mark is kept, so it fails as Python's json fails on one;
// - RFC 8259's grammar as Python's json reads it, with no NaN, Infinity, or -Infinity, and no number past a double's
//   range (Python reads 1e400 as inf; this refuses it with the rest);
// - every object a null-prototype object, so a key such as __proto__ or constructor is a plain key;
// - a number written with a fraction or an exponent remembered, so the schema's integers are Python's ints
//   (`isIntegerAt`);
// - nesting at most MAX_DEPTH deep, where Python's recursion limit stops near 1000.
// Pure: no Node, DOM, or three.js.

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export type JsonFault = "utf8" | "bom" | "syntax" | "duplicate" | "non-finite" | "depth";
export type JsonRead =
  { readonly ok: true; readonly value: Json } | { readonly ok: false; readonly fault: JsonFault; readonly at: number };

export const MAX_DEPTH = 512;

/** For each object or array the reader made, the keys whose number was written with a fraction or an exponent. */
const FRACTIONAL = new WeakMap<object, Set<string>>();

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `container[key]` is a number written as an integer, with no fraction or exponent: Python's int. */
export function isIntegerAt(container: JsonObject | readonly Json[], key: string | number): boolean {
  const value: unknown = (container as Record<string, unknown>)[String(key)];
  return typeof value === "number" && Number.isInteger(value) && !FRACTIONAL.get(container)?.has(String(key));
}

/** UTF-8 decoded as Python's strict codec decodes it, or null. A byte-order mark is kept. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  let text = "";
  const units: number[] = [];
  const flush = (): void => {
    text += String.fromCharCode(...units);
    units.length = 0;
  };
  for (let i = 0; i < bytes.length;) {
    const lead = bytes[i] ?? 0;
    let point: number;
    let need: number;
    let low = 0x80;
    let high = 0xbf;
    if (lead < 0x80) {
      point = lead;
      need = 0;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      point = lead & 0x1f;
      need = 1;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      point = lead & 0x0f;
      need = 2;
      if (lead === 0xe0) low = 0xa0;
      if (lead === 0xed) high = 0x9f;
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      point = lead & 0x07;
      need = 3;
      if (lead === 0xf0) low = 0x90;
      if (lead === 0xf4) high = 0x8f;
    } else {
      return null;
    }
    for (let k = 1; k <= need; k++) {
      const next = bytes[i + k];
      if (next === undefined || next < low || next > high) return null;
      point = (point << 6) | (next & 0x3f);
      low = 0x80;
      high = 0xbf;
    }
    i += need + 1;
    if (point > 0xffff) units.push(0xd800 + ((point - 0x10000) >> 10), 0xdc00 + ((point - 0x10000) & 0x3ff));
    else units.push(point);
    if (units.length >= 8192) flush();
  }
  flush();
  return text;
}

class Fault {
  constructor(
    readonly fault: JsonFault,
    readonly at: number,
  ) {}
}

const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;

class Reader {
  private i = 0;
  /** Whether the value just read was a number written with a fraction or an exponent. */
  private fractional = false;

  constructor(private readonly s: string) {}

  read(): Json {
    this.space();
    const value = this.value(0);
    this.space();
    if (this.i !== this.s.length) throw new Fault("syntax", this.i);
    return value;
  }

  private code(): number {
    return this.s.charCodeAt(this.i);
  }

  private space(): void {
    for (;;) {
      const c = this.code();
      if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return;
      this.i++;
    }
  }

  private value(depth: number): Json {
    this.fractional = false;
    const c = this.code();
    if (c === 0x7b) return this.object(depth + 1);
    if (c === 0x5b) return this.array(depth + 1);
    if (c === 0x22) return this.string();
    if (c === 0x2d || isDigit(c)) return this.number();
    for (const [word, value] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.s.startsWith(word, this.i)) {
        this.i += word.length;
        return value;
      }
    }
    if (this.s.startsWith("NaN", this.i) || this.s.startsWith("Infinity", this.i))
      throw new Fault("non-finite", this.i);
    throw new Fault("syntax", this.i);
  }

  private object(depth: number): JsonObject {
    if (depth > MAX_DEPTH) throw new Fault("depth", this.i);
    const out = Object.create(null) as JsonObject;
    const seen = new Set<string>();
    let fractional: Set<string> | null = null;
    this.i++;
    this.space();
    if (this.code() === 0x7d) {
      this.i++;
      return out;
    }
    for (;;) {
      this.space();
      if (this.code() !== 0x22) throw new Fault("syntax", this.i);
      const at = this.i;
      const key = this.string();
      if (seen.has(key)) throw new Fault("duplicate", at);
      seen.add(key);
      this.space();
      if (this.code() !== 0x3a) throw new Fault("syntax", this.i);
      this.i++;
      this.space();
      const value = this.value(depth);
      if (this.fractional) (fractional ??= new Set()).add(key);
      out[key] = value;
      this.space();
      const c = this.code();
      this.i++;
      if (c === 0x7d) break;
      if (c !== 0x2c) throw new Fault("syntax", this.i - 1);
    }
    if (fractional !== null) FRACTIONAL.set(out, fractional);
    this.fractional = false;
    return out;
  }

  private array(depth: number): Json[] {
    if (depth > MAX_DEPTH) throw new Fault("depth", this.i);
    const out: Json[] = [];
    let fractional: Set<string> | null = null;
    this.i++;
    this.space();
    if (this.code() === 0x5d) {
      this.i++;
      return out;
    }
    for (;;) {
      this.space();
      const value = this.value(depth);
      if (this.fractional) (fractional ??= new Set()).add(String(out.length));
      out.push(value);
      this.space();
      const c = this.code();
      this.i++;
      if (c === 0x5d) break;
      if (c !== 0x2c) throw new Fault("syntax", this.i - 1);
    }
    if (fractional !== null) FRACTIONAL.set(out, fractional);
    this.fractional = false;
    return out;
  }

  private string(): string {
    this.i++;
    let out = "";
    let run = this.i;
    for (;;) {
      const c = this.code();
      if (Number.isNaN(c) || c < 0x20) throw new Fault("syntax", this.i);
      if (c === 0x22) {
        out += this.s.slice(run, this.i);
        this.i++;
        return out;
      }
      if (c !== 0x5c) {
        this.i++;
        continue;
      }
      out += this.s.slice(run, this.i);
      const escape = this.s.charCodeAt(this.i + 1);
      const simple = ESCAPES.get(escape);
      if (simple !== undefined) {
        out += simple;
        this.i += 2;
      } else if (escape === 0x75) {
        const hex = this.s.slice(this.i + 2, this.i + 6);
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) throw new Fault("syntax", this.i);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        this.i += 6;
      } else {
        throw new Fault("syntax", this.i);
      }
      run = this.i;
    }
  }

  private number(): number {
    const start = this.i;
    if (this.code() === 0x2d) {
      this.i++;
      if (this.s.startsWith("Infinity", this.i)) throw new Fault("non-finite", start);
    }
    if (this.code() === 0x30) this.i++;
    else if (isDigit(this.code())) while (isDigit(this.code())) this.i++;
    else throw new Fault("syntax", this.i);
    let fractional = false;
    if (this.code() === 0x2e) {
      this.i++;
      if (!isDigit(this.code())) throw new Fault("syntax", this.i);
      while (isDigit(this.code())) this.i++;
      fractional = true;
    }
    if (this.code() === 0x65 || this.code() === 0x45) {
      this.i++;
      if (this.code() === 0x2b || this.code() === 0x2d) this.i++;
      if (!isDigit(this.code())) throw new Fault("syntax", this.i);
      while (isDigit(this.code())) this.i++;
      fractional = true;
    }
    const value = Number(this.s.slice(start, this.i));
    if (!Number.isFinite(value)) throw new Fault("non-finite", start);
    this.fractional = fractional;
    return value;
  }
}

/** The one-character escapes after a backslash, by the character's code: quote, backslash, slash, b, f, n, r, t. */
const ESCAPES = new Map<number, string>([
  [0x22, '"'],
  [0x5c, "\\"],
  [0x2f, "/"],
  [0x62, "\b"],
  [0x66, "\f"],
  [0x6e, "\n"],
  [0x72, "\r"],
  [0x74, "\t"],
]);

/** JSON text, read strictly. `at` is the character the reader stopped at. */
export function parseJson(text: string): JsonRead {
  try {
    return { ok: true, value: new Reader(text).read() };
  } catch (error) {
    if (error instanceof Fault) return { ok: false, fault: error.fault, at: error.at };
    throw error;
  }
}

/** `strict_json`, ported: UTF-8 bytes holding one JSON value, read strictly. */
export function strictJson(bytes: Uint8Array): JsonRead {
  const text = decodeUtf8(bytes);
  if (text === null) return { ok: false, fault: "utf8", at: 0 };
  if (text.charCodeAt(0) === 0xfeff) return { ok: false, fault: "bom", at: 0 };
  return parseJson(text);
}
